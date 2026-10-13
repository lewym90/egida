// Lista źródeł „Ważne w regionie”. Instytucje oficjalne oraz uznane media (jako „doniesienia medialne”: sam nagłówek, źródło i link). Dodanie źródła = jeden wpis tutaj (patrz news-report.json, co działa).
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
  pomorskie: "https://pomorska.policja.gov.pl/pom/informacje/wiadomosci" };
const KWP_NAME = { dolnoslaskie: "Policja Dolnośląska", "kujawsko-pomorskie": "Policja Kujawsko-Pomorska", lubelskie: "Policja Lubelska", lubuskie: "Policja Lubuska",
  lodzkie: "Policja Łódzka", malopolskie: "Policja Małopolska", mazowieckie: "Policja Mazowiecka", opolskie: "Policja Opolska", podkarpackie: "Policja Podkarpacka",
  podlaskie: "Policja Podlaska", pomorskie: "Policja Pomorska", slaskie: "Policja Śląska", swietokrzyskie: "Policja Świętokrzyska",
  "warminsko-mazurskie": "Policja Warmińsko-Mazurska", wielkopolskie: "Policja Wielkopolska", zachodniopomorskie: "Policja Zachodniopomorska" };

// Ogólnopolskie portale informacyjne (RSS). Kandydaci adresów: pierwszy działający wygrywa.
const NATIONAL = [
  // 5. element: opcje źródła. polishOnly = kanał dotyczy wyłącznie Polski, więc poważne zdarzenie bez znanej miejscowości trafia do całego kraju.
  ["polsatnews", "Polsat News", ["https://www.polsatnews.pl/rss/polska.xml"], null, { polishOnly: true }],
  ["tvn24", "TVN24", ["https://tvn24.pl/polska.xml", "https://tvn24.pl/najnowsze.xml"], null, { polishOnly: false }],
  ["rmf24", "RMF24", ["https://www.rmf24.pl/fakty/polska/feed", "https://www.rmf24.pl/feed"], null, { polishOnly: true }],
  ["interia", "Interia", ["https://wydarzenia.interia.pl/polska/feed", "https://wydarzenia.interia.pl/feed"], null, { polishOnly: true }],
  // Wirtualna Polska (kanał Wiadomości, RSS 2.0 – sprawdzony 13.10.2026) i Onet (kandydat): portale „z kraju i ze świata”, więc tylko z polskim kontekstem w tytule.
  ["wp", "Wirtualna Polska", ["https://wiadomosci.wp.pl/rss.xml"]],
  ["onet", "Onet Wiadomości", ["https://wiadomosci.onet.pl/.feed"]],
  // Radio ZET i TVP Info: adresy RSS podał użytkownik (12.10.2026). Działanie i zgodność z robots.txt sprawdza serwer przy każdym przebiegu
  // (news-report.json); źródło odrzucone przez robots.txt lub błąd HTTP jest po prostu pomijane.
  ["radiozet", "Radio ZET", ["https://player.radiozet.pl/externals/xml/radio-zet-wiadomosci.xml"]],
  ["tvpinfo", "TVP Info", ["https://www.tvp.info/informacje?xslt=tvp-info/news/rss.xslt"]],
  // Polskie Radio 24: robots.txt zabrania pobierania – pomijamy.
  ["info112", "Info112", ["https://info112.pl/feed/"], null, { polishOnly: true }],
];
// Komendy Wojewódzkie PSP na gov.pl (adresy: gov.pl/web/kwpsp-<miasto>/aktualnosci).
const PSP = [["dolnoslaskie", ["wroclaw"]], ["kujawsko-pomorskie", ["torun", "bydgoszcz"]], ["lubelskie", ["lublin"]], ["lubuskie", ["gorzow", "zielona-gora", "gorzow-wielkopolski"]],
  ["lodzkie", ["lodz"]], ["malopolskie", ["krakow"]], ["mazowieckie", ["warszawa"]], ["opolskie", ["opole"]], ["podkarpackie", ["rzeszow"]], ["podlaskie", ["bialystok"]],
  ["pomorskie", ["gdansk"]], ["slaskie", ["katowice"]], ["swietokrzyskie", ["kielce"]], ["warminsko-mazurskie", ["olsztyn"]], ["wielkopolskie", ["poznan"]], ["zachodniopomorskie", ["szczecin"]]];
const VOIV_NAME = { dolnoslaskie: "dolnośląskie", "kujawsko-pomorskie": "kujawsko-pomorskie", lubelskie: "lubelskie", lubuskie: "lubuskie", lodzkie: "łódzkie", malopolskie: "małopolskie", mazowieckie: "mazowieckie", opolskie: "opolskie", podkarpackie: "podkarpackie", podlaskie: "podlaskie", pomorskie: "pomorskie", slaskie: "śląskie", swietokrzyskie: "świętokrzyskie", "warminsko-mazurskie": "warmińsko-mazurskie", wielkopolskie: "wielkopolskie", zachodniopomorskie: "zachodniopomorskie" };

const RADIO = [
  ["lubelskie", "Radio Lublin", "https://radio.lublin.pl/feed/"], // (sprawdzony)
  ["lodzkie", "Radio Łódź", "https://radiolodz.pl/feed/"], // (sprawdzony)
  ["opolskie", "Radio Opole", "https://radio.opole.pl/rss.php?idp=100"],
  ["podkarpackie", "Polskie Radio Rzeszów", "https://www.radio.rzeszow.pl/feed/"], // (sprawdzony)
  ["pomorskie", "Radio Gdańsk", "https://radiogdansk.pl/feed/"], // (sprawdzony)
  ["swietokrzyskie", "Radio Kielce", "https://radiokielce.pl/feed/"], // (sprawdzony)
  ["warminsko-mazurskie", "Polskie Radio Olsztyn", "https://radioolsztyn.pl/feed/"],
  ["zachodniopomorskie", "Radio Szczecin", "https://radioszczecin.pl/rss.php"], // (sprawdzony)
];

export const SOURCES = [
  // Ogólnopolskie (sprawdzone z serwera EGIDA: HTTP 200)
  // Portal policja.pl zbiera wiadomości ze WSZYSTKICH regionów, więc nie wiemy, którego dotyczą: region „mixed” = pokazujemy tylko w zakresie „Wszystkie regiony”.
  { id: "policja-pl", label: "Policja (portal krajowy)", region: "mixed", kind: "rss", filter: "safety", urls: ["https://policja.pl/dokumenty/rss/1-rss-1.rss"] },
  { id: "rcb", label: "Rządowe Centrum Bezpieczeństwa", region: "all", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/rcb/wiadomosci", "https://www.gov.pl/web/rcb"] },
  { id: "men", label: "Ministerstwo Edukacji Narodowej", region: "all", kind: "html", filter: "school", urls: ["https://www.gov.pl/web/edukacja/wiadomosci", "https://www.gov.pl/web/edukacja"] },
  // Drogi krajowe: oficjalny plik XML GDDKiA (zdarzenia i zamknięcia dróg, z województwem). Źródło: Generalna Dyrekcja Dróg Krajowych i Autostrad.
  { id: "gddkia", label: "GDDKiA (drogi krajowe)", region: "all", kind: "gddkia", filter: "all", noCap: true, urls: ["https://www.archiwum.gddkia.gov.pl/dane/zima_html/utrdane.xml"] },
  // Województwo: Policja (kanał RSS „Aktualności” wyszukiwany na stronie głównej jednostki)
  ...KWP.map(([region, host]) => ({ id: "kwp-" + region, label: KWP_NAME[region], region, kind: "rss", filter: "safety", discover: `https://${host}.policja.gov.pl/`,
    // Mazowsze: adres sprawdzony ręcznie, używany też, gdyby wyszukiwanie zawiodło.
    htmlFallback: HTML_FALLBACK[region], urls: region === "mazowieckie" ? ["https://mazowiecka.policja.gov.pl/dokumenty/rss/271-rss-o-1488.rss"] : undefined })),
  // Doniesienia medialne: regionalne rozgłośnie publiczne (Polskie Radio), po jednej na województwo. Region wynika z samej rozgłośni.
  // Adresy oznaczone „(sprawdzony)” odpowiedziały jako RSS przy sprawdzeniu; pozostałe to kandydaci – o ich działaniu decyduje news-report.json.
// Bez radia: lubuskie (domena Radia Zachód wystawiona na sprzedaż), mazowieckie (brak regionalnej rozgłośni Polskiego Radia), podlaskie (Radio Białystok zabrania pobierania w robots.txt). Te województwa mają Urząd Wojewódzki.
  // Serwer czyta robots.txt rozgłośni i pomija źródło, jeśli zabrania pobierania.
  ...RADIO.map(([region, label, url]) => ({ id: "radio-" + region, label, region, kind: "media", filter: "media", urls: [url] })),
  // Rozgłośnie bez kanału RSS: czytamy listę wiadomości ze strony (wzorzec adresu artykułu sprawdzony na stronie rozgłośni; robots.txt respektowany).
  // Datą wpisu jest moment pierwszego zobaczenia go przez serwer.
  { id: "radio-dolnoslaskie", label: "Polskie Radio Wrocław", region: "dolnoslaskie", kind: "media", filter: "media",
    urls: ["https://www.radiowroclaw.pl/articlesCategories/index/5/dolny-slask", "https://www.radiowroclaw.pl/articlesCategories/index/4/wroclaw"], scrape: { link: "^https://www\\.radiowroclaw\\.pl/articles/view/\\d+/" } },
  { id: "radio-kujawsko-pomorskie", label: "Polskie Radio PiK", region: "kujawsko-pomorskie", kind: "media", filter: "media",
    urls: ["https://www.radiopik.pl/"], scrape: { link: "^https://www\\.radiopik\\.pl/\\d+,\\d+,[a-z0-9-]+" } },
  { id: "radio-malopolskie", label: "Polskie Radio Kraków", region: "malopolskie", kind: "media", filter: "media",
    urls: ["https://www.radiokrakow.pl/aktualnosci/"], scrape: { link: "^https://www\\.radiokrakow\\.pl/aktualnosci/[a-z0-9-]+/[a-z0-9-]+(?:/[a-z0-9-]+)?/?$", deny: "/aktualnosci/(?:sport|kultura)/" } },
  { id: "radio-wielkopolskie", label: "Polskie Radio Poznań", region: "wielkopolskie", kind: "media", filter: "media",
    urls: ["https://radiopoznan.fm/"], scrape: { link: "^https://radiopoznan\\.fm/informacje/[a-z0-9-]+/[a-z0-9-]+", deny: "materialy-sponsorowane|/kultura/|/sport/" } },
  { id: "radio-slaskie", label: "Polskie Radio Katowice", region: "slaskie", kind: "media", filter: "media",
    urls: ["https://www.radio.katowice.pl/"], scrape: { link: "^https://(?:www\\.)?radio\\.katowice\\.pl/zobacz,\\d+," } },
  // WARSTWA 2: portale ogólnopolskie (RSS). Wpis trafia do województwa wymienionego w tytule (miejscowość lub region); zagrożenie krajowe bez miejsca (np. zamach) – do całego kraju.
  // Pokazujemy wyłącznie nagłówek, nazwę źródła i link. Podane adresy to kandydaci: pierwszy, który odpowie i zawiera wpisy, jest używany; robots.txt respektowany; o działaniu decyduje news-report.json.
  ...NATIONAL.map(([id, label, urls, discover, opts]) => ({ id: "media-" + id, label, region: "all", kind: "media", filter: "media", national: true, urls, ...(discover ? { discover } : {}), ...(opts || {}) })),
  // Regionalne portale: Lublin112 (Lubelskie) – cały RSS; wiadomości „z kraju” pomijamy, chyba że dotyczą zagrożenia w Polsce.
  { id: "media-lublin112", label: "Lublin112", region: "lubelskie", kind: "media", filter: "media", local: true, urls: ["https://www.lublin112.pl/feed/"] },
  // WARSTWA 3: Państwowa Straż Pożarna – komendy wojewódzkie (oficjalne, szybsze niż policja przy pożarach, powodziach, wypadkach). Kilka możliwych adresów: pierwszy działający wystarcza.
  ...PSP.map(([region, slugs]) => ({ id: "kwpsp-" + region, label: "Straż Pożarna (KW PSP) – " + (VOIV_NAME[region] || region), region, kind: "html", filter: "safety", urls: slugs.flatMap((x) => [`https://www.gov.pl/web/kwpsp-${x}/aktualnosci`, `https://www.gov.pl/web/kwpsp-${x}/wiadomosci`]) })),
  // Urzędy wojewódzkie i kuratoria (sprawdzone z serwera: HTTP 200)
  // Urzędy wojewódzkie (gov.pl): ostrzeżenia, komunikaty, informacje wojewody. Wiadomości lub strona główna urzędu; o działaniu każdego decyduje news-report.json.
  { id: "uw-dolnoslaski", label: "Dolnośląski Urząd Wojewódzki", region: "dolnoslaskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-dolnoslaski/wiadomosci", "https://www.gov.pl/web/uw-dolnoslaski"] },
  { id: "uw-kujawsko-pomorski", label: "Kujawsko-Pomorski Urząd Wojewódzki", region: "kujawsko-pomorskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-kujawsko-pomorski/wiadomosci", "https://www.gov.pl/web/uw-kujawsko-pomorski"] },
  { id: "uw-lubelski", label: "Lubelski Urząd Wojewódzki", region: "lubelskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-lubelski/wiadomosci", "https://www.gov.pl/web/uw-lubelski"] },
  { id: "uw-lubuski", label: "Lubuski Urząd Wojewódzki", region: "lubuskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-lubuski/wiadomosci", "https://www.gov.pl/web/uw-lubuski"] },
  { id: "uw-malopolski", label: "Małopolski Urząd Wojewódzki", region: "malopolskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-malopolski/wiadomosci", "https://www.gov.pl/web/uw-malopolski"] },
  { id: "uw-mazowiecki", label: "Mazowiecki Urząd Wojewódzki", region: "mazowieckie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-mazowiecki/wiadomosci", "https://www.gov.pl/web/uw-mazowiecki"] },
  { id: "uw-opolski", label: "Opolski Urząd Wojewódzki", region: "opolskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-opolski/wiadomosci", "https://www.gov.pl/web/uw-opolski"] },
  { id: "uw-podkarpacki", label: "Podkarpacki Urząd Wojewódzki", region: "podkarpackie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-podkarpacki/wiadomosci", "https://www.gov.pl/web/uw-podkarpacki"] },
  { id: "uw-podlaski", label: "Podlaski Urząd Wojewódzki", region: "podlaskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-podlaski/wiadomosci", "https://www.gov.pl/web/uw-podlaski"] },
  { id: "uw-pomorski", label: "Pomorski Urząd Wojewódzki", region: "pomorskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-pomorski/wiadomosci", "https://www.gov.pl/web/uw-pomorski"] },
  { id: "uw-slaski", label: "Śląski Urząd Wojewódzki", region: "slaskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-slaski/wiadomosci", "https://www.gov.pl/web/uw-slaski"] },
  { id: "uw-swietokrzyski", label: "Świętokrzyski Urząd Wojewódzki", region: "swietokrzyskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-swietokrzyski/wiadomosci", "https://www.gov.pl/web/uw-swietokrzyski"] },
  { id: "uw-warminsko-mazurski", label: "Warmińsko-Mazurski Urząd Wojewódzki", region: "warminsko-mazurskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-warminsko-mazurski/wiadomosci", "https://www.gov.pl/web/uw-warminsko-mazurski"] },
  { id: "uw-wielkopolski", label: "Wielkopolski Urząd Wojewódzki", region: "wielkopolskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-wielkopolski/wiadomosci", "https://www.gov.pl/web/uw-wielkopolski"] },
  { id: "uw-zachodniopomorski", label: "Zachodniopomorski Urząd Wojewódzki", region: "zachodniopomorskie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-zachodniopomorski/wiadomosci", "https://www.gov.pl/web/uw-zachodniopomorski"] },
  { id: "uw-lodzki", label: "Łódzki Urząd Wojewódzki", region: "lodzkie", kind: "html", filter: "safety", urls: ["https://www.gov.pl/web/uw-lodzki/wiadomosci", "https://www.gov.pl/web/uw-lodzki"] },
  { id: "kuratorium-waw", label: "Mazowieckie Kuratorium Oświaty", region: "mazowieckie", kind: "html", filter: "school", urls: ["https://www.kuratorium.waw.pl/pl/informacje/aktualnosci"] },
];
