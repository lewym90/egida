// Co ~godzinę: stopnie alarmowe z komunikatów RCB na gov.pl (strony publiczne, tylko odczyt) → alarm-levels.json.
// Zasady: respektujemy robots.txt, żadnych obejść blokad (403/429 = zostają poprzednie dane), kilka zapytań z odstępami,
// plik powstaje dopiero po poprawnym odczycie komunikatu, a pole "at" oznacza chwilę ostatniego udanego sprawdzenia źródła
// (strażnik pilnuje jego wieku).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { RCB_BASE, RCB_SEED_PATH, textOf, titleOf, parseOrders, publishedOf, legalBasisOf, alarmLinks, mergeOrders, robotsAllows } from "./alarm-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.ALARM_OUT || "alarm-levels.json";
const SEED = process.env.ALARM_SEED || path.join(here, "alarm-seed.json");
const BASE = process.env.ALARM_BASE || RCB_BASE;
const UA = "EGIDA/1.0 (+https://github.com/lewym90/egida; unofficial safety app)";
const PAUSE = Number(process.env.ALARM_PAUSE_MS || 1500), MAX_PAGES = Number(process.env.ALARM_MAX_PAGES || 8);
const KEEP_DAYS = 60; // zarządzenia po wygaśnięciu zostają w pliku jeszcze tyle dni (historia dla aplikacji)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" }, signal: AbortSignal.timeout(20000), redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}
const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

const seed = readJson(SEED) || { items: [] };
const prev = readJson(OUT) || null;
let items = mergeOrders(seed.items, prev?.items);
let basis = prev?.basis || seed.basis || null, notices = Array.isArray(prev?.notices) ? prev.notices : [];

// Pierwszy przebieg na świeżym serwerze: zapisujemy znane zarządzenia z pliku startowego (sprawdzone ręcznie w komunikacie RCB), z chwilą tego sprawdzenia w polu "at".
// Dzięki temu aplikacja ma dane od razu, a strażnik zgłosi, jeśli serwer nie zdoła później sprawdzić źródła.
if (!prev && seed.items?.length && seed.verified) {
  writeFileSync(OUT, JSON.stringify({ at: `${seed.verified}T12:00:00+02:00`, source: { name: "Rządowe Centrum Bezpieczeństwa (gov.pl/rcb)", url: "https://www.gov.pl/web/rcb" }, basis, items, notices }));
  console.log("Zapisano plik startowy " + OUT + " (dane z pliku alarm-seed.json, jeszcze niesprawdzone na żywo)");
}

// robots.txt: gdy zabrania odczytu komunikatów RCB, nie pobieramy nic (zostają poprzednie dane).
try {
  const robots = await get(`${BASE}/robots.txt`);
  if (!robotsAllows(robots, "/web/rcb/")) { console.log("robots.txt zabrania odczytu /web/rcb/ – nie pobieram, zostają poprzednie dane"); process.exit(1); }
} catch (e) { console.log("robots.txt: " + e.message + " (kontynuuję tylko jeśli komunikat daje się pobrać normalnie)"); }

// Adresy do odczytu: znany komunikat + komunikaty o stopniach alarmowych odnalezione na stronie głównej RCB oraz adresy z poprzednich wpisów.
const known = new Set([BASE + RCB_SEED_PATH, ...items.map((o) => o.url).filter((u) => u && u.startsWith(BASE + "/"))]);
const queue = [...known];
for (const list of [`${BASE}/web/rcb`, `${BASE}/web/rcb/aktualnosci`]) {
  try { for (const l of alarmLinks(await get(list), BASE)) if (!queue.includes(l)) queue.push(l); } catch (e) { console.log(`lista ${list}: ${e.message}`); }
  await sleep(PAUSE);
}

let okPages = 0, parsedPages = 0;
const fresh = [], newNotices = [];
for (const url of queue.slice(0, MAX_PAGES)) {
  try {
    const html = await get(url); okPages++;
    const text = textOf(html);
    const got = parseOrders(text, { url });
    const published = publishedOf(text);
    if (got.length) {
      parsedPages++;
      for (const o of got) fresh.push(published ? { ...o, published } : o);
      basis = legalBasisOf(text) || basis;
    } else if (!known.has(url)) {
      // komunikat o stopniach alarmowych, którego treści nie umiemy odczytać (np. odwołanie, inny układ): pokazujemy go w aplikacji jako link
      newNotices.push({ title: titleOf(html) || "Komunikat RCB o stopniach alarmowych", url, ...(published ? { published } : {}) });
    }
  } catch (e) { console.log(`${url}: ${e.message}`); }
  await sleep(PAUSE);
}
console.log(`Odczytane strony: ${okPages}/${Math.min(queue.length, MAX_PAGES)}, z odczytanymi zarządzeniami: ${parsedPages}, nowe zarządzenia: ${fresh.length}`);
if (okPages === 0 || parsedPages === 0) { console.log("Nie udało się odczytać zarządzeń ze źródła – nie zapisuję (zostaje poprzedni plik)."); process.exit(1); }

const now = Date.now();
items = mergeOrders(items, fresh).filter((o) => now - Date.parse(o.until) < KEEP_DAYS * 864e5);
notices = [...newNotices, ...notices].filter((n, i, a) => a.findIndex((x) => x.url === n.url) === i).slice(0, 5);
if (!items.length) { console.log("Brak zarządzeń po scaleniu – nie zapisuję."); process.exit(1); }
writeFileSync(OUT, JSON.stringify({
  at: new Date(now).toISOString(),
  source: { name: "Rządowe Centrum Bezpieczeństwa (gov.pl/rcb)", url: "https://www.gov.pl/web/rcb" },
  basis, items, notices,
}));
console.log("Zapisano " + OUT + " (" + items.length + " zarządzeń)");
