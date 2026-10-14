// Co ~godzinę: indeks jakości powietrza ze stacji GIOŚ (publiczne API, tylko odczyt) → air.json.
// Zasady: kilka równoległych zapytań, odstępy, przerwanie przy serii błędów (limit), stare dane zostają, gdy przebieg się nie uda.
import { readFileSync, writeFileSync } from "node:fs";
import { AIR_BASE, parseStations, parseIndex } from "./air-lib.mjs";

const OUT = process.env.AIR_OUT || "air.json", MIN = Number(process.env.AIR_MIN || 30), PAUSE = Number(process.env.AIR_PAUSE_MS || 120), CONC = Number(process.env.AIR_CONC || 3);
const UA = "EGIDA/1.0 (+https://github.com/lewym90/egida; unofficial safety app)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (path) => {
  const r = await fetch(AIR_BASE + path, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
};
let prev = {};
try { for (const s of JSON.parse(readFileSync(OUT, "utf8")).stations || []) prev[s.id] = s; } catch { /* pierwszy przebieg */ }

const first = await getJson("/station/findAll?page=0&size=500");
let list = parseStations(first);
const pages = Math.min(Number(first?.totalPages) || 1, 5);
for (let p = 1; p < pages; p++) { await sleep(PAUSE); list = list.concat(parseStations(await getJson(`/station/findAll?page=${p}&size=500`))); }
console.log(`Stacji GIOŚ: ${list.length}`);

const out = []; let failStreak = 0, fails = 0, noIdx = 0, i = 0, abort = false;
async function worker() {
  while (!abort) {
    const s = list[i++]; if (!s) return;
    try {
      const ix = parseIndex(await getJson(`/aqindex/getIndex/${s.id}`));
      failStreak = 0;
      if (ix) out.push({ id: s.id, n: s.name, la: s.lat, lo: s.lon, i: ix.idx, t: ix.at, ...(ix.p ? { p: ix.p } : {}) }); else noIdx++;
    } catch (e) {
      fails++; failStreak++;
      if (prev[s.id]) out.push(prev[s.id]);
      if (failStreak >= 8) { abort = true; console.log("Seria błędów (limit zapytań?) – przerywam przebieg: " + e.message); }
    }
    await sleep(PAUSE);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`Z indeksem: ${out.length}, bez indeksu: ${noIdx}, błędy: ${fails}, ze wskazanym zanieczyszczeniem: ${out.filter((x) => x.p).length}`);
if (abort || out.length < MIN) { console.log(`Za mało danych (< ${MIN}) – nie zapisuję ${OUT}.`); process.exit(1); }
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), source: "GIOŚ – Państwowy Monitoring Środowiska", stations: out }));
console.log("Zapisano " + OUT);
