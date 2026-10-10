// Ekrany „Mapa zagrożeń” i „Schrony i ukrycia”. Leaflet ładujemy dopiero po wejściu na ekran z mapą.
// Zasady: pozycja użytkownika zostaje w pamięci przeglądarki (nigdzie jej nie wysyłamy); obiekty NEPTUN
// są nieoficjalne, domyślnie wyłączone i włączane świadomą zgodą; brak świeżych danych ⇒ „brak danych”, nigdy „spokojnie”.
import { CONFIG } from "./config.js";
import { createFeed } from "./neptun-feed.js";
import { ThreatStore, buildView, coneOutline, fmtKmPl, ageText, TYPES, LIMITS } from "./neptun.js";
import { compassPl, destination } from "./geo.js";
import { demoThreats, DEMO_USER } from "./demo.js";
import { PSP_URL, withDistance, walkMin, dirUrl, makeShelter, fetchOsmShelters } from "./shelters.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const OSM_CACHE = "egida.osm.v1";

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
const getUser = () => lastUser;
function locate(onPos, onErr, watch) {
  if (!navigator.geolocation) { onErr(new Error("Ta przeglądarka nie obsługuje lokalizacji.")); return () => {}; }
  const ok = (p) => { lastUser = { lat: p.coords.latitude, lon: p.coords.longitude, accKm: (p.coords.accuracy || 0) / 1000 }; onPos(lastUser); };
  const opts = { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 };
  if (watch) { const id = navigator.geolocation.watchPosition(ok, onErr, opts); return () => navigator.geolocation.clearWatch(id); }
  navigator.geolocation.getCurrentPosition(ok, onErr, opts);
  return () => {};
}

let active = null;
export function destroyScreens() { if (active) { try { active.destroy(); } catch { /* */ } active = null; } }

function baseLayer(L, key) {
  const c = CONFIG.tiles[key] || CONFIG.tiles.map;
  return L.tileLayer(c.url, { attribution: c.attribution, maxZoom: c.maxZoom ?? 18, maxNativeZoom: c.maxNativeZoom, subdomains: c.subdomains || "abc" });
}
const fmtDt = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
const CONF = { low: "niska", medium: "średnia", high: "wysoka" };

/* ---------- ikony ---------- */
const shelterIcon = (L, mine) => L.divIcon({
  className: "sh-ic", iconSize: [30, 30], iconAnchor: [15, 15],
  html: `<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="${mine ? "#0B6B63" : "#2A4DA0"}" stroke="#fff" stroke-width="2"/><path d="M15 6l7 2.6v4.9c0 4.3-3 7.1-7 8.4-4-1.3-7-4.1-7-8.4V8.6z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
});
function threatIcon(L, row) {
  const t = row.t, fast = TYPES[t.type].kind === "fast";
  const col = fast ? "#8A3B00" : "#B45309"; // bursztyn/brąz: czerwień zarezerwowana dla realnego alarmu
  const op = t.advisory || t.status === "stale" || !row.pred.ok ? 0.55 : 1;
  const shape = t.headingDeg != null
    ? `<g transform="rotate(${Math.round(t.headingDeg)} 14 14)"><path d="M14 2 L24 25 L14 20 L4 25 Z" fill="${col}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g>`
    : `<circle cx="14" cy="14" r="9" fill="${col}" stroke="#fff" stroke-width="2"/>`;
  return L.divIcon({ className: "thr-ic", iconSize: [30, 30], iconAnchor: [15, 15], html: `<svg viewBox="0 0 28 28" width="30" height="30" style="opacity:${op}" aria-hidden="true">${shape}</svg>` });
}

/* ---------- opis obiektu ---------- */
function threatText(row) {
  const { t, zone, pred, ageSec } = row;
  const place = esc(t.locality || t.district || t.region || "");
  const where = zone.inPoland ? "nad terytorium Polski (wg NEPTUN)" : `ok. ${fmtKmPl(zone.distKm)} od granicy Polski (szacunek)`;
  const move = t.headingDeg != null ? `kurs ${Math.round(t.headingDeg)}° (${compassPl(t.headingDeg)})${t.speedKmh != null ? `, ok. ${Math.round(t.speedKmh)} km/h` : ", prędkość nieznana"}` : "kurs nieznany";
  const conf = t.confidence ? `pewność: ${CONF[t.confidence]}${t.sourceCount != null ? ` (${t.sourceCount} ${t.sourceCount === 1 ? "źródło" : "źródeł"})` : ""}` : "pewność nieznana";
  return `${place ? `${place} · ` : ""}${where} · ${move} · ${esc(ageText(ageSec))} · ${conf}${pred.ok && pred.advancedKm > 1 ? " · pozycja przeliczona na teraz" : ""}`;
}
function badgesHtml(row) {
  const t = row.t;
  return `<span class="badge unofficial">Nieoficjalne</span><span class="badge info">${esc(TYPES[t.type].label)}${t.count > 1 ? ` ×${esc(t.count)}` : ""}</span>${t.advisory ? '<span class="badge soon">obserwacja bez alarmu</span>' : ""}${t.status === "stale" ? '<span class="badge soon">nieaktualny wg NEPTUN</span>' : ""}`;
}
const itemHtml = (row) => `<li class="obj"><div class="meta">${badgesHtml(row)}</div>
  <p class="muted small" style="margin:6px 0 0">${threatText(row)}</p>
  <p class="assess assess-${esc(row.assess.severity)}">${esc(row.assess.text)}</p></li>`;
const popupHtml = (row, demo) => `<div class="pop">${demo ? '<b>DANE WYMYŚLONE (DEMO)</b><br>' : ""}<div class="meta">${badgesHtml(row)}</div><p class="small" style="margin:6px 0">${threatText(row)}</p><p class="small"><b>${esc(row.assess.text)}</b></p></div>`;

const NEPTUN_ATTR = `Dane o obiektach: <a href="https://neptun.in.ua/" target="_blank" rel="noopener noreferrer">Karta powitryanykh tryvoh — NEPTUN (neptun.in.ua)</a>.`;
const NEPTUN_NOTICE = "NEPTUN to nieoficjalny agregator informacji z otwartych źródeł, a nie system ostrzegania. Dane mogą być spóźnione, niepełne lub błędne. Zawsze kieruj się syrenami, Alertami RCB i poleceniami służb. W zagrożeniu życia dzwoń 112.";

/* =========================================================
   MAPA
   ========================================================= */
const nepEnabled = () => CONFIG.neptun?.enabled !== false;

export function renderMapHtml(ctx, { demo = false } = {}) {
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
    <label class="switch"><input type="checkbox" id="lyShelters" ${lay.shelters !== false ? "checked" : ""}><span><b>Schrony i ukrycia</b><span class="muted small">Twoje zapisane miejsca oraz wyniki z OpenStreetMap, jeśli je pobrano (niezweryfikowane). Oficjalna mapa PSP jest w zakładce Schrony.</span></span></label>
    ${nepEnabled() ? `<label class="switch"><input type="checkbox" id="lyNeptun" ${nepOn ? "checked" : ""} ${demo ? "disabled" : ""}><span><b>Obiekty znad Ukrainy <span class="badge unofficial">nieoficjalne · beta</span></b><span class="muted small">Drony i rakiety w pobliżu granicy wg NEPTUN. Domyślnie wyłączone. Po włączeniu przeglądarka łączy się bezpośrednio z neptun.in.ua.</span></span></label>` : ""}
  </div>
  <div id="nepConsent" class="card" hidden role="dialog" aria-label="Zgoda na połączenie z NEPTUN">
    <h2>Włączyć obiekty znad Ukrainy?</h2>
    <ul class="how2"><li>Mapa połączy się <b>bezpośrednio</b> z serwisem neptun.in.ua (zewnętrzny, prowadzony anonimowo). Serwis zobaczy Twój adres IP. EGIDA nic tam nie wysyła o Tobie.</li>
    <li>To <b>nieoficjalne</b> informacje, mogą być spóźnione, niepełne lub błędne. Nie zastępują syren ani Alertu RCB.</li>
    <li>Ocena toru względem Twojej pozycji działa tylko dla dronów, przy świeżych danych. Dla rakiet nie oceniamy toru.</li>
    <li>Możesz to wyłączyć w każdej chwili, tutaj lub w Ustawieniach.</li></ul>
    <div class="grid2" style="margin-top:10px"><button class="btn primary" id="nepYes">Włączam</button><button class="btn" id="nepNo">Nie teraz</button></div>
  </div>
  <div class="mapwrap"><div id="map" class="map" role="region" aria-label="Mapa. Obiekty i schrony są też wypisane w listach poniżej."><p class="muted" style="padding:16px">Ładuję mapę…</p></div></div>
  <div class="maptools"><button class="btn sm" id="btnLocate">${ctx.I.pin}Pokaż mnie</button><button class="btn sm" id="btnBorder">Granica wschodnia</button><button class="btn sm" id="btnObjects" hidden>Pokaż obiekty</button></div>
  <p id="locMsg" class="muted small" aria-live="polite"></p>
  <div id="nepBox" ${nepOn ? "" : "hidden"}>
    <div id="nepStatus" class="note neutral" aria-live="polite"></div>
    <h2 style="margin-top:16px">Obiekty w pobliżu granicy</h2>
    <div class="card flat"><ul class="list" id="nepList"></ul></div>
    <p class="src">${NEPTUN_ATTR}</p>
    <div class="note warn" style="margin-top:8px">${NEPTUN_NOTICE}</div>
  </div>
  <p class="src">Pozycja „Ty” jest tylko w pamięci przeglądarki i nigdzie nie jest wysyłana. Kafelki mapy pobiera Twoja przeglądarka od dostawcy mapy (zobacz Źródła i licencje).</p>`;
}

export function initMapScreen(ctx, { demo = false } = {}) {
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
    if (!st().map) st().map = { base: "map", layers: { shelters: true, neptun: false } };
    const ml = () => (st().map.layers ||= { shelters: true, neptun: false });
    const $ = (id) => document.getElementById(id);

    root.innerHTML = "";
    let user = demo ? { ...DEMO_USER } : getUser();
    const map = L.map(root, { center: [51.6, 22.8], zoom: 6, minZoom: 4, worldCopyJump: false });
    cleanups.push(() => map.remove());
    let baseL = baseLayer(L, st().map.base || "map").addTo(map);
    const gShelters = L.layerGroup().addTo(map), gThreats = L.layerGroup().addTo(map), gUser = L.layerGroup().addTo(map);
    setTimeout(() => { if (!dead) map.invalidateSize(); }, 0);

    /* podkład */
    document.querySelectorAll("[data-base]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.base; st().map.base = k; ctx.save();
      map.removeLayer(baseL); baseL = baseLayer(L, k).addTo(map); baseL.bringToBack();
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
        user = p; drawUser(); $("locMsg").textContent = "";
        if (firstFix) { map.setView([p.lat, p.lon], Math.max(map.getZoom(), 8)); firstFix = false; }
        scheduleRefresh();
      }, () => { $("locMsg").textContent = "Nie udało się ustalić pozycji. Sprawdź, czy lokalizacja jest włączona i dozwolona dla tej strony."; }, true);
    });
    $("btnBorder")?.addEventListener("click", () => map.fitBounds([[49.0, 21.6], [54.6, 24.6]]));

    /* schrony na mapie */
    const drawShelters = () => {
      gShelters.clearLayers();
      if (ml().shelters === false) return;
      const mine = st().shelters || [];
      let osm = []; try { osm = JSON.parse(localStorage.getItem(OSM_CACHE) || "null")?.items || []; } catch { /* */ }
      const pop = (s, kind, extra) => `<div class="pop"><b>${esc(s.name)}</b><br><span class="small muted">${kind}</span>${extra || ""}<p class="small" style="margin:6px 0"><a href="${esc(dirUrl(s, "walking"))}" target="_blank" rel="noopener noreferrer">Trasa pieszo</a> · <a href="${esc(dirUrl(s, "driving"))}" target="_blank" rel="noopener noreferrer">Autem</a></p></div>`;
      for (const s of osm) L.marker([s.lat, s.lon], { icon: shelterIcon(L, false), keyboard: false }).bindPopup(pop(s, "OpenStreetMap · niezweryfikowane", s.access ? `<br><span class="small">Dostęp: ${esc(s.access)}</span>` : "")).addTo(gShelters);
      for (const s of mine) L.marker([s.lat, s.lon], { icon: shelterIcon(L, true), keyboard: false }).bindPopup(pop(s, "Twoje miejsce", s.how ? `<br><span class="small">Jak wejść: ${esc(s.how)}</span>` : "")).addTo(gShelters);
    };
    drawShelters();
    $("lyShelters")?.addEventListener("change", (e) => { ml().shelters = e.target.checked; ctx.save(); drawShelters(); });

    /* NEPTUN */
    let feed = null, timer = null, pending = null, lastRows = [];
    const store = demo ? new ThreatStore() : null;
    const neptunWanted = () => nepEnabled() && (demo || (ml().neptun === true && st().consent?.neptun === true));
    const scheduleRefresh = () => { if (pending) return; pending = setTimeout(() => { pending = null; refresh(); }, 300); };
    const feedFresh = () => (demo ? true : !!feed?.isFresh());

    function refresh() {
      if (dead) return;
      const on = neptunWanted();
      $("nepBox").hidden = !on;
      gThreats.clearLayers();
      if (!on) { $("btnObjects").hidden = true; return; }
      if (demo) store.applySnapshot(demoThreats(Date.now()));
      const s = demo ? store : feed.store;
      const view = buildView(s, user, feedFresh());
      lastRows = view.rows;
      const fs = demo ? { state: "live", via: "demo" } : feed.status();
      // status źródła
      let msg, cls = "neutral";
      if (demo) { msg = "Tryb demonstracyjny: dane wymyślone, odświeżane lokalnie."; cls = "warn"; }
      else if (fs.formatWarning) { msg = "Odebrano dane NEPTUN w nieoczekiwanym formacie. Nie możemy ich pokazać. To nie znaczy, że jest bezpiecznie. Kieruj się syrenami i Alertami RCB."; cls = "warn"; }
      else if (!feed.isFresh()) {
        msg = fs.state === "connecting" ? "Łączę z NEPTUN…" : "Brak połączenia z NEPTUN. Nie wiemy, co dzieje się przy granicy. To nie znaczy, że jest bezpiecznie. Kieruj się syrenami, Alertami RCB i oficjalnymi komunikatami.";
        if (fs.state !== "connecting") cls = "warn";
      } else if (!view.rows.length) {
        msg = `W danych NEPTUN nie ma teraz obiektów w pobliżu granicy (do ${LIMITS.zoneKm} km). To nie znaczy, że jest bezpiecznie: NEPTUN może nie obejmować wszystkich kierunków (np. od strony Białorusi i Kaliningradu) ani nisko lecących obiektów.`;
      } else {
        msg = `Źródło odpowiada (${fs.via === "ws" ? "na żywo" : "odświeżanie co " + Math.round(CONFIG.neptun.pollMs / 1000) + " s"}). Obiektów w strefie: ${view.rows.length}.${view.areaOnly ? ` Pomijamy ${view.areaOnly} obserwacji bez dokładnej pozycji (tylko obwód).` : ""}`;
      }
      const dataOk = demo || (feed.isFresh() && !fs.formatWarning);
      $("nepStatus").className = "note " + cls;
      $("nepStatus").textContent = msg;
      $("nepList").innerHTML = dataOk && view.rows.length ? view.rows.slice(0, 30).map(itemHtml).join("") + (view.rows.length > 30 ? `<li class="obj muted small">…i ${view.rows.length - 30} dalszych.</li>` : "") : `<li class="obj muted">${dataOk ? "Brak obiektów." : "Brak aktualnych danych."}</li>`;
      $("btnObjects").hidden = !(dataOk && view.rows.length);
      if (!dataOk) return; // bez świeżych danych nie rysujemy nic, co mogłoby sugerować obraz sytuacji
      view.rows.forEach((row, idx) => {
        const t = row.t, col = TYPES[t.type].kind === "fast" ? "#8A3B00" : "#B45309";
        const here = row.pred.ok ? row.pred.here : { lat: t.lat, lon: t.lon };
        if (row.pred.ok) {
          const end = destination(row.pred.here, row.pred.bearing, row.pred.horizonKm);
          if (row.pred.timed && TYPES[t.type].kind === "slow") {
            const c = coneOutline(row.pred);
            L.polygon([...c.left, ...c.right.reverse()].map((p) => [p.lat, p.lon]), { stroke: false, fillColor: col, fillOpacity: 0.13, interactive: false }).addTo(gThreats);
          }
          L.polyline([[here.lat, here.lon], [end.lat, end.lon]], { color: col, weight: 2.5, dashArray: row.pred.timed ? "8 6" : "2 8", opacity: row.pred.timed ? 0.9 : 0.6, interactive: false }).addTo(gThreats);
          row.pred.marks.filter((k) => k.minutes <= 30).forEach((k) => L.circleMarker([k.lat, k.lon], { radius: 4, color: "#fff", weight: 1, fillColor: col, fillOpacity: 1, interactive: false }).bindTooltip(`+${k.minutes} min`, { permanent: idx < 4, direction: "right", className: "thr-tip", offset: [6, 0] }).addTo(gThreats));
          if (row.pred.advancedKm > 1) L.circleMarker([t.lat, t.lon], { radius: 3, color: col, weight: 1.5, fillOpacity: 0, interactive: false }).addTo(gThreats);
        }
        L.marker([here.lat, here.lon], { icon: threatIcon(L, row), keyboard: false, zIndexOffset: 500 }).bindPopup(popupHtml(row, demo)).addTo(gThreats);
      });
    }

    function startFeed() {
      if (demo || feed) return;
      feed = createFeed({ restUrl: CONFIG.neptun.restUrl, wsUrl: CONFIG.neptun.wsUrl, pollMs: CONFIG.neptun.pollMs, onChange: scheduleRefresh, onStatus: scheduleRefresh });
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

/* =========================================================
   SCHRONY
   ========================================================= */
const readOsm = () => { try { const j = JSON.parse(localStorage.getItem(OSM_CACHE) || "null"); return j && Array.isArray(j.items) ? j : null; } catch { return null; } };

export function renderSheltersHtml(ctx) {
  return `<div class="hero"><h1>Schrony i ukrycia</h1><p>Gdzie się schronić, gdy zabrzmią syreny. Zaplanuj to wcześniej, a nie w trakcie alarmu.</p></div>
  <div class="card"><span class="badge ok">Oficjalne źródło</span>
    <h2 style="margin-top:8px">Mapa PSP „Gdzie się ukryć”</h2>
    <p>Państwowa Straż Pożarna prowadzi mapę punktów schronienia: według MSWiA to ponad 70 tys. obiektów codziennego użytku, takich jak piwnice, przejścia podziemne i garaże. To najlepsze źródło, więc <b>sprawdź najbliższe miejsca już dziś</b>. Po pobraniu danych mapa działa także bez internetu.</p>
    <a class="btn primary" href="${PSP_URL}" target="_blank" rel="noopener noreferrer">Otwórz mapę PSP ${ctx.I.ext}</a>
    <p class="muted small" style="margin-top:10px">Punkt schronienia to istniejący obiekt, który zwiększa bezpieczeństwo. To nie daje prawa wstępu tam, gdzie obowiązują ograniczenia. Dostępność bywa całodobowa albo ograniczona godzinami. EGIDA nie kopiuje danych PSP.</p></div>
  <div class="card"><h2>Moje miejsca schronienia</h2>
    <p class="muted small">Zapisz 1–2 miejsca blisko domu i pracy, np. piwnicę lub parking podziemny, i dopisz, jak tam wejść. Zapis jest tylko w tym telefonie i działa bez internetu.</p>
    <div class="row" style="margin:8px 0"><button class="btn sm" id="shLocate">${ctx.I.pin}Użyj mojej pozycji (odległości)</button><span id="shLocMsg" class="muted small" aria-live="polite"></span></div>
    <ul class="list" id="myList"></ul>
    <details id="addBox" class="acc" style="border-top:1px solid var(--line-in);margin-top:8px"><summary>Dodaj miejsce<span class="muted">${ctx.I.chev}</span></summary>
      <div class="body"><div class="field"><label for="shName"><b>Nazwa</b></label><input class="sel" id="shName" maxlength="60" placeholder="np. Piwnica w bloku, klatka B" autocomplete="off"></div>
      <div class="field" style="margin-top:10px"><label for="shHow"><b>Jak wejść</b> <span class="muted small">(opcjonalnie)</span></label><textarea class="sel" id="shHow" rows="3" maxlength="400" style="padding:10px 12px;min-height:84px" placeholder="np. schody w dół przy windzie, klucz u administratora"></textarea></div>
      <p class="muted small" style="margin-top:10px"><b>Miejsce:</b> dotknij mapy albo użyj swojej pozycji. <span id="pickInfo">Nie wskazano.</span></p>
      <div id="pickMap" class="map map-sm"><p class="muted" style="padding:12px">Mapa załaduje się po otwarciu tej sekcji.</p></div>
      <div class="grid2" style="margin-top:10px"><button class="btn" id="shUseMe">Moja pozycja</button><button class="btn primary" id="shSave">Zapisz miejsce</button></div>
      <p id="shErr" class="small" style="color:var(--danger-ink)" role="alert"></p></div></details></div>
  <div class="card"><span class="badge soon">Dane społeczności · niezweryfikowane</span>
    <h2 style="margin-top:8px">Schrony z OpenStreetMap</h2>
    <p class="muted small">Wyszukamy w OpenStreetMap obiekty oznaczone jako schron przeciwlotniczy. To wpisy wolontariuszy: mogą być nieaktualne, niepełne albo błędne, więc <b>nie traktuj ich jako oficjalnego wykazu</b>. Do serwera OSM wysyłamy tylko przybliżony prostokąt wokół Ciebie (ok. 22 × 14 km), nie dokładną pozycję.</p>
    <button class="btn" id="osmGo">Szukaj w pobliżu</button>
    <div id="osmOut" aria-live="polite" style="margin-top:10px"></div></div>
  <a class="btn" href="#/mapa">Zobacz schrony na mapie</a>`;
}

export function initSheltersScreen(ctx) {
  destroyScreens();
  if (!document.getElementById("myList")) return;
  let dead = false;
  const cleanups = [];
  active = { destroy() { dead = true; cleanups.forEach((f) => { try { f(); } catch { /* */ } }); cleanups.length = 0; } };
  const $ = (id) => document.getElementById(id);
  const st = () => ctx.state;
  let pick = null;

  const drawMine = () => {
    const list = withDistance(st().shelters || [], getUser());
    $("myList").innerHTML = list.length ? list.map((s) => `<li class="msg"><h3>${esc(s.name)}</h3>
      ${s.how ? `<p class="small" style="margin:4px 0"><b>Jak wejść:</b> ${esc(s.how)}</p>` : ""}
      ${s.distKm != null ? `<p class="muted small" style="margin:4px 0">${esc(fmtKmPl(s.distKm))} w linii prostej, ok. ${walkMin(s.distKm)} min pieszo (szacunek)</p>` : ""}
      <div class="row" style="flex-wrap:wrap;margin-top:8px"><a class="btn sm" href="${esc(dirUrl(s, "walking"))}" target="_blank" rel="noopener noreferrer">Pieszo</a><a class="btn sm" href="${esc(dirUrl(s, "driving"))}" target="_blank" rel="noopener noreferrer">Autem</a><button class="btn sm" data-del="${esc(s.id)}" aria-label="Usuń miejsce ${esc(s.name)}">Usuń</button></div></li>`).join("")
      : `<li class="muted">Nie zapisano jeszcze żadnego miejsca.</li>`;
  };
  $("myList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    if (!confirm("Usunąć to miejsce z telefonu?")) return;
    st().shelters = (st().shelters || []).filter((x) => x.id !== b.dataset.del); ctx.save(); drawMine();
  });
  drawMine();

  $("shLocate").addEventListener("click", () => {
    $("shLocMsg").textContent = "Ustalam pozycję…";
    locate(() => { $("shLocMsg").textContent = "Pozycja ustalona (zostaje w telefonie)."; drawMine(); }, () => { $("shLocMsg").textContent = "Nie udało się ustalić pozycji."; }, false);
  });

  /* dodawanie z mapą do wskazania miejsca */
  let pm = null, pmarker = null;
  const setPick = (p) => { pick = p; $("pickInfo").textContent = `Wskazano: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`; if (pm && pmarker) pmarker.setLatLng([p.lat, p.lon]); else if (pm) pmarker = globalThis.L.marker([p.lat, p.lon]).addTo(pm); };
  $("addBox").addEventListener("toggle", () => {
    if (!$("addBox").open || pm || dead) return;
    loadLeaflet().then((L) => {
      if (dead || pm) return;
      const el = $("pickMap"); el.innerHTML = "";
      const u = getUser();
      pm = L.map(el, { center: u ? [u.lat, u.lon] : [51.6, 22.8], zoom: u ? 15 : 6, minZoom: 4 });
      cleanups.push(() => pm.remove());
      baseLayer(L, "map").addTo(pm);
      pm.on("click", (e) => setPick({ lat: e.latlng.lat, lon: e.latlng.lng }));
      setTimeout(() => pm.invalidateSize(), 0);
    }).catch((e) => { console.error("EGIDA mapa (wybór miejsca):", e); $("pickMap").innerHTML = `<p class="note warn" style="margin:12px">Nie udało się załadować mapy. Użyj przycisku „Moja pozycja”.</p>`; });
  });
  $("shUseMe").addEventListener("click", () => {
    $("shErr").textContent = "";
    locate((p) => { setPick({ lat: p.lat, lon: p.lon }); if (pm) pm.setView([p.lat, p.lon], 17); drawMine(); }, () => { $("shErr").textContent = "Nie udało się ustalić pozycji. Dotknij mapy, aby wskazać miejsce."; }, false);
  });
  $("shSave").addEventListener("click", () => {
    const r = makeShelter({ name: $("shName").value, how: $("shHow").value, lat: pick?.lat, lon: pick?.lon });
    if (!r.ok) { $("shErr").textContent = r.error; return; }
    $("shErr").textContent = "";
    (st().shelters ||= []).push(r.shelter); ctx.save();
    $("shName").value = ""; $("shHow").value = ""; pick = null; $("pickInfo").textContent = "Zapisano. Możesz dodać kolejne miejsce.";
    if (pmarker && pm) { pm.removeLayer(pmarker); pmarker = null; }
    drawMine();
  });

  /* OpenStreetMap (Overpass) */
  const drawOsm = (data) => {
    const items = withDistance(data.items, getUser() || { lat: (data.bbox[0] + data.bbox[2]) / 2, lon: (data.bbox[1] + data.bbox[3]) / 2 });
    const head = `<p class="muted small">Wyniki z ${esc(fmtDt(data.at))}. Dane OpenStreetMap, © współtwórcy OpenStreetMap (ODbL). Niezweryfikowane.</p>`;
    $("osmOut").innerHTML = head + (items.length
      ? `<div class="card flat"><ul class="list">${items.slice(0, 30).map((s) => `<li class="msg"><h3>${esc(s.name)}</h3>
          <p class="muted small" style="margin:2px 0">${[s.access && `dostęp: ${esc(s.access)}`, s.hours && `godziny: ${esc(s.hours)}`, s.capacity && `miejsc: ${esc(s.capacity)}`, s.level && `poziom: ${esc(s.level)}`, s.distKm != null && `ok. ${esc(fmtKmPl(s.distKm))}`].filter(Boolean).join(" · ")}</p>
          ${s.note ? `<p class="small" style="margin:2px 0">${esc(s.note)}</p>` : ""}
          <div class="row" style="flex-wrap:wrap;margin-top:6px"><a class="btn sm" href="${esc(dirUrl(s, "walking"))}" target="_blank" rel="noopener noreferrer">Pieszo</a><a class="btn sm" href="${esc(dirUrl(s, "driving"))}" target="_blank" rel="noopener noreferrer">Autem</a><a class="btn sm" href="${esc(s.osmUrl)}" target="_blank" rel="noopener noreferrer">Wpis w OSM</a></div></li>`).join("")}</ul></div>${items.length > 30 ? `<p class="muted small">Pokazano 30 najbliższych z ${items.length}.</p>` : ""}`
      : `<div class="note neutral">Brak wpisów w OpenStreetMap w tym obszarze. <b>To nie znaczy, że nie ma schronów</b>: OSM zawiera tylko to, co ktoś wpisał. Sprawdź mapę PSP powyżej.</div>`);
  };
  const cached = readOsm(); if (cached) drawOsm(cached);
  $("osmGo").addEventListener("click", () => {
    const run = (u) => {
      $("osmOut").innerHTML = `<p class="muted">Szukam…</p>`;
      fetchOsmShelters(CONFIG.overpassUrl, u.lat, u.lon).then((data) => {
        try { localStorage.setItem(OSM_CACHE, JSON.stringify(data)); } catch { /* brak miejsca */ }
        if (!dead) { drawOsm(data); drawMine(); }
      }).catch((e) => { if (!dead) $("osmOut").innerHTML = `<div class="note warn">Nie udało się pobrać danych z OpenStreetMap (${esc(e.message)}). Spróbuj później albo skorzystaj z mapy PSP.</div>`; });
    };
    const u = getUser();
    if (u) { run(u); return; }
    $("osmOut").innerHTML = `<p class="muted">Ustalam pozycję…</p>`;
    locate(run, () => { $("osmOut").innerHTML = `<div class="note warn">Do wyszukania w pobliżu potrzebna jest Twoja pozycja. Zezwól na lokalizację albo skorzystaj z mapy PSP.</div>`; }, false);
  });
}
