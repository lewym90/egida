// Obserwator Alertów RCB o zagrożeniu z powietrza (gov.pl/web/rcb/komunikaty) – uruchamiany co minutę.
//  1. pobiera listę komunikatów RCB i strony alertów „z powietrza” z ostatnich dni,
//  2. zapisuje je w formacie alerts.json do pliku RCB_GOV_FILE (poll.mjs dołącza je do komunikatów aplikacji),
//  3. NOWE wysyłki od razu publikuje na kanałach Telegram województw (te same reguły wagi co dla RSO),
//  4. gdy pojawiło się coś nowego, od razu uruchamia publikację komunikatów (run.sh w trybie „tylko alerty”).
// Zasady: respektujemy robots.txt gov.pl, kilka zapytań na minutę z odstępami, żadnych obejść blokad (błąd = zostają poprzednie dane).
// Środowisko: EGIDA_BASE (/opt/egida), RCB_GOV_FILE, RCB_STATE, TELEGRAM_BOT_TOKEN, CHANNELS_FILE, APP_URL, RCB_TG=off (bez wysyłki),
//             RCB_PUBLISH=off (bez natychmiastowej publikacji). Flaga --dry: nic nie wysyła i nie zapisuje (podgląd).
import { readFileSync, writeFileSync, existsSync, renameSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RCB_LIST_URL, RCB_ORIGIN, parseList, parseAlertPage, toItems, isAirTopic } from "./rcb-gov-lib.mjs";
import { robotsAllows } from "./alarm-lib.mjs";
import { selectForTelegram, tgText } from "./tg-policy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.EGIDA_BASE || "/opt/egida";
const OUT = process.env.RCB_GOV_FILE || path.join(BASE, "rcb-gov.json");
const STATE_FILE = process.env.RCB_STATE || path.join(BASE, "rcb-state.json");
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const APP_URL = process.env.APP_URL || "";
const DRY = process.argv.includes("--dry");
const UA = "EGIDA/1.0 (+https://github.com/lewym90/egida; unofficial safety app)";
const H = 36e5, DAY = 24 * H;
const KEEP_DAYS = 7;      // tyle dni wysyłki zostają w pliku (aplikacja pokazuje je w „Wcześniejszych”)
const LOOK_DAYS = 2;      // strony alertów z tylu ostatnich dni sprawdzamy co minutę (RCB dopisuje aktualizacje na tej samej stronie)
const SEND_RECENT_H = 3;  // na Telegram idą tylko wysyłki z ostatnich 3 h (stare nie „wyskakują” po przerwie serwera)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
const writeAtomic = (f, data) => { const tmp = f + ".tmp"; writeFileSync(tmp, data); renameSync(tmp, f); };
const log = (m) => console.log(`${new Date().toISOString()} ${m}`);

async function get(url) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
      if (r.status === 403 || r.status === 429) throw Object.assign(new Error("HTTP " + r.status + " (serwer odmówił – nie ponawiamy)"), { fatal: true });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } catch (e) { lastErr = e; if (e.fatal) break; await sleep(3000); }
  }
  throw lastErr;
}

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
async function sendTelegram(chat, html) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) return;
    const body = await r.text();
    const wait = Number(/retry_after"?\s*:\s*(\d+)/.exec(body)?.[1]);
    if (r.status === 429 && wait && wait < 30 && attempt === 0) { await sleep(wait * 1000 + 300); continue; }
    throw new Error(`Telegram ${r.status}: ${body.slice(0, 160)}`);
  }
}

/** Natychmiastowa publikacja komunikatów (run.sh tylko z częścią „alerty”). Odłączona – ten proces nie czeka. */
function publishNow() {
  const run = path.join(here, "run.sh");
  if (process.env.RCB_PUBLISH === "off" || !existsSync(run) || !existsSync(path.join(BASE, "env"))) return false;
  try {
    const out = openSync(path.join(BASE, "log.txt"), "a");
    spawn("bash", [run], { detached: true, stdio: ["ignore", out, out], env: { ...process.env, EGIDA_ALERTS_ONLY: "1" } }).unref();
    return true;
  } catch (e) { log("Publikacja natychmiastowa nieudana: " + e.message); return false; }
}

async function main() {
  const now = Date.now();
  const state = readJson(STATE_FILE, {});
  state.sent ||= {}; state.danger ||= {}; state.firstSeen ||= {}; state.pages ||= {};
  const prev = readJson(OUT, { items: [] });
  const health = { lastOk: prev.lastOk ?? null, lastError: null };

  // robots.txt raz na dobę; gdy zabrania /web/rcb/ – nic nie pobieramy.
  if (!state.robots || now - state.robots.t > DAY) {
    try { const txt = await get(`${RCB_ORIGIN}/robots.txt`); state.robots = { t: now, ok: robotsAllows(txt, "/web/rcb/") }; }
    catch (e) { state.robots = { t: now - DAY + H, ok: state.robots?.ok ?? true }; log("robots.txt: " + e.message + " – sprawdzę ponownie za godzinę"); }
  }
  if (state.robots.ok === false) { log("robots.txt zabrania odczytu /web/rcb/ – nie pobieram"); if (!DRY) writeAtomic(STATE_FILE, JSON.stringify(state)); return; }

  let list;
  try { list = parseList(await get(RCB_LIST_URL), now); }
  catch (e) {
    log("Lista komunikatów RCB: " + e.message);
    if (!DRY) { writeAtomic(OUT, JSON.stringify({ ...prev, checkedAt: new Date(now).toISOString(), ok: false, error: String(e.message).slice(0, 200) })); writeAtomic(STATE_FILE, JSON.stringify(state)); }
    process.exitCode = 1; return;
  }
  if (!list.length) log("Uwaga: na liście komunikatów RCB nie rozpoznano żadnego „Alert RCB” – możliwa zmiana układu strony gov.pl");

  // Strony alertów „z powietrza” z ostatnich dni. Najnowsze (≤ LOOK_DAYS) sprawdzamy przy każdym przebiegu, starsze co 30 min.
  const dayMs = (d) => Date.UTC(d.y, d.m - 1, d.d);
  const todayMs = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const cands = list.filter((x) => x.date && isAirTopic(x.title, x.intro) && Math.abs(todayMs - dayMs(x.date)) <= KEEP_DAYS * DAY);
  const bySlug = new Map((prev.items || []).map((i) => [i.slug, true]));
  const keepPrev = new Map(); // slug → poprzednie wpisy (gdy tej strony teraz nie pobieramy albo pobranie się nie udało)
  for (const it of prev.items || []) { if (!keepPrev.has(it.slug)) keepPrev.set(it.slug, []); keepPrev.get(it.slug).push(it); }
  const items = [];
  let errors = 0;
  for (const c of cands) {
    const recent = todayMs - dayMs(c.date) <= LOOK_DAYS * DAY;
    const p = state.pages[c.slug];
    if (!recent && p && now - p.t < 30 * 6e4 && bySlug.has(c.slug)) { items.push(...(keepPrev.get(c.slug) || [])); continue; }
    try {
      await sleep(800);
      const page = parseAlertPage(await get(c.url), now);
      // Pierwsze zobaczenie wpisów bez godziny (ich czas = kiedy je zobaczyliśmy; przy pierwszym uruchomieniu – data strony).
      const draft = toItems(page, { slug: c.slug, url: c.url, firstSeen: state.firstSeen, now });
      for (const it of draft) if (/\|-:-\|/.test(it.key) && !state.firstSeen[it.key]) state.firstSeen[it.key] = state.seeded ? now : Date.parse(it.published);
      const fresh = toItems(page, { slug: c.slug, url: c.url, firstSeen: state.firstSeen, now }).map((i) => ({ ...i, slug: c.slug }));
      if (!fresh.length && page.entries.length) log(`Strona ${c.slug}: ${page.entries.length} wpisów, ale bez rozpoznanego województwa/daty`);
      if (!page.entries.length) log(`Strona ${c.slug}: nie rozpoznano żadnej wysyłki (zmiana układu strony?) – zostają poprzednie wpisy`);
      items.push(...(fresh.length ? fresh : keepPrev.get(c.slug) || []));
      state.pages[c.slug] = { t: now, n: page.entries.length };
    } catch (e) {
      errors++; log(`Strona ${c.slug}: ${e.message} – zostają poprzednie wpisy`);
      items.push(...(keepPrev.get(c.slug) || []));
      if (e.fatal) break;
    }
  }
  // Wpisy stron, które zniknęły z pierwszej strony listy, zostają do KEEP_DAYS (lista pokazuje tylko kilkanaście ostatnich komunikatów).
  const have = new Set(items.map((i) => i.slug));
  for (const [slug, arr] of keepPrev) if (!have.has(slug)) items.push(...arr);
  const cutoff = now - KEEP_DAYS * DAY;
  const uniq = new Map();
  for (const it of items) if (Date.parse(it.published) >= cutoff && !uniq.has(it.id)) uniq.set(it.id, it);
  const all = [...uniq.values()].sort((a, b) => b.published.localeCompare(a.published));

  // Telegram: nowe wysyłki wg tych samych reguł wagi co RSO. Pierwsze uruchomienie tylko zapamiętuje (bez wysyłki).
  const toSend = selectForTelegram(all, state, { now, recentH: SEND_RECENT_H });
  const prevIds = new Set((prev.items || []).map((i) => i.id));
  const isNew = all.some((i) => !prevIds.has(i.id));
  const wasSeeded = !!state.seeded;
  if (!state.seeded) { log(`Pierwsze uruchomienie: zapamiętuję ${all.length} wpisów bez wysyłania na Telegram.`); }
  else if (DRY) { for (const { a, level } of toSend) log(`[podgląd] ${level} → ${a.voivodeship}: ${a.title}`); }
  else if (process.env.RCB_TG === "off" || !TOKEN) { if (toSend.length) log(`Telegram wyłączony – do wysłania byłoby: ${toSend.length}`); }
  else {
    const channels = loadChannels();
    for (const { a, level } of toSend) {
      const targets = a.voivodeship === "all" ? Object.values(channels) : [channels[a.voivodeship]].filter(Boolean);
      for (const c of targets) {
        try { await sendTelegram(c, tgText(a, level, { appUrl: APP_URL })); log(`Wysłano ${level} na ${a.voivodeship}: ${a.title}`); }
        catch (e) { log(`Telegram (${a.voivodeship}): ${e.message}`); }
        await sleep(1100);
      }
      if (!targets.length) log(`Brak kanału Telegram dla: ${a.voivodeship}`);
    }
  }
  // Zapamiętujemy też ostrzeżenia (nie tylko zagrożenia), żeby po „atak na Ukrainie – sytuacja monitorowana” poszło też zakończenie.
  for (const { a, level } of toSend) if (level === "danger" || level === "important") state.danger[a.voivodeship] = now;
  for (const a of all) if (!state.sent[a.id]) state.sent[a.id] = now;
  state.seeded = true;
  for (const [k, t] of Object.entries(state.sent)) if (t < now - 14 * DAY) delete state.sent[k];
  for (const [k, t] of Object.entries(state.danger)) if (t < now - 2 * DAY) delete state.danger[k];
  for (const [k, t] of Object.entries(state.firstSeen)) if (t < now - 14 * DAY) delete state.firstSeen[k];
  for (const [k, p] of Object.entries(state.pages)) if (p.t < now - 14 * DAY) delete state.pages[k];

  if (errors < cands.length || !cands.length) health.lastOk = now;
  const outObj = { checkedAt: new Date(now).toISOString(), lastOk: health.lastOk, ok: errors === 0, ...(errors ? { error: `${errors} z ${cands.length} stron nie pobrano` } : {}), source: "RCB (gov.pl/web/rcb/komunikaty)", items: all };
  if (DRY) { log(`[podgląd] wpisów: ${all.length}, nowych: ${all.filter((i) => !prevIds.has(i.id)).length}, do Telegrama: ${toSend.length}`); for (const i of all.slice(0, 20)) log(`  ${i.published} ${i.voivodeship} ${i.title}`); return; }
  writeAtomic(OUT, JSON.stringify(outObj));
  writeAtomic(STATE_FILE, JSON.stringify(state));
  log(`Alerty RCB (gov.pl): stron ${cands.length}, wpisów ${all.length}${isNew ? `, NOWE: ${all.filter((i) => !prevIds.has(i.id)).length}` : ""}${toSend.length ? `, Telegram: ${toSend.length}` : ""}${errors ? `, błędy: ${errors}` : ""}`);
  if (isNew && wasSeeded && publishNow()) log("Uruchomiono natychmiastową publikację komunikatów");
}
main().catch((e) => { console.error(e); process.exit(1); });
