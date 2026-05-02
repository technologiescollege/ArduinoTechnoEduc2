import * as fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Disposable } from '@theia/core/lib/common/disposable';
import { injectable } from '@theia/core/shared/inversify';
import extract from 'extract-zip';
import fetch from 'node-fetch';
import semver from 'semver';
import {
  BlocklyArduinoProgressPhase,
  BlocklyArduinoService,
  BlocklyArduinoServiceClient,
  BlocklyArduinoUpdateCheck,
  BlocklyArduinoUpdateResult,
  PortableModeStatus,
} from '../common/protocol/blockly-arduino-service';

const REMOTE_PACKAGE_JSON_URL =
  'https://technologiescollege.github.io/Blockly-at-rduino/package.json';
const REMOTE_ARCHIVE_URL =
  'https://codeload.github.com/technologiescollege/Blockly-at-rduino/zip/refs/heads/gh-pages';
const LOCAL_FOLDER_NAME = 'Blockly@rduino';
const PORTABLE_ROOT_ENV = 'ARDUINO_IDE_PORTABLE_ROOT';

/** Upstream ne vérifie que l’optgroup Arduino ; `?board=esp32` etc. était ignoré. */
const BLOCKLY_CORE_IDE_UNPATCHED =
  `$("#board_select optgroup[label='Arduino'] option[value='" + boardId + "']").length`;
const BLOCKLY_CORE_IDE_PATCHED =
  `$("#board_select option[value='" + boardId + "']").length`;

@injectable()
export class BlocklyArduinoServiceImpl
  implements BlocklyArduinoService, Disposable
{
  private client: BlocklyArduinoServiceClient | undefined;

  setClient(client: BlocklyArduinoServiceClient | undefined): void {
    this.client = client;
  }

  dispose(): void {
    this.client = undefined;
  }

  private notifyProgress(
    progressId: string,
    payload: {
      phase: BlocklyArduinoProgressPhase;
      downloadDone?: number;
      downloadTotal?: number;
    }
  ): void {
    this.client?.notifyBlocklyProgress({
      progressId,
      phase: payload.phase,
      downloadDone: payload.downloadDone,
      downloadTotal: payload.downloadTotal,
    });
  }

  async getPortableModeStatus(): Promise<PortableModeStatus> {
    const rootPath = process.env[PORTABLE_ROOT_ENV]?.trim();
    return rootPath
      ? { enabled: true, rootPath }
      : { enabled: false };
  }

  async checkForUpdate(): Promise<BlocklyArduinoUpdateCheck> {
    const installDir = this.getInstallDir();
    const localPackagePath = path.join(installDir, 'package.json');
    const { version: localVersion } = await this.readLocalVersion(localPackagePath);
    const remoteVersion = await this.readRemoteVersion();
    if (!localVersion) {
      return {
        localVersion,
        remoteVersion,
        needsUpdate: true,
        installDir,
        reason: 'no-local-version',
      };
    }
    if (this.isRemoteVersionNewer(localVersion, remoteVersion)) {
      return {
        localVersion,
        remoteVersion,
        needsUpdate: true,
        installDir,
        reason: 'remote-newer',
      };
    }
    return {
      localVersion,
      remoteVersion,
      needsUpdate: false,
      installDir,
      reason: 'up-to-date',
    };
  }

  async getLocalIndexPath(): Promise<string | undefined> {
    const indexPath = path.join(this.getInstallDir(), 'index_IDE.html');
    try {
      await fs.access(indexPath);
      return indexPath;
    } catch {
      return undefined;
    }
  }

  async ensureBlocklyIdeBoardUrlPatch(): Promise<void> {
    const installDir = this.getInstallDir();
    const coreIde = path.join(
      installDir,
      'core',
      'BlocklyArduino',
      'blockly@rduino_core_IDE.js'
    );
    try {
      let text = await fs.readFile(coreIde, 'utf8');
      if (!text.includes(BLOCKLY_CORE_IDE_UNPATCHED)) {
        return;
      }
      text = text.split(BLOCKLY_CORE_IDE_UNPATCHED).join(BLOCKLY_CORE_IDE_PATCHED);
      await fs.writeFile(coreIde, text, 'utf8');
    } catch {
      /* installation absente ou fichier non lisible */
    }
  }

  async updateIfNeeded(progressId: string): Promise<BlocklyArduinoUpdateResult> {
    const installDir = this.getInstallDir();
    const localPackagePath = path.join(installDir, 'package.json');
    const { version: localVersion, readError: localReadError } =
      await this.readLocalVersion(localPackagePath);
    const check = await this.checkForUpdate();
    const remoteVersion = check.remoteVersion;
    const shouldRefresh = check.needsUpdate;

    if (!shouldRefresh) {
      return {
        localVersion,
        remoteVersion,
        updated: false,
        installDir,
        outcome: 'already-up-to-date',
      };
    }

    this.notifyProgress(progressId, { phase: 'preparing' });
    await fs.rm(installDir, { recursive: true, force: true });

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'blockly-arduino-'));
    try {
      const zipPath = path.join(tmpRoot, 'blockly-arduino.zip');
      const extractedRoot = path.join(tmpRoot, 'extract');
      await fs.mkdir(extractedRoot, { recursive: true });

      await this.downloadArchive(zipPath, (loaded, total) => {
        this.notifyProgress(progressId, {
          phase: 'downloading',
          downloadDone: loaded,
          downloadTotal: total,
        });
      });
      this.notifyProgress(progressId, { phase: 'extracting' });
      await this.extractArchive(zipPath, extractedRoot);

      const extractedProjectDir = await this.resolveExtractedProjectDir(extractedRoot);
      this.notifyProgress(progressId, { phase: 'installing' });
      await fs.mkdir(installDir, { recursive: true });
      await fs.cp(extractedProjectDir, installDir, { recursive: true });
      await this.ensureBlocklyIdeBoardUrlPatch();

      return {
        localVersion,
        remoteVersion,
        updated: true,
        installDir,
        outcome: localReadError
          ? 'updated-from-missing-or-invalid'
          : 'updated-from-older-version',
      };
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  }

  private async readRemoteVersion(): Promise<string> {
    const response = await fetch(REMOTE_PACKAGE_JSON_URL);
    if (!response.ok) {
      throw new Error(
        `Could not read remote version (${response.status} ${response.statusText}).`
      );
    }
    const data = (await response.json()) as { version?: unknown };
    if (typeof data.version !== 'string' || !data.version.trim()) {
      throw new Error('Remote package.json does not contain a valid version.');
    }
    return data.version.trim();
  }

  private async readLocalVersion(packagePath: string): Promise<{
    version?: string;
    readError?: Error;
  }> {
    try {
      const raw = await fs.readFile(packagePath, 'utf8');
      const json = JSON.parse(raw) as { version?: unknown };
      if (typeof json.version !== 'string' || !json.version.trim()) {
        return {
          readError: new Error(
            "Local package.json exists but its 'version' property is invalid."
          ),
        };
      }
      return { version: json.version.trim() };
    } catch (error) {
      return { readError: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  private isRemoteVersionNewer(localVersion: string, remoteVersion: string): boolean {
    const local = semver.coerce(localVersion);
    const remote = semver.coerce(remoteVersion);
    if (local && remote) {
      return semver.gt(remote, local);
    }
    return localVersion !== remoteVersion;
  }

  private async downloadArchive(
    destinationPath: string,
    onProgress: (loaded: number, total: number) => void
  ): Promise<void> {
    const response = await fetch(REMOTE_ARCHIVE_URL);
    if (!response.ok || !response.body) {
      throw new Error(
        `Could not download Blockly@rduino archive (${response.status} ${response.statusText}).`
      );
    }
    const rawTotal = response.headers.get('content-length');
    const total = rawTotal ? parseInt(rawTotal, 10) : 0;
    const file = createWriteStream(destinationPath);
    let loaded = 0;
    let lastReportAt = 0;
      const maybeReport = (force: boolean) => {
      const now = Date.now();
      if (
        !force &&
        now - lastReportAt < 250 &&
        (total <= 0 || loaded < total)
      ) {
        return;
      }
      lastReportAt = now;
      const knownTotal = Number.isFinite(total) && total > 0 ? total : 0;
      onProgress(loaded, knownTotal);
    };
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        loaded += chunk.length;
        maybeReport(false);
        callback(null, chunk);
      },
      flush(callback) {
        maybeReport(true);
        callback();
      },
    });
    await pipeline(
      response.body as NodeJS.ReadableStream,
      counter,
      file
    );
  }

  private async resolveExtractedProjectDir(extractedRoot: string): Promise<string> {
    const entries = await fs.readdir(extractedRoot, { withFileTypes: true });
    const firstDirectory = entries.find((entry) => entry.isDirectory());
    if (!firstDirectory) {
      throw new Error('Downloaded content could not be extracted correctly.');
    }
    return path.join(extractedRoot, firstDirectory.name);
  }

  private async extractArchive(
    archivePath: string,
    destinationDir: string
  ): Promise<void> {
    try {
      await extract(archivePath, { dir: destinationDir });
    } catch {
      throw new Error('Could not extract Blockly@rduino archive.');
    }
  }

  private getInstallDir(): string {
    const portableRoot = process.env[PORTABLE_ROOT_ENV]?.trim();
    if (portableRoot) {
      return path.join(portableRoot, LOCAL_FOLDER_NAME);
    }
    return path.join(path.dirname(process.execPath), LOCAL_FOLDER_NAME);
  }
}
