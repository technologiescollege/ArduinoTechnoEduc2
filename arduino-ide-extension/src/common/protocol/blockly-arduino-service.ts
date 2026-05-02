import type { JsonRpcServer } from '@theia/core/lib/common/messaging/proxy-factory';

export const BlocklyArduinoServicePath = '/services/blockly-arduino-service';
export const BlocklyArduinoService = Symbol('BlocklyArduinoService');

export type BlocklyArduinoProgressPhase =
  | 'preparing'
  | 'downloading'
  | 'extracting'
  | 'installing';

export interface BlocklyArduinoProgress {
  readonly progressId: string;
  readonly phase: BlocklyArduinoProgressPhase;
  readonly downloadDone?: number;
  readonly downloadTotal?: number;
}

export interface BlocklyArduinoServiceClient {
  notifyBlocklyProgress(progress: BlocklyArduinoProgress): void;
}

export interface BlocklyArduinoUpdateResult {
  localVersion?: string;
  remoteVersion: string;
  updated: boolean;
  installDir: string;
  outcome: 'updated-from-missing-or-invalid' | 'updated-from-older-version' | 'already-up-to-date';
}

export interface BlocklyArduinoUpdateCheck {
  localVersion?: string;
  remoteVersion: string;
  needsUpdate: boolean;
  installDir: string;
  reason: 'no-local-version' | 'remote-newer' | 'up-to-date';
}

export interface PortableModeStatus {
  enabled: boolean;
  rootPath?: string;
}

export interface BlocklyArduinoService
  extends JsonRpcServer<BlocklyArduinoServiceClient> {
  checkForUpdate(): Promise<BlocklyArduinoUpdateCheck>;
  updateIfNeeded(progressId: string): Promise<BlocklyArduinoUpdateResult>;
  getLocalIndexPath(): Promise<string | undefined>;
  getPortableModeStatus(): Promise<PortableModeStatus>;
  /**
   * Corrige Blockly@rduino pour que `?board=` fonctionne pour toutes les cartes du menu,
   * pas seulement l’optgroup « Arduino » (voir `blockly@rduino_core_IDE.js` `setArduinoBoard`).
   */
  ensureBlocklyIdeBoardUrlPatch(): Promise<void>;
}
