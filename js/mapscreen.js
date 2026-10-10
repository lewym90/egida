// Ekrany „Mapa zagrożeń” i „Schrony i ukrycia”. Leaflet ładujemy dopiero po wejściu na ekran z mapą.
// Zasady: pozycja użytkownika zostaje w pamięci przeglądarki (nigdzie jej nie wysyłamy); obiekty NEPTUN
// są nieoficjalne, domyślnie wyłączone i włączane świadomą zgodą; brak świeżych danych ⇒ „brak danych”, nigdy „spokojnie”.
import { CONFIG } from "./config.js";
import { createFeed } from "./neptun-feed.js";
import { ThreatStore, buildView, coneOutline, fmtKmPl, ageText, TYPES, LIMITS } from "./neptun.js";
import { compassPl, destination } from "./geo.js";
import { demoThreats, demoAlerts, demoRaions, demoMessages, DEMO_USER } from "./demo.js";
import { dirUrl, loadShelterDb, loadPspAround, makePspCache, mergeSources } from "./shelters.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Leaflet (ładowany leniwie, z własnego hostingu) ---------- */
let leafletP = null;
export function loadLeaflet() {
  if (globalThis.L?.map) return Promise.resolve(globalThis.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((res, rej) => {
    if (!document.getElementById("leaflet-css")) {
      const l = document.createElement("link");
      l.id = "leaflet-css"; l.rel = "stylesheet"; l.href = "js/vendor/leaflet/leaflet.css";
      document.head.appendChild(l);
    }
    const s = document.createElement("script");
    s.src = "js/vendor/leaflet/leaflet.js";
    s.onload = () => (globalThis.L?.map ? res(globalThis.L) : rej(new Error("Leaflet")));
    s.onerror = () => { leafletP = null; rej(new Error("Leaflet")); };
    document.head.appendChild(s);
  });
  return leafletP;
}

/* ---------- pozycja użytkownika (tylko w pamięci) ---------- */
let lastUser = null;
export const getUser = () => lastUser;
export function locate(onPos, onErr, watch) {
  if (!navigator.geolocation) { onErr(new Error("Ta przeglądarka nie obsługuje lokalizacji.")); return () => {}; }
  const ok = (p) => { lastUser = { lat: p.coords.latitude, lon: p.coords.longitude, accKm: (p.coords.accuracy || 0) / 1000 }; onPos(lastUser); };
  const opts = { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 };
  if (watch) { const id = navigator.geolocation.watchPosition(ok, onErr, opts); return () => navigator.geolocation.clearWatch(id); }
  navigator.geolocation.getCurrentPosition(ok, onErr, opts);
  return () => {};
}

let active = null;
export const setActive = (a) => { active = a; };
export function destroyScreens() { if (active) { try { active.destroy(); } catch { /* */ } active = null; } }

export function baseLayer(L, key, onFail) {
  const c = CONFIG.tiles[key] || CONFIG.tiles.map;
  const urls = [c.url, ...(c.fallbackUrls || [])];
  let i = 0, ok = 0, bad = 0, badTotal = 0, lastBad = "";
  const opts = { attribution: c.attribution, maxZoom: c.maxZoom ?? 18, maxNativeZoom: c.maxNativeZoom, subdomains: c.subdomains || "abc" };
  // Satelita (EOX): adres wklejony w pasek przeglądarki działa (nie wysyła nagłówka Referer), więc tu też go nie wysyłamy.
  // Dla OSM zostaje domyślnie: polityka OSM wymaga prawidłowego nagłówka Referer.
  if (c.referrerPolicy) opts.referrerPolicy = c.referrerPolicy;
  const layer = L.tileLayer(urls[0], opts);
  // Gdy żaden kafelek się nie wczytuje (np. zły adres lub awaria dostawcy), próbujemy kolejnego adresu, a na końcu zgłaszamy błąd.
  layer.on("tileload", () => { ok++; });
  layer.on("tileerror", (e) => {
    bad++; badTotal++; lastBad = String(e?.tile?.src || "");
    if (ok === 0 && bad >= 4) {
      bad = 0;
      if (i + 1 < urls.length) { i++; layer.setUrl(urls[i]); } else if (onFail) { const f = onFail; onFail = null; f(key); }
    }
  });
  // Dane do podglądu diagnostycznego (#/mapa/diag): ile kafelków się wczytało, ile nie, jaki adres jest aktualnie używany.
  layer.diag = () => ({ key, loaded: ok, errors: badTotal, url: urls[i], variant: i + 1, variants: urls.length, lastBad, referrerPolicy: c.referrerPolicy || "domyślna" });
  return layer;
}
export const fmtDt = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
const CONF = { low: "niska", medium: "średnia", high: "wysoka" };

/* ---------- ikony ---------- */
export const shelterIcon = (L, mine) => L.divIcon({
  className: "sh-ic", iconSize: [30, 30], iconAnchor: [15, 15],
  html: `<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="${mine ? "#0B6B63" : "#2A4DA0"}" stroke="#fff" stroke-width="2"/><path d="M15 6l7 2.6v4.9c0 4.3-3 7.1-7 8.4-4-1.3-7-4.1-7-8.4V8.6z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
});
function threatIcon(L, row) {
  const t = row.t, fast = TYPES[t.type].kind === "fast";
  const col = fast ? "#8A3B00" : "#B45309"; // bursztyn/brąz: czerwień zarezerwowana dla realnego alarmu
  const op = t.advisory || t.status === "stale" || !row.pred.ok || t.presumptive || t.posQuality === "approx" ? 0.6 : 1;
  const shape = t.headingDeg != null && !t.destination
    ? `<g transform="rotate(${Math.round(t.headingDeg)} 14 14)"><path d="M14 2 L24 25 L14 20 L4 25 Z" fill="${col}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g>`
    : `<circle cx="14" cy="14" r="9" fill="${col}" stroke="#fff" stroke-width="2"/>`;
  return L.divIcon({ className: "thr-ic", iconSize: [30, 30], iconAnchor: [15, 15], html: `<svg viewBox="0 0 28 28" width="30" height="30" style="opacity:${op}" aria-hidden="true">${shape}</svg>` });
}

/* ---------- opis obiektu ---------- */
function threatText(row) {
  const { t, zone, pred, ageSec } = row;
  const place = esc(t.locality || t.district || t.region || "");
  const where = zone.inPoland ? "nad terytorium Polski (wg NEPTUN)" : `ok. ${fmtKmPl(zone.distKm)} od granicy Polski (szacunek)`;
  const move = t.destination ? "kurs na tę miejscowość (dokładnej pozycji obiektu nie znamy)"
    : t.headingDeg != null ? `kurs ${Math.round(t.headingDeg)}° (${compassPl(t.headingDeg)})${t.presumptive ? ", przypuszczalny" : ""}${t.speedKmh != null ? `, ok. ${Math.round(t.speedKmh)} km/h` : ""}` : "kurs nieznany";
  const posn = !t.destination && t.posQuality === "approx" ? `pozycja przybliżona${t.uncertaintyKm ? ` (±${Math.round(t.uncertaintyKm)} km)` : ""}` : "";
  const conf = t.confidence ? `pewność: ${CONF[t.confidence]}${t.sourceCount != null ? ` (${t.sourceCount} ${t.sourceCount === 1 ? "źródło" : t.sourceCount < 5 ? "źródła" : "źródeł"})` : ""}` : "pewność nieznana";
  return [place ? `${place}` : "", where, move, posn, esc(ageText(ageSec)), conf, pred.ok && pred.advancedKm > 1 ? "pozycja przeliczona na teraz" : ""].filter(Boolean).join(" · ");
}
function badgesHtml(row) {
  const t = row.t;
  return `<span class="badge unofficial">Nieoficjalne</span><span class="badge info">${esc(TYPES[t.type].label)}${t.count > 1 ? ` ×${esc(t.count)}` : ""}</span>${t.advisory ? '<span class="badge soon">obserwacja bez alarmu</span>' : ""}${t.status === "stale" ? '<span class="badge soon">nieaktualny wg NEPTUN</span>' : ""}`;
}
const itemHtml = (row) => `<li class="obj"><div class="meta">${badgesHtml(row)}</div>
  ${row.t.title && row.t.title !== "DEMO" ? `<p class="small" style="margin:6px 0 0;font-weight:600">${esc(row.t.title)}</p>` : ""}
  <p class="muted small" style="margin:6px 0 0">${threatText(row)}</p>${row.t.note ? `<p class="muted small" style="margin:4px 0 0">${esc(row.t.note)}</p>` : ""}
  <p class="assess assess-${esc(row.assess.severity)}">${esc(row.assess.text)}</p></li>`;
const popupHtml = (row, demo) => `<div class="pop">${demo ? '<b>DANE WYMYŚLONE (DEMO)</b><br>' : ""}<div class="meta">${badgesHtml(row)}</div><p class="small" style="margin:6px 0">${threatText(row)}</p><p class="small"><b>${esc(row.assess.text)}</b></p></div>`;

const hhmm = (ms) => (ms ? new Date(ms).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "?");
const areaItemHtml = (r) => `<li class="obj"><div class="meta"><span class="badge unofficial">Nieoficjalne</span><span class="badge info">${esc(TYPES[r.t.type].label)}${r.t.count > 1 ? ` ×${esc(r.t.count)}` : ""}</span>${r.t.advisory ? '<span class="badge soon">bez alarmu</span>' : ""}</div>
  <p class="muted small" style="margin:6px 0 0">${esc(r.t.region || r.t.district || r.t.title || "obwód nieznany")}${r.t.locality ? ` · ${esc(r.t.locality)}` : ""} · ${esc(ageText(r.ageSec))}</p></li>`;
const NEPTUN_ATTR = `Dane o obiektach: <a href="https://neptun.in.ua/" target="_blank" rel="noopener noreferrer">Karta powitryanykh tryvoh — NEPTUN (neptun.in.ua)</a>.`;
const NEPTUN_NOTICE = "NEPTUN to nieoficjalny agregator informacji z otwartych źródeł, a nie system ostrzegania. Dane mogą być spóźnione, niepełne lub błędne. Zawsze kieruj się syrenami, Alertami RCB i poleceniami służb. W zagrożeniu życia dzwoń 112.";

/* =========================================================
   MAPA
   ========================================================= */
const nepEnabled = () => CONFIG.neptun?.enabled !== false;

export function renderMapHtml(ctx, { demo = false, diag = false } = {}) {
  demo = demo && nepEnabled();
  const st = ctx.state, m = st.map || {}, lay = m.layers || {};
  const base = m.base || "map";
  const chips = ["map", "terrain", "sat"].map((k) => `<button class="chip" data-base="${k}" aria-pressed="${base === k}">${esc(CONFIG.tiles[k].name)}</button>`).join("");
  const nepOn = nepEnabled() && (demo || (lay.neptun === true && st.consent?.neptun === true));
  const list = ctx.regionAlerts?.() || [];
  const official = !st.region ? "" : ctx.alertsFresh?.()
    ? `<a class="note ${list.length ? "warn" : "neutral"}" style="display:block;text-decoration:none;margin-bottom:12px" href="#/alerty"><b>Oficjalne komunikaty dla województwa ${esc(ctx.regionById(st.region)?.name)}: ${list.length ? `aktywnych ${list.length}. Zobacz w Alertach.` : "brak aktywnych."}</b></a>`
    : `<div class="note warn" style="margin-bottom:12px"><b>Brak aktualnych danych o komunikatach oficjalnych.</b> To nie znaczy, że jest bezpiecznie. Słuchaj syren i sprawdzaj Alerty RCB.</div>`;
  return `<div class="hero"><h1>Mapa zagrożeń</h1><p>Schrony oraz (opcjonalnie) nieoficjalne informacje o obiektach latających przy granicy.</p></div>
  ${demo ? `<div class="demo-banner" role="alert"><b>TRYB DEMONSTRACYJNY – DANE WYMYŚLONE.</b> Obiekty i pozycja „Ty” na tej mapie są sztuczne i służą tylko do pokazania, jak będzie wyglądać mapa. To nie jest ostrzeżenie. <a href="#/mapa">Wyjdź z trybu demo</a></div>` : ""}
  ${official}
  <div class="chips" role="group" aria-label="Podkład mapy">${chips}</div>
  <div class="card" style="padding:4px 16px">
    <label class="switch"><input type="checkbox" id="lyShelters" ${lay.shelters !== false ? "checked" : ""}><span><b>Schrony i ukrycia</b><span class="muted small">Punkty schronienia z Rejestru PSP oraz Twoje zapisane miejsca. Widoczne po przybliżeniu mapy. Lista z czasem dojścia jest w zakładce Schrony.</span><span id="shHint" class="muted small" aria-live="polite"></span></span></label>
    ${nepEnabled() ? `<label class="switch"><input type="checkbox" id="lyNeptun" ${nepOn ? "checked" : ""} ${demo ? "disabled" : ""}><span><b>Obiekty znad Ukrainy <span class="badge unofficial">nieoficjalne · beta</span></b><span class="muted small">Drony i rakiety w pobliżu granicy wg NEPTUN. Domyślnie włączone (możesz wyłączyć tutaj lub w Ustawieniach). Przeglądarka łączy się bezpośrednio z neptun.in.ua, a serwis widzi Twój adres IP.</span></span></label>` : ""}
  </div>
  <div id="nepConsent" class="card" hidden role="dialog" aria-label="Zgoda na połączenie z NEPTUN">
    <h2>Włączyć obiekty znad Ukrainy?</h2>
    <ul class="how2"><li>Mapa połączy się <b>bezpośrednio</b> z serwisem neptun.in.ua (zewnętrzny, prowadzony anonimowo). Serwis zobaczy Twój adres IP. EGIDA nic tam nie wysyła o Tobie.</li>
    <li>To <b>nieoficjalne</b> informacje, mogą być spóźnione, niepełne lub błędne. Nie zastępują syren ani Alertu RCB.</li>
    <li>Ocena toru względem Twojej pozycji działa tylko dla dronów, przy świeżych danych. Dla rakiet nie oceniamy toru.</li>
    <li>Możesz to wyłączyć w każdej chwili, tutaj lub w Ustawieniach.</li></ul>
    <div class="grid2" style="margin-top:10px"><button class="btn primary" id="nepYes">Włączam</button><button class="btn" id="nepNo">Nie teraz</button></div>
  </div>
  <p id="tileMsg" class="note warn" hidden role="status"></p>
  ${diag ? '<pre id="tileDiag" class="note neutral" style="white-space:pre-wrap;word-break:break-all;font-size:.75rem" aria-live="off">Diagnostyka podkładu: czekam na kafelki…</pre>' : ""}
  <div class="mapwrap"><div id="map" class="map" role="region" aria-label="Mapa. Obiekty i schrony są też wypisane w listach poniżej."><p class="muted" style="padding:16px">Ładuję mapę…</p></div></div>
  <div class="maptools"><button class="btn sm" id="btnLocate">${ctx.I.pin}Pokaż mnie</button><button class="btn sm" id="btnBorder">Granica wschodnia</button><button class="btn sm" id="btnObjects" hidden>Pokaż obiekty</button></div>
  <p id="locMsg" class="muted small" aria-live="polite"></p>
  <div id="nepBox" ${nepOn ? "" : "hidden"}>
    <div id="nepStatus" class="note neutral" aria-live="polite"></div>
    <p id="nepSummary" class="small" style="margin:10px 0 0;font-weight:600"></p>
    <div class="chips" role="group" aria-label="Filtr obiektów" style="margin-top:10px">
      <button class="chip" data-nf="all" aria-pressed="true">Wszystkie</button>
      <button class="chip" data-nf="drones" aria-pressed="false">Drony</button>
      <button class="chip" data-nf="fast" aria-pressed="false">Rakiety i bomby</button>
    </div>
    <label class="switch" style="margin-top:6px"><input type="checkbox" id="nepNear" ${lay.nepNear === true ? "checked" : ""}><span><b>Tylko okolice granicy Polski</b><span class="muted small">Domyślnie widać wszystkie obiekty z danych NEPTUN. Po włączeniu zostaną tylko te do ${LIMITS.zoneKm} km od granicy. Odległe obiekty są tylko pokazywane: nie wywołują ocen ani powiadomień.</span></span></label>
    <h2 style="margin-top:16px">Obiekty (od najbliższego granicy Polski)</h2>
    <div class="card flat"><ul class="list" id="nepList"></ul></div>
    <div id="nepAreaWrap" hidden><h2 style="margin-top:16px">Obserwacje bez dokładnej pozycji</h2>
      <p class="muted small" style="margin:0 0 6px">NEPTUN podaje tylko obwód. Nie rysujemy ich na mapie i nie oceniamy toru.</p>
      <div class="card flat"><ul class="list" id="nepArea"></ul></div></div>
    <div id="nepAlertsWrap" hidden><h2 style="margin-top:16px">Alarmy powietrzne w Ukrainie</h2>
      <p class="muted small" style="margin:0 0 6px">Obwody z aktywnym alarmem wg NEPTUN. To informacja o Ukrainie, nie o Polsce.</p>
      <div class="card flat"><p id="nepAlerts" class="small" style="margin:0;padding:12px 16px"></p></div></div>
    <details class="card flat" style="margin-top:12px"><summary style="cursor:pointer;padding:12px 16px;font-weight:600">Szczegóły połączenia</summary><div id="nepDiag" class="small muted" style="padding:0 16px 12px"></div></details>
    <p class="src">${NEPTUN_ATTR}</p>
    <div class="note warn" style="margin-top:8px">${NEPTUN_NOTICE}</div>
  </div>
  <p class="src">Pozycja „Ty” jest tylko w pamięci przeglądarki i nigdzie nie jest wysyłana. Kafelki mapy pobiera Twoja przeglądarka od dostawcy mapy (zobacz Źródła i licencje).</p>`;
}

export function initMapScreen(ctx, { demo = false, diag = false } = {}) {
  demo = demo && nepEnabled();
  destroyScreens();
  const root = document.getElementById("map");
  if (!root) return;
  let dead = false;
  const cleanups = [];
  const screen = { destroy() { dead = true; cleanups.forEach((f) => { try { f(); } catch { /* */ } }); cleanups.length = 0; } };
  active = screen;

  loadLeaflet().then((L) => {
    if (dead) return;
    const st = () => ctx.state;
    if (!st().map) st().map = { base: "map", layers: { shelters: true, neptun: true } };
    const ml = () => (st().map.layers ||= { shelters: true, neptun: true });
    const $ = (id) => document.getElementById(id);

    root.innerHTML = "";
    let user = demo ? { ...DEMO_USER } : getUser();
    const map = L.map(root, { center: [51.6, 22.8], zoom: 6, minZoom: 4, worldCopyJump: false });
    cleanups.push(() => map.remove());
    const failNote = (k) => { const n = $("tileMsg"); if (n) { n.hidden = false; n.textContent = `Podkład „${(CONFIG.tiles[k] || {}).name || k}” nie odpowiada. Wybierz inny albo spróbuj później.`; } };
    let baseL = baseLayer(L, st().map.base || "map", failNote).addTo(map);
    if (diag) {
      const dt = setInterval(() => { const el = $("tileDiag"); if (!el || !baseL?.diag) return; const d = baseL.diag(); el.textContent = `Diagnostyka podkładu „${d.key}” (wariant ${d.variant}/${d.variants}, Referer: ${d.referrerPolicy})\nWczytane kafelki: ${d.loaded} · błędy: ${d.errors} · online: ${navigator.onLine}\nAdres: ${d.url}${d.lastBad ? `\nOstatni błędny kafelek: ${d.lastBad}` : ""}\nPrzybliżenie: ${map.getZoom()}`; }, 1000);
      cleanups.push(() => clearInterval(dt));
    }
    const gShelters = L.layerGroup().addTo(map), gThreats = L.layerGroup().addTo(map), gUser = L.layerGroup().addTo(map);
    setTimeout(() => { if (!dead) map.invalidateSize(); }, 0);

    /* podkład */
    document.querySelectorAll("[data-base]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.base; st().map.base = k; ctx.save();
      map.removeLayer(baseL); if ($("tileMsg")) $("tileMsg").hidden = true; baseL = baseLayer(L, k, failNote).addTo(map); baseL.bringToBack();
      document.querySelectorAll("[data-base]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));

    /* użytkownik */
    const drawUser = () => {
      gUser.clearLayers();
      if (!user) return;
      if (user.accKm > 0.1 && user.accKm < 30) L.circle([user.lat, user.lon], { radius: user.accKm * 1000, color: "#2A4DA0", weight: 1, fillColor: "#2A4DA0", fillOpacity: 0.08, interactive: false }).addTo(gUser);
      L.circleMarker([user.lat, user.lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#2A4DA0", fillOpacity: 1 }).bindTooltip(demo ? "Ty (demo)" : "Ty", { direction: "top" }).addTo(gUser);
    };
    drawUser();
    let firstFix = !user;
    if (demo) map.setView([DEMO_USER.lat, DEMO_USER.lon], 7);
    else if (user) map.setView([user.lat, user.lon], 8);
    let stopLoc = null;
    cleanups.push(() => stopLoc?.());
    // W trybie demo nie używamy prawdziwej pozycji (nie mieszamy jej z wymyślonymi obiektami).
    if (demo && $("btnLocate")) $("btnLocate").hidden = true;
    $("btnLocate")?.addEventListener("click", () => {
      $("locMsg").textContent = "Ustalam pozycję…";
      stopLoc?.();
      stopLoc = locate((p) => {
        if (dead) return;
        user = p; drawUser(); $("locMsg").textContent = "";
        if (firstFix) { map.setView([p.lat, p.lon], Math.max(map.getZoom(), 8), { animate: false }); firstFix = false; }
        scheduleRefresh();
      }, () => { $("locMsg").textContent = "Nie udało się ustalić pozycji. Sprawdź, czy lokalizacja jest włączona i dozwolona dla tej strony."; }, true);
    });
    $("btnBorder")?.addEventListener("click", () => map.fitBounds([[49.0, 21.6], [54.6, 24.6]]));

    /* schrony na mapie */
    let dbItems = [], pspItems = [];
    const pspMemo = new Map(), pspCache = demo ? null : makePspCache(CONFIG.pspUrl);
    const canvas = L.canvas({ padding: 0.3 });
    const drawShelters = () => {
      if (dead) return;
      gShelters.clearLayers();
      if (ml().shelters === false) return;
      const mine = st().shelters || [];
      const pop = (s, kind, extra) => `<div class="pop"><b>${esc(s.name)}</b><br><span class="small muted">${kind}</span>${extra || ""}<p class="small" style="margin:6px 0"><a href="${esc(dirUrl(s, "walking"))}" target="_blank" rel="noopener noreferrer">Trasa pieszo</a> · <a href="${esc(dirUrl(s, "driving"))}" target="_blank" rel="noopener noreferrer">Autem</a></p></div>`;
      const z = map.getZoom(), bounds = map.getBounds().pad(0.1);
      const hint = $("shHint");
      const list = mergeSources(pspItems, dbItems);
      let n = 0;
      if (z >= 12) {
        for (const s of list) {
          if (!bounds.contains([s.lat, s.lon]) || n++ > 1500) continue;
          if (s.src === "osm") L.marker([s.lat, s.lon], { icon: shelterIcon(L, false), keyboard: false }).bindPopup(pop(s, "OpenStreetMap · niezweryfikowane", s.access ? `<br><span class="small">Dostęp: ${esc(s.access)}</span>` : "")).addTo(gShelters);
          else L.circleMarker([s.lat, s.lon], { renderer: canvas, radius: 7, color: "#fff", weight: 2, fillColor: "#2A4DA0", fillOpacity: 1 }).bindPopup(pop(s, "Punkt schronienia · Rejestr PSP", s.access ? `<br><span class="small">Dostępność: ${esc(s.access)}</span>` : "")).addTo(gShelters);
        }
      }
      if (hint) hint.textContent = z < 12 && ml().shelters !== false ? "Przybliż mapę (zoom 12 lub więcej), aby zobaczyć punkty schronienia." : "";
      for (const s of mine) L.marker([s.lat, s.lon], { icon: shelterIcon(L, true), keyboard: false }).bindPopup(pop(s, "Twoje miejsce", s.how ? `<br><span class="small">Jak wejść: ${esc(s.how)}</span>` : "")).addTo(gShelters);
    };
    let pspTimer = null;
    const loadView = () => {
      if (dead || demo || map.getZoom() < 12 || ml().shelters === false) return;
      const c = map.getCenter();
      loadPspAround(CONFIG.pspUrl, c.lat, c.lng, { cache: pspCache, memo: pspMemo }).then((r) => {
        if (dead) return;
        pspItems = [...new Map([...pspItems, ...r.items].map((x) => [x.id, x])).values()]; drawShelters();
      }).catch(() => {});
    };
    drawShelters();
    map.on("moveend", () => { drawShelters(); clearTimeout(pspTimer); pspTimer = setTimeout(loadView, 400); });
    cleanups.push(() => clearTimeout(pspTimer));
    if (!demo) loadShelterDb(CONFIG.sheltersUrl).then((db) => { if (db && !dead) { dbItems = db.items; drawShelters(); } }).catch(() => {});
    loadView();
    $("lyShelters")?.addEventListener("change", (e) => { ml().shelters = e.target.checked; ctx.save(); drawShelters(); loadView(); });

    /* NEPTUN */
    let feed = null, timer = null, pending = null, lastRows = [], nepFilter = "all";
    let fitDone = false; // jednorazowe dopasowanie widoku, gdy w kadrze nie ma żadnego obiektu (mapa nie może wyglądać na pustą)
    let openId = null, redrawing = false; // id obiektu z otwartą etykietą: odświeżanie nie może jej zamykać
    map.on("popupclose", () => { if (!redrawing) openId = null; });
    const store = demo ? new ThreatStore() : null;
    const neptunWanted = () => nepEnabled() && (demo || (ml().neptun === true && st().consent?.neptun === true));
    const scheduleRefresh = () => { if (pending) return; pending = setTimeout(() => { pending = null; refresh(); }, 300); };
    const feedFresh = () => (demo ? true : !!feed?.isFresh());

    function refresh() {
      if (dead) return;
      const on = neptunWanted();
      $("nepBox").hidden = !on;
      redrawing = true;
      gThreats.clearLayers();
      if (!on) { redrawing = false; openId = null; $("btnObjects").hidden = true; return; }
      if (demo) { store.applySnapshot(demoThreats(Date.now())); store.applyAlerts(demoAlerts(), demoRaions()); store.applyMessages(demoMessages(Date.now())); }
      const s = demo ? store : feed.store;
      const view = buildView(s, user, feedFresh(), { nearOnly: ml().nepNear === true, filter: nepFilter });
      lastRows = view.rows;
      const fs = demo ? { state: "live", via: "demo" } : feed.status();
      // status źródła
      let msg, cls = "neutral";
      if (demo) { msg = "Tryb demonstracyjny: dane wymyślone, odświeżane lokalnie."; cls = "warn"; }
      else if (fs.formatWarning) { msg = "Odebrano dane NEPTUN w nieoczekiwanym formacie. Nie możemy ich pokazać. To nie znaczy, że jest bezpiecznie. Kieruj się syrenami i Alertami RCB."; cls = "warn"; }
      else if (!feed.isFresh()) {
        msg = fs.state === "connecting" ? "Łączę z NEPTUN…" : "Brak połączenia z NEPTUN. Nie wiemy, co dzieje się przy granicy. To nie znaczy, że jest bezpiecznie. Kieruj się syrenami, Alertami RCB i oficjalnymi komunikatami.";
        if (fs.state !== "connecting") cls = "warn";
      } else if (!view.rows.length && !view.areaRows.length) {
        msg = `W danych NEPTUN nie ma teraz żadnych obiektów z pozycją. To nie znaczy, że jest bezpiecznie: NEPTUN może nie obejmować wszystkich kierunków (np. od strony Białorusi i Kaliningradu) ani nisko lecących obiektów.`;
      } else {
        msg = `Źródło odpowiada (${fs.via === "ws" ? "na żywo" : "odświeżanie co " + Math.round(CONFIG.neptun.pollMs / 1000) + " s"}). Obiektów z pozycją: ${view.rows.length}.${view.areaOnly ? ` Bez dokładnej pozycji (tylko obwód): ${view.areaOnly}.` : ""}`;
      }
      const dataOk = demo || (feed.isFresh() && !fs.formatWarning);
      $("nepStatus").className = "note " + cls;
      $("nepStatus").textContent = msg;
      $("nepList").innerHTML = dataOk && view.rows.length ? view.rows.slice(0, 60).map(itemHtml).join("") + (view.rows.length > 60 ? `<li class="obj muted small">…i ${view.rows.length - 60} dalszych.</li>` : "") : `<li class="obj muted">${dataOk ? "Brak obiektów." : "Brak aktualnych danych."}</li>`;
      $("btnObjects").hidden = !(dataOk && view.rows.length);
      // podsumowanie, obserwacje bez pozycji, alarmy w Ukrainie, wiadomości, diagnostyka
      const sum = Object.entries(view.counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${TYPES[k].label}: ${n}`).join(" · ");
      $("nepSummary").textContent = dataOk && sum ? `W widoku: ${sum}` : "";
      $("nepAreaWrap").hidden = !(dataOk && view.areaRows.length);
      $("nepArea").innerHTML = dataOk ? view.areaRows.slice(0, 20).map(areaItemHtml).join("") : "";
      const aw = dataOk && view.alerts.length;
      $("nepAlertsWrap").hidden = !aw;
      if (aw) {
        const by = new Map();
        for (const a of view.alerts) { const g = by.get(a.region) || { whole: false, raions: [], reasons: new Set() }; if (a.scope === "oblast") g.whole = true; else g.raions.push(a.name); a.reasons.forEach((r) => g.reasons.add(r)); by.set(a.region, g); }
        $("nepAlerts").innerHTML = [...by].map(([reg, g]) => `<b>${esc(reg)}</b>${g.whole ? " (cały obwód)" : g.raions.length ? ` (${g.raions.length} ${g.raions.length === 1 ? "rejon" : g.raions.length < 5 ? "rejony" : "rejonów"})` : ""}${g.reasons.size ? ` · ${esc([...g.reasons].join(", "))}` : ""}`).join("<br>");
      }
      const ex = s.extras || {};
      $("nepDiag").innerHTML = demo ? "Tryb demonstracyjny." : [
        `Połączenie: ${esc({ live: "na żywo (WebSocket)", polling: "odpytywanie REST", connecting: "łączenie", offline: "brak", off: "wyłączone" }[fs.state] || fs.state)}`,
        `Ostatnia odpowiedź: ${esc(hhmm(fs.lastOkAt))}${fs.error ? ` · błąd: ${esc(fs.error)}` : ""}`,
        `Rekordy w ostatniej migawce: ${s.stats.seen}, odrzucone: ${s.stats.bad}`,
        `Alarmy w Ukrainie: ${ex.alertsAt ? "odebrane " + esc(hhmm(ex.alertsAt)) : "brak"}${ex.alertsErr ? ` · ${esc(ex.alertsErr)}` : ""}`,
        `Ukryte (włączone „Tylko okolice granicy”): ${view.farHidden}`,
      ].join("<br>");
      if (!dataOk) { redrawing = false; openId = null; return; } // bez świeżych danych nie rysujemy nic, co mogłoby sugerować obraz sytuacji
      view.rows.forEach((row, idx) => {
        const t = row.t, col = TYPES[t.type].kind === "fast" ? "#8A3B00" : "#B45309";
        const here = row.pred.ok ? row.pred.here : { lat: t.lat, lon: t.lon };
        if (t.posQuality === "approx" && t.uncertaintyKm >= 5) L.circle([t.lat, t.lon], { radius: Math.min(t.uncertaintyKm, 60) * 1000, color: col, weight: 1, opacity: 0.5, dashArray: "4 4", fillColor: col, fillOpacity: 0.06, interactive: false }).addTo(gThreats);
        if (row.pred.ok && !row.far) {
          const end = destination(row.pred.here, row.pred.bearing, row.pred.horizonKm);
          if (row.pred.timed && TYPES[t.type].kind === "slow") {
            const c = coneOutline(row.pred);
            L.polygon([...c.left, ...c.right.reverse()].map((p) => [p.lat, p.lon]), { stroke: false, fillColor: col, fillOpacity: 0.13, interactive: false }).addTo(gThreats);
          }
          L.polyline([[here.lat, here.lon], [end.lat, end.lon]], { color: col, weight: 2.5, dashArray: row.pred.timed ? "8 6" : "2 8", opacity: row.pred.timed ? 0.9 : 0.6, interactive: false }).addTo(gThreats);
          row.pred.marks.filter((k) => k.minutes <= 30).forEach((k) => L.circleMarker([k.lat, k.lon], { radius: 4, color: "#fff", weight: 1, fillColor: col, fillOpacity: 1, interactive: false }).bindTooltip(`+${k.minutes} min`, { permanent: idx < 4, direction: "right", className: "thr-tip", offset: [6, 0] }).addTo(gThreats));
          if (row.pred.advancedKm > 1) L.circleMarker([t.lat, t.lon], { radius: 3, color: col, weight: 1.5, fillOpacity: 0, interactive: false }).addTo(gThreats);
        }
        const mk = L.marker([here.lat, here.lon], { icon: threatIcon(L, row), keyboard: false, zIndexOffset: 500 }).bindPopup(popupHtml(row, demo), { autoClose: false, closeOnClick: false, autoPan: true, maxWidth: 300 }).addTo(gThreats);
        mk.on("click", () => { openId = String(t.id); });
        if (openId === String(t.id)) { const pp = mk.getPopup(); const ap = pp.options.autoPan; pp.options.autoPan = false; mk.openPopup(); pp.options.autoPan = ap; }
      });
      redrawing = false;
      if (!fitDone && view.rows.length) {
        fitDone = true;
        const bnd = map.getBounds();
        if (!view.rows.some((r) => bnd.contains([(r.pred.ok ? r.pred.here : r.t).lat, (r.pred.ok ? r.pred.here : r.t).lon]))) {
          const pts = view.rows.map((r) => [(r.pred.ok ? r.pred.here : r.t).lat, (r.pred.ok ? r.pred.here : r.t).lon]);
          map.fitBounds(pts, { padding: [30, 30], maxZoom: 7 });
        }
      }
      if (openId != null && !view.rows.some((r) => String(r.t.id) === openId)) openId = null; // obiekt zniknął z danych
    }

    function startFeed() {
      if (demo || feed) return;
      feed = createFeed({ alertsUrl: CONFIG.neptun.alertsUrl, extrasMs: CONFIG.neptun.extrasMs, restUrl: CONFIG.neptun.restUrl, wsUrl: CONFIG.neptun.wsUrl, pollMs: CONFIG.neptun.pollMs, onChange: scheduleRefresh, onStatus: scheduleRefresh });
      cleanups.push(() => { feed?.stop(); feed = null; });
      feed.start();
    }
    function stopFeed() { if (feed) { feed.stop(); feed = null; } }

    $("lyNeptun")?.addEventListener("change", (e) => {
      if (e.target.checked) {
        if (st().consent?.neptun === true) { ml().neptun = true; ctx.save(); startFeed(); refresh(); }
        else { e.target.checked = false; $("nepConsent").hidden = false; $("nepYes").focus(); }
      } else { ml().neptun = false; ctx.save(); stopFeed(); refresh(); }
    });
    $("nepYes")?.addEventListener("click", () => {
      (st().consent ||= {}).neptun = true; ml().neptun = true; ctx.save();
      $("nepConsent").hidden = true; $("lyNeptun").checked = true; startFeed(); refresh();
    });
    $("nepNo")?.addEventListener("click", () => { $("nepConsent").hidden = true; });
    $("nepNear")?.addEventListener("change", (e) => { ml().nepNear = e.target.checked; ctx.save(); refresh(); });
    document.querySelectorAll("[data-nf]").forEach((b) => b.addEventListener("click", () => {
      nepFilter = b.dataset.nf;
      document.querySelectorAll("[data-nf]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      refresh();
    }));
    $("btnObjects")?.addEventListener("click", () => {
      const pts = lastRows.map((r) => [(r.pred.ok ? r.pred.here : r.t).lat, (r.pred.ok ? r.pred.here : r.t).lon]);
      if (user) pts.push([user.lat, user.lon]);
      if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 9 });
    });

    if (neptunWanted()) startFeed();
    refresh();
    timer = setInterval(refresh, 5000);
    cleanups.push(() => { clearInterval(timer); if (pending) clearTimeout(pending); });
  }).catch((e) => {
    console.error("EGIDA mapa:", e);
    if (!dead && root) root.innerHTML = `<p class="note warn" style="margin:16px">Nie udało się załadować mapy (brak internetu?). Schrony zapisane w telefonie znajdziesz w zakładce Schrony.</p>`;
  });
  return screen;
}
