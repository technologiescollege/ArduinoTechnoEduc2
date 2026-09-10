#!/usr/bin/env bash
# Prépare l'environnement de développement Arduino IDE (fork) :
#   1. compile extension + electron-app (build:dev)
#   2. copie les binaires Arduino (CLI, LS, …) vers lib/
#   3. rebuild les modules natifs pour Electron (drivelist, keytar, …)
#
# Usage :
#   yarn setup:dev
#   yarn setup:dev --skip-build   # seulement rebuild Electron + ressources
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
  esac
done

log() { echo ""; echo "=== $*"; }

if [[ "$SKIP_BUILD" != "1" ]]; then
  log "Compilation (yarn build:dev)"
  yarn build:dev
fi

log "Copie des binaires Arduino vers lib/node/resources"
if [[ -f "$ROOT/arduino-ide-extension/scripts/copy-resources.js" ]]; then
  node "$ROOT/arduino-ide-extension/scripts/copy-resources.js"
else
  echo "Script copy-resources.js introuvable — ignore."
fi

log "Rebuild des modules natifs pour Electron"
yarn --cwd "$ROOT/electron-app" rebuild

log "Prêt. Lancez : yarn start"
