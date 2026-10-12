// EGIDA – raz na dobę pobiera z OpenStreetMap (Overpass) defibrylatory (AED) i szpitale w Polsce
// i zapisuje je jako aed.json oraz hospitals.json (publikowane na gałąź „data” razem z resztą).
//   node medical-sync.mjs --dump   – tylko pokaż statystyki (nic nie zapisuj)
//   node medical-sync.mjs          – zapisz $DATA_DIR/aed.json i hospitals.json
// Dane: © współtwórcy OpenStreetMap, licencja ODbL. Błąd jednego pliku nie psuje drugiego ani poprzedniej kopii.
import { writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { overpassQueryAed, overpassQueryHospitals, parseAed, parseHospitals } from "../js/medical.js";

const MIRRORS = (process.env.OVERPASS_URLS || "https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter").split(",");
const DIR = process.env.DATA_DIR || ".";
const UA = "EGIDA/0.2 (unofficial PWA; daily OSM defibrillator and hospital sync; repo lewym90/egida)";
const dump = process.argv.includes("--dump");

async function overpass(query) {
  for (const u of MIRRORS) {
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA }, body: "data=" + encodeURIComponent(query), signal: AbortSignal.timeout(150000) });
      if (!r.ok) { console.log(u, "→ HTTP", r.status); continue; }
      const j = await r.json();
      if (!Array.isArray(j?.elements)) { console.log(u, "→ nieoczekiwany format"); continue; }
      return j;
    } catch (e) { console.log(u, "→ błąd:", e.message); }
  }
  return null;
}

const jobs = [
  { name: "aed.json", label: "defibrylatorów", min: 500, query: overpassQueryAed(), parse: parseAed },
  { name: "hospitals.json", label: "szpitali", min: 100, query: overpassQueryHospitals(), parse: parseHospitals },
];
let failed = 0;
for (const j of jobs) {
  const json = await overpass(j.query);
  if (!json) { console.log(`${j.name}: żaden serwer Overpass nie odpowiedział – zostaje poprzedni plik.`); failed++; continue; }
  const rows = j.parse(json);
  console.log(`${j.name}: elementów ${json.elements.length}, ${j.label} po filtrach: ${rows.length}`);
  if (dump) { console.log(JSON.stringify(rows.slice(0, 2))); continue; }
  // ochrona przed pustą/uszkodzoną odpowiedzią: nie nadpisuj dobrego pliku
  if (rows.length < j.min) { console.log(`${j.name}: podejrzanie mało wyników (<${j.min}) – nie nadpisuję pliku.`); failed++; continue; }
  const out = join(DIR, j.name);
  const body = JSON.stringify({ at: new Date().toISOString(), source: "OpenStreetMap", license: "ODbL, © współtwórcy OpenStreetMap", count: rows.length, rows });
  writeFileSync(out + ".tmp", body); renameSync(out + ".tmp", out);
  console.log("Zapisano", out, Math.round(body.length / 1024), "kB");
}
process.exit(failed ? 1 : 0);
