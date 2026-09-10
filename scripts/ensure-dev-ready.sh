#!/usr/bin/env bash
# Vérifie avant yarn start que le build et les modules Electron sont prêts.
# Si les binaires Arduino manquent : les copie.
# Si un module natif (ex. drivelist) n'est pas chargé par Electron : rebuild.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MAIN="$ROOT/electron-app/src-gen/backend/electron-main.js"
CLI="$ROOT/arduino-ide-extension/lib/node/resources/arduino-cli"
ELECTRON_BIN="$ROOT/node_modules/electron/dist/electron"

if [[ ! -f "$MAIN" ]]; then
  echo ">>> Build manquant (pas de electron-app/src-gen)."
  echo "    Lancez une fois : yarn setup:dev"
  exit 1
fi

if [[ ! -f "$CLI" ]]; then
  echo ">>> arduino-cli absent de lib/ — copie des ressources…"
  node "$ROOT/arduino-ide-extension/scripts/copy-resources.js"
fi

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo ">>> Electron introuvable. Lancez : yarn install && yarn setup:dev"
  exit 1
fi

# Charge drivelist avec le Node d'Electron (ABI correct).
if ! ELECTRON_RUN_AS_NODE=1 "$ELECTRON_BIN" -e "require('drivelist')" >/dev/null 2>&1; then
  echo ">>> Modules natifs incompatibles avec Electron — rebuild…"
  yarn --cwd "$ROOT/electron-app" rebuild
fi
