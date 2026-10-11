// EGIDA – skumulowany raport „co NEPTUN kiedykolwiek pokazał”: wszystkie widziane typy obiektów, pola, wartości pól
// wyliczeniowych oraz pierwsze próbki rzadkich rekordów (z torem „trail”, z prędkością, grupowe, tylko obszar itd.).
// W odróżnieniu od neptun-schema.json (migawka z ostatniej chwili) ten plik tylko ROŚNIE, więc po kilku dniach zawiera
// pełną listę typów i prawdziwą strukturę „trail”. Zasilają go: obserwator (co 10 s) i sonda formatu (co ~30 min).
// Plik jest mały (limity poniżej), bez danych osobowych (NEPTUN ich nie podaje).
import { readFileSync, writeFileSync, renameSync } from "node:fs";

export const SEEN_LIMITS = { types: 40, fields: 80, enumValues: 30, tags: 40, perTag: 2, wsTypes: 20, sampleChars: 700 };
const ENUM_FIELDS = ["type", "status", "lifecycle", "positionQuality", "confidenceLevel", "displayConfidence"];

const clip = (v, d = 0) => {
  if (typeof v === "string") return v.length > 160 ? v.slice(0, 160) + "…" : v;
  if (Array.isArray(v)) return d > 3 ? "[…]" : v.slice(0, 6).map((x) => clip(x, d + 1));
  if (v && typeof v === "object") return d > 3 ? "{…}" : Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, clip(x, d + 1)]));
  return v;
};
const fit = (v) => { // próbka nie większa niż sampleChars po serializacji
  const s = JSON.stringify(clip(v));
  return s.length <= SEEN_LIMITS.sampleChars ? JSON.parse(s) : { "…": s.slice(0, SEEN_LIMITS.sampleChars) };
};
const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const empty = (nowIso) => ({ since: nowIso, updatedAt: nowIso, runs: 0, records: 0, types: {}, enums: {}, fields: {}, samples: {}, ws: {} });

/** Tagi rzadkich rekordów: dla każdego trzymamy do perTag pierwszych próbek (nigdy ich nie nadpisujemy). */
export function tagsOf(t) {
  const tags = [];
  if (Array.isArray(t.trail) ? t.trail.length : t.trail != null && t.trail !== false) tags.push("trail");
  if (t.velocity != null || t.speedKmh != null || t.speed != null) tags.push("speed");
  if (t.count > 1) tags.push("count>1");
  if (t.areaOnly === true) tags.push("areaOnly");
  if (t.advisory === true) tags.push("advisory");
  if (t.status && t.status !== "active") tags.push("status:" + String(t.status).slice(0, 20));
  if (t.type != null) tags.push("type:" + String(t.type).slice(0, 30));
  return tags;
}

/**
 * Dolicza do raportu `prev` listę surowych rekordów (`threats`) oraz ramki WebSocket (`wsFrames`: [{type, keys, sample}]).
 * Zwraca NOWY obiekt (prev nie jest zmieniany). Funkcja czysta: łatwa do przetestowania.
 */
export function mergeSeen(prev, threats = [], wsFrames = [], nowIso = new Date().toISOString()) {
  const L = SEEN_LIMITS;
  const s = prev && typeof prev === "object" && prev.types ? structuredClone(prev) : empty(nowIso);
  s.updatedAt = nowIso; s.runs = (s.runs || 0) + 1;
  for (const t of Array.isArray(threats) ? threats : []) {
    if (!t || typeof t !== "object") continue;
    s.records++;
    const ty = String(t.type ?? "(brak)").slice(0, 30);
    const e = s.types[ty];
    if (e) { e.count++; e.lastSeen = nowIso; }
    else if (Object.keys(s.types).length < L.types) s.types[ty] = { count: 1, firstSeen: nowIso, lastSeen: nowIso };
    for (const [k, v] of Object.entries(t)) {
      const f = s.fields[k];
      if (f) { f.count++; const tn = typeOf(v); if (!f.types.includes(tn)) f.types.push(tn); }
      else if (Object.keys(s.fields).length < L.fields) s.fields[k] = { count: 1, types: [typeOf(v)], firstSeen: nowIso };
    }
    for (const k of ENUM_FIELDS) {
      if (t[k] == null) continue;
      const bucket = (s.enums[k] ||= {});
      const val = String(t[k]).slice(0, 30);
      if (bucket[val]) bucket[val].count++;
      else if (Object.keys(bucket).length < L.enumValues) bucket[val] = { count: 1, firstSeen: nowIso };
    }
    for (const tag of tagsOf(t)) {
      const list = s.samples[tag];
      if (list) { if (list.length < L.perTag) list.push({ at: nowIso, record: fit(t) }); }
      else if (Object.keys(s.samples).length < L.tags) s.samples[tag] = [{ at: nowIso, record: fit(t) }];
    }
  }
  for (const fr of Array.isArray(wsFrames) ? wsFrames : []) {
    const ty = String(fr?.type ?? "(brak)").slice(0, 30);
    const e = s.ws[ty];
    if (e) { e.count++; e.lastSeen = nowIso; }
    else if (Object.keys(s.ws).length < L.wsTypes) s.ws[ty] = { count: 1, firstSeen: nowIso, lastSeen: nowIso, keys: Array.isArray(fr?.keys) ? fr.keys.slice(0, 20) : [], sample: fit(fr?.sample ?? null) };
  }
  return s;
}

export function loadSeen(file) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } }
/** Zapis atomowy (plik tymczasowy + rename), bo piszą do niego dwa procesy (obserwator i sonda). */
export function saveSeen(file, seen) { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(seen, null, 1)); renameSync(tmp, file); }
