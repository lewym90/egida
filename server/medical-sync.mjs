// EGIDA – raz na dobę pobiera z OpenStreetMap (Overpass) defibrylatory (AED) i szpitale w Polsce
// i zapisuje je jako aed.json oraz hospitals.json (publikowane na gałąź „data” razem z resztą).
// Pobieramy po 16 prostokątach (siatka 4 × 4) z przerwami i ponownymi próbami – zapytanie „cała Polska” przeciążało serwery Overpass (HTTP 500/504).
// Punkty spoza obrysu Polski (tuż za granicą) są odrzucane.
//   node medical-sync.mjs --dump   – tylko pokaż statystyki (nic nie zapisuj)
//   node medical-sync.mjs          – zapisz $DATA_DIR/aed.json i hospitals.json
// Dane: © współtwórcy OpenStreetMap, licencja ODbL. Błąd (niepełne pobranie) nie nadpisuje poprzednich plików.
import { writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { overpassQueryTile, medicalTiles, parseAed, parseHospitals, tidyHospitalRows, addNearHospital } from "../js/medical.js";
import { applyCache } from "./medical-addr-lib.mjs";
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
const only = (process.argv.find((x) => x.startsWith("--only=")) || "").slice(7); // aed | hospitals | (puste = oba)
// Szpitali jest niewiele, więc pobieramy je osobno i najpierw – plik hospitals.json powstaje nawet wtedy, gdy ciężki import defibrylatorów się nie uda (i odwrotnie).
const JOBS = [
  { what: "hospitals", file: "hospitals.json", label: "szpitali", min: MIN_HOSP, parse: parseHospitals },
  { what: "aed", file: "aed.json", label: "defibrylatorów", min: MIN_AED, parse: parseAed },
].filter((j) => !only || j.what === only);
let exitCode = 0;
for (const job of JOBS) {
  const rows = new Map();
  // Kafelek, którego serwer nie chce oddać (zwykle gęsto zabudowany, np. duże miasto), dzielimy na 4 mniejsze – do dwóch poziomów.
  async function fetchTile(t, depth = 0) {
    const json = await overpass(overpassQueryTile(t, job.what), depth ? 2 : 3);
    if (json) { const got = job.parse(json); for (const r of got) rows.set(r[0], r); console.log(`  ${t.join(", ")}: ${job.label} ${got.length}${depth ? " (podkafelek)" : ""}`); await sleep(PAUSE_MS); return true; }
    if (depth >= 2) return false;
    console.log(`  ${t.join(", ")}: brak odpowiedzi – dzielę na 4 części`);
    const [s0, w0, n0, e0] = t, sm = (s0 + n0) / 2, wm = (w0 + e0) / 2;
    let ok = true;
    for (const sub of [[s0, w0, sm, wm], [s0, wm, sm, e0], [sm, w0, n0, wm], [sm, wm, n0, e0]]) if (!(await fetchTile(sub.map((x) => Math.round(x * 1e5) / 1e5), depth + 1))) ok = false;
    return ok;
  }
  const tiles = medicalTiles();
  let failedTiles = 0;
  console.log(`== ${job.label}`);
  for (const [i, t] of tiles.entries()) { console.log(`kafelek ${i + 1}/${tiles.length}`); if (!(await fetchTile(t))) failedTiles++; }
  let list = [...rows.values()].filter(inPoland);
  if (job.what === "hospitals") list = tidyHospitalRows(list);
  if (job.what === "aed") { try { addNearHospital(list, JSON.parse(readFileSync(join(DIR, "hospitals.json"), "utf8")).rows); } catch { /* brak szpitali – pole „w pobliżu” zostaje puste */ } }
  console.log(`Razem w Polsce: ${job.label} ${list.length}; nieudane kafelki: ${failedTiles}`);
  if (dump) { console.log(JSON.stringify(list.slice(0, 2))); continue; }
  // niepełne pobranie albo podejrzanie mało wyników: nie nadpisuj dobrego pliku
  if (failedTiles > 0 || list.length < job.min) { console.log(`${job.file}: pobranie niepełne lub podejrzanie małe – zostaje poprzedni plik.`); exitCode = 1; continue; }
  try { applyCache(job.what === "aed" ? "aed" : "szpitale", list, JSON.parse(readFileSync(process.env.ADDR_CACHE || join(DIR, "..", "addr-cache.json"), "utf8"))); } catch { /* brak pamięci adresów – uzupełni medical-addr.mjs */ }
  const out = join(DIR, job.file);
  const body = JSON.stringify({ at: new Date().toISOString(), source: "OpenStreetMap", license: "ODbL, © współtwórcy OpenStreetMap", count: list.length, rows: list });
  writeFileSync(out + ".tmp", body); renameSync(out + ".tmp", out);
  console.log("Zapisano", out, Math.round(body.length / 1024), "kB");
}
process.exit(exitCode);
