// Schrony i ukrycia – bez DOM.
//  1) „Moje miejsca”: zapisywane TYLKO w urządzeniu użytkownika (localStorage), działają offline.
//  2) Wyniki z OpenStreetMap (Overpass API): dane społeczności, NIEZWERYFIKOWANE; pytamy tylko o przybliżony obszar.
//  3) Oficjalne źródło to mapa PSP „Gdzie się ukryć” (gdziesieukryc.pl) – do niej odsyłamy, jej danych nie kopiujemy.
import { haversineKm } from "./geo.js";

export const PSP_URL = "https://gdziesieukryc.pl";

/* ---------- Rejestr Punktów Schronienia (MSWiA / PSP): pakiet „gsu-shelters-compact”, dzielony na kafelki ---------- */
// Kafelek 0,2° szerokości × 0,3° długości geograficznej (ok. 22 × 19 km). Ta sama funkcja działa na serwerze i w telefonie.
export const CELL_LAT = 0.2, CELL_LON = 0.3;
export const pspCellId = (lat, lon) => `${Math.floor(lat / CELL_LAT + 1e-9)}_${Math.floor(lon / CELL_LON + 1e-9)}`;
/** Kafelki 3×3 wokół pozycji (pozycja w środkowym). */
export function pspCellsAround(lat, lon, r = 1) {
  const a = Math.floor(lat / CELL_LAT + 1e-9), b = Math.floor(lon / CELL_LON + 1e-9), out = [];
  for (let i = a - r; i <= a + r; i++) for (let j = b - r; j <= b + r; j++) out.push(`${i}_${j}`);
  return out;
}
/** Promień (km), w którym blok kafelków (2r+1)² wokół pozycji pokrywa WSZYSTKIE punkty: odległość od pozycji do najbliższej krawędzi bloku. */
export function guaranteedKm(lat, lon, r = 1) {
  const a = Math.floor(lat / CELL_LAT + 1e-9), b = Math.floor(lon / CELL_LON + 1e-9);
  const kmLat = 111.19, kmLon = 111.19 * Math.cos((lat * Math.PI) / 180);
  const dS = lat - (a - r) * CELL_LAT, dN = (a + r + 1) * CELL_LAT - lat, dW = lon - (b - r) * CELL_LON, dE = (b + r + 1) * CELL_LON - lon;
  return Math.min(dS * kmLat, dN * kmLat, dW * kmLon, dE * kmLon);
}
const inPolandBox = (lat, lon) => lat >= 48.9 && lat <= 55.0 && lon >= 14.0 && lon <= 24.3;
/** Walidacja i podział pakietu PSP na kafelki. Zwraca { tiles: Map(id → rows), count, rejected }. Rzuca błąd przy obcym formacie. */
export function buildPspTiles(ds) {
  if (!ds || ds.format !== "gsu-shelters-compact" || ds.schema !== 1 || !Array.isArray(ds.rows)) throw new Error("Nieoczekiwany format pakietu PSP (format/schema)");
  const tiles = new Map(), seen = new Set(); let rejected = 0;
  for (const r of ds.rows) {
    if (!Array.isArray(r)) { rejected++; continue; }
    const [id, lat, lon, addr, city, avail] = r;
    if (typeof id !== "string" || !Number.isFinite(lat) || !Number.isFinite(lon) || !inPolandBox(lat, lon) || seen.has(id)) { rejected++; continue; }
    seen.add(id);
    const k = pspCellId(lat, lon);
    if (!tiles.has(k)) tiles.set(k, []);
    tiles.get(k).push([id.replace(/^OZO-/, ""), Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, clean(addr, 120), clean(city, 60), clean(avail, 60)]);
  }
  return { tiles, count: seen.size, rejected };
}
/** Wiersz kafelka → obiekt do listy. */
export function pspRowToShelter([id, lat, lon, addr, city, avail]) {
  return { id: "OZO-" + id, lat, lon, name: clean(addr, 120) || (city ? `Punkt schronienia, ${city}` : "Punkt schronienia"), kind: "ukrycie", addr: "", city: clean(city, 60), access: clean(avail, 60), hours: "", capacity: "", level: "", how: "", osmUrl: "", src: "psp" };
}
/** Pobiera kafelki wokół pozycji (równolegle); cache: { get(key) → Promise<obj|null>, set(key, obj) }. Brak kafelka (404) = pusty obszar. */
export async function loadPspAround(baseUrl, lat, lon, { fetchImpl = (...a) => fetch(...a), cache = null, memo = new Map(), r = 1 } = {}) {
  const ids = pspCellsAround(lat, lon, r);
  let failed = 0;
  const res = await Promise.all(ids.map(async (id) => {
    if (memo.has(id)) return memo.get(id);
    let rows = null;
    try {
      const r = await fetchImpl(`${baseUrl}c/${id}.json`, { signal: AbortSignal.timeout(20000) });
      if (r.status === 404) rows = [];
      else if (!r.ok) throw new Error("HTTP " + r.status);
      else { const j = await r.json(); if (!Array.isArray(j?.rows)) throw new Error("format"); rows = j.rows; cache?.set(id, rows); }
    } catch { try { rows = (await cache?.get(id)) ?? null; } catch { rows = null; } if (rows == null) failed++; }
    if (rows != null) memo.set(id, rows);
    return rows || [];
  }));
  return { items: res.flat().map(pspRowToShelter), failed, total: ids.length };
}
/**
 * Szuka punktów w promieniu maxKm: zaczyna od 3×3 kafelków i rozszerza (5×5, 7×7), dopóki 5 najbliższych nie jest PEWNE
 * (tzn. leży w promieniu pokrytym wczytanymi kafelkami) albo nie osiągnięto maxKm. W gęstej zabudowie wystarcza 9 kafelków.
 * Zwraca { items, failed, total, coveredKm, rings }.
 */
export async function loadPspNearest(baseUrl, lat, lon, { maxKm = 50, want = 5, rMax = 3, ...opts } = {}) {
  let res = null, rings = 0;
  const seen = new Set();
  for (let r = 1; r <= rMax; r++) {
    const part = await loadPspAround(baseUrl, lat, lon, { ...opts, r });
    rings = r;
    res = { items: part.items, failed: part.failed, total: part.total };
    const g = guaranteedKm(lat, lon, r);
    const within = part.items.filter((x) => haversineKm({ lat, lon }, x) <= Math.min(g, maxKm)).length;
    if (part.failed > 0 && r === 1) break; // brak sieci/danych: nie mnożymy żądań
    if (within >= want || g >= maxKm) { res.coveredKm = Math.min(g, maxKm); break; }
    res.coveredKm = g;
  }
  return { ...res, rings };
}
/** Pamięć podręczna kafelków w telefonie (Cache API) – działa offline po pierwszym pobraniu okolicy. */
export function makePspCache(baseUrl) {
  if (!globalThis.caches) return null;
  const key = (id) => `${baseUrl}c/${id}.json`;
  return {
    async get(id) { const c = await caches.open("egida-psp"); const r = await c.match(key(id)); return r ? (await r.json()).rows : null; },
    async set(id, rows) { const c = await caches.open("egida-psp"); await c.put(key(id), new Response(JSON.stringify({ rows }))); },
  };
}
/** Łączy PSP z OSM: wpis OSM (często z opisem wejścia) wygrywa z punktem PSP położonym w promieniu 30 m. */
export function mergeSources(psp, osm) {
  const out = [...osm];
  for (const p of psp) if (!osm.some((o) => Math.abs(o.lat - p.lat) < 0.0005 && Math.abs(o.lon - p.lon) < 0.0008 && haversineKm(o, p) < 0.03)) out.push(p);
  return out;
}

const clean = (v, max = 160) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
const r2 = (x) => Math.round(x * 100) / 100;

/** Przybliżony prostokąt [S, W, N, E]: środek zaokrąglony do 0,1°, ±0,1° (ok. 22 × 14 km). Dokładna pozycja nigdzie nie wychodzi. */
export function coarseBbox(lat, lon) {
  const la = Math.round(lat * 10) / 10, lo = Math.round(lon * 10) / 10;
  return [r2(la - 0.1), r2(lo - 0.1), r2(la + 0.1), r2(lo + 0.1)];
}

/** Zapytanie Overpass: schrony przeciwlotnicze wg dwóch znaczników opisanych na wiki OSM. */
export function overpassQuery([s, w, n, e]) {
  const box = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:25];(nwr["amenity"="shelter"]["shelter_type"="bomb_shelter"]${box};nwr["military"="bunker"]["bunker_type"="bomb_shelter"]${box};);out center tags 200;`;
}

/** Zapytanie dla całej Polski – używa go TYLKO serwer (raz na dobę), nie telefony użytkowników. */
export function overpassQueryPoland() {
  return `[out:json][timeout:120];area["ISO3166-1"="PL"][admin_level=2]->.pl;(nwr["amenity"="shelter"]["shelter_type"="bomb_shelter"](area.pl);nwr["military"="bunker"]["bunker_type"="bomb_shelter"](area.pl););out center tags;`;
}

const ACCESS = { yes: "publiczny", public: "publiczny", permissive: "dostępny", customers: "dla klientów", permit: "za zgodą", private: "prywatny (brak wstępu)", no: "zamknięty" };

/** Odpowiedź Overpass → lista obiektów. Pomija wpisy oznaczone jako nieczynne, historyczne, muzealne. */
export function parseOverpass(json) {
  const els = Array.isArray(json?.elements) ? json.elements : [];
  const out = [], seen = new Set();
  for (const e of els) {
    const tags = e?.tags && typeof e.tags === "object" ? e.tags : {};
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (!(Number.isFinite(lat) && Number.isFinite(lon))) continue;
    if (tags.shelter_type !== "bomb_shelter" && tags.bunker_type !== "bomb_shelter") continue;
    const dead = ["disused", "abandoned", "ruins", "historic"].some((k) => tags[k] && tags[k] !== "no") || tags.tourism === "museum" || tags["disused:amenity"] || tags["abandoned:amenity"] || tags["disused:military"];
    if (dead) continue;
    const id = `${e.type}/${e.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const acc = clean(tags.access, 20).toLowerCase();
    out.push({
      id, lat, lon,
      name: clean(tags.name, 80) || "Schron (bez nazwy)",
      access: ACCESS[acc] || "", accessRaw: acc,
      hours: clean(tags.opening_hours, 80), capacity: clean(tags.capacity, 20), level: clean(tags.level, 20),
      note: clean(tags.description || tags.note, 200),
      how: clean(tags["description:pl"] || tags.description || tags.inscription || "", 300),
      addr: [tags["addr:street"], tags["addr:housenumber"], tags["addr:city"]].filter(Boolean).map((x) => clean(x, 40)).join(" ").trim(),
      wheelchair: clean(tags.wheelchair, 10),
      src: "osm",
      osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    });
  }
  return out;
}

/** url: adres serwera Overpass albo lista adresów (próbujemy po kolei, aż któryś odpowie). */
export async function fetchOsmShelters(url, lat, lon, fetchImpl = (...a) => fetch(...a)) {
  const bbox = coarseBbox(lat, lon);
  const urls = Array.isArray(url) ? url : [url];
  let lastErr = null;
  for (const u of urls) {
    try {
      const r = await fetchImpl(u, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(overpassQuery(bbox)), signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error("Serwer OpenStreetMap odpowiedział błędem " + r.status);
      const json = await r.json();
      if (!json || !Array.isArray(json.elements)) throw new Error("Nieoczekiwana odpowiedź serwera OpenStreetMap");
      return { at: new Date().toISOString(), bbox, items: parseOverpass(json) };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Brak serwera OpenStreetMap");
}

/* ---------- baza schronów publikowana przez serwer EGIDA (shelters.json na gałęzi data) ---------- */
export const DB_CACHE = "egida.shdb.v1";
/** Zwraca { at, source, count, items, stale } albo null. Przy błędzie sieci oddaje ostatnią kopię z telefonu (stale:true). */
export async function loadShelterDb(url, storage = globalThis.localStorage, fetchImpl = (...a) => fetch(...a)) {
  const read = () => { try { const j = JSON.parse(storage?.getItem(DB_CACHE) || "null"); return j && Array.isArray(j.items) ? j : null; } catch { return null; } };
  if (url) {
    try {
      const r = await fetchImpl(url + (url.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / 3600000), { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (!j || !Array.isArray(j.items)) throw new Error("format");
      const items = j.items.filter((x) => x && Number.isFinite(x.lat) && Number.isFinite(x.lon)).map((x) => ({
        id: String(x.id ?? ""), lat: x.lat, lon: x.lon, name: clean(x.name, 80) || "Schron (bez nazwy)", kind: x.kind === "ukrycie" ? "ukrycie" : "schron",
        access: clean(x.access, 40), hours: clean(x.hours, 80), capacity: clean(x.capacity, 20), level: clean(x.level, 20),
        how: clean(x.how, 300), addr: clean(x.addr, 100), osmUrl: typeof x.osmUrl === "string" && x.osmUrl.startsWith("https://www.openstreetmap.org/") ? x.osmUrl : "", src: clean(x.src, 20) || "osm",
      }));
      const db = { at: clean(j.at, 40), source: clean(j.source, 80) || "OpenStreetMap", count: items.length, items, stale: false };
      try { storage?.setItem(DB_CACHE, JSON.stringify(db)); } catch { /* brak miejsca */ }
      return db;
    } catch { /* spróbujemy kopii */ }
  }
  const c = read();
  return c ? { ...c, stale: true } : null;
}

/** Najbliższe obiekty z listy (już z odległością), do maxKm. */
export function nearest(list, pos, { maxKm = 60, limit = 25 } = {}) {
  return withDistance(list, pos).filter((s) => s.distKm != null && s.distKm <= maxKm).slice(0, limit);
}

/* ---------- Moje miejsca ---------- */
const validPos = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
export function makeShelter({ name, how, lat, lon }) {
  const n = clean(String(name ?? ""), 60);
  if (!n) return { ok: false, error: "Wpisz nazwę miejsca, np. „Piwnica w bloku”." };
  if (!validPos(lat, lon)) return { ok: false, error: "Wskaż miejsce na mapie albo użyj swojej pozycji." };
  const id = (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  return { ok: true, shelter: { id, name: n, how: clean(String(how ?? ""), 400), lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, addedAt: new Date().toISOString() } };
}

export const withDistance = (list, pos) => list.map((s) => ({ ...s, distKm: pos ? haversineKm(pos, s) : null })).sort((a, b) => (a.distKm ?? 1e9) - (b.distKm ?? 1e9));
/** Czas pieszo: odległość w linii prostej × 1,3 (zakręty) przy 4,5 km/h. To szacunek. */
export const walkMin = (km) => Math.max(1, Math.round(((km * 1.3) / 4.5) * 60));
export const dirUrl = (s, mode) => `https://www.google.com/maps/dir/?api=1&destination=${Number(s.lat).toFixed(6)},${Number(s.lon).toFixed(6)}&travelmode=${mode === "driving" ? "driving" : "walking"}`;
