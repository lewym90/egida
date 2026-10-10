#!/usr/bin/env bash
# Wypycha data/alerts.json na osobną gałąź „data” (jeden commit, nadpisywany – repozytorium nie puchnie).
# GitHub Pages (gałąź main) NIE jest przez to odświeżane, więc nie ma limitu budowań.
# Wywoływane z run.sh. Wymaga zmiennych: DATA_DIR, GH_TOKEN, EGIDA_REMOTE.
set -euo pipefail
cd "$DATA_DIR"
git add alerts.json
[ -f shelters.json ] && git add shelters.json
if git rev-parse -q --verify HEAD >/dev/null; then
  git -c user.name="egida-bot" -c user.email="egida-bot@users.noreply.github.com" commit --amend --reset-author -q -m "Dane komunikatów"
else
  git -c user.name="egida-bot" -c user.email="egida-bot@users.noreply.github.com" commit -q -m "Dane komunikatów"
fi
AUTH=()
case "$EGIDA_REMOTE" in
  https://*) AUTH=(-c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)") ;;
esac
git "${AUTH[@]}" push -q --force origin HEAD:refs/heads/data
