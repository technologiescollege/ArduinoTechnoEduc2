#!/usr/bin/env bash
# Supprime l'historique des runs GitHub Actions (les ~180 runs).
# Nécessite un token avec "actions: write" (PAT) ou : gh auth login
#
# Usage :
#   export GITHUB_TOKEN=ghp_xxx   # ou GH_TOKEN
#   bash scripts/purge-github-actions-runs.sh
#
set -euo pipefail

OWNER="${GITHUB_OWNER:-technologiescollege}"
REPO="${GITHUB_REPO:-ArduinoTechnoEduc2}"
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"

if [[ -z "$TOKEN" ]]; then
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    echo ">>> Utilisation de gh api"
    USE_GH=1
  else
    echo "Définissez GITHUB_TOKEN (PAT avec actions:write) ou installez/connectez gh :"
    echo "  sudo apt install -y gh && gh auth login"
    echo "  export GITHUB_TOKEN=..."
    exit 1
  fi
else
  USE_GH=0
fi

api() {
  local method="$1" path="$2"
  if [[ "${USE_GH}" == "1" ]]; then
    gh api -X "$method" "$path"
  else
    curl -sS -X "$method" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com$path"
  fi
}

echo ">>> Listing des workflow runs de $OWNER/$REPO ..."
page=1
deleted=0
while true; do
  if [[ "${USE_GH}" == "1" ]]; then
    raw=$(gh api "$OWNER/$REPO/actions/runs?per_page=100&page=$page")
  else
    raw=$(curl -sS \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$OWNER/$REPO/actions/runs?per_page=100&page=$page")
  fi
  ids=$(echo "$raw" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); (j.workflow_runs||[]).forEach(r=>console.log(r.id));})")
  if [[ -z "$ids" ]]; then
    break
  fi
  for id in $ids; do
    echo "  delete run $id"
    if [[ "${USE_GH}" == "1" ]]; then
      gh api -X DELETE "repos/$OWNER/$REPO/actions/runs/$id" >/dev/null || true
    else
      curl -sS -o /dev/null -w "%{http_code}\n" -X DELETE \
        -H "Authorization: Bearer $TOKEN" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/$OWNER/$REPO/actions/runs/$id" || true
    fi
    deleted=$((deleted + 1))
  done
  page=$((page + 1))
  if [[ "$page" -gt 50 ]]; then
    break
  fi
done

echo ">>> Terminé. Runs traités : $deleted"
echo "Les workflows orphelins (fichiers déjà retirés) peuvent être désactivés dans"
echo "  Settings → Actions → General, ou ils disparaîtront après push de ce commit."
