// Strażnik: sprawdza, czy komunikaty naprawdę docierają do aplikacji, i pisze do administratora, gdy nie.
// Uruchamiany z crona co 10 min przez run-watchdog.sh (install.sh --watchdog-cron), niezależnie od run.sh.
// Alarm, gdy: (1) ostatnia udana publikacja jest starsza niż 30 min, (2) opublikowany alerts.json (to, co widzi aplikacja) jest starszy niż 40 min,
// (3) opublikowany news.json (wiadomości) jest starszy niż 90 min albo (4) odpowiada mniej niż 60% źródeł wiadomości (news-report.json).
// Od v42 także: (5) air.json (powietrze) starszy niż 3 h, (6) pliki dzienne (AED, szpitale, schrony, woda) starsze niż 48 h, (7) GDDKiA nie zwraca danych od ponad 6 h,
// (8) odsetek adresów AED poniżej 90% i bez wzrostu od 72 h. Oraz przypomnienia o terminach (odnowienie serwera, wygaśnięcie tokenu): 14 i 3 dni przed.
// Wymaga ADMIN_CHAT_ID i TELEGRAM_BOT_TOKEN w /opt/egida/env. Opcje: --status (tylko pokaż), --test (wyślij próbną wiadomość).
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LIMITS = { pushMin: 30, remoteMin: 40, newsMin: 90, newsOkRatio: 0.6, remindH: 6, airMin: 180, dailyH: 48, gddkiaH: 6, addrStallH: 72, addrMinPct: 90 };
/** Terminy, o których przypominamy administratorowi (data|opis; zmienna WD_DEADLINES nadpisuje, rozdzielone średnikiem). */
export const DEADLINES = [{ date: "2026-10-30", label: "Odnowienie serwera (VPS)" }, { date: "2027-01-07", label: "Wygaśnięcie tokenu GitHub (GH_TOKEN w /opt/egida/env)" }];
export const REMIND_DAYS = [14, 3];

/** Czysta ocena: { pushAgeMin, remoteAgeMin, newsAgeMin, newsSources, newsOk, airAgeMin, dailyAgesH, gddkiaBadH, addrPct, addrStallH } (null/undefined = nieznane) → { problem, reasons }. */
export function evaluate({ pushAgeMin, remoteAgeMin, newsAgeMin = null, newsSources = null, newsOk = null, airAgeMin = null, dailyAgesH = null, gddkiaBadH = null, addrPct = null, addrStallH = null }, limits = LIMITS) {
  const reasons = [];
  if (pushAgeMin == null) reasons.push("serwer jeszcze nigdy nie opublikował danych");
  else if (pushAgeMin > limits.pushMin) reasons.push(`ostatnia udana publikacja była ${Math.round(pushAgeMin)} min temu`);
  if (remoteAgeMin != null && remoteAgeMin > limits.remoteMin) reasons.push(`dane widoczne dla aplikacji mają ${Math.round(remoteAgeMin)} min`);
  if (newsAgeMin != null && newsAgeMin > limits.newsMin) reasons.push(`wiadomości (news.json) mają ${Math.round(newsAgeMin)} min`);
  if (newsSources > 0 && newsOk != null && newsOk / newsSources < limits.newsOkRatio) reasons.push(`odpowiada tylko ${newsOk} z ${newsSources} źródeł wiadomości`);
  if (airAgeMin != null && airAgeMin > limits.airMin) reasons.push(`jakość powietrza (air.json) ma ${Math.round(airAgeMin)} min`);
  for (const [name, h] of Object.entries(dailyAgesH || {})) if (h != null && h > limits.dailyH) reasons.push(`plik ${name} nie był odświeżany od ${Math.round(h)} h`);
  if (gddkiaBadH != null && gddkiaBadH > limits.gddkiaH) reasons.push(`źródło GDDKiA (drogi) nie zwraca danych od ${Math.round(gddkiaBadH)} h`);
  if (addrPct != null && addrPct < limits.addrMinPct && addrStallH != null && addrStallH > limits.addrStallH) reasons.push(`adresy AED stoją na ${addrPct}% od ${Math.round(addrStallH)} h`);
  return { problem: reasons.length > 0, reasons };
}

/** Maszyna stanów powiadomień: co wysłać przy tej ocenie. state = { down, since, notified } → { action, state }. */
export function decide(problem, state, now = Date.now(), limits = LIMITS) {
  const s = { down: false, since: null, notified: null, ...state };
  if (problem && !s.down) return { action: "down", state: { down: true, since: now, notified: now } };
  if (problem && s.down && now - (s.notified || 0) > limits.remindH * 36e5) return { action: "remind", state: { ...s, notified: now } };
  if (!problem && s.down) return { action: "up", state: { down: false, since: null, notified: null } };
  return { action: "none", state: s };
}

/** Przypomnienia o terminach: dla każdego terminu wysyła raz przy ≤14 dniach i raz przy ≤3 dniach. sent: { "<data>": [14, 3] } (już wysłane progi). Zwraca { messages, sent }. */
export function dueReminders(deadlines, sent = {}, now = Date.now(), days = REMIND_DAYS) {
  const messages = [], next = { ...sent };
  for (const d of deadlines) {
    const t = Date.parse(d.date + "T00:00:00Z");
    if (!Number.isFinite(t)) continue;
    const left = Math.round((t - Math.floor(now / 864e5) * 864e5) / 864e5); // dni kalendarzowe (UTC)
    if (left < 0) continue; // termin minął
    const done = new Set(next[d.date] || []);
    const due = days.filter((x) => left <= x && !done.has(x));
    if (!due.length) continue;
    messages.push({ key: d.date, text: `EGIDA: przypomnienie. ${d.label} – ${left === 0 ? "dziś" : left === 1 ? "jutro" : `za ${left} dni`} (${d.date}).` });
    next[d.date] = [...new Set([...done, ...due])].sort((a, b) => b - a);
  }
  return { messages, sent: next };
}
export function parseDeadlines(env) {
  if (!env) return DEADLINES;
  const out = String(env).split(";").map((x) => x.split("|")).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test((p[0] || "").trim()) && (p[1] || "").trim()).map(([date, label]) => ({ date: date.trim(), label: label.trim() }));
  return out.length ? out : DEADLINES;
}
/** Czyta z początku pliku pole tekstowe (np. "at" albo "updated") bez wczytywania całości (aed.json ma kilka MB). */
export async function headField(file, key, bytes = 400) {
  const { open } = await import("node:fs/promises");
  let fh; try { fh = await open(file, "r"); const buf = Buffer.alloc(bytes); const { bytesRead } = await fh.read(buf, 0, bytes, 0); const m = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(buf.toString("utf8", 0, bytesRead)); return m ? m[1] : null; } catch { return null; } finally { await fh?.close(); }
}

async function main() {
  const BASE = process.env.EGIDA_BASE || "/opt/egida";
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.ADMIN_CHAT_ID;
  const send = async (text) => {
    if (!token || !chat) { console.log("Brak ADMIN_CHAT_ID lub TELEGRAM_BOT_TOKEN w /opt/egida/env – nie mam komu wysłać:", text); return false; }
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(15000) }).catch((e) => ({ ok: false, status: String(e.message) }));
    if (!r.ok) console.error("Telegram: błąd", r.status);
    return !!r.ok;
  };
  if (process.argv.includes("--test")) { console.log((await send("EGIDA: próba strażnika. Jeśli to widzisz, powiadomienia o awarii serwera działają.")) ? "Wysłano próbną wiadomość." : "NIE wysłano (patrz wyżej)."); return; }

  const now = Date.now();
  let pushAgeMin = null;
  try { pushAgeMin = (now - (await stat(path.join(BASE, "last.push"))).mtimeMs) / 6e4; } catch { /* brak pliku = jeszcze nie publikowano */ }
  let remoteAgeMin = null, remoteNote = "";
  const url = process.env.ALERTS_URL || `https://raw.githubusercontent.com/${process.env.EGIDA_REPO || "lewym90/egida"}/data/alerts.json`;
  try {
    const r = await fetch(`${url}?t=${Math.floor(now / 60000)}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json(); const t = j?.updated ? new Date(j.updated).getTime() : NaN;
    if (Number.isFinite(t)) remoteAgeMin = (now - t) / 6e4; else remoteNote = "brak pola updated";
  } catch (e) { remoteNote = "nie udało się pobrać opublikowanych danych (" + e.message + ")"; }

  // Wiadomości: wiek opublikowanego news.json i zdrowie źródeł (news-report.json). Błąd pobrania nie jest alarmem serwera.
  const base = url.replace(/[^/]+$/, "");
  let newsAgeMin = null, newsSources = null, newsOk = null, newsNote = "";
  try {
    const r = await fetch(`${base}news.json?t=${Math.floor(now / 60000)}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const t = new Date((await r.json())?.generatedAt).getTime();
    if (Number.isFinite(t)) newsAgeMin = (now - t) / 6e4; else newsNote = "news.json bez pola generatedAt";
  } catch (e) { newsNote = "nie udało się pobrać news.json (" + e.message + ")"; }
  try {
    const r = await fetch(`${base}news-report.json?t=${Math.floor(now / 60000)}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json(); if (Number.isFinite(j?.sources) && Number.isFinite(j?.ok)) { newsSources = j.sources; newsOk = j.ok; }
  } catch { /* raport jest tylko dodatkiem */ }

  const file = path.join(BASE, "watchdog.json");
  let state = {}; try { state = JSON.parse(await readFile(file, "utf8")); } catch { /* pierwszy raz */ }
  // Od v42: powietrze, pliki dzienne, GDDKiA, adresy AED (lokalne pliki serwera) i terminy.
  const DATA = process.env.DATA_DIR || path.join(BASE, "data-repo");
  const ageOf = (iso, unitMs) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? (now - t) / unitMs : null; };
  const airAgeMin = ageOf(await headField(path.join(DATA, "air.json"), "updated"), 6e4);
  const dailyAgesH = {};
  for (const f of ["aed.json", "hospitals.json", "shelters.json", "water.json"]) { const h = ageOf(await headField(path.join(DATA, f), "at"), 36e5); if (h != null) dailyAgesH[f] = h; }
  let gddkiaBadH = null, gddkiaSince = state.gddkiaSince ?? null;
  try {
    const rep = JSON.parse(await readFile(path.join(DATA, "news-report.json"), "utf8")); const g = (rep.details || []).find((x) => x.id === "gddkia");
    if (g) { const bad = !g.ok || !(g.fetched > 0); gddkiaSince = bad ? (gddkiaSince ?? now) : null; gddkiaBadH = gddkiaSince ? (now - gddkiaSince) / 36e5 : null; }
  } catch { /* brak raportu – nie oceniamy */ }
  let addrPct = null, addrStallH = null, addrState = state.addr ?? null;
  try {
    const a = JSON.parse(await readFile(path.join(BASE, "aed-addr.json"), "utf8"));
    if (Number.isFinite(a?.pct)) { addrPct = a.pct; if (!addrState || a.pct >= addrState.pct + 0.5 || a.pct >= LIMITS.addrMinPct) addrState = { pct: a.pct, t: now }; addrStallH = (now - addrState.t) / 36e5; }
  } catch { /* brak pliku – nie oceniamy */ }
  const ev = evaluate({ pushAgeMin, remoteAgeMin, newsAgeMin, newsSources, newsOk, airAgeMin, dailyAgesH, gddkiaBadH, addrPct, addrStallH });
  const d = decide(ev.problem, state, now);
  const extras = { gddkiaSince, addr: addrState };
  const dl = dueReminders(parseDeadlines(process.env.WD_DEADLINES), state.sent || {}, now);
  console.log(`${new Date(now).toISOString()} publikacja: ${pushAgeMin == null ? "brak" : Math.round(pushAgeMin) + " min"} · opublikowane dane: ${remoteAgeMin == null ? "?" + (remoteNote ? " (" + remoteNote + ")" : "") : Math.round(remoteAgeMin) + " min"} · problem: ${ev.problem} · akcja: ${d.action}`);
  if (process.argv.includes("--status")) return;
  const detail = `\n${ev.reasons.join("; ")}.${remoteNote ? " Uwaga: " + remoteNote + "." : ""}${newsNote ? " Uwaga: " + newsNote + "." : ""}\nZajrzyj do /opt/egida/log.txt (np. tail -n 30 /opt/egida/log.txt). Aplikacja pokazuje „Brak aktualnych danych”.`;
  let ok = true;
  if (d.action === "down") ok = await send("EGIDA: PROBLEM z komunikatami." + detail);
  else if (d.action === "remind") ok = await send("EGIDA: problem nadal trwa od " + Math.round((now - d.state.since) / 6e4) + " min." + detail);
  else if (d.action === "up") ok = await send("EGIDA: komunikaty znowu docierają do aplikacji.");
  // Przypomnienia o terminach (osobne wiadomości; stan „wysłano” zapisujemy tylko po udanej wysyłce).
  let sentNow = state.sent || {};
  for (const m of dl.messages) { if (await send(m.text)) sentNow = { ...sentNow, [m.key]: dl.sent[m.key] }; }
  // Stan zapisujemy zawsze; jeśli wysyłka się nie udała, spróbujemy ponownie przy kolejnym przebiegu.
  if (ok || d.action === "none") await writeFile(file, JSON.stringify({ ...d.state, ...extras, sent: sentNow }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
