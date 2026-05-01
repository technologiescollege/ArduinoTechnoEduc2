import { nls } from '@theia/core/lib/common';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
  BlocklyArduinoService,
  BlocklyArduinoUpdateCheck,
  BlocklyArduinoUpdateResult,
} from '../../common/protocol/blockly-arduino-service';
import { ArduinoMenus } from '../menu/arduino-menus';
import {
  Command,
  CommandRegistry,
  Contribution,
  MenuModelRegistry,
} from './contribution';

@injectable()
export class BlocklyArduino extends Contribution {
  @inject(BlocklyArduinoService)
  protected readonly blocklyArduinoService: BlocklyArduinoService;

  override registerCommands(registry: CommandRegistry): void {
    registry.registerCommand(BlocklyArduino.Commands.UPDATE, {
      execute: async () => {
        try {
          const check = await this.blocklyArduinoService.checkForUpdate();
          const shouldProceed = await this.confirmUpdate(check);
          if (!shouldProceed) {
            return;
          }
          const result = await this.blocklyArduinoService.updateIfNeeded();
          this.showUpdateResult(result);
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
        const indexUrl = FileUri.create(indexPath).toString();
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
            "Portable mode disabled. Create a 'portable' folder next to the executable to enable it."
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
    export const SHOW_PORTABLE_STATUS: Command = {
      id: 'arduino-blockly-arduino-show-portable-status',
    };
  }
}
