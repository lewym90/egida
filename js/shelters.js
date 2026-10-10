// Schrony i ukrycia – bez DOM.
//  1) „Moje miejsca”: zapisywane TYLKO w urządzeniu użytkownika (localStorage), działają offline.
//  2) Wyniki z OpenStreetMap (Overpass API): dane społeczności, NIEZWERYFIKOWANE; pytamy tylko o przybliżony obszar.
//  3) Oficjalne źródło to mapa PSP „Gdzie się ukryć” (gdziesieukryc.pl) – do niej odsyłamy, jej danych nie kopiujemy.
import { haversineKm } from "./geo.js";

export const PSP_URL = "https://gdziesieukryc.pl";

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
