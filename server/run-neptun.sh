#!/usr/bin/env bash
# Co minutę (cron) jako użytkownik „egida”: jeden przebieg dziennika NEPTUN. Nie dotyka niczego poza /opt/egida.
BASE="${EGIDA_BASE:-/opt/egida}"
export PATH="$BASE/node/bin:$PATH"
cd "$(dirname "$0")" && timeout 40 node neptun-log.mjs >> "$BASE/neptun-run.txt" 2>&1
[ -f "$BASE/neptun-run.txt" ] && [ "$(stat -c %s "$BASE/neptun-run.txt")" -gt 500000 ] && tail -n 100 "$BASE/neptun-run.txt" > "$BASE/neptun-run.tmp" && mv "$BASE/neptun-run.tmp" "$BASE/neptun-run.txt"
exit 0
