// Obserwator Alertów RCB o zagrożeniu z powietrza (gov.pl/web/rcb/komunikaty) – uruchamiany co minutę.
//  1. pobiera listę komunikatów RCB i strony alertów „z powietrza” z ostatnich dni,
//  2. zapisuje je w formacie alerts.json do pliku RCB_GOV_FILE (poll.mjs dołącza je do komunikatów aplikacji),
//  3. NOWE wysyłki od razu publikuje na kanałach Telegram województw (te same reguły wagi co dla RSO),
//  4. gdy pojawiło się coś nowego, zostawia znacznik rcb-publish.pending i uruchamia publikację komunikatów (run.sh w trybie
//     „tylko alerty”); dopóki publikacja się nie uda, ponawia ją co minutę.
// Zasady: respektujemy robots.txt gov.pl, kilka zapytań na minutę z odstępami, żadnych obejść blokad (błąd = zostają poprzednie dane).
// Bezpieczeństwo wysyłki: stan zapisujemy PO KAŻDEJ wysłanej wiadomości (proces może być przerwany przez `timeout`), a wpis uznajemy
// za wysłany na dany kanał dopiero po udanej wysyłce. Cały przebieg ma twardy termin (DEADLINE_MS), żeby zdążyć zapisać stan.
// Środowisko: EGIDA_BASE (/opt/egida), RCB_GOV_FILE, RCB_STATE, TELEGRAM_BOT_TOKEN, CHANNELS_FILE, APP_URL, RCB_TG=off (bez wysyłki),
//             RCB_PUBLISH=off (bez natychmiastowej publikacji), RCB_DEADLINE_MS. Flaga --dry: nic nie wysyła i nie zapisuje (podgląd).
import { readFileSync, writeFileSync, existsSync, renameSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RCB_LIST_URL, RCB_ORIGIN, parseList, parseAlertPage, toItems, isAirTopic } from "./rcb-gov-lib.mjs";
import { robotsAllows } from "./alarm-lib.mjs";
import { selectForTelegram, tgText } from "./tg-policy.mjs";

const T0 = Date.now();
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.EGIDA_BASE || "/opt/egida";
const OUT = process.env.RCB_GOV_FILE || path.join(BASE, "rcb-gov.json");
const STATE_FILE = process.env.RCB_STATE || path.join(BASE, "rcb-state.json");
const PENDING = path.join(BASE, "rcb-publish.pending");
// Tylko do testów (atrapy serwerów): inny adres gov.pl i API Telegrama.
const ORIGIN = process.env.RCB_ORIGIN_URL || RCB_ORIGIN;
const LIST_URL = process.env.RCB_ORIGIN_URL ? ORIGIN + "/web/rcb/komunikaty" : RCB_LIST_URL;
const TG_API = process.env.TELEGRAM_API || "https://api.telegram.org";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const APP_URL = process.env.APP_URL || "";
const DRY = process.argv.includes("--dry");
const UA = "EGIDA/1.0 (+https://github.com/lewym90/egida; unofficial safety app)";
// Uruchamiamy pod `timeout 45/50` – kończymy pracę wcześniej, żeby zawsze zdążyć zapisać stan.
const DEADLINE_MS = Number(process.env.RCB_DEADLINE_MS || 36000);
const left = () => DEADLINE_MS - (Date.now() - T0);
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
    if (attempt && left() < 12000) break;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" }, signal: AbortSignal.timeout(Math.max(3000, Math.min(10000, left() - 2000))), redirect: "follow" });
      if (r.status === 403 || r.status === 429) throw Object.assign(new Error("HTTP " + r.status + " (serwer odmówił – nie ponawiamy)"), { fatal: true });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } catch (e) { lastErr = e; if (e.fatal) break; await sleep(1500); }
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
/** Wysyłka z ponowieniem (sieć, 5xx, 429). Zwraca "ok" | "retry" (spróbuj w następnym przebiegu) | "permanent" (np. 400/403 – kanał nie istnieje). */
async function sendTelegram(chat, html) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt && left() < 6000) return "retry";
    try {
      const r = await fetch(`${TG_API}/bot${TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
        signal: AbortSignal.timeout(Math.max(3000, Math.min(10000, left() - 1000))),
      });
      if (r.ok) return "ok";
      const body = await r.text();
      if (r.status === 429) { const wait = Number(/retry_after"?\s*:\s*(\d+)/.exec(body)?.[1]) || 3; if (wait * 1000 > left() - 3000) return "retry"; await sleep(wait * 1000 + 300); continue; }
      if (r.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
      log(`Telegram ${r.status} (${chat}): ${body.slice(0, 160)} – nie ponawiam`);
      return "permanent";
    } catch (e) { log(`Telegram (${chat}): ${e.message}`); await sleep(1500 * (attempt + 1)); }
  }
  return "retry";
}

/** Publikacja komunikatów (run.sh tylko z częścią „alerty”), odłączona – ten proces nie czeka. run.sh sam pilnuje, by czekała tylko jedna. */
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
  state.sent ||= {}; state.sentTo ||= {}; state.sig ||= {}; state.danger ||= {}; state.firstSeen ||= {}; state.pages ||= {}; state.regionMemo ||= {};
  const saveState = () => { if (!DRY) writeAtomic(STATE_FILE, JSON.stringify(state)); };
  const prev = readJson(OUT, { items: [] });

  // robots.txt raz na dobę; gdy zabrania /web/rcb/ – nic nie pobieramy.
  if (!state.robots || now - state.robots.t > DAY) {
    try { const txt = await get(`${ORIGIN}/robots.txt`); state.robots = { t: now, ok: robotsAllows(txt, "/web/rcb/") }; }
    catch (e) { state.robots = { t: now - DAY + H, ok: state.robots?.ok ?? true }; log("robots.txt: " + e.message + " – sprawdzę ponownie za godzinę"); }
  }
  if (state.robots.ok === false) { log("robots.txt zabrania odczytu /web/rcb/ – nie pobieram"); saveState(); return; }

  let list;
  try { list = parseList(await get(LIST_URL), now, ORIGIN); }
  catch (e) {
    log("Lista komunikatów RCB: " + e.message);
    if (!DRY) writeAtomic(OUT, JSON.stringify({ ...prev, checkedAt: new Date(now).toISOString(), ok: false, error: String(e.message).slice(0, 200) }));
    saveState(); retryPending(); process.exitCode = 1; return;
  }
  if (!list.length) log("Uwaga: na liście komunikatów RCB nie rozpoznano żadnego „Alert RCB” – możliwa zmiana układu strony gov.pl");

  // Strony alertów „z powietrza”. Data z tytułu; gdy tytuł jej nie ma (inny zapis) – pobieramy stronę i bierzemy datę ze strony.
  const dayMs = (d) => Date.UTC(d.y, d.m - 1, d.d);
  const todayMs = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const ageDays = (d) => d ? (todayMs - dayMs(d)) / DAY : null;
  const cands = list.filter((x) => isAirTopic(x.title, x.intro)).map((x) => ({ ...x, date: x.date || state.pages[x.slug]?.date || null }))
    .filter((x) => x.date == null || Math.abs(ageDays(x.date)) <= KEEP_DAYS);
  // Najpierw najnowsze (bez daty traktujemy jak najnowsze), żeby przy wolnym gov.pl zdążyć z tym, co ważne teraz.
  cands.sort((a, b) => (a.date ? ageDays(a.date) : -1) - (b.date ? ageDays(b.date) : -1));
  const keepPrev = new Map(); // slug → poprzednie wpisy (gdy tej strony teraz nie pobieramy albo pobranie się nie udało)
  for (const it of prev.items || []) { if (!keepPrev.has(it.slug)) keepPrev.set(it.slug, []); keepPrev.get(it.slug).push(it); }
  const items = [];
  let errors = 0, fetched = 0;
  for (const c of cands) {
    const recent = c.date == null || ageDays(c.date) <= LOOK_DAYS;
    const p = state.pages[c.slug];
    if ((!recent && p && now - p.t < 30 * 6e4 && keepPrev.has(c.slug)) || left() < 6000) { items.push(...(keepPrev.get(c.slug) || [])); continue; }
    try {
      if (fetched++) await sleep(600);
      const page = parseAlertPage(await get(c.url), now);
      if (!page.date && c.date) page.date = c.date;
      if (page.date && Math.abs(ageDays(page.date)) > KEEP_DAYS) { state.pages[c.slug] = { t: now, n: page.entries.length, date: page.date }; continue; }
      // Pierwsze zobaczenie wpisów bez godziny (ich czas = kiedy je zobaczyliśmy; przy pierwszym uruchomieniu – data strony).
      for (const it of toItems(page, { slug: c.slug, url: c.url, firstSeen: state.firstSeen, now })) {
        if (it.key.includes("|-:-|") && !state.firstSeen[it.key]) state.firstSeen[it.key] = state.seeded ? now : Date.parse(it.published);
      }
      const fresh = toItems(page, { slug: c.slug, url: c.url, firstSeen: state.firstSeen, regionMemo: state.regionMemo, now });
      if (fresh.unresolved) log(`Strona ${c.slug}: ${fresh.unresolved} wysyłek bez rozpoznanego województwa – pominięte (sprawdź opis odbiorców na stronie)`);
      if (!page.entries.length) log(`Strona ${c.slug}: nie rozpoznano żadnej wysyłki (zmiana układu strony?) – zostają poprzednie wpisy`);
      items.push(...(fresh.length || !page.entries.length ? fresh.map((i) => ({ ...i, slug: c.slug })) : []), ...(!page.entries.length ? keepPrev.get(c.slug) || [] : []));
      state.pages[c.slug] = { t: now, n: page.entries.length, ...(page.date ? { date: page.date } : {}) };
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

  // Plik dla aplikacji zapisujemy PRZED wysyłką na Telegram (wysyłka może trwać i zostać przerwana).
  const prevIds = new Set((prev.items || []).map((i) => i.id));
  const newOnes = all.filter((i) => !prevIds.has(i.id));
  const lastOk = errors < cands.length || !cands.length ? now : prev.lastOk ?? null;
  const outObj = { checkedAt: new Date(now).toISOString(), lastOk, ok: errors === 0, ...(errors ? { error: `${errors} z ${cands.length} stron nie pobrano` } : {}), source: "RCB (gov.pl/web/rcb/komunikaty)", items: all };
  if (DRY) {
    const sel = selectForTelegram(all, state, { now, recentH: SEND_RECENT_H });
    log(`[podgląd] wpisów: ${all.length}, nowych: ${newOnes.length}, do Telegrama: ${sel.length}`);
    for (const { a, level } of sel) log(`[podgląd] ${level} → ${a.voivodeship}: ${a.title}`);
    return;
  }
  writeAtomic(OUT, JSON.stringify(outObj));
  const wasSeeded = !!state.seeded;
  if (newOnes.length && wasSeeded) { writeFileSync(PENDING, new Date(now).toISOString()); }

  // Telegram: nowe wysyłki wg tych samych reguł wagi co RSO. Pierwsze uruchomienie tylko zapamiętuje (bez wysyłki).
  let sentN = 0;
  if (!wasSeeded) {
    log(`Pierwsze uruchomienie: zapamiętuję ${all.length} wpisów bez wysyłania na Telegram.`);
    for (const a of all) { state.sent[a.id] = now; if (a.sig) state.sig[`${a.sig}:${a.voivodeship}`] = now; }
    state.seeded = true; saveState();
  } else {
    const toSend = selectForTelegram(all, state, { now, recentH: SEND_RECENT_H });
    const tgOn = process.env.RCB_TG !== "off" && !!TOKEN;
    if (!tgOn && toSend.length) log(`Telegram wyłączony – do wysłania byłoby: ${toSend.length}`);
    const channels = tgOn ? loadChannels() : {};
    for (const { a, level } of toSend) {
      const sigKey = a.sig ? `${a.sig}:${a.voivodeship}` : null;
      // Ta sama wysyłka pod innym identyfikatorem (np. RCB przebudowało stronę) – nie wysyłamy drugi raz.
      if (sigKey && state.sig[sigKey]) { state.sent[a.id] = now; continue; }
      if (!tgOn) { state.sent[a.id] = now; if (sigKey) state.sig[sigKey] = now; continue; }
      const targets = a.voivodeship === "all" ? Object.values(channels) : [channels[a.voivodeship]].filter(Boolean);
      if (!targets.length) log(`Brak kanału Telegram dla: ${a.voivodeship}`);
      let pending = false;
      for (const c of targets) {
        const k = `${a.id}>${c}`;
        if (state.sentTo[k]) continue;
        if (left() < 5000) { pending = true; break; }
        const r = await sendTelegram(c, tgText(a, level, { appUrl: APP_URL }));
        if (r === "retry") { pending = true; log(`Telegram (${a.voivodeship}): nie wysłano – spróbuję w następnym przebiegu`); continue; }
        state.sentTo[k] = now; // „ok” albo trwały błąd kanału (nie ponawiamy w nieskończoność)
        if (r === "ok") { sentN++; log(`Wysłano ${level} na ${a.voivodeship}: ${a.title}`); if (level === "danger" || level === "important") state.danger[a.voivodeship] = now; }
        saveState(); // po KAŻDEJ wiadomości – przerwany proces nie wyśle jej drugi raz
        await sleep(1100);
      }
      if (!pending) { state.sent[a.id] = now; if (sigKey) state.sig[sigKey] = now; saveState(); }
    }
  }
  for (const [k, t] of Object.entries(state.sent)) if (t < now - 14 * DAY) delete state.sent[k];
  for (const [k, t] of Object.entries(state.sentTo)) if (t < now - 14 * DAY) delete state.sentTo[k];
  for (const [k, t] of Object.entries(state.sig)) if (t < now - 14 * DAY) delete state.sig[k];
  for (const [k, t] of Object.entries(state.danger)) if (t < now - 2 * DAY) delete state.danger[k];
  for (const [k, t] of Object.entries(state.firstSeen)) if (t < now - 14 * DAY) delete state.firstSeen[k];
  for (const [k, p] of Object.entries(state.pages)) if (p.t < now - 14 * DAY) delete state.pages[k];
  { const live = new Set(Object.keys(state.pages)); for (const k of Object.keys(state.regionMemo)) if (!live.has(k.split("|")[0])) delete state.regionMemo[k]; }
  saveState();
  log(`Alerty RCB (gov.pl): stron ${cands.length}, wpisów ${all.length}${newOnes.length ? `, NOWE: ${newOnes.length}` : ""}${sentN ? `, Telegram: ${sentN}` : ""}${errors ? `, błędy: ${errors}` : ""}`);
  retryPending();
}
/** Dopóki istnieje znacznik rcb-publish.pending, co minutę uruchamiamy publikację (run.sh zdejmuje go po udanej publikacji). */
function retryPending() { if (!DRY && existsSync(PENDING) && publishNow()) log("Uruchomiono publikację komunikatów (nowy Alert RCB czeka na publikację)"); }
main().catch((e) => { console.error(e); process.exit(1); });
