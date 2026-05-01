import {
  contextBridge,
  ipcRenderer,
} from '@theia/core/electron-shared/electron';
import { Disposable } from '@theia/core/lib/common/disposable';
import {
  CHANNEL_REQUEST_RELOAD,
  MenuDto,
} from '@theia/core/lib/electron-common/electron-api';
import { UUID } from '@theia/core/shared/@phosphor/coreutils';
import type { Sketch } from '../common/protocol/sketches-service';
import {
  ARDUINO_BLOCKLY_PLOTTER_ARG,
  CHANNEL_APP_INFO,
  CHANNEL_BLOCKLY_IDE_BRIDGE,
  CHANNEL_BLOCKLY_IDE_FROM_HOST,
  CHANNEL_BLOCKLY_IDE_LOAD_XML_SYNC,
  CHANNEL_BLOCKLY_IDE_SAVE_CAPTURE,
  CHANNEL_BLOCKLY_IDE_SAVE_XML,
  CHANNEL_BLOCKLY_IDE_TO_HOST,
  CHANNEL_IS_FIRST_WINDOW,
  CHANNEL_MAIN_MENU_ITEM_DID_CLICK,
  CHANNEL_OPEN_PATH,
  CHANNEL_PLOTTER_WINDOW_DID_CLOSE,
  CHANNEL_QUIT_APP,
  CHANNEL_SCHEDULE_DELETION,
  CHANNEL_SEND_STARTUP_TASKS,
  CHANNEL_SET_MENU_WITH_NODE_ID,
  CHANNEL_SET_REPRESENTED_FILENAME,
  CHANNEL_SHOW_MESSAGE_BOX,
  CHANNEL_SHOW_OPEN_DIALOG,
  CHANNEL_SHOW_PLOTTER_WINDOW,
  CHANNEL_GET_BLOCKLY_PREVIEW,
  CHANNEL_SHOW_SAVE_DIALOG,
  ElectronArduino,
  InternalMenuDto,
  MessageBoxOptions,
  OpenDialogOptions,
  SaveDialogOptions,
} from '../electron-common/electron-arduino';
import { hasStartupTasks, StartupTasks } from '../electron-common/startup-task';

let mainMenuHandlers: Map<string, () => void> = new Map();

let blocklyIdeBridgeHandler:
  | ((msg: { method: string; args: unknown[] }) => Promise<unknown>)
  | undefined;

const isBlocklyPlotterWindow =
  typeof process !== 'undefined' &&
  process.argv.includes(ARDUINO_BLOCKLY_PLOTTER_ARG);

/** Blockly@rduino `index_IDE.html` expects global `BlocklyArduinoServer` (Arduino IDE 1 Java bridge). */
function exposeBlocklyArduinoServerApi(): void {
  contextBridge.exposeInMainWorld('BlocklyArduinoServer', {
    pasteCode: (code: string) =>
      ipcRenderer.invoke(CHANNEL_BLOCKLY_IDE_BRIDGE, {
        method: 'pasteCode',
        args: [code],
      }),
    uploadCode: (code: string) =>
      ipcRenderer.invoke(CHANNEL_BLOCKLY_IDE_BRIDGE, {
        method: 'uploadCode',
        args: [code],
      }),
    saveCode: (data: string) =>
      ipcRenderer.invoke(CHANNEL_BLOCKLY_IDE_BRIDGE, {
        method: 'saveCode',
        args: [data],
      }),
    IDEsaveXML: (data: string) =>
      ipcRenderer.invoke(CHANNEL_BLOCKLY_IDE_SAVE_XML, data),
    IDEloadXML: () => ipcRenderer.sendSync(CHANNEL_BLOCKLY_IDE_LOAD_XML_SYNC),
    saveWorkspaceCapture: (xml: string) =>
      ipcRenderer.invoke(CHANNEL_BLOCKLY_IDE_SAVE_CAPTURE, xml),
  });
}

function attachBlocklyIdeHostForwarding(): void {
  ipcRenderer.on(
    CHANNEL_BLOCKLY_IDE_TO_HOST,
    async (_event, msg: { id: string; method: string; args: unknown[] }) => {
      if (!blocklyIdeBridgeHandler) {
        ipcRenderer.send(CHANNEL_BLOCKLY_IDE_FROM_HOST, {
          id: msg.id,
          error: 'Blockly IDE bridge not ready',
        });
        return;
      }
      try {
        const result = await blocklyIdeBridgeHandler({
          method: msg.method,
          args: msg.args,
        });
        ipcRenderer.send(CHANNEL_BLOCKLY_IDE_FROM_HOST, {
          id: msg.id,
          result,
        });
      } catch (e) {
        ipcRenderer.send(CHANNEL_BLOCKLY_IDE_FROM_HOST, {
          id: msg.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  );
}

function convertMenu(
  menu: MenuDto[] | undefined,
  handlerMap: Map<string, () => void>
): InternalMenuDto[] | undefined {
  if (!menu) {
    return undefined;
  }

  return menu.map((item) => {
    let nodeId = UUID.uuid4();
    if (item.execute) {
      if (!item.id) {
        throw new Error(
          "A menu item having the 'execute' property must have an 'id' too."
        );
      }
      nodeId = item.id;
      handlerMap.set(nodeId, item.execute);
    }

    return {
      id: item.id,
      submenu: convertMenu(item.submenu, handlerMap),
      accelerator: item.accelerator,
      label: item.label,
      nodeId,
      checked: item.checked,
      enabled: item.enabled,
      role: item.role,
      type: item.type,
      visible: item.visible,
    };
  });
}

const api: ElectronArduino = {
  showMessageBox: (options: MessageBoxOptions) =>
    ipcRenderer.invoke(CHANNEL_SHOW_MESSAGE_BOX, options),
  showOpenDialog: (options: OpenDialogOptions) =>
    ipcRenderer.invoke(CHANNEL_SHOW_OPEN_DIALOG, options),
  showSaveDialog: (options: SaveDialogOptions) =>
    ipcRenderer.invoke(CHANNEL_SHOW_SAVE_DIALOG, options),
  appInfo: () => ipcRenderer.invoke(CHANNEL_APP_INFO),
  quitApp: () => ipcRenderer.send(CHANNEL_QUIT_APP),
  isFirstWindow: () => ipcRenderer.invoke(CHANNEL_IS_FIRST_WINDOW),
  requestReload: (options: StartupTasks) =>
    ipcRenderer.send(CHANNEL_REQUEST_RELOAD, options),
  registerStartupTasksHandler: (handler: (tasks: StartupTasks) => void) => {
    const listener = (_: Electron.IpcRendererEvent, args: unknown) => {
      if (hasStartupTasks(args)) {
        handler(args);
      } else {
        console.warn(
          `Events received on the ${CHANNEL_SEND_STARTUP_TASKS} channel expected to have a startup task argument, but it was: ${JSON.stringify(
            args
          )}`
        );
      }
    };
    ipcRenderer.on(CHANNEL_SEND_STARTUP_TASKS, listener);
    return Disposable.create(() =>
      ipcRenderer.removeListener(CHANNEL_SEND_STARTUP_TASKS, listener)
    );
  },
  scheduleDeletion: (sketch: Sketch) =>
    ipcRenderer.send(CHANNEL_SCHEDULE_DELETION, sketch),
  setRepresentedFilename: (fsPath: string) =>
    ipcRenderer.send(CHANNEL_SET_REPRESENTED_FILENAME, fsPath),
  showPlotterWindow: (params: { url: string; forceReload?: boolean }) =>
    ipcRenderer.send(CHANNEL_SHOW_PLOTTER_WINDOW, params),
  getBlocklyPreviewArduino: () =>
    ipcRenderer.invoke(CHANNEL_GET_BLOCKLY_PREVIEW) as Promise<string>,
  registerPlotterWindowCloseHandler: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on(CHANNEL_PLOTTER_WINDOW_DID_CLOSE, listener);
    return Disposable.create(() =>
      ipcRenderer.removeListener(CHANNEL_PLOTTER_WINDOW_DID_CLOSE, listener)
    );
  },
  openPath: (fsPath: string) => ipcRenderer.send(CHANNEL_OPEN_PATH, fsPath),
  setMenu: (menu: MenuDto[] | undefined): void => {
    mainMenuHandlers = new Map();
    const internalMenu = convertMenu(menu, mainMenuHandlers);
    ipcRenderer.send(CHANNEL_SET_MENU_WITH_NODE_ID, internalMenu);
  },
};

export function preload(): void {
  if (isBlocklyPlotterWindow) {
    exposeBlocklyArduinoServerApi();
    console.log(
      'Blockly plotter preload: BlocklyArduinoServer (index_IDE compatible)'
    );
    return;
  }

  contextBridge.exposeInMainWorld('electronArduino', api);
  contextBridge.exposeInMainWorld(
    '__arduinoRegisterBlocklyIdeBridge',
    (
      fn: (msg: {
        method: string;
        args: unknown[];
      }) => Promise<unknown>
    ) => {
      blocklyIdeBridgeHandler = fn;
    }
  );
  attachBlocklyIdeHostForwarding();

  ipcRenderer.on(CHANNEL_MAIN_MENU_ITEM_DID_CLICK, (_, nodeId: string) => {
    const handler = mainMenuHandlers.get(nodeId);
    if (handler) {
      handler();
    }
  });
  console.log('Exposed Arduino IDE electron API');
}
