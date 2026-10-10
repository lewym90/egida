#!/usr/bin/env bash
# Co 10 minut (cron) jako użytkownik „egida”: strażnik komunikatów. Nie dotyka niczego poza /opt/egida.
BASE="${EGIDA_BASE:-/opt/egida}"
[ -f "$BASE/env" ] && { set -a; . "$BASE/env"; set +a; }
export PATH="$BASE/node/bin:$PATH" EGIDA_BASE="$BASE"
LOG="$BASE/watchdog-log.txt"
cd "$(dirname "$0")" && timeout 60 node watchdog.mjs >> "$LOG" 2>&1
[ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 200000 ] && tail -n 100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
