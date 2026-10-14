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
export CHANNELS_FILE="$BASE/channels.json"
export NEPTUN_SEEN="$BASE/neptun-seen.json"   # skumulowany raport NEPTUN (typy, trail); zasilają go obserwator i sonda
export ALERTS_OUT="$DATA_DIR/alerts.json" STATE_FILE="$BASE/state.json"
LOG="$BASE/log.txt"
[ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 1000000 ] && tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
echo "--- $(date -Is)"

# Raz na godzinę pobierz nowszy kod z repozytorium (tylko publiczny odczyt, bez tokenu).
if [ "$(date +%M)" -lt 5 ]; then
  git -C "$BASE/repo" pull --ff-only -q 2>&1 | tail -n 3 || true
fi

cd "$SERVER_DIR"
# Co ~6 h sprawdź, czy PSP opublikowała nową wersję Rejestru Punktów Schronienia (pobiera pakiet tylko przy zmianie).
PSP_STAMP="$BASE/psp.checked"; PSP_NEW=0
if [ ! -f "$PSP_STAMP" ] || [ "$(( $(date +%s) - $(stat -c %Y "$PSP_STAMP") ))" -gt 21600 ]; then
  PSP_LOG="$(PSP_OUT="$DATA_DIR/psp" timeout 200 node psp-sync.mjs 2>&1)"; PSP_RC=$?; echo "$PSP_LOG" | tail -n 6
  if [ "$PSP_RC" -eq 0 ]; then touch "$PSP_STAMP"; echo "$PSP_LOG" | grep -q '^Zapisano' && PSP_NEW=1
  else echo "psp-sync nieudany (np. serwer PSP odrzuca skrypty) – zostaje poprzednia baza; kolejna próba za ok. 6 h. Ręczny import: patrz README"; touch "$PSP_STAMP"; fi
fi
# Raz na dobę odśwież bazę schronów z OpenStreetMap (błąd tu nie zatrzymuje komunikatów).
SH_FILE="$DATA_DIR/shelters.json"; SH_NEW=0
if [ ! -f "$SH_FILE" ] || [ "$(( $(date +%s) - $(stat -c %Y "$SH_FILE") ))" -gt 86400 ]; then
  if SHELTERS_OUT="$SH_FILE" timeout 200 node shelters-sync.mjs; then SH_NEW=1; else echo "shelters-sync nieudany – zostaje poprzednia baza"; fi
fi
# Raz na dobę defibrylatory (AED) i szpitale z OpenStreetMap → aed.json, hospitals.json. Trwa kilka minut (16 zapytań z przerwami),
# więc działa w tle i zwalnia blokadę – komunikaty nie czekają. Pliki trafią na gałąź data przy najbliższej publikacji (≤ 25 min).
[ -f "$BASE/medical.log" ] && [ "$(stat -c %s "$BASE/medical.log")" -gt 1000000 ] && tail -n 300 "$BASE/medical.log" > "$BASE/medical.log.tmp" && mv "$BASE/medical.log.tmp" "$BASE/medical.log"
MED_STAMP="$BASE/medical.v28.checked"
if [ ! -f "$MED_STAMP" ] || [ "$(( $(date +%s) - $(stat -c %Y "$MED_STAMP") ))" -gt 86400 ]; then
  touch "$MED_STAMP"
  ( export ADDR_CACHE="$BASE/addr-cache.json"; DATA_DIR="$DATA_DIR" flock "$BASE/medical.lock" timeout 1500 node medical-sync.mjs >> "$BASE/medical.log" 2>&1 || touch -d "-18 hours" "$MED_STAMP" ) 9>&- &
fi
# Co ~50 min uzupełnianie adresów i rodzaju obiektu AED/szpitali (OSM; pierwsze przebiegi trwają godzinami, kolejne tylko dla nowych punktów). W tle, ze swoją blokadą.
ADDR_STAMP="$BASE/medical.addr.checked"
if [ -f "$DATA_DIR/aed.json" ] && { [ ! -f "$ADDR_STAMP" ] || [ "$(( $(date +%s) - $(stat -c %Y "$ADDR_STAMP") ))" -gt 3000 ]; }; then
  touch "$ADDR_STAMP"
  ( export ADDR_CACHE="$BASE/addr-cache.json"; DATA_DIR="$DATA_DIR" flock -n "$BASE/medical.lock" timeout 3300 node medical-addr.mjs >> "$BASE/medical.log" 2>&1 || rm -f "$ADDR_STAMP" ) 9>&- &
fi
# Raz na dobę (±) defibrylatory z publicznej mapy „Ratuj z sercem – Mapa AED” → aed-ratuj.json + raport ratuj-probe.json (robots.txt respektowany, kilka zapytań).
RJ_STAMP="$BASE/ratuj.checked"; RJ_NEW=0
if [ ! -f "$RJ_STAMP" ] || [ "$(( $(date +%s) - $(stat -c %Y "$RJ_STAMP") ))" -gt 86400 ]; then
  touch "$RJ_STAMP"
  if RATUJ_OUT="$DATA_DIR/aed-ratuj.json" RATUJ_PROBE_OUT="$DATA_DIR/ratuj-probe.json" timeout 120 node ratuj-sync.mjs 2>&1 | tail -n 6; then RJ_NEW=1; else echo "ratuj-sync nieudany – zostaje poprzedni plik"; fi
fi
# Co ~30 min sonda formatu NEPTUN (3 zapytania REST + 8 s WebSocket): raport trafia na gałąź data jako neptun-schema.json.
NP_FILE="$DATA_DIR/neptun-schema.json"; NP_NEW=0
if [ ! -f "$NP_FILE" ] || [ "$(( $(date +%s) - $(stat -c %Y "$NP_FILE") ))" -gt 1800 ]; then
  if NEPTUN_SCHEMA_OUT="$NP_FILE" timeout 90 node neptun-probe.mjs; then NP_NEW=1; else echo "neptun-probe nieudany – pomijam"; fi
fi
# Co ~15 min „Ważne w regionie”: aktualności z oficjalnych źródeł (Policja, MEN, RCB, urzędy, kuratoria) → news.json + news-report.json.
# Błąd tu nigdy nie blokuje komunikatów: przy porażce zostaje poprzedni plik (aplikacja sama pokaże „Brak aktualnych danych” po 3 h).
NEWS_FILE="$DATA_DIR/news.json"; NEWS_NEW=0
# Pełny przebieg (wszystkie źródła) co ~14 min; w międzyczasie, przy każdym uruchomieniu (co ~5 min), szybki przebieg samych doniesień medialnych (--fast).
NEWS_MODE=""
if [ ! -f "$BASE/news.checked" ] || [ "$(( $(date +%s) - $(stat -c %Y "$BASE/news.checked") ))" -gt 840 ]; then NEWS_MODE="full"
elif [ ! -f "$BASE/news.fast" ] || [ "$(( $(date +%s) - $(stat -c %Y "$BASE/news.fast") ))" -gt 240 ]; then NEWS_MODE="fast"; fi
if [ -n "$NEWS_MODE" ]; then
  [ "$NEWS_MODE" = full ] && touch "$BASE/news.checked"; touch "$BASE/news.fast"
  NEWS_ARG=""; [ "$NEWS_MODE" = fast ] && NEWS_ARG="--fast"
  NEWS_OLD="$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(require("crypto").createHash("sha1").update(JSON.stringify(j.items)).digest("hex"))}catch{console.log("")}' "$NEWS_FILE")"
  if NEWS_CACHE_FILE="$BASE/news-feeds.json" NEWS_SEEN_FILE="$BASE/news-seen.json" NEWS_OUT="$NEWS_FILE" NEWS_REPORT_OUT="$DATA_DIR/news-report.json" timeout 170 node news-sync.mjs $NEWS_ARG | tail -n 40; then
    NEWS_CUR="$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(require("crypto").createHash("sha1").update(JSON.stringify(j.items)).digest("hex"))}catch{console.log("")}' "$NEWS_FILE")"
    [ "$NEWS_CUR" != "$NEWS_OLD" ] && NEWS_NEW=1
  fi
fi
# Co ~60 min indeks jakości powietrza ze stacji GIOŚ → air.json (kilkaset krótkich zapytań z odstępami). Błąd nie blokuje komunikatów: zostaje poprzedni plik.
AIR_FILE="$DATA_DIR/air.json"; AIR_NEW=0
if [ ! -f "$BASE/air.checked" ] || [ "$(( $(date +%s) - $(stat -c %Y "$BASE/air.checked") ))" -gt 3300 ]; then
  touch "$BASE/air.checked"
  if AIR_OUT="$AIR_FILE" timeout 150 node air-sync.mjs 2>&1 | tail -n 6; then AIR_NEW=1; else echo "air-sync nieudany – zostaje poprzedni plik"; fi
fi
# Skumulowany raport NEPTUN dołącza do zwykłych publikacji (co najmniej raz na 25 min). Sam nie wymusza publikacji, bo zmienia się co 10 s.
[ -f "$NEPTUN_SEEN" ] && cp "$NEPTUN_SEEN" "$DATA_DIR/neptun-seen.json"
# Licznik kolejnych porażek: po 3 z rzędu (≈15 min) wysyłamy wiadomość administratorowi (jeśli ustawiono ADMIN_CHAT_ID).
fail() {
  local n=$(( $(cat "$BASE/fails" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$BASE/fails"
  [ "$n" -eq 3 ] && node notify.mjs "EGIDA: serwer nie może pobrać/opublikować komunikatów od ok. 15 min. Aplikacja pokazuje „Brak aktualnych danych”. Zajrzyj do /opt/egida/log.txt"
  return 0
}
ok() {
  [ "$(cat "$BASE/fails" 2>/dev/null || echo 0)" -ge 3 ] && node notify.mjs "EGIDA: pobieranie komunikatów działa ponownie."
  echo 0 > "$BASE/fails"
}
timeout 120 node poll.mjs || { echo "poll nieudany – nic nie publikuję"; fail; exit 1; }

# Publikuj tylko gdy treść się zmieniła albo minęło ≥25 min (sygnał „żyję”, aby aplikacja nie uznała danych za stare).
NEW="$(node -e 'const j=JSON.parse(require("fs").readFileSync(process.env.ALERTS_OUT,"utf8"));console.log(require("crypto").createHash("sha1").update(JSON.stringify([j.items,j.telegram||{}])).digest("hex"))')"
OLD="$(cat "$BASE/last.hash" 2>/dev/null || true)"
AGE=99999
[ -f "$BASE/last.push" ] && AGE=$(( ( $(date +%s) - $(stat -c %Y "$BASE/last.push") ) / 60 ))
if [ "$NEW" != "$OLD" ] || [ "$AGE" -ge 25 ] || [ "$SH_NEW" = 1 ] || [ "$PSP_NEW" = 1 ] || [ "$NP_NEW" = 1 ] || [ "$NEWS_NEW" = 1 ] || [ "$RJ_NEW" = 1 ] || [ "$AIR_NEW" = 1 ]; then
  if bash "$SERVER_DIR/publish.sh"; then echo "$NEW" > "$BASE/last.hash"; touch "$BASE/last.push"; echo "opublikowano"; ok; else echo "publikacja nieudana"; fail; exit 1; fi
else
  echo "bez zmian (ostatnia publikacja ${AGE} min temu)"; ok
fi
