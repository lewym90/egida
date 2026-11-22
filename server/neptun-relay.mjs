// EGIDA – przekaźnik NEPTUN. Proces stały (uruchamia go co minutę run-neptun-relay.sh z blokadą; gdy padnie, wstaje w ≤ 1 min).
//  - JEDNO połączenie WebSocket z NEPTUN (zalecane przez operatora) + REST /threats co 15 s (resynchronizacja), /alerts i /messages co 30 s,
//  - lokalny serwer HTTP (tylko 127.0.0.1) z gotowym stanem dla aplikacji – na zewnątrz wystawia go Caddy (HTTPS),
//  - historia: zmiany obiektów do 400 km od granicy Polski, plik dzienny /opt/egida/neptun-history/RRRR-MM-DD.jsonl (60 dni),
//  - znacznik zdrowia /opt/egida/neptun-relay-health.json (czyta go strażnik).
// Gdy NEPTUN milczy dłużej niż 90 s, przekaźnik odpowiada 503 – aplikacja przechodzi wtedy na bezpośrednie połączenie z NEPTUN.
// Proces sam kończy pracę, gdy zmieni się jego kod (git pull), żeby cron uruchomił nową wersję.
// Środowisko: EGIDA_BASE, NEPTUN_RELAY_PORT (domyślnie 8790), NEPTUN_BASE (https://neptun.in.ua/api/v1).
import http from "node:http";
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, renameSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RelayState, historyDiff } from "./neptun-relay-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.EGIDA_BASE || "/opt/egida";
const PORT = Number(process.env.NEPTUN_RELAY_PORT || 8790);
const HOST = process.env.NEPTUN_RELAY_HOST || "127.0.0.1";
const API = (process.env.NEPTUN_BASE || "https://neptun.in.ua/api/v1").replace(/\/$/, "");
const WS_URL = process.env.NEPTUN_WS || API.replace(/^http/, "ws") + "/stream";
const HIST_DIR = process.env.NEPTUN_HISTORY_DIR || path.join(BASE, "neptun-history");
const HEALTH = path.join(BASE, "neptun-relay-health.json");
const KEEP_DAYS = 60;
const UA = "EGIDA-relay/1.0 (unofficial PWA; one WebSocket + REST resync every 15 s for all app users; repo lewym90/egida)";
const log = (...a) => console.log(new Date().toISOString(), ...a);

const S = new RelayState({ freshMs: Number(process.env.NEPTUN_RELAY_FRESH_MS || 90000) });
let ws = null, wsRetryMs = 5000, wsOpenAt = null, served = 0, notFresh = 0;

/* ---------- NEPTUN ---------- */
async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (r.status === 403 || r.status === 429) throw Object.assign(new Error(`HTTP ${r.status} – NEPTUN ogranicza dostęp`), { limit: true });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
let restBackoff = 0;
async function restThreats() {
  if (restBackoff > Date.now()) return;
  try { S.applySnapshot(await getJson(API + "/threats"), Date.now(), "rest"); }
  catch (e) { log("REST /threats:", e.message); if (e.limit) restBackoff = Date.now() + 5 * 6e4; }
}
async function restExtras() {
  if (restBackoff > Date.now()) return;
  try { S.applyAlerts(await getJson(API + "/alerts"), Date.now()); } catch (e) { log("REST /alerts:", e.message); if (e.limit) restBackoff = Date.now() + 5 * 6e4; }
  try { S.applyMessages(await getJson(API + "/messages"), Date.now()); } catch (e) { log("REST /messages:", e.message); }
}
function openWs() {
  if (typeof WebSocket === "undefined") { log("Brak WebSocket w tej wersji Node – działam tylko na REST"); return; }
  try { ws = new WebSocket(WS_URL); } catch (e) { log("WS:", e.message); return retryWs(); }
  const mine = ws;
  mine.onopen = () => { if (ws === mine) { wsOpenAt = Date.now(); wsRetryMs = 5000; log("WS połączony"); } };
  mine.onmessage = (ev) => {
    if (ws !== mine) return;
    try { S.applyEnvelope(JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)), Date.now()); } catch { /* uszkodzona ramka */ }
  };
  const lost = () => { if (ws !== mine) return; ws = null; wsOpenAt = null; retryWs(); };
  mine.onerror = lost; mine.onclose = lost;
}
function retryWs() {
  setTimeout(openWs, wsRetryMs);
  log(`WS rozłączony – ponowna próba za ${Math.round(wsRetryMs / 1000)} s`);
  wsRetryMs = Math.min(wsRetryMs * 2, 120000);
}
// WebSocket bez wiadomości > 60 s uznajemy za martwy (brak heartbeatów).
setInterval(() => { if (ws && wsOpenAt && S.via === "ws" && Date.now() - S.lastOkAt > 60000) { log("WS milczy > 60 s – zamykam"); try { ws.close(); } catch { /* */ } } }, 15000);

/* ---------- HTTP dla aplikacji ---------- */
// Odpowiedzi budujemy najwyżej raz na sekundę (lub przy zmianie stanu) i trzymamy też w wersji gzip – tysiące telefonów nie obciążają procesu,
// a telefon na danych komórkowych pobiera kilka KB. Gdy telefon ma już aktualną wersję (?since=N), odpowiadamy 204 bez treści.
const caches = { snap: { key: null, at: 0, raw: null, gz: null }, msg: { key: null, at: 0, raw: null, gz: null } };
function cached(name, key, now, build) {
  const c = caches[name];
  if (c.key !== key || now - c.at > 1000) { const raw = Buffer.from(JSON.stringify(build())); caches[name] = { key, at: now, raw, gz: gzipSync(raw) }; }
  return caches[name];
}
const HEAD = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Type": "application/json; charset=utf-8", Vary: "Accept-Encoding" };
function send(req, res, status, c) {
  const gz = /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
  const buf = gz ? c.gz : c.raw;
  res.writeHead(status, { ...HEAD, ...(gz ? { "Content-Encoding": "gzip" } : {}), "Content-Length": buf.length });
  res.end(req.method === "HEAD" ? undefined : buf);
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url || "/", "http://x");
  const p = u.pathname.replace(/^\/egida\/neptun/, "") || "/";
  if (req.method === "OPTIONS") { res.writeHead(204, HEAD); return res.end(); }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, HEAD); return res.end('{"error":"method"}'); }
  const now = Date.now();
  if (p === "/snapshot" || p === "/messages") {
    if (!S.isFresh(now)) { notFresh++; res.writeHead(503, HEAD); return res.end(JSON.stringify({ error: "NEPTUN nie odpowiada", lastOkAt: S.lastOkAt ? new Date(S.lastOkAt).toISOString() : null })); }
    served++;
    if (p === "/messages") return send(req, res, 200, cached("msg", S.msgVersion || 0, now, () => S.messagesPayload()));
    // „Bez zmian”: 204 + nagłówek z czasem serwera (aplikacja koryguje zegar i wie, że źródło żyje).
    if (u.searchParams.get("since") === String(S.version)) { res.writeHead(204, { ...HEAD, "X-Relay-Version": String(S.version), "X-Server-Time": new Date(now + S.offsetMs).toISOString(), "Access-Control-Expose-Headers": "X-Relay-Version, X-Server-Time" }); return res.end(); }
    return send(req, res, 200, cached("snap", S.version, now, () => S.payload(now)));
  }
  if (p === "/health") {
    res.writeHead(200, HEAD);
    return res.end(JSON.stringify({ ok: S.isFresh(now), lastOkAt: S.lastOkAt ? new Date(S.lastOkAt).toISOString() : null, via: S.via, ws: !!wsOpenAt, threats: S.threats.size, version: S.version, served, notFresh, uptimeSec: Math.round(process.uptime()) }));
  }
  res.writeHead(404, HEAD); res.end('{"error":"not found"}');
});
server.on("error", (e) => { log("Serwer HTTP:", e.message, "– kończę (cron spróbuje ponownie za minutę)"); process.exit(1); });
server.listen(PORT, HOST, () => log(`Przekaźnik nasłuchuje na ${HOST}:${PORT}`));

/* ---------- historia ---------- */
mkdirSync(HIST_DIR, { recursive: true });
let histPrev = new Map(), histDay = null;
function historyTick() {
  if (!S.isFresh(Date.now())) return;
  const now = new Date(), day = now.toISOString().slice(0, 10);
  const file = path.join(HIST_DIR, day + ".jsonl");
  if (day !== histDay) { histDay = day; histPrev = new Map(); } // nowy dzień: pierwszy wpis to pełny stan (plik da się czytać samodzielnie)
  const { line, next } = historyDiff(histPrev, S.threats);
  histPrev = next;
  if (line) try { appendFileSync(file, JSON.stringify({ t: now.toISOString(), ...line }) + "\n"); } catch (e) { log("Historia:", e.message); }
}
function historyCleanup() {
  const today = new Date().toISOString().slice(0, 10);
  for (const f of readdirSync(HIST_DIR)) {
    const m = /^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/.exec(f);
    if (!m) continue;
    const full = path.join(HIST_DIR, f);
    if (Date.now() - Date.parse(m[1] + "T00:00:00Z") > KEEP_DAYS * 864e5) { try { unlinkSync(full); } catch { /* */ } continue; }
    if (!m[2] && m[1] < today) { try { writeFileSync(full + ".gz", gzipSync(readFileSync(full))); unlinkSync(full); } catch (e) { log("Kompresja historii:", e.message); } }
  }
}

/* ---------- zdrowie, aktualizacja kodu ---------- */
const codeFiles = ["neptun-relay.mjs", "neptun-relay-lib.mjs"].map((f) => path.join(here, f));
const codeStamp = () => codeFiles.map((f) => { try { return statSync(f).mtimeMs; } catch { return 0; } }).join("|");
const startStamp = codeStamp();
const STARTED = Date.now();
function healthTick() {
  const h = { lastOk: S.lastOkAt, at: Date.now(), started: STARTED, via: S.via, ws: !!wsOpenAt, threats: S.threats.size, served, notFresh, pid: process.pid };
  try { writeFileSync(HEALTH + ".tmp", JSON.stringify(h)); renameSync(HEALTH + ".tmp", HEALTH); } catch { /* */ }
  if (codeStamp() !== startStamp) { log("Zmienił się kod przekaźnika – kończę, cron uruchomi nową wersję"); process.exit(0); }
}

/* ---------- start ---------- */
log(`Start przekaźnika NEPTUN (pid ${process.pid})`);
restThreats(); restExtras(); openWs();
// Warunki NEPTUN: REST nie częściej niż co 5 s – dla prawdziwego NEPTUN wymuszamy co najmniej 5 s (krótsze tylko dla atrapy w testach).
const minMs = /neptun\.in\.ua/.test(API) ? 5000 : 100;
setInterval(restThreats, Math.max(minMs, Number(process.env.NEPTUN_RELAY_REST_MS || 15000)));
setInterval(restExtras, Math.max(minMs, Number(process.env.NEPTUN_RELAY_EXTRAS_MS || 30000)));
setInterval(historyTick, 10000);
setInterval(healthTick, 30000); healthTick();
historyCleanup(); setInterval(historyCleanup, 6 * 36e5);
process.on("SIGTERM", () => { log("SIGTERM – kończę"); process.exit(0); });
