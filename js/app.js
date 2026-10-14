import { CONFIG } from "./config.js";
import {
  VOIVODESHIPS, LEGAL_HTML, ALERT_FILTERS, PLECAK, FIRST_AID, WHAT_TO_DO, READINESS_QUESTIONS, SOURCES,
} from "./content.js";
import { APTECZKA, BEZPRADU, HYBRYDOWE } from "./content.js";
import { C } from "./icons.js";
import { AIR_NAMES, AIR_TONE, AIR_ADVICE, normalizeAir, nearestStation } from "./air.js";
import { analyze, statusOf, summarize, compose } from "./classify.js";
import { APP_VERSION, APP_BUILD } from "./version.js";
import { storyTokens, sameStory } from "./similar.js";
import { emptyPlan, normalizePlan, normalizePlaces, importState, normalizeKit, kitDue, kitSorted, kitStatus, kitDays, todayYmd, exportState, KIT_LIMIT } from "./personal.js";
import { renderEmergency, initEmergency, renderPlan, initPlan, renderPlaces, initPlaces, renderPrivacy, shareText, shareNote, printSheet, planPrintHtml, packPrintHtml, guidePrintHtml } from "./screens2.js";
import { renderMapHtml, initMapScreen, destroyScreens } from "./mapscreen.js";
import { renderSheltersHtml, initSheltersScreen } from "./sheltersscreen.js";
import { makePspCache } from "./shelters.js";
import { offlineCenters, downloadOffline, offlineSummary } from "./offline.js";
import { normalizeNews, newsFresh, newsForRegion, newsGroup, groupLabel, newsCounts, NEWS_GROUPS, roadsForRegion, ROADS_LINK, ageLabel } from "./news.js";

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
  more: ic('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
  chevr: ic('<path d="M9 6l6 6-6 6"/>', 18),
  chev: ic('<path d="M6 9l6 6 6-6"/>', 18),
  phone: ic('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>', 18),
  check: ic('<path d="M5 12l5 5 9-10"/>', 20),
  alert: ic('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
  list: ic('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  test: ic('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  back: ic('<path d="M15 6l-6 6 6 6"/>', 20),
  users: ic('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.2c2.7 0 4.5 2 4.5 4.8"/>'),
  send: ic('<path d="M21 3L3 10.5l6.5 2.5L12 20z"/><path d="M21 3L9.5 13"/>'),
  ext: ic('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>', 16),
};
const LOGO = `<img class="logo" src="icons/logo.png" width="27" height="34" alt="" aria-hidden="true">`;

/* ---------- stan (tylko w urządzeniu) ---------- */
const KEY = "egida.v1";
const defaults = () => ({
  onboarded: false,
  consent: { gps: false, counter: false, ack: false, neptun: true },
  region: null, regionSource: null, regionNear: null, // regionSource: "manual" | "gps" | "gps-edge" | "place"; regionNear: { km, id } gdy GPS wskazał miejsce blisko granicy województw
  plan: emptyPlan(), // plan rodziny i karty ICE (tylko w urządzeniu)
  places: [], // ważne miejsca: dom, praca, rodzina (tylko w urządzeniu)
  shelters: [], // „Moje miejsca schronienia” (tylko w urządzeniu)
  map: { base: "map", layers: { shelters: true, neptun: true } },
  offline: null, // { at, centers, points, failed, shelterDb } – ostatnie pobranie danych na wypadek braku internetu
  installDismissed: null, // data, kiedy użytkownik zamknął podpowiedź „Dodaj do ekranu początkowego”
  mig: {}, // znaczniki jednorazowych migracji ustawień
  checked: {},
  test: null, // {answers:{}, score, at}
  fs: "normal", contrast: "normal",
  myKit: [], // własna apteczka: leki i środki z terminem ważności (tylko w urządzeniu)
  senior: false, // tryb seniora: większy tekst, uproszczony Pulpit, wielki przycisk 112
  lastBackup: "", // data ostatniej kopii danych (RRRR-MM-DD)
});
let state = defaults();
try { state = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { /* brak/uszkodzone dane */ }
// v15: NEPTUN (nieoficjalne obiekty znad Ukrainy) jest domyślnie włączony. Jednorazowo włączamy go też osobom, które aplikację już miały;
// kto potem sam go wyłączy, ma wyłączony na stałe (znacznik mig.neptunOn).
if (!state.mig?.neptunOn) {
  state.mig = { ...(state.mig || {}), neptunOn: true };
  state.consent = { ...(state.consent || {}), neptun: true };
  state.map = { ...(state.map || { base: "map" }), layers: { shelters: true, ...(state.map?.layers || {}), neptun: true } };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* */ }
}
state.plan = normalizePlan(state.plan); state.places = normalizePlaces(state.places); state.myKit = normalizeKit(state.myKit); state.senior = state.senior === true;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* tryb prywatny */ } };
const applyPrefs = () => {
  document.documentElement.dataset.fs = state.fs === "normal" ? "" : state.fs;
  document.documentElement.dataset.contrast = state.contrast === "high" ? "high" : "";
  document.documentElement.dataset.senior = state.senior ? "1" : "";
};

/* ---------- komunikaty ---------- */
let alertsData = { loaded: false, ok: false, updated: null, items: [] };
const ALERTS_CACHE = "egida.alerts.v1";
async function loadAlerts() {
  try {
    const r = await fetch(`${CONFIG.alertsUrl}${CONFIG.alertsUrl.includes("?") ? "&" : "?"}t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    alertsData = { loaded: true, ok: true, live: true, checkedAt: Date.now(), updated: j.updated || null, items: Array.isArray(j.items) ? j.items : [], telegram: j.telegram && typeof j.telegram === "object" ? j.telegram : {} };
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
/* ---------- „Wiadomości z regionu i kraju”: aktualności z oficjalnych źródeł (Policja, MEN, RCB, urzędy, kuratoria), zebrane przez serwer ---------- */
let newsData = null; // znormalizowany plik albo null (brak/niepoprawny)
let newsScope = null; // region | kraj | swiat (null = domyślnie: województwo, a bez wybranego – z kraju)
const NEWS_CACHE = "egida.news.v1";
async function loadNews() {
  if (!CONFIG.newsUrl) return;
  try {
    const r = await fetch(`${CONFIG.newsUrl}${CONFIG.newsUrl.includes("?") ? "&" : "?"}t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const n = normalizeNews(j);
    if (!n) throw new Error("format");
    newsData = n;
    try { localStorage.setItem(NEWS_CACHE, JSON.stringify(j)); } catch { /* brak miejsca / tryb prywatny */ }
  } catch {
    try { newsData = normalizeNews(JSON.parse(localStorage.getItem(NEWS_CACHE) || "null")) || newsData; } catch { /* uszkodzone */ }
  }
}
const newsLink = (x) => { const g = groupLabel(x, state.region); return `<li class="newsitem"><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><span class="nt">${esc(x.title)}</span><span class="nm">${g ? `<span class="badge grp${x.region === "world" ? " world" : x.region === "all" ? " kraj" : ""}">${esc(g)}</span> ` : ""}${x.kind === "media" ? '<span class="badge media">doniesienie medialne</span> ' : ""}${esc(x.source)} · ${esc(ageLabel(x.date))}</span></a></li>`; };
/* Utrudnienia na drogach krajowych (GDDKiA) dla Twojego województwa: wiersze do bloku „Dobrze wiedzieć” */
const roadRows = () => (state.region && newsData && newsFresh(newsData) ? roadsForRegion(newsData, state.region) : []);
const roadLi = (x) => `<li><span class="lbl">Drogi krajowe · GDDKiA</span><span class="shead">${esc(x.title)}</span><span class="ssub">od ${esc(fmtDate(x.date))}${x.until ? `, do ${esc(fmtDate(x.until))}` : ""}</span></li>`;
const roadMore = (n) => `<a class="gall" href="${ROADS_LINK}" target="_blank" rel="noopener noreferrer">Utrudnienia na drogach krajowych${n > 3 ? ` (${n})` : ""} – GDDKiA ${I.ext}</a>`;
function newsCardHtml() {
  if (!newsData || !state.region) return "";
  const fresh = newsFresh(newsData);
  const list = fresh ? newsForRegion(newsData, state.region, { max: 5 }) : [];
  if (fresh && !list.length && !newsGroup(newsData, "swiat", state.region).length) return "";
  const body = fresh ? (list.length ? `<ul class="newslist">${list.map(newsLink).join("")}</ul>` : `<p class="muted small" style="margin:6px 0 0">Brak nowych wiadomości z Twojego województwa i z kraju.</p>`) : `<p class="muted small" style="margin:6px 0 0">Brak aktualnych danych. Wiadomości z oficjalnych stron mogą być nieaktualne, więc ich nie pokazujemy.</p>`;
  const nw = fresh ? newsGroup(newsData, "swiat", state.region).length : 0;
  const world = nw ? `<button class="smore2 newsworld" data-newsgo="swiat">Ze świata - wpływ na Polskę (${nw}) ${I.chevr}</button>` : "";
  return `<div class="card newscard"><h2>Wiadomości</h2>${body}${world}<a class="smore2" href="#/wazne">Wszystkie wiadomości ${I.chevr}</a></div>`;
}
const curScope = () => newsScope || (state.region ? "region" : "kraj");
function newsListHtml() {
  if (!CONFIG.newsUrl || !newsData) return `<div class="note neutral">Nie udało się pobrać wiadomości. Sprawdź połączenie. Oficjalne komunikaty są w zakładce <a href="#/alerty">Alerty</a>.</div>`;
  if (!newsFresh(newsData)) return `<div class="note warn"><b>Brak aktualnych danych.</b> Wiadomości z oficjalnych stron nie były ostatnio odświeżane, więc ich nie pokazujemy. Sprawdź strony Policji i swojego urzędu wojewódzkiego.</div>`;
  const sc = curScope();
  if (sc === "region" && !state.region) return `<div class="note neutral">Wybierz swoje województwo w <a href="#/ustawienia">Ustawieniach</a>, a pokażemy wiadomości z Twojego regionu. Na razie zajrzyj do „Z kraju”.</div>`;
  const list = newsGroup(newsData, sc, state.region);
  const empty = { region: "Brak wiadomości o bezpieczeństwie z Twojego województwa z ostatnich dni.", kraj: "Brak wiadomości ogólnopolskich z ostatnich dni.", swiat: "Brak wiadomości ze świata, które wpływają na Polskę." }[sc];
  if (!list.length) return `<div class="note neutral">${empty}</div>`;
  return `<div class="card flat"><ul class="list newslist">${list.map(newsLink).join("")}</ul></div>`;
}
const SCOPE_HELP = { region: "Z Twojego województwa: Policja, urzędy, kuratoria i media. Miejsce ustala program po nazwie miejscowości lub regionu. Gdy nie ma pewności, wpisu nie pokazujemy.", kraj: "Sprawy ogólnopolskie: RCB, MEN i poważne zagrożenia dotyczące całej Polski.", swiat: "Tylko wiadomości ze świata, które wprost wiążą się z Polską, Ukrainą, Rosją, Białorusią, NATO lub Europą (wojna, drony, sabotaż, broń masowego rażenia, granica). Dodatkowo ostrzeżenia służb wywiadowczych państw NATO (np. MI5) przed bronią masowego rażenia, terroryzmem lub sabotażem. Wydarzenia bez takiego związku pomijamy." };
function screenWazne() {
  const sc = curScope(), counts = newsData && newsFresh(newsData) ? newsCounts(newsData, state.region) : {};
  const chips = NEWS_GROUPS.map(([id, t]) => `<button class="chip" data-newsscope="${id}" aria-pressed="${sc === id}">${id === "region" && !state.region ? "Moje woj. (wybierz)" : t}${counts[id] ? ` · ${counts[id]}` : ""}</button>`).join("");
  const upd = newsData?.generatedAt ? ` Ostatnie odświeżenie: ${esc(fmtDate(newsData.generatedAt))}.` : "";
  return `<div class="hero"><h1>Wiadomości</h1><p>Wiadomości o bezpieczeństwie: z Twojego województwa, z kraju i ze świata (tylko to, co wpływa na Polskę).</p></div>
  <div class="chips" role="group" aria-label="Zakres">${chips}</div>
  <p class="muted small" style="margin:6px 2px 10px">${esc(SCOPE_HELP[sc])}</p>
  <div id="newsList">${newsListHtml()}</div>
  <p class="muted small">Wpisy wybiera automatycznie program po słowach kluczowych i odsyła do strony źródłowej. To nie są alerty: nie zastępują syren, Alertów RCB ani poleceń służb. Brak wpisu nie oznacza braku zagrożenia.${upd}</p>`;
}

/* Ocena: waga, ważność, odwołania (js/classify.js). „Aktywne” = jeszcze ważne i nieodwołane; reszta trafia do „Wcześniejsze”. */
const inRegion = (a) => !state.region || a.voivodeship === state.region || a.voivodeship === "all";
const regionAll = () => analyze(alertsData.items).filter(inRegion);
const regionAlerts = () => regionAll().filter((a) => a.active);
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
  alertsFor: (rid) => analyze(alertsData.items).filter((a) => a.active && (a.voivodeship === rid || a.voivodeship === "all")),
  back: (h, t) => back(h, t),
  rerender: () => render(),
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
  { h: "#/pulpit", k: "pulpit", t: "Pulpit", i: C.home },
  { h: "#/alerty", k: "alerty", t: "Alerty", i: C.bell },
  { h: "#/mapa", k: "mapa", t: "Zagrożenia", i: C.map },
  { h: "#/schrony", k: "schrony", t: "W pobliżu", i: C.shield },
  { h: "#/poradnik", k: "poradnik", t: "Poradnik", i: C.book },
];
const TABS = [...NAV, { h: "#/wiecej", k: "wiecej", t: "Więcej", i: C.more }];
const MORE = [
  { h: "#/pierwsza-pomoc", t: "Pierwsza pomoc", d: "Krwotok, RKO, zadławienie. Działa offline", i: C.heart },
  { h: "#/wazne", t: "Wiadomości", d: "Policja, MEN, RCB i urzędy: bezpieczeństwo", i: C.news },
  { h: "#/bez-pradu", t: "Bez prądu", d: "Plan na pierwsze 72 godziny", i: C.bolt },
  { h: "#/hybrydowe", t: "Zagrożenia hybrydowe", d: "Dezinformacja, oszustwa, awarie sieci", i: C.hybrid },
  { h: "#/plan-rodziny", t: "Plan rodziny", d: "Kontakty, miejsce spotkania, karty ICE", i: C.users },
  { h: "#/plecak", t: "Plecak i zapasy", d: "Zestaw na 72 godziny, zapas domowy, dokumenty", i: C.bag },
  { h: "#/apteczka", t: "Apteczka", d: "Co mieć, jak przechowywać, do czego służy", i: C.kit },
  { h: "#/moja-apteczka", t: "Moja apteczka", d: "Twoje leki i terminy ważności", i: C.list },
  { h: "#/test", t: "Test gotowości", d: "Sprawdź, jak jesteś przygotowany", i: C.test },
  { h: "#/zagrozenie", t: "Tryb zagrożenia", d: "112, schron i trzy kroki", i: C.danger },
  { h: "#/miejsca", t: "Ważne miejsca", d: "Dom, praca, rodzina", i: C.pin },
  { h: "#/telegram", t: "Powiadomienia Telegram", d: "Kanał dla Twojego województwa", i: C.tg },
  { h: "#/ustawienia", t: "Ustawienia", d: "Województwo, zgody, wygląd, tryb seniora, kopia danych", i: C.gear },
  { h: "#/zrodla", t: "Źródła i licencje", d: "Skąd mamy dane", i: C.book },
  { h: "#/prywatnosc", t: "Polityka prywatności", d: "Co zostaje w telefonie", i: C.list },
];
const SIDE = [
  ...NAV.slice(0, 2),
  { h: "#/wazne", k: "wazne", t: "Wiadomości", i: C.news },
  { h: "#/telegram", k: "telegram", t: "Powiadomienia Telegram", i: C.tg },
  { h: "#/mapa", k: "mapa", t: "Mapa zagrożeń", i: C.map },
  { h: "#/schrony", k: "schrony", t: "Pomoc w pobliżu", i: C.shield },
  { h: "#/poradnik", k: "poradnik", t: "Poradnik", i: C.book },
  { h: "#/pierwsza-pomoc", k: "pierwsza-pomoc", t: "Pierwsza pomoc", i: C.heart },
  { h: "#/bez-pradu", k: "bez-pradu", t: "Bez prądu", i: C.bolt },
  { h: "#/hybrydowe", k: "hybrydowe", t: "Zagrożenia hybrydowe", i: C.hybrid },
  { h: "#/apteczka", k: "apteczka", t: "Apteczka", i: C.kit },
  { h: "#/moja-apteczka", k: "moja-apteczka", t: "Moja apteczka", i: C.list },
  { h: "#/plecak", k: "plecak", t: "Plecak i zapasy", i: C.bag },
  { h: "#/test", k: "test", t: "Test gotowości", i: C.test },
  { h: "#/zagrozenie", k: "zagrozenie", t: "Tryb zagrożenia", i: C.danger },
  { h: "#/plan-rodziny", k: "plan-rodziny", t: "Plan rodziny", i: C.users },
  { h: "#/miejsca", k: "miejsca", t: "Ważne miejsca", i: C.pin },
  { h: "#/ustawienia", k: "ustawienia", t: "Ustawienia", i: C.gear },
  { h: "#/zrodla", k: "zrodla", t: "Źródła i licencje", i: C.book },
];
const GROUP = { ustawienia: "wiecej", zrodla: "wiecej", prywatnosc: "wiecej", telegram: "alerty", "co-robic": "poradnik", "pierwsza-pomoc": "poradnik", apteczka: "poradnik", "moja-apteczka": "poradnik", "bez-pradu": "poradnik", hybrydowe: "poradnik", test: "poradnik", plecak: "wiecej", "plan-rodziny": "pulpit", zagrozenie: "pulpit", miejsca: "pulpit" };

function shell(route, inner) {
  const cur = GROUP[route] || route;
  const side = SIDE.map((n) => `<a class="nav ${n.soon ? "soon" : ""}" href="${n.h}" ${n.k === route || (n.k === "poradnik" && route === "co-robic") ? 'aria-current="page"' : ""}>${n.i}<span>${n.t}</span>${n.soon ? '<span class="badge soon">wkrótce</span>' : ""}</a>`).join("");
  const tabs = TABS.map((n) => `<a href="${n.h}" ${n.k === cur ? 'aria-current="page"' : ""}>${n.i}<span>${n.t}</span></a>`).join("");
  return `<div class="shell" data-route="${esc(route || "pulpit")}"><nav class="side" aria-label="Menu główne"><a class="brand" href="#/pulpit">${LOGO}<span><span class="wordmark">EGIDA</span><span class="tagline">Twoje centrum bezpieczeństwa</span></span></a>${side}</nav>
  <main class="main" id="main" tabindex="-1">${topbar()}${updBar()}${inner}${legal()}</main>
  <a class="fab112" href="tel:112" aria-label="Zagrożenie życia? Zadzwoń 112">${I.phone}112</a>
  <nav class="tabbar" aria-label="Menu dolne">${tabs}</nav></div>`;
}
const back = (h, t = "Wstecz") => `<a class="back" href="${h}">${I.back}${t}</a>`;
const reviewLine = (m) => `<p class="src">Źródło: ${esc(m.source)}. Ostatni przegląd: ${esc(m.reviewed)}.</p>`;

/* ---------- podpowiedź: dodaj do ekranu początkowego ---------- */
const isStandalone = () => { try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch { return false; } };
const mobileOS = () => {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return /Android/i.test(ua) ? "android" : null;
};
let installEvt = null; // zdarzenie „beforeinstallprompt” (Chrome na Androidzie)
function installHtml(withDismiss) {
  const os = mobileOS();
  if (!os || isStandalone()) return "";
  const how = os === "ios"
    ? "Dotknij ikony <b>Udostępnij</b> (kwadrat ze strzałką w górę), potem wybierz <b>„Do ekranu początkowego”</b>."
    : installEvt ? "Dotknij przycisku poniżej." : "W menu przeglądarki (trzy kropki) wybierz <b>„Zainstaluj aplikację”</b> albo <b>„Dodaj do ekranu głównego”</b>.";
  const btns = `${os === "android" && installEvt ? '<button class="btn primary" id="installBtn">Zainstaluj aplikację</button>' : ""}${withDismiss ? '<button class="btn" id="installLater">Nie teraz</button>' : ""}`;
  return `<div class="card" id="installCard"><h2>Dodaj EGIDĘ do ekranu telefonu</h2>
  <p>Otworzy się na całym ekranie, jak zwykła aplikacja, i łatwiej ją znaleźć w razie potrzeby.${os === "ios" ? " Na iPhonie zapisane dane (plan rodziny, pobrane schrony) zostają wtedy dłużej niż przy otwieraniu strony w przeglądarce." : ""}</p>
  <p class="muted small">${how}</p>${btns ? `<div class="grid2" style="margin-top:10px">${btns}</div>` : ""}</div>`;
}
const installHint = () => (state.installDismissed ? "" : installHtml(true));
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; const r = parse().route; if (state.onboarded && (r === "pulpit" || r === "ustawienia")) render(); });
window.addEventListener("appinstalled", () => { installEvt = null; if (state.onboarded) render(); });
// iPhone: po odświeżeniu / powrocie do aplikacji Safari bywa, że okno jest „przewinięte” i dolny pasek wisi w połowie ekranu – wracamy na górę i wymuszamy przeliczenie układu.
{ const fixView = () => { try { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); const d = document.documentElement; d.style.minHeight = "0"; void d.offsetHeight; d.style.minHeight = ""; } catch { /* */ } };
  for (const ev of ["pageshow", "resize", "orientationchange"]) window.addEventListener(ev, fixView);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) fixView(); });
  window.visualViewport?.addEventListener("resize", fixView); fixView(); }

/* ---------- tryb „na wypadek braku internetu” ---------- */
const fmtWhen = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
function offlineCardHtml() {
  const o = state.offline, np = (state.places || []).length, ns = (state.shelters || []).length;
  const last = o?.at ? `Ostatnie pobranie: ${esc(fmtWhen(o.at))}. Zapisano ${esc(offlineSummary(o))}` : "Jeszcze nic nie pobrano.";
  return `<div class="card" id="offlineCard"><h2>Na wypadek braku internetu</h2>
  <p>Zapisz w telefonie schrony z okolic Twoich miejsc, listę defibrylatorów (AED) i szpitali w Polsce oraz ostatnie komunikaty i wiadomości. Potem lista najbliższych miejsc pomocy, instrukcje i plan rodziny działają bez internetu (GPS działa bez sieci). Tło mapy nadal wymaga internetu.</p>
  <p class="muted small">Pobierzemy okolice: Twojej pozycji (gdy zezwolisz na lokalizację w Ustawieniach), Ważnych miejsc (${np}) i Twoich schronów (${ns}); gdy ich nie ma, okolice środka Twojego województwa. To zwykle kilka MB (defibrylatory i szpitale ok. 1–2 MB), najlepiej przez Wi-Fi. Nic nie jest wysyłane na serwer. Powtórz po dodaniu nowych miejsc albo przed wyjazdem.</p>
  <button class="btn primary" id="offlineBtn" style="margin-top:6px">Pobierz dane na wypadek braku internetu</button>
  <p id="offlineMsg" class="small" role="status" aria-live="polite" style="margin-top:8px">${last}</p></div>`;
}
async function runOffline(btn) {
  const msg = $("#offlineMsg"); if (!msg) return;
  btn.disabled = true; msg.style.color = "";
  try {
    try { await navigator.storage?.persist?.(); } catch { /* przeglądarka może odmówić – to nie błąd */ }
    let gps = null;
    if (state.consent.gps && navigator.geolocation) gps = await new Promise((res) => navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => res(null), { timeout: 8000, maximumAge: 600000 }));
    const vv = VOIVODESHIPS.find((v) => v.id === state.region);
    const centers = offlineCenters({ gps, places: state.places || [], shelters: state.shelters || [], regionCenter: vv ? { lat: vv.lat, lon: vv.lon } : null });
    if (!centers.length) { msg.textContent = "Najpierw wybierz województwo w Ustawieniach albo dodaj Ważne miejsce (dom, praca, rodzina)."; return; }
    const r = await downloadOffline({ centers, pspUrl: CONFIG.pspUrl, sheltersUrl: CONFIG.sheltersUrl, aedUrl: CONFIG.aedUrl, aedExtraUrl: CONFIG.aedRatujUrl, hospitalsUrl: CONFIG.hospitalsUrl, cache: makePspCache(CONFIG.pspUrl),
      onProgress: ({ done, total, label }) => { msg.textContent = `Pobieranie ${Math.min(done + 1, total)} z ${total}${label ? ": " + label : ""}…`; } });
    await Promise.allSettled([loadAlerts(), loadNews()]);
    if (r.failed && !r.points && !r.shelterDb && !r.aed && !r.hospitals) { msg.style.color = "var(--danger-ink)"; msg.textContent = "Nie udało się pobrać danych. Sprawdź połączenie i spróbuj ponownie."; return; }
    state.offline = { at: r.at, centers: r.centers, points: r.points, failed: r.failed, shelterDb: r.shelterDb, aed: r.aed, hospitals: r.hospitals }; save();
    msg.textContent = `${r.failed ? "Pobrano częściowo. " : "Gotowe. "}Zapisano ${offlineSummary(r)}`;
  } catch { msg.style.color = "var(--danger-ink)"; msg.textContent = "Nie udało się pobrać danych. Sprawdź połączenie i spróbuj ponownie."; }
  finally { btn.disabled = false; }
}

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
  return `<div class="shell"><main class="main" id="main" tabindex="-1">
  <div class="hero" style="padding-top:22px"><div class="brand">${LOGO}<span><span class="wordmark">EGIDA</span><span class="tagline">Twoje centrum bezpieczeństwa</span></span></div>
  <h1 style="margin-top:18px">Witaj w EGIDZIE</h1>
  <p>Darmowa, nieoficjalna aplikacja: ostrzeżenia dla Twojego województwa, pierwsza pomoc, plecak i plan na kryzys. Bez reklam, bez konta, bez sprzedaży danych.</p></div>
  <div class="card"><h2>Twoje wybory</h2><p class="muted small">Wszystko jest dobrowolne. Aplikacja działa także bez żadnej zgody.</p>
  <label class="switch"><input type="checkbox" id="cGps" ${c.gps ? "checked" : ""}><span><b>Lokalizacja (GPS)</b><span class="muted small">Po co: ustawimy województwo, żeby pokazywać tylko Twoje komunikaty. Gdzie trafia: pozycja zostaje w telefonie i nie jest nigdzie wysyłana. Zamiast tego możesz wybrać województwo ręcznie.</span></span></label>
  <label class="switch"><input type="checkbox" id="cNeptun" ${c.neptun ? "checked" : ""}><span><b>Obiekty znad Ukrainy na mapie <span class="badge unofficial">nieoficjalne · beta</span></b><span class="muted small">Po co: na mapie zobaczysz drony i rakiety w pobliżu granicy wg serwisu NEPTUN. Gdzie trafia: przeglądarka łączy się wtedy bezpośrednio z neptun.in.ua, który widzi Twój adres IP. To nieoficjalne dane, mogą być spóźnione lub błędne i nie zastępują syren ani Alertu RCB. Możesz wyłączyć tutaj i później w Ustawieniach.</span></span></label>
  <p class="muted small" style="margin-top:8px">Strona zlicza wyłącznie to, ile razy została otwarta: bez cookies, bez identyfikatorów i bez zapisywania adresu IP.</p></div>
  <div class="card"><div class="field"><label for="startRegion"><b>Województwo (ręcznie)</b></label>
  <select class="sel" id="startRegion"><option value="">Wybiorę później</option>${VOIVODESHIPS.map((v) => `<option value="${v.id}" ${state.region === v.id ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></div></div>
  ${legal()}
  <label class="switch" style="border:0"><input type="checkbox" id="cAck" ${c.ack ? "checked" : ""}><span><b>Rozumiem powyższe zasady</b></span></label>
  <div class="col" style="margin-top:6px"><button class="btn primary" id="goStart" ${c.ack ? "" : "disabled"}>Zaczynamy</button>
  <a class="btn112" style="justify-content:center;min-height:48px" href="tel:112">${I.phone}Zagrożenie życia? Zadzwoń 112</a></div><p class="muted small" style="text-align:center;margin:14px 0 24px">EGIDA ${APP_VERSION}</p></main></div>`;
}

/* Poziom komunikatów dla Pulpitu: alarm (czerwony) → ostrzeżenie (bursztyn) → spokojnie (zielony). Czerwień tylko dla realnego alarmu. */
const alertLevel = (list) => statusOf(list);
const sentence = (t) => { const x = String(t || "").replace(/\s+/g, " ").trim(); const m = /^(.{40,}?[.!?])(\s|$)/.exec(x); const r = m ? m[1] : x; return r.length > 150 ? r.slice(0, 147).trimEnd() + "…" : r; };
const hhmm = (ms) => new Date(ms).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
/* ---------- baner „Dostępna nowa wersja” ---------- */
let updateReady = false;
const updBar = () => updateReady ? `<div class="updbar" role="status">${C.refresh}<span class="ut">Dostępna nowa wersja aplikacji</span><button type="button" id="updNow">Odśwież</button></div>` : "";

/* ---------- jakość powietrza (GIOŚ) ---------- */
let airData = null, airAt = 0;
const AIR_CACHE = "egida.air.v1";
async function loadAir() {
  if (!CONFIG.airUrl) return;
  airAt = Date.now();
  try {
    const r = await fetch(`${CONFIG.airUrl}${CONFIG.airUrl.includes("?") ? "&" : "?"}t=${Math.floor(Date.now() / 600000)}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const a = normalizeAir(j, { maxAgeH: 6 });
    airData = a;
    if (a) { try { localStorage.setItem(AIR_CACHE, JSON.stringify(j)); } catch { /* */ } }
  } catch {
    try { airData = normalizeAir(JSON.parse(localStorage.getItem(AIR_CACHE) || "null"), { maxAgeH: 6 }) || airData; } catch { /* */ }
  }
}
function airCardHtml() {
  if (!airData) return "";
  const home = state.places.find((p) => p.label === "Dom");
  const reg = regionById(state.region);
  const pos = home ? { la: home.lat, lo: home.lon } : reg ? { la: reg.lat, lo: reg.lon } : null;
  if (!pos) return "";
  const st = nearestStation(airData, pos.la, pos.lo, home ? 40 : 80);
  if (!st) return "";
  const km = st.km < 1 ? "poniżej 1" : `ok. ${Math.round(st.km)}`;
  const where = home ? `${km} km od Twojego domu` : `${km} km od środka województwa. Dodaj „Dom” w Ważnych miejscach, by wynik był dokładniejszy`;
  return `<div class="aircard"><span class="aq">${C.air}</span><div><h2>Jakość powietrza</h2><span class="lvl ${AIR_TONE[st.i]}">${AIR_NAMES[st.i]}</span><p>${AIR_ADVICE[st.i]}</p><p class="muted small">Stacja: ${esc(st.n)} (${where}). Dane: GIOŚ, ${esc(hhmm(Date.parse(airData.updated)))}.</p></div></div>`;
}

/* ---------- przypomnienie o terminach w Mojej apteczce ---------- */
const plDate = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };
function kitWhen(x) {
  const d = x.days ?? kitDays(x.expires);
  if (d == null) return "";
  if (d < -1) return `po terminie od ${-d} dni`;
  if (d === -1) return "termin minął wczoraj";
  if (d === 0) return "termin mija dziś";
  if (d === 1) return "termin mija jutro";
  return `termin za ${d} dni`;
}
function kitDueHtml() {
  const due = kitDue(state.myKit);
  if (!due.length) return "";
  const red = due.some((x) => x.st === "expired");
  const lis = due.slice(0, 4).map((x) => `<li><b>${esc(x.name)}</b>: ${esc(kitWhen(x))} (${esc(plDate(x.expires))})</li>`).join("");
  return `<div class="kitdue ${red ? "red" : ""}"><h2>${red ? C.danger : C.warn}Sprawdź apteczkę</h2><ul>${lis}</ul>${due.length > 4 ? `<p class="small">i jeszcze ${due.length - 4}</p>` : ""}<a class="gall" href="#/moja-apteczka">Otwórz Moją apteczkę ${I.chevr}</a></div>`;
}
/* Czerwony kafelek na górze Pulpitu i Poradnika: od razu widać, gdzie szukać pomocy przy krwotoku i zatrzymaniu krążenia */
const aidHero = () => `<section class="aidhero" aria-label="Pierwsza pomoc"><a class="aidmain" href="#/pierwsza-pomoc"><span class="aidic">${C.heart}</span><span><b>Pierwsza pomoc</b><span class="aidsub">Krwotok, RKO, zadławienie. Działa bez internetu</span></span>${I.chevr}</a>
  <div class="aidq"><a href="#/pierwsza-pomoc/krwotok">${C.drop}Krwotok</a><a href="#/pierwsza-pomoc/rko">${C.heart}RKO</a></div></section>`;

const DOT = { rcb: "#B3261E", pogoda: "#B45309", drogi: "#2A4DA0", woda: "#0B6B63" };
function nearestMinutes() { try { const j = JSON.parse(sessionStorage.getItem("egida.nearest") || "null"); return j && Date.now() - j.t < 600000 && Number.isFinite(j.min) ? j.min : null; } catch { return null; } }
function ring(pct) {
  const R = 30, C = 2 * Math.PI * R;
  return `<svg class="ring" viewBox="0 0 72 72" width="72" height="72" role="img" aria-label="Gotowość: ${pct}%"><circle cx="36" cy="36" r="${R}" fill="none" stroke="var(--line-in)" stroke-width="8"/><circle cx="36" cy="36" r="${R}" fill="none" stroke="var(--brand)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(C * pct / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 36 36)"/><text x="36" y="41" text-anchor="middle" font-family="var(--font-h)" font-weight="800" font-size="17" fill="var(--text)">${pct}%</text></svg>`;
}
const TYPE_LBL = { pogoda: "Pogoda", rcb: "Alert RCB", woda: "Woda", drogi: "Drogi" };
const genericTitle = (a) => /^(alert rcb|komunikat)\b/i.test(String(a.title || "").trim()) && String(a.title).trim().length <= 12;
/* Jeden komunikat jako czytelny wiersz: etykieta + czas, nagłówek, tekst. Krótkie komunikaty w całości;
   dłuższe cięte tylko na granicy zdania, a reszta rozwija się w miejscu (bez przechodzenia na inny ekran). */
function msgParts(a, count = 1, tri = false) {
  const c = compose(a);
  return `<span class="lbl">${tri && a.type === "drogi" ? `<span class="tri">${I.alert}</span>` : ""}${esc(TYPE_LBL[a.type] || "Komunikat")} · ${esc(fmtDate(a.published))}${count > 1 ? ` · ${count} ${plural(count)}` : ""}</span><b class="shead">${esc(c.head)}</b>${c.text ? `<span class="ssub">${esc(c.text)}</span>` : ""}${c.rest ? `<details class="more"><summary>Czytaj dalej</summary><p>${esc(c.rest)}</p></details>` : ""}`;
}
function screenPulpit() {
  const r = readiness();
  const fresh = alertsFresh();
  const list = regionAlerts();
  const name = esc(regionById(state.region)?.name);
  let status, roadsShown = false;
  if (!state.region) {
    status = `<div class="status warn"><span class="ico">${I.pin}</span><div><h2>Wybierz województwo</h2><p>Pokażemy komunikaty dla Twojej okolicy. Użyj listy u góry ekranu.</p></div></div>`;
  } else if (!alertsData.loaded) {
    status = `<div class="status warn"><span class="ico">${I.bell}</span><div><h2>Sprawdzam komunikaty…</h2></div></div>`;
  } else if (!fresh) {
    status = `<div class="status warn"><span class="ico">${I.alert}</span><div><h2>Brak aktualnych danych</h2><p>Nie udało się pobrać świeżych komunikatów. To nie znaczy, że jest bezpiecznie. Słuchaj syren, sprawdź Alerty RCB w telefonie i oficjalne komunikaty.</p></div></div>`;
  } else {
    const lvl = alertLevel(list);
    const when = alertsData.live && alertsData.checkedAt ? `Sprawdzono dziś o ${hhmm(alertsData.checkedAt)}.` : `Dane z ${esc(fmtDate(alertsData.updated))}.`;
    const chips = [...new Set(list.map((a) => String(a.source || "RSO").replace(/\s*\(.*\)/, "")).concat(["RSO"]))].slice(0, 4).map((c) => `<span class="srcchip">${esc(c)}</span>`).join("");
    const danger = list.filter((a) => a.sev === "danger"), important = list.filter((a) => a.sev === "important");
    const shown = (a) => !(a.relatedTo && list.some((x) => x.id === a.relatedTo)); // to samo wydarzenie pokazujemy raz
    const info = list.filter((a) => a.sev === "info" && !a.cancel && shown(a));
    const meta = `Dla: ${name} · Źródło: RSO · ${when}`;
    const rows = (arr, n) => `<ul class="slist">${arr.slice(0, n).map((a) => `<li>${msgParts(a)}</li>`).join("")}</ul>${arr.length > n ? `<p class="smore">i jeszcze ${arr.length - n}</p>` : ""}`;
    if (lvl === "alarm") {
      const air = danger[0].kind === "atak";
      status = `<div class="status alert"><span class="ico">${I.alert}</span><div class="sbody"><h2>${air ? "Zagrożenie z powietrza" : danger.length > 1 ? `Zagrożenia (${danger.length})` : "Zagrożenie"}</h2>${rows(danger, 2)}${air ? '<p class="slead">Obowiązuje do odwołania komunikatem o zakończeniu ataku.</p>' : ""}<p class="smeta">${meta}</p><a class="slink" href="#/alerty">Zobacz szczegóły ${I.chevr}</a> <a class="slink" style="margin-left:14px" href="#/zagrozenie">Tryb zagrożenia ${I.chevr}</a></div></div>`;
    } else if (lvl === "warn") {
      status = `<div class="status warn"><span class="ico">${I.alert}</span><div class="sbody"><h2>${important.length === 1 ? "Ostrzeżenie" : `Ostrzeżenia (${important.length})`}</h2>${rows(important, 2)}<p class="smeta">Śledź rozwój sytuacji. ${meta}</p><a class="slink" href="#/alerty">Zobacz szczegóły ${I.chevr}</a></div></div>`;
    } else {
      status = `<div class="status ok"><span class="ico">${I.check}</span><div class="sbody"><h2>W Twojej okolicy jest spokojnie</h2><p class="slead">Brak aktywnych ostrzeżeń w znanych nam źródłach.</p><p class="smeta">${meta}</p><p class="sfine">Aplikacja nie zastępuje syren ani Alertu RCB.</p></div></div>`;
    }
    const roads = roadRows();
    if (info.length || roads.length) {
      const gs = groupAlerts(info);
      const alertLis = gs.slice(0, 3).map((g) => `<li>${msgParts(g.items[0], g.items.length, true)}</li>`).join("");
      const alertLink = info.length ? (gs.length > 3 || info.length > gs.length ? `<a class="gall" href="#/alerty">Zobacz wszystkie (${info.length}) ${I.chevr}</a>` : `<a class="gall" href="#/alerty">Wszystkie komunikaty ${I.chevr}</a>`) : "";
      status += `<div class="goodtoknow"><h2><span class="tri">${I.alert}</span>Dobrze wiedzieć</h2><ul class="slist">${alertLis}${roads.slice(0, 3).map(roadLi).join("")}</ul>${alertLink}${roads.length ? roadMore(roads.length) : ""}</div>`;
      roadsShown = true;
    }
  }
  if (!roadsShown) { // statusu z komunikatów nie ma (np. dane nieaktualne), ale utrudnienia drogowe mamy
    const roads = roadRows();
    if (roads.length) status += `<div class="goodtoknow"><h2><span class="tri">${I.alert}</span>Dobrze wiedzieć</h2><ul class="slist">${roads.slice(0, 3).map(roadLi).join("")}</ul>${roadMore(roads.length)}</div>`;
  }
  const nm = nearestMinutes();
  const tile = (h, cls, i, t, sub, soon) => `<a class="tile ${soon ? "soon" : ""}" href="${h}"><span class="ti ${cls}">${i}</span><b>${t}</b><span class="muted small">${sub}</span>${soon ? '<span class="badge soon" style="align-self:flex-start">wkrótce</span>' : ""}</a>`;
  const nPack = plecakDone(), tPack = PLECAK.start.length;
  const steps = r.steps.map((st, i) => {
    const label = i === 1 ? `${st.t.replace("Przygotuj", "Spakuj")} <span class="muted small">· ${nPack} z ${tPack}</span>` : esc(st.t);
    return st.done ? `<li><a href="${st.h}"><span class="muted">${i === 1 ? label : esc(st.t)}</span><span class="stp">✓</span></a></li>` : `<li><a href="${st.h}"><span>${label}</span>${I.chevr}</a></li>`;
  }).join("");
  if (state.senior) {
    return `<div class="hero"><h1>Pulpit</h1></div>${status}${kitDueHtml()}
  <a class="sen112" href="tel:112">${I.phone}Zadzwoń 112</a>
  <div class="sengrid">
  <a class="tile" href="#/pierwsza-pomoc"><span class="ti t-red">${C.heart}</span><b>Pierwsza pomoc</b></a>
  <a class="tile" href="#/schrony"><span class="ti t-green">${C.shield}</span><b>Pomoc w pobliżu${nm != null ? `<br><span class="muted small">Schron: ${nm} min pieszo</span>` : ""}</b></a>
  <a class="tile" href="#/plan-rodziny"><span class="ti t-amber">${C.users}</span><b>Plan rodziny i karty ICE</b></a>
  <a class="tile" href="#/moja-apteczka"><span class="ti t-green">${C.list}</span><b>Moja apteczka</b></a>
  <a class="tile" href="#/bez-pradu"><span class="ti t-amber">${C.bolt}</span><b>Bez prądu</b></a>
  </div>${airCardHtml()}${installHint()}`;
  }
  return `<div class="hero"><h1>Pulpit</h1></div>${status}${aidHero()}${kitDueHtml()}${airCardHtml()}${newsCardHtml()}
  <div class="card ready"><div class="row" style="gap:16px">${ring(r.pct)}<div style="flex:1"><h2 style="margin:0">Twoja gotowość</h2><p class="muted small" style="margin:2px 0 0">Trzy małe kroki, żeby poczuć się pewniej.</p></div></div>
  <ul class="steps stepsnav">${steps}</ul></div>
  <div class="grid2 grid-d grid4">${tile("#/schrony", "t-green", C.shield, "Pomoc w pobliżu", nm != null ? `Schron: ${nm} min pieszo · AED · szpitale` : "Schrony, AED, szpitale")}${tile("#/plecak", "t-blue", C.bag, "Plecak i zapasy", "Zestaw na 72 godziny")}${tile("#/plan-rodziny", "t-amber", C.users, "Plan rodziny", "Kontakty i miejsce spotkania")}${tile("#/moja-apteczka", "t-green", C.list, "Moja apteczka", "Leki i terminy ważności")}</div>
  <div class="grid2 grid-d" style="margin-top:12px">${tile("#/bez-pradu", "t-amber", C.bolt, "Bez prądu", "Plan na 72 godziny")}${tile("#/hybrydowe", "t-purple", C.hybrid, "Zagrożenia hybrydowe", "Dezinformacja i oszustwa")}</div>
  <div class="grid2 grid-d" style="margin-top:12px"><a class="tile" style="flex-direction:row;align-items:center" href="#/poradnik"><span class="ti t-blue">${C.book}</span><b>Poradnik: co robić, gdy…</b></a><a class="tile" style="flex-direction:row;align-items:center" href="#/telegram"><span class="ti t-blue">${C.tg}</span><b>Powiadomienia Telegram dla Twojego województwa</b></a></div>
  ${installHint()}
`;
}

/* Pilne na górze (alarm/RCB → pogoda → drogi → reszta), w obrębie grupy najnowsze pierwsze. Takie same tytuły zwijamy w jedną pozycję. */
const PRIO = { rcb: 0, pogoda: 1, drogi: 2, woda: 3 };
const prioOf = (a) => (a.sev === "danger" ? 0 : a.sev === "important" ? 1 : 2 + (PRIO[a.type] ?? 4));
const plural = (n) => (n === 1 ? "komunikat" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "komunikaty" : "komunikatów");
function groupAlerts(list) {
  const map = new Map();
  for (const a of list) {
    const k = `${a.type}|${String(a.title).trim().toLowerCase()}|${genericTitle(a) ? summarize(a.body, 60) : ""}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(a);
  }
  // Ten sam komunikat podany innymi słowami (np. „Ćwiczenie Syrena” i „Ćwiczenia Syrena-26”) łączymy w jedną pozycję: w tym samym województwie, w ciągu 10 dni.
  const merged = [];
  for (const items of [...map.values()].sort((x, y) => Math.max(...y.map((i) => Date.parse(i.published) || 0)) - Math.max(...x.map((i) => Date.parse(i.published) || 0)))) {
    const txt = `${items[0].title} ${items[0].body || ""}`, tk = storyTokens(txt);
    const into = merged.find((m) => m.vw === items[0].voivodeship && Math.abs((Date.parse(m.items[0].published) || 0) - (Date.parse(items[0].published) || 0)) <= 10 * 864e5 && sameStory(m.tk, tk, { share: 0.5, minTokens: 5 }));
    if (into) into.items.push(...items); else merged.push({ items: [...items], vw: items[0].voivodeship, tk });
  }
  const groups = merged.map(({ items }) => {
    items.sort((x, y) => (y.published || "").localeCompare(x.published || ""));
    return { items, prio: Math.min(...items.map(prioOf)), date: items[0].published || "" };
  });
  return groups.sort((x, y) => x.prio - y.prio || y.date.localeCompare(x.date));
}
function groupItem(g) {
  if (g.items.length === 1) return msgItem(g.items[0]);
  const a = g.items[0];
  const type = { pogoda: "Pogoda", rcb: "Alert RCB", woda: "Woda", drogi: "Drogi" }[a.type] || "Komunikat";
  const inner = g.items.map((x) => `<li style="margin:8px 0">${x.body ? esc(x.body) : esc(x.title)}<div class="muted small">${esc(fmtDate(x.published))}</div>${shareBtn(x.id)}</li>`).join("");
  return `<li class="msg"><details><summary style="cursor:pointer"><div class="meta"><span class="badge ${g.prio === 0 ? "danger" : g.prio === 1 ? "unofficial" : "info"}">${esc(type)}</span><span>${esc(g.items.length)} ${plural(g.items.length)}</span></div>
  <h3 style="display:inline">${esc(a.title)}</h3> <span class="muted small">(pokaż szczegóły)</span></summary><ul style="padding-left:18px;margin:8px 0">${inner}</ul>
  ${relHtml(g.items.map((x) => x.id))}<p class="src" style="margin:6px 0 0">Źródło: ${esc(a.source || "RSO")}</p></details></li>`;
}

function msgItem(a) {
  const type = { pogoda: "Pogoda", rcb: "Alert RCB", woda: "Woda", drogi: "Drogi" }[a.type] || "Komunikat";
  const url = safeUrl(a.url);
  return `<li class="msg"><div class="meta">${a.type === "drogi" ? `<span class="tri">${I.alert}</span>` : ""}<span class="badge ${a.sev === "danger" ? "danger" : a.sev === "important" ? "unofficial" : "info"}">${esc(type)}</span>${a.cancel ? '<span class="badge ok">Odwołanie</span>' : ""}${a.sev === "danger" ? '<span class="badge danger">Zagrożenie</span>' : ""}${a.supersededBy ? '<span class="badge info">Odwołano</span>' : ""}<span>${esc(fmtDate(a.published))}</span></div>
  <h3>${esc(a.title)}</h3>${a.body ? `<p class="muted">${esc(a.body)}</p>` : ""}${relHtml([a.id])}
  <p class="src" style="margin:6px 0 0">Źródło: ${esc(a.source || "RSO")}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Oryginał</a>` : ""}</p>${shareBtn(a.id)}</li>`;
}
let alertFilter = "all", alertWhen = "active", alertQuery = "", relMap = new Map();
const relHtml = (ids) => ids.flatMap((id) => relMap.get(id) || []).map((r) => `<div class="related"><span class="lbl">Powiązany komunikat · ${esc(TYPE_LBL[r.type] || "Komunikat")} · ${esc(fmtDate(r.published))}</span><b>${esc(r.title)}</b>${r.body ? `<div class="muted small">${esc(summarize(r.body, 160))}</div>` : ""}</div>`).join("");
const normQ = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
/** Wyszukiwanie: wszystkie wpisane słowa muszą wystąpić w tytule lub treści (bez względu na polskie znaki i wielkość liter). */
const queryMatch = (a, q) => { const toks = normQ(q).split(/\s+/).filter(Boolean); if (!toks.length) return true; const hay = normQ(`${a.title} ${a.body} ${TYPE_LBL[a.type] || ""}`); return toks.every((t) => hay.includes(t)); };
const shareBtn = (id) => `<button class="linkbtn" data-share="${esc(id)}" aria-label="Udostępnij ten komunikat">${I.send}<span>Udostępnij</span></button>`;
const borderNote = () => {
  const n = state.regionNear;
  if ((state.regionSource !== "gps" && state.regionSource !== "gps-edge") || !n) return "";
  const nb = regionById(n.id)?.name;
  return `<div class="note neutral" style="margin:0 0 10px">${n.edge ? "Twoja pozycja jest tuż przy granicy województwa (lub wybrzeża)." : `Twoja pozycja jest ok. ${esc(String(n.km))} km od granicy z województwem ${esc(nb || "sąsiednim")}.`} Komunikaty sąsiedniego województwa mogą dotyczyć też Twojej okolicy. Granice w aplikacji są uproszczone, więc sprawdź także tamte komunikaty.</div>`;
};
function alertListHtml() {
  const all = regionAll();
  const base = all.filter((a) => (alertWhen === "active" ? a.active : !a.active) && (alertFilter === "all" || a.type === alertFilter) && queryMatch(a, alertQuery));
  // To samo wydarzenie (np. alert RCB i komunikat o wodzie z tymi samymi miejscowościami) pokazujemy raz; powiązany wpis jest pod głównym.
  relMap = new Map();
  const list = base.filter((a) => { if (a.relatedTo && base.some((x) => x.id === a.relatedTo)) { relMap.set(a.relatedTo, [...(relMap.get(a.relatedTo) || []), a]); return false; } return true; });
  if (!state.region) return `<div class="note warn">Wybierz województwo na górze ekranu, aby zobaczyć komunikaty.</div>`;
  if (!alertsData.ok) return `<div class="note warn">Nie udało się pobrać komunikatów. Sprawdź połączenie lub oficjalne źródła: <a href="https://komunikaty.tvp.pl" target="_blank" rel="noopener noreferrer">komunikaty.tvp.pl</a>.</div>`;
  if (!list.length) return `<div class="note neutral">${alertQuery.trim() ? `Nic nie znaleziono dla „${esc(alertQuery.trim())}” w tej zakładce i kategorii.` : `${alertWhen === "active" ? "Brak aktywnych komunikatów" : "Brak wcześniejszych komunikatów"} tej kategorii dla województwa: ${esc(regionById(state.region)?.name)}.`}</div>`;
  return `${alertQuery.trim() ? `<p class="muted small" style="margin:0 0 6px" role="status">Znaleziono: ${base.length}</p>` : ""}<div class="card flat"><ul class="list">${groupAlerts(list).map(groupItem).join("")}</ul></div>`;
}
function screenAlerty() {
  const all = regionAll();
  const nAct = all.filter((a) => a.active).length;
  const chips = ALERT_FILTERS.map((f) => `<button class="chip" data-filter="${f.id}" aria-pressed="${alertFilter === f.id}">${f.label}</button>`).join("");
  const stale = alertsData.ok && !alertsFresh() ? `<div class="banner-offline">Dane mogą być nieaktualne (ostatnia aktualizacja: ${esc(fmtDate(alertsData.updated) || "brak")}).</div>` : "";
  return `<div class="hero"><h1>Alerty</h1><p>Oficjalne komunikaty (RSO: Alert RCB, IMGW, woda, drogi) dla Twojego województwa.</p></div>
  <a class="tile" style="flex-direction:row;align-items:center;margin-bottom:12px" href="#/telegram"><span class="ti">${I.send}</span><b>Chcesz dostawać ważne komunikaty na telefon? Powiadomienia Telegram</b></a>
  ${borderNote()}
  <div class="seg" role="group" aria-label="Aktywne lub wcześniejsze"><button class="chip" data-when="active" aria-pressed="${alertWhen === "active"}">Aktywne (${nAct})</button><button class="chip" data-when="past" aria-pressed="${alertWhen === "past"}">Wcześniejsze (${all.length - nAct})</button></div>
  <div class="field" style="margin:0 0 8px"><label class="sr" for="alertQ">Szukaj w komunikatach</label><input class="sel" id="alertQ" type="search" placeholder="Szukaj: miejscowość, ulica, słowo" value="${esc(alertQuery)}" autocomplete="off" enterkeyhint="search"></div>
  <div class="chips" role="group" aria-label="Filtry">${chips}</div>${stale}${alertWhen === "past" ? '<p class="muted small">Komunikaty, które wygasły albo zostały odwołane. Nie wpływają na kolor karty na Pulpicie.</p>' : ""}<div id="alertList">${alertListHtml()}</div>`;
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
  <div class="note warn" style="margin-top:10px"><span class="badge soon">Beta</span> <b>Obiekty latające w pobliżu granicy.</b> Alert RCB dostajesz SMS-em, ale nie podaje on szczegółów. Na <a href="#/mapa">mapie</a> jest już wersja testowa nieoficjalnych informacji o dronach i rakietach przy granicy: <b>pozycja, kurs i przewidywany tor</b>. Są oznaczone jako <b>nieoficjalne</b>, pochodzą z zewnętrznego serwisu (NEPTUN) i mogą być spóźnione lub błędne. Na kanały Telegram trafia ostrzeżenie tylko wtedy, gdy obiekt jest bliżej niż 100 km od granicy i leci w jej stronę. Dalsze obiekty są tylko widoczne na mapie.</div></div>
  <div class="card"><h2>Jak dołączyć</h2>
  <ol class="how"><li>Zainstaluj aplikację <b>Telegram</b> (jeśli jej nie masz) i załóż konto. Wystarczy numer telefonu.</li>
  <li>Poniżej dotknij nazwy swojego województwa. Telegram otworzy kanał.</li>
  <li>Dotknij <b>Dołącz</b> (albo „Subskrybuj”). Kanały są prywatne, więc dołączasz tylko przez ten odsyłacz.</li>
  <li>Na górze kanału dotknij dzwonka, żeby włączyć powiadomienia.</li></ol>
  <p class="muted small">Powiadomienia Telegrama mogą nie przebić trybu „Nie przeszkadzać” i nie zastępują syren ani Alertu RCB. Przy zagrożeniu życia dzwoń <b>112</b>.</p></div>
  <div class="card flat"><h2 style="padding:16px 16px 4px">Wybierz województwo</h2><ul class="list tglist">${rows}</ul></div>`;
}

function screenMapa(arg) { return renderMapHtml(geoCtx, { demo: arg === "demo", diag: arg === "diag" }); }
function screenSoon(t, d) {
  return `<div class="hero"><h1>${t}</h1></div><div class="card"><span class="badge soon">Wkrótce</span><p>${d}</p><a class="btn" href="#/pulpit">Wróć na pulpit</a></div>`;
}

function groupBy(arr, fn) {
  const out = [];
  for (const x of arr) { const g = x.g || ""; let e = out.find((o) => o.g === g); if (!e) out.push((e = { g, list: [] })); e.list.push(fn(x)); }
  return out;
}
function screenPoradnik() {
  const row = (x) => `<a class="check" style="text-decoration:none;color:inherit;cursor:pointer" href="#/co-robic/${x.id}"><span><b>${esc(x.t)}</b><br><span class="muted small">${esc(x.d)}</span></span></a>`;
  const items = groupBy(WHAT_TO_DO.items, row).map((o) => `<h3 class="grp">${esc(o.g)}</h3><div class="card flat">${o.list.join("")}</div>`).join("");
  const wide = (h, cls, i, t, mt = 12) => `<a class="tile" style="flex-direction:row;align-items:center;margin-top:${mt}px" href="${h}"><span class="ti ${cls}">${i}</span><b>${t}</b></a>`;
  return `<div class="hero"><h1>Poradnik</h1><p>Krótkie instrukcje, które działają także bez internetu.</p></div>
  ${aidHero()}
  ${wide("#/zagrozenie", "t-red", C.danger, "Tryb zagrożenia: 112, schron, 3 kroki", 0)}
  ${wide("#/bez-pradu", "t-amber", C.bolt, "Bez prądu: plan na pierwsze 72 godziny")}
  ${wide("#/hybrydowe", "t-purple", C.hybrid, "Zagrożenia hybrydowe: dezinformacja i oszustwa")}
  ${wide("#/apteczka", "t-red", C.kit, "Apteczka: co mieć i do czego służy")}
  ${wide("#/moja-apteczka", "t-green", C.list, "Moja apteczka: leki i terminy ważności")}
  <h2 style="margin-top:20px">Co robić, gdy…</h2>${items}
  ${wide("#/test", "t-amber", C.test, "Test gotowości (2 minuty)")}
  <button class="btn" id="printGuide" style="margin-top:12px">Drukuj instrukcje (pierwsza pomoc i „Co robić”)</button>`;
}
/* Przewodniki z zakładkami (Apteczka, Bez prądu, Zagrożenia hybrydowe): wspólny wygląd, treść w js/content.js. */
const guideTabs = { apteczka: "dom", bezpradu: "start", hybrydowe: "co" };
const aptLine = (s) => {
  const n = /^(\d{1,2})\. (.+)$/.exec(s); if (n) return `<b>${n[1]}.</b> ${esc(n[2])}`;
  const m = /^([^:]{3,60}): (.+)$/.exec(s); return m ? `<b>${esc(m[1])}:</b> ${esc(m[2])}` : esc(s);
};
const aptLi = (x) => `<li${/^\d{1,2}\. /.test(x) ? ' class="n"' : ""}>${aptLine(x)}</li>`;
function guideBody(key, data) {
  const tab = data.tabs.find((x) => x.id === guideTabs[key]) || data.tabs[0];
  const chips = data.tabs.map((x) => `<button class="chip" data-gtab="${key}:${x.id}" aria-pressed="${x.id === tab.id}">${esc(x.t)}</button>`).join("");
  const link = (l) => `<a class="gall" href="${esc(l.h)}">${esc(l.t)} ${I.chevr}</a>`;
  const blocks = tab.blocks.map((b) => `<h3 class="grp">${esc(b.h)}</h3><div class="card flat apt">${b.p ? `<p>${esc(b.p)}</p>` : ""}${b.items ? `<ul class="aptlist">${b.items.map(aptLi).join("")}</ul>` : ""}${b.note ? `<div class="note ${b.note.k === "warn" ? "warn" : "neutral"}">${esc(b.note.t)}</div>` : ""}${b.link ? link(b.link) : ""}</div>`).join("");
  return `<div class="chips" role="group" aria-label="Rozdziały">${chips}</div>${blocks}${tab.link ? `<div class="card flat apt">${link(tab.link)}</div>` : ""}`;
}
function screenApteczka() {
  return `${back("#/poradnik", "Poradnik")}<div class="hero"><div class="guidehead"><span class="gi" style="background:#FDE8E6">${C.kit}</span><h1>Apteczka</h1></div><p>${esc(APTECZKA.intro)}</p></div>
  <a class="tile" style="flex-direction:row;align-items:center;margin:8px 0" href="#/moja-apteczka"><span class="ti t-green">${C.list}</span><b>Moja apteczka: wpisz swoje leki i terminy ważności</b></a>
  ${guideBody("apteczka", APTECZKA)}
  <p class="muted small">Opracowanie własne EGIDA na podstawie wytycznych PRC/ERC. Ostatni przegląd: ${esc(APTECZKA.reviewed)}. Przy zagrożeniu życia dzwoń pod 112.</p>`;
}
function screenGuide(key, data, title, icon, purple) {
  const extra = key === "bezpradu" ? `<div class="grid2" style="margin-top:12px"><a class="btn" href="tel:991">${I.phone}991 – awarie prądu</a><a class="btn112" style="justify-content:center;min-height:52px" href="tel:112">${I.phone}Zadzwoń 112</a></div>` : "";
  return `${back("#/poradnik", "Poradnik")}<div class="hero"><div class="guidehead"><span class="gi ${purple ? "purple" : ""}">${icon}</span><h1>${esc(title)}</h1></div><p>${esc(data.intro)}</p></div>
  ${guideBody(key, data)}${extra}${reviewLine(data)}`;
}
/* Moja apteczka: własna lista leków i środków z terminami ważności (tylko w urządzeniu, bez powiadomień push – przypomnienie na Pulpicie) */
const KIT_QUICK = ["Plastry", "Gaza jałowa", "Bandaż elastyczny", "Środek odkażający", "Paracetamol", "Ibuprofen", "Węgiel aktywny", "Opatrunek hemostatyczny"];
let kitFill = "";
function screenMojaApteczka() {
  const list = kitSorted(state.myKit);
  const rows = list.map((x) => {
    const st = kitStatus(x), lbl = { expired: "Po terminie", soon: "Kończy się termin", ok: "Ważne", none: "Bez terminu" }[st];
    const d = kitDays(x.expires);
    return `<div class="kitrow"><div class="kmain"><span class="kst ${st}">${lbl}</span><b>${esc(x.name)}</b><span class="kmeta">${x.expires ? `${esc(plDate(x.expires))} · ${esc(kitWhen({ days: d }))}` : "Nie wpisano terminu"}${x.note ? ` · ${esc(x.note)}` : ""}</span></div><button type="button" class="kdel" data-kitdel="${esc(x.id)}" aria-label="Usuń ${esc(x.name)}">Usuń</button></div>`;
  }).join("");
  const quick = KIT_QUICK.map((q) => `<button type="button" class="chip" data-kitfill="${esc(q)}">${esc(q)}</button>`).join("");
  const full = state.myKit.length >= KIT_LIMIT;
  return `${back("#/poradnik", "Poradnik")}<div class="hero"><div class="guidehead"><span class="gi" style="background:#E1F2EC">${C.list}</span><h1>Moja apteczka</h1></div><p>Wpisz leki i opatrunki, które masz w domu, razem z datą ważności. Gdy termin się zbliża, zobaczysz przypomnienie na Pulpicie. To nie jest powiadomienie push, więc zajrzyj do aplikacji od czasu do czasu.</p></div>
  ${kitDueHtml()}
  <div class="card"><h2>Dodaj pozycję</h2>
  <div class="chips" role="group" aria-label="Szybkie podpowiedzi">${quick}</div>
  <form id="kitForm" class="kitform" autocomplete="off">
  <div><label for="kitName">Nazwa</label><input type="text" id="kitName" maxlength="60" required placeholder="np. Paracetamol 500 mg" value="${esc(kitFill)}"></div>
  <div><label for="kitDate">Termin ważności (z opakowania)</label><input type="date" id="kitDate"></div>
  <div><label for="kitNote">Notatka (niepotrzebne)</label><input type="text" id="kitNote" maxlength="120" placeholder="np. szuflada w kuchni"></div>
  <button class="btn primary" type="submit" ${full ? "disabled" : ""}>Dodaj do apteczki</button>${full ? `<p class="small">Osiągnięto limit ${KIT_LIMIT} pozycji.</p>` : ""}</form></div>
  <h3 class="grp">Twoja lista (${list.length})</h3>
  ${list.length ? `<div class="card flat">${rows}</div>` : `<div class="card"><p class="muted">Lista jest pusta. Dodaj pierwszą pozycję powyżej.</p></div>`}
  <a class="tile" style="flex-direction:row;align-items:center;margin-top:12px" href="#/apteczka"><span class="ti t-red">${C.kit}</span><b>Co powinno być w apteczce</b></a>
  <p class="muted small">Dane zostają tylko w tym urządzeniu. Zapiszesz je w kopii danych (Ustawienia → Twoje dane). To nie jest porada medyczna: lek po terminie wyrzuć lub oddaj do apteki.</p>`;
}
function screenCoRobic(id) {
  const x = WHAT_TO_DO.items.find((i) => i.id === id);
  if (!x) return screenPoradnik();
  return `${back("#/poradnik", "Poradnik")}<div class="hero"><h1>${esc(x.t)}</h1><p>${esc(x.d)}</p></div>
  <div class="card"><ol style="padding-left:1.3rem;margin:0">${x.steps.map((s) => `<li style="margin:.6rem 0">${esc(s)}</li>`).join("")}</ol>${reviewLine(WHAT_TO_DO)}</div>
  <a class="btn112" style="justify-content:center;min-height:52px;width:100%" href="tel:112">${I.phone}Zagrożenie życia? Zadzwoń 112</a>`;
}

let metro = null;
function stopMetro() {
  if (metro) { clearTimeout(metro.t); metro.stopped = true; try { metro.ctx?.close(); } catch { /* */ } metro = null; }
  $("#pulse")?.classList.remove("on"); const ph = $("#phase"); if (ph) ph.textContent = "";
}
/* Krótki sygnał jako plik WAV zbudowany w pamięci. Odtwarzany jak zwykłe audio, więc działa też na iPhonie z włączonym trybem cichym (Web Audio jest tam wyciszane). */
let beepUrl = null;
function beepSrc() {
  if (beepUrl) return beepUrl;
  const rate = 22050, n = Math.round(rate * 0.07), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const env = Math.min(1, i / 120, (n - i) / 300); v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 880 * i) / rate) * 0.6 * env * 32767), true); }
  beepUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return beepUrl;
}
function startMetro() {
  stopMetro();
  const bpm = FIRST_AID.rko.bpm, period = 60000 / bpm;
  let ctx = null, pool = [], pi = 0, useAudioEl = true;
  try { pool = [new Audio(beepSrc()), new Audio(beepSrc())]; pool.forEach((a) => { a.preload = "auto"; a.volume = 1; }); } catch { useAudioEl = false; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume?.(); } catch { /* brak audio */ }
  const pulse = $("#pulse"), phase = $("#phase");
  const beep = () => {
    if (useAudioEl) {
      const a = pool[pi++ % pool.length]; try { a.currentTime = 0; const pr = a.play(); if (pr && pr.catch) pr.catch(() => { useAudioEl = false; }); return; } catch { useAudioEl = false; }
    }
    if (ctx) { try { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.3; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.07); } catch { /* */ } }
  };
  const m = { stopped: false, t: null, ctx };
  const t0 = performance.now(); let k = 0;
  const tick = () => {
    if (m.stopped) return;
    pulse?.classList.add("on"); if (phase) phase.textContent = "UCISKAJ";
    beep(); if (navigator.vibrate) navigator.vibrate(30);
    setTimeout(() => { if (!m.stopped) { pulse?.classList.remove("on"); if (phase) phase.textContent = "PUŚĆ CAŁKOWICIE"; } }, period / 2); // dioda świeci przy ucisku i gaśnie przy puszczaniu
    k++; m.t = setTimeout(tick, Math.max(0, t0 + k * period - performance.now())); // bez narastającego opóźnienia
  };
  metro = m; tick();
}
function screenPierwszaPomoc(openId) {
  const R = FIRST_AID.rko;
  const steps = R.steps.map((s, i) => `<li style="display:flex;gap:12px;margin:.8rem 0"><span class="dot done" style="flex:none">${i + 1}</span><span><b>${esc(s.t)}</b><br>${esc(s.d)}</span></li>`).join("");
  const AIC = { krwotok: C.drop, opaska: C.drop, "rana-klatki": C.drop, "rko-dziecko": C.heart, zawal: C.heart };
  const acc = (o) => `<details class="acc${o.id === openId ? " hl" : ""}" id="fa-${esc(o.id)}" ${o.id === openId ? "open" : ""}><summary><span class="accl">${AIC[o.id] || ""}${esc(o.t)}</span><span class="muted">${I.chev}</span></summary><div class="body"><ol>${o.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div></details>`;
  const others = groupBy(FIRST_AID.others, acc).map((o) => `<h3 class="grp">${esc(o.g)}</h3><div class="card flat">${o.list.join("")}</div>`).join("");
  return `<div class="hero"><div class="guidehead"><span class="gi" style="background:#FDE8E6">${C.heart}</span><h1>Pierwsza pomoc</h1></div><p>Działa bez internetu.</p></div>
  <section class="rko" id="fa-rko"><h2>Nie oddycha? Rozpocznij RKO</h2>
  <div class="row" style="margin:12px 0"><span class="pulse" id="pulse"></span><div><div class="bpm">~${R.bpm}<span style="font-size:1rem"> /min</span></div><div>uciśnięć na minutę</div><div id="phase" style="font-weight:800;letter-spacing:.04em;min-height:1.4em"></div></div></div>
  <button class="btn" id="metroBtn" aria-pressed="false">Włącz rytm</button><p class="small" style="margin:8px 0 0;opacity:.9">Dioda świeci, gdy uciskasz, i gaśnie, gdy puszczasz klatkę. Rytm 100/min (dopuszczalne 100–120) zostawia czas na pełne puszczenie. Brak dźwięku? Wyłącz tryb cichy i podgłośnij telefon. Wibracja nie działa na iPhonie.</p></section>
  <div class="card"><ol style="list-style:none;padding:0;margin:0">${steps}</ol>
  <a class="btn112" style="justify-content:center;min-height:52px;width:100%;margin-top:10px" href="tel:112">${I.phone}Zadzwoń 112</a>
  <a class="btn" style="width:100%;margin-top:10px" href="#/schrony/aed">${I.pin}Znajdź najbliższy defibrylator (AED)</a></div>
  <h2 style="margin-top:20px">Inne sytuacje</h2>${others}${reviewLine(FIRST_AID)}`;
}

let plecakTab = "plecak";
function checkRow(x) {
  return `<label class="check"><input type="checkbox" data-check="${x.id}" ${state.checked[x.id] ? "checked" : ""}><span><b>${esc(x.t)}</b><br><span class="muted small">${esc(x.d)}</span></span></label>`;
}
function screenPlecak() {
  const n = plecakDone(), total = PLECAK.start.length, pct = Math.round((n / total) * 100);
  const tabs = [["plecak", "Plecak"], ["zapas", "Zapas domowy"], ["dokumenty", "Dokumenty"], ["rodzina", "Rodzina"]].map(([k, t]) => `<button class="chip" data-ptab="${k}" aria-pressed="${plecakTab === k}">${t}</button>`).join("");
  let body;
  if (plecakTab === "plecak") {
    body = `<h2>Na start: pięć rzeczy</h2><div class="card flat" style="margin-top:8px">${PLECAK.start.map(checkRow).join("")}</div>
    <h2 style="margin-top:20px">Gdy masz czas</h2><div class="card flat" style="margin-top:8px">${PLECAK.later.map(checkRow).join("")}</div>`;
  } else if (plecakTab === "zapas") {
    body = `<h2>Zapas domowy na min. 3 dni</h2><div class="card flat" style="margin-top:8px">${PLECAK.zapas.map(checkRow).join("")}</div>`;
  } else if (plecakTab === "rodzina") {
    body = `<h2>Plan rodzinny</h2><p class="muted small" style="margin:4px 0 0">Ustalcie to wspólnie, zanim coś się wydarzy.</p><div class="card flat" style="margin-top:8px">${PLECAK.rodzina.map(checkRow).join("")}</div>`;
  } else {
    body = `<h2>Dokumenty i informacje</h2><div class="card flat" style="margin-top:8px">${PLECAK.dokumenty.map(checkRow).join("")}</div>`;
  }
  return `<div class="hero"><h1>Plecak i zapasy</h1><p>Plecak dla każdego domownika i zapas domowy na min. 3 dni. Bez przesady.</p></div>
  <div class="card"><div class="row"><b style="font-family:var(--font-h)">Na start: ${n} z ${total}</b><span class="spacer"></span><b>${pct}%</b></div><div class="progress" style="margin-top:8px"><i style="width:${pct}%"></i></div></div>
  <div class="chips" role="group" aria-label="Sekcje">${tabs}</div>${body}
  <div class="note" style="margin-top:12px">${esc(PLECAK.note)}</div>
  <button class="btn" id="printPack" style="margin-top:12px">Drukuj listę plecaka i zapasów</button>
  <p class="src">Źródło: ${esc(PLECAK.source)}. Każdy domownik, także dziecko, ma własny plecak. Zaznaczenia zapisują się tylko w tym urządzeniu. Ostatni przegląd: ${esc(PLECAK.reviewed)}.</p>`;
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

function screenWiecej() {
  const rows = MORE.map((n) => `<li><a href="${n.h}"><span class="mi">${n.i}</span><span class="mt"><b>${n.t}</b><span class="muted small">${n.d}</span></span>${I.chevr}</a></li>`).join("");
  return `<div class="hero"><h1>Więcej</h1><p>Wszystkie funkcje w jednym miejscu.</p></div>
  <div class="card"><ul class="list morelist">${rows}</ul></div>
  <p class="vers">EGIDA ${esc(APP_VERSION)} · ${esc(APP_BUILD)}</p>`;
}
function screenUstawienia() {
  const c = state.consent;
  const tg = state.region ? safeUrl(tgLinks()[state.region] || "") : "";
  const opt = (v, cur, t) => `<option value="${v}" ${cur === v ? "selected" : ""}>${t}</option>`;
  const src = state.regionSource;
  const gpsTag = src === "gps" ? ' <span class="tag-gps">wg GPS</span>' : src === "gps-edge" ? ' <span class="tag-gps">wg GPS (przy granicy – sprawdź)</span>' : src === "place" ? ' <span class="tag-gps">z ważnego miejsca</span>' : "";
  return `<div class="hero"><h1>Ustawienia</h1></div>
  <div class="card"><h2>Region i lokalizacja</h2><div class="field" style="margin-top:8px"><label for="setRegion" class="muted small">Województwo${gpsTag}</label>
  <select class="sel" id="setRegion"><option value="">— wybierz —</option>${VOIVODESHIPS.map((v) => `<option value="${v.id}" ${state.region === v.id ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></div>
  ${borderNote()}
  <button class="btn" id="useGps" style="margin-top:10px">${I.pin}Użyj lokalizacji GPS</button><p class="muted small">Pozycja jest używana tylko w Twoim telefonie, do wskazania województwa na podstawie uproszczonych granic. Nie jest wysyłana na serwer.</p>
  <label class="switch"><input type="checkbox" id="setGps" ${c.gps ? "checked" : ""}><span><b>Pozwalam używać lokalizacji na ekranie Pomoc w pobliżu</b><span class="muted small">Gdy włączone, lista najbliższych miejsc (schrony, AED, szpitale) ustala Twoją pozycję od razu po wejściu na ekran (przeglądarka nadal może zapytać o zgodę).</span></span></label></div>
  <div class="card"><h2>Twoje przygotowania</h2><div class="col" style="margin-top:8px"><a class="btn" href="#/plan-rodziny">${I.users}Plan rodziny i karty ICE</a><a class="btn" href="#/miejsca">${I.pin}Ważne miejsca: dom, praca, rodzina</a></div></div>
  <div class="card"><h2>Powiadomienia</h2>${tg ? `<p>Kanał Telegram dla Twojego województwa:</p><a class="btn primary" href="${esc(tg)}" target="_blank" rel="noopener noreferrer">Otwórz kanał Telegram ${I.ext}</a>` : `<p class="muted">Kanał Telegram dla Twojego województwa jest w przygotowaniu. Powiadomienia nie przebijają trybu „Nie przeszkadzać” i nie zastępują syren ani Alertu RCB.</p>`}<p style="margin-top:10px"><a href="#/telegram">Jak działają powiadomienia Telegram i lista kanałów</a></p></div>
  <div class="card"><h2>Prywatność</h2>
  <p class="muted small">Strona zlicza wyłącznie to, ile razy została otwarta: bez cookies, bez identyfikatorów i bez zapisywania adresu IP.</p>
  ${CONFIG.neptun?.enabled === false ? "" : `<label class="switch"><input type="checkbox" id="setNeptun" ${c.neptun ? "checked" : ""}><span><b>Obiekty znad Ukrainy na mapie (NEPTUN) <span class="badge unofficial">nieoficjalne · beta</span></b><span class="muted small">Domyślnie włączone. Na ekranie Mapa przeglądarka łączy się bezpośrednio z neptun.in.ua, a serwis widzi Twój adres IP. To nieoficjalne dane, mogą być spóźnione lub błędne. Wyłączysz to tutaj.</span></span></label>`}
  <p style="margin-top:6px"><a href="#/prywatnosc">Polityka prywatności</a></p></div>
  <div class="card"><h2>Tryb seniora</h2><label class="switch"><input type="checkbox" id="setSenior" ${state.senior ? "checked" : ""}><span><b>Duże litery i prostszy Pulpit</b><span class="muted small">Większy tekst, na Pulpicie wielki przycisk 112 i tylko najważniejsze kafelki. Wszystkie funkcje zostają w zakładce Więcej.</span></span></label></div>
  <div class="card"><h2>Wygląd</h2><div class="grid2" style="margin-top:8px"><div class="field"><label for="setFs" class="muted small">Rozmiar tekstu</label><select class="sel" id="setFs">${opt("normal", state.fs, "Normalny")}${opt("large", state.fs, "Duży")}${opt("xlarge", state.fs, "Bardzo duży")}</select></div>
  <div class="field"><label for="setContrast" class="muted small">Kontrast</label><select class="sel" id="setContrast">${opt("normal", state.contrast, "Normalny")}${opt("high", state.contrast, "Wysoki")}</select></div></div></div>
  <div class="card"><h2>Twoje dane</h2><p class="muted">Wszystko, co ustawisz, jest tylko w tym urządzeniu: województwo, plecak, plan rodziny, karty ICE, ważne miejsca, Moja apteczka. Zrób kopię przed zmianą telefonu albo gdy czyścisz dane przeglądarki.</p>
  <p class="small" id="backupInfo">${state.lastBackup ? `Ostatnia kopia: ${esc(plDate(state.lastBackup))}.` : "Nie zrobiono jeszcze kopii danych."}</p>
  <div class="grid2"><button class="btn" id="exportData">${C.backup}Zapisz kopię</button><button class="btn" id="wipeData">Usuń dane</button></div>
  <button class="btn" id="importBtn" style="margin-top:12px">Wczytaj kopię z pliku</button><input type="file" id="importFile" accept="application/json,.json" hidden><p id="importMsg" class="small" role="status" aria-live="polite"></p></div>
  ${offlineCardHtml()}
  ${installHtml(false)}
  <div class="card"><h2>Aplikacja</h2><p class="muted small">Jeśli widzisz starą wersję albo coś się nie odświeża, dotknij poniższego przycisku. Wyczyści pamięć podręczną aplikacji i wczyta najnowszą wersję (Twoje dane zostają).</p><button class="btn" id="refreshApp">Odśwież aplikację</button></div>
  <a class="btn" href="#/zrodla">Źródła i licencje</a>
  ${CONFIG.contactUrl ? `<a class="btn" style="margin-top:10px" href="${esc(safeUrl(CONFIG.contactUrl))}" target="_blank" rel="noopener noreferrer">Zgłoś błąd</a>` : ""}
  <p class="vers" id="appVer">EGIDA ${esc(APP_VERSION)} · ${esc(APP_BUILD)}<span id="swVer"></span></p>`;
}
function screenZrodla() {
  const rows = SOURCES.map((s) => `<tr><td><a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(s.n)}</a><br><span class="muted">${esc(s.w)}</span></td><td>${esc(s.l)}</td></tr>`).join("");
  return `${back("#/ustawienia", "Ustawienia")}<div class="hero"><h1>Źródła i licencje</h1><p>EGIDA jest nieoficjalna i niezależna. Pokazujemy, skąd pochodzą dane.</p></div>
  <div class="card"><table class="t"><thead><tr><th>Źródło</th><th>Licencja / warunki</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="src">Dane pochodzą od stron trzecich „tak jak są” i mogą być spóźnione lub błędne. Grafik i logo RCB nie używamy. <a href="#/prywatnosc">Polityka prywatności</a>.</p>`;
}

/* ---------- router ---------- */
const parse = () => { const p = (location.hash.replace(/^#\/?/, "") || "pulpit").split("/"); return { route: p[0], arg: p[1] }; };
function render() {
  stopMetro();
  destroyScreens();
  const { route, arg } = parse();
  const app = $("#app");
  document.documentElement.classList.toggle("onb", !state.onboarded);
  if (!state.onboarded) { app.innerHTML = screenStart(); document.title = "EGIDA – Witaj"; return; }
  let inner;
  switch (route) {
    case "alerty": inner = screenAlerty(); break;
    case "wazne": inner = screenWazne(); break;
    case "mapa": inner = screenMapa(arg); break;
    case "schrony": inner = renderSheltersHtml(geoCtx, { demo: arg === "demo", mode: arg }); break;
    case "plan-rodziny": inner = renderPlan(geoCtx); break;
    case "zagrozenie": inner = renderEmergency(geoCtx); break;
    case "miejsca": inner = renderPlaces(geoCtx); break;
    case "prywatnosc": inner = renderPrivacy(geoCtx); break;
    case "poradnik": inner = screenPoradnik(); break;
    case "co-robic": inner = screenCoRobic(arg); break;
    case "pierwsza-pomoc": inner = screenPierwszaPomoc(arg); break;
    case "bez-pradu": inner = screenGuide("bezpradu", BEZPRADU, "Bez prądu", C.bolt, false); break;
    case "hybrydowe": inner = screenGuide("hybrydowe", HYBRYDOWE, "Zagrożenia hybrydowe", C.hybrid, true); break;
    case "moja-apteczka": inner = screenMojaApteczka(); break;
    case "apteczka": inner = screenApteczka(); break;
    case "plecak": inner = screenPlecak(); break;
    case "test": inner = arg === "wynik" ? screenWynik() : screenTest(); break;
    case "telegram": inner = screenTelegram(); break;
    case "wiecej": inner = screenWiecej(); break;
    case "ustawienia": inner = screenUstawienia(); break;
    case "zrodla": inner = screenZrodla(); break;
    default: inner = screenPulpit();
  }
  app.innerHTML = shell(route, inner);
  if (route === "mapa") initMapScreen(geoCtx, { demo: arg === "demo", diag: arg === "diag" });
  else if (route === "schrony") initSheltersScreen(geoCtx, { demo: arg === "demo", mode: arg });
  else if (route === "plan-rodziny") initPlan(geoCtx);
  else if (route === "zagrozenie") initEmergency(geoCtx);
  else if (route === "miejsca") initPlaces(geoCtx);
  else if (route === "ustawienia") showSwVersion();
  const titles = { wazne: "Wiadomości", pulpit: "Pulpit", alerty: "Alerty", mapa: "Mapa zagrożeń", poradnik: "Poradnik", plecak: "Plecak", "pierwsza-pomoc": "Pierwsza pomoc", "bez-pradu": "Bez prądu", hybrydowe: "Zagrożenia hybrydowe", "moja-apteczka": "Moja apteczka", apteczka: "Apteczka", test: "Test gotowości", ustawienia: "Ustawienia", zrodla: "Źródła", telegram: "Powiadomienia Telegram", schrony: "Pomoc w pobliżu", "plan-rodziny": "Plan rodziny", zagrozenie: "Tryb zagrożenia", miejsca: "Ważne miejsca", prywatnosc: "Polityka prywatności", wiecej: "Więcej" };
  document.title = `EGIDA – ${titles[route] || "Pulpit"}`;
  window.scrollTo(0, 0); { const sh = document.querySelector(".shell"); if (sh) sh.scrollTop = 0; }
  if (route === "pierwsza-pomoc" && arg) { const el = document.getElementById("fa-" + arg); if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" })); }
}

/* ---------- GPS -> województwo (uproszczone granice PRG/GUGiK, bez wysyłania pozycji) ---------- */
function useGps(after) {
  if (!navigator.geolocation) { alert("Ta przeglądarka nie obsługuje lokalizacji. Wybierz województwo ręcznie."); return; }
  navigator.geolocation.getCurrentPosition(async (p) => {
    const { latitude: la, longitude: lo } = p.coords;
    let r = null, loaded = true;
    try { const { regionFromGps } = await import("./regions.js"); r = await regionFromGps(la, lo); } catch { loaded = false; /* brak danych granic: spróbujemy przybliżenia */ }
    if (!r) {
      // Dane granic niedostępne albo pozycja daleko od Polski: przybliżenie „najbliższy środek województwa” tylko w granicach kraju.
      const inPl = !loaded && la >= 48.9 && la <= 55 && lo >= 14 && lo <= 24.3;
      if (!inPl) { alert("Wygląda na to, że jesteś poza Polską albo nie udało się ustalić województwa. Wybierz województwo ręcznie."); return; }
      const k = Math.cos((la * Math.PI) / 180);
      let best = null, bd = 1e9;
      for (const v of VOIVODESHIPS) { const d = (v.lat - la) ** 2 + ((v.lon - lo) * k) ** 2; if (d < bd) { bd = d; best = v; } }
      state.region = best.id; state.regionSource = "gps-edge"; state.regionNear = { edge: true, km: null, id: null };
    } else {
      state.region = r.id;
      if (r.outside) { state.regionSource = "gps-edge"; state.regionNear = { edge: true, km: 0, id: null }; }
      else { state.regionSource = "gps"; state.regionNear = r.neighbor && r.borderKm < 10 ? { edge: false, km: r.borderKm, id: r.neighbor } : null; }
    }
    save(); after?.();
  }, () => { alert("Nie udało się ustalić lokalizacji. Wybierz województwo ręcznie."); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }); // świeża pozycja: po podróży województwo może być inne niż 10 min temu
}

/* ---------- wersja i odświeżanie aplikacji ---------- */
function showSwVersion() {
  const el = document.getElementById("swVer"); if (!el || !("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  const onMsg = (e) => {
    if (!e.data?.version) return;
    navigator.serviceWorker.removeEventListener("message", onMsg);
    const cur = document.getElementById("swVer"); if (!cur) return;
    const same = e.data.version === `egida-${APP_VERSION}`;
    cur.textContent = same ? ` · pamięć offline ${e.data.version}` : ` · UWAGA: pamięć offline ma wersję ${e.data.version}. Dotknij „Odśwież aplikację”.`;
  };
  navigator.serviceWorker.addEventListener("message", onMsg);
  navigator.serviceWorker.controller.postMessage("version");
}
async function refreshApp() {
  try { const regs = await navigator.serviceWorker?.getRegistrations?.(); for (const r of regs || []) await r.unregister(); } catch { /* */ }
  try { for (const k of await caches.keys()) if (/^egida-v/.test(k)) await caches.delete(k); } catch { /* */ }
  location.reload();
}
/** Tekst komunikatu do udostępnienia (kopia z oznaczeniem, że to nieoficjalna aplikacja). */
function alertShareText(a) {
  const body = String(a.body || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const cut = body.length > 800 ? body.slice(0, 800).replace(/\s+\S*$/, "") + "…" : body;
  const url = safeUrl(a.url);
  return `${TYPE_LBL[a.type] || "Komunikat"} · ${regionById(a.voivodeship)?.name || "cała Polska"} · ${fmtDate(a.published)}\n${a.title}${cut ? "\n" + cut : ""}\nŹródło: ${a.source || "RSO"}${url ? " · " + url : ""}\nKopia z aplikacji EGIDA (nieoficjalna). Kieruj się syrenami, Alertem RCB i poleceniami służb. W zagrożeniu życia dzwoń 112.`;
}

/* ---------- licznik ---------- */
function applyCounter() {
  if (!CONFIG.goatcounter || document.getElementById("gc")) return;
  const s = document.createElement("script");
  s.id = "gc"; s.async = true; s.src = "https://gc.zgo.at/count.js"; s.dataset.goatcounter = CONFIG.goatcounter;
  document.head.appendChild(s);
}

/* ---------- zdarzenia ---------- */
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "regionSel") {
    if (t.value === "__gps") { useGps(render); t.value = state.region || ""; return; }
    state.region = t.value; state.regionSource = "manual"; state.regionNear = null; save(); render();
  } else if (t.id === "startRegion") { state.region = t.value || null; state.regionSource = "manual"; state.regionNear = null; save(); }
  else if (t.id === "cGps") state.consent.gps = t.checked;
  else if (t.id === "cNeptun") { state.consent.neptun = t.checked; if (state.map?.layers) state.map.layers.neptun = t.checked; save(); }
  else if (t.id === "cAck") { state.consent.ack = t.checked; save(); $("#goStart").disabled = !t.checked; }
  else if (t.id === "setRegion") { state.region = t.value || null; state.regionSource = "manual"; state.regionNear = null; save(); render(); }
  else if (t.id === "setGps") { state.consent.gps = t.checked; save(); }
  else if (t.id === "importFile") importFromFile(t);
  else if (t.id === "setNeptun") { state.consent.neptun = t.checked; if (state.map?.layers) state.map.layers.neptun = t.checked; save(); }
  else if (t.id === "setSenior") { state.senior = t.checked; save(); applyPrefs(); render(); }
  else if (t.id === "setFs") { state.fs = t.value; save(); applyPrefs(); }
  else if (t.id === "setContrast") { state.contrast = t.value; save(); applyPrefs(); }
  else if (t.dataset.check) { state.checked[t.dataset.check] = t.checked; save(); render(); const el = document.querySelector(`[data-check="${t.dataset.check}"]`); el?.focus(); }
  else if (t.dataset.q) testAnswers[t.dataset.q] = t.checked;
});
document.addEventListener("input", (e) => {
  if (e.target.id === "alertQ") { alertQuery = e.target.value; const l = $("#alertList"); if (l) l.innerHTML = alertListHtml(); }
});
async function importFromFile(input) {
  const msg = $("#importMsg"), f = input.files?.[0]; input.value = "";
  if (!f || !msg) return;
  try {
    if (f.size > 2e6) throw new Error("Plik jest za duży jak na kopię danych EGIDY.");
    const res = importState(JSON.parse(await f.text()), { validRegions: VOIVODESHIPS.map((v) => v.id) });
    if (!res.ok) { msg.style.color = "var(--danger-ink)"; msg.textContent = res.error; return; }
    if (!confirm("Wczytać kopię z pliku? Zastąpi ona odpowiadające jej dane w tej aplikacji (ustawienia, plan rodziny, miejsca, Moja apteczka).")) return;
    Object.assign(state, res.state); state.plan = normalizePlan(state.plan); state.places = normalizePlaces(state.places); state.myKit = normalizeKit(state.myKit);
    save(); applyPrefs(); render();
    const m2 = $("#importMsg"); if (m2) { m2.style.color = ""; m2.textContent = "Dane wczytane."; }
  } catch (err) { msg.style.color = "var(--danger-ink)"; msg.textContent = err?.message && !/JSON/i.test(err.message) ? err.message : "Nie udało się odczytać pliku. Wybierz plik zapisany wcześniej przyciskiem „Zapisz kopię”."; }
}
/* Kopia danych: na telefonie otwiera się menu udostępniania (Zapisz w Plikach, AirDrop, e-mail), na komputerze plik trafia do Pobranych. */
async function exportBackup(btn) {
  const name = `egida-kopia-${todayYmd()}.json`, text = JSON.stringify(exportState(state), null, 2);
  const info = () => { state.lastBackup = todayYmd(); save(); const el = document.getElementById("backupInfo"); if (el) el.textContent = `Ostatnia kopia: ${plDate(state.lastBackup)}.`; };
  try {
    const f = new File([text], name, { type: "application/json" });
    if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: "Kopia danych EGIDA" }); info(); return; }
  } catch (err) { if (err?.name === "AbortError") return; /* inna usterka: pobierz zwykłym plikiem */ }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  info();
}
document.addEventListener("submit", (e) => {
  if (e.target.id !== "kitForm") return;
  e.preventDefault();
  const name = document.getElementById("kitName")?.value || "", date = document.getElementById("kitDate")?.value || "", note = document.getElementById("kitNote")?.value || "";
  if (!name.trim() || state.myKit.length >= KIT_LIMIT) return;
  state.myKit = normalizeKit([...state.myKit, { name, expires: date, note }]);
  kitFill = ""; save(); render();
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "installBtn" && installEvt) { const ev = installEvt; installEvt = null; try { ev.prompt(); } catch { /* */ } render(); return; }
  if (b.id === "offlineBtn") { runOffline(b); return; }
  if (b.id === "installLater") { state.installDismissed = new Date().toISOString().slice(0, 10); save(); render(); return; }
  if (b.id === "goStart") {
    state.onboarded = true; save(); applyCounter();
    if (state.consent.gps && !state.region) useGps(render); else render();
    if (!location.hash) location.hash = "#/pulpit";
  } else if (b.dataset.share) {
    const a = alertsData.items.find((x) => x.id === b.dataset.share);
    if (a) shareText(alertShareText(a)).then((r) => {
      const lab = b.querySelector("span");
      if (r === "copied" && lab) { lab.textContent = "Skopiowano"; setTimeout(() => { lab.textContent = "Udostępnij"; }, 2500); }
      else if (r === "failed") alert(shareNote(r));
    });
  } else if (b.id === "printGuide") printSheet("Instrukcje: pierwsza pomoc i co robić", guidePrintHtml(esc));
  else if (b.id === "printPack") printSheet("Plecak i zapasy", packPrintHtml(state, esc));
  else if (b.id === "importBtn") $("#importFile")?.click();
  else if (b.id === "refreshApp") { b.disabled = true; b.textContent = "Odświeżam…"; refreshApp(); }
  else if (b.dataset.gtab) { const [k, id] = b.dataset.gtab.split(":"); if (k in guideTabs) { guideTabs[k] = id; softRender(); } }
  else if (b.dataset.kitfill) { kitFill = b.dataset.kitfill; render(); document.getElementById("kitDate")?.focus(); }
  else if (b.dataset.kitdel) { const x = state.myKit.find((k) => k.id === b.dataset.kitdel); if (x && confirm(`Usunąć „${x.name}” z apteczki?`)) { state.myKit = state.myKit.filter((k) => k.id !== x.id); save(); softRender(); } }
  else if (b.id === "updNow") { b.disabled = true; location.reload(); }
  else if (b.dataset.newsscope) { newsScope = b.dataset.newsscope; render(); }
  else if (b.dataset.newsgo) { newsScope = b.dataset.newsgo; location.hash = "#/wazne"; render(); }
  else if (b.dataset.filter) { alertFilter = b.dataset.filter; render(); }
  else if (b.dataset.when) { alertWhen = b.dataset.when; render(); }
  else if (b.dataset.ptab) { plecakTab = b.dataset.ptab; render(); }
  else if (b.id === "useGps") useGps(render);
  else if (b.id === "metroBtn") {
    if (metro) { stopMetro(); b.textContent = "Włącz rytm"; b.setAttribute("aria-pressed", "false"); } else { startMetro(); b.textContent = "Wyłącz rytm"; b.setAttribute("aria-pressed", "true"); }
  } else if (b.id === "testDone") {
    const score = READINESS_QUESTIONS.filter((q) => testAnswers[q.id]).length;
    state.test = { answers: { ...testAnswers }, score, at: new Date().toISOString() }; save(); location.hash = "#/test/wynik";
  } else if (b.id === "exportData") { exportBackup(b);
  } else if (b.id === "wipeData") {
    if (confirm("Usunąć wszystkie dane zapisane w tej aplikacji na tym urządzeniu?")) { try { localStorage.removeItem(KEY); } catch { /* */ } state = defaults(); testAnswers = {}; applyPrefs(); location.hash = ""; render(); }
  }
});
window.addEventListener("hashchange", () => { if (parse().route === "test" && !parse().arg) testAnswers = { ...(state.test?.answers || {}) }; render(); });

/* ---------- start ---------- */
applyPrefs(); applyCounter();
testAnswers = { ...(state.test?.answers || {}) };
render();
loadNews().then(() => { if (state.onboarded && ["pulpit", "wazne", ""].includes(parse().route) && !document.activeElement?.closest?.("select,input,textarea")) render(); });
loadAir().then(() => { if (state.onboarded && ["pulpit", ""].includes(parse().route) && !editingNow()) render(); });
loadAlerts().then(() => { if (state.onboarded && ["pulpit", "alerty", "ustawienia", "telegram", ""].includes(parse().route) && !document.activeElement?.closest?.("select,input,textarea")) render(); });

/* ---------- odświeżanie na żywo ----------
   Alerty co minutę, wiadomości co 2 minuty (tylko gdy aplikacja jest na ekranie), a po powrocie z tła / z uśpienia / po odzyskaniu sieci – od razu.
   Ekran przerysowujemy tylko wtedy, gdy dane naprawdę się zmieniły, z zachowaniem miejsca przewinięcia i bez przerywania pisania. */
const LIVE_ALERT_MS = 60 * 1000, LIVE_NEWS_MS = 2 * 60 * 1000, LIVE_MIN_GAP = 15 * 1000;
const sigAlerts = () => JSON.stringify([alertsData.ok, alertsData.updated, alertsData.items]);
const sigNews = () => JSON.stringify([newsData ? newsFresh(newsData) : null, newsData?.items?.map((x) => x.id)]);
const editingNow = () => !!document.activeElement?.closest?.("select,input,textarea");
function softRender() {
  const sh = document.querySelector(".shell"), y = sh ? sh.scrollTop : 0, wy = window.scrollY;
  render();
  const sh2 = document.querySelector(".shell"); if (sh2 && y) sh2.scrollTop = y; if (wy) window.scrollTo(0, wy);
}
let liveBusy = false, liveLast = { alerts: Date.now(), news: Date.now() };
async function refreshLive(kinds, { force = false } = {}) {
  if (liveBusy || (document.hidden && !force) || !state.onboarded) return;
  liveBusy = true;
  try {
    const route = parse().route, before = [sigAlerts(), sigNews()], now = Date.now();
    const wantA = kinds.includes("alerts"), wantN = kinds.includes("news");
    if (wantA) liveLast.alerts = now; if (wantN) liveLast.news = now;
    await Promise.all([wantA ? loadAlerts() : null, wantN ? loadNews() : null]);
    const changed = (wantA && sigAlerts() !== before[0] && ["pulpit", "alerty", "ustawienia", "telegram", ""].includes(route)) || (wantN && sigNews() !== before[1] && ["pulpit", "wazne", ""].includes(route));
    if (changed && !editingNow() && parse().route === route) softRender();
  } catch { /* następna próba za chwilę */ } finally { liveBusy = false; }
}
setInterval(() => { if (Date.now() - liveLast.alerts >= LIVE_ALERT_MS - 1000) refreshLive(["alerts"]); }, 10 * 1000);
setInterval(() => { if (Date.now() - liveLast.news >= LIVE_NEWS_MS - 1000) refreshLive(["news"]); }, 20 * 1000);
const resumeLive = () => { if (document.hidden) return;
  if (Date.now() - airAt > 15 * 60 * 1000) loadAir().then(() => { if (state.onboarded && parse().route === "pulpit" && !editingNow()) softRender(); });
  try { navigator.serviceWorker?.getRegistration?.().then((r) => r?.update?.()).catch(() => {}); } catch { /* */ } const gap = Date.now() - Math.max(liveLast.alerts, liveLast.news); if (gap >= LIVE_MIN_GAP) refreshLive(["alerts", "news"], { force: true }); };
document.addEventListener("visibilitychange", resumeLive);
window.addEventListener("pageshow", resumeLive);
window.addEventListener("focus", resumeLive);
window.addEventListener("online", () => refreshLive(["alerts", "news"], { force: true }));
if ("serviceWorker" in navigator) {
  // Nowa wersja przejmuje stronę sama (skipWaiting + claim). Jeśli aplikacja już działała pod starą wersją, pokaż baner z przyciskiem „Odśwież”.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !updateReady) { updateReady = true; if (state.onboarded && !editingNow()) softRender(); } });
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
