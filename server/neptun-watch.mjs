// EGIDA – obserwator NEPTUN: co ~10 s (przez ~52 s w każdej minucie crona) pobiera /threats i wysyła na Telegram
// NIEOFICJALNE powiadomienie, gdy obiekt jest bliżej niż 100 km od granicy Polski i leci w jej stronę (albo jest nad Polską).
// Zasady: REST nie częściej niż co 5 s (my: 10 s), jasny User-Agent, zero omijania blokad (403/429 = log i czekamy).
//   node neptun-watch.mjs            – pętla ~52 s (tak uruchamia go cron)
//   node neptun-watch.mjs --once     – jeden przebieg
//   node neptun-watch.mjs --preview  – jeden przebieg BEZ wysyłki i BEZ zapisu stanu: pokazuje kandydatów, pominięte i treść wiadomości
// Środowisko: TELEGRAM_BOT_TOKEN, CHANNELS_FILE, APP_URL, NEPTUN_TG=off (tylko log, bez wysyłki), NEPTUN_STATE (domyślnie /opt/egida/neptun-state.json).
import { readFileSync, writeFileSync } from "node:fs";
import { ThreatStore, applySnapshotJson } from "../js/neptun.js";
import { loadRegions } from "../js/regions.js";
import { candidates, decide, markSent, buildMessage } from "./neptun-notify.mjs";

const URL_REST = process.env.NEPTUN_REST || "https://neptun.in.ua/api/v1/threats";
const STATE_FILE = process.env.NEPTUN_STATE || "/opt/egida/neptun-state.json";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const APP_URL = process.env.APP_URL || "";
const UA = "EGIDA/0.3 (unofficial PWA; border watch every 10 s; repo lewym90/egida)";
const preview = process.argv.includes("--preview"), once = preview || process.argv.includes("--once");
const sendOn = !preview && process.env.NEPTUN_TG !== "off";
const log = (...a) => console.log(new Date().toISOString(), ...a);

const channels = (() => {
  const out = {};
  try {
    const f = JSON.parse(readFileSync(process.env.CHANNELS_FILE || "/opt/egida/channels.json", "utf8"));
    for (const [id, v] of Object.entries(f)) if (/^-?\d{5,}$/.test(String(v?.chat))) out[id] = String(v.chat);
  } catch { /* brak pliku */ }
  return out;
})();
const readState = () => { try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return { sent: {}, rate: {} }; } };

async function sendTelegram(chat, html) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${(await r.text()).slice(0, 160)}`);
}

const regions = await loadRegions();
let failStreak = 0;

async function tick() {
  let json;
  try {
    const r = await fetch(URL_REST, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) { failStreak++; log(`NEPTUN HTTP ${r.status} – nie ponawiam poza harmonogramem`); return; }
    json = await r.json();
  } catch (e) { failStreak++; log("NEPTUN błąd sieci:", e.message); return; }
  failStreak = 0;
  const store = new ThreatStore();
  try { applySnapshotJson(store, json); } catch (e) { log("FORMAT NEPTUN:", e.message); return; }
  const now = store.nowMs();
  const { cands, skipped } = candidates(store, now, regions);
  const state = readState();
  const { byRegion, state: next } = decide(cands, state, now);

  if (preview) {
    log(`Rekordów: ${store.stats.seen}, poprawnych: ${store.items.size}, odrzuconych: ${store.stats.bad}`);
    const reasons = {};
    for (const s of skipped) reasons[s.reason] = (reasons[s.reason] || 0) + 1;
    log("Pominięte (powód → liczba):", JSON.stringify(reasons));
    for (const c of cands) log(`KANDYDAT ${c.t.type} ${c.t.locality || c.t.region || ""} poziom=${c.ap.level} do granicy=${Math.round(c.ap.distKm)} km kanały=${c.regions.join(",")}`);
    for (const [r, items] of Object.entries(byRegion)) console.log(`\n--- ${r} (${channels[r] ? "kanał skonfigurowany" : "BRAK kanału w channels.json"}) ---\n` + buildMessage(r, items, { appUrl: APP_URL }).replace(/<[^>]+>/g, ""));
    if (!Object.keys(byRegion).length) log("Nic do wysłania w tej chwili.");
    return;
  }
  for (const [region, items] of Object.entries(byRegion)) {
    const msg = buildMessage(region, items, { appUrl: APP_URL });
    if (!sendOn) { log(`[NEPTUN_TG=off] ${region}: ${items.length} obiekt(ów) – bez wysyłki`); markSent(next, region, items, now); continue; }
    if (!channels[region] || !TOKEN) { log(`${region}: brak kanału lub tokenu – pomijam`); continue; }
    try { await sendTelegram(channels[region], msg); markSent(next, region, items, now); log(`Wysłano na ${region}: ${items.length} obiekt(ów)`); }
    catch (e) { log(`Telegram ${region}: ${e.message}`); }
  }
  writeFileSync(STATE_FILE, JSON.stringify(next));
}

const until = Date.now() + 52000;
for (;;) {
  await tick();
  if (once || Date.now() + 10000 > until) break;
  await new Promise((r) => setTimeout(r, 10000));
}
