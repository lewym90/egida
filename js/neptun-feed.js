// Połączenie z NEPTUN. Gdy ustawiono przekaźnik EGIDA (relayUrl): najpierw przekaźnik na serwerze EGIDA (jedno połączenie serwera
// z NEPTUN dla wszystkich telefonów), a gdy nie odpowiada 2 razy z rzędu – bezpośrednio NEPTUN (jak bez przekaźnika); co 30 s sprawdzamy,
// czy przekaźnik wrócił. Bez przekaźnika: WebSocket NEPTUN (zalecany przez operatora), a gdy nie działa – odpytywanie REST.
// Warunki NEPTUN: REST nie częściej niż co 5 s (my: co 15 s); widoczny link do neptun.in.ua przy danych;
// zastrzeżenie, że to nie jest oficjalny system ostrzegania (oba elementy są w interfejsie mapy).
// Połączenie otwieramy tylko po wyraźnej zgodzie użytkownika i tylko gdy ekran mapy jest otwarty.
import { ThreatStore, applyEnvelope, applySnapshotJson, applyAlertsJson, applyMessagesJson, LIMITS } from "./neptun.js";

/**
 * opts: { restUrl, wsUrl, relayUrl?, relayMessagesUrl?, onChange(), onStatus(status), store?, pollMs?, fetchImpl?, WS? }
 * status.state: "off" | "connecting" | "live" | "polling" | "offline"
 */
export function createFeed(opts) {
  const o = { pollMs: 15000, wsRetryMs: 60000, wsRetryMaxMs: 300000, watchdogMs: 10000, staleMs: LIMITS.feedFreshSec * 1000, fetchImpl: (...a) => fetch(...a), WS: globalThis.WebSocket, ...opts };
  const store = opts.store || new ThreatStore();
  let ws = null, wsOpen = false, extraT = null, pollT = null, retryT = null, dogT = null, connT = null, running = false, retryMs = o.wsRetryMs;
  // Przekaźnik: directOn = czy działa bezpośrednie połączenie z NEPTUN (bez przekaźnika zawsze true).
  let directOn = !o.relayUrl, relayT = null, relayFails = 0, relayVersion = null;
  let status = { state: "off", via: null, lastOkAt: null, error: null, formatWarning: false };
  const set = (p) => { status = { ...status, ...p }; o.onStatus?.({ ...status }); };
  const touch = (via) => set({ state: via === "ws" || via === "relay" ? "live" : "polling", via, lastOkAt: Date.now(), error: null });
  const checkFormat = () => set({ formatWarning: store.stats.seen > 0 && store.stats.bad === store.stats.seen });
  const isFresh = () => status.lastOkAt != null && Date.now() - status.lastOkAt <= o.staleMs;

  async function pollOnce() {
    if (!running || !directOn) return;
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
    // Przez przekaźnik: alarmy przychodzą razem z obiektami, a wiadomości osobno (rzadziej, bo są najcięższe).
    if (!directOn) {
      if (o.relayMessagesUrl) {
        try {
          const r = await o.fetchImpl(o.relayMessagesUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) });
          if (!r.ok) throw new Error("HTTP " + r.status);
          applyMessagesJson(store, await r.json());
        } catch (e) { store.extras.messagesErr = String(e?.message || e); }
        if (running) o.onChange?.();
      }
      return;
    }
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
  function startPolling() { if (!pollT && running && directOn) { pollOnce(); pollT = setInterval(pollOnce, o.pollMs); } }
  function stopPolling() { if (pollT) { clearInterval(pollT); pollT = null; } }

  function scheduleRetry() {
    if (retryT || !running || !directOn || !o.WS || !o.wsUrl) return;
    retryT = setTimeout(() => { retryT = null; openWs(); }, retryMs);
    retryMs = Math.min(retryMs * 2, o.wsRetryMaxMs);
  }
  function openWs() {
    if (!running || !directOn) return;
    if (!o.WS || !o.wsUrl) { startPolling(); return; }
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

  /* ---------- przekaźnik EGIDA ---------- */
  function startDirect() {
    if (directOn || !running) return;
    directOn = true; retryMs = o.wsRetryMs;
    openWs(); pollOnce();
    if (connT) clearTimeout(connT);
    connT = setTimeout(() => { connT = null; if (running && directOn && !wsOpen) startPolling(); }, o.wsGraceMs ?? 5000);
    extrasOnce();
  }
  function stopDirect() {
    if (!directOn || !o.relayUrl) return;
    directOn = false;
    stopPolling();
    if (retryT) { clearTimeout(retryT); retryT = null; }
    if (connT) { clearTimeout(connT); connT = null; }
    if (ws) { const w = ws; ws = null; wsOpen = false; try { w.close(); } catch { /* */ } }
  }
  async function relayOnce() {
    if (!running || !o.relayUrl) return;
    const url = o.relayUrl + (relayVersion != null && !directOn ? (o.relayUrl.includes("?") ? "&" : "?") + "since=" + encodeURIComponent(relayVersion) : "");
    try {
      const r = await o.fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!running) return;
      if (r.status === 204) {
        // Bez zmian od naszej wersji – źródło żyje.
        const st = r.headers?.get?.("X-Server-Time"); if (st) store.noteServerTime(st);
      } else {
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        applySnapshotJson(store, j);
        if (j && j.alerts) { try { applyAlertsJson(store, j.alerts); } catch (e) { store.extras.alertsErr = String(e?.message || e); } }
        relayVersion = j && j.version != null ? j.version : null;
        checkFormat();
      }
      relayFails = 0;
      const wasDirect = directOn;
      stopDirect();
      touch("relay");
      if (wasDirect) extrasOnce();
      o.onChange?.();
    } catch (e) {
      if (!running) return;
      relayFails++; relayVersion = null;
      set({ error: String(e?.message || e) });
      if (relayFails >= 2) startDirect();
    }
  }
  function relayLoop() {
    if (!running || !o.relayUrl) return;
    relayT = setTimeout(async () => { relayT = null; await relayOnce(); relayLoop(); }, directOn ? (o.relayRetryMs ?? 30000) : o.pollMs);
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
      if (o.relayUrl) {
        directOn = false; relayFails = 0; relayVersion = null;
        relayOnce().then(() => { if (running && relayFails && !directOn) relayOnce(); }).finally(relayLoop); // przy błędzie od razu druga próba, potem NEPTUN bezpośrednio
        if (o.alertsUrl || o.messagesUrl || o.relayMessagesUrl) { extraT = setInterval(extrasOnce, o.extrasMs ?? 60000); setTimeout(extrasOnce, 1500); }
        dogT = setInterval(watchdog, o.watchdogMs);
        return;
      }
      openWs();
      pollOnce();                      // pierwsze dane bez czekania na WebSocket
      if (o.alertsUrl || o.messagesUrl) { extrasOnce(); extraT = setInterval(extrasOnce, o.extrasMs ?? 60000); }
      // Gdyby WebSocket zawisł bez błędu, po 5 s przechodzimy na odpytywanie REST.
      connT = setTimeout(() => { connT = null; if (running && !wsOpen) startPolling(); }, o.wsGraceMs ?? 5000);
      dogT = setInterval(watchdog, o.watchdogMs);
    },
    stop() {
      running = false;
      if (relayT) { clearTimeout(relayT); relayT = null; }
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
