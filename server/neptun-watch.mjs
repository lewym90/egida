// EGIDA – obserwator NEPTUN: co ~10 s (przez ~52 s w każdej minucie crona) pobiera /threats i wysyła na Telegram
// NIEOFICJALNE powiadomienie, gdy obiekt jest bliżej niż 100 km od granicy Polski i leci w jej stronę (albo jest nad Polską).
// Zasady: REST nie częściej niż co 5 s (my: 10 s), jasny User-Agent, zero omijania blokad (403/429 = log i czekamy).
//   node neptun-watch.mjs            – pętla ~52 s (tak uruchamia go cron)
//   node neptun-watch.mjs --once     – jeden przebieg
//   node neptun-watch.mjs --preview  – jeden przebieg BEZ wysyłki i BEZ zapisu stanu: pokazuje kandydatów, pominięte i treść wiadomości
// Środowisko: TELEGRAM_BOT_TOKEN, CHANNELS_FILE, APP_URL, NEPTUN_TG=off (tylko log, bez wysyłki), NEPTUN_STATE (domyślnie /opt/egida/neptun-state.json),
//   EARLY_TG=off (wczesne ostrzeżenie bez wysyłki), EARLY_STATE (domyślnie /opt/egida/early-state.json).
import { readFileSync, writeFileSync } from "node:fs";
import { ThreatStore, applySnapshotJson } from "../js/neptun.js";
import { loadRegions } from "../js/regions.js";
import { candidates, decide, markSent, buildMessage } from "./neptun-notify.mjs";
import { mergeSeen, loadSeen, saveSeen } from "./neptun-seen.mjs";
import { fetchThreats, relayLocalUrl } from "./neptun-source.mjs";
import { decideEarly, markEarlySent, buildEarlyMessage } from "./early-lib.mjs";

const STATE_FILE = process.env.NEPTUN_STATE || "/opt/egida/neptun-state.json";
const HEALTH_FILE = process.env.NEPTUN_HEALTH || "/opt/egida/neptun-health.json"; // znacznik ostatniego POPRAWNEGO odczytu (czyta go strażnik)
const SEEN_FILE = process.env.NEPTUN_SEEN || "/opt/egida/neptun-seen.json"; // skumulowany raport typów i próbek (patrz neptun-seen.mjs)
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const APP_URL = process.env.APP_URL || "";
const UA = "EGIDA/0.4 (unofficial PWA; border watch every 10 s, normally via own relay; repo lewym90/egida)";
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
const EARLY_STATE = process.env.EARLY_STATE || "/opt/egida/early-state.json";
const earlyOn = !preview && process.env.EARLY_TG !== "off";
const readEarly = () => { try { return JSON.parse(readFileSync(EARLY_STATE, "utf8")); } catch { return { sent: {} }; } };
const readState = () => { try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return { sent: {}, rate: {} }; } };

async function sendTelegram(chat, html) {
  const r = await fetch(`${(process.env.TELEGRAM_API || "https://api.telegram.org").replace(/\/$/, "")}/bot${TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${(await r.text()).slice(0, 160)}`);
}

const regions = await loadRegions();
let failStreak = 0;

async function tick() {
  // Najpierw lokalny przekaźnik (bez dodatkowych zapytań do NEPTUN), a gdy nie działa – bezpośrednio NEPTUN.
  const got = await fetchThreats({ ua: UA });
  if (!got.ok) {
    failStreak++;
    log(got.error === "http" ? `NEPTUN HTTP ${got.status} – nie ponawiam poza harmonogramem` : got.error === "notjson" ? "NEPTUN: odpowiedź nie jest JSON-em" : `NEPTUN błąd sieci: ${got.message}`);
    return;
  }
  const json = got.json;
  if (preview) log(`Źródło: ${got.via === "relay" ? "przekaźnik EGIDA (127.0.0.1)" : "NEPTUN bezpośrednio"}`);
  failStreak = 0;
  if (!preview) { // zbieranie wiedzy o formacie: błąd zapisu nigdy nie przerywa powiadomień
    try { saveSeen(SEEN_FILE, mergeSeen(loadSeen(SEEN_FILE), Array.isArray(json) ? json : json?.threats)); } catch (e) { log("neptun-seen:", e.message); }
  }
  const store = new ThreatStore();
  try { applySnapshotJson(store, json); } catch (e) { log("FORMAT NEPTUN:", e.message); return; }
  if (!preview) { try { writeFileSync(HEALTH_FILE, JSON.stringify({ lastOk: Date.now(), records: store.items.size })); } catch (e) { log("neptun-health:", e.message); } }
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

/** Wczesne ostrzeżenie (Siły Powietrzne ZSU, kanały monitoringu) → Telegram dla województw przy granicy. Dane tylko z lokalnego przekaźnika. */
async function earlyTick() {
  const base = relayLocalUrl();
  if (!base) return;
  let j;
  try {
    const r = await fetch(base.replace(/\/snapshot$/, "/early"), { headers: { "user-agent": UA }, signal: AbortSignal.timeout(3000) });
    if (!r.ok) return;
    j = await r.json();
  } catch { return; } // przekaźnik nie działa – ostrzeżenia czekają na niego (strażnik o tym powie)
  const now = Date.now();
  const { byRegion, state } = decideEarly(j?.early, readEarly(), now);
  if (preview) {
    log(`Wczesne ostrzeżenie: poziom ${j?.early?.level ?? "brak"}, pozycji ${j?.early?.items?.length ?? 0}`);
    for (const [r, items] of Object.entries(byRegion)) console.log(`\n--- ${r} (wczesne) ---\n` + buildEarlyMessage(r, items, { appUrl: APP_URL }).replace(/<[^>]+>/g, ""));
    return;
  }
  let changed = false;
  for (const [region, items] of Object.entries(byRegion)) {
    if (!earlyOn) { log(`[EARLY_TG=off] ${region}: ${items.length} wpis(ów) – bez wysyłki`); markEarlySent(state, region, items, now); changed = true; continue; }
    if (!channels[region] || !TOKEN) { log(`${region}: brak kanału lub tokenu – wczesne ostrzeżenie pominięte`); continue; }
    try { await sendTelegram(channels[region], buildEarlyMessage(region, items, { appUrl: APP_URL })); markEarlySent(state, region, items, now); changed = true; log(`Wczesne ostrzeżenie na ${region}: ${items.length} wpis(ów)`); }
    catch (e) { log(`Telegram (wczesne) ${region}: ${e.message}`); }
  }
  // stan zapisujemy zawsze, gdy coś wysłano (albo wygasły stare wpisy) – po zapisie każdej wysyłki ponowne uruchomienie nie dubluje
  if (changed || JSON.stringify(state) !== JSON.stringify(readEarly())) { try { writeFileSync(EARLY_STATE, JSON.stringify(state)); } catch (e) { log("early-state:", e.message); } }
}

const until = Date.now() + 52000;
for (;;) {
  await tick();
  try { await earlyTick(); } catch (e) { log("Wczesne ostrzeżenie:", e.message); }
  if (once || Date.now() + 10000 > until) break;
  await new Promise((r) => setTimeout(r, 10000));
}
