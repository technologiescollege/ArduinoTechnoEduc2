export const BlocklyArduinoServicePath = '/services/blockly-arduino-service';
export const BlocklyArduinoService = Symbol('BlocklyArduinoService');

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

export interface BlocklyArduinoService {
  checkForUpdate(): Promise<BlocklyArduinoUpdateCheck>;
  updateIfNeeded(): Promise<BlocklyArduinoUpdateResult>;
  getLocalIndexPath(): Promise<string | undefined>;
  getPortableModeStatus(): Promise<PortableModeStatus>;
}
