// Defibrylatory potwierdzone osobiście na miejscu, których nie ma (jeszcze) w OpenStreetMap.
// Format wiersza jak w aed.json: [id, lat, lon, nazwa, gdzie, dostęp, godziny, adres, data sprawdzenia, wewnątrz(1/0), operator, piętro, szpital w pobliżu, rodzaj obiektu, odległość adresu].
// Wpis znika z listy automatycznie, gdy w OSM pojawi się defibrylator w promieniu 30 m. Po dopisaniu tutaj warto też dodać punkt w OSM (openaedmap.org).
export const AED_EXTRA = [
  ["x-usk1-onkologia", 51.24993, 22.55887, "AED – Klinika Chirurgii Onkologicznej USK1",
    "Tabliczka w budynku informuje o defibrylatorze. Dokładne miejsce: zapytaj w rejestracji lub u ochrony.",
    "", "", "Radziwiłłowska 13, Lublin", "2026-10-13", 1, "Uniwersytecki Szpital Kliniczny nr 1", "", "", "Szpital – Klinika Chirurgii Onkologicznej", 0],
];
