// Wiadomości i utrudnienia drogowe z news.json → Telegram (kanały województw). Wywoływane z run.sh po aktualizacji wiadomości.
//   node tg-news.mjs             – wyślij nowe (przy pierwszym uruchomieniu tylko zapamiętuje bieżące wpisy, nic nie wysyła)
//   node tg-news.mjs --preview   – pokaż, co by poszło (bez wysyłki i bez zapisu stanu)
//   node tg-news.mjs --sample    – wyślij po jednej wiadomości próbnej każdego rodzaju na Twój czat (ADMIN_CHAT_ID)
// WYŁĄCZNIK: plik /opt/egida/tg-news.off (touch = wyłączone, rm = włączone) albo TELEGRAM_NEWS=0 w pliku env.
// Środowisko: TELEGRAM_BOT_TOKEN, CHANNELS_FILE, APP_URL, ADMIN_CHAT_ID, DATA_DIR, EGIDA_BASE, TELEGRAM_NEWS_KINDS (np. region,kraj,swiat,droga).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { normalizeNews } from "../js/news.js";
import { selectNews, markNewsSent, markSkipped, cleanSent, newsMessage, channelsFor, categoryOf, levelOf, sampleItems } from "./tg-news-lib.mjs";

const BASE = process.env.EGIDA_BASE || "/opt/egida";
const DATA = process.env.DATA_DIR || path.join(BASE, "data-repo");
const STATE = process.env.TG_NEWS_STATE || path.join(BASE, "tg-news-state.json");
const OFF_FILE = process.env.TG_NEWS_OFF_FILE || path.join(BASE, "tg-news.off");
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "", APP_URL = process.env.APP_URL || "", ADMIN = process.env.ADMIN_CHAT_ID || "";
const argv = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };

/** Kanały: ten sam układ co w poll.mjs (TELEGRAM_CHANNELS, TELEGRAM_PREFIX/REGIONS, TELEGRAM_PRIVATE, channels.json). */
function loadChannels() {
  const ch = {};
  try { Object.assign(ch, JSON.parse(process.env.TELEGRAM_CHANNELS || "{}")); } catch { console.error("TELEGRAM_CHANNELS: niepoprawny JSON"); }
  for (const id of (process.env.TELEGRAM_REGIONS || "").split(",").map((x) => x.trim()).filter(Boolean)) ch[id] ??= "@" + (process.env.TELEGRAM_PREFIX || "egida_") + id.replace(/-/g, "_");
  try { for (const [id, v] of Object.entries(JSON.parse(process.env.TELEGRAM_PRIVATE || "{}"))) if (/^-?\d{5,}$/.test(String(v?.chat))) ch[id] = String(v.chat); } catch { console.error("TELEGRAM_PRIVATE: niepoprawny JSON"); }
  const f = readJson(process.env.CHANNELS_FILE || path.join(BASE, "channels.json"), {});
  for (const [id, v] of Object.entries(f)) if (/^-?\d{5,}$/.test(String(v?.chat))) ch[id] = String(v.chat);
  return ch;
}

async function send(chat, html) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }), // powiadomienia normalne (z dźwiękiem)
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) return true;
    const body = await r.text();
    if (r.status === 429 && attempt === 0) { const ra = Number(/"retry_after":\s*(\d+)/.exec(body)?.[1] || 3); await sleep(Math.min(ra, 8) * 1000 + 200); continue; }
    throw new Error(`Telegram ${r.status}: ${body.slice(0, 160)}`);
  }
  return false;
}

async function main() {
  if (argv.includes("--sample")) {
    if (!TOKEN || !ADMIN) { console.log("Brak TELEGRAM_BOT_TOKEN lub ADMIN_CHAT_ID w pliku env."); process.exit(1); }
    for (const it of sampleItems()) { await send(ADMIN, newsMessage(it, { appUrl: APP_URL })); await sleep(700); }
    console.log("Wysłano wiadomości próbne na Twój czat (nie na kanały).");
    return;
  }
  const preview = argv.includes("--preview");
  if (!preview && (existsSync(OFF_FILE) || ["0", "off", "false"].includes(String(process.env.TELEGRAM_NEWS || "").toLowerCase()))) { console.log("Telegram z wiadomościami: wyłączony (plik tg-news.off albo TELEGRAM_NEWS=0)."); return; }
  if (!preview && !TOKEN) { console.log("Brak TELEGRAM_BOT_TOKEN – nic nie wysyłam."); return; }
  const raw = readJson(path.join(DATA, "news.json"), null);
  const feed = normalizeNews(raw);
  if (!feed) { console.log("Brak poprawnego news.json – nic nie wysyłam."); return; }
  if (!feed.generatedAt || Date.now() - Date.parse(feed.generatedAt) > 90 * 6e4) { console.log("news.json jest nieświeży (> 90 min) – nic nie wysyłam."); return; }
  const kinds = process.env.TELEGRAM_NEWS_KINDS ? new Set(process.env.TELEGRAM_NEWS_KINDS.split(",").map((x) => x.trim())) : null;
  const hadState = existsSync(STATE);
  const state = readJson(STATE, { sent: {}, titles: [], rate: { kraj: [], swiat: [] } });
  const now = Date.now();
  if (!preview && !hadState && !process.env.TELEGRAM_NEWS_SEND_ON_FIRST_RUN) {
    markSkipped(state, feed.items, now); writeFileSync(STATE, JSON.stringify(state));
    console.log(`Pierwsze uruchomienie: zapamiętuję ${feed.items.length} bieżących wpisów bez wysyłania. Od teraz idą tylko nowe.`);
    return;
  }
  const channels = loadChannels();
  const { send: list, state: st, duplicates } = selectNews(feed.items, state, { now, kinds });
  console.log(`Wpisów w news.json: ${feed.items.length}; do wysłania: ${list.length}; pominięte jako ta sama sprawa: ${duplicates.length}.`);
  if (preview) {
    for (const r of list) console.log(` [${r.cat}/${r.lv}] ${(r.it.region || "").padEnd(18)} ${String(r.it.title).slice(0, 80)} → ${channelsFor(r.it, channels).length} kanał(ów)`);
    if (list[0]) console.log("\nPrzykład:\n" + newsMessage(list[0].it, { appUrl: APP_URL }).replace(/<[^>]+>/g, ""));
    return;
  }
  markSkipped(st, duplicates, now);
  let sent = 0;
  for (const r of list) {
    const chats = channelsFor(r.it, channels);
    if (!chats.length) { console.log(`brak kanału dla ${r.it.region} – pomijam: ${r.it.title.slice(0, 60)}`); markNewsSent(st, r, now); continue; }
    const html = newsMessage(r.it, { appUrl: APP_URL });
    let ok = 0;
    for (const c of chats) { try { if (await send(c, html)) ok++; } catch (e) { console.error(e.message); } await sleep(70); }
    if (ok > 0) { markNewsSent(st, r, now); sent++; } // przy samych porażkach wpis zostaje na kolejną próbę
    writeFileSync(STATE, JSON.stringify(cleanSent(st, now)));
  }
  writeFileSync(STATE, JSON.stringify(cleanSent(st, now)));
  console.log(`Wysłano wiadomości: ${sent}.`);
}
main().catch((e) => { console.error("tg-news:", e.message); process.exit(0); });
