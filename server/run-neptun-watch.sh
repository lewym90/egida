#!/usr/bin/env bash
# Co minutę (cron) jako użytkownik „egida”: obserwator NEPTUN → powiadomienia Telegram (pętla ~52 s) oraz obserwator Alertów RCB
# o zagrożeniu z powietrza (gov.pl). Nie dotyka niczego poza /opt/egida.
BASE="${EGIDA_BASE:-/opt/egida}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$BASE/env" ] && { set -a; . "$BASE/env"; set +a; }
export PATH="$BASE/node/bin:$PATH" CHANNELS_FILE="${CHANNELS_FILE:-$BASE/channels.json}" NEPTUN_STATE="$BASE/neptun-state.json" NEPTUN_SEEN="$BASE/neptun-seen.json" NEPTUN_HEALTH="$BASE/neptun-health.json"

# 1. Alerty RCB z gov.pl – PRZED blokadą NEPTUN, żeby przeciągający się obserwator NEPTUN nie zabierał im minuty.
#    W tle, z własną blokadą i logiem; nie opóźnia obserwatora NEPTUN.
RCB_LOG="$BASE/rcb-log.txt"
[ -f "$RCB_LOG" ] && [ "$(stat -c %s "$RCB_LOG")" -gt 300000 ] && tail -n 300 "$RCB_LOG" > "$RCB_LOG.tmp" && mv "$RCB_LOG.tmp" "$RCB_LOG"
( flock -n 8 || exit 0; cd "$HERE" && timeout 50 node rcb-watch.mjs >> "$RCB_LOG" 2>&1 ) 8>"$BASE/rcb.lock" &

# 2. Obserwator NEPTUN.
exec 9>"$BASE/neptun-watch.lock"; flock -n 9 || { wait; exit 0; }
LOG="$BASE/neptun-watch-log.txt"
cd "$HERE" && timeout 58 node neptun-watch.mjs >> "$LOG" 2>&1
[ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 300000 ] && tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
wait
exit 0
