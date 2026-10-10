import { CONFIG } from "./config.js";
import {
  VOIVODESHIPS, LEGAL_HTML, ALERT_FILTERS, PLECAK, FIRST_AID, WHAT_TO_DO, READINESS_QUESTIONS, SOURCES,
} from "./content.js";
import { renderMapHtml, initMapScreen, destroyScreens } from "./mapscreen.js";
import { renderSheltersHtml, initSheltersScreen } from "./sheltersscreen.js";

/* ---------- pomocnicze ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
const regionById = (id) => VOIVODESHIPS.find((v) => v.id === id);

const ic = (d, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  home: ic('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  bell: ic('<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 004 0"/>'),
  map: ic('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
  book: ic('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5"/>'),
  bag: ic('<path d="M8 7V5a4 4 0 018 0v2"/><rect x="4" y="7" width="16" height="14" rx="3"/><path d="M9 13h6"/>'),
  heart: ic('<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.7A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z"/>'),
  shield: ic('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
  pin: ic('<path d="M12 21s7-6.3 7-12a7 7 0 10-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>', 18),
  chev: ic('<path d="M6 9l6 6 6-6"/>', 18),
  phone: ic('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>', 18),
  check: ic('<path d="M5 12l5 5 9-10"/>', 20),
  alert: ic('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
  list: ic('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  test: ic('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  back: ic('<path d="M15 6l-6 6 6 6"/>', 20),
  send: ic('<path d="M21 3L3 10.5l6.5 2.5L12 20z"/><path d="M21 3L9.5 13"/>'),
  ext: ic('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>', 16),
};
const LOGO = `<svg width="34" height="34" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#0B6B63"/><path d="M256 92l140 52v104c0 86-58 142-140 172-82-30-140-86-140-172V144z" fill="none" stroke="#fff" stroke-width="28" stroke-linejoin="round"/><circle cx="256" cy="240" r="42" fill="none" stroke="#fff" stroke-width="26"/></svg>`;

/* ---------- stan (tylko w urządzeniu) ---------- */
const KEY = "egida.v1";
const defaults = () => ({
  onboarded: false,
  consent: { gps: false, counter: false, ack: false, neptun: false },
  region: null, regionSource: null, // "manual" | "gps"
  shelters: [], // „Moje miejsca schronienia” (tylko w urządzeniu)
  map: { base: "map", layers: { shelters: true, neptun: false } },
  checked: {},
  test: null, // {answers:{}, score, at}
  fs: "normal", contrast: "normal",
});
let state = defaults();
try { state = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { /* brak/uszkodzone dane */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* tryb prywatny */ } };
const applyPrefs = () => {
  document.documentElement.dataset.fs = state.fs === "normal" ? "" : state.fs;
  document.documentElement.dataset.contrast = state.contrast === "high" ? "high" : "";
};

/* ---------- komunikaty ---------- */
let alertsData = { loaded: false, ok: false, updated: null, items: [] };
const ALERTS_CACHE = "egida.alerts.v1";
async function loadAlerts() {
  try {
    const r = await fetch(`${CONFIG.alertsUrl}${CONFIG.alertsUrl.includes("?") ? "&" : "?"}t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    alertsData = { loaded: true, ok: true, updated: j.updated || null, items: Array.isArray(j.items) ? j.items : [], telegram: j.telegram && typeof j.telegram === "object" ? j.telegram : {} };
    try { localStorage.setItem(ALERTS_CACHE, JSON.stringify({ updated: alertsData.updated, items: alertsData.items, telegram: alertsData.telegram })); } catch { /* brak miejsca / tryb prywatny */ }
  } catch {
    // Brak sieci: pokaż ostatnio pobrane dane. O tym, czy są aktualne, decyduje alertsFresh() (wiek danych).
    let c = null;
    try { c = JSON.parse(localStorage.getItem(ALERTS_CACHE) || "null"); } catch { /* uszkodzone */ }
    if (c && Array.isArray(c.items)) alertsData = { loaded: true, ok: true, updated: c.updated || null, items: c.items, telegram: c.telegram || {} };
    else alertsData = { ...alertsData, loaded: true, ok: false };
  }
}
const alertsFresh = () => {
  if (!alertsData.ok || !alertsData.updated) return false;
  return (Date.now() - new Date(alertsData.updated).getTime()) / 60000 <= CONFIG.staleAfterMin;
};
const regionAlerts = () => alertsData.items.filter((a) => !(a.validTo && new Date(a.validTo).getTime() < Date.now())).filter((a) => !state.region || a.voivodeship === state.region || a.voivodeship === "all");
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/* kontekst dla ekranów z mapą (js/mapscreen.js); „state” zawsze aktualny, także po usunięciu danych */
const geoCtx = {
  get state() { return state; },
  save: () => save(), esc, I,
  regionById: (id) => regionById(id),
  regionAlerts: () => regionAlerts(),
  alertsFresh: () => alertsFresh(),
};

/* ---------- wspólne fragmenty ---------- */
const legal = () => `<aside class="legal" aria-label="Informacja o ograniczeniach">${LEGAL_HTML}</aside>`;
const btn112 = () => `<a class="btn112" href="tel:112" aria-label="Zagrożenie życia? Zadzwoń 112">${I.phone}<span class="t">Zagrożenie życia? </span>Zadzwoń 112</a>`;
const regionSelect = () => {
  const cur = state.region;
  const opts = VOIVODESHIPS.map((v) => `<option value="${v.id}" ${cur === v.id ? "selected" : ""}>${esc(v.name)}</option>`).join("");
  return `<div class="region"><span class="pin">${I.pin}</span>
    <select id="regionSel" aria-label="Województwo">
      <option value="" ${cur ? "" : "selected"} disabled>Wybierz województwo</option>
      <option value="__gps">Użyj lokalizacji GPS</option>${opts}</select><span class="chev">${I.chev}</span></div>`;
};
const topbar = () => `<header class="topbar">
  <a class="brand" href="#/pulpit" aria-label="EGIDA – strona główna">${LOGO}<span><span class="wordmark">EGIDA</span><span class="tagline">Twoje centrum bezpieczeństwa</span></span></a>
  <span class="spacer"></span>${regionSelect()}${btn112()}</header>`;

const NAV = [
  { h: "#/pulpit", k: "pulpit", t: "Pulpit", i: I.home },
  { h: "#/alerty", k: "alerty", t: "Alerty", i: I.bell },
  { h: "#/mapa", k: "mapa", t: "Mapa", i: I.map },
  { h: "#/poradnik", k: "poradnik", t: "Poradnik", i: I.book },
  { h: "#/plecak", k: "plecak", t: "Plecak", i: I.bag },
];
const SIDE = [
  ...NAV.slice(0, 2),
  { h: "#/telegram", k: "telegram", t: "Powiadomienia Telegram", i: I.send },
  { h: "#/mapa", k: "mapa", t: "Mapa zagrożeń", i: I.map },
  { h: "#/schrony", k: "schrony", t: "Schrony i ukrycia", i: I.shield },
  { h: "#/poradnik", k: "poradnik", t: "Co robić", i: I.list },
  { h: "#/pierwsza-pomoc", k: "pierwsza-pomoc", t: "Pierwsza pomoc", i: I.heart },
  { h: "#/plecak", k: "plecak", t: "Plecak i zapasy", i: I.bag },
  { h: "#/test", k: "test", t: "Test gotowości", i: I.test },
  { h: "#/plan-rodziny", k: "plan-rodziny", t: "Plan rodziny", i: I.home, soon: 1 },
  { h: "#/ustawienia", k: "ustawienia", t: "Ustawienia", i: I.gear },
  { h: "#/zrodla", k: "zrodla", t: "Źródła i licencje", i: I.book },
];
const GROUP = { telegram: "alerty", "co-robic": "poradnik", "pierwsza-pomoc": "poradnik", test: "poradnik", schrony: "mapa", zrodla: "ustawienia", "plan-rodziny": "pulpit" };

function shell(route, inner) {
  const cur = GROUP[route] || route;
  const side = SIDE.map((n) => `<a class="nav ${n.soon ? "soon" : ""}" href="${n.h}" ${n.k === route || (n.k === "poradnik" && route === "co-robic" && n.t === "Co robić") ? 'aria-current="page"' : ""}>${n.i}<span>${n.t}</span>${n.soon ? '<span class="badge soon">wkrótce</span>' : ""}</a>`).join("");
  const tabs = NAV.map((n) => `<a href="${n.h}" ${n.k === cur ? 'aria-current="page"' : ""}>${n.i}<span>${n.t}</span></a>`).join("");
  return `<div class="shell"><nav class="side" aria-label="Menu główne"><a class="brand" href="#/pulpit">${LOGO}<span><span class="wordmark">EGIDA</span><span class="tagline">Twoje centrum bezpieczeństwa</span></span></a>${side}</nav>
  <main class="main" id="main" tabindex="-1">${topbar()}${inner}${legal()}</main>
  <a class="fab112" href="tel:112" aria-label="Zagrożenie życia? Zadzwoń 112">${I.phone}112</a>
  <nav class="tabbar" aria-label="Menu dolne">${tabs}</nav></div>`;
}
const back = (h, t = "Wstecz") => `<a class="back" href="${h}">${I.back}${t}</a>`;
const reviewLine = (m) => `<p class="src">Źródło: ${esc(m.source)}. Ostatni przegląd: ${m.reviewed ? esc(m.reviewed) : "<b>oczekuje na zatwierdzenie</b>"}.</p>`;

/* ---------- gotowość ---------- */
const plecakDone = () => PLECAK.start.filter((x) => state.checked[x.id]).length;
const readiness = () => {
  const steps = [
    { done: !!state.region, t: "Wybierz swoje województwo", h: "#/ustawienia" },
    { done: plecakDone() >= PLECAK.start.length, t: "Przygotuj 5 rzeczy na start", h: "#/plecak" },
    { done: !!state.test, t: "Zrób test gotowości (2 minuty)", h: "#/test" },
  ];
  const pct = Math.round(((steps.filter((s) => s.done).length) / steps.length) * 50 + (plecakDone() / PLECAK.start.length) * 25 + (state.test ? (state.test.score / READINESS_QUESTIONS.length) * 25 : 0));
  return { steps, pct: Math.min(100, pct) };
};

/* ---------- ekrany ---------- */
function screenStart() {
  const c = state.consent;
  return `<main class="main" id="main" tabindex="-1">
  <div class="hero" style="padding-top:22px"><div class="brand">${LOGO}<span><span class="wordmark">EGIDA</span><span class="tagline">Twoje centrum bezpieczeństwa</span></span></div>
  <h1 style="margin-top:18px">Witaj w EGIDZIE</h1>
  <p>Darmowa, nieoficjalna aplikacja: ostrzeżenia dla Twojego województwa, pierwsza pomoc, plecak i plan na kryzys. Bez reklam, bez konta, bez sprzedaży danych.</p></div>
  <div class="card"><h2>Twoje wybory</h2><p class="muted small">Wszystko jest dobrowolne. Aplikacja działa także bez żadnej zgody.</p>
  <label class="switch"><input type="checkbox" id="cGps" ${c.gps ? "checked" : ""}><span><b>Lokalizacja (GPS)</b><span class="muted small">Po co: ustawimy województwo, żeby pokazywać tylko Twoje komunikaty. Gdzie trafia: pozycja zostaje w telefonie i nie jest nigdzie wysyłana. Zamiast tego możesz wybrać województwo ręcznie.</span></span></label>
  <label class="switch"><input type="checkbox" disabled><span><b>Powiadomienia w aplikacji <span class="badge soon">wkrótce</span></b><span class="muted small">Na razie ostrzeżenia dla województwa wysyłamy przez publiczne kanały Telegram (link znajdziesz w Ustawieniach). Powiadomienia nie przebijają trybu „Nie przeszkadzać” i nie zastępują syren ani Alertu RCB.</span></span></label>
  <label class="switch"><input type="checkbox" id="cCounter" ${c.counter ? "checked" : ""}><span><b>Anonimowy licznik odwiedzin</b><span class="muted small">Zlicza wejścia na stronę, bez cookies i bez identyfikatorów. Pomaga ocenić, czy aplikacja jest potrzebna. Wyłączona domyślnie – możesz włączyć lub wyłączyć w Ustawieniach.</span></span></label></div>
  <div class="card"><div class="field"><label for="startRegion"><b>Województwo (ręcznie)</b></label>
  <select class="sel" id="startRegion"><option value="">Wybiorę później</option>${VOIVODESHIPS.map((v) => `<option value="${v.id}" ${state.region === v.id ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></div></div>
  ${legal()}
  <label class="switch" style="border:0"><input type="checkbox" id="cAck" ${c.ack ? "checked" : ""}><span><b>Rozumiem powyższe zasady</b></span></label>
  <div class="col" style="margin-top:6px"><button class="btn primary" id="goStart" ${c.ack ? "" : "disabled"}>Zaczynamy</button>
  <a class="btn112" style="justify-content:center;min-height:48px" href="tel:112">${I.phone}Zagrożenie życia? Zadzwoń 112</a></div></main>`;
}

function screenPulpit() {
  const r = readiness();
  const fresh = alertsFresh();
  const list = regionAlerts();
  let status;
  if (!state.region) {
    status = `<div class="status warn"><span class="ico">${I.pin}</span><div><h2>Wybierz województwo</h2><p>Pokażemy komunikaty dla Twojej okolicy. Użyj listy u góry ekranu.</p></div></div>`;
  } else if (!alertsData.loaded) {
    status = `<div class="status warn"><span class="ico">${I.bell}</span><div><h2>Sprawdzam komunikaty…</h2></div></div>`;
  } else if (!fresh) {
    status = `<div class="status warn"><span class="ico">${I.alert}</span><div><h2>Brak aktualnych danych</h2><p>Nie udało się pobrać świeżych komunikatów. To nie znaczy, że jest bezpiecznie. Słuchaj syren, sprawdź Alerty RCB w telefonie i oficjalne komunikaty.</p></div></div>`;
  } else if (list.length) {
    status = `<a class="status alert" style="text-decoration:none" href="#/alerty"><span class="ico">${I.alert}</span><div><h2>Aktywne komunikaty: ${list.length}</h2><p>Dla: ${esc(regionById(state.region)?.name)}. Dotknij, aby zobaczyć.</p></div></a>`;
  } else {
    status = `<div class="status ok"><span class="ico">${I.check}</span><div><h2>Brak aktywnych komunikatów</h2><p>Dla: ${esc(regionById(state.region)?.name)}. Dane z ${esc(fmtDate(alertsData.updated))}. Aplikacja nie zastępuje syren ani Alertu RCB.</p></div></div>`;
  }
  const tile = (h, i, t, soon) => `<a class="tile ${soon ? "soon" : ""}" href="${h}"><span class="ti">${i}</span><b>${t}</b>${soon ? '<span class="badge soon" style="align-self:flex-start">wkrótce</span>' : ""}</a>`;
  const steps = r.steps.map((s, i) => `<li><span class="dot ${s.done ? "done" : ""}">${s.done ? "✓" : i + 1}</span>${s.done ? `<span class="muted">${esc(s.t)}</span>` : `<a href="${s.h}">${esc(s.t)}</a>`}</li>`).join("");
  const last = groupAlerts(list).slice(0, 3).map(groupItem).join("");
  return `<div class="hero"><h1>Pulpit</h1></div>${status}
  <div class="card"><div class="row"><div><div class="muted small">Twoja gotowość</div><div class="big-num">${r.pct}%</div></div><div style="flex:1"><div class="progress" role="progressbar" aria-valuenow="${r.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Gotowość"><i style="width:${r.pct}%"></i></div></div></div>
  <ul class="steps">${steps}</ul></div>
  <div class="grid2 grid-d grid4">${tile("#/pierwsza-pomoc", I.heart, "Pierwsza pomoc")}${tile("#/plecak", I.bag, "Plecak i zapas na 3 dni")}${tile("#/poradnik", I.list, "Co robić")}${tile("#/schrony", I.shield, "Schrony i ukrycia")}</div>
  <a class="tile" style="flex-direction:row;align-items:center;margin-top:12px" href="#/telegram"><span class="ti">${I.send}</span><b>Powiadomienia na Telegramie dla Twojego województwa</b></a>
  ${last ? `<h2 style="margin-top:20px">Ostatnie komunikaty</h2><div class="card flat"><ul class="list">${last}</ul></div>` : ""}`;
}

/* Pilne na górze (alarm/RCB → pogoda → drogi → reszta), w obrębie grupy najnowsze pierwsze. Takie same tytuły zwijamy w jedną pozycję. */
const PRIO = { rcb: 0, pogoda: 1, drogi: 2, woda: 3 };
const prioOf = (a) => (a.alarm ? 0 : PRIO[a.type] ?? 4);
const plural = (n) => (n === 1 ? "komunikat" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "komunikaty" : "komunikatów");
function groupAlerts(list) {
  const map = new Map();
  for (const a of list) {
    const k = `${a.type}|${String(a.title).trim().toLowerCase()}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(a);
  }
  const groups = [...map.values()].map((items) => {
    items.sort((x, y) => (y.published || "").localeCompare(x.published || ""));
    return { items, prio: Math.min(...items.map(prioOf)), date: items[0].published || "" };
  });
  return groups.sort((x, y) => x.prio - y.prio || y.date.localeCompare(x.date));
}
function groupItem(g) {
  if (g.items.length === 1) return msgItem(g.items[0]);
  const a = g.items[0];
  const type = { pogoda: "Pogoda", rcb: "Alert RCB", woda: "Woda", drogi: "Drogi" }[a.type] || "Komunikat";
  const inner = g.items.map((x) => `<li style="margin:8px 0">${x.body ? esc(x.body) : esc(x.title)}<div class="muted small">${esc(fmtDate(x.published))}</div></li>`).join("");
  return `<li class="msg"><details><summary style="cursor:pointer"><div class="meta"><span class="badge ${g.prio === 0 ? "danger" : "info"}">${esc(type)}</span><span>${esc(g.items.length)} ${plural(g.items.length)}</span></div>
  <h3 style="display:inline">${esc(a.title)}</h3> <span class="muted small">(pokaż szczegóły)</span></summary><ul style="padding-left:18px;margin:8px 0">${inner}</ul>
  <p class="src" style="margin:6px 0 0">Źródło: ${esc(a.source || "RSO")}</p></details></li>`;
}

function msgItem(a) {
  const type = { pogoda: "Pogoda", rcb: "Alert RCB", woda: "Woda", drogi: "Drogi" }[a.type] || "Komunikat";
  const url = safeUrl(a.url);
  return `<li class="msg"><div class="meta"><span class="badge ${a.type === "rcb" || a.alarm ? "danger" : "info"}">${esc(type)}</span>${a.alarm ? '<span class="badge danger">Alarm</span>' : ""}<span>${esc(fmtDate(a.published))}</span></div>
  <h3>${esc(a.title)}</h3>${a.body ? `<p class="muted">${esc(a.body)}</p>` : ""}
  <p class="src" style="margin:6px 0 0">Źródło: ${esc(a.source || "RSO")}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Oryginał</a>` : ""}</p></li>`;
}
let alertFilter = "all";
function screenAlerty() {
  const list = regionAlerts().filter((a) => alertFilter === "all" || a.type === alertFilter);
  const chips = ALERT_FILTERS.map((f) => `<button class="chip" data-filter="${f.id}" aria-pressed="${alertFilter === f.id}">${f.label}</button>`).join("");
  let body;
  if (!state.region) body = `<div class="note warn">Wybierz województwo na górze ekranu, aby zobaczyć komunikaty.</div>`;
  else if (!alertsData.ok) body = `<div class="note warn">Nie udało się pobrać komunikatów. Sprawdź połączenie lub oficjalne źródła: <a href="https://komunikaty.tvp.pl" target="_blank" rel="noopener noreferrer">komunikaty.tvp.pl</a>.</div>`;
  else if (!list.length) body = `<div class="note neutral">Brak komunikatów tej kategorii dla województwa: ${esc(regionById(state.region)?.name)}.</div>`;
  else body = `<div class="card flat"><ul class="list">${groupAlerts(list).map(groupItem).join("")}</ul></div>`;
  const stale = alertsData.ok && !alertsFresh() ? `<div class="banner-offline">Dane mogą być nieaktualne (ostatnia aktualizacja: ${esc(fmtDate(alertsData.updated) || "brak")}).</div>` : "";
  return `<div class="hero"><h1>Alerty</h1><p>Oficjalne komunikaty (RSO: Alert RCB, IMGW, woda, drogi) dla Twojego województwa.</p></div>
  <a class="tile" style="flex-direction:row;align-items:center;margin-bottom:12px" href="#/telegram"><span class="ti">${I.send}</span><b>Chcesz dostawać ważne komunikaty na telefon? Powiadomienia Telegram</b></a>
  <div class="chips" role="group" aria-label="Filtry">${chips}</div>${stale}${body}`;
}

/* ---------- powiadomienia Telegram ---------- */
const tgLinks = () => ({ ...CONFIG.telegram, ...(alertsData.telegram || {}) });
function screenTelegram() {
  const links = tgLinks();
  const rows = VOIVODESHIPS.map((v) => {
    const u = safeUrl(links[v.id] || "");
    const mine = state.region === v.id ? ' <span class="badge ok">Twoje</span>' : "";
    return u
      ? `<li><a class="tgrow" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span>${esc(v.name)}${mine}</span><span class="tggo">Dołącz ${I.ext}</span></a></li>`
      : `<li><span class="tgrow off"><span>${esc(v.name)}${mine}</span><span class="badge soon">wkrótce</span></span></li>`;
  }).join("");
  return `<div class="hero"><h1>Powiadomienia Telegram</h1><p>Ważne komunikaty dla Twojego województwa prosto na telefon, także wtedy, gdy nie masz otwartej aplikacji.</p></div>
  <div class="card"><h2>Jak to działa</h2>
  <ol class="how"><li>EGIDA co kilka minut sprawdza oficjalne komunikaty (RSO).</li>
  <li>Gdy pojawi się nowy ważny komunikat dla Twojego województwa, bot publikuje go na kanale Telegram tego województwa.</li>
  <li>Jeśli subskrybujesz kanał, dostajesz powiadomienie. W treści jest odsyłacz do aplikacji, gdzie możesz śledzić rozwój sytuacji.</li></ol>
  <p class="muted small">To kanały „tylko do czytania”: nikt poza botem nie może w nich pisać, nie ma czatu ani komentarzy, a Twoje dane nie są nikomu udostępniane.</p></div>
  <div class="card"><h2>Co będzie przychodzić</h2>
  <ul class="how2"><li><b>Alerty RCB</b> i komunikaty ewakuacyjne,</li><li><b>ostrzeżenia pogodowe</b> (IMGW),</li><li><b>komunikaty o wodzie</b>: susza, wysoki stan rzek, jakość wody,</li><li><b>komunikaty oznaczone w RSO jako alarm</b>.</li></ul>
  <p class="muted small">Komunikaty drogowe zostają tylko w aplikacji, żeby nie zasypywać telefonu.</p>
  <div class="note warn" style="margin-top:10px"><span class="badge soon">Beta</span> <b>Obiekty latające w pobliżu granicy.</b> Alert RCB dostajesz SMS-em, ale nie podaje on szczegółów. Na <a href="#/mapa">mapie</a> jest już wersja testowa nieoficjalnych informacji o dronach i rakietach przy granicy: <b>pozycja, kurs i przewidywany tor</b>. Są oznaczone jako <b>nieoficjalne</b>, pochodzą z zewnętrznego serwisu (NEPTUN) i mogą być spóźnione lub błędne. Powiadomień Telegram o takich obiektach jeszcze nie wysyłamy: najpierw przez kilka tygodni testujemy dane po cichu.</div></div>
  <div class="card"><h2>Jak dołączyć</h2>
  <ol class="how"><li>Zainstaluj aplikację <b>Telegram</b> (jeśli jej nie masz) i załóż konto. Wystarczy numer telefonu.</li>
  <li>Poniżej dotknij nazwy swojego województwa. Telegram otworzy kanał.</li>
  <li>Dotknij <b>Dołącz</b> (albo „Subskrybuj”). Kanały są prywatne, więc dołączasz tylko przez ten odsyłacz.</li>
  <li>Na górze kanału dotknij dzwonka, żeby włączyć powiadomienia.</li></ol>
  <p class="muted small">Powiadomienia Telegrama mogą nie przebić trybu „Nie przeszkadzać” i nie zastępują syren ani Alertu RCB. Przy zagrożeniu życia dzwoń <b>112</b>.</p></div>
  <div class="card flat"><h2 style="padding:16px 16px 4px">Wybierz województwo</h2><ul class="list tglist">${rows}</ul></div>`;
}

function screenMapa(arg) { return renderMapHtml(geoCtx, { demo: arg === "demo" }); }
function screenSoon(t, d) {
  return `<div class="hero"><h1>${t}</h1></div><div class="card"><span class="badge soon">Wkrótce</span><p>${d}</p><a class="btn" href="#/pulpit">Wróć na pulpit</a></div>`;
}

function screenPoradnik() {
  const items = WHAT_TO_DO.items.map((x) => `<a class="check" style="text-decoration:none;color:inherit;cursor:pointer" href="#/co-robic/${x.id}"><span><b>${esc(x.t)}</b><br><span class="muted small">${esc(x.d)}</span></span></a>`).join("");
  return `<div class="hero"><h1>Poradnik</h1><p>Krótkie instrukcje, które działają także bez internetu.</p></div>
  <a class="tile" style="flex-direction:row;align-items:center" href="#/pierwsza-pomoc"><span class="ti">${I.heart}</span><b>Pierwsza pomoc, w tym resuscytacja (RKO)</b></a>
  <h2 style="margin-top:20px">Co robić, gdy…</h2><div class="card flat">${items}</div>
  <a class="tile" style="flex-direction:row;align-items:center;margin-top:12px" href="#/test"><span class="ti">${I.test}</span><b>Test gotowości (2 minuty)</b></a>`;
}
function screenCoRobic(id) {
  const x = WHAT_TO_DO.items.find((i) => i.id === id);
  if (!x) return screenPoradnik();
  return `${back("#/poradnik", "Poradnik")}<div class="hero"><h1>${esc(x.t)}</h1><p>${esc(x.d)}</p></div>
  <div class="card"><ol style="padding-left:1.3rem;margin:0">${x.steps.map((s) => `<li style="margin:.6rem 0">${esc(s)}</li>`).join("")}</ol>${reviewLine(WHAT_TO_DO)}</div>
  <a class="btn112" style="justify-content:center;min-height:52px;width:100%" href="tel:112">${I.phone}Zagrożenie życia? Zadzwoń 112</a>`;
}

let metro = null;
function stopMetro() { if (metro) { clearInterval(metro.t); try { metro.ctx?.close(); } catch { /* */ } metro = null; } }
function startMetro() {
  stopMetro();
  const bpm = FIRST_AID.rko.bpm;
  let ctx = null;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* brak audio */ }
  const pulse = $("#pulse");
  const tick = () => {
    pulse?.classList.add("on"); setTimeout(() => pulse?.classList.remove("on"), 90);
    if (ctx) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.2; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.06); }
    if (navigator.vibrate) navigator.vibrate(30);
  };
  tick();
  metro = { t: setInterval(tick, 60000 / bpm), ctx };
}
function screenPierwszaPomoc() {
  const R = FIRST_AID.rko;
  const steps = R.steps.map((s, i) => `<li style="display:flex;gap:12px;margin:.8rem 0"><span class="dot done" style="flex:none">${i + 1}</span><span><b>${esc(s.t)}</b><br>${esc(s.d)}</span></li>`).join("");
  const others = FIRST_AID.others.map((o) => `<details class="acc"><summary>${esc(o.t)}<span class="muted">${I.chev}</span></summary><div class="body"><ol>${o.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div></details>`).join("");
  return `<div class="hero"><h1>Pierwsza pomoc</h1><p>Działa bez internetu.</p></div>
  <section class="rko"><h2>Nie oddycha? Rozpocznij RKO</h2>
  <div class="row" style="margin:12px 0"><span class="pulse" id="pulse"></span><div><div class="bpm">~${R.bpm}<span style="font-size:1rem"> /min</span></div><div>uciśnięć na minutę</div></div></div>
  <button class="btn" id="metroBtn" aria-pressed="false">Włącz rytm</button></section>
  <div class="card"><ol style="list-style:none;padding:0;margin:0">${steps}</ol>
  <a class="btn112" style="justify-content:center;min-height:52px;width:100%;margin-top:10px" href="tel:112">${I.phone}Zadzwoń 112</a></div>
  <h2 style="margin-top:20px">Inne sytuacje</h2><div class="card flat">${others}</div>${reviewLine(FIRST_AID)}`;
}

let plecakTab = "plecak";
function checkRow(x) {
  return `<label class="check"><input type="checkbox" data-check="${x.id}" ${state.checked[x.id] ? "checked" : ""}><span><b>${esc(x.t)}</b><br><span class="muted small">${esc(x.d)}</span></span></label>`;
}
function screenPlecak() {
  const n = plecakDone(), total = PLECAK.start.length, pct = Math.round((n / total) * 100);
  const tabs = [["plecak", "Plecak"], ["zapas", "Zapas domowy"], ["dokumenty", "Dokumenty"]].map(([k, t]) => `<button class="chip" data-ptab="${k}" aria-pressed="${plecakTab === k}">${t}</button>`).join("");
  let body;
  if (plecakTab === "plecak") {
    body = `<h2>Na start: pięć rzeczy</h2><div class="card flat" style="margin-top:8px">${PLECAK.start.map(checkRow).join("")}</div>
    <h2 style="margin-top:20px">Gdy masz czas</h2><div class="card flat" style="margin-top:8px">${PLECAK.later.map(checkRow).join("")}</div>`;
  } else if (plecakTab === "zapas") {
    body = `<h2>Zapas domowy na min. 3 dni</h2><div class="card flat" style="margin-top:8px">${PLECAK.zapas.map(checkRow).join("")}</div>`;
  } else {
    body = `<h2>Dokumenty i informacje</h2><div class="card flat" style="margin-top:8px">${PLECAK.dokumenty.map(checkRow).join("")}</div>`;
  }
  return `<div class="hero"><h1>Plecak i zapasy</h1><p>Plecak dla każdego domownika i zapas domowy na min. 3 dni. Bez przesady.</p></div>
  <div class="card"><div class="row"><b style="font-family:var(--font-h)">Na start: ${n} z ${total}</b><span class="spacer"></span><b>${pct}%</b></div><div class="progress" style="margin-top:8px"><i style="width:${pct}%"></i></div></div>
  <div class="chips" role="group" aria-label="Sekcje">${tabs}</div>${body}
  <div class="note" style="margin-top:12px">${esc(PLECAK.note)}</div>
  <p class="src">Źródło: ${esc(PLECAK.source)}. Każdy domownik, także dziecko, ma własny plecak. Zaznaczenia zapisują się tylko w tym urządzeniu. Ostatni przegląd: ${PLECAK.reviewed ? esc(PLECAK.reviewed) : "<b>oczekuje na zatwierdzenie</b>"}.</p>`;
}

let testAnswers = {};
function screenTest() {
  const q = READINESS_QUESTIONS.map((x) => `<label class="check"><input type="checkbox" data-q="${x.id}" ${testAnswers[x.id] ? "checked" : ""}><span>${esc(x.t)}</span></label>`).join("");
  const prev = state.test ? `<div class="note neutral">Ostatni wynik: ${state.test.score} z ${READINESS_QUESTIONS.length} (${esc(fmtDate(state.test.at))}).</div>` : "";
  return `${back("#/poradnik", "Poradnik")}<div class="hero"><h1>Test gotowości</h1><p>Zaznacz to, co jest prawdą. Nie oceniamy – pokażemy tylko, od czego zacząć.</p></div>${prev}
  <div class="card flat" style="margin-top:12px">${q}</div><button class="btn primary" id="testDone">Pokaż wynik</button>`;
}
function screenWynik() {
  const t = state.test; if (!t) return screenTest();
  const miss = READINESS_QUESTIONS.filter((x) => !t.answers[x.id]);
  const next = miss.slice(0, 3).map((x) => `<li><a href="${x.link}">${esc(x.t.replace(/^Mam |^Wiem, że |^Wiem, /, "").replace(/\.$/, ""))}</a></li>`).join("");
  return `<div class="hero"><h1>Twój wynik</h1></div>
  <div class="card"><div class="big-num">${t.score}<span class="muted" style="font-size:1.2rem"> z ${READINESS_QUESTIONS.length}</span></div>
  <p>${t.score === READINESS_QUESTIONS.length ? "Świetnie. Wróć za kilka miesięcy i sprawdź daty ważności." : "Każdy krok się liczy. Nie trzeba wszystkiego naraz."}</p>
  ${miss.length ? `<h3 style="margin-top:12px">Zacznij od:</h3><ul>${next}</ul>` : ""}</div>
  <a class="btn" href="#/test">Zrób test jeszcze raz</a>`;
}

function screenUstawienia() {
  const c = state.consent;
  const tg = state.region ? safeUrl(tgLinks()[state.region] || "") : "";
  const opt = (v, cur, t) => `<option value="${v}" ${cur === v ? "selected" : ""}>${t}</option>`;
  return `<div class="hero"><h1>Ustawienia</h1></div>
  <div class="card"><h2>Region i lokalizacja</h2><div class="field" style="margin-top:8px"><label for="setRegion" class="muted small">Województwo${state.regionSource === "gps" ? ' <span class="tag-gps">wg GPS (przybliżone – sprawdź)</span>' : ""}</label>
  <select class="sel" id="setRegion"><option value="">— wybierz —</option>${VOIVODESHIPS.map((v) => `<option value="${v.id}" ${state.region === v.id ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></div>
  <button class="btn" id="useGps" style="margin-top:10px">${I.pin}Użyj lokalizacji GPS</button><p class="muted small">Pozycja jest używana tylko w Twoim telefonie, do wskazania najbliższego województwa. Nie jest wysyłana na serwer.</p></div>
  <div class="card"><h2>Powiadomienia</h2>${tg ? `<p>Kanał Telegram dla Twojego województwa:</p><a class="btn primary" href="${esc(tg)}" target="_blank" rel="noopener noreferrer">Otwórz kanał Telegram ${I.ext}</a>` : `<p class="muted">Kanał Telegram dla Twojego województwa jest w przygotowaniu. Powiadomienia nie przebijają trybu „Nie przeszkadzać” i nie zastępują syren ani Alertu RCB.</p>`}<p style="margin-top:10px"><a href="#/telegram">Jak działają powiadomienia Telegram i lista kanałów</a></p></div>
  <div class="card"><h2>Prywatność</h2>
  <label class="switch"><input type="checkbox" id="setCounter" ${c.counter ? "checked" : ""}><span><b>Anonimowy licznik odwiedzin</b><span class="muted small">Bez cookies i identyfikatorów. ${CONFIG.goatcounter ? "" : "(Licznik nie jest jeszcze skonfigurowany, więc nic nie jest zliczane.)"}</span></span></label>
  ${CONFIG.neptun?.enabled === false ? "" : `<label class="switch"><input type="checkbox" id="setNeptun" ${c.neptun ? "checked" : ""}><span><b>Obiekty znad Ukrainy na mapie (NEPTUN) <span class="badge unofficial">nieoficjalne · beta</span></b><span class="muted small">Zgoda na bezpośrednie połączenie z neptun.in.ua, gdy włączysz tę warstwę na mapie. Serwis zobaczy Twój adres IP. Dane mogą być spóźnione lub błędne.</span></span></label>`}</div>
  <div class="card"><h2>Wygląd</h2><div class="grid2" style="margin-top:8px"><div class="field"><label for="setFs" class="muted small">Rozmiar tekstu</label><select class="sel" id="setFs">${opt("normal", state.fs, "Normalny")}${opt("large", state.fs, "Duży")}${opt("xlarge", state.fs, "Bardzo duży")}</select></div>
  <div class="field"><label for="setContrast" class="muted small">Kontrast</label><select class="sel" id="setContrast">${opt("normal", state.contrast, "Normalny")}${opt("high", state.contrast, "Wysoki")}</select></div></div></div>
  <div class="card"><h2>Twoje dane</h2><p class="muted">Wszystko, co ustawisz, jest tylko w tym urządzeniu.</p><div class="grid2"><button class="btn" id="exportData">Pobierz dane</button><button class="btn" id="wipeData">Usuń dane</button></div></div>
  <a class="btn" href="#/zrodla">Źródła i licencje</a>
  ${CONFIG.contactUrl ? `<a class="btn" style="margin-top:10px" href="${esc(safeUrl(CONFIG.contactUrl))}" target="_blank" rel="noopener noreferrer">Zgłoś błąd</a>` : ""}`;
}
function screenZrodla() {
  const rows = SOURCES.map((s) => `<tr><td><a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(s.n)}</a><br><span class="muted">${esc(s.w)}</span></td><td>${esc(s.l)}</td></tr>`).join("");
  return `${back("#/ustawienia", "Ustawienia")}<div class="hero"><h1>Źródła i licencje</h1><p>EGIDA jest nieoficjalna i niezależna. Pokazujemy, skąd pochodzą dane.</p></div>
  <div class="card"><table class="t"><thead><tr><th>Źródło</th><th>Licencja / warunki</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="src">Dane pochodzą od stron trzecich „tak jak są” i mogą być spóźnione lub błędne. Grafik i logo RCB nie używamy.</p>`;
}

/* ---------- router ---------- */
const parse = () => { const p = (location.hash.replace(/^#\/?/, "") || "pulpit").split("/"); return { route: p[0], arg: p[1] }; };
function render() {
  stopMetro();
  destroyScreens();
  const { route, arg } = parse();
  const app = $("#app");
  if (!state.onboarded) { app.innerHTML = screenStart(); document.title = "EGIDA – Witaj"; return; }
  let inner;
  switch (route) {
    case "alerty": inner = screenAlerty(); break;
    case "mapa": inner = screenMapa(arg); break;
    case "schrony": inner = renderSheltersHtml(geoCtx, { demo: arg === "demo" }); break;
    case "plan-rodziny": inner = screenSoon("Plan rodziny", "Miejsce spotkania, kontakty i karta ICE do wydruku są w przygotowaniu."); break;
    case "poradnik": inner = screenPoradnik(); break;
    case "co-robic": inner = screenCoRobic(arg); break;
    case "pierwsza-pomoc": inner = screenPierwszaPomoc(); break;
    case "plecak": inner = screenPlecak(); break;
    case "test": inner = arg === "wynik" ? screenWynik() : screenTest(); break;
    case "telegram": inner = screenTelegram(); break;
    case "ustawienia": inner = screenUstawienia(); break;
    case "zrodla": inner = screenZrodla(); break;
    default: inner = screenPulpit();
  }
  app.innerHTML = shell(route, inner);
  if (route === "mapa") initMapScreen(geoCtx, { demo: arg === "demo" });
  else if (route === "schrony") initSheltersScreen(geoCtx, { demo: arg === "demo" });
  const titles = { pulpit: "Pulpit", alerty: "Alerty", mapa: "Mapa", poradnik: "Poradnik", plecak: "Plecak", "pierwsza-pomoc": "Pierwsza pomoc", test: "Test gotowości", ustawienia: "Ustawienia", zrodla: "Źródła", telegram: "Powiadomienia Telegram", schrony: "Schrony" };
  document.title = `EGIDA – ${titles[route] || "Pulpit"}`;
  window.scrollTo(0, 0);
}

/* ---------- GPS -> najbliższe województwo (przybliżenie, bez wysyłania pozycji) ---------- */
function useGps(after) {
  if (!navigator.geolocation) { alert("Ta przeglądarka nie obsługuje lokalizacji. Wybierz województwo ręcznie."); return; }
  navigator.geolocation.getCurrentPosition((p) => {
    const { latitude: la, longitude: lo } = p.coords;
    const k = Math.cos((la * Math.PI) / 180);
    let best = null, bd = 1e9;
    for (const v of VOIVODESHIPS) { const d = (v.lat - la) ** 2 + ((v.lon - lo) * k) ** 2; if (d < bd) { bd = d; best = v; } }
    state.region = best.id; state.regionSource = "gps"; save(); after?.();
  }, () => { alert("Nie udało się ustalić lokalizacji. Wybierz województwo ręcznie."); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
}

/* ---------- licznik ---------- */
function applyCounter() {
  if (!CONFIG.goatcounter || !state.consent.counter || document.getElementById("gc")) return;
  const s = document.createElement("script");
  s.id = "gc"; s.async = true; s.src = "https://gc.zgo.at/count.js"; s.dataset.goatcounter = CONFIG.goatcounter;
  document.head.appendChild(s);
}

/* ---------- zdarzenia ---------- */
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "regionSel") {
    if (t.value === "__gps") { useGps(render); t.value = state.region || ""; return; }
    state.region = t.value; state.regionSource = "manual"; save(); render();
  } else if (t.id === "startRegion") { state.region = t.value || null; state.regionSource = "manual"; save(); }
  else if (t.id === "cGps") state.consent.gps = t.checked;
  else if (t.id === "cCounter") { state.consent.counter = t.checked; save(); }
  else if (t.id === "cAck") { state.consent.ack = t.checked; save(); $("#goStart").disabled = !t.checked; }
  else if (t.id === "setRegion") { state.region = t.value || null; state.regionSource = "manual"; save(); render(); }
  else if (t.id === "setCounter") { state.consent.counter = t.checked; save(); applyCounter(); }
  else if (t.id === "setNeptun") { state.consent.neptun = t.checked; if (!t.checked && state.map?.layers) state.map.layers.neptun = false; save(); }
  else if (t.id === "setFs") { state.fs = t.value; save(); applyPrefs(); }
  else if (t.id === "setContrast") { state.contrast = t.value; save(); applyPrefs(); }
  else if (t.dataset.check) { state.checked[t.dataset.check] = t.checked; save(); render(); const el = document.querySelector(`[data-check="${t.dataset.check}"]`); el?.focus(); }
  else if (t.dataset.q) testAnswers[t.dataset.q] = t.checked;
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "goStart") {
    state.onboarded = true; save(); applyCounter();
    if (state.consent.gps && !state.region) useGps(render); else render();
    if (!location.hash) location.hash = "#/pulpit";
  } else if (b.dataset.filter) { alertFilter = b.dataset.filter; render(); }
  else if (b.dataset.ptab) { plecakTab = b.dataset.ptab; render(); }
  else if (b.id === "useGps") useGps(render);
  else if (b.id === "metroBtn") {
    if (metro) { stopMetro(); b.textContent = "Włącz rytm"; b.setAttribute("aria-pressed", "false"); } else { startMetro(); b.textContent = "Wyłącz rytm"; b.setAttribute("aria-pressed", "true"); }
  } else if (b.id === "testDone") {
    const score = READINESS_QUESTIONS.filter((q) => testAnswers[q.id]).length;
    state.test = { answers: { ...testAnswers }, score, at: new Date().toISOString() }; save(); location.hash = "#/test/wynik";
  } else if (b.id === "exportData") {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "egida-moje-dane.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else if (b.id === "wipeData") {
    if (confirm("Usunąć wszystkie dane zapisane w tej aplikacji na tym urządzeniu?")) { try { localStorage.removeItem(KEY); } catch { /* */ } state = defaults(); testAnswers = {}; applyPrefs(); location.hash = ""; render(); }
  }
});
window.addEventListener("hashchange", () => { if (parse().route === "test" && !parse().arg) testAnswers = { ...(state.test?.answers || {}) }; render(); });

/* ---------- start ---------- */
applyPrefs(); applyCounter();
testAnswers = { ...(state.test?.answers || {}) };
render();
loadAlerts().then(() => { if (state.onboarded && ["pulpit", "alerty", "ustawienia", "telegram", ""].includes(parse().route) && !document.activeElement?.closest?.("select")) render(); });
setInterval(() => loadAlerts().then(() => { if (["pulpit", "alerty", "ustawienia", "telegram"].includes(parse().route) && !document.activeElement?.closest?.("select")) render(); }), 5 * 60 * 1000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
