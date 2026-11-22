// Przekaźnik NEPTUN – czysta logika (bez sieci), testowalna w Node.
// Serwer EGIDA trzyma JEDNO połączenie z NEPTUN (WebSocket + okresowy REST), a telefony pobierają gotowy stan od nas.
// Warunki NEPTUN (neptun.in.ua/api-terms): odczyt, atrybucja, REST nie częściej niż co 5 s, do czasu rzeczywistego WebSocket – spełnione.
import { distToRingKm } from "../js/geo.js";
import { POLAND_RING } from "../js/poland-border.js";

export const FRESH_MS = 90_000;     // tyle samo co LIMITS.feedFreshSec w aplikacji: starsze dane = „brak połączenia”
export const HISTORY_KM = 400;      // historia: obiekty do 400 km od granicy Polski (rozmiar plików, a liczy się okolica granicy)
const MAX_THREATS = 3000, MAX_MSG = 120;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const idOf = (t) => (t && (t.id ?? t.threatId ?? t.uuid)) != null ? String(t.id ?? t.threatId ?? t.uuid) : null;

export const ALERTS_MAX_AGE_MS = 10 * 60_000; // starszych alarmów obwodów nie podajemy dalej (lepiej „brak danych” niż stary obraz)

export class RelayState {
  constructor({ freshMs = FRESH_MS } = {}) {
    this.freshMs = freshMs;
    this.threats = new Map(); // id → surowy obiekt z NEPTUN (przekazujemy bez zmian – aplikacja ma własny parser)
    this.threatJson = new Map(); // id → JSON obiektu (wykrywanie prawdziwych zmian)
    this.alerts = null;       // surowa odpowiedź /alerts ({ raions, oblasts })
    this.alertsJson = null;
    this.alertsAt = null;     // kiedy ostatnio przyszły alarmy (WS lub REST)
    this.alertsWsAt = null;   // … przez WebSocket (wtedy REST /alerts zbędny)
    this.messages = null;     // { messages: [...] }
    this.messagesAt = null;
    this.messagesWsAt = null;
    this.msgVersion = 0;
    this.offsetMs = 0;        // zegar NEPTUN − nasz zegar
    this.lastOkAt = null;     // ostatnia poprawna wiadomość z NEPTUN (WS lub REST)
    this.via = null;          // "ws" | "rest"
    this.version = 0;         // rośnie TYLKO przy rzeczywistej zmianie danych (telefony dostają wtedy 204 „bez zmian”)
  }
  noteServerTime(v, at) {
    const t = typeof v === "number" ? v : Date.parse(v);
    if (Number.isFinite(t) && t > 1.6e12) this.offsetMs = t - at;
  }
  ok(via, at) { this.lastOkAt = at; this.via = via; }
  isFresh(now) { return this.lastOkAt != null && now - this.lastOkAt <= this.freshMs; }

  /** Pełny stan obiektów: { serverTime, threats: [...] } (REST /threats albo koperta „snapshot”). */
  applySnapshot(json, at, via = "rest") {
    const list = Array.isArray(json) ? json : json?.threats;
    if (!Array.isArray(list)) throw new Error("nieoczekiwany format /threats");
    if (json && !Array.isArray(json)) this.noteServerTime(json.serverTime, at);
    const next = new Map(), nextJson = new Map();
    for (const t of list.slice(0, MAX_THREATS)) { const id = idOf(t); if (id) { next.set(id, t); nextJson.set(id, JSON.stringify(t)); } }
    let changed = next.size !== this.threats.size;
    if (!changed) for (const [id, s] of nextJson) if (this.threatJson.get(id) !== s) { changed = true; break; }
    this.threats = next; this.threatJson = nextJson;
    if (changed) this.version++;
    this.ok(via, at);
  }
  upsert(t) {
    const id = idOf(t); if (!id) return false;
    if (this.threats.size >= MAX_THREATS && !this.threats.has(id)) return true;
    const s = JSON.stringify(t);
    if (this.threatJson.get(id) !== s) { this.threats.set(id, t); this.threatJson.set(id, s); this.version++; }
    return true;
  }
  remove(id) {
    id = String(id);
    if (this.threats.delete(id)) { this.threatJson.delete(id); this.version++; }
  }
  setAlerts(d, at, viaWs) {
    const s = JSON.stringify(d);
    if (s !== this.alertsJson) { this.alerts = d; this.alertsJson = s; this.version++; }
    this.alertsAt = at; if (viaWs) this.alertsWsAt = at;
  }
  setMessages(list, at, viaWs) {
    this.messages = { messages: list.slice(0, MAX_MSG) }; this.msgVersion++;
    this.messagesAt = at; if (viaWs) this.messagesWsAt = at;
  }
  applyAlerts(json, at) {
    if (!json || typeof json !== "object") throw new Error("nieoczekiwany format /alerts");
    this.setAlerts(json, at, false);
  }
  applyMessages(json, at) {
    const list = Array.isArray(json) ? json : json?.messages;
    if (!Array.isArray(list)) throw new Error("nieoczekiwany format /messages");
    this.setMessages(list, at, false);
  }
  /** Koperta WebSocket { type, ts, data }. Zwraca typ albo "invalid"/"unknown". */
  applyEnvelope(env, at) {
    if (!env || typeof env !== "object") return "invalid";
    if (env.ts != null) this.noteServerTime(env.ts, at);
    const d = env.data;
    switch (String(env.type)) {
      case "snapshot": this.applySnapshot(Array.isArray(d) ? d : { serverTime: d?.serverTime, threats: d?.threats }, at, "ws"); return "snapshot";
      case "upsert": { const t = d && typeof d === "object" && d.threat ? d.threat : d; if (!this.upsert(t)) return "invalid"; this.ok("ws", at); return "upsert"; }
      case "remove": { const id = d && typeof d === "object" ? d.id ?? d.threatId : d; if (id == null) return "invalid"; this.remove(id); this.ok("ws", at); return "remove"; }
      case "heartbeat": this.ok("ws", at); return "heartbeat";
      case "alerts": if (d && typeof d === "object") this.setAlerts(d, at, true); this.ok("ws", at); return "alerts";
      case "messages": { const l = Array.isArray(d) ? d : d?.messages; if (Array.isArray(l)) this.setMessages(l, at, true); this.ok("ws", at); return "messages"; }
      case "message": {
        // pojedyncza nowa wiadomość: dokładamy na początek listy (bez duplikatów po id)
        if (d && typeof d === "object") {
          const cur = this.messages?.messages || [];
          const id = d.id ?? null;
          this.setMessages([d, ...cur.filter((m) => id == null || m?.id !== id)], at, false);
        }
        this.ok("ws", at); return "message";
      }
      default: return "unknown";
    }
  }
  /** Odpowiedź dla aplikacji (co ~10 s): format zgodny z NEPTUN /threats + alarmy obwodów. `version` pozwala odpowiedzieć „bez zmian”. */
  payload(now) {
    const iso = (t) => (t != null ? new Date(t).toISOString() : null);
    const alertsFresh = this.alertsAt != null && now - this.alertsAt <= ALERTS_MAX_AGE_MS;
    return {
      serverTime: new Date(now + this.offsetMs).toISOString(),
      version: this.version,
      threats: [...this.threats.values()],
      alerts: alertsFresh ? this.alerts : null,
      relay: { at: iso(now), lastOkAt: iso(this.lastOkAt), alertsAt: alertsFresh ? iso(this.alertsAt) : null, via: this.via, source: "NEPTUN (neptun.in.ua)" },
    };
  }
  /** Wiadomości z kanałów (co ~60 s, osobno – są najcięższe). */
  messagesPayload(now = Date.now()) {
    return { ...(this.messages || { messages: [] }), relay: { at: new Date(now).toISOString(), messagesAt: this.messagesAt != null ? new Date(this.messagesAt).toISOString() : null } };
  }
}

/** Skrócony zapis obiektu do historii (tylko to, co potrzebne do odtworzenia sytuacji przy granicy). */
export function compact(t) {
  const lat = num(t.lat ?? t.latitude), lon = num(t.lon ?? t.lng ?? t.longitude);
  const v = t.velocity && typeof t.velocity === "object" ? t.velocity : null;
  return {
    id: idOf(t), type: t.type ?? null, lat, lon, hd: num(t.heading ?? v?.bearingDeg), kmh: num(v?.speedKmh), n: num(t.count),
    conf: t.confidenceLevel ?? null, st: t.status ?? null, upd: t.updatedAt ?? null, loc: t.locality ?? null, reg: t.region ?? null,
    ...(t.areaOnly ? { area: true } : {}), ...(t.advisory ? { adv: true } : {}),
  };
}
/** Czy obiekt jest w strefie historii (≤ HISTORY_KM od granicy Polski albo nad Polską). Bez pozycji – nie. */
export function nearPoland(t) {
  const c = compact(t);
  if (c.lat == null || c.lon == null) return false;
  return distToRingKm({ lat: c.lat, lon: c.lon }, POLAND_RING) <= HISTORY_KM;
}

/**
 * Różnica stanu do zapisu historii: prev = Map(id → JSON skrótu), threats = Map(id → surowy obiekt).
 * Zwraca { line: { up:[…], rm:[…] } | null, next: Map }.
 */
export function historyDiff(prev, threats) {
  const next = new Map(), up = [], rm = [];
  for (const [id, t] of threats) {
    if (!nearPoland(t)) continue;
    const c = compact(t), s = JSON.stringify(c);
    next.set(id, s);
    if (prev.get(id) !== s) up.push(c);
  }
  for (const id of prev.keys()) if (!next.has(id)) rm.push(id);
  return { line: up.length || rm.length ? { up, rm } : null, next };
}
