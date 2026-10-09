// Konfiguracja do uzupełnienia przez autora (puste = funkcja wyłączona).
export const CONFIG = {
  // Skąd aplikacja czyta komunikaty. Domyślnie plik w tej samej witrynie (data/alerts.json).
  // Można wskazać adres na VPS-ie, np. "https://twoja-domena.pl/alerts.json" (wymaga CORS).
  alertsUrl: "data/alerts.json",
  // Po ilu minutach dane uznajemy za nieaktualne (wtedy nie pokazujemy statusu „brak komunikatów”).
  staleAfterMin: 90,
  // Publiczne kanały Telegram na województwo, np. { mazowieckie: "https://t.me/egida_mazowieckie" }.
  telegram: {},
  // Licznik GoatCounter: adres endpointu, np. "https://twojkod.goatcounter.com/count". Puste = brak licznika.
  goatcounter: "",
  // Link kontaktowy do zgłaszania błędów (np. t.me/... lub mailto:). Puste = ukryte.
  contactUrl: "",
};
