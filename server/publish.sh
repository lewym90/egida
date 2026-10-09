#!/usr/bin/env bash
# Uruchamiane na VPS co 5 minut: pobiera komunikaty i, jeśli plik się zmienił, wypycha go do repozytorium
# (GitHub Pages sam się wtedy odświeży). Wymaga sklonowanego repo z kluczem deploy (zapis).
set -euo pipefail
cd "$(dirname "$0")"
node poll.mjs
cd ..
if ! git diff --quiet -- data/alerts.json; then
  git add data/alerts.json
  git -c user.name="egida-bot" -c user.email="egida-bot@users.noreply.github.com" commit -m "Aktualizacja komunikatów" -q
  git pull --rebase -q && git push -q
fi
