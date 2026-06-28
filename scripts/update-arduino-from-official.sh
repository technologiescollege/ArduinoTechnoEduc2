#!/usr/bin/env bash
# Mise à jour automatique depuis le dépôt officiel Arduino IDE 2.x
# https://github.com/arduino/arduino-ide
#
# Ce script orchestre :
#   1. (optionnel) export d'un patch de sauvegarde de votre fork
#   2. synchronisation Git avec upstream (merge ou rebase)
#   3. (optionnel) alignement des versions d'outils embarqués (arduino-cli, LS, etc.)
#   4. yarn install + téléchargement des binaires Arduino (prepare)
#   5. (optionnel) compilation du projet
#
# Usage interactif (recommandé) :
#   yarn update:arduino
#
# Exemples non interactifs :
#   SYNC_STRATEGY=merge yarn update:arduino
#   TOOLS_ONLY=1 yarn update:arduino
#   EXPORT_PATCH=1 SYNC_STRATEGY=favor-upstream BUILD=1 yarn update:arduino
#
# Variables :
#   UPSTREAM_REMOTE     remote Git (défaut : upstream)
#   UPSTREAM_BRANCH     branche Arduino (défaut : main)
#   UPSTREAM_REF        référence pour les versions d'outils (défaut : $UPSTREAM_REMOTE/$UPSTREAM_BRANCH)
#   SYNC_STRATEGY       merge | favor-upstream (voir sync-upstream.sh)
#   REBASE              1 = rebase au lieu de merge
#   STRICT              1 = refuser si l'arbre Git n'est pas propre
#   EXPORT_PATCH        1 = exporter patches/fork-changes-....patch avant le sync
#   SKIP_SYNC           1 = ne pas fusionner avec upstream (post-traitement seulement)
#   TOOLS_ONLY          1 = seulement aligner les versions d'outils + prepare (pas de merge Git)
#   SYNC_IDE_VERSION    1 = aligner aussi package.json version sur upstream (avec TOOLS_ONLY ou après sync)
#   SKIP_INSTALL        1 = ne pas lancer yarn install
#   SKIP_PREPARE          1 = ne pas lancer yarn prepare (téléchargements CLI/LS/…)
#   BUILD               1 = lancer yarn build à la fin
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
UPSTREAM_REF="${UPSTREAM_REF:-$UPSTREAM_REMOTE/$UPSTREAM_BRANCH}"
EXPORT_PATCH="${EXPORT_PATCH:-0}"
SKIP_SYNC="${SKIP_SYNC:-0}"
TOOLS_ONLY="${TOOLS_ONLY:-0}"
SYNC_IDE_VERSION="${SYNC_IDE_VERSION:-0}"
SKIP_INSTALL="${SKIP_INSTALL:-0}"
SKIP_PREPARE="${SKIP_PREPARE:-0}"
BUILD="${BUILD:-0}"

log() {
  echo ""
  echo "=== $*"
}

ensure_upstream_remote() {
  local url="${UPSTREAM_URL:-https://github.com/arduino/arduino-ide.git}"
  if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    echo "Ajout du remote '$UPSTREAM_REMOTE' -> $url"
    git remote add "$UPSTREAM_REMOTE" "$url"
  fi
}

fetch_upstream() {
  ensure_upstream_remote
  log "Récupération de $UPSTREAM_REMOTE"
  git fetch "$UPSTREAM_REMOTE"
  if ! git rev-parse --verify "$UPSTREAM_REF" >/dev/null 2>&1; then
    echo "Référence introuvable : $UPSTREAM_REF"
    echo "Branches disponibles : git ls-remote --heads $UPSTREAM_REMOTE"
    exit 1
  fi
}

sync_tool_versions() {
  log "Alignement des versions d'outils Arduino depuis $UPSTREAM_REF"
  UPSTREAM_REF="$UPSTREAM_REF" SYNC_IDE_VERSION="$SYNC_IDE_VERSION" \
    node "$ROOT/scripts/sync-arduino-tool-versions.js"
}

run_prepare() {
  log "Téléchargement des binaires Arduino (arduino-cli, fwuploader, language-server, exemples)"
  yarn --cwd "$ROOT/arduino-ide-extension" download-cli
  yarn --cwd "$ROOT/arduino-ide-extension" download-fwuploader
  yarn --cwd "$ROOT/arduino-ide-extension" download-ls --force-download
  yarn --cwd "$ROOT/arduino-ide-extension" download-examples
  yarn --cwd "$ROOT/arduino-ide-extension" copy-i18n
}

if [[ "$TOOLS_ONLY" == "1" ]]; then
  fetch_upstream
  sync_tool_versions
  if [[ "$SKIP_PREPARE" != "1" ]]; then
    run_prepare
  fi
  log "Terminé (mode outils seulement)."
  echo "Vérifiez les changements : git diff"
  echo "Puis committez si besoin : git add -A && git commit -m \"chore: align Arduino tool versions on $UPSTREAM_REF\""
  exit 0
fi

if [[ "$EXPORT_PATCH" == "1" ]]; then
  log "Export du patch de sauvegarde du fork"
  OUT="${OUT:-}" UPSTREAM_BRANCH="$UPSTREAM_BRANCH" UPSTREAM_REMOTE="$UPSTREAM_REMOTE" \
    bash "$ROOT/scripts/export-fork-patch.sh"
fi

if [[ "$SKIP_SYNC" != "1" ]]; then
  log "Synchronisation Git avec arduino/arduino-ide ($UPSTREAM_REF)"
  UPSTREAM_BRANCH="$UPSTREAM_BRANCH" UPSTREAM_REMOTE="$UPSTREAM_REMOTE" \
    REBASE="${REBASE:-0}" STRICT="${STRICT:-0}" SYNC_STRATEGY="${SYNC_STRATEGY:-}" \
    bash "$ROOT/scripts/sync-upstream.sh"
else
  fetch_upstream
fi

if [[ "$SYNC_IDE_VERSION" == "1" ]]; then
  sync_tool_versions
fi

if [[ "$SKIP_INSTALL" != "1" ]]; then
  log "Installation des dépendances Node (yarn install)"
  yarn install
fi

if [[ "$SKIP_PREPARE" != "1" ]]; then
  run_prepare
fi

if [[ "$BUILD" == "1" ]]; then
  log "Compilation (yarn build)"
  yarn build
fi

log "Mise à jour terminée."
echo ""
echo "Prochaines étapes suggérées :"
echo "  - Vérifier : git status && git diff"
echo "  - Tester   : yarn start"
echo "  - Publier  : git push origin $(git branch --show-current)"
