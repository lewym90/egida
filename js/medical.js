// Defibrylatory (AED) i szpitale z OpenStreetMap – bez DOM, wspólne dla serwera i aplikacji.
// Serwer (server/medical-sync.mjs) raz na dobę pobiera dane z Overpass i publikuje aed.json oraz hospitals.json na gałęzi „data”.
// Telefon pobiera gotowe pliki (nie pyta OSM o nic) i trzyma kopię na wypadek braku internetu. Dane © współtwórcy OpenStreetMap, ODbL.
// Pozycje w plikach to kompaktowe wiersze (tablice), żeby plik z ok. 15 tys. defibrylatorów był mały.

const clean = (v, max = 160) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const TYPE_LETTER = { node: "n", way: "w", relation: "r" };
const LETTER_TYPE = { n: "node", w: "way", r: "relation" };

export const AED_CACHE = "egida.aed.v1", HOSP_CACHE = "egida.hosp.v1";

/** Zapytania dla całej Polski – używa ich TYLKO serwer (raz na dobę). */
export const overpassQueryAed = () => `[out:json][timeout:150];area["ISO3166-1"="PL"][admin_level=2]->.pl;nwr["emergency"="defibrillator"](area.pl);out center tags;`;
export const overpassQueryHospitals = () => `[out:json][timeout:120];area["ISO3166-1"="PL"][admin_level=2]->.pl;nwr["amenity"="hospital"](area.pl);out center tags;`;

/** Zapytanie dla jednego prostokąta [S, W, N, E]. what: "aed" | "hospitals" | "both". Zapytania po prostokątach są dużo lżejsze dla Overpass niż filtr „cała Polska”. */
export const overpassQueryTile = ([so, we, no, ea], what = "both") => {
  const box = `(${so},${we},${no},${ea})`;
  const parts = [what !== "hospitals" ? `nwr["emergency"="defibrillator"]${box};` : "", what !== "aed" ? `nwr["amenity"="hospital"]${box};` : ""].join("");
  return `[out:json][timeout:90];(${parts});out center tags;`;
};
/** Siatka 4 × 4 pokrywająca Polskę (z zapasem); zagraniczne punkty przy granicy serwer odrzuca obrysem Polski. */
export function medicalTiles(rows = 4, cols = 4, [s, w, n, e] = [48.9, 14.0, 54.95, 24.3]) {
  const out = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) out.push([r5(s + ((n - s) * i) / rows), r5(w + ((e - w) * j) / cols), r5(s + ((n - s) * (i + 1)) / rows), r5(w + ((e - w) * (j + 1)) / cols)]);
  return out;
}

const ACCESS = { yes: "publiczny", public: "publiczny", permissive: "dostępny", customers: "dla klientów", permit: "za zgodą", private: "prywatny (brak wstępu)", no: "zamknięty" };
const isDead = (tags) => Object.keys(tags).some((k) => /^(disused|abandoned|removed|was|razed):/.test(k)) || ["disused", "abandoned", "ruins"].some((k) => tags[k] && tags[k] !== "no");
const addrOf = (t) => [t["addr:street"] || t["addr:place"], t["addr:housenumber"], t["addr:city"]].filter(Boolean).map((x) => clean(x, 40)).join(" ").trim();
const idOf = (e) => `${TYPE_LETTER[e.type] || "n"}${e.id}`;
const posOf = (e) => ({ lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon });
const okPos = ({ lat, lon }) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 48.5 && lat <= 55.5 && lon >= 13.5 && lon <= 24.8;
const dateOf = (t) => { const d = clean(t.check_date || t["check_date:defibrillator"] || t["survey:date"] || "", 12); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""; };
const phoneOf = (t) => { const p = clean(t.phone || t["contact:phone"] || "", 40).split(";")[0].trim(); return /^[+\d][\d ()\-]{4,24}$/.test(p) ? p : ""; };

/** Odpowiedź Overpass → wiersze defibrylatorów [id, lat, lon, nazwa, gdzie, dostęp, godziny, adres, data kontroli, wewnątrz]. */
export function parseAed(json) {
  const out = [], seen = new Set();
  for (const e of Array.isArray(json?.elements) ? json.elements : []) {
    const t = e?.tags && typeof e.tags === "object" ? e.tags : {};
    if (t.emergency !== "defibrillator" || isDead(t)) continue;
    const p = posOf(e); if (!okPos(p)) continue;
    const id = idOf(e); if (seen.has(id)) continue; seen.add(id);
    const acc = clean(t.access, 20).toLowerCase();
    const name = clean(t.name, 80) || (t.operator ? `AED – ${clean(t.operator, 60)}` : "Defibrylator AED");
    const where = clean(t["defibrillator:location:pl"] || t["defibrillator:location"] || t["description:pl"] || t.description || t.note || "", 200);
    out.push([id, r5(p.lat), r5(p.lon), name, where, ACCESS[acc] || "", clean(t.opening_hours, 80), addrOf(t), dateOf(t), t.indoor === "yes" ? 1 : 0]);
  }
  return out;
}

/** Odpowiedź Overpass → wiersze szpitali [id, lat, lon, nazwa, SOR(0/1), adres, telefon]. */
export function parseHospitals(json) {
  const out = [], seen = new Set();
  for (const e of Array.isArray(json?.elements) ? json.elements : []) {
    const t = e?.tags && typeof e.tags === "object" ? e.tags : {};
    if (t.amenity !== "hospital" || isDead(t)) continue;
    const p = posOf(e); if (!okPos(p)) continue;
    const id = idOf(e); if (seen.has(id)) continue; seen.add(id);
    out.push([id, r5(p.lat), r5(p.lon), clean(t.name, 100) || "Szpital (bez nazwy)", t.emergency === "yes" ? 1 : 0, addrOf(t), phoneOf(t)]);
  }
  return out;
}

const osmUrl = (id) => (LETTER_TYPE[id[0]] && /^\d+$/.test(id.slice(1)) ? `https://www.openstreetmap.org/${LETTER_TYPE[id[0]]}/${id.slice(1)}` : "");
const goodPos = (r) => Array.isArray(r) && Number.isFinite(r[1]) && Number.isFinite(r[2]);

/** Wiersz → obiekt w formacie używanym na ekranie (jak schrony: id, lat, lon, name, how, access, hours, addr, osmUrl, src). */
export function unpackAed(r) {
  return { id: String(r[0]), lat: r[1], lon: r[2], name: clean(r[3], 80) || "Defibrylator AED", how: clean(r[4], 200), access: clean(r[5], 40), hours: clean(r[6], 80), addr: clean(r[7], 100), checked: clean(r[8], 12), indoor: r[9] === 1, kind: "aed", src: "osm", osmUrl: osmUrl(String(r[0])) };
}
export function unpackHospital(r) {
  return { id: String(r[0]), lat: r[1], lon: r[2], name: clean(r[3], 100) || "Szpital", sor: r[4] === 1, addr: clean(r[5], 100), phone: clean(r[6], 30), how: "", kind: "szpital", src: "osm", osmUrl: osmUrl(String(r[0])) };
}

/**
 * Pobiera aed.json / hospitals.json i zapisuje kopię w telefonie. kind: "aed" | "szpitale".
 * Zwraca { at, count, items, stale } albo null. Przy błędzie sieci oddaje ostatnią kopię (stale:true).
 */
export async function loadMedicalDb(kind, url, storage = globalThis.localStorage, fetchImpl = (...a) => fetch(...a)) {
  const key = kind === "aed" ? AED_CACHE : HOSP_CACHE, unpack = kind === "aed" ? unpackAed : unpackHospital;
  const build = (j) => { const items = j.rows.filter(goodPos).map(unpack); return { at: clean(j.at, 40), count: items.length, items }; };
  if (url) {
    try {
      const r = await fetchImpl(url + (url.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / 3600000), { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (!j || !Array.isArray(j.rows)) throw new Error("format");
      const db = build(j);
      try { storage?.setItem(key, JSON.stringify({ at: j.at, rows: j.rows })); } catch { /* brak miejsca */ }
      return { ...db, stale: false };
    } catch { /* spróbujemy kopii */ }
  }
  try { const j = JSON.parse(storage?.getItem(key) || "null"); if (j && Array.isArray(j.rows)) return { ...build(j), stale: true }; } catch { /* */ }
  return null;
}
