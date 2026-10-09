#!/usr/bin/env bash
# Instalator EGIDY na VPS. Bezpieczny dla innych aplikacji (np. Typer):
#  - działa tylko w /opt/egida i na własnym użytkowniku „egida” (bez uprawnień roota),
#  - nie używa apt, nie rusza /opt/typer, nie zmienia crona roota ani Caddy.
# Użycie:  bash install.sh          (instalacja)
#          bash install.sh --cron   (włączenie automatycznego uruchamiania co 5 min)
#          bash install.sh --uncron (wyłączenie)
set -euo pipefail
BASE=/opt/egida
REPO="${EGIDA_REPO:-lewym90/egida}"
US=egida
say() { printf '\n== %s\n' "$*"; }
die() { printf '\nBŁĄD: %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "Uruchom jako root (jesteś zalogowany jako root w Termiusie – wystarczy wkleić polecenie)."

if [ "${1:-}" = "--cron" ]; then
  [ -f "$BASE/env" ] || die "Najpierw zrób zwykłą instalację: bash install.sh"
  ( crontab -u "$US" -l 2>/dev/null | grep -v '# egida_poll' || true; echo "*/5 * * * * bash $BASE/repo/server/run.sh >> $BASE/log.txt 2>&1 # egida_poll" ) | crontab -u "$US" -
  echo "Włączono. Sprawdź za 6 minut:  tail -n 20 $BASE/log.txt"; exit 0
fi
if [ "${1:-}" = "--uncron" ]; then
  ( crontab -u "$US" -l 2>/dev/null | grep -v '# egida_poll' || true ) | crontab -u "$US" - ; echo "Wyłączono."; exit 0
fi

say "1/7 Sprawdzam serwer"
for c in git curl tar flock sha256sum base64; do command -v "$c" >/dev/null || die "Brak programu „$c”. Napisz mi o tym w czacie – nic nie instaluję bez Twojej wiedzy."; done
FREE_MB=$(df -Pm /opt | awk 'NR==2{print $4}')
echo "Wolne miejsce na dysku: ${FREE_MB} MB"
[ "$FREE_MB" -ge 1500 ] || die "Za mało wolnego miejsca (potrzebuję ≥1500 MB). Typer też tego potrzebuje – nie instaluję."
case "$(uname -m)" in x86_64) ARCH=x64;; aarch64) ARCH=arm64;; *) die "Nieobsługiwana architektura $(uname -m)";; esac

say "2/7 Tworzę osobnego użytkownika „$US” i folder $BASE"
id "$US" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$BASE" --shell /bin/bash "$US"
mkdir -p "$BASE"; chown "$US":"$US" "$BASE"; chmod 750 "$BASE"
as() { runuser -u "$US" -- "$@"; }

say "3/7 Instaluję Node.js 22 (tylko dla EGIDY, w $BASE/node)"
if [ ! -x "$BASE/node/bin/node" ]; then
  T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
  curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$T/SHA"
  F=$(grep -o "node-v22[0-9.]*-linux-$ARCH.tar.gz" "$T/SHA" | head -n1); [ -n "$F" ] || die "Nie znalazłem pliku Node 22."
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$F" -o "$T/$F"
  ( cd "$T" && grep " $F\$" SHA | sha256sum -c - ) || die "Suma kontrolna Node się nie zgadza."
  mkdir -p "$BASE/node"; tar -xzf "$T/$F" -C "$BASE/node" --strip-components=1; chown -R "$US":"$US" "$BASE/node"
fi
as "$BASE/node/bin/node" -v

say "4/7 Pobieram kod EGIDY z GitHuba (publiczny odczyt)"
if [ -d "$BASE/repo/.git" ]; then as git -C "$BASE/repo" pull --ff-only -q; else as git clone -q --depth 1 "https://github.com/$REPO.git" "$BASE/repo"; fi
[ -f "$BASE/repo/server/poll.mjs" ] || die "W repozytorium nie ma folderu server/. Wgraj najpierw najnowszą paczkę na GitHub."
( cd "$BASE/repo/server" && as env PATH="$BASE/node/bin:$PATH" npm install --omit=dev --no-audit --no-fund --silent )
( cd "$BASE/repo/server" && as env PATH="$BASE/node/bin:$PATH" node test.mjs )

say "5/7 Token do zapisu danych"
if [ ! -f "$BASE/env" ]; then
  echo "Wklej token GitHub dla repozytorium egida (nie będzie widoczny podczas wpisywania) i naciśnij Enter:"
  read -rs TOKEN </dev/tty; echo
  [ -n "$TOKEN" ] || die "Pusty token."
  umask 077
  { echo "GH_TOKEN=$TOKEN"; echo "EGIDA_REPO=$REPO"; echo "APP_URL=https://${REPO%%/*}.github.io/${REPO##*/}/";
    echo "# Telegram (włączysz później):"; echo "# TELEGRAM_BOT_TOKEN="; echo "# TELEGRAM_CHANNELS={\"mazowieckie\":\"@kanal\"}"; } > "$BASE/env"
  chown "$US":"$US" "$BASE/env"; chmod 600 "$BASE/env"
else echo "Plik $BASE/env już istnieje – zostawiam."; fi

say "6/7 Przygotowuję lokalną kopię dla gałęzi „data”"
if [ ! -d "$BASE/data-repo/.git" ]; then
  as git init -q -b data "$BASE/data-repo"
  as git -C "$BASE/data-repo" remote add origin "https://github.com/$REPO.git"
fi

say "7/7 Pierwsze pobranie z RSO (--dump) – pokazuje, jak wygląda prawdziwy plik"
( cd "$BASE/repo/server" && as env PATH="$BASE/node/bin:$PATH" node poll.mjs --dump > "$BASE/dump.txt" 2>&1 || true )
head -c 3500 "$BASE/dump.txt"; echo
echo
echo "GOTOWE. Zawartość powyżej jest też w pliku: $BASE/dump.txt"
echo "Automatyczne uruchamianie jeszcze NIE jest włączone (zrobimy to po sprawdzeniu pliku RSO)."
