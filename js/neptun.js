// Logika obiektów znad Ukrainy (źródło: NEPTUN, neptun.in.ua) – bez DOM, żeby dało się ją testować w Node.
// Format danych wg dokumentacji neptun.in.ua/developers (sprawdzone 10.10.2026). UWAGA: na żywych danych jeszcze
// niezweryfikowane (serwis blokuje automatyczny odczyt przez narzędzia, z których korzysta autor kodu) –
// parser jest więc tolerancyjny, a nieoczekiwany format kończy się komunikatem „brak danych”, nigdy „spokojnie”.
//
// Zasady wynikające z warunków NEPTUN (neptun.in.ua/api-terms) i z decyzji projektu:
//  - areaOnly=true: znana tylko okolica (środek obwodu). Nie liczymy odległości, toru ani oceny.
//  - advisory=true: obserwacja bez alarmu. Nie jest sygnałem do schronienia.
//  - Uspokajającą ocenę toru („przechodzi daleko od Ciebie”) pokazujemy TYLKO dla dronów, przy świeżych,
//    pewnych danych. Dla rakiet i bomb kierowanych nie oceniamy toru (lecą minuty, zmieniają kurs).
//  - Brak świeżych danych ⇒ brak oceny.
import { destination, crossTrack, haversineKm, pointInRing, distToRingKm, normDeg, rad } from "./geo.js";
import { POLAND_RING } from "./poland-border.js";
import { polishPlace, hasCyrillic } from "./polish.js";

export const LIMITS = {
  zoneKm: 200,          // pokazujemy obiekty do 200 km od granicy Polski (lub nad Polską)
  hideAfterSec: 3600,   // rekordów nieaktualizowanych dłużej niż godzinę nie pokazujemy
  maxAgeSec: 600,       // pozycji starszej niż 10 min nie ekstrapolujemy
  reassureAgeSec: 180,  // uspokajającą ocenę wydajemy tylko dla pozycji nie starszej niż 3 min
  feedFreshSec: 90,     // źródło musi odpowiadać (wiadomość lub odpowiedź REST) nie dawniej niż 90 s temu
  headingSigmaDeg: 15,  // zakładana niepewność kursu (pas niepewności rozszerza się o tan(15°) na km)
  baseUncertaintyKm: 5, // gdy źródło nie podaje uncertaintyKm
  nearUserKm: 40,       // tor (z pasem niepewności) bliżej niż 40 km od użytkownika = „w pobliżu”
  clearMarginKm: 25,    // „daleko” dopiero, gdy pas niepewności mija użytkownika z zapasem ≥ 25 km
  horizonMin: 60,
  horizonMaxKm: 400,
  poorFixKm: 5,         // gdy lokalizacja użytkownika jest mniej dokładna niż 5 km, nie uspokajamy
};

export const TYPES = {
  uav: { label: "Dron", kind: "slow" },
  recon: { label: "Dron rozpoznawczy", kind: "slow" },
  missile: { label: "Rakieta", kind: "fast" },
  ballistic: { label: "Rakieta balistyczna", kind: "fast" },
  kab: { label: "Bomba kierowana (KAB)", kind: "fast" },
  mig31k: { label: "MiG-31K (nosiciel rakiet)", kind: "fast" },
  unknown: { label: "Obiekt (typ nieznany)", kind: "fast" }, // nieznany typ traktujemy ostrożnie jak szybki
};

/** Synonimy typów spotykane w danych (tolerancja na drobne różnice w nazewnictwie). */
const TYPE_ALIAS = {
  drone: "uav", shahed: "uav", geran: "uav", bpla: "uav", uas: "uav",
  reconnaissance: "recon", scout: "recon",
  rocket: "missile", cruise: "missile", cruise_missile: "missile", "cruise-missile": "missile",
  bm: "ballistic", ballistic_missile: "ballistic", "ballistic-missile": "ballistic",
  glide_bomb: "kab", "glide-bomb": "kab", guided_bomb: "kab",
  mig31: "mig31k", "mig-31k": "mig31k",
};

/* ---------- normalizacja ---------- */
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const str = (v, max = 120) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
/** ISO / milisekundy / sekundy → ms albo null. */
export function parseTime(v) {
  if (v == null || v === "") return null;
  const t = typeof v === "number" ? (v < 1e11 ? v * 1000 : v) : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Surowy rekord NEPTUN → obiekt, którego używa aplikacja. Zwraca null dla rekordów bezużytecznych. */
/** Wyciąga współrzędne z kilku spotykanych układów: lat/lon, latitude/longitude, position/location/coords, GeoJSON. */
function pickCoords(raw) {
  const tryObj = (o) => {
    if (Array.isArray(o) && o.length >= 2) { const lon = num(o[0]), lat = num(o[1]); return { lat, lon }; } // GeoJSON: [lon, lat]
    if (o && typeof o === "object") return { lat: num(o.lat ?? o.latitude), lon: num(o.lon ?? o.lng ?? o.longitude) };
    return null;
  };
  let c = { lat: num(raw.lat ?? raw.latitude), lon: num(raw.lon ?? raw.lng ?? raw.longitude) };
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) {
    for (const k of ["position", "location", "coords", "coordinates", "point", "center"]) { const t = tryObj(raw[k]); if (t && Number.isFinite(t.lat) && Number.isFinite(t.lon)) { c = t; break; } }
  }
  return c;
}

export function normalizeThreat(input) {
  if (!input || typeof input !== "object") return null;
  // GeoJSON Feature: łączymy properties z geometry
  const raw = input.properties && typeof input.properties === "object" ? { ...input.properties, geometry: input.geometry, id: input.id ?? input.properties.id } : input;
  const id = raw.id ?? raw.threatId ?? raw.uuid;
  if (id == null || id === "") return null;
  const { lat, lon } = pickCoords(raw.geometry && !raw.lat ? { ...raw, coordinates: raw.geometry.coordinates } : raw);
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return null;
  let rawType = str(String(raw.type ?? raw.kind ?? raw.category ?? "unknown"), 30).toLowerCase();
  rawType = TYPE_ALIAS[rawType] || rawType;
  const type = Object.hasOwn(TYPES, rawType) ? rawType : "unknown";
  const vel = raw.velocity && typeof raw.velocity === "object" ? raw.velocity : {};
  let heading = num(vel.bearingDeg);
  if (!Number.isFinite(heading)) heading = num(raw.heading ?? raw.bearingDeg ?? raw.course ?? raw.direction);
  heading = Number.isFinite(heading) && heading >= 0 && heading <= 360 ? normDeg(heading) : null;
  let speed = num(vel.speedKmh ?? raw.speedKmh ?? raw.speed);
  speed = Number.isFinite(speed) && speed > 0 && speed <= 4000 ? speed : null;
  const unc = num(raw.uncertaintyKm);
  const conf = str(String(raw.confidenceLevel ?? ""), 10).toLowerCase();
  const status = str(String(raw.status ?? "active"), 12).toLowerCase() || "active";
  const count = num(raw.count);
  return {
    id: String(id).slice(0, 80),
    type, rawType,
    // Nazwy po polsku (NEPTUN podaje je po ukraińsku/rosyjsku). Tytuł z cyrylicą pomijamy: to opis słowny, którego nie przetłumaczymy rzetelnie.
    title: hasCyrillic(raw.title) ? "" : str(raw.title), titleRaw: str(raw.title),
    region: polishPlace(str(raw.region, 80)), district: polishPlace(str(raw.district, 80)), locality: polishPlace(str(raw.locality, 80)),
    status,
    lat, lon,
    headingDeg: heading, speedKmh: speed,
    uncertaintyKm: Number.isFinite(unc) && unc >= 0 && unc <= 200 ? unc : null,
    confirmedAt: parseTime(raw.confirmedAt), updatedAt: parseTime(raw.updatedAt),
    confidence: ["low", "medium", "high"].includes(conf) ? conf : null,
    sourceCount: Number.isFinite(num(raw.sourceCount)) ? num(raw.sourceCount) : null,
    count: Number.isFinite(count) && count > 0 ? count : null,
    advisory: raw.advisory === true,
    areaOnly: raw.areaOnly === true,
    note: str(raw.description ?? raw.details ?? raw.note ?? "", 240),
    launchedAt: parseTime(raw.launchedAt ?? raw.firstSeenAt ?? raw.createdAt),
  };
}

/* ---------- alarmy w Ukrainie i wiadomości (dodatkowe punkty końcowe NEPTUN) ---------- */
const listOf = (json, ...keys) => {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") for (const k of [...keys, "items", "data", "results"]) if (Array.isArray(json[k])) return json[k];
  return null;
};
const OFF = new Set(["inactive", "ended", "end", "cleared", "clear", "finished", "resolved", "off", "false", "0", "n", "none", "over"]);

/** Alarm powietrzny w obwodzie Ukrainy. Zwraca null, gdy rekord nie wygląda na alarm z nazwą obszaru. */
export function normalizeAlert(raw) {
  if (!raw || typeof raw !== "object") return null;
  const region = polishPlace(str(String(raw.region ?? raw.oblast ?? raw.regionName ?? raw.location_title ?? raw.locationTitle ?? raw.area ?? raw.name ?? ""), 80));
  if (!region) return null;
  const status = str(String(raw.status ?? raw.state ?? ""), 20).toLowerCase();
  let active = raw.active ?? raw.isActive ?? raw.is_active;
  if (typeof active !== "boolean") active = !(OFF.has(status) || raw.finishedAt || raw.endedAt || raw.finished_at);
  return {
    id: String(raw.id ?? raw.regionId ?? region).slice(0, 80),
    region, active,
    kind: str(String(raw.type ?? raw.alertType ?? raw.alert_type ?? raw.kind ?? ""), 40).toLowerCase(),
    since: parseTime(raw.startedAt ?? raw.startAt ?? raw.since ?? raw.createdAt ?? raw.started_at ?? raw.updatedAt),
  };
}

/** Wiadomość z kanałów obserwowanych przez NEPTUN. */
export function normalizeMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = str(String(raw.text ?? raw.message ?? raw.body ?? raw.content ?? raw.title ?? ""), 600);
  if (!text) return null;
  const at = parseTime(raw.publishedAt ?? raw.date ?? raw.ts ?? raw.createdAt ?? raw.time ?? raw.timestamp);
  return { id: String(raw.id ?? `${at}-${text.slice(0, 20)}`).slice(0, 80), text, at, channel: str(String(raw.channel ?? raw.source ?? raw.sourceName ?? raw.author ?? ""), 60) };
}

/** Magazyn obiektów + korekta zegara urządzenia względem zegara serwera NEPTUN. */
export class ThreatStore {
  constructor() { this.items = new Map(); this.skewMs = 0; this.stats = { seen: 0, bad: 0 }; this.alerts = new Map(); this.messages = []; this.extras = { alertsAt: null, messagesAt: null, alertsErr: null, messagesErr: null }; }
  applyAlerts(list) {
    const m = new Map();
    for (const r of Array.isArray(list) ? list : []) { const a = normalizeAlert(r); if (a) m.set(a.id, a); }
    this.alerts = m; this.extras.alertsAt = Date.now(); this.extras.alertsErr = null;
  }
  applyMessages(list) {
    const arr = [];
    for (const r of Array.isArray(list) ? list : []) { const x = normalizeMessage(r); if (x) arr.push(x); }
    arr.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    this.messages = arr.slice(0, 50); this.extras.messagesAt = Date.now(); this.extras.messagesErr = null;
  }
  /** „Teraz” wg zegara serwera (zegar telefonu bywa przestawiony; wiek obserwacji liczymy względem serwera). */
  nowMs() { return Date.now() + this.skewMs; }
  noteServerTime(v) {
    const t = parseTime(v);
    if (t == null) return;
    const s = t - Date.now();
    this.skewMs = Math.abs(s) <= 6 * 3600e3 ? s : 0; // absurdalne wartości ignorujemy
  }
  applySnapshot(list) {
    this.items.clear();
    this.stats = { seen: 0, bad: 0 }; // statystyka dotyczy ostatniej migawki (do wykrycia zmiany formatu)
    for (const r of Array.isArray(list) ? list : []) this.upsert(r);
  }
  upsert(raw) {
    this.stats.seen++;
    const t = normalizeThreat(raw);
    if (!t) { this.stats.bad++; return; }
    this.items.set(t.id, t);
  }
  remove(id) { if (id != null) this.items.delete(String(id)); }
}

/** Odpowiedź REST /api/v1/threats: { serverTime, threats: [...] } (toleruje też sam tablicę). */
export function applySnapshotJson(store, json) {
  if (json && !Array.isArray(json)) store.noteServerTime(json.serverTime);
  const list = Array.isArray(json) ? json : json?.threats;
  if (!Array.isArray(list)) throw new Error("Nieoczekiwany format odpowiedzi NEPTUN");
  store.applySnapshot(list);
}

export function applyAlertsJson(store, json) {
  const list = listOf(json, "alerts");
  if (!list) throw new Error("Nieoczekiwany format alarmów NEPTUN");
  store.applyAlerts(list);
}
export function applyMessagesJson(store, json) {
  const list = listOf(json, "messages");
  if (!list) throw new Error("Nieoczekiwany format wiadomości NEPTUN");
  store.applyMessages(list);
}

/** Koperta WebSocket { type, ts, data }. Zwraca nazwę obsłużonego typu. */
export function applyEnvelope(store, env) {
  if (!env || typeof env !== "object") return "invalid";
  if (env.ts != null) store.noteServerTime(env.ts);
  const d = env.data;
  switch (String(env.type)) {
    case "snapshot":
      if (d && !Array.isArray(d)) store.noteServerTime(d.serverTime);
      store.applySnapshot(Array.isArray(d) ? d : d?.threats);
      return "snapshot";
    case "upsert": store.upsert(d && typeof d === "object" && d.threat ? d.threat : d); return "upsert";
    case "remove": store.remove(d && typeof d === "object" ? d.id ?? d.threatId : d); return "remove";
    case "heartbeat": return "heartbeat";
    case "alerts": { const l = listOf(d, "alerts"); if (l) store.applyAlerts(l); return "alerts"; }
    case "messages": { const l = listOf(d, "messages"); if (l) store.applyMessages(l); return "messages"; }
    case "message": { const x = normalizeMessage(d); if (x) { store.messages = [x, ...store.messages.filter((m) => m.id !== x.id)].slice(0, 50); store.extras.messagesAt = Date.now(); } return "messages"; }
    default: return "unknown";
  }
}

/* ---------- strefa przygraniczna ---------- */
export function zoneOf(p) {
  const pt = { lat: p.lat, lon: p.lon };
  const inPoland = pointInRing(pt, POLAND_RING);
  return { inPoland, distKm: inPoland ? 0 : distToRingKm(pt, POLAND_RING) };
}

/* ---------- przewidywany tor (liniowy, stały kurs i prędkość) ---------- */
export function predict(t, nowMs, over = {}) {
  const Lm = { ...LIMITS, ...over };
  if (t.areaOnly) return { ok: false, reason: "area" };
  if (t.headingDeg == null) return { ok: false, reason: "heading" };
  const at = t.confirmedAt ?? t.updatedAt;
  if (at == null) return { ok: false, reason: "time" };
  const ageSec = Math.max(0, (nowMs - at) / 1000);
  if (ageSec > Lm.maxAgeSec) return { ok: false, reason: "old", ageSec };
  const timed = t.speedKmh != null;
  const anchor = { lat: t.lat, lon: t.lon };
  const advancedKm = timed ? (t.speedKmh * ageSec) / 3600 : 0;
  const here = advancedKm > 0 ? destination(anchor, t.headingDeg, advancedKm) : anchor;
  const u0 = t.uncertaintyKm ?? Lm.baseUncertaintyKm;
  const tanS = Math.tan(rad(Lm.headingSigmaDeg));
  /** Połowa szerokości pasa niepewności w odległości `ahead` km przed obiektem. */
  const hw = (ahead) => u0 + (advancedKm + Math.max(0, ahead)) * tanS;
  const horizonKm = timed ? Math.min(Lm.horizonMaxKm, (t.speedKmh * Lm.horizonMin) / 60) : 100;
  const marks = timed
    ? [15, 30, 60].map((m) => ({ minutes: m, km: (t.speedKmh * m) / 60 })).filter((m) => m.km <= Lm.horizonMaxKm)
      .map((m) => ({ ...m, ...destination(here, t.headingDeg, m.km), halfWidthKm: hw(m.km) }))
    : [];
  return { ok: true, timed, ageSec, anchor, here, bearing: t.headingDeg, speedKmh: t.speedKmh, advancedKm, horizonKm, hw, marks };
}

/** Kontur pasa niepewności do narysowania: lewa i prawa krawędź + oś. */
export function coneOutline(pred, steps = 10) {
  const left = [], right = [], axis = [];
  for (let i = 0; i <= steps; i++) {
    const d = (pred.horizonKm * i) / steps;
    const c = i === 0 ? pred.here : destination(pred.here, pred.bearing, d);
    const w = pred.hw(d);
    axis.push(c);
    left.push(destination(c, normDeg(pred.bearing - 90), w));
    right.push(destination(c, normDeg(pred.bearing + 90), w));
  }
  return { left, right, axis };
}

/* ---------- ocena względem użytkownika ---------- */
const fmtKm = (km) => (km < 10 ? km.toFixed(1) : String(Math.round(km))).replace(".", ",") + " km";
export const fmtKmPl = fmtKm;

/**
 * Zwraca { kind, severity, text, ... }. severity: "watch" (zwróć uwagę) | "info" | "quiet".
 * user = { lat, lon, accKm } albo null. ctx = { feedFresh, pred }.
 */
export function assess(t, user, nowMs, ctx = {}) {
  const Lm = LIMITS;
  if (t.areaOnly) return { kind: "area", severity: "info", text: "NEPTUN podaje tylko obwód, bez dokładnej pozycji. Nie oceniamy toru." };
  if (!user) return { kind: "nouser", severity: "info", text: "Użyj przycisku „Pokaż mnie”, aby zobaczyć ocenę względem Twojej pozycji." };
  const pred = ctx.pred ?? predict(t, nowMs);
  const here = pred.ok ? pred.here : { lat: t.lat, lon: t.lon };
  const dist = haversineKm(user, here);
  const acc = Math.min(Math.max(user.accKm || 0, 0), 50);
  const dTxt = fmtKm(dist);
  const SAFETY = "Nie zastępuje to syren ani Alertu RCB.";

  if (TYPES[t.type].kind === "fast") {
    return {
      kind: "fast", severity: dist <= 100 ? "watch" : "info", distKm: dist,
      text: `Odległość od Twojej pozycji: ok. ${dTxt}. Rakiety i bomby kierowane lecą bardzo szybko i mogą zmienić kurs, więc nie oceniamy ich toru. Kieruj się syrenami i Alertem RCB.`,
    };
  }
  if (dist - acc <= Lm.nearUserKm) {
    return { kind: "near", severity: "watch", distKm: dist, text: `Obiekt jest blisko Twojej pozycji (ok. ${dTxt}). Nasłuchuj syren i Alertów RCB. ${SAFETY}` };
  }
  if (!pred.ok) {
    return { kind: "nodir", severity: "info", distKm: dist, text: `Odległość od Twojej pozycji: ok. ${dTxt}. Brak aktualnego kursu, więc nie oceniamy toru.` };
  }
  const reliable = ctx.feedFresh !== false && t.status === "active" && pred.ageSec <= Lm.reassureAgeSec && t.confidence != null && t.confidence !== "low" && acc <= Lm.poorFixKm;
  if (!reliable) {
    return { kind: "unsure", severity: "info", distKm: dist, text: `Odległość od Twojej pozycji: ok. ${dTxt}. Dane są zbyt stare lub zbyt mało pewne, by ocenić tor.` };
  }
  const { alongKm, crossKm } = crossTrack(pred.here, pred.bearing, user);
  if (alongKm < 0) {
    return { kind: "away", severity: "quiet", distKm: dist, text: `Obiekt oddala się od Twojej pozycji (teraz ok. ${dTxt}). To tylko szacunek. ${SAFETY}` };
  }
  const gap = Math.abs(crossKm) - pred.hw(alongKm) - acc;
  if (gap <= Lm.nearUserKm) {
    const eta = pred.timed ? alongKm / pred.speedKmh * 60 : null;
    const etaTxt = eta != null && eta <= 180 ? ` Najbliżej za ok. ${Math.max(1, Math.round(eta))} min.` : "";
    return { kind: "near", severity: "watch", distKm: dist, passKm: Math.abs(crossKm), etaMin: eta, text: `Szacunkowy tor może przechodzić w pobliżu Twojej pozycji (ok. ${fmtKm(Math.abs(crossKm))} od niej).${etaTxt} Nasłuchuj syren i Alertów RCB. ${SAFETY}` };
  }
  if (gap >= Lm.clearMarginKm) {
    return { kind: "clear", severity: "quiet", distKm: dist, passKm: Math.abs(crossKm), text: `Przy stałym kursie tor przechodzi ok. ${fmtKm(Math.abs(crossKm))} od Twojej pozycji. To tylko szacunek, kurs może się zmienić. ${SAFETY}` };
  }
  return { kind: "uncertain", severity: "info", distKm: dist, passKm: Math.abs(crossKm), text: `Tor przechodzi ok. ${fmtKm(Math.abs(crossKm))} od Twojej pozycji, ale to zbyt mało pewne, by ocenić. Śledź oficjalne komunikaty. ${SAFETY}` };
}

/** Wiek jako tekst po polsku. */
export function ageText(sec) {
  if (sec == null || !Number.isFinite(sec)) return "czas nieznany";
  if (sec < 15) return "przed chwilą";
  if (sec < 90) return `${Math.round(sec)} s temu`;
  if (sec < 3600) return `${Math.round(sec / 60)} min temu`;
  return `${Math.round(sec / 3600)} godz. temu`;
}

/** Wiersze do wyświetlenia. Domyślnie: obiekty w strefie przygranicznej (do LIMITS.zoneKm), od najbliższego granicy.
 *  opts.all = true: także głębiej w Ukrainie (bez ograniczenia strefy). opts.filter: "all" | "drones" | "fast". */
export function buildView(store, user, feedFresh, opts = {}) {
  const now = store.nowMs();
  const rows = [], areaRows = [];
  const counts = {};
  let areaOnly = 0, farHidden = 0;
  const wantType = (t) => opts.filter === "drones" ? TYPES[t.type].kind === "slow" : opts.filter === "fast" ? TYPES[t.type].kind === "fast" : true;
  for (const t of store.items.values()) {
    if (t.status === "resolved") continue;
    const upd = t.updatedAt ?? t.confirmedAt;
    if (upd != null && (now - upd) / 1000 > LIMITS.hideAfterSec) continue;
    const zone = zoneOf(t);
    const far = !zone.inPoland && zone.distKm > LIMITS.zoneKm;
    if (far && !opts.all) { farHidden++; continue; }
    if (!wantType(t)) continue;
    const at = t.confirmedAt ?? t.updatedAt;
    const ageSec = at != null ? Math.max(0, (now - at) / 1000) : null;
    counts[t.type] = (counts[t.type] || 0) + (t.count || 1);
    if (t.areaOnly) { areaOnly++; areaRows.push({ t, zone, far, ageSec }); continue; }
    const pred = predict(t, now);
    const as = far
      ? { kind: "far", severity: "info", text: `Obiekt jest daleko od granicy Polski (ok. ${fmtKm(zone.distKm)}). Poza strefą ${LIMITS.zoneKm} km nie oceniamy wpływu na Twoją pozycję.` }
      : assess(t, user, now, { feedFresh, pred });
    rows.push({ t, zone, far, pred, ageSec, assess: as });
  }
  rows.sort((a, b) => a.zone.distKm - b.zone.distKm);
  areaRows.sort((a, b) => a.zone.distKm - b.zone.distKm);
  const alerts = [...store.alerts.values()].filter((a) => a.active).sort((a, b) => a.region.localeCompare(b.region, "uk"));
  return { rows, areaRows, areaOnly, farHidden, counts, alerts, messages: store.messages, now };
}

/* ---------- zbliżanie do granicy (podstawa powiadomień Telegram) ---------- */
export const NOTIFY = {
  maxKm: 100,        // powiadamiamy, gdy obiekt jest bliżej niż 100 km od granicy Polski (albo już nad Polską)
  strongKm: 50,      // drugi próg (eskalacja): bliżej niż 50 km
  coneDeg: 15,       // tor uznajemy za „w stronę granicy”, gdy któryś z promieni kursu ±15° wchodzi do Polski
  rayKm: 150,        // jak daleko sprawdzamy tor (dalej niż 150 km przed obiektem tor jest zbyt niepewny)
  stepKm: 2,
  maxAgeSec: 600,    // pozycja starsza niż 10 min nie wywołuje powiadomienia
};

/**
 * Czy obiekt spełnia warunki powiadomienia: (1) bliżej niż maxKm od granicy lub nad Polską, (2) tor w stronę granicy.
 * Zwraca { ok, level, ... }. level: 100 (<100 km), 50 (<50 km), 0 (nad Polską). Pomija: obserwacje bez pozycji, „advisory”,
 * nieaktywne, zbyt stare i o niskiej pewności. Obiekt bez znanego kursu (poza nad Polską) nie wywołuje powiadomienia.
 */
export function borderApproach(t, nowMs, over = {}) {
  const N = { ...NOTIFY, ...over };
  if (t.areaOnly) return { ok: false, reason: "area" };
  if (t.advisory) return { ok: false, reason: "advisory" };
  if (t.status !== "active") return { ok: false, reason: "status:" + t.status };
  if (t.confidence === "low") return { ok: false, reason: "lowconf" };
  const at = t.confirmedAt ?? t.updatedAt;
  if (at == null) return { ok: false, reason: "time" };
  const ageSec = Math.max(0, (nowMs - at) / 1000);
  if (ageSec > N.maxAgeSec) return { ok: false, reason: "old" };
  const pred = predict(t, nowMs);
  const here = pred.ok ? pred.here : { lat: t.lat, lon: t.lon };
  const zone = zoneOf(here);
  if (zone.inPoland) return { ok: true, level: 0, distKm: 0, entry: { lat: here.lat, lon: here.lon, alongKm: 0 }, etaMin: 0, centerHit: true, here };
  if (zone.distKm > N.maxKm) return { ok: false, reason: "far", distKm: zone.distKm };
  if (t.headingDeg == null) return { ok: false, reason: "heading", distKm: zone.distKm };
  let best = null;
  for (const [ang, center] of [[t.headingDeg, true], [normDeg(t.headingDeg - N.coneDeg), false], [normDeg(t.headingDeg + N.coneDeg), false]]) {
    for (let d = N.stepKm; d <= N.rayKm; d += N.stepKm) {
      const pt = destination(here, ang, d);
      if (pointInRing(pt, POLAND_RING)) { if (!best || (center && !best.centerHit) || (center === best.centerHit && d < best.alongKm)) best = { lat: pt.lat, lon: pt.lon, alongKm: d, centerHit: center }; break; }
    }
  }
  if (!best) return { ok: false, reason: "away", distKm: zone.distKm };
  const speed = t.speedKmh;
  return { ok: true, level: zone.distKm <= N.strongKm ? 50 : 100, distKm: zone.distKm, entry: best, centerHit: best.centerHit, etaMin: speed ? (best.alongKm / speed) * 60 : null, here };
}
