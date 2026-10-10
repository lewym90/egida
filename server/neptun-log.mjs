// EGIDA – „tryb cichy” NEPTUN: raz na minutę pobiera listę obiektów i zapisuje ją do dziennika (JSONL).
// Niczego nie publikuje i nie wysyła na kanały. Cel: sprawdzić na prawdziwych danych, czy format zgadza się
// z tym, czego oczekuje aplikacja (js/neptun.js), zanim cokolwiek pokażemy ludziom.
//   node neptun-log.mjs --dump   – wypisz surową odpowiedź (pierwsze ~3000 znaków) i wynik normalizacji, nic nie zapisuj
//   node neptun-log.mjs          – jeden przebieg: zapis do $LOG_DIR/RRRR-MM-DD.jsonl
// Zasady: jedno zapytanie na przebieg, jasny User-Agent, zero omijania blokad (przy 403/429 kończymy i zapisujemy błąd).
import { mkdirSync, appendFileSync, writeFileSync, readdirSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ThreatStore, applySnapshotJson } from "../js/neptun.js";

const URL_REST = process.env.NEPTUN_REST || "https://neptun.in.ua/api/v1/threats";
const DIR = process.env.NEPTUN_LOG_DIR || "/opt/egida/neptun-log";
const KEEP_DAYS = 60;
const UA = "EGIDA/0.2 (unofficial PWA; test log once per minute; repo lewym90/egida)";
const dump = process.argv.includes("--dump");

const day = new Date().toISOString().slice(0, 10);
const nowIso = new Date().toISOString();
const write = (obj) => {
  if (dump) return;
  mkdirSync(DIR, { recursive: true });
  appendFileSync(join(DIR, day + ".jsonl"), JSON.stringify(obj) + "\n");
};

let res, text;
try {
  res = await fetch(URL_REST, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  text = await res.text();
} catch (e) {
  console.log("BŁĄD sieci:", e.message); write({ at: nowIso, error: "network", msg: String(e.message) }); process.exit(dump ? 1 : 0);
}
if (dump) {
  console.log("HTTP", res.status, res.headers.get("content-type"));
  console.log("--- początek odpowiedzi ---\n" + text.slice(0, 3000));
}
if (!res.ok) { console.log("HTTP", res.status, "– nie ponawiam, nie omijam."); write({ at: nowIso, error: "http", status: res.status }); process.exit(dump ? 1 : 0); }

let json;
try { json = JSON.parse(text); } catch { console.log("Odpowiedź nie jest JSON-em."); write({ at: nowIso, error: "notjson", head: text.slice(0, 200) }); process.exit(dump ? 1 : 0); }
const store = new ThreatStore();
try { applySnapshotJson(store, json); } catch (e) { console.log("FORMAT:", e.message); write({ at: nowIso, error: "format", keys: Object.keys(json || {}).slice(0, 20) }); process.exit(dump ? 1 : 0); }

const items = [...store.items.values()];
console.log(`Odebrano rekordów: ${store.stats.seen}, poprawnych: ${items.length}, odrzuconych: ${store.stats.bad}`);
if (dump) { console.log("--- pierwszy znormalizowany rekord ---\n" + JSON.stringify(items[0] ?? null, null, 2)); process.exit(0); }
if (store.stats.seen > 0 && items.length === 0) write({ at: nowIso, error: "allrejected", seen: store.stats.seen, sample: JSON.stringify((json.threats ?? json)[0] ?? null).slice(0, 600) });

// zapisujemy tylko zmiany (hash listy), a co 10 min i tak jeden wpis „żyję”
const hashFile = join(DIR, ".last");
mkdirSync(DIR, { recursive: true });
const h = JSON.stringify(items.map((t) => [t.id, t.lat, t.lon, t.status, t.updatedAt]).sort());
let prev = {}; try { prev = JSON.parse(readFileSync(hashFile, "utf8")); } catch {}
if (prev.h !== h || Date.now() - (prev.t || 0) > 600000) {
  write({ at: nowIso, serverTime: json.serverTime ?? null, n: items.length, items });
  writeFileSync(hashFile, JSON.stringify({ h, t: Date.now() }));
}
// porządki: kasuj dzienniki starsze niż KEEP_DAYS
const cutoff = Date.now() - KEEP_DAYS * 864e5;
for (const f of existsSync(DIR) ? readdirSync(DIR) : []) {
  const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
  if (m && Date.parse(m[1]) < cutoff) unlinkSync(join(DIR, f));
}
