// Połączenie z NEPTUN: WebSocket (zalecany przez operatora), a gdy nie działa – odpytywanie REST.
// Warunki NEPTUN: REST nie częściej niż co 5 s (my: co 15 s); widoczny link do neptun.in.ua przy danych;
// zastrzeżenie, że to nie jest oficjalny system ostrzegania (oba elementy są w interfejsie mapy).
// Połączenie otwieramy tylko po wyraźnej zgodzie użytkownika i tylko gdy ekran mapy jest otwarty.
import { ThreatStore, applyEnvelope, applySnapshotJson, applyAlertsJson, applyMessagesJson, LIMITS } from "./neptun.js";

/**
 * opts: { restUrl, wsUrl, onChange(), onStatus(status), store?, pollMs?, fetchImpl?, WS? }
 * status.state: "off" | "connecting" | "live" | "polling" | "offline"
 */
export function createFeed(opts) {
  const o = { pollMs: 15000, wsRetryMs: 60000, wsRetryMaxMs: 300000, watchdogMs: 10000, staleMs: LIMITS.feedFreshSec * 1000, fetchImpl: (...a) => fetch(...a), WS: globalThis.WebSocket, ...opts };
  const store = opts.store || new ThreatStore();
  let ws = null, wsOpen = false, extraT = null, pollT = null, retryT = null, dogT = null, connT = null, running = false, retryMs = o.wsRetryMs;
  let status = { state: "off", via: null, lastOkAt: null, error: null, formatWarning: false };
  const set = (p) => { status = { ...status, ...p }; o.onStatus?.({ ...status }); };
  const touch = (via) => set({ state: via === "ws" ? "live" : "polling", via, lastOkAt: Date.now(), error: null });
  const checkFormat = () => set({ formatWarning: store.stats.seen > 0 && store.stats.bad === store.stats.seen });
  const isFresh = () => status.lastOkAt != null && Date.now() - status.lastOkAt <= o.staleMs;

  async function pollOnce() {
    if (!running) return;
    try {
      const r = await o.fetchImpl(o.restUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      applySnapshotJson(store, await r.json());
      checkFormat();
      if (running) { touch(wsOpen ? "ws" : "rest"); o.onChange?.(); }
    } catch (e) {
      if (running) set({ error: String(e?.message || e) });
    }
  }
  /** Alarmy w Ukrainie i wiadomości: wolniej (co extrasMs), a ich błąd nigdy nie wpływa na „świeżość” obiektów. */
  async function extrasOnce() {
    if (!running) return;
    const one = async (url, apply, key) => {
      if (!url) return;
      try {
        const r = await o.fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        apply(store, await r.json());
      } catch (e) { store.extras[key] = String(e?.message || e); }
    };
    await one(o.alertsUrl, applyAlertsJson, "alertsErr");
    await one(o.messagesUrl, applyMessagesJson, "messagesErr");
    if (running) o.onChange?.();
  }
  function startPolling() { if (!pollT && running) { pollOnce(); pollT = setInterval(pollOnce, o.pollMs); } }
  function stopPolling() { if (pollT) { clearInterval(pollT); pollT = null; } }

  function scheduleRetry() {
    if (retryT || !running || !o.WS || !o.wsUrl) return;
    retryT = setTimeout(() => { retryT = null; openWs(); }, retryMs);
    retryMs = Math.min(retryMs * 2, o.wsRetryMaxMs);
  }
  function openWs() {
    if (!running || !o.WS || !o.wsUrl) { startPolling(); return; }
    try { ws = new o.WS(o.wsUrl); } catch { ws = null; startPolling(); scheduleRetry(); return; }
    const mine = ws;
    mine.onopen = () => { if (ws !== mine) return; wsOpen = true; stopPolling(); retryMs = o.wsRetryMs; };
    mine.onmessage = (ev) => {
      if (ws !== mine) return;
      try {
        const kind = applyEnvelope(store, JSON.parse(ev.data));
        if (kind === "invalid" || kind === "unknown") return;
        touch("ws");
        if (kind === "snapshot" || kind === "upsert" || kind === "remove" || kind === "alerts" || kind === "messages") { checkFormat(); o.onChange?.(); }
      } catch { /* uszkodzona ramka – pomijamy */ }
    };
    const lost = () => {
      if (ws !== mine) return;
      ws = null; wsOpen = false;
      if (!running) return;
      startPolling(); scheduleRetry();
    };
    mine.onerror = lost; mine.onclose = lost;
  }

  function watchdog() {
    if (!running) return;
    if (!isFresh() && status.state !== "offline") {
      // Cisza dłużej niż próg: uznajemy źródło za niedostępne. Połączenie WS bez heartbeatów też jest martwe.
      if (ws && wsOpen) { try { ws.close(); } catch { /* */ } }
      set({ state: "offline" });
    }
  }

  return {
    store,
    isFresh,
    status: () => ({ ...status }),
    pollOnce,
    start() {
      if (running) return;
      running = true; retryMs = o.wsRetryMs;
      set({ state: "connecting", error: null });
      openWs();
      pollOnce();                      // pierwsze dane bez czekania na WebSocket
      if (o.alertsUrl || o.messagesUrl) { extrasOnce(); extraT = setInterval(extrasOnce, o.extrasMs ?? 60000); }
      // Gdyby WebSocket zawisł bez błędu, po 5 s przechodzimy na odpytywanie REST.
      connT = setTimeout(() => { connT = null; if (running && !wsOpen) startPolling(); }, o.wsGraceMs ?? 5000);
      dogT = setInterval(watchdog, o.watchdogMs);
    },
    stop() {
      running = false;
      stopPolling();
      if (retryT) { clearTimeout(retryT); retryT = null; }
      if (dogT) { clearInterval(dogT); dogT = null; }
      if (extraT) { clearInterval(extraT); extraT = null; }
      if (connT) { clearTimeout(connT); connT = null; }
      if (ws) { const w = ws; ws = null; wsOpen = false; try { w.close(); } catch { /* */ } }
      set({ state: "off" });
    },
  };
}
