// Lista źródeł „Ważne w regionie”. Wyłącznie oficjalne instytucje. Dodanie źródła = jeden wpis tutaj (patrz news-report.json, co działa).
// filter: "all" – wszystkie wpisy; "safety" – tylko o bezpieczeństwie; "school" – wąski zestaw (MEN, kuratoria).
// region: id województwa (js/content.js) albo "all" (ogólnopolskie).
const KWP = [
  ["dolnoslaskie", "dolnoslaska"], ["kujawsko-pomorskie", "kujawsko-pomorska"], ["lubelskie", "lublin"], ["lubuskie", "gorzow"],
  ["lodzkie", "lodz"], ["malopolskie", "malopolska"], ["mazowieckie", "mazowiecka"], ["opolskie", "opole"], ["podkarpackie", "podkarpacka"],
  ["podlaskie", "podlaska"], ["pomorskie", "pomorska"], ["slaskie", "slaska"], ["swietokrzyskie", "swietokrzyska"],
  ["warminsko-mazurskie", "warminsko-mazurska"], ["wielkopolskie", "wielkopolska"], ["zachodniopomorskie", "zachodniopomorska"],
];
// Nazwy w nawiasach: nazwa jednostki w tytule źródła.
const KWP_NAME = { dolnoslaskie: "Policja Dolnośląska", "kujawsko-pomorskie": "Policja Kujawsko-Pomorska", lubelskie: "Policja Lubelska", lubuskie: "Policja Lubuska",
  lodzkie: "Policja Łódzka", malopolskie: "Policja Małopolska", mazowieckie: "Policja Mazowiecka", opolskie: "Policja Opolska", podkarpackie: "Policja Podkarpacka",
  podlaskie: "Policja Podlaska", pomorskie: "Policja Pomorska", slaskie: "Policja Śląska", swietokrzyskie: "Policja Świętokrzyska",
  "warminsko-mazurskie": "Policja Warmińsko-Mazurska", wielkopolskie: "Policja Wielkopolska", zachodniopomorskie: "Policja Zachodniopomorska" };

export const SOURCES = [
  // Ogólnopolskie (sprawdzone z serwera EGIDA: HTTP 200)
  { id: "policja-pl", label: "Policja (KGP)", region: "all", kind: "rss", filter: "safety", urls: ["https://policja.pl/dokumenty/rss/1-rss-1.rss"] },
  { id: "rcb", label: "Rządowe Centrum Bezpieczeństwa", region: "all", kind: "html", filter: "all", urls: ["https://www.gov.pl/web/rcb/wiadomosci", "https://www.gov.pl/web/rcb"] },
  { id: "men", label: "Ministerstwo Edukacji Narodowej", region: "all", kind: "html", filter: "school", urls: ["https://www.gov.pl/web/edukacja/wiadomosci", "https://www.gov.pl/web/edukacja"] },
  // Województwo: Policja (kanał RSS „Aktualności” wyszukiwany na stronie głównej jednostki)
  ...KWP.map(([region, host]) => ({ id: "kwp-" + region, label: KWP_NAME[region], region, kind: "rss", filter: "safety", discover: `https://${host}.policja.gov.pl/`,
    // Mazowsze: adres sprawdzony ręcznie, używany też, gdyby wyszukiwanie zawiodło.
    urls: region === "mazowieckie" ? ["https://mazowiecka.policja.gov.pl/dokumenty/rss/271-rss-o-1488.rss"] : undefined })),
  // Urzędy wojewódzkie i kuratoria (sprawdzone z serwera: HTTP 200)
  { id: "uw-lodzki", label: "Łódzki Urząd Wojewódzki", region: "lodzkie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-lodzki/wiadomosci", "https://www.gov.pl/web/uw-lodzki"] },
  { id: "kuratorium-waw", label: "Mazowieckie Kuratorium Oświaty", region: "mazowieckie", kind: "html", filter: "school", urls: ["https://www.kuratorium.waw.pl/pl/informacje/aktualnosci"] },
];
