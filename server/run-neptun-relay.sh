#!/usr/bin/env bash
# Przekaźnik NEPTUN (proces stały) z pilnującym. Uruchamiany co minutę z run-neptun-watch.sh i co 5 min z run.sh:
# gdy pilnujący już działa, blokada kończy ten skrypt od razu. Pilnujący restartuje przekaźnik po 2 s (np. po aktualizacji kodu),
# a gdy port jest zajęty (kod 3) – czeka minutę. Nie dotyka niczego poza /opt/egida i nie otwiera portów na zewnątrz (tylko 127.0.0.1).
# Wyłączenie: touch /opt/egida/relay.off (proces kończy się najpóźniej po minucie), włączenie: rm /opt/egida/relay.off
BASE="${EGIDA_BASE:-/opt/egida}"
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="$BASE/neptun-relay-log.txt"
stop_relay() { pkill -u "$(id -u)" -f "node neptun-relay.mjs" 2>/dev/null || true; }
if [ -f "$BASE/relay.off" ]; then stop_relay; exit 0; fi
exec 7>"$BASE/neptun-relay.lock"; flock -n 7 || exit 0
[ -f "$BASE/env" ] && { set -a; . "$BASE/env"; set +a; }
export PATH="$BASE/node/bin:$PATH" NEPTUN_RELAY_LOG="$LOG"
cd "$HERE" || exit 1
while [ ! -f "$BASE/relay.off" ]; do
  [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 1000000 ] && tail -n 300 "$LOG" > "$LOG.tmp" && cat "$LOG.tmp" > "$LOG" && rm -f "$LOG.tmp"
  # Blokada (fd 7) nie jest potrzebna procesowi node – trzyma ją pilnujący.
  node neptun-relay.mjs >> "$LOG" 2>&1 < /dev/null 7>&-
  code=$?
  [ -f "$BASE/relay.off" ] && break
  if [ "$code" -eq 3 ]; then sleep 60; else sleep 2; fi
  # Kod mógł się zmienić (git pull) – pilnujący też powinien być aktualny: kończymy, cron uruchomi nowy w ≤ 1 min.
  [ "$HERE/run-neptun-relay.sh" -nt "$BASE/neptun-relay.lock" ] && break
done
exit 0
