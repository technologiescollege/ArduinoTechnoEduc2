#!/usr/bin/env bash
# Synchronise avec la branche principale d'Arduino IDE 2.x : https://github.com/arduino/arduino-ide
#
# Usage non interactif (CI / scripts) :
#   SYNC_STRATEGY=merge|favor-upstream   # favor-upstream = -X theirs (versions Arduino en conflit)
#   REBASE=1                             # rebase au lieu de merge
#   UPSTREAM_BRANCH=2.3.x
#   STRICT=1                             # refuser si l'arbre n'est pas propre (pas d'autostash)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/arduino/arduino-ide.git}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
REBASE="${REBASE:-0}"
STRICT="${STRICT:-0}"
# merge | favor-upstream — si vide et terminal interactif, affiche le menu
SYNC_STRATEGY="${SYNC_STRATEGY:-}"

if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  echo "Ajout du remote '$UPSTREAM_REMOTE' -> $UPSTREAM_URL"
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

echo ">>> git fetch $UPSTREAM_REMOTE"
git fetch "$UPSTREAM_REMOTE"

if ! git rev-parse --verify "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" >/dev/null 2>&1; then
  echo "Branche distante introuvable : $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
  echo "Listez les branches avec : git ls-remote --heads $UPSTREAM_REMOTE"
  exit 1
fi

CURRENT="$(git branch --show-current)"
echo ">>> Branche locale : $CURRENT"
echo ">>> Référence Arduino : $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"

if [[ "$(git status --porcelain)" != "" ]]; then
  if [[ "$STRICT" == "1" ]]; then
    echo "STRICT=1 : arbre de travail non vide. Committez ou stash, puis relancez."
    exit 1
  fi
  echo ">>> Modifications locales : --autostash sera utilisé."
fi

choose_strategy() {
  if [[ -n "$SYNC_STRATEGY" ]]; then
    case "$SYNC_STRATEGY" in
      merge | favor-upstream) return 0 ;;
      *)
        echo "SYNC_STRATEGY invalide : $SYNC_STRATEGY (attendu : merge ou favor-upstream)"
        exit 1
        ;;
    esac
  fi
  if [[ ! -t 0 ]]; then
    echo "Entrée non interactive : SYNC_STRATEGY=merge par défaut."
    SYNC_STRATEGY=merge
    return 0
  fi
  echo ""
  echo "Comment fusionner $UPSTREAM_REMOTE/$UPSTREAM_BRANCH dans votre branche ?"
  echo "  1) Fusion classique — en cas de conflit, vous choisissez quoi garder (recommandé si vous avez peu de fichiers modifiés)."
  echo "  2) Fusion en privilégiant Arduino — en cas de conflit, la version de arduino/arduino-ide est gardée automatiquement (-X theirs)."
  echo "     Vos changements sur ces lignes seront perdus pour ces fichiers : exportez un patch avant avec : yarn export:fork-patch"
  echo "  3) Annuler"
  read -r -p "Votre choix [1-3] : " _choice
  case "${_choice:-}" in
    1) SYNC_STRATEGY=merge ;;
    2) SYNC_STRATEGY=favor-upstream ;;
    3 | q | Q)
      echo "Annulé."
      exit 0
      ;;
    *)
      echo "Choix invalide."
      exit 1
      ;;
  esac
}

choose_strategy

if [[ "$SYNC_STRATEGY" == "favor-upstream" ]]; then
  echo ">>> Stratégie : en conflit, version Arduino conservée (-X theirs)."
  if [[ "$REBASE" == "1" ]]; then
    echo ">>> git rebase --autostash --strategy-option=theirs $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
    git rebase --autostash --strategy-option=theirs "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
  else
    echo ">>> git merge --no-edit --autostash --strategy-option=theirs $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
    git merge --no-edit --autostash --strategy-option=theirs "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
  fi
else
  echo ">>> Stratégie : fusion classique."
  if [[ "$REBASE" == "1" ]]; then
    echo ">>> git rebase --autostash $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
    git rebase --autostash "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
  else
    echo ">>> git merge --no-edit --autostash $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
    git merge --no-edit --autostash "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
  fi
fi

echo ""
echo ">>> Terminé."
echo "    Conflits restants : résolvez, puis git add -A && git commit (merge) ou git rebase --continue (rebase)."
echo "    Puis : git push origin $CURRENT"
