// EGIDA – raz na dobę pobiera z OpenStreetMap (Overpass) wszystkie schrony przeciwlotnicze w Polsce
// i zapisuje je jako shelters.json (publikowany razem z alerts.json na gałąź „data”).
// Dzięki temu telefony użytkowników nie odpytują OSM, a aplikacja działa także, gdy Overpass chwilowo nie odpowiada.
//   node shelters-sync.mjs --dump   – tylko pokaż statystyki (nic nie zapisuj)
//   node shelters-sync.mjs          – zapisz $DATA_DIR/shelters.json
// Dane: © współtwórcy OpenStreetMap, licencja ODbL (atrybucja jest w aplikacji i w pliku).
import { writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { overpassQueryPoland, parseOverpass } from "../js/shelters.js";

const MIRRORS = (process.env.OVERPASS_URLS || "https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter").split(",");
const OUT = process.env.SHELTERS_OUT || join(process.env.DATA_DIR || ".", "shelters.json");
const UA = "EGIDA/0.2 (unofficial PWA; daily OSM shelter sync; repo lewym90/egida)";
const dump = process.argv.includes("--dump");

let json = null, used = "";
for (const u of MIRRORS) {
  try {
    const r = await fetch(u, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA }, body: "data=" + encodeURIComponent(overpassQueryPoland()), signal: AbortSignal.timeout(150000) });
    if (!r.ok) { console.log(u, "→ HTTP", r.status); continue; }
    const j = await r.json();
    if (!Array.isArray(j?.elements)) { console.log(u, "→ nieoczekiwany format"); continue; }
    json = j; used = u; break;
  } catch (e) { console.log(u, "→ błąd:", e.message); }
}
if (!json) { console.log("Żaden serwer Overpass nie odpowiedział – zostaje poprzedni plik."); process.exit(1); }

const items = parseOverpass(json).map((s) => ({ ...s, kind: "schron" }));
console.log(`Serwer: ${used}. Elementów: ${json.elements.length}, schronów po filtrach: ${items.length}, z opisem wejścia: ${items.filter((s) => s.how).length}`);
if (dump) { console.log(JSON.stringify(items.slice(0, 3), null, 2)); process.exit(0); }
// ochrona przed pustą/uszkodzoną odpowiedzią: nie nadpisuj dobrego pliku pustym
if (items.length === 0) { console.log("Zero wyników – nie nadpisuję pliku (podejrzana odpowiedź)."); process.exit(1); }
const body = JSON.stringify({ at: new Date().toISOString(), source: "OpenStreetMap", license: "ODbL, © współtwórcy OpenStreetMap", count: items.length, items });
writeFileSync(OUT + ".tmp", body); renameSync(OUT + ".tmp", OUT);
console.log("Zapisano", OUT, Math.round(body.length / 1024), "kB");
