// EGIDA – raz na dobę pobiera z OpenStreetMap (Overpass) defibrylatory (AED) i szpitale w Polsce
// i zapisuje je jako aed.json oraz hospitals.json (publikowane na gałąź „data” razem z resztą).
// Pobieramy po 16 prostokątach (siatka 4 × 4) z przerwami i ponownymi próbami – zapytanie „cała Polska” przeciążało serwery Overpass (HTTP 500/504).
// Punkty spoza obrysu Polski (tuż za granicą) są odrzucane.
//   node medical-sync.mjs --dump   – tylko pokaż statystyki (nic nie zapisuj)
//   node medical-sync.mjs          – zapisz $DATA_DIR/aed.json i hospitals.json
// Dane: © współtwórcy OpenStreetMap, licencja ODbL. Błąd (niepełne pobranie) nie nadpisuje poprzednich plików.
import { writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { overpassQueryTile, medicalTiles, parseAed, parseHospitals } from "../js/medical.js";
import { POLAND_RING } from "../js/poland-border.js";
import { pointInRing, distToRingKm } from "../js/geo.js";

const MIRRORS = (process.env.OVERPASS_URLS || "https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter").split(",");
const DIR = process.env.DATA_DIR || ".";
const UA = "EGIDA/0.2 (unofficial PWA; daily OSM defibrillator and hospital sync; repo lewym90/egida)";
const dump = process.argv.includes("--dump");
const PAUSE_MS = Number(process.env.MEDICAL_PAUSE_MS ?? 3000), RETRY_MS = Number(process.env.MEDICAL_RETRY_MS ?? 15000);
const MIN_AED = Number(process.env.MEDICAL_MIN_AED ?? 500), MIN_HOSP = Number(process.env.MEDICAL_MIN_HOSP ?? 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, rounds = 3) {
  for (let round = 0; round < rounds; round++) {
    for (const u of MIRRORS) {
      try {
        const r = await fetch(u, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA }, body: "data=" + encodeURIComponent(query), signal: AbortSignal.timeout(120000) });
        if (!r.ok) { console.log(u.split("/")[2], "→ HTTP", r.status); continue; }
        const j = await r.json();
        if (!Array.isArray(j?.elements)) { console.log(u.split("/")[2], "→ nieoczekiwany format"); continue; }
        return j;
      } catch (e) { console.log(u.split("/")[2], "→ błąd:", e.message); }
    }
    await sleep(RETRY_MS * (round + 1)); // serwery bywają przeciążone – chwila przerwy i kolejna runda
  }
  return null;
}

const inPoland = (r) => { const p = { lat: r[1], lon: r[2] }; return pointInRing(p, POLAND_RING) || distToRingKm(p, POLAND_RING) < 1.5; };
const aed = new Map(), hosp = new Map();
const tiles = medicalTiles();
let failedTiles = 0;
const take = (json) => { const a = parseAed(json), h = parseHospitals(json); for (const r of a) aed.set(r[0], r); for (const r of h) hosp.set(r[0], r); return [a.length, h.length]; };
// Kafelek, którego serwer nie chce oddać (zwykle gęsto zabudowany, np. duże miasto), dzielimy na 4 mniejsze – do dwóch poziomów.
async function fetchTile(t, depth = 0) {
  const json = await overpass(overpassQueryTile(t), depth ? 2 : 3);
  if (json) { const [a, h] = take(json); console.log(`  ${t.join(", ")}: AED ${a}, szpitali ${h}${depth ? " (podkafelek)" : ""}`); await sleep(PAUSE_MS); return true; }
  if (depth >= 2) return false;
  console.log(`  ${t.join(", ")}: brak odpowiedzi – dzielę na 4 części`);
  const [s0, w0, n0, e0] = t, sm = (s0 + n0) / 2, wm = (w0 + e0) / 2;
  let ok = true;
  for (const sub of [[s0, w0, sm, wm], [s0, wm, sm, e0], [sm, w0, n0, wm], [sm, wm, n0, e0]]) if (!(await fetchTile(sub.map((x) => Math.round(x * 1e5) / 1e5), depth + 1))) ok = false;
  return ok;
}
for (const [i, t] of tiles.entries()) {
  console.log(`kafelek ${i + 1}/${tiles.length}`);
  if (!(await fetchTile(t))) failedTiles++;
}
const aedRows = [...aed.values()].filter(inPoland), hospRows = [...hosp.values()].filter(inPoland);
console.log(`Razem w Polsce: AED ${aedRows.length}, szpitali ${hospRows.length}; nieudane kafelki: ${failedTiles}`);
if (dump) { console.log(JSON.stringify(aedRows.slice(0, 2)), JSON.stringify(hospRows.slice(0, 2))); process.exit(0); }
// niepełne pobranie albo podejrzanie mało wyników: nie nadpisuj dobrych plików
if (failedTiles > 0 || aedRows.length < MIN_AED || hospRows.length < MIN_HOSP) { console.log("Pobranie niepełne lub podejrzanie małe – zostają poprzednie pliki."); process.exit(1); }
for (const [name, rows] of [["aed.json", aedRows], ["hospitals.json", hospRows]]) {
  const out = join(DIR, name);
  const body = JSON.stringify({ at: new Date().toISOString(), source: "OpenStreetMap", license: "ODbL, © współtwórcy OpenStreetMap", count: rows.length, rows });
  writeFileSync(out + ".tmp", body); renameSync(out + ".tmp", out);
  console.log("Zapisano", out, Math.round(body.length / 1024), "kB");
}
