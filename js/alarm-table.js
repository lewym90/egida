// Tabele stopni alarmowych przepisane z infografiki RCB „Stopnie alarmowe w Polsce” (gov.pl/web/rcb).
// Treść zostawiona wiernie, razem z numeracją punktów i średnikami. Infografiki są obrazkami, więc przy zmianie
// na stronie RCB tabele trzeba zaktualizować ręcznie (dane zarządzeń aplikacja pobiera sama, tabele nie).
export const ALARM_TABLE_REVIEWED = "2026-10-19";
export const ALARM_TABLE_SOURCE = { name: "RCB, infografika „Stopnie alarmowe w Polsce”", url: "https://www.gov.pl/web/rcb/przedluzenie-obowiazywania-stopni-alarmowych-do-30-listopada-2026-r" };

// Kolory pól stopni jak w infografice RCB (stałe, z ciemnym tekstem, czytelne w jasnym i ciemnym motywie).
export const LEVEL_STYLE = {
  ALFA: { bg: "#FFDB5C", ink: "#3B2F00" },
  BRAVO: { bg: "#FDB951", ink: "#3D2600" },
  CHARLIE: { bg: "#FB9A4C", ink: "#3D1D00" },
  DELTA: { bg: "#D0312D", ink: "#FFFFFF" },
};

// Tabela ogólna (zadania dla administracji). complete: false = nie wszystkie wiersze zostały jeszcze przepisane z infografiki.
export const GENERAL_TABLE = {
  complete: false,
  rows: [
    { level: "ALFA", admin: [
      "kontrola skupisk ludności i obiektów użyteczności publicznej;",
      "informowanie służb po zaobserwowaniu podejrzanych zdarzeń;",
      "zachowanie zwiększonej czujności;",
      "dostępność członków personelu do wzmocnienia ochrony obiektów;",
      "kontrola łączności, instalacji alarmowych, dróg ewakuacji i monitoringu.",
    ] },
    { level: "BRAVO", admin: [
      "obowiązek noszenia broni długiej oraz kamizelek kuloodpornych przez Policję, Straż Graniczną i Żandarmerię Wojskową;",
      "kontrole pojazdów, osób oraz budynków publicznych w rejonach zagrożonych;",
      "zapewnienie personelu na wypadek zdarzeń terrorystycznych;",
      "zakaz wstępu dla przedszkoli, szkół i uczelni osobom postronnym;",
      "zamknięcie i zabezpieczenie nieużywanych regularnie budynków i pomieszczeń;",
      "przegląd zapasów i możliwości ich wykorzystania w przypadku zdarzenia terrorystycznego.",
    ] },
    { level: "CHARLIE", admin: [
      "całodobowe dyżury we wskazanych urzędach administracji publicznej;",
      "dyżury dla osób funkcyjnych;",
      "kontrola dostępność obiektów na wypadek ewakuacji;",
      "wydanie broni i amunicji osobom wyznaczonym do wykonywania zadań ochronnych;",
      "całodobowy nadzór nad miejscami nieobjętymi nadzorem.",
    ], partial: true },
    { level: "DELTA", admin: null },
  ],
  citizen: {
    // Kolumna „Zadania obywatela” z infografiki (widoczna jako jedna wspólna komórka obok wierszy tabeli).
    items: [
      "zachowanie czujności;",
      "informowanie służb po zaobserwowaniu podejrzanych zdarzeń;",
      "stosowanie się do poleceń służb.",
    ],
    partial: true,
  },
};

// Tabela CRP (cyberprzestrzeń): zadania dla administracji.
export const CRP_TABLE = {
  complete: true,
  rows: [
    { level: "ALFA-CRP", admin: [
      "monitoring systemów teleinformatycznych;",
      "monitoring naruszeń bezpieczeństwa e-komunikacji;",
      "kontrola dostępności e-usług;",
      "zwiększona czujność personelu;",
      "kontrola kanałów łączności;",
      "przegląd procedur i zadań.",
    ] },
    { level: "BRAVO-CRP", admin: [
      "zwiększenie dyspozycyjności personelu bezpieczeństwa systemów;",
      "całodobowe dyżury administratorów systemów kluczowych.",
    ] },
    { level: "CHARLIE-CRP", admin: [
      "przegląd zasobów do wykorzystania w przypadku obrony;",
      "wdrożenie planów ciągłości działania po wystąpieniu ataku.",
    ] },
    { level: "DELTA-CRP", admin: [
      "uruchomienie planów awaryjnych i przywracanie funkcjonowania;",
    ] },
  ],
};

// Krótkie, własne objaśnienie nazw stopni (nie jest częścią infografiki RCB).
export const LEVEL_LABEL = { ALFA: "I stopień – ALFA", BRAVO: "II stopień – BRAVO", CHARLIE: "III stopień – CHARLIE", DELTA: "IV stopień – DELTA" };
