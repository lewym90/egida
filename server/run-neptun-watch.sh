#!/usr/bin/env bash
# Co minutę (cron) jako użytkownik „egida”: obserwator NEPTUN → powiadomienia Telegram (pętla ~52 s). Nie dotyka niczego poza /opt/egida.
BASE="${EGIDA_BASE:-/opt/egida}"
exec 9>"$BASE/neptun-watch.lock"; flock -n 9 || exit 0
[ -f "$BASE/env" ] && { set -a; . "$BASE/env"; set +a; }
export PATH="$BASE/node/bin:$PATH" CHANNELS_FILE="${CHANNELS_FILE:-$BASE/channels.json}" NEPTUN_STATE="$BASE/neptun-state.json"
LOG="$BASE/neptun-watch-log.txt"
cd "$(dirname "$0")" && timeout 58 node neptun-watch.mjs >> "$LOG" 2>&1
[ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 300000 ] && tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
