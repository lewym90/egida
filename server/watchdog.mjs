// Strażnik: sprawdza, czy komunikaty naprawdę docierają do aplikacji, i pisze do administratora, gdy nie.
// Uruchamiany z crona co 10 min przez run-watchdog.sh (install.sh --watchdog-cron), niezależnie od run.sh.
// Alarm, gdy: (1) ostatnia udana publikacja jest starsza niż 30 min albo (2) opublikowany alerts.json (to, co widzi aplikacja) jest starszy niż 40 min.
// Wymaga ADMIN_CHAT_ID i TELEGRAM_BOT_TOKEN w /opt/egida/env. Opcje: --status (tylko pokaż), --test (wyślij próbną wiadomość).
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LIMITS = { pushMin: 30, remoteMin: 40, remindH: 6 };

/** Czysta ocena: { pushAgeMin, remoteAgeMin } (null = nieznane) → { problem, reasons }. */
export function evaluate({ pushAgeMin, remoteAgeMin }, limits = LIMITS) {
  const reasons = [];
  if (pushAgeMin == null) reasons.push("serwer jeszcze nigdy nie opublikował danych");
  else if (pushAgeMin > limits.pushMin) reasons.push(`ostatnia udana publikacja była ${Math.round(pushAgeMin)} min temu`);
  if (remoteAgeMin != null && remoteAgeMin > limits.remoteMin) reasons.push(`dane widoczne dla aplikacji mają ${Math.round(remoteAgeMin)} min`);
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

  const ev = evaluate({ pushAgeMin, remoteAgeMin });
  const file = path.join(BASE, "watchdog.json");
  let state = {}; try { state = JSON.parse(await readFile(file, "utf8")); } catch { /* pierwszy raz */ }
  const d = decide(ev.problem, state, now);
  console.log(`${new Date(now).toISOString()} publikacja: ${pushAgeMin == null ? "brak" : Math.round(pushAgeMin) + " min"} · opublikowane dane: ${remoteAgeMin == null ? "?" + (remoteNote ? " (" + remoteNote + ")" : "") : Math.round(remoteAgeMin) + " min"} · problem: ${ev.problem} · akcja: ${d.action}`);
  if (process.argv.includes("--status")) return;
  const detail = `\n${ev.reasons.join("; ")}.${remoteNote ? " Uwaga: " + remoteNote + "." : ""}\nZajrzyj do /opt/egida/log.txt (np. tail -n 30 /opt/egida/log.txt). Aplikacja pokazuje „Brak aktualnych danych”.`;
  let ok = true;
  if (d.action === "down") ok = await send("EGIDA: PROBLEM z komunikatami." + detail);
  else if (d.action === "remind") ok = await send("EGIDA: problem nadal trwa od " + Math.round((now - d.state.since) / 6e4) + " min." + detail);
  else if (d.action === "up") ok = await send("EGIDA: komunikaty znowu docierają do aplikacji.");
  // Stan zapisujemy zawsze; jeśli wysyłka się nie udała, spróbujemy ponownie przy kolejnym przebiegu.
  if (ok || d.action === "none") await writeFile(file, JSON.stringify(d.state));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
