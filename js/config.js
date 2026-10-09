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
};
