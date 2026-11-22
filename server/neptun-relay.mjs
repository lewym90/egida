// EGIDA – przekaźnik NEPTUN. Proces stały (pilnuje go run-neptun-relay.sh; cron co minutę sprawdza, czy pilnujący działa).
//  - JEDNO połączenie WebSocket z NEPTUN (zalecane przez operatora). REST /threats tylko wtedy, gdy WebSocket milczy (> 60 s),
//    oraz rzadka resynchronizacja co 5 min; /alerts i /messages co 60 s, ale tylko gdy WebSocket ich sam nie dostarcza.
//    Warunek NEPTUN „REST nie częściej niż co 5 s” jest spełniony z dużym zapasem (zwykle ~2 zapytania na minutę dla całej aplikacji).
//  - lokalny serwer HTTP (tylko 127.0.0.1) z gotowym stanem dla aplikacji – na zewnątrz wystawia go Caddy (HTTPS),
//  - z tego samego stanu korzystają obserwator Telegram (neptun-watch.mjs) i dziennik (neptun-log.mjs) – NEPTUN widzi jednego klienta,
//  - historia: zmiany obiektów do 400 km od granicy Polski, plik dzienny /opt/egida/neptun-history/RRRR-MM-DD.jsonl (60 dni),
//  - znacznik zdrowia /opt/egida/neptun-relay-health.json (czyta go strażnik).
// Gdy NEPTUN milczy dłużej niż 90 s, przekaźnik odpowiada 503 – aplikacja przechodzi wtedy na bezpośrednie połączenie z NEPTUN.
// Proces sam kończy pracę, gdy zmieni się jego kod (git pull) – pilnujący uruchamia nową wersję po 2 s.
// Kody wyjścia: 0 – zwykłe zakończenie / nowy kod, 3 – port zajęty (pilnujący czeka wtedy minutę).
// Środowisko: EGIDA_BASE, NEPTUN_RELAY_PORT (domyślnie 18960), NEPTUN_BASE (https://neptun.in.ua/api/v1), NEPTUN_RELAY_LOG (plik logu do przycinania).
import http from "node:http";
import { appendFileSync, mkdirSync, readdirSync, statSync, writeFileSync, renameSync, readFileSync } from "node:fs";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { gzipSync, gzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RelayState, historyDiff } from "./neptun-relay-lib.mjs";

const gzipAsync = promisify(gzip);
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.EGIDA_BASE || "/opt/egida";
const PORT = Number(process.env.NEPTUN_RELAY_PORT || 18960);
const HOST = process.env.NEPTUN_RELAY_HOST || "127.0.0.1";
const API = (process.env.NEPTUN_BASE || "https://neptun.in.ua/api/v1").replace(/\/$/, "");
const WS_URL = process.env.NEPTUN_WS || API.replace(/^http/, "ws") + "/stream";
const HIST_DIR = process.env.NEPTUN_HISTORY_DIR || path.join(BASE, "neptun-history");
const HEALTH = path.join(BASE, "neptun-relay-health.json");
const LOG_FILE = process.env.NEPTUN_RELAY_LOG || "";
const KEEP_DAYS = 60;
const UA = "EGIDA-relay/1.1 (unofficial PWA; one WebSocket shared by all app users, REST only as fallback; repo lewym90/egida)";
const log = (...a) => console.log(new Date().toISOString(), ...a);

// Warunki NEPTUN: REST nie częściej niż co 5 s – dla prawdziwego NEPTUN wymuszamy co najmniej 5 s (krótsze tylko dla atrapy w testach).
const MIN_MS = /neptun\.in\.ua/.test(API) ? 5000 : 50;
const env = (k, d) => Math.max(MIN_MS, Number(process.env[k] || d));
const WS_SILENT_MS = env("NEPTUN_RELAY_WS_SILENT_MS", 60000);   // WebSocket bez żadnej wiadomości dłużej = martwy
const REST_MS = env("NEPTUN_RELAY_REST_MS", 15000);             // co tyle REST /threats, gdy WebSocket nie działa
const RESYNC_MS = env("NEPTUN_RELAY_RESYNC_MS", 300000);        // pełna resynchronizacja REST mimo działającego WebSocket
const EXTRAS_MS = env("NEPTUN_RELAY_EXTRAS_MS", 60000);         // /alerts i /messages (gdy WebSocket ich nie dostarcza)
const WS_STABLE_MS = Number(process.env.NEPTUN_RELAY_WS_STABLE_MS || 60000); // dopiero tak długie połączenie zeruje wydłużanie przerw

const S = new RelayState({ freshMs: Number(process.env.NEPTUN_RELAY_FRESH_MS || 90000) });
let ws = null, wsRetryMs = 5000, wsOpenAt = null, wsLastAt = null, wsStableT = null, served = 0, notFresh = 0;
let lastRestAt = 0, restBackoff = 0, restBusy = false, extrasBusy = false;

const wsHealthy = (now = Date.now()) => !!(ws && wsOpenAt && wsLastAt && now - wsLastAt <= WS_SILENT_MS);

/* ---------- NEPTUN ---------- */
async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (r.status === 403 || r.status === 429) throw Object.assign(new Error(`HTTP ${r.status} – NEPTUN ogranicza dostęp`), { limit: true });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
const limited = (e) => { if (e.limit) { restBackoff = Date.now() + 5 * 6e4; log("NEPTUN ogranicza dostęp – REST wstrzymany na 5 min"); } };

/** REST /threats: gdy WebSocket nie działa (co REST_MS) albo raz na RESYNC_MS dla pewności. */
async function restThreats(force = false) {
  const now = Date.now();
  if (restBusy || restBackoff > now) return;
  if (!force && wsHealthy(now) && now - lastRestAt < RESYNC_MS) return;
  if (now - lastRestAt < MIN_MS) return;
  restBusy = true; lastRestAt = now;
  try { S.applySnapshot(await getJson(API + "/threats"), Date.now(), "rest"); }
  catch (e) { log("REST /threats:", e.message); limited(e); }
  finally { restBusy = false; }
}
/** /alerts i /messages – tylko jeśli WebSocket nie przysłał ich w ostatnim czasie. Rozdzielone w czasie od /threats. */
async function restExtras() {
  const now = Date.now();
  if (extrasBusy || restBackoff > now) return;
  extrasBusy = true;
  try {
    // REST potrzebny, gdy WebSocket nie działa albo w tym połączeniu jeszcze nie przysłał pełnej listy (potem dosyła zmiany sam);
    // dla pewności i tak raz na RESYNC_MS.
    const stale = (wsAt, at) => !wsHealthy(now) || wsAt == null || wsAt < wsOpenAt || at == null || now - at > RESYNC_MS;
    if (stale(S.alertsWsAt, S.alertsAt)) {
      try { S.applyAlerts(await getJson(API + "/alerts"), Date.now()); } catch (e) { log("REST /alerts:", e.message); limited(e); }
    }
    if (restBackoff <= Date.now() && stale(S.messagesWsAt, S.messagesAt)) {
      await new Promise((r) => setTimeout(r, MIN_MS)); // odstęp między zapytaniami
      try { S.applyMessages(await getJson(API + "/messages"), Date.now()); } catch (e) { log("REST /messages:", e.message); limited(e); }
    }
  } finally { extrasBusy = false; }
}

function openWs() {
  if (typeof WebSocket === "undefined") { log("Brak WebSocket w tej wersji Node – działam tylko na REST"); return; }
  try { ws = new WebSocket(WS_URL); } catch (e) { log("WS:", e.message); ws = null; return retryWs(); }
  const mine = ws;
  mine.onopen = () => {
    if (ws !== mine) return;
    wsOpenAt = Date.now(); wsLastAt = wsOpenAt; log("WS połączony");
    // Licznik przerw zerujemy dopiero po minucie stabilnego połączenia – połączenie zrywane zaraz po otwarciu nie zasypuje NEPTUN próbami.
    clearTimeout(wsStableT);
    wsStableT = setTimeout(() => { if (ws === mine && wsOpenAt) wsRetryMs = 5000; }, WS_STABLE_MS);
  };
  mine.onmessage = (ev) => {
    if (ws !== mine) return;
    const at = Date.now();
    wsLastAt = at;
    try { S.applyEnvelope(JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)), at); } catch { /* uszkodzona ramka */ }
  };
  const lost = () => {
    if (ws !== mine) return;
    ws = null; wsOpenAt = null; clearTimeout(wsStableT);
    try { mine.close(); } catch { /* */ }
    retryWs();
    restThreats(true); // od razu stan z REST, żeby nie czekać na następny takt
  };
  mine.onerror = lost; mine.onclose = lost;
}
function retryWs() {
  log(`WS rozłączony – ponowna próba za ${Math.round(wsRetryMs / 1000)} s`);
  setTimeout(openWs, wsRetryMs);
  wsRetryMs = Math.min(wsRetryMs * 2, 120000);
}
// Otwarty WebSocket bez żadnej wiadomości (także heartbeatu) > WS_SILENT_MS uznajemy za martwy.
function wsWatch() {
  if (ws && wsOpenAt && wsLastAt && Date.now() - wsLastAt > WS_SILENT_MS) {
    log(`WS milczy > ${Math.round(WS_SILENT_MS / 1000)} s – zamykam`);
    const w = ws; ws = null; wsOpenAt = null; clearTimeout(wsStableT);
    try { w.close(); } catch { /* */ }
    retryWs(); restThreats(true);
  }
}

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
    if (p === "/messages") return send(req, res, 200, cached("msg", S.msgVersion || 0, now, () => S.messagesPayload(now)));
    // „Bez zmian”: 204 + czas serwera i wiek danych (aplikacja koryguje zegar i wie, jak świeże jest źródło).
    if (u.searchParams.get("since") === String(S.version)) {
      res.writeHead(204, { ...HEAD, "X-Relay-Version": String(S.version), "X-Server-Time": new Date(now + S.offsetMs).toISOString(), "X-Relay-Age-Ms": String(Math.max(0, now - S.lastOkAt)), "Access-Control-Expose-Headers": "X-Relay-Version, X-Server-Time, X-Relay-Age-Ms" });
      return res.end();
    }
    // Pamięć podręczna wg wersji – ale co najwyżej 1 s, żeby relay.at/lastOkAt w odpowiedzi nie były stare.
    return send(req, res, 200, cached("snap", S.version, now, () => S.payload(now)));
  }
  if (p === "/health") {
    res.writeHead(200, HEAD);
    return res.end(JSON.stringify({ ok: S.isFresh(now), lastOkAt: S.lastOkAt ? new Date(S.lastOkAt).toISOString() : null, via: S.via, ws: wsHealthy(now), threats: S.threats.size, version: S.version, served, notFresh, uptimeSec: Math.round(process.uptime()) }));
  }
  res.writeHead(404, HEAD); res.end('{"error":"not found"}');
});
server.on("error", (e) => {
  log("Serwer HTTP:", e.message, e.code === "EADDRINUSE" ? `– port ${PORT} zajęty, kończę (kod 3)` : "– kończę");
  process.exit(e.code === "EADDRINUSE" ? 3 : 1);
});

/* ---------- historia ---------- */
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
let cleaning = false;
async function historyCleanup() {
  if (cleaning) return; cleaning = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    for (const f of readdirSync(HIST_DIR)) {
      const m = /^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/.exec(f);
      if (!m) continue;
      const full = path.join(HIST_DIR, f);
      if (Date.now() - Date.parse(m[1] + "T00:00:00Z") > KEEP_DAYS * 864e5) { await unlink(full).catch(() => {}); continue; }
      // Kompresja asynchroniczna – duży plik dnia nie zatrzymuje odpowiedzi dla telefonów.
      if (!m[2] && m[1] < today) {
        try { await writeFile(full + ".gz.tmp", await gzipAsync(await readFile(full))); renameSync(full + ".gz.tmp", full + ".gz"); await unlink(full); }
        catch (e) { log("Kompresja historii:", e.message); }
      }
    }
  } catch (e) { log("Porządki historii:", e.message); }
  finally { cleaning = false; }
}

/* ---------- log, zdrowie, aktualizacja kodu ---------- */
// Plik logu jest otwarty w trybie dopisywania (O_APPEND), więc przycięcie go w miejscu jest bezpieczne – kolejne wpisy trafią na koniec.
function trimLog() {
  if (!LOG_FILE) return;
  try {
    if (statSync(LOG_FILE).size <= 1_000_000) return;
    const lines = readFileSync(LOG_FILE, "utf8").split("\n");
    writeFileSync(LOG_FILE, lines.slice(-300).join("\n"));
  } catch { /* brak pliku */ }
}
const codeFiles = ["neptun-relay.mjs", "neptun-relay-lib.mjs", "../js/geo.js", "../js/poland-border.js"].map((f) => path.join(here, f));
const codeStamp = () => codeFiles.map((f) => { try { return statSync(f).mtimeMs; } catch { return 0; } }).join("|");
const startStamp = codeStamp();
const STARTED = Date.now();
function healthTick() {
  const h = { lastOk: S.lastOkAt, at: Date.now(), started: STARTED, via: S.via, ws: wsHealthy(), threats: S.threats.size, served, notFresh, pid: process.pid };
  try { writeFileSync(HEALTH + ".tmp", JSON.stringify(h)); renameSync(HEALTH + ".tmp", HEALTH); } catch { /* */ }
  if (codeStamp() !== startStamp) { log("Zmienił się kod przekaźnika – kończę, pilnujący uruchomi nową wersję"); process.exit(0); }
}

/* ---------- start ---------- */
// Najpierw port: dopiero gdy nasłuchujemy, łączymy się z NEPTUN (drugi egzemplarz przy zajętym porcie nie wysyła żadnych zapytań).
log(`Start przekaźnika NEPTUN (pid ${process.pid})`);
server.listen(PORT, HOST, () => {
  log(`Przekaźnik nasłuchuje na ${HOST}:${PORT}`);
  mkdirSync(HIST_DIR, { recursive: true });
  restThreats(true); openWs();
  setTimeout(() => { restExtras(); setInterval(restExtras, EXTRAS_MS); }, Math.min(30000, EXTRAS_MS / 2)); // przesunięte względem /threats
  setInterval(() => restThreats(false), REST_MS);
  setInterval(wsWatch, Math.min(15000, WS_SILENT_MS / 2));
  setInterval(historyTick, 10000);
  setInterval(healthTick, 30000); healthTick();
  historyCleanup(); setInterval(historyCleanup, 6 * 36e5);
  trimLog(); setInterval(trimLog, 36e5);
});
process.on("SIGTERM", () => { log("SIGTERM – kończę"); process.exit(0); });
