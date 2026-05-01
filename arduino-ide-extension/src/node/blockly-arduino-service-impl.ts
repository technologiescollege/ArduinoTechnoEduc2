import * as fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { injectable } from '@theia/core/shared/inversify';
import extract from 'extract-zip';
import fetch from 'node-fetch';
import semver from 'semver';
import {
  BlocklyArduinoService,
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

@injectable()
export class BlocklyArduinoServiceImpl implements BlocklyArduinoService {
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
    const indexPath = path.join(this.getInstallDir(), 'index.html');
    try {
      await fs.access(indexPath);
      return indexPath;
    } catch {
      return undefined;
    }
  }

  async updateIfNeeded(): Promise<BlocklyArduinoUpdateResult> {
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

    await fs.rm(installDir, { recursive: true, force: true });

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'blockly-arduino-'));
    try {
      const zipPath = path.join(tmpRoot, 'blockly-arduino.zip');
      const extractedRoot = path.join(tmpRoot, 'extract');
      await fs.mkdir(extractedRoot, { recursive: true });

      await this.downloadArchive(zipPath);
      await this.extractArchive(zipPath, extractedRoot);

      const extractedProjectDir = await this.resolveExtractedProjectDir(extractedRoot);
      await fs.mkdir(installDir, { recursive: true });
      await fs.cp(extractedProjectDir, installDir, { recursive: true });

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

  private async downloadArchive(destinationPath: string): Promise<void> {
    const response = await fetch(REMOTE_ARCHIVE_URL);
    if (!response.ok || !response.body) {
      throw new Error(
        `Could not download Blockly@rduino archive (${response.status} ${response.statusText}).`
      );
    }
    const destination = createWriteStream(destinationPath);
    await pipeline(response.body as unknown as NodeJS.ReadableStream, destination);
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
    return path.join(path.dirname(process.execPath), LOCAL_FOLDER_NAME);
  }
}
