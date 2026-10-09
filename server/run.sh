#!/usr/bin/env bash
# Uruchamiane z crona co 5 minut jako użytkownik „egida”. Nie dotyka niczego poza /opt/egida.
set -uo pipefail
BASE="${EGIDA_BASE:-/opt/egida}"
SERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
exec 9>"$BASE/run.lock"; flock -n 9 || exit 0          # nie uruchamiaj dwóch naraz
set -a; . "$BASE/env"; set +a
export PATH="$BASE/node/bin:$PATH"
export EGIDA_REMOTE="${EGIDA_REMOTE:-https://github.com/${EGIDA_REPO:-lewym90/egida}.git}"
export DATA_DIR="$BASE/data-repo" GH_TOKEN="${GH_TOKEN:-}"
export ALERTS_OUT="$DATA_DIR/alerts.json" STATE_FILE="$BASE/state.json"
LOG="$BASE/log.txt"
[ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 1000000 ] && tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
echo "--- $(date -Is)"

# Raz na godzinę pobierz nowszy kod z repozytorium (tylko publiczny odczyt, bez tokenu).
if [ "$(date +%M)" -lt 5 ]; then
  git -C "$BASE/repo" pull --ff-only -q 2>&1 | tail -n 3 || true
fi

cd "$SERVER_DIR"
timeout 120 node poll.mjs || { echo "poll nieudany – nic nie publikuję"; exit 1; }

# Publikuj tylko gdy treść się zmieniła albo minęło ≥25 min (sygnał „żyję”, aby aplikacja nie uznała danych za stare).
NEW="$(node -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ALERTS_OUT,"utf8"));console.log(require("crypto").createHash("sha1").update(JSON.stringify(j.items)).digest("hex"))')"
OLD="$(cat "$BASE/last.hash" 2>/dev/null || true)"
AGE=99999
[ -f "$BASE/last.push" ] && AGE=$(( ( $(date +%s) - $(stat -c %Y "$BASE/last.push") ) / 60 ))
if [ "$NEW" != "$OLD" ] || [ "$AGE" -ge 25 ]; then
  if bash "$SERVER_DIR/publish.sh"; then echo "$NEW" > "$BASE/last.hash"; touch "$BASE/last.push"; echo "opublikowano"; else echo "publikacja nieudana"; exit 1; fi
else
  echo "bez zmian (ostatnia publikacja ${AGE} min temu)"
fi
