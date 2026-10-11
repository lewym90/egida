// Lista źródeł „Ważne w regionie”. Wyłącznie oficjalne instytucje. Dodanie źródła = jeden wpis tutaj (patrz news-report.json, co działa).
// filter: "all" – wszystkie wpisy; "safety" – tylko o bezpieczeństwie; "school" – wąski zestaw (MEN, kuratoria).
// region: id województwa (js/content.js) albo "all" (ogólnopolskie).
const KWP = [
  ["dolnoslaskie", "dolnoslaska"], ["kujawsko-pomorskie", "kujawsko-pomorska"], ["lubelskie", "lubelska"], ["lubuskie", "gorzow"],
  ["lodzkie", "lodzka"], ["malopolskie", "malopolska"], ["mazowieckie", "mazowiecka"], ["opolskie", "opolska"], ["podkarpackie", "podkarpacka"],
  ["podlaskie", "podlaska"], ["pomorskie", "pomorska"], ["slaskie", "slaska"], ["swietokrzyskie", "swietokrzyska"],
  ["warminsko-mazurskie", "warminsko-mazurska"], ["wielkopolskie", "wielkopolska"], ["zachodniopomorskie", "zachodniopomorska"],
];
// Gdy kanał RSS nie daje się znaleźć, czytamy listę „Aktualności” ze strony jednostki (adresy z map serwisów, sprawdzone ręcznie).
const HTML_FALLBACK = { lubelskie: "https://lubelska.policja.gov.pl/lub/aktualnosci", lodzkie: "https://lodzka.policja.gov.pl/ld/informacje",
  opolskie: "https://opolska.policja.gov.pl/op/kwp-opole/aktualnosci", wielkopolskie: "https://wielkopolska.policja.gov.pl/wlk/aktualnosci",
  zachodniopomorskie: "https://zachodniopomorska.policja.gov.pl/sz/aktualnosci", swietokrzyskie: "https://swietokrzyska.policja.gov.pl/kie/dzialania-policji/aktualnosci",
  pomorskie: "https://pomorska.policja.gov.pl/pom/aktualnosci" };
const KWP_NAME = { dolnoslaskie: "Policja Dolnośląska", "kujawsko-pomorskie": "Policja Kujawsko-Pomorska", lubelskie: "Policja Lubelska", lubuskie: "Policja Lubuska",
  lodzkie: "Policja Łódzka", malopolskie: "Policja Małopolska", mazowieckie: "Policja Mazowiecka", opolskie: "Policja Opolska", podkarpackie: "Policja Podkarpacka",
  podlaskie: "Policja Podlaska", pomorskie: "Policja Pomorska", slaskie: "Policja Śląska", swietokrzyskie: "Policja Świętokrzyska",
  "warminsko-mazurskie": "Policja Warmińsko-Mazurska", wielkopolskie: "Policja Wielkopolska", zachodniopomorskie: "Policja Zachodniopomorska" };

export const SOURCES = [
  // Ogólnopolskie (sprawdzone z serwera EGIDA: HTTP 200)
  // Portal policja.pl zbiera wiadomości ze WSZYSTKICH regionów, więc nie wiemy, którego dotyczą: region „mixed” = pokazujemy tylko w zakresie „Wszystkie regiony”.
  { id: "policja-pl", label: "Policja (portal krajowy)", region: "mixed", kind: "rss", filter: "safety", urls: ["https://policja.pl/dokumenty/rss/1-rss-1.rss"] },
  { id: "rcb", label: "Rządowe Centrum Bezpieczeństwa", region: "all", kind: "html", filter: "all", urls: ["https://www.gov.pl/web/rcb/wiadomosci", "https://www.gov.pl/web/rcb"] },
  { id: "men", label: "Ministerstwo Edukacji Narodowej", region: "all", kind: "html", filter: "school", urls: ["https://www.gov.pl/web/edukacja/wiadomosci", "https://www.gov.pl/web/edukacja"] },
  // Województwo: Policja (kanał RSS „Aktualności” wyszukiwany na stronie głównej jednostki)
  ...KWP.map(([region, host]) => ({ id: "kwp-" + region, label: KWP_NAME[region], region, kind: "rss", filter: "safety", discover: `https://${host}.policja.gov.pl/`,
    // Mazowsze: adres sprawdzony ręcznie, używany też, gdyby wyszukiwanie zawiodło.
    htmlFallback: HTML_FALLBACK[region], urls: region === "mazowieckie" ? ["https://mazowiecka.policja.gov.pl/dokumenty/rss/271-rss-o-1488.rss"] : undefined })),
  // Urzędy wojewódzkie i kuratoria (sprawdzone z serwera: HTTP 200)
  { id: "uw-lodzki", label: "Łódzki Urząd Wojewódzki", region: "lodzkie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-lodzki/wiadomosci", "https://www.gov.pl/web/uw-lodzki"] },
  { id: "kuratorium-waw", label: "Mazowieckie Kuratorium Oświaty", region: "mazowieckie", kind: "html", filter: "school", urls: ["https://www.kuratorium.waw.pl/pl/informacje/aktualnosci"] },
];
