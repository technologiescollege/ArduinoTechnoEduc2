#!/usr/bin/env bash
# Exporte un patch unique : différence entre votre HEAD actuel et la branche Arduino (upstream/main).
# À utiliser AVANT un sync qui écrase vos versions (ex. sync avec favor-upstream), pour pouvoir
# réappliquer ensuite : git apply patches/....patch  (ou examiner / découper le patch à la main).
#
# Le patch reflète l’état des fichiers par rapport à https://github.com/arduino/arduino-ide (branche configurable).
#
# Usage :
#   ./scripts/export-fork-patch.sh
#   OUT=patches/mon-fork.patch ./scripts/export-fork-patch.sh
#   UPSTREAM_BRANCH=2.3.x ./scripts/export-fork-patch.sh
#
# Non interactif : OUT doit être défini ou le chemin par défaut sous patches/ est utilisé.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/arduino/arduino-ide.git}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"

if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  echo "Ajout du remote '$UPSTREAM_REMOTE' -> $UPSTREAM_URL"
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

echo ">>> git fetch $UPSTREAM_REMOTE"
git fetch "$UPSTREAM_REMOTE"

UP_REF="$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
if ! git rev-parse --verify "$UP_REF" >/dev/null 2>&1; then
  echo "Référence introuvable : $UP_REF"
  exit 1
fi

mkdir -p patches
DEFAULT_OUT="patches/fork-changes-$(date +%Y%m%d-%H%M%S).patch"
OUT="${OUT:-}"

if [[ -z "$OUT" ]]; then
  if [[ -t 0 ]]; then
    read -r -p "Fichier de sortie [$DEFAULT_OUT] : " _out
    OUT="${_out:-$DEFAULT_OUT}"
  else
    OUT="$DEFAULT_OUT"
  fi
fi

# Diff : arbre upstream -> votre HEAD (vos modifications par rapport à Arduino)
echo ">>> git diff $UP_REF HEAD > $OUT"
git diff "$UP_REF" HEAD > "$OUT"

BYTES=$(wc -c < "$OUT" | tr -d ' ')
echo ">>> Écrit : $OUT ($BYTES octets)"
echo ""
echo "Réappliquer après mise à jour depuis Arduino (exemple) :"
echo "  git apply --reject --whitespace=fix $OUT"
echo "Les fichiers binaires ne sont pas dans le patch ; gérez-les à part si besoin."
