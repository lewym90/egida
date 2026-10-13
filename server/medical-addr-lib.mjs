// EGIDA – uzupełnianie adresów i „co to za budynek” dla defibrylatorów (AED) i szpitali na podstawie OpenStreetMap.
// Czysta logika (bez sieci): budowa zapytania Overpass dla paczki punktów, wybór adresu i obiektu z odpowiedzi, pamięć podręczna.
// Dane: © współtwórcy OpenStreetMap, ODbL.

const clean = (v, max = 100) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
const M_LAT = 110540, mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

export const NONAME = "Szpital (brak nazwy w OpenStreetMap)";
export const AED_RADIUS_M = 40, HOSP_RADIUS_M = 120;

/** Zapytanie Overpass dla paczki punktów: budynki/obiekty zawierające punkt (is_in + pivot), adresy w promieniu, nazwane obiekty tuż obok. */
export function buildBatchQuery(targets) {
  const parts = targets.map((t, i) => {
    const p = `${t.lat},${t.lon}`, r = t.r || AED_RADIUS_M;
    return `is_in(${p})->.a${i};way(pivot.a${i})[~"^(building|amenity|shop|office|tourism|leisure|healthcare)$"~"."];rel(pivot.a${i})[~"^(building|amenity|shop|office|tourism|leisure|healthcare)$"~"."];nwr(around:${r},${p})["addr:housenumber"];node(around:15,${p})[name][~"^(amenity|shop|office)$"~"."];`;
  });
  return `[out:json][timeout:120];(${parts.join("")});out tags geom;`;
}

const ptOf = (e) => (Number.isFinite(e.lat) && Number.isFinite(e.lon) ? { lat: e.lat, lon: e.lon } : null);
function ringOf(e) {
  if (Array.isArray(e.geometry) && e.geometry.length >= 3) return { ring: e.geometry.filter((g) => g && Number.isFinite(g.lat)), weak: false };
  const b = e.bounds; // relacje: tylko prostokąt otaczający (przybliżenie)
  if (b && [b.minlat, b.minlon, b.maxlat, b.maxlon].every(Number.isFinite)) return { ring: [{ lat: b.minlat, lon: b.minlon }, { lat: b.minlat, lon: b.maxlon }, { lat: b.maxlat, lon: b.maxlon }, { lat: b.maxlat, lon: b.minlon }], weak: true };
  return null;
}
const inside = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) c = !c; } return c; };
function segDistM(p, a, b) {
  const kx = mLon(p.lat), ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * M_LAT, bx = (b.lon - p.lon) * kx, by = (b.lat - p.lat) * M_LAT;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
const ringDistM = (p, ring) => { if (inside(p, ring)) return 0; let m = Infinity; for (let i = 0; i < ring.length; i++) m = Math.min(m, segDistM(p, ring[i], ring[(i + 1) % ring.length])); return m; };
const areaOf = (ring) => { const lats = ring.map((g) => g.lat), lons = ring.map((g) => g.lon); return (Math.max(...lats) - Math.min(...lats)) * (Math.max(...lons) - Math.min(...lons)); };
const distPt = (p, q) => Math.hypot((q.lon - p.lon) * mLon(p.lat), (q.lat - p.lat) * M_LAT);

const hasAddr = (t) => !!t && !!t["addr:housenumber"] && !!(t["addr:street"] || t["addr:place"]);
export const fmtAddr = (t, city) => {
  const street = [clean(t["addr:street"] || t["addr:place"], 60), clean(t["addr:housenumber"], 15)].filter(Boolean).join(" ");
  const c = clean(t["addr:city"] || city || "", 40);
  return [street, c].filter(Boolean).join(", ");
};

const BUILDING = { apartments: "Budynek mieszkalny", residential: "Budynek mieszkalny", house: "Dom", detached: "Dom", terrace: "Dom szeregowy", dormitory: "Akademik", school: "Szkoła", kindergarten: "Przedszkole", university: "Uczelnia", college: "Uczelnia", hospital: "Szpital", church: "Kościół", chapel: "Kaplica", cathedral: "Kościół", commercial: "Budynek biurowo-usługowy", office: "Budynek biurowy", retail: "Budynek handlowy", supermarket: "Supermarket", industrial: "Zakład / hala", warehouse: "Magazyn", factory: "Zakład produkcyjny", public: "Budynek publiczny", civic: "Budynek publiczny", government: "Urząd", train_station: "Dworzec", sports_hall: "Hala sportowa", stadium: "Stadion", hotel: "Hotel", garage: "Garaż", garages: "Garaże", parking: "Parking", service: "Budynek usługowy", fire_station: "Straż pożarna", transportation: "Obiekt transportowy" };
const AMENITY = { school: "Szkoła", kindergarten: "Przedszkole", university: "Uczelnia", college: "Uczelnia", hospital: "Szpital", clinic: "Przychodnia", doctors: "Gabinet lekarski", dentist: "Gabinet stomatologiczny", pharmacy: "Apteka", townhall: "Urząd miasta / gminy", library: "Biblioteka", fire_station: "Straż pożarna", police: "Policja", post_office: "Poczta", place_of_worship: "Kościół / świątynia", bank: "Bank", restaurant: "Restauracja", cafe: "Kawiarnia", fast_food: "Gastronomia", fuel: "Stacja paliw", community_centre: "Dom kultury", social_facility: "Placówka opieki", theatre: "Teatr", cinema: "Kino", courthouse: "Sąd", bus_station: "Dworzec autobusowy", marketplace: "Targowisko", nursing_home: "Dom opieki", childcare: "Żłobek", arts_centre: "Centrum kultury", public_building: "Budynek publiczny", ferry_terminal: "Port", parking: "Parking", events_venue: "Obiekt widowiskowy", conference_centre: "Centrum konferencyjne", prison: "Zakład karny", gym: "Siłownia" };
const LEISURE = { sports_centre: "Obiekt sportowy", stadium: "Stadion", swimming_pool: "Basen", fitness_centre: "Siłownia", sports_hall: "Hala sportowa", ice_rink: "Lodowisko", pitch: "Boisko", playground: "Plac zabaw" };
const OFFICE = "Biuro", SHOP = { supermarket: "Supermarket", mall: "Centrum handlowe", convenience: "Sklep", department_store: "Dom towarowy", doityourself: "Sklep budowlany" };
const TOUR = { hotel: "Hotel", hostel: "Hostel", guest_house: "Pensjonat", museum: "Muzeum", motel: "Motel", apartment: "Apartamenty" };

const kindOf = (t) => AMENITY[t.amenity] || (t.shop ? SHOP[t.shop] || "Sklep" : "") || (t.office ? OFFICE : "") || LEISURE[t.leisure] || TOUR[t.tourism] || (t.healthcare ? "Placówka medyczna" : "") || "";
/** Etykieta obiektu z tagów: „Rodzaj – nazwa” (np. „Szkoła – Szkoła Podstawowa nr 5”), same nazwa, sam rodzaj albo typ budynku. */
export function objLabel(t) {
  if (!t) return { text: "", score: 0 };
  const name = clean(t.name, 70), kind = kindOf(t), b = t.building && t.building !== "yes" ? BUILDING[t.building] || "" : "";
  if (name && kind) return { text: name.toLowerCase().includes(kind.toLowerCase().split(" ")[0]) ? name : `${kind} – ${name}`, score: 4 };
  if (name) return { text: b && !name.toLowerCase().includes(b.toLowerCase().split(" ")[0]) ? `${b} – ${name}` : name, score: 3 };
  if (kind) return { text: kind, score: 2 };
  if (b) return { text: b, score: 1 };
  return { text: "", score: 0 };
}

/**
 * Z odpowiedzi Overpass wybiera dla punktu t = {lat, lon, r}:
 *  a – adres (budynek zawierający punkt, a jeśli nie ma adresu – najbliższy obiekt z adresem w promieniu r),
 *  d – odległość tego adresu od punktu w metrach (0 = adres budynku, w którym jest punkt),
 *  o – co to za obiekt/budynek (z obiektów zawierających punkt, ewentualnie nazwany obiekt w promieniu 15 m).
 * Zwraca {a, d, o} (pola puste, gdy nie znaleziono).
 */
export function pickAddress(t, elements) {
  const P = { lat: t.lat, lon: t.lon }, R = t.r || AED_RADIUS_M;
  const items = [];
  for (const e of Array.isArray(elements) ? elements : []) {
    const tags = e?.tags && typeof e.tags === "object" ? e.tags : {};
    const g = e.type === "node" ? ptOf(e) : null;
    const rg = e.type === "node" ? null : ringOf(e);
    if (!g && !rg) continue;
    const d = g ? distPt(P, g) : ringDistM(P, rg.ring);
    items.push({ tags, d, g, rg, weak: !!rg?.weak, area: rg ? areaOf(rg.ring) : 0, inside: rg ? d === 0 : false });
  }
  const cont = items.filter((x) => x.rg && x.inside).sort((a, b) => a.weak - b.weak || a.area - b.area);
  // adres
  let a = "", d = 0, addrSrc = null;
  const own = cont.find((x) => hasAddr(x.tags));
  if (own) { addrSrc = own; d = 0; }
  else { const near = items.filter((x) => hasAddr(x.tags) && x.d <= R).sort((p, q) => p.d - q.d)[0]; if (near) { addrSrc = near; d = Math.max(1, Math.round(near.d)); } }
  if (addrSrc) {
    const city = addrSrc.tags["addr:city"] ? "" : (items.filter((x) => x.tags["addr:city"] && x.d <= Math.max(R, 150)).sort((p, q) => p.d - q.d)[0]?.tags["addr:city"] || "");
    a = fmtAddr(addrSrc.tags, city);
  }
  // obiekt
  let best = { text: "", score: 0 };
  for (const x of cont) { const l = objLabel(x.tags); if (l.score > best.score) best = l; }
  if (best.score < 3) { const poi = items.filter((x) => x.g && x.d <= 15 && x.tags.name).sort((p, q) => p.d - q.d)[0]; if (poi) { const l = objLabel(poi.tags); if (l.score > best.score) best = l; } }
  return { a, d: a ? d : 0, o: best.text };
}

/** Wynik z Nominatim (reverse, addressdetails) → adres „Ulica nr, Miasto” albo "". */
export function nominatimAddr(j) {
  const a = j?.address; if (!a) return "";
  const road = a.road || a.pedestrian || a.footway || a.path || a.residential || "", place = a.hamlet || a.village || a.suburb || "";
  const street = road || (a.house_number ? place : "");
  if (!street || !a.house_number) return "";
  const city = a.city || a.town || a.village || a.municipality || a.county || "";
  return [[clean(street, 60), clean(a.house_number, 15)].join(" "), clean(city, 40)].filter(Boolean).join(", ");
}

const ADDR_I = { aed: 7, szpitale: 5 }, D_I = { aed: 14, szpitale: 7 };
/**
 * Dopisuje do wierszy dane z pamięci podręcznej adresów. Wiersze, które już mają własny adres z OSM, go zachowują.
 * Wiersz AED: [..., 7 adres, ..., 13 obiekt, 14 odległość adresu]; wiersz szpitala: [..., 5 adres, 6 telefon, 7 odległość adresu].
 */
export function applyCache(kind, rows, cache) {
  const ai = ADDR_I[kind], di = D_I[kind];
  for (const r of rows) {
    const c = cache?.[r[0]]; if (!c) continue;
    if (!r[ai] && c.a) { r[ai] = c.a; r[di] = c.d || 0; }
    if (kind === "aed" && !r[13] && c.o) r[13] = c.o;
    if (kind === "szpitale" && r[3] === NONAME && r[ai]) r[3] = `Szpital, ${r[ai]}`;
  }
  return rows;
}
export const ADDR_INDEX = ADDR_I;
