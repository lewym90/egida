// Konfiguracja do uzupełnienia przez autora (puste = funkcja wyłączona).
// Kanały Telegram: @<prefiks><id_województwa>, np. @egida_lodzkie, @egida_kujawsko_pomorskie (myślnik → podkreślnik).
// Dopisuj tu id województw dopiero wtedy, gdy kanał naprawdę istnieje (wtedy w Ustawieniach pojawi się link).
const TG_PREFIX = "egida_";
const TG_REGIONS = []; // np. ["lodzkie", "mazowieckie"]
const tgLinks = Object.fromEntries(TG_REGIONS.map((id) => [id, `https://t.me/${TG_PREFIX}${id.replace(/-/g, "_")}`]));

export const CONFIG = {
  // Skąd aplikacja czyta komunikaty. Plik wypychany z serwera na osobną gałąź „data” (nie obciąża GitHub Pages).
  // Można wskazać adres na VPS-ie, np. "https://twoja-domena.pl/alerts.json" (wymaga CORS).
  alertsUrl: "https://raw.githubusercontent.com/lewym90/egida/data/alerts.json",
  // Po ilu minutach dane uznajemy za nieaktualne (wtedy nie pokazujemy statusu „brak komunikatów”).
  staleAfterMin: 90,
  // Publiczne kanały Telegram na województwo, np. { mazowieckie: "https://t.me/egida_mazowieckie" }.
  telegram: tgLinks,
  // Licznik GoatCounter: adres endpointu, np. "https://twojkod.goatcounter.com/count". Puste = brak licznika.
  goatcounter: "",
  // Link kontaktowy do zgłaszania błędów (np. t.me/... lub mailto:). Puste = ukryte.
  contactUrl: "",
  // Podkłady mapy. Adresy można zmienić bez ruszania kodu aplikacji; atrybucje są OBOWIĄZKOWE (wymagają ich licencje).
  // „Mapa”: kafelki OSM (tile.openstreetmap.org) są OK przy niewielkim ruchu i zwykłym przeglądaniu; przed szerszym startem
  //   zamień na dostawcę z darmowym planem i kluczem (np. MapTiler/Stadia) albo własny hosting kafelków.
  // „Teren”: OpenTopoMap (CC-BY-SA 3.0); polityka użycia przy większym ruchu do potwierdzenia u autorów.
  // „Satelita”: EOxCloudless (CC BY-NC-SA 4.0, tylko użytek niekomercyjny).
  tiles: {
    map: { name: "Mapa", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">współtwórcy OpenStreetMap</a>' },
    terrain: { name: "Teren", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", subdomains: "abc", maxZoom: 17,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">współtwórcy OpenStreetMap</a>, SRTM | styl: © <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (CC-BY-SA)' },
    sat: { name: "Satelita", url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg", maxZoom: 15, maxNativeZoom: 13, referrerPolicy: "no-referrer",
      fallbackUrls: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg", "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"],
      attribution: 'EOxCloudless <a href="https://cloudless.eox.at" target="_blank" rel="noopener noreferrer">cloudless.eox.at</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)' },
  },
  // NEPTUN (neptun.in.ua): otwarte API, tylko odczyt. REST nie częściej niż co 5 s (my: co pollMs).
  // Ustaw enabled: false, aby wyłączyć całą funkcję (np. gdyby operator zmienił warunki lub API).
  neptun: { enabled: true, restUrl: "https://neptun.in.ua/api/v1/threats", alertsUrl: "https://neptun.in.ua/api/v1/alerts", messagesUrl: "https://neptun.in.ua/api/v1/messages", wsUrl: "wss://neptun.in.ua/api/v1/stream", pollMs: 15000, extrasMs: 60000 },
  // Serwer Overpass (OpenStreetMap) do wyszukiwania schronów w pobliżu. Można zmienić na inny publiczny serwer.
  overpassUrl: ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"],
  // Baza schronów z OpenStreetMap, odświeżana raz na dobę przez serwer EGIDA (gałąź data). Telefon nie pyta wtedy OSM o nic.
  // Rejestr Punktów Schronienia (MSWiA / PSP), podzielony na kafelki przez serwer EGIDA (server/psp-sync.mjs).
  pspUrl: "https://raw.githubusercontent.com/lewym90/egida/data/psp/",
  sheltersUrl: "https://raw.githubusercontent.com/lewym90/egida/data/shelters.json",
};
