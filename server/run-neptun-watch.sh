#!/usr/bin/env bash
# Co minutę (cron) jako użytkownik „egida”: obserwator NEPTUN → powiadomienia Telegram (pętla ~52 s). Nie dotyka niczego poza /opt/egida.
BASE="${EGIDA_BASE:-/opt/egida}"
exec 9>"$BASE/neptun-watch.lock"; flock -n 9 || exit 0
[ -f "$BASE/env" ] && { set -a; . "$BASE/env"; set +a; }
export PATH="$BASE/node/bin:$PATH" CHANNELS_FILE="${CHANNELS_FILE:-$BASE/channels.json}" NEPTUN_STATE="$BASE/neptun-state.json" NEPTUN_SEEN="$BASE/neptun-seen.json" NEPTUN_HEALTH="$BASE/neptun-health.json"
LOG="$BASE/neptun-watch-log.txt"
# Co minutę także Alerty RCB o zagrożeniu z powietrza z gov.pl (w tle, własna blokada i log; nie opóźnia obserwatora NEPTUN).
RCB_LOG="$BASE/rcb-log.txt"
( flock -n 8 || exit 0; cd "$(dirname "$0")" && timeout 50 node rcb-watch.mjs >> "$RCB_LOG" 2>&1 ) 8>"$BASE/rcb.lock" 9>&- &
[ -f "$RCB_LOG" ] && [ "$(stat -c %s "$RCB_LOG")" -gt 300000 ] && tail -n 300 "$RCB_LOG" > "$RCB_LOG.tmp" && mv "$RCB_LOG.tmp" "$RCB_LOG"
cd "$(dirname "$0")" && timeout 58 node neptun-watch.mjs >> "$LOG" 2>&1
[ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 300000 ] && tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
