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

## Etap 2 (jest): mapa, schrony, obiekty przy granicy
- **Mapa** (`#/mapa`): Leaflet 1.9.4 (lokalnie, ładowany dopiero na tym ekranie). Podkłady: OSM, OpenTopoMap (teren), EOX Sentinel-2 (satelita) – adresy w `js/config.js` (`tiles`). Domyślny OSM nadaje się tylko do małego ruchu – przed premierą wymień na własnego dostawcę.
- **Schrony** (`#/schrony`, podgląd z wymyślonymi danymi: `#/schrony/demo`): lista najbliższych wg odległości z czasem pieszo, mini-mapa, blok „Jak wejść”, przyciski Pieszo/Autem, filtry, własne miejsca (tylko w telefonie). Dane: **Rejestr Punktów Schronienia (MSWiA / PSP, ok. 86 tys. punktów)** – oficjalny pakiet `/api/shelters/dataset/…` używany przez aplikację gdziesieukryc.pl do pracy offline (robots.txt: `Allow: /`). Serwer (`server/psp-sync.mjs`, wywoływany z `run.sh` co ~6 h) sprawdza manifest i pobiera pakiet tylko przy nowej wersji, dzieli go na kafelki 0,2°×0,3° i publikuje na gałąź `data` (`psp/`). Telefon pobiera tylko 9 kafelków wokół siebie i cache'uje je offline. Uzupełniająco `shelters.json` z OpenStreetMap (`server/shelters-sync.mjs`) – wpisy OSM z opisem wejścia wygrywają z punktem PSP w promieniu 30 m. **Gdy serwer PSP odpowiada 403 (ochrona przed botami) – import ręczny:** w przeglądarce otwórz `gdziesieukryc.pl/api/shelters/dataset/manifest`, odczytaj `version`, otwórz `gdziesieukryc.pl/api/shelters/dataset/<version>` i zapisz stronę (Ctrl+S) jako `dataset.json`; wgraj plik na serwer do `/tmp` i uruchom `psp-sync.mjs --file /tmp/dataset.json` z `PSP_OUT=/opt/egida/data-repo/psp`. Rejestr nie zawiera opisów „jak wejść”, tylko adres i dostępność; tak to pokazujemy.
- **Obiekty znad Ukrainy** (NEPTUN, poziom 2 = nieoficjalne): domyślnie wyłączone, włączane zgodą użytkownika (przeglądarka łączy się wtedy bezpośrednio z neptun.in.ua). Wyłącznik awaryjny: `neptun.enabled=false` w `js/config.js`. Podgląd z wymyślonymi danymi: `#/mapa/demo`.
- Ocena toru: tylko dla dronów i tylko przy świeżych danych; przy braku danych zawsze „Brak aktualnych danych”.
- **Testy**: `npm test` (logika) oraz scenariusze przeglądarkowe Playwright (poza repozytorium).
- **Dziennik NEPTUN na serwerze (tryb cichy)**: `node server/neptun-log.mjs --dump` pokazuje prawdziwy format; `bash server/install.sh --neptun-cron` włącza zapis co minutę do `/opt/egida/neptun-log/`, `--neptun-uncron` wyłącza.

## Wersja 14: tryb zagrożenia, plan rodziny, granice województw, strażnik
- **Wersja aplikacji**: `js/version.js` (`APP_VERSION`) + `VERSION` w `sw.js` – zawsze podnoś razem. Widać ją w Ustawieniach („EGIDA v14 · pamięć offline egida-v14”). Paczki nazywamy `egida-vNN.zip`.
- **Ekrany**: Tryb zagrożenia (`#/zagrozenie`), Plan rodziny + karty ICE + „Jestem bezpieczny” (`#/plan-rodziny`), Ważne miejsca (`#/miejsca`), Polityka prywatności (`#/prywatnosc`), wydruki (plan, plecak, instrukcje), wyszukiwanie i udostępnianie w Alertach, import kopii danych i „Odśwież aplikację” w Ustawieniach. Dane osobiste zostają tylko w telefonie (`js/personal.js`, `js/screens2.js`).
- **Granice województw (GPS)**: uproszczone PRG/GUGiK (`js/regions-data.js`, generowane `node scripts/build-regions.mjs`). Przy granicy (<10 km) aplikacja ostrzega, że województwo trzeba sprawdzić.
- **Satelita**: EOX z `referrerPolicy: "no-referrer"`; diagnostyka kafelków: `#/mapa/diag`.
- **Telegram wg wagi** (`server/tg-policy.mjs`): wysyła zagrożenia, ostrzeżenia i odwołania; podgląd bez wysyłki: `node server/poll.mjs --preview-tg 24`; stary tryb: `TELEGRAM_POLICY=legacy`.
- **Strażnik** (`server/watchdog.mjs`): alarm na Telegram przy awarii pobierania komunikatów. `node server/tg-admin-id.mjs` pokazuje `ADMIN_CHAT_ID` (po wpisaniu w `.env`), `bash server/install.sh --watchdog-cron` włącza (co 10 min), `--watchdog-uncron` wyłącza, `node server/watchdog.mjs --status` pokazuje stan. Nie wykryje awarii całego VPS (potrzebny monitoring zewnętrzny).
- Nowe treści (tryb zagrożenia, polityka prywatności, instrukcje) mają `reviewed: null` – wymagają zatwierdzenia; polityka prywatności – przeglądu prawnego.

## Wersja 16: czas dotarcia, cieniowanie obwodów, raport typów NEPTUN
- **Szacowanie prędkości** (`estimateMotion`, `ThreatStore.trackMotion` w `js/neptun.js`): NEPTUN nie podaje prędkości, więc aplikacja liczy ją z przesunięcia kolejnych potwierdzonych pozycji (dokładność ≤ 6 km, przesunięcie ≥ 3 km i większe od niepewności pozycji, kierunek zgodny z kursem ±50°). Wynik jest oznaczony „(szacunek)” i służy tylko do wyświetlania toru oraz „do granicy Polski w tym tempie ok. N min”. Nie wszczyna alarmu i nie wpływa na powiadomienia Telegram (obserwator na serwerze nie trzyma historii pozycji).
- **Cieniowanie obwodów z alarmem w Ukrainie** (`js/ua-shade.js`, granice `js/ua-oblasts.js` generowane `node scripts/build-ua-oblasts.mjs <ne_10m_admin_1_states_provinces.geojson>` z Natural Earth): cały obwód zacieniowany mocniej, obwód z alarmem tylko w części rejonów lżej i przerywaną linią (granic rejonów nie mamy). Krym i Sewastopol nie są cieniowane (brak w Natural Earth). Przełącznik w panelu mapy.
- **Raport `neptun-seen.json`** (gałąź `data`, `server/neptun-seen.mjs`): zapis wszystkich widzianych typów obiektów, pól, wartości pól wyliczeniowych oraz pierwszych próbek rzadkich rekordów (z `trail`, z prędkością, grupowych…). Zasilają go obserwator (co 10 s) i sonda; plik tylko rośnie. Surowy plik na serwerze: `/opt/egida/neptun-seen.json`.

## Dalej
Alerty poziomu 2 z torem po weryfikacji formatu NEPTUN, zatwierdzenie treści (`reviewed`), zewnętrzny monitoring VPS.

## v17 – „Wiadomości z regionu i kraju” (wiadomości z oficjalnych źródeł)
- Serwer (`server/news-sync.mjs`, co ~15 min z `run.sh`) czyta aktualności Policji (KGP + 16 komend wojewódzkich, kanały RSS wyszukiwane na stronach jednostek), MEN, RCB, urzędów wojewódzkich i kuratoriów (`server/news-sources.mjs`), filtruje po słowach kluczowych bezpieczeństwa i zapisuje `news.json` oraz raport `news-report.json` na gałąź `data`.
- Nic nie jest zatwierdzane ręcznie. Każdy wpis ma źródło i link do oryginału. Źródło odpowiadające kodem innym niż 200 jest pomijane (nic nie omijamy).
- Aplikacja: karta „Wiadomości z regionu i kraju” na Pulpicie (3 najnowsze dla Twojego województwa + ogólnopolskie) i ekran `#/wazne`. Po 3 h bez odświeżenia: „Brak aktualnych danych”.
- Dodanie źródła: jeden wpis w `server/news-sources.mjs`; co działa, widać w `news-report.json` na gałęzi `data`.

### v18 – dopiski do wiadomości
- Utrudnienia na drogach krajowych (GDDKiA, oficjalny plik XML: zdarzenia i zamknięcia) pokazują się w bloku „Dobrze wiedzieć” na Pulpicie dla Twojego województwa, nie na liście wiadomości.
- Doniesienia medialne: po jednej regionalnej rozgłośni publicznej na województwo (`server/news-sources.mjs`, lista RADIO). Tylko tytuł + link, oznaczone „doniesienie medialne”, filtr: poważne zdarzenia (bez sportu, kultury i rozmów). Serwer czyta robots.txt rozgłośni i pomija źródło, jeśli zabrania pobierania. Które rozgłośnie działają, widać w `news-report.json`.
- Wiadomości z kraju, z komend wojewódzkich i z mediów są deduplikowane po tytule (wygrywa źródło oficjalne).

## Wersja 19: logo, filtr lokalizacji doniesień, rozbudowa treści
- Logo: zielona tarcza z literą „E” (ikony PWA, favicon, nagłówek, ekran powitalny).
- Doniesienia medialne z rozgłośni radiowych są filtrowane po lokalizacji (`server/news-places.mjs`): tytuł musi dotyczyć wskazanego województwa.
- Pierwsza pomoc: ok. 35 instrukcji w pięciu grupach (zagrożenie życia, nagłe choroby, urazy, zatrucia i środowisko, gdy system nie działa).
- Poradnik „Co robić”: 24 instrukcje w trzech grupach (zagrożenia, brak prądu i awarie, informacje i oszustwa).
- Plecak: dłuższe listy, nowa zakładka „Rodzina” (plan rodzinny). Treść robocza (`reviewed: null`) do zatwierdzenia merytorycznego.
- `npm test` obejmuje `scripts/test-v19.mjs`.
