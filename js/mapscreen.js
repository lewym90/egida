// Ekrany „Mapa zagrożeń” i „Schrony i ukrycia”. Leaflet ładujemy dopiero po wejściu na ekran z mapą.
// Zasady: pozycja użytkownika zostaje w pamięci przeglądarki (nigdzie jej nie wysyłamy); obiekty NEPTUN
// są nieoficjalne, domyślnie wyłączone i włączane świadomą zgodą; brak świeżych danych ⇒ „brak danych”, nigdy „spokojnie”.
import { CONFIG } from "./config.js";
import { createFeed } from "./neptun-feed.js";
import { ThreatStore, buildView, coneOutline, fmtKmPl, ageText, TYPES, LIMITS } from "./neptun.js";
import { compassPl, destination } from "./geo.js";
import { demoThreats, DEMO_USER } from "./demo.js";
import { dirUrl, loadShelterDb } from "./shelters.js";

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
  let i = 0, ok = 0, bad = 0;
  const layer = L.tileLayer(urls[0], { attribution: c.attribution, maxZoom: c.maxZoom ?? 18, maxNativeZoom: c.maxNativeZoom, subdomains: c.subdomains || "abc" });
  // Gdy żaden kafelek się nie wczytuje (np. zły adres lub awaria dostawcy), próbujemy kolejnego adresu, a na końcu zgłaszamy błąd.
  layer.on("tileload", () => { ok++; });
  layer.on("tileerror", () => {
    bad++;
    if (ok === 0 && bad >= 4) {
      bad = 0;
      if (i + 1 < urls.length) { i++; layer.setUrl(urls[i]); } else if (onFail) { const f = onFail; onFail = null; f(key); }
    }
  });
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
  <p id="tileMsg" class="note warn" hidden role="status"></p>
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
    const failNote = (k) => { const n = $("tileMsg"); if (n) { n.hidden = false; n.textContent = `Podkład „${(CONFIG.tiles[k] || {}).name || k}” nie odpowiada. Wybierz inny albo spróbuj później.`; } };
    let baseL = baseLayer(L, st().map.base || "map", failNote).addTo(map);
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
        user = p; drawUser(); $("locMsg").textContent = "";
        if (firstFix) { map.setView([p.lat, p.lon], Math.max(map.getZoom(), 8)); firstFix = false; }
        scheduleRefresh();
      }, () => { $("locMsg").textContent = "Nie udało się ustalić pozycji. Sprawdź, czy lokalizacja jest włączona i dozwolona dla tej strony."; }, true);
    });
    $("btnBorder")?.addEventListener("click", () => map.fitBounds([[49.0, 21.6], [54.6, 24.6]]));

    /* schrony na mapie */
    let dbItems = [];
    const drawShelters = () => {
      gShelters.clearLayers();
      if (ml().shelters === false) return;
      const mine = st().shelters || [];
      const osm = dbItems;
      const pop = (s, kind, extra) => `<div class="pop"><b>${esc(s.name)}</b><br><span class="small muted">${kind}</span>${extra || ""}<p class="small" style="margin:6px 0"><a href="${esc(dirUrl(s, "walking"))}" target="_blank" rel="noopener noreferrer">Trasa pieszo</a> · <a href="${esc(dirUrl(s, "driving"))}" target="_blank" rel="noopener noreferrer">Autem</a></p></div>`;
      for (const s of osm) L.marker([s.lat, s.lon], { icon: shelterIcon(L, false), keyboard: false }).bindPopup(pop(s, "OpenStreetMap · niezweryfikowane", s.access ? `<br><span class="small">Dostęp: ${esc(s.access)}</span>` : "")).addTo(gShelters);
      for (const s of mine) L.marker([s.lat, s.lon], { icon: shelterIcon(L, true), keyboard: false }).bindPopup(pop(s, "Twoje miejsce", s.how ? `<br><span class="small">Jak wejść: ${esc(s.how)}</span>` : "")).addTo(gShelters);
    };
    drawShelters();
    if (!demo) loadShelterDb(CONFIG.sheltersUrl).then((db) => { if (db && !dead) { dbItems = db.items; drawShelters(); } }).catch(() => {});
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
