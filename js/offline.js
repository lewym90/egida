// Tryb „na wypadek braku internetu” – bez DOM. Zapisuje w telefonie punkty schronienia z okolic wskazanych miejsc
// (kafelki PSP w pamięci podręcznej przeglądarki) oraz kopię bazy schronów z OpenStreetMap. Nic nie jest wysyłane na serwer;
// przeglądarka pobiera te same pliki, które i tak pobiera na ekranie Pomoc w pobliżu (schrony, defibrylatory AED, szpitale).
import { loadPspAround, loadShelterDb } from "./shelters.js";
import { loadMedicalDb } from "./medical.js";

const validPos = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat >= 48.5 && p.lat <= 55.5 && p.lon >= 13.5 && p.lon <= 24.8;

/**
 * Wybiera środki obszarów do pobrania: pozycja GPS, ważne miejsca (dom, praca, rodzina), własne miejsca schronienia.
 * Gdy nie ma żadnego z nich, bierze środek wybranego województwa (z większym promieniem). Powtórki (<0,05°) pomijamy. Maks. `max` środków.
 * Zwraca [{ lat, lon, r, label }].
 */
export function offlineCenters({ gps = null, places = [], shelters = [], regionCenter = null } = {}, max = 8) {
  const out = [];
  const add = (p, r, label) => {
    if (!validPos(p) || out.length >= max) return;
    if (out.some((o) => Math.abs(o.lat - p.lat) < 0.05 && Math.abs(o.lon - p.lon) < 0.05)) return;
    out.push({ lat: p.lat, lon: p.lon, r, label });
  };
  add(gps, 2, "Twoja pozycja");
  for (const x of places) add(x, 2, x.name || "Ważne miejsce");
  for (const x of shelters) add(x, 1, x.name || "Własny schron");
  if (!out.length) add(regionCenter, 3, "Środek województwa");
  return out;
}

/**
 * Pobiera dane dla podanych środków. Zwraca { at, centers, tiles, failed, points, shelterDb } – `failed` > 0 oznacza,
 * że część kafelków się nie pobrała (brak sieci lub błąd serwera); wcześniej zapisane kafelki zostają.
 * onProgress({ done, total, label }) – do paska postępu.
 */
export async function downloadOffline({ centers, pspUrl, sheltersUrl, aedUrl = "", aedExtraUrl = "", hospitalsUrl = "", waterUrl = "", cache = null, fetchImpl = (...a) => fetch(...a), storage = globalThis.localStorage, onProgress = () => {}, now = () => new Date() }) {
  const memo = new Map(), ids = new Set();
  let tiles = 0, failed = 0, done = 0;
  const total = centers.length + 1 + (aedUrl ? 1 : 0) + (hospitalsUrl ? 1 : 0) + (waterUrl ? 1 : 0);
  for (const c of centers) {
    onProgress({ done, total, label: c.label });
    const res = await loadPspAround(pspUrl, c.lat, c.lon, { fetchImpl, cache, memo, r: c.r || 2 });
    tiles += res.total; failed += res.failed;
    for (const it of res.items) ids.add(it.id || `${it.lat},${it.lon}`);
    done++;
  }
  onProgress({ done, total, label: "Schrony z OpenStreetMap" });
  const db = await loadShelterDb(sheltersUrl, storage, fetchImpl);
  done++;
  let aed = 0, hospitals = 0, water = 0;
  if (aedUrl) { onProgress({ done, total, label: "Defibrylatory AED" }); const d = await loadMedicalDb("aed", aedUrl, storage, fetchImpl, aedExtraUrl); aed = d && !d.stale ? d.count : 0; done++; }
  if (hospitalsUrl) { onProgress({ done, total, label: "Szpitale" }); const d = await loadMedicalDb("szpitale", hospitalsUrl, storage, fetchImpl); hospitals = d && !d.stale ? d.count : 0; done++; }
  if (waterUrl) { onProgress({ done, total, label: "Woda pitna" }); const d = await loadMedicalDb("woda", waterUrl, storage, fetchImpl); water = d && !d.stale ? d.count : 0; done++; }
  onProgress({ done, total, label: "" });
  return { at: now().toISOString(), centers: centers.length, tiles: memo.size || tiles, failed, points: ids.size, shelterDb: db && !db.stale ? db.count : 0, aed, hospitals, water };
}

/** Jedno zdanie o wyniku, po polsku. */
export function offlineSummary(r) {
  if (!r) return "";
  const parts = [`${r.points} punktów schronienia z okolic ${r.centers} ${r.centers === 1 ? "miejsca" : "miejsc"}`];
  if (r.shelterDb) parts.push(`${r.shelterDb} wpisów z OpenStreetMap`);
  if (r.aed) parts.push(`${r.aed} defibrylatorów AED`);
  if (r.hospitals) parts.push(`${r.hospitals} szpitali`);
  if (r.water) parts.push(`${r.water} punktów wody`);
  return parts.join(", ") + (r.failed ? `. Nie wszystkie obszary udało się pobrać (${r.failed}) – spróbuj ponownie z lepszym zasięgiem.` : ".");
}
