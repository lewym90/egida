// EGIDA – uzupełnia adresy i rodzaj obiektu („Szkoła – SP 5”, „Budynek mieszkalny”…) w aed.json i hospitals.json.
// Źródło: OpenStreetMap (Overpass – budynek zawierający punkt i najbliższy adres), a gdy tam brak – Nominatim (mało zapytań na dobę, 1/s).
// Wyniki trafiają do pamięci podręcznej ($ADDR_CACHE), więc kolejne uruchomienia robią tylko to, co zostało; punkty bez wyniku są ponawiane po 14 dniach.
//   node medical-addr.mjs           – uzupełnij i zapisz pliki
//   node medical-addr.mjs --dump    – tylko statystyki
// Dane: © współtwórcy OpenStreetMap, licencja ODbL.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { buildBatchQuery, pickAddress, nominatimAddr, applyCache, ADDR_INDEX, AED_RADIUS_M, HOSP_RADIUS_M } from "./medical-addr-lib.mjs";

const MIRRORS = (process.env.OVERPASS_URLS || "https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter").split(",");
const DIR = process.env.DATA_DIR || ".";
const CACHE_FILE = process.env.ADDR_CACHE || join(DIR, "..", "addr-cache.json");
const UA = "EGIDA/0.2 (unofficial PWA; OSM address lookup for AED and hospitals; repo lewym90/egida)";
const dump = process.argv.includes("--dump");
const BUDGET_MS = Number(process.env.ADDR_BUDGET_MS ?? 45 * 60000), BATCH = Number(process.env.ADDR_BATCH ?? 20), PAUSE_MS = Number(process.env.ADDR_PAUSE_MS ?? 2500);
const NOMINATIM_MAX = Number(process.env.ADDR_NOMINATIM_MAX ?? 3000), RETRY_DAYS = 14;
const t0 = Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timeLeft = () => BUDGET_MS - (Date.now() - t0);

const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const writeAtomic = (f, body) => { writeFileSync(f + ".tmp", body); renameSync(f + ".tmp", f); };
let cache = readJson(CACHE_FILE) || {};
const saveCache = () => { if (!dump) writeAtomic(CACHE_FILE, JSON.stringify(cache)); };

async function overpass(query) {
  for (let round = 0; round < 2; round++) {
    for (const u of MIRRORS) {
      try {
        const r = await fetch(u, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA }, body: "data=" + encodeURIComponent(query), signal: AbortSignal.timeout(130000) });
        if (!r.ok) { console.log(u.split("/")[2], "→ HTTP", r.status); continue; }
        const j = await r.json();
        if (Array.isArray(j?.elements)) return j.elements;
      } catch (e) { console.log(u.split("/")[2], "→ błąd:", e.message); }
    }
    await sleep(10000);
  }
  return null;
}

const files = { aed: join(DIR, "aed.json"), szpitale: join(DIR, "hospitals.json") };
const dbs = { aed: readJson(files.aed), szpitale: readJson(files.szpitale) };
const fresh = (c) => c && (c.a || Date.now() - (c.t || 0) < RETRY_DAYS * 86400000);
// punkty do sprawdzenia: szpitale najpierw; AED – wszystkie, którym brakuje adresu albo obiektu
const targets = [];
for (const kind of ["szpitale", "aed"]) {
  const rows = dbs[kind]?.rows || [];
  for (const r of rows) {
    const need = kind === "aed" ? !r[ADDR_INDEX.aed] || !r[13] : !r[ADDR_INDEX.szpitale];
    const c = cache[r[0]];
    if (need && !(c && fresh(c) && (kind === "szpitale" ? true : c.a || c.o !== undefined))) targets.push({ id: r[0], kind, lat: r[1], lon: r[2], r: kind === "aed" ? AED_RADIUS_M : HOSP_RADIUS_M });
  }
}
// sąsiednie punkty razem (mniejsze odpowiedzi): sortowanie po siatce 0,05°
const cell = (t) => Math.floor(t.lat * 20) * 10000 + Math.floor(t.lon * 20);
targets.sort((a, b) => (a.kind === b.kind ? cell(a) - cell(b) : a.kind === "szpitale" ? -1 : 1));
const total = (k) => (dbs[k]?.rows || []).length, withAddr = (k) => (dbs[k]?.rows || []).filter((r) => r[ADDR_INDEX[k]] || cache[r[0]]?.a).length;
console.log(`Do sprawdzenia: ${targets.length} punktów (szpitale ${targets.filter((t) => t.kind === "szpitale").length}). Z adresem: szpitale ${withAddr("szpitale")}/${total("szpitale")}, AED ${withAddr("aed")}/${total("aed")}.`);
if (dump) process.exit(0);

function flush() {
  saveCache();
  for (const kind of ["szpitale", "aed"]) {
    const cur = readJson(files[kind]); if (!cur || !Array.isArray(cur.rows)) continue; // czytamy świeżą wersję tuż przed zapisem
    applyCache(kind, cur.rows, cache);
    if (kind === "aed") cur.addr = { n: cur.rows.filter((r) => r[ADDR_INDEX.aed]).length, of: cur.rows.length }; // ile punktów ma adres (nagłówek pliku; klient to ignoruje)
    writeAtomic(files[kind], JSON.stringify(cur));
  }
}

async function runBatch(list, depth = 0) {
  const els = await overpass(buildBatchQuery(list));
  if (els) {
    for (const t of list) { const res = pickAddress(t, els); cache[t.id] = { ...res, t: Date.now() }; }
    return true;
  }
  if (list.length === 1 || depth >= 3) return false;
  const h = Math.ceil(list.length / 2);
  const a = await runBatch(list.slice(0, h), depth + 1), b = await runBatch(list.slice(h), depth + 1);
  return a && b;
}

let done = 0, batches = 0, fails = 0;
// Overpass bywa przeciążony (HTTP 504). Po 3 nieudanych paczkach z rzędu nie tracimy czasu: przechodzimy do Nominatim (1 zapytanie/s), które liczy się punkt po punkcie.
for (let i = 0; i < targets.length && timeLeft() > BUDGET_MS * 0.4; i += BATCH) {
  const list = targets.slice(i, i + BATCH);
  const okB = await runBatch(list); done += list.length; batches++;
  fails = okB ? 0 : fails + 1;
  if (fails >= 3) { console.log("Overpass nie odpowiada – przechodzę do Nominatim."); break; }
  if (batches % 5 === 0) { flush(); console.log(`  sprawdzono ${done}/${targets.length}`); }
  await sleep(PAUSE_MS);
}
flush();
console.log(`Overpass: sprawdzono ${done} z ${targets.length}.`);

// Rezerwa: Nominatim dla punktów, które nadal nie mają adresu (szpitale najpierw; limit na przebieg, 1 zapytanie/s)
const missing = [];
for (const kind of ["szpitale", "aed"]) for (const r of dbs[kind]?.rows || []) { const c = cache[r[0]]; if (!r[ADDR_INDEX[kind]] && !c?.a && !c?.nm) missing.push({ id: r[0], lat: r[1], lon: r[2] }); }
let nm = 0, blocked = false;
for (const m of missing) {
  if (nm >= NOMINATIM_MAX || timeLeft() < 60000 || blocked) break;
  try {
    const r = await fetch(`${process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/reverse"}?format=jsonv2&addressdetails=1&zoom=18&accept-language=pl&lat=${m.lat}&lon=${m.lon}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429 || r.status === 403) { console.log("Nominatim → HTTP", r.status, "– przerywam do następnego razu"); blocked = true; break; }
    if (r.ok) { const a = nominatimAddr(await r.json()); cache[m.id] = { ...cache[m.id], nm: 1, ...(a ? { a, d: -1 } : {}), t: Date.now() }; }
  } catch (e) { console.log("Nominatim → błąd:", e.message); }
  nm++; await sleep(1100);
}
flush();
console.log(`Nominatim: ${nm} zapytań. Z adresem po przebiegu: szpitale ${withAddr("szpitale")}/${total("szpitale")}, AED ${withAddr("aed")}/${total("aed")}.`);
// Stan adresów AED dla strażnika (obok pamięci podręcznej): ile punktów ma adres. Strażnik zgłasza, gdy odsetek długo nie rośnie.
{
  const stat = { at: new Date().toISOString(), n: withAddr("aed"), of: total("aed") };
  stat.pct = stat.of ? Math.round((1000 * stat.n) / stat.of) / 10 : 0;
  try { writeAtomic(join(dirname(CACHE_FILE), "aed-addr.json"), JSON.stringify(stat)); } catch { /* katalog tylko do odczytu – pomijamy */ }
  console.log(`Adresy AED: ${stat.n}/${stat.of} (${stat.pct}%).`);
}
