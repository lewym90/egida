// Generuje js/ua-oblasts.js: uproszczone granice obwodów Ukrainy (do cieniowania obwodów z alarmem na mapie).
// Źródło: Natural Earth, „Admin 1 – States, Provinces” (domena publiczna). Plik źródłowy (GeoJSON, wersja 10m) pobierz z
//   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
// Użycie: node scripts/build-ua-oblasts.mjs <ne_10m_admin_1_states_provinces.geojson> [js/ua-oblasts.js]
// Klucz obwodu = nazwa ukraińska (name_uk) po normalizacji w js/ua-oblasts.js (oblastKey). Dwa wpisy NE mają name_uk „Київ”:
// obwód kijowski i miasto Kijów, więc rozróżniamy je po polu name.
import { readFileSync, writeFileSync } from "node:fs";

const [src, out = "js/ua-oblasts.js"] = process.argv.slice(2);
if (!src) { console.error("Podaj ścieżkę do pliku GeoJSON Natural Earth (admin 1)."); process.exit(1); }
const EPS = 0.02;      // tolerancja uproszczenia w stopniach (ok. 2 km): wystarcza do cieniowania obwodów na mapie kraju
const DEC = 2;         // zaokrąglenie współrzędnych (ok. 1 km)

/** Douglas–Peucker dla pierścienia (lista [lon,lat]); zachowuje punkt początkowy i końcowy. */
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let dmax = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else { const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)); d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const r = (v) => Number(v.toFixed(DEC));
function simplifyRing(ring) {
  let s = dp(ring, EPS).map(([x, y]) => [r(x), r(y)]);
  // usuń sąsiednie duplikaty po zaokrągleniu
  s = s.filter((p, i) => i === 0 || p[0] !== s[i - 1][0] || p[1] !== s[i - 1][1]);
  return s.length >= 4 ? s : null;
}

const gj = JSON.parse(readFileSync(src, "utf8"));
const res = [];
for (const f of gj.features) {
  const p = f.properties || {};
  if (p.adm0_a3 !== "UKR" && p.admin !== "Ukraine") continue;
  const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  const rings = [];
  for (const poly of polys) { const outer = simplifyRing(poly[0]); if (outer) rings.push(outer); } // tylko zewnętrzne obrysy (obwody nie mają dziur)
  if (!rings.length) continue;
  // Miasto Kijów to osobna jednostka w NE (name „Kiev City”), obwód kijowski ma name „Kiev”.
  const uk = p.name === "Kiev City" ? "м. Київ" : p.name === "Kiev" ? "Київська область" : p.name_uk;
  res.push({ uk, en: p.name, rings });
}
res.sort((a, b) => a.uk.localeCompare(b.uk, "uk"));
const body = res.map((o) => `  ${JSON.stringify(o.uk)}: ${JSON.stringify(o.rings)},`).join("\n");
writeFileSync(out, `// Uproszczone granice obwodów Ukrainy do cieniowania obwodów z alarmem. PLIK GENEROWANY przez scripts/build-ua-oblasts.mjs.
// Źródło: Natural Earth (domena publiczna), tolerancja ok. 2 km: tylko do orientacyjnego pokazania obszaru, nie do pomiarów.
// Brak Krymu i Sewastopola (Natural Earth nie przypisuje ich do Ukrainy), więc alarmy tam nie są cieniowane.
// Format: { "<nazwa ukraińska>": [ pierścień [[lon, lat], …], … ] }
export const UA_OBLASTS = {\n${body}\n};\n`);
const pts = res.reduce((n, o) => n + o.rings.reduce((m, rg) => m + rg.length, 0), 0);
console.log(`Zapisano ${res.length} obwodów, ${pts} punktów → ${out}`);
