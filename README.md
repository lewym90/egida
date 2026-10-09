# EGIDA – Twoje centrum bezpieczeństwa

Darmowa, nieoficjalna aplikacja PWA (bez reklam, konta i sprzedaży danych). Opis projektu: `EGIDA-KOMPLET.md` (w projekcie Claude).

## Co jest w tej wersji (etap 1 / MVP)
Start i zgody · Pulpit z wyborem województwa · Alerty (z gałęzi `data`, odświeżanej przez serwer) · Poradnik „Co robić” · Pierwsza pomoc z metronomem RKO · Plecak i zapasy · Test gotowości · Ustawienia · Źródła i licencje · tryb offline (service worker) · wersja na komputer.
**Jeszcze nie ma:** Mapy, Schronów, NEPTUN, Planu rodziny, push z PWA (patrz „Etap 2” poniżej).

## Uruchomienie lokalne
```bash
python3 -m http.server 8000     # w tym folderze, potem http://localhost:8000
```

## Publikacja na GitHub Pages (prosta metoda, bez Actions)
1. Nowe, osobne repozytorium `egida` (publiczne). Nie dotyka żadnego innego repozytorium.
2. Wgraj zawartość folderu na gałąź `main`.
3. Settings → Pages → Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`, Save.
4. Adres: `https://lewym90.github.io/egida/` (wszystkie ścieżki są względne).
(Plik `.github/workflows/pages.yml` to wariant dla zaawansowanych – kontrola składni i treści przed publikacją; nie jest potrzebny na start.)

## Komunikaty RSO i Telegram (VPS)
```bash
cd server && npm install
node poll.mjs --dump    # PIERWSZE URUCHOMIENIE: pokaże prawdziwą strukturę XML z RSO; dopasuj FIELD_MAP w rso.mjs
node poll.mjs           # zapisuje ../data/alerts.json
```
Zmienne środowiskowe: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNELS` (JSON, np. `{"mazowieckie":"@egida_mazowieckie"}`), opcjonalnie `TELEGRAM_TYPES` (domyślnie `rcb,pogoda,woda`), `APP_URL`.
Na serwerze: `bash server/install.sh` (osobny użytkownik `egida`, folder `/opt/egida`), potem `bash server/install.sh --cron`. `run.sh` co 5 min pobiera RSO, a przy zmianie (lub co ≥25 min) wypycha `alerts.json` na gałąź `data` (jeden nadpisywany commit; nie uruchamia budowania GitHub Pages).
Bez tokenu skrypt działa „na sucho”: zapisuje dane, niczego nie wysyła. Przy pierwszym uruchomieniu nie wysyła historii na kanały.

## Zasady, które pilnuje kod
- Brak świeżych danych ⇒ aplikacja NIE pokazuje „brak komunikatów”, tylko „Brak aktualnych danych” (próg: `staleAfterMin` w `js/config.js`).
- Komunikaty z zewnątrz są zawsze escapowane; adresy inne niż http(s) są odrzucane.
- Czcionki hostowane lokalnie (nic nie jest ładowane z Google).
- Licznik (GoatCounter) wyłączony domyślnie i bez adresu w `config.js` nic nie zlicza.
- Treści (`js/content.js`) mają pole `reviewed: null` do czasu merytorycznego zatwierdzenia. `node scripts/check-content.mjs --strict` blokuje publikację bez daty przeglądu – włącz `--strict` w workflow przed premierą.

## Etap 2
Mapa (dostawca kafelków + satelita), schrony z „Jak wejść”, NEPTUN w trybie cichym (tylko log), potem alerty poziomu 2 z torem. Granice województw dla GPS (dziś: najbliższy środek województwa – przybliżenie, oznaczone w UI).
