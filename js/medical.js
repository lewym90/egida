// Defibrylatory (AED) i szpitale z OpenStreetMap – bez DOM, wspólne dla serwera i aplikacji.
// Serwer (server/medical-sync.mjs) raz na dobę pobiera dane z Overpass i publikuje aed.json oraz hospitals.json na gałęzi „data”.
// Telefon pobiera gotowe pliki (nie pyta OSM o nic) i trzyma kopię na wypadek braku internetu. Dane © współtwórcy OpenStreetMap, ODbL.
// Pozycje w plikach to kompaktowe wiersze (tablice), żeby plik z ok. 15 tys. defibrylatorów był mały.

import { haversineKm } from "./geo.js";

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
const addrOf = (t) => { const street = [t["addr:street"] || t["addr:place"], t["addr:housenumber"]].filter(Boolean).map((x) => clean(x, 40)).join(" ").trim(); return [street, clean(t["addr:city"] || "", 40)].filter(Boolean).join(", "); };
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
    const operator = clean(t.operator || t["operator:short"] || "", 60);
    const name = clean(t.name || t["name:pl"] || "", 80) || (operator ? `AED – ${operator}` : "Defibrylator AED");
    const where = clean(t["defibrillator:location:pl"] || t["defibrillator:location"] || t["description:pl"] || t.description || t["location:pl"] || t.note || "", 200);
    out.push([id, r5(p.lat), r5(p.lon), name, where, ACCESS[acc] || "", clean(t.opening_hours, 80), addrOf(t), dateOf(t), t.indoor === "yes" ? 1 : 0, operator, clean(t.level, 12), "", "", 0]);
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
    const name = clean(t.name || t["name:pl"] || t.official_name || t.short_name || t.alt_name || t.loc_name || "", 100) || (t.operator ? `Szpital – ${clean(t.operator, 70)}` : "");
    out.push([id, r5(p.lat), r5(p.lon), name, t.emergency === "yes" ? 1 : 0, addrOf(t), phoneOf(t), 0]);
  }
  return out;
}

const NONAME_OLD = "Szpital (bez nazwy)"; export const NONAME = "Szpital (brak nazwy w OpenStreetMap)";
const normName = (n) => n.toLowerCase().replace(/[^a-ząćęłńóśźż0-9]+/g, " ").trim();
/**
 * Porządkuje szpitale: wpis bez nazwy dostaje adres jako nazwę; budynek bez nazwy i adresu tuż obok nazwanego szpitala
 * (to zwykle część tego samego kompleksu) jest pomijany; ten sam szpital wpisany kilka razy (< 600 m) zostaje raz – z najpełniejszymi danymi.
 * Działa i na serwerze, i w telefonie (starsze pliki też zostaną uporządkowane).
 */
export function tidyHospitalRows(rows) {
  const named = rows.filter((r) => r[3] && r[3] !== NONAME_OLD && r[3] !== NONAME);
  const score = (r) => (r[4] ? 4 : 0) + (r[6] ? 2 : 0) + (r[5] ? 1 : 0);
  const kept = [];
  for (const r of rows) {
    const x = r.slice();
    if (!x[3] || x[3] === NONAME_OLD || x[3] === NONAME) {
      if (x[5]) x[3] = `Szpital, ${x[5]}`;
      else if (named.some((n) => haversineKm({ lat: n[1], lon: n[2] }, { lat: x[1], lon: x[2] }) < 0.4)) continue;
      else x[3] = NONAME;
    }
    kept.push(x);
  }
  const out = [];
  for (const x of kept.sort((a, b) => score(b) - score(a))) {
    const key = normName(x[3]);
    if (out.some((y) => normName(y[3]) === key && haversineKm({ lat: y[1], lon: y[2] }, { lat: x[1], lon: x[2] }) < 0.6)) continue;
    out.push(x);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
/** Dopisuje do defibrylatorów (pole 12) najbliższy nazwany szpital w promieniu 250 m – informacja „w pobliżu”, nie „na terenie”. */
export function addNearHospital(aedRows, hospRows, maxKm = 0.25) {
  const hs = hospRows.filter((h) => h[3] && h[3] !== NONAME && h[3] !== NONAME_OLD && !h[3].startsWith("Szpital,"));
  for (const a of aedRows) {
    let best = null, bd = maxKm;
    for (const h of hs) { if (Math.abs(h[1] - a[1]) > 0.0035) continue; const d = haversineKm({ lat: h[1], lon: h[2] }, { lat: a[1], lon: a[2] }); if (d < bd) { bd = d; best = h; } }
    a[12] = best ? `${best[3]} (ok. ${Math.max(10, Math.round((bd * 1000) / 10) * 10)} m)` : "";
  }
  return aedRows;
}

const osmUrl = (id) => (LETTER_TYPE[id[0]] && /^\d+$/.test(id.slice(1)) ? `https://www.openstreetmap.org/${LETTER_TYPE[id[0]]}/${id.slice(1)}` : "");
const goodPos = (r) => Array.isArray(r) && Number.isFinite(r[1]) && Number.isFinite(r[2]);

/** Wiersz → obiekt w formacie używanym na ekranie (jak schrony: id, lat, lon, name, how, access, hours, addr, osmUrl, src). */
export function unpackAed(r) {
  return { id: String(r[0]), lat: r[1], lon: r[2], name: clean(r[3], 80) || "Defibrylator AED", how: clean(r[4], 200), access: clean(r[5], 40), hours: clean(r[6], 80), addr: clean(r[7], 100), checked: clean(r[8], 12), indoor: r[9] === 1, operator: clean(r[10], 60), level: clean(r[11], 12), near: clean(r[12], 120), obj: clean(r[13], 100), addrD: Number.isFinite(r[14]) ? r[14] : 0, kind: "aed", src: "osm", osmUrl: osmUrl(String(r[0])) };
}
export function unpackHospital(r) {
  return { id: String(r[0]), lat: r[1], lon: r[2], name: clean(r[3], 100) || NONAME, sor: r[4] === 1, addr: clean(r[5], 100), addrD: Number.isFinite(r[7]) ? r[7] : 0, phone: clean(r[6], 30), how: "", kind: "szpital", src: "osm", osmUrl: osmUrl(String(r[0])) };
}

/**
 * Pobiera aed.json / hospitals.json i zapisuje kopię w telefonie. kind: "aed" | "szpitale".
 * Zwraca { at, count, items, stale } albo null. Przy błędzie sieci oddaje ostatnią kopię (stale:true).
 */
export async function loadMedicalDb(kind, url, storage = globalThis.localStorage, fetchImpl = (...a) => fetch(...a)) {
  const key = kind === "aed" ? AED_CACHE : HOSP_CACHE, unpack = kind === "aed" ? unpackAed : unpackHospital;
  const build = (j) => { const good = j.rows.filter(goodPos), items = (kind === "aed" ? good : tidyHospitalRows(good)).map(unpack); return { at: clean(j.at, 40), count: items.length, items }; };
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
