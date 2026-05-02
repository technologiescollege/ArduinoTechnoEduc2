import { sanitizeFqbn } from '../../common/protocol/boards-service';

/**
 * Correspondance pour le paramètre d’URL Blockly `?board=…` (lu par `BlocklyDuino.getStringParamFromUrl` dans
 * Blockly@rduino `blockly@rduino_core_IDE.js`).
 *
 * - **Clé (chaîne à gauche)** — **Arduino IDE 2** : FQBN de la carte sélectionnée dans l’IDE (barre d’outils /
 *   dialogue carte-port), tel que fourni par le backend via **arduino-cli** et exposé côté frontend
 *   (`BoardsServiceProvider.boardsConfig.selectedBoard.fqbn`). Avant comparaison, on applique
 *   {@link sanitizeFqbn} comme ailleurs dans l’IDE (forme canonique des options carte).
 *
 * - **Valeur (chaîne à droite)** — **Blockly@rduino** : identifiant interne de la carte dans leur UI et générateur :
 *   clé dans l’objet global `profile` et attribut `value` des `<option>` du sélecteur `#board_select` dans
 *   `index_IDE.html`. Ces id sont alignés sur le champ `upload_arg` de chaque profil dans
 *   `core/BlocklyArduino/blockly@rduino_boards.js` (souvent proche du FQBN Arduino, mais ce n’est pas la même chose :
 *   Blockly utilise des noms courts type `arduino_uno`, pas `arduino:avr:uno`).
 *
 * Quand plusieurs profils Blockly partagent le même `upload_arg`, on ne garde ici qu’une entrée « générique »
 * (carte Arduino / module ESP de base), pas un kit éducatif.
 */
const FQBN_TO_BLOCKLY_BOARD_ID: Readonly<Record<string, string>> = {
  'arduino:avr:atmegang': 'arduino_atmegang',
  'arduino:avr:bt': 'arduino_bt',
  'arduino:avr:diecimila': 'arduino_diecimila',
  'arduino:avr:esplora': 'arduino_esplora',
  'arduino:avr:ethernet': 'arduino_ethernet',
  'arduino:avr:fio': 'arduino_fio',
  'arduino:avr:gemma': 'arduino_gemma',
  'arduino:avr:leonardo': 'arduino_leonardo',
  'arduino:avr:lilypad': 'lilypad',
  'arduino:avr:LilyPadUSB': 'LilyPadUSB',
  'arduino:avr:mega:cpu=atmega2560': 'arduino_mega',
  'arduino:avr:megaADK': 'arduino_megaADK',
  'arduino:avr:micro': 'arduino_micro',
  'arduino:avr:mini': 'arduino_mini',
  'arduino:avr:nano:cpu=atmega328': 'arduino_nano',
  /** Nano « old bootloader » : même profil pin que Nano ATmega328 côté Blockly. */
  'arduino:avr:nano:cpu=atmega328old': 'arduino_nano',
  'arduino:avr:pro:cpu=16MHzatmega328': 'arduino_pro16',
  'arduino:avr:pro:cpu=8MHzatmega328': 'arduino_pro8',
  'arduino:avr:robotControl': 'arduino_robotControl',
  'arduino:avr:robotMotor': 'arduino_robotMotor',
  'arduino:avr:uno': 'arduino_uno',
  'arduino:avr:yun': 'arduino_yun',
  'arduino:sam:arduino_due_x': 'arduino_due_x',
  'esp32:esp32:esp32': 'esp32',
  'esp8266:esp8266': 'esp8266',
};

const FQBN_KEYS_LONGEST_FIRST = Object.keys(FQBN_TO_BLOCKLY_BOARD_ID).sort(
  (a, b) => b.length - a.length || a.localeCompare(b)
);

/**
 * Produit la valeur du query `board` pour Blockly@rduino à partir du FQBN **Arduino IDE** courant.
 * @returns Identifiant carte **Blockly@rduino**, ou `undefined` pour ouvrir `index_IDE.html` sans `?board=`.
 */
export function blocklyBoardQueryValueFromFqbn(
  fqbn: string | undefined
): string | undefined {
  if (!fqbn?.trim()) {
    return undefined;
  }
  let normalized: string;
  try {
    normalized = sanitizeFqbn(fqbn);
  } catch {
    return undefined;
  }
  for (const prefix of FQBN_KEYS_LONGEST_FIRST) {
    if (normalized === prefix || normalized.startsWith(`${prefix}:`)) {
      return FQBN_TO_BLOCKLY_BOARD_ID[prefix];
    }
  }
  return undefined;
}

/**
 * Ajoute `?board=<id>` à l’URL `file://…/index_IDE.html` ; `boardId` est l’identifiant **Blockly@rduino**, pas un FQBN.
 */
export function blocklyIndexUrlWithBoard(
  fileUrl: string,
  boardId: string | undefined
): string {
  if (!boardId) {
    return fileUrl;
  }
  try {
    const u = new URL(fileUrl);
    u.searchParams.set('board', boardId);
    return u.href;
  } catch {
    const sep = fileUrl.includes('?') ? '&' : '?';
    return `${fileUrl}${sep}board=${encodeURIComponent(boardId)}`;
  }
}
