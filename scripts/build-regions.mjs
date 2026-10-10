// Buduje js/regions-data.js z pliku GeoJSON z granicami województw (PRG / GUGiK, wersja uproszczona).
// Użycie: node scripts/build-regions.mjs <plik.geojson>
// Źródło danych: Państwowy Rejestr Granic (GUGiK). Uproszczone granice (ok. ±1–2 km) służą wyłącznie do
// wskazania województwa na podstawie GPS – to nie jest granica prawna.
import { readFileSync, writeFileSync } from "node:fs";
import { VOIVODESHIPS } from "../js/content.js";

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const byName = new Map(VOIVODESHIPS.map((v) => [norm(v.name), v.id]));
const src = process.argv[2];
if (!src) { console.error("Podaj plik GeoJSON: node scripts/build-regions.mjs wojewodztwa.geojson"); process.exit(1); }
const gj = JSON.parse(readFileSync(src, "utf8"));
const out = {};
for (const f of gj.features) {
  const id = byName.get(norm(f.properties?.nazwa ?? f.properties?.name ?? ""));
  if (!id) throw new Error("Nieznane województwo: " + JSON.stringify(f.properties));
  const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  // Tylko pierścienie zewnętrzne (enklawy w granicach województw nie występują); współrzędne: [lon, lat, lon, lat, …] z 4 miejscami po przecinku.
  out[id] = polys.map((p) => p[0].flatMap(([lon, lat]) => [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4]));
}
if (Object.keys(out).length !== 16) throw new Error("Oczekiwano 16 województw, jest " + Object.keys(out).length);
const js = `// Wygenerowano przez scripts/build-regions.mjs. Źródło: Państwowy Rejestr Granic (GUGiK), granice uproszczone.\n// Do wskazania województwa z GPS. To NIE jest granica prawna (dokładność rzędu 1–2 km).\nexport const REGION_RINGS = ${JSON.stringify(out)};\n`;
writeFileSync(new URL("../js/regions-data.js", import.meta.url), js);
console.log("Zapisano js/regions-data.js:", (js.length / 1024).toFixed(0), "KB");
