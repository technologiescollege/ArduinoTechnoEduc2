import { nls } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import type { ProgressUpdate } from '@theia/core/lib/common/message-service-protocol';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { MaybePromise } from '@theia/core/lib/common/types';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Sketch } from '../../common/protocol/sketches-service';
import {
  BlocklyArduinoProgress,
  BlocklyArduinoService,
  BlocklyArduinoServiceClient,
  BlocklyArduinoUpdateCheck,
  BlocklyArduinoUpdateResult,
} from '../../common/protocol/blockly-arduino-service';
import { ExecuteWithProgress } from '../../common/protocol/progressible';
import { ArduinoMenus } from '../menu/arduino-menus';
import {
  CurrentSketch,
  SketchesServiceClientImpl,
} from '../sketches-service-client-impl';
import {
  Command,
  CommandRegistry,
  Contribution,
  MenuModelRegistry,
} from './contribution';

/**
 * Builds a `file://` URL that Electron/Chromium accepts on Windows.
 * Theia's file URI string can become `file:///d%3A%5C...`, which `loadURL` rejects (ERR_FAILED).
 */
function blocklyLocalPathToFileUrl(fsPath: string): string {
  const normalized = fsPath.replace(/\\/g, '/');
  const win = /^([a-zA-Z]):(\/.*)?$/.exec(normalized);
  if (win) {
    const drive = win[1];
    const rest = win[2] ?? '/';
    const segments = rest
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment));
    return `file:///${drive}:/${segments.join('/')}`;
  }
  if (normalized.startsWith('/')) {
    const segments = normalized
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment));
    return `file:///${segments.join('/')}`;
  }
  throw new Error(`Unsupported absolute path for file URL: ${fsPath}`);
}

@injectable()
export class BlocklyArduino
  extends Contribution
  implements BlocklyArduinoServiceClient
{
  @inject(BlocklyArduinoService)
  protected readonly blocklyArduinoService: BlocklyArduinoService;

  @inject(EditorManager)
  protected readonly editorManager: EditorManager;

  @inject(SketchesServiceClientImpl)
  protected readonly sketchServiceClient: SketchesServiceClientImpl;

  private blocklyProgress?: {
    progressId: string;
    report: (update: ProgressUpdate) => void;
  };

  override onStart(_app: FrontendApplication): MaybePromise<void> {
    this.blocklyArduinoService.setClient(this);
  }

  notifyBlocklyProgress(progress: BlocklyArduinoProgress): void {
    if (this.blocklyProgress?.progressId !== progress.progressId) {
      return;
    }
    const { phase, downloadDone = 0, downloadTotal = 0 } = progress;
    let message = '';
    let work: ProgressUpdate['work'] | undefined;
    switch (phase) {
      case 'preparing':
        message = nls.localize(
          'arduino/blocklyArduino/progressPreparing',
          'Preparing update…'
        );
        work = { done: 3, total: 100 };
        break;
      case 'downloading':
        if (downloadTotal > 0) {
          const ratio = Math.min(1, downloadDone / downloadTotal);
          const percent = Math.round(ratio * 100);
          message = nls.localize(
            'arduino/blocklyArduino/progressDownloading',
            'Downloading Blockly@rduino… {0}%',
            String(percent)
          );
          work = { done: 5 + Math.round(ratio * 60), total: 100 };
        } else {
          message = nls.localize(
            'arduino/blocklyArduino/progressDownloadingUnknown',
            'Downloading Blockly@rduino…'
          );
          work = { done: Number.NaN, total: Number.NaN };
        }
        break;
      case 'extracting':
        message = nls.localize(
          'arduino/blocklyArduino/progressExtracting',
          'Extracting archive…'
        );
        work = { done: 72, total: 100 };
        break;
      case 'installing':
        message = nls.localize(
          'arduino/blocklyArduino/progressInstalling',
          'Installing files…'
        );
        work = { done: 88, total: 100 };
        break;
      default:
        break;
    }
    this.blocklyProgress.report({ message, work });
  }

  override registerCommands(registry: CommandRegistry): void {
    registry.registerCommand(BlocklyArduino.Commands.UPDATE, {
      execute: async () => {
        try {
          const check = await this.blocklyArduinoService.checkForUpdate();
          const shouldProceed = await this.confirmUpdate(check);
          if (!shouldProceed) {
            return;
          }
          const progressTitle = nls.localize(
            'arduino/blocklyArduino/progressTitle',
            'Updating Blockly@rduino…'
          );
          await ExecuteWithProgress.withProgress(
            progressTitle,
            this.messageService,
            async (progress) => {
              this.blocklyProgress = {
                progressId: progress.id,
                report: progress.report.bind(progress),
              };
              try {
                const result = await this.blocklyArduinoService.updateIfNeeded(
                  progress.id
                );
                this.showUpdateResult(result);
              } finally {
                this.blocklyProgress = undefined;
              }
            }
          );
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Unknown error.';
          this.messageService.error(
            nls.localize(
              'arduino/blocklyArduino/updateFailed',
              'Blockly@rduino update failed: {0}',
              reason
            )
          );
        }
      },
    });
    registry.registerCommand(BlocklyArduino.Commands.OPEN_LOCAL, {
      execute: async () => {
        const indexPath = await this.blocklyArduinoService.getLocalIndexPath();
        if (!indexPath) {
          this.messageService.warn(
            nls.localize(
              'arduino/blocklyArduino/openMissing',
              'Local Blockly@rduino interface was not found. Run update first.'
            )
          );
          return;
        }
        const indexUrl = blocklyLocalPathToFileUrl(indexPath);
        if (!window.electronArduino) {
          this.messageService.error(
            nls.localize(
              'arduino/blocklyArduino/electronOnly',
              'This action is only available in the Electron application.'
            )
          );
          return;
        }
        window.electronArduino.showPlotterWindow({
          url: indexUrl,
          forceReload: true,
        });
      },
    });
    registry.registerCommand(BlocklyArduino.Commands.PASTE_PREVIEW_INTO_SKETCH, {
      execute: async () => {
        if (!window.electronArduino?.getBlocklyPreviewArduino) {
          this.messageService.error(
            nls.localize(
              'arduino/blocklyArduino/electronOnly',
              'This action is only available in the Electron application.'
            )
          );
          return;
        }
        const raw = await window.electronArduino.getBlocklyPreviewArduino();
        const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
        if (!text.trim()) {
          this.messageService.warn(
            nls.localize(
              'arduino/blocklyArduino/previewEmpty',
              'No code found in Blockly@rduino preview (#pre_previewArduino). Open Blockly and generate code first.'
            )
          );
          return;
        }
        const sketch = await this.sketchServiceClient.currentSketch();
        if (!CurrentSketch.isValid(sketch)) {
          this.messageService.warn(
            nls.localize(
              'arduino/blocklyArduino/noSketchForPaste',
              'Open a sketch first, then paste the Blockly preview into the editor.'
            )
          );
          return;
        }
        let codeEditor: monaco.editor.IStandaloneCodeEditor | undefined;
        const editor = this.editorManager.currentEditor?.editor;
        if (editor instanceof MonacoEditor) {
          if (Sketch.isInSketch(editor.uri, sketch)) {
            codeEditor = editor.getControl();
          }
        }
        if (!codeEditor) {
          const widget = await this.editorManager.open(new URI(sketch.mainFileUri));
          if (widget.editor instanceof MonacoEditor) {
            codeEditor = widget.editor.getControl();
          }
        }
        if (!codeEditor) {
          this.messageService.warn(
            nls.localize(
              'arduino/blocklyArduino/noEditorForPaste',
              'Could not open the sketch editor.'
            )
          );
          return;
        }
        const model = codeEditor.getModel();
        const selection = codeEditor.getSelection();
        if (!model || !selection) {
          return;
        }
        model.pushStackElement();
        codeEditor.executeEdits('blockly-preview', [
          { range: selection, text, forceMoveMarkers: true },
        ]);
        model.pushStackElement();
        codeEditor.focus();
        this.messageService.info(
          nls.localize(
            'arduino/blocklyArduino/previewPasted',
            'Blockly preview code was inserted into the editor.'
          )
        );
      },
    });
    registry.registerCommand(BlocklyArduino.Commands.SHOW_PORTABLE_STATUS, {
      execute: async () => {
        const status = await this.blocklyArduinoService.getPortableModeStatus();
        if (status.enabled) {
          this.messageService.info(
            nls.localize(
              'arduino/blocklyArduino/portableEnabled',
              'Portable mode enabled. Path: {0}',
              status.rootPath || ''
            )
          );
          return;
        }
        this.messageService.info(
          nls.localize(
            'arduino/blocklyArduino/portableDisabled',
            'No portable root detected (unusual). Check ARDUINO_IDE_PORTABLE_ROOT.'
          )
        );
      },
    });
  }

  override registerMenus(registry: MenuModelRegistry): void {
    registry.registerSubmenu(
      ArduinoMenus.TOOLS__BLOCKLY_SUBMENU,
      nls.localize('arduino/blocklyArduino/menu', 'Blockly@rduino'),
      {
        order: '0',
      }
    );
    registry.registerMenuAction(ArduinoMenus.TOOLS__BLOCKLY_MAIN_GROUP, {
      commandId: BlocklyArduino.Commands.UPDATE.id,
      label: nls.localize(
        'arduino/blocklyArduino/update',
        'Update Blockly@rduino'
      ),
      order: '0',
    });
    registry.registerMenuAction(ArduinoMenus.TOOLS__BLOCKLY_MAIN_GROUP, {
      commandId: BlocklyArduino.Commands.OPEN_LOCAL.id,
      label: nls.localize(
        'arduino/blocklyArduino/openLocal',
        'Open Blockly@rduino'
      ),
      order: '1',
    });
    registry.registerMenuAction(ArduinoMenus.TOOLS__BLOCKLY_MAIN_GROUP, {
      commandId: BlocklyArduino.Commands.PASTE_PREVIEW_INTO_SKETCH.id,
      label: nls.localize(
        'arduino/blocklyArduino/pastePreviewIntoSketch',
        'Insert Blockly preview into editor'
      ),
      order: '2',
    });
    registry.registerMenuAction(ArduinoMenus.HELP__MAIN_GROUP, {
      commandId: BlocklyArduino.Commands.SHOW_PORTABLE_STATUS.id,
      label: nls.localize(
        'arduino/blocklyArduino/showPortableStatus',
        'Show Portable Mode Status'
      ),
      order: '99',
    });
  }

  protected showUpdateResult(result: BlocklyArduinoUpdateResult): void {
    if (result.updated) {
      const message =
        result.outcome === 'updated-from-missing-or-invalid'
          ? nls.localize(
              'arduino/blocklyArduino/updatedFromMissingOrInvalid',
              'Blockly@rduino was installed from a missing or invalid local version to {0} in: {1}',
              result.remoteVersion,
              result.installDir
            )
          : nls.localize(
              'arduino/blocklyArduino/updatedFromOlderVersion',
              'Blockly@rduino was updated ({0} -> {1}) in: {2}',
              result.localVersion || 'absent',
              result.remoteVersion,
              result.installDir
            );
      this.messageService.info(
        message
      );
      return;
    }

    this.messageService.info(
      nls.localize(
        'arduino/blocklyArduino/upToDate',
        'Blockly@rduino is already up to date ({0}) in: {1}',
        result.remoteVersion,
        result.installDir
      )
    );
  }

  protected async confirmUpdate(check: BlocklyArduinoUpdateCheck): Promise<boolean> {
    if (!check.needsUpdate) {
      this.messageService.info(
        nls.localize(
          'arduino/blocklyArduino/noUpdateNeeded',
          'Blockly@rduino is already up to date ({0}).',
          check.remoteVersion
        )
      );
      return false;
    }
    const yes = nls.localize('arduino/blocklyArduino/confirmYes', 'Yes');
    const no = nls.localize('arduino/blocklyArduino/confirmNo', 'No');
    const message =
      check.reason === 'no-local-version'
        ? nls.localize(
            'arduino/blocklyArduino/noLocalVersion',
            'No local Blockly@rduino version was found. Do you want to run the update?'
          )
        : nls.localize(
            'arduino/blocklyArduino/newVersionFound',
            'New version found ({0} -> {1}). Do you want to run the update?',
            check.localVersion || 'absent',
            check.remoteVersion
          );
    const action = await this.messageService.info(message, yes, no);
    return action === yes;
  }
}

export namespace BlocklyArduino {
  export namespace Commands {
    export const UPDATE: Command = {
      id: 'arduino-blockly-arduino-update',
    };
    export const OPEN_LOCAL: Command = {
      id: 'arduino-blockly-arduino-open-local',
    };
    export const PASTE_PREVIEW_INTO_SKETCH: Command = {
      id: 'arduino-blockly-arduino-paste-preview',
    };
    export const SHOW_PORTABLE_STATUS: Command = {
      id: 'arduino-blockly-arduino-show-portable-status',
    };
  }
}
