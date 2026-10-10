// EGIDA – import Rejestru Punktów Schronienia (MSWiA / Państwowa Straż Pożarna; aplikacja gdziesieukryc.pl).
// Źródło: oficjalny pakiet danych, z którego sama aplikacja PSP korzysta do pracy offline:
//   GET /api/shelters/dataset/manifest  → {format, schema, version, count, builtAt}
//   GET /api/shelters/dataset/<version> → {format:"gsu-shelters-compact", rows:[[id,lat,lon,adres,miasto,dostępność],…]}
// Pytamy o manifest (kilkaset bajtów) i pobieramy pakiet (≈8,5 MB) TYLKO wtedy, gdy wersja się zmieniła. robots.txt serwisu: Allow: /.
// Wynik: $DATA_DIR/psp/index.json oraz $DATA_DIR/psp/c/<kafelek>.json (małe pliki, które telefon pobiera dla swojej okolicy).
//   node psp-sync.mjs --dump            – tylko manifest i statystyki, nic nie zapisuj
//   node psp-sync.mjs                   – normalny przebieg (pomija, gdy wersja bez zmian)
//   node psp-sync.mjs --file plik.json  – użyj ręcznie pobranego pakietu (gdy serwer PSP odrzuca skrypty)
//   node psp-sync.mjs --force           – pobierz mimo tej samej wersji
// Nie omijamy żadnych zabezpieczeń: przy odpowiedzi innej niż 200/JSON przerywamy z komunikatem.
import { readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildPspTiles } from "../js/shelters.js";

const BASE = process.env.PSP_BASE || "https://gdziesieukryc.pl";
const OUT = process.env.PSP_OUT || join(process.env.DATA_DIR || ".", "psp");
const UA = "EGIDA/0.2 (unofficial PWA; import of the public shelter dataset once per version change; repo lewym90/egida)";
const arg = (n) => process.argv.includes(n);
const fileIdx = process.argv.indexOf("--file");
const get = async (path, asText = false) => {
  const r = await fetch(BASE + path, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(120000) });
  const ct = r.headers.get("content-type") || "";
  if (!r.ok || !ct.includes("json")) throw new Error(`${path} → HTTP ${r.status}, ${ct || "brak typu"} (serwer PSP nie wydał danych; nie ponawiam i niczego nie omijam)`);
  return r.json();
};

let ds, manifest = null;
const prev = (() => { try { return JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")); } catch { return null; } })();
try {
  if (fileIdx > 0) { ds = JSON.parse(readFileSync(process.argv[fileIdx + 1], "utf8")); manifest = { version: ds.version, count: ds.count, builtAt: ds.builtAt }; }
  else {
    manifest = await get("/api/shelters/dataset/manifest");
    console.log("Manifest:", JSON.stringify(manifest));
    if (manifest.format !== "gsu-shelters-compact" || manifest.schema !== 1 || !manifest.enabled || !manifest.version) throw new Error("Manifest ma nieoczekiwany format lub dane są wyłączone");
    if (arg("--dump")) { console.log("(--dump: nie pobieram pakietu)"); process.exit(0); }
    if (prev?.version === manifest.version && !arg("--force")) { console.log("Wersja bez zmian (" + manifest.version + ") – nic nie robię."); process.exit(0); }
    ds = await get("/api/shelters/dataset/" + encodeURIComponent(manifest.version));
  }
} catch (e) { console.log("BŁĄD:", e.message); process.exit(1); }

let built; try { built = buildPspTiles(ds); } catch (e) { console.log("BŁĄD:", e.message, "– zostaje poprzednia baza."); process.exit(1); }
const { tiles, count, rejected } = built;
console.log(`Punktów poprawnych: ${count}, odrzuconych: ${rejected}, kafelków: ${tiles.size}`);
if (count < 50000) { console.log("Podejrzanie mało punktów (<50 000) – zostaje poprzednia baza."); process.exit(1); }
if (prev && count < prev.count * 0.8) { console.log(`Liczba punktów spadła z ${prev.count} do ${count} (>20%) – zostaje poprzednia baza.`); process.exit(1); }
if (arg("--dump")) process.exit(0);

const tmp = OUT + ".new";
rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, "c"), { recursive: true });
for (const [id, rows] of tiles) writeFileSync(join(tmp, "c", id + ".json"), JSON.stringify({ rows }));
const index = { version: manifest.version ?? null, builtAt: manifest.builtAt ?? null, importedAt: new Date().toISOString(), count, source: "Rejestr Punktów Schronienia, MSWiA / Państwowa Straż Pożarna (gdziesieukryc.pl)", cell: { lat: 0.2, lon: 0.3 } };
writeFileSync(join(tmp, "index.json"), JSON.stringify(index));
rmSync(OUT + ".old", { recursive: true, force: true });
if (existsSync(OUT)) renameSync(OUT, OUT + ".old");
renameSync(tmp, OUT); rmSync(OUT + ".old", { recursive: true, force: true });
console.log("Zapisano", OUT, "– wersja", index.version);
