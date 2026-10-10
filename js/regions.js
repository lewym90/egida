// Województwo z pozycji GPS na podstawie uproszczonych granic (PRG / GUGiK). Czysta logika, bez DOM.
// Granice są uproszczone (rzędu 1–2 km), więc przy granicy województw zawsze zaznaczamy, że wynik trzeba sprawdzić.
import { pointInRing, distToRingKm } from "./geo.js";

let cache = null; // { id: [{ ring: [[lon, lat], …], bbox: [minLon, minLat, maxLon, maxLat] }] }

/** Ładuje dane granic (ok. 130 KB) dopiero przy pierwszym użyciu. */
export async function loadRegions() {
  if (cache) return cache;
  const { REGION_RINGS } = await import("./regions-data.js");
  cache = prepare(REGION_RINGS);
  return cache;
}

export function prepare(rings) {
  const out = {};
  for (const [id, polys] of Object.entries(rings)) {
    out[id] = polys.map((flat) => {
      const ring = []; let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
      for (let i = 0; i < flat.length; i += 2) { const lon = flat[i], lat = flat[i + 1]; ring.push([lon, lat]); if (lon < a) a = lon; if (lon > c) c = lon; if (lat < b) b = lat; if (lat > d) d = lat; }
      return { ring, bbox: [a, b, c, d] };
    });
  }
  return out;
}

const inBox = (p, bb, padDeg = 0) => p.lon >= bb[0] - padDeg && p.lon <= bb[2] + padDeg && p.lat >= bb[1] - padDeg && p.lat <= bb[3] + padDeg;
const distTo = (p, parts) => Math.min(...parts.filter((x) => inBox(p, x.bbox, 0.6)).map((x) => distToRingKm(p, x.ring)), Infinity);

/**
 * Wskazuje województwo dla pozycji.
 * Zwraca { id, borderKm, neighbor } albo null (pozycja dalej niż 15 km od granic Polski).
 * borderKm = odległość do najbliższego innego województwa, neighbor = jego id (gdy borderKm < 10).
 */
export function regionAt(lat, lon, regions) {
  const p = { lat, lon };
  let found = null;
  for (const [id, parts] of Object.entries(regions)) {
    if (parts.some((x) => inBox(p, x.bbox) && pointInRing(p, x.ring))) { found = id; break; }
  }
  if (!found) {
    // Tuż poza uproszczonym obrysem (np. wybrzeże, błąd uproszczenia): najbliższe województwo, jeśli bardzo blisko.
    let best = null, bd = Infinity;
    for (const [id, parts] of Object.entries(regions)) { const d = distTo(p, parts); if (d < bd) { bd = d; best = id; } }
    if (best && bd <= 15) return { id: best, borderKm: 0, neighbor: null, outside: true };
    return null;
  }
  // Odległość do najbliższego INNEGO województwa (granica państwa i wybrzeże nie są tu ostrzeżeniem).
  let neighbor = null, nd = Infinity;
  for (const [id, parts] of Object.entries(regions)) { if (id === found) continue; const d = distTo(p, parts); if (d < nd) { nd = d; neighbor = id; } }
  return { id: found, borderKm: Number.isFinite(nd) ? Math.round(nd * 10) / 10 : null, neighbor: nd < 10 ? neighbor : null };
}

/** Wygodny skrót: ładuje granice i wskazuje województwo. */
export async function regionFromGps(lat, lon) { return regionAt(lat, lon, await loadRegions()); }

/** Czy wynik jest „blisko granicy” (wymaga ostrzeżenia dla użytkownika). */
export const nearBorder = (r, km = 5) => !!r && (r.outside === true || (Number.isFinite(r.borderKm) && r.borderKm < km));
