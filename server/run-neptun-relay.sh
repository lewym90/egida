#!/usr/bin/env bash
# Przekaźnik NEPTUN (proces stały). Uruchamiany co minutę z run-neptun-watch.sh: gdy już działa, blokada kończy ten skrypt od razu;
# gdy padł albo sam się zakończył po aktualizacji kodu – startuje ponownie. Nie dotyka niczego poza /opt/egida.
# Wyłączenie: touch /opt/egida/relay.off (proces kończy się przy najbliższej minucie), włączenie: rm /opt/egida/relay.off
BASE="${EGIDA_BASE:-/opt/egida}"
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="$BASE/neptun-relay-log.txt"
if [ -f "$BASE/relay.off" ]; then
  # Wyłączony: zatrzymaj działający proces (jeśli jest).
  pkill -u "$(id -u)" -f "node neptun-relay.mjs" 2>/dev/null || true
  exit 0
fi
exec 7>"$BASE/neptun-relay.lock"; flock -n 7 || exit 0
[ -f "$BASE/env" ] && { set -a; . "$BASE/env"; set +a; }
export PATH="$BASE/node/bin:$PATH"
[ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 1000000 ] && tail -n 300 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
cd "$HERE" || exit 1
# Blokada (fd 7) zostaje przy procesie node przez cały czas jego działania.
exec node neptun-relay.mjs >> "$LOG" 2>&1 < /dev/null
