// Treści i dane stałe. Każda instrukcja ma: źródło, datę publikacji, datę przeglądu.
// reviewed: null = treść NIE przeszła jeszcze przeglądu merytorycznego (skrypt scripts/check-content.mjs
// w trybie --strict blokuje publikację). Nie ustawiaj daty, dopóki treść nie zostanie sprawdzona.

export const VOIVODESHIPS = [
  { id: "dolnoslaskie", name: "Dolnośląskie", lat: 51.1, lon: 16.6 },
  { id: "kujawsko-pomorskie", name: "Kujawsko-pomorskie", lat: 53.1, lon: 18.5 },
  { id: "lubelskie", name: "Lubelskie", lat: 51.2, lon: 22.9 },
  { id: "lubuskie", name: "Lubuskie", lat: 52.2, lon: 15.2 },
  { id: "lodzkie", name: "Łódzkie", lat: 51.6, lon: 19.5 },
  { id: "malopolskie", name: "Małopolskie", lat: 49.9, lon: 20.2 },
  { id: "mazowieckie", name: "Mazowieckie", lat: 52.5, lon: 21.2 },
  { id: "opolskie", name: "Opolskie", lat: 50.7, lon: 17.9 },
  { id: "podkarpackie", name: "Podkarpackie", lat: 49.9, lon: 22.2 },
  { id: "podlaskie", name: "Podlaskie", lat: 53.3, lon: 22.9 },
  { id: "pomorskie", name: "Pomorskie", lat: 54.1, lon: 18.2 },
  { id: "slaskie", name: "Śląskie", lat: 50.3, lon: 19.0 },
  { id: "swietokrzyskie", name: "Świętokrzyskie", lat: 50.8, lon: 20.8 },
  { id: "warminsko-mazurskie", name: "Warmińsko-mazurskie", lat: 53.8, lon: 20.8 },
  { id: "wielkopolskie", name: "Wielkopolskie", lat: 52.3, lon: 17.3 },
  { id: "zachodniopomorskie", name: "Zachodniopomorskie", lat: 53.5, lon: 15.7 },
];

export const LEGAL_HTML =
  "<b>Ważne.</b> EGIDA to nieoficjalna, bezpłatna aplikacja informacyjna. Nie jest systemem ostrzegania ani poradą medyczną, prawną czy służbową. Dane pochodzą od stron trzecich i mogą być spóźnione, niepełne lub błędne, a aplikacja może działać z przerwami; wszelkie obliczenia (np. czas dolotu, trasa, odległość) są tylko szacunkami. Zawsze kieruj się syrenami, alertami RCB, poleceniami służb i numerem 112; korzystasz z aplikacji na własną odpowiedzialność.";

export const ALERT_FILTERS = [
  { id: "all", label: "Wszystkie" },
  { id: "pogoda", label: "Pogoda" },
  { id: "rcb", label: "Alert RCB" },
  { id: "woda", label: "Woda" },
  { id: "drogi", label: "Drogi" },
];

// --- Plecak i zapasy (podstawa: Poradnik bezpieczeństwa RCB, rcb.gov.pl) ---
// Uproszczenie dla przeciętnego człowieka. Przed publikacją porównać pełną listę z oryginałem RCB.
export const PLECAK = {
  source: "Poradnik bezpieczeństwa RCB (rcb.gov.pl)",
  reviewed: null,
  start: [
    { id: "woda", t: "Woda", d: "Co najmniej 3 litry na osobę na dobę." },
    { id: "jedzenie", t: "Trwałe jedzenie", d: "Konserwy, kasze, makaron, batony – rzeczy, które nie wymagają lodówki." },
    { id: "leki", t: "Leki stałe i apteczka", d: "Twoje leki na kilka dni oraz podstawowe środki opatrunkowe." },
    { id: "dokumenty", t: "Dokumenty, kopie i gotówka", d: "Dowód, kopie ważnych dokumentów (też na pendrivie) i trochę gotówki." },
    { id: "latarka", t: "Latarka, radio na baterie, powerbank", d: "Żeby mieć światło, wiadomości i ładowanie telefonu." },
  ],
  later: [
    { id: "ubranie", t: "Ciepłe ubranie i kurtka", d: "Na zmianę, odpowiednie do pory roku." },
    { id: "koc", t: "Koc termiczny", d: "Lekki, zajmuje mało miejsca." },
    { id: "higiena", t: "Mydło, chusteczki, worki na odpadki", d: "Podstawowa higiena, gdy brakuje wody lub prądu." },
    { id: "baterie", t: "Zapasowe baterie", d: "Do latarki i radia." },
    { id: "ladowarki", t: "Ładowarka i kabel do telefonu", d: "Najlepiej spakowane razem z powerbankiem." },
    { id: "okulary", t: "Zapasowe okulary lub soczewki", d: "Jeśli ich potrzebujesz." },
    { id: "dzieci", t: "Rzeczy dla dzieci i zwierząt", d: "Jedzenie, pieluchy, ulubiona zabawka, karma." },
    { id: "kontakt", t: "Lista numerów telefonów na papierze", d: "Gdy telefon się wyładuje." },
    { id: "mapa", t: "Papierowa mapa okolicy", d: "Nie zależy od zasięgu ani prądu." },
  ],
  zapas: [
    { id: "z_woda", t: "Woda na min. 3 dni", d: "Min. 3 litry na osobę na dobę, razem z napojami do gotowania." },
    { id: "z_jedzenie", t: "Jedzenie na min. 3 dni", d: "Takie, które zjesz bez gotowania lub na jednej kuchence." },
    { id: "z_gotowanie", t: "Sposób na ciepły posiłek", d: "Np. kuchenka turystyczna z zapasem gazu – używaj w dobrze wentylowanym miejscu." },
    { id: "z_leki", t: "Zapas leków stałych", d: "Sprawdzaj daty ważności." },
    { id: "z_swiatlo", t: "Latarki, świeczki-lampiony i baterie", d: "Bezpieczniej latarka niż otwarty ogień." },
    { id: "z_higiena", t: "Higiena i ogrzewanie awaryjne", d: "Papier, mydło, koce, ciepłe ubrania." },
  ],
  dokumenty: [
    { id: "d_dowod", t: "Dowody osobiste i paszporty", d: "Oryginały w jednym, znanym miejscu." },
    { id: "d_kopie", t: "Kopie dokumentów", d: "Papierowe i na pendrivie lub w zabezpieczonej chmurze." },
    { id: "d_ubezp", t: "Polisy i numery kont", d: "Spisane na kartce." },
    { id: "d_zdrowie", t: "Informacja o lekach i chorobach", d: "Kto czego potrzebuje – przydatne ratownikom." },
    { id: "d_kontakty", t: "Numery do rodziny i opiekunów", d: "Także poza Twoim miastem." },
  ],
  note: "Nie musisz kupować sprzętu survivalowego ani telefonu satelitarnego. Chodzi o to, żeby przetrwać kilka dni bez prądu, wody z kranu i sklepu.",
};

// --- Pierwsza pomoc (treść robocza – do zatwierdzenia zgodnie z wytycznymi PRC/ERC 2025) ---
export const FIRST_AID = {
  source: "wytyczne PRC/ERC 2025",
  published: "2026-10-09",
  reviewed: null,
  rko: {
    bpm: 110,
    steps: [
      { t: "Sprawdź reakcję i oddech", d: "Potrząśnij za ramiona i głośno zapytaj, czy wszystko w porządku. Udrożnij drogi oddechowe (odchyl głowę, unieś żuchwę) i do 10 sekund sprawdź, czy poszkodowany oddycha normalnie." },
      { t: "Zadzwoń pod 112", d: "Gdy nie reaguje i nie oddycha normalnie, zadzwoń pod 112 i włącz głośnik. Dyspozytor poprowadzi Cię przez resuscytację. Poproś kogoś o przyniesienie AED." },
      { t: "Uciskaj klatkę piersiową", d: "Środek klatki piersiowej, ręce jedna na drugiej, ramiona wyprostowane. Uciskaj na głębokość ok. 5–6 cm, w tempie 100–120 na minutę. Po 30 uciśnięciach daj 2 oddechy ratownicze. Jeśli nie umiesz lub nie chcesz robić oddechów, uciskaj bez przerwy." },
      { t: "Użyj AED", d: "Gdy tylko ktoś przyniesie defibrylator, włącz go i postępuj zgodnie z poleceniami głosowymi. Nie przerywaj resuscytacji, dopóki AED tego nie każe lub poszkodowany nie zacznie oddychać." },
    ],
  },
  others: [
    { id: "krwotok", t: "Krwotok", steps: ["Zadzwoń pod 112.", "Mocno uciśnij ranę czystym opatrunkiem lub ubraniem i trzymaj nieprzerwanie. Nie odrywaj opatrunku – jeśli przesiąka, połóż kolejny na wierzch.", "Przy krwotoku z kończyny zagrażającym życiu, gdy ucisk nie pomaga, załóż opaskę uciskową, jeśli ją masz i wiesz, jak.", "Ułóż poszkodowanego i okryj go. Nie podawaj jedzenia ani picia."] },
    { id: "zadlawienie", t: "Zadławienie", steps: ["Zachęć przytomnego do kaszlu, jeśli kaszle skutecznie.", "Gdy kaszel jest nieskuteczny: pochyl poszkodowanego i wykonaj do 5 mocnych uderzeń w plecy, między łopatkami.", "Jeśli to nie pomaga: do 5 uciśnięć nadbrzusza (od tyłu, pięść nad pępkiem). Powtarzaj na przemian uderzenia i uciśnięcia.", "Jeśli traci przytomność: zadzwoń pod 112 i zacznij resuscytację."] },
    { id: "oparzenia", t: "Oparzenia", steps: ["Jak najszybciej chłodź oparzone miejsce czystą, chłodną (nie lodowatą) wodą przez ok. 20 minut.", "Zdejmij biżuterię i ubranie, które nie przywiera do skóry.", "Nie smaruj, nie przekłuwaj pęcherzy. Zakryj luźno czystym, najlepiej jałowym opatrunkiem.", "Zadzwoń pod 112 przy oparzeniach dużych, na twarzy, dłoniach, u dzieci lub gdy to oparzenie chemiczne lub prądem."] },
    { id: "udar", t: "Udar", steps: ["Sprawdź: opadnięty kącik ust, osłabienie ręki lub nogi, niewyraźna mowa.", "Natychmiast zadzwoń pod 112 – liczy się każda minuta.", "Zapamiętaj godzinę, o której zaczęły się objawy.", "Nie podawaj jedzenia ani picia. Ułóż poszkodowanego wygodnie i pilnuj go do przyjazdu pogotowia."] },
    { id: "zawal", t: "Zawał serca", steps: ["Objawy: ból lub ucisk w klatce piersiowej, duszność, pot, ból promieniujący do ręki, szyi lub żuchwy.", "Zadzwoń pod 112 i opisz objawy.", "Posadź poszkodowanego wygodnie i uspokój go.", "Leków, np. aspiryny, nie podawaj na własną rękę – zrób to tylko, jeśli zaleci dyspozytor.", "Gdy straci przytomność i nie oddycha normalnie, zacznij resuscytację."] },
    { id: "przytomnosc", t: "Utrata przytomności", steps: ["Sprawdź reakcję i oddech (do 10 sekund).", "Jeśli oddycha normalnie: zadzwoń pod 112, ułóż w pozycji bocznej ustalonej i pilnuj oddechu.", "Jeśli nie oddycha normalnie: zadzwoń pod 112 i zacznij resuscytację (patrz wyżej)."] },
  ],
};

// --- Co robić (treść robocza – do zatwierdzenia; docelowo na podstawie Poradnika bezpieczeństwa RCB) ---
export const WHAT_TO_DO = {
  source: "Poradnik bezpieczeństwa RCB (rcb.gov.pl)",
  published: "2026-10-09",
  reviewed: null,
  items: [
    { id: "alert-rcb", t: "Dostałem Alert RCB", d: "Co zrobić po SMS-ie z Alertem RCB", steps: ["Przeczytaj całą treść alertu i zastosuj się do poleceń.", "Jeśli polecono znaleźć bezpieczne miejsce: wejdź do budynku, najlepiej w głąb, z dala od okien.", "Powiadom bliskich, że jesteś bezpieczny. Sprawdź komunikaty służb.", "Nie blokuj linii: dzwoń pod 112 tylko, gdy ktoś potrzebuje pomocy."] },
    { id: "powodz", t: "Powódź", d: "Gdy woda się podnosi", steps: ["Śledź ostrzeżenia IMGW i komunikaty służb. Zabezpiecz dokumenty i leki.", "Przenieś cenne rzeczy wyżej, odłącz prąd w zalewanych pomieszczeniach.", "Nie wchodź ani nie wjeżdżaj w zalaną wodę.", "Na polecenie służb ewakuuj się, zabierając plecak."] },
    { id: "pozar", t: "Pożar", d: "W domu lub budynku", steps: ["Alarmuj domowników i opuść budynek najkrótszą drogą, zamykając za sobą drzwi.", "Zadzwoń pod 112 już z zewnątrz.", "W dymie poruszaj się nisko przy podłodze. Nie wracaj po rzeczy.", "Windą nie uciekaj."] },
    { id: "brak-pradu", t: "Brak prądu", d: "Dłuższa przerwa w dostawie", steps: ["Użyj latarki, nie świeczek. Sprawdź radio na baterie.", "Ogranicz otwieranie lodówki. Oszczędzaj baterię telefonu.", "Do gotowania i ogrzewania nie używaj grilla ani kuchenki gazowej w zamkniętym pomieszczeniu – grozi zatruciem czadem.", "Sprawdź, jak się mają sąsiedzi, zwłaszcza starsi."] },
    { id: "burza", t: "Burza i silny wiatr", d: "Ostrzeżenie IMGW", steps: ["Zostań w budynku, z dala od okien. Zabezpiecz lub schowaj przedmioty na balkonie i w ogrodzie.", "Nie chowaj się pod pojedynczymi drzewami. W samochodzie zatrzymaj się z dala od drzew i linii.", "Po burzy omijaj zerwane linie energetyczne i połamane drzewa. Zgłoś je pod 112."] },
    { id: "syreny", t: "Usłyszałem syreny", d: "Alarm lub ogłoszenie zagrożenia", steps: ["Włącz radio lub telewizję albo otwórz Alerty w aplikacji. Sam dźwięk syreny nie mówi, co się stało.", "Wejdź do budynku. Przy zagrożeniu z powietrza zejdź do schronu lub piwnicy, a gdy ich nie ma, do pomieszczenia w głębi budynku, z dala od okien.", "Zostań w środku do ogłoszenia odwołania. Odwołanie alarmu to ciągły dźwięk syren (ok. 3 minuty), alarm to dźwięk modulowany.", "Daj znać bliskim, że jesteś bezpieczny, krótką wiadomością. Nie blokuj linii."] },
    { id: "chemia", t: "Wyciek substancji niebezpiecznych", d: "Chmura, zapach, komunikat o skażeniu", steps: ["Wejdź do budynku, zamknij okna i drzwi, wyłącz wentylację i klimatyzację.", "Jeśli jesteś na zewnątrz, opuść zagrożony teren prostopadle do kierunku wiatru. Osłoń usta i nos wilgotną tkaniną.", "Nie pij wody z kranu, jeśli komunikat tak mówi. Nie używaj otwartego ognia.", "Słuchaj komunikatów służb. Na polecenie ewakuuj się, zabierając plecak. W zagrożeniu życia dzwoń 112."] },
    { id: "terror", t: "Atak terrorystyczny lub strzelanina", d: "Napastnik w pobliżu", steps: ["Jeśli możesz bezpiecznie uciec, uciekaj i zabierz innych. Nie zbieraj rzeczy.", "Jeśli nie możesz uciec, ukryj się: zamknij i zablokuj drzwi, wycisz telefon (także wibracje), nie pokazuj się w oknach.", "Gdy możesz zrobić to bezpiecznie, zadzwoń pod 112: podaj, gdzie jesteś, ilu jest napastników i jak wyglądają.", "Gdy przyjadą służby, trzymaj ręce na widoku, nie biegnij w ich stronę i wykonuj polecenia."] },
  ],
};

export const READINESS_QUESTIONS = [
  { id: "q112", t: "Wiem, że w zagrożeniu życia dzwonię pod 112.", link: "#/pierwsza-pomoc" },
  { id: "qalert", t: "Wiem, co zrobić po Alercie RCB.", link: "#/co-robic/alert-rcb" },
  { id: "qwoda", t: "Mam w domu wodę na min. 3 dni (min. 3 l na osobę na dobę).", link: "#/plecak" },
  { id: "qjedzenie", t: "Mam trwałe jedzenie na min. 3 dni.", link: "#/plecak" },
  { id: "qleki", t: "Mam apteczkę i zapas leków stałych.", link: "#/plecak" },
  { id: "qswiatlo", t: "Mam latarkę, radio na baterie i powerbank.", link: "#/plecak" },
  { id: "qdok", t: "Mam kopie ważnych dokumentów i trochę gotówki.", link: "#/plecak" },
  { id: "qplan", t: "Rodzina wie, gdzie się spotkamy i kto do kogo dzwoni.", link: "#/pulpit" },
];

export const SOURCES = [
  { n: "Komunikaty RSO (TVP Technologie)", l: "Dane publiczne", u: "https://komunikaty.tvp.pl", w: "Alerty RCB, ostrzeżenia IMGW, woda, drogi" },
  { n: "Rządowe Centrum Bezpieczeństwa (gov.pl/rcb)", l: "Teksty: CC BY-SA 4.0", u: "https://www.gov.pl/web/rcb", w: "Poradnik bezpieczeństwa, komunikaty" },
  { n: "Polska Rada Resuscytacji / ERC", l: "Wytyczne 2025", u: "https://www.prc.krakow.pl", w: "Pierwsza pomoc (opracowanie własne zgodne z wytycznymi)" },
  { n: "NEPTUN (neptun.in.ua)", l: "Otwarte API, warunki: neptun.in.ua/api-terms. Nieoficjalny agregator, nie system ostrzegania", u: "https://neptun.in.ua", w: "Obserwacje dronów i rakiet nad Ukrainą (mapa, beta, nieoficjalne). Dane: Karta powitryanykh tryvoh — NEPTUN" },
  { n: "Rejestr Punktów Schronienia (MSWiA / Państwowa Straż Pożarna)", l: "Dane publiczne udostępniane przez PSP w pakiecie offline aplikacji „Gdzie się ukryć”. Licencja nie jest określona w repozytorium PSP; do zgody KG PSP: patrz uwagi wydawcy", u: "https://gdziesieukryc.pl", w: "Punkty schronienia (adres, dostępność). EGIDA nie jest aplikacją PSP; dane bywają niepełne lub nieaktualne" },
  { n: "OpenStreetMap", l: "ODbL, © współtwórcy OpenStreetMap", u: "https://www.openstreetmap.org/copyright", w: "Podkład „Mapa” oraz schrony (znaczniki shelter_type i bunker_type = bomb_shelter, dane niezweryfikowane)" },
  { n: "OpenTopoMap", l: "CC-BY-SA 3.0", u: "https://opentopomap.org", w: "Podkład „Teren”" },
  { n: "EOxCloudless (EOX IT Services GmbH)", l: "CC BY-NC-SA 4.0, tylko użytek niekomercyjny. Zawiera zmodyfikowane dane Copernicus Sentinel 2025", u: "https://cloudless.eox.at", w: "Podkład „Satelita”" },
  { n: "Natural Earth", l: "Domena publiczna", u: "https://www.naturalearthdata.com", w: "Uproszczony obrys Polski do szacowania odległości obiektów od granicy (to nie jest granica prawna)" },
  { n: "Państwowy Rejestr Granic (GUGiK)", l: "Dane publiczne GUGiK (dane bez opłat). Używamy wersji uproszczonej (konwersja: ppatrzyk/polska-geojson)", u: "https://www.gov.pl/web/gugik", w: "Granice województw do wskazania województwa z GPS (dokładność ok. 1–2 km, to nie jest granica prawna)" },
  { n: "Telegram", l: "Warunki i polityka prywatności Telegram", u: "https://telegram.org/tos", w: "Prywatne kanały powiadomień „tylko do czytania” (dołączasz z własnego konta Telegram)" },
  { n: "Leaflet", l: "BSD-2-Clause", u: "https://leafletjs.com", w: "Biblioteka mapy (hostowana lokalnie)" },
  { n: "Czcionki: Manrope, Source Sans 3", l: "SIL Open Font License", u: "https://openfontlicense.org", w: "Hostowane lokalnie, bez połączeń z Google" },
];

// --- Tryb zagrożenia (treść robocza – do zatwierdzenia; docelowo na podstawie Poradnika bezpieczeństwa RCB) ---
export const EMERGENCY = {
  source: "Poradnik bezpieczeństwa RCB (rcb.gov.pl)",
  published: "2026-10-10",
  reviewed: null,
  steps: [
    { t: "Schroń się", d: "Wejdź do najbliższego budynku lub schronu. Zostań w środku, najlepiej w głębi budynku, z dala od okien. Nie zostawaj na otwartej przestrzeni." },
    { t: "Sprawdź komunikaty", d: "Włącz radio lub telewizję albo otwórz Alerty w aplikacji. Stosuj się do poleceń służb. Nie wychodź, dopóki nie ogłoszono odwołania zagrożenia." },
    { t: "Daj znać bliskim", d: "Wyślij krótką wiadomość, że jesteś bezpieczny. Nie blokuj linii długimi rozmowami. Numer 112 jest tylko dla zagrożenia życia." },
  ],
};

// --- Polityka prywatności (treść robocza – wymaga przeglądu prawnego; wydawca jest anonimowy) ---
export const PRIVACY = {
  updated: "2026-10-10",
  reviewed: null,
  sections: [
    { h: "Kim jesteśmy", p: ["EGIDA to nieoficjalna, bezpłatna aplikacja informacyjna prowadzona przez osobę prywatną. Nie jest aplikacją żadnego urzędu ani służby i nie zastępuje syren, Alertu RCB ani poleceń służb."] },
    { h: "Co zostaje w Twoim telefonie", p: ["Wybrane województwo, zgody, odhaczone pozycje listy plecaka, wynik testu gotowości, zapisane miejsca (schrony i ważne miejsca), plan rodziny i karty ICE, ostatnio pobrane komunikaty (kopia na wypadek braku internetu) oraz ustawienia wyglądu.", "Te dane są zapisane tylko w pamięci przeglądarki na tym urządzeniu. W Ustawieniach możesz je pobrać do pliku albo usunąć."] },
    { h: "Czego nie robimy", p: ["Nie ma kont, reklam, profilowania ani sprzedaży danych. EGIDA nie prowadzi bazy użytkowników. Twoja pozycja GPS, plan rodziny i karty ICE nie są wysyłane na żaden serwer EGIDY."] },
    { h: "Z kim łączy się Twoja przeglądarka", p: [
      "GitHub (strona aplikacji oraz pliki z komunikatami i punktami schronienia): widzi Twój adres IP i zwykłe dane przeglądarki. Punkty schronienia pobieramy jako kafelki danych obejmujące okolicę ok. 20 km. Nie wysyłamy dokładnej pozycji, ale nazwa kafelka wskazuje przybliżony obszar.",
      "Dostawcy map (OpenStreetMap, OpenTopoMap, EOX): widzą adres IP i obszary, które oglądasz. Łączymy się z nimi dopiero na ekranach z mapą.",
      "NEPTUN (neptun.in.ua): tylko po Twojej zgodzie na warstwę „Obiekty znad Ukrainy”. Serwis widzi Twój adres IP.",
      "Telegram: jeśli dołączysz do kanału, Twoje dane przetwarza Telegram według własnych zasad. Kanały są prywatne i tylko do czytania.",
      "Przyciski „Pieszo” i „Autem” otwierają zewnętrzną aplikację map (domyślnie Mapy Google) z celem trasy.",
      "Anonimowy licznik odwiedzin jest domyślnie wyłączony. Jeśli włączysz go w Ustawieniach (i gdy zostanie skonfigurowany), zlicza wejścia bez cookies i bez identyfikatorów."] },
    { h: "Lokalizacja", p: ["Pozycję GPS ustalamy wyłącznie po Twojej zgodzie (przeglądarka zapyta o pozwolenie). Służy do wskazania województwa i najbliższych schronów, jest używana w telefonie i nie jest wysyłana. W pamięci zostają tylko miejsca, które sam zapiszesz."] },
    { h: "Dane o zdrowiu (karty ICE)", p: ["Karty ICE wypełniasz dobrowolnie. Zostają wyłącznie w tym urządzeniu. Nie wpisuj numeru PESEL, haseł ani numerów kart. Wydruk jest Twoją kopią: chroń go jak dokument.", "Wiadomość „Jestem bezpieczny” wysyłasz sam, swoim komunikatorem lub SMS-em. EGIDA jej nie widzi."] },
    { h: "Twoja kontrola", p: ["Wszystko, co zapisano w aplikacji, możesz pobrać lub usunąć w Ustawieniach („Pobierz dane”, „Usuń dane”). Przycisk „Odśwież aplikację” czyści pamięć podręczną offline i ładuje najnowszą wersję."] },
  ],
};
