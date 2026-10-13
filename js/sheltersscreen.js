// Ekran „Pomoc w pobliżu” (schrony, defibrylatory AED, szpitale): lista najbliższych miejsc z czasem dojścia, mini-mapa, opis „Jak wejść”, własne miejsca.
// Źródła: baza z OpenStreetMap (publikowana przez serwer EGIDA, niezweryfikowana), „Moje miejsca” (tylko w telefonie)
// i tryb demonstracyjny (#/schrony/demo, dane wymyślone). Pozycja użytkownika zostaje w pamięci przeglądarki.
import { CONFIG } from "./config.js";
import { fmtKmPl } from "./neptun.js";
import { DEMO_USER } from "./demo.js";
import { PSP_URL, nearest, withDistance, walkMin, dirUrl, makeShelter, loadShelterDb, loadPspAround, loadPspNearest, makePspCache, mergeSources } from "./shelters.js";
import { haversineKm } from "./geo.js";
import { loadMedicalDb } from "./medical.js";

const RADIUS_KM = 50, SHOW = 5; // szukamy w promieniu 50 km, na liście pokazujemy 5 najbliższych
import { esc, loadLeaflet, baseLayer, shelterIcon, getUser, locate, setActive, destroyScreens, fmtDt } from "./mapscreen.js";

/** Wymyślone obiekty do podglądu wyglądu ekranu (nie są to prawdziwe schrony). */
export function demoShelters(pos = DEMO_USER) {
  const at = (dLat, dLon) => ({ lat: pos.lat + dLat, lon: pos.lon + dLon });
  return [
    { id: "d1", ...at(0.0013, 0.0009), name: "Schron przy ul. Przykładowej 12", kind: "schron", capacity: "120", level: "−1", access: "", hours: "", addr: "ul. Przykładowa 12", src: "demo",
      how: "Wejście od strony podwórka, stalowe drzwi obok wiaty śmietnikowej. Schody w dół na poziom −1, dalej korytarzem w prawo. Bez windy, schody o szerokości ok. 1 m.", osmUrl: "" },
    { id: "d2", ...at(-0.0030, 0.0042), name: "Parking podziemny, [adres]", kind: "ukrycie", src: "demo", how: "", capacity: "", level: "", access: "", hours: "", addr: "", osmUrl: "" },
    { id: "d3", ...at(0.0049, -0.0043), name: "Piwnica budynku, [adres]", kind: "ukrycie", src: "demo", how: "", capacity: "", level: "", access: "", hours: "", addr: "", osmUrl: "" },
    { id: "d4", ...at(0.011, 0.012), name: "Przejście podziemne, [adres]", kind: "ukrycie", src: "demo", how: "", capacity: "", level: "", access: "", hours: "", addr: "", osmUrl: "" },
  ];
}

const fmtDist = (km) => (km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : fmtKmPl(km));
const FILTERS = [["schrony", "Schrony"], ["aed", "Defibrylatory AED"], ["szpitale", "Szpitale"], ["mine", "Moje miejsca"]];
const MODES = FILTERS.map((f) => f[0]);
const srcLabel = (s) => (s.mine ? "zgłoszenie użytkownika (Ty)" : s.src === "demo" ? "dane wymyślone (demo)" : s.src === "psp" ? "Rejestr Punktów Schronienia (PSP)" : "OpenStreetMap, wpis społeczności");
const hospitalIcon = (L, sor) => L.divIcon({
  className: "sh-ic", iconSize: [30, 30], iconAnchor: [15, 15],
  html: `<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="${sor ? "#6A1B9A" : "#7E57A8"}" stroke="#fff" stroke-width="2"/><path d="M13 7h4v6h6v4h-6v6h-4v-6H7v-4h6z" fill="#fff"/></svg>`,
});
const kindLabel = (s) => (s.kind === "aed" ? "Defibrylator AED" : s.kind === "szpital" ? (s.sor ? "Szpital z SOR" : "Szpital") : s.mine ? "Twoje miejsce" : s.src === "psp" ? "Punkt schronienia" : s.kind === "ukrycie" ? "Miejsce ukrycia" : "Schron");

export function renderSheltersHtml(ctx, { demo = false, mode = "schrony" } = {}) {
  if (!MODES.includes(mode)) mode = "schrony";
  return `<div class="hero"><div class="row" style="align-items:flex-start"><div style="flex:1"><h1>Pomoc w pobliżu</h1><p>Schrony, defibrylatory AED i szpitale najbliżej Twojej lokalizacji.</p></div>${demo ? `<span class="badge unofficial">Dane przykładowe</span>` : ""}</div></div>
  ${demo ? `<div class="demo-banner"><b>TRYB DEMONSTRACYJNY – DANE WYMYŚLONE.</b> Ten ekran pokazuje, jak będzie wyglądała lista schronów. Obiekty są sztuczne i nie istnieją. <a href="#/schrony">Wyjdź z trybu demo</a></div>` : ""}
  <div id="shGate" class="card" hidden><h2>Gdzie jesteś?</h2><p class="muted small">Żeby pokazać najbliższe miejsca, potrzebna jest Twoja pozycja z GPS. Zostaje w tym telefonie i nigdzie nie jest wysyłana. Włącz lokalizację w telefonie i dotknij przycisku poniżej.</p>
    <button class="btn primary" id="shLocate">${ctx.I.pin}Użyj mojej pozycji</button><p id="shLocMsg" class="muted small" aria-live="polite"></p></div>
  <div class="row" id="shChips" style="flex-wrap:wrap;margin:10px 0" role="group" aria-label="Filtr listy">${FILTERS.map(([k, n]) => `<button class="chip" data-f="${k}" aria-pressed="${k === mode}">${n}</button>`).join("")}</div>
  <div id="shMap" class="map map-sm" role="region" aria-label="Mapa najbliższych miejsc pomocy. Te same obiekty są wypisane w liście poniżej."><p class="muted" style="padding:12px">Ładuję mapę…</p></div>
  <p id="shTileMsg" class="note warn" hidden role="status"></p>
  <p id="shMapHint" class="muted small" aria-live="polite" style="margin:6px 2px"></p>
  <p id="shLive" class="muted small" aria-live="polite" style="margin:6px 2px"></p>
  <div id="shStatus" aria-live="polite"></div>
  <div id="shFeat"></div>
  <ul class="list shlist" id="shList"></ul>
  <p id="shMeta" class="src"></p>
  <details id="addBox" class="card acc" ${mode === "aed" || mode === "szpitale" ? "hidden" : ""} style="margin-top:12px;padding:0"><summary>Dodaj własne miejsce<span class="muted">${ctx.I.chev}</span></summary>
    <div class="body"><p class="muted small">Zapisz miejsce blisko domu lub pracy, np. piwnicę, i dopisz, jak tam wejść. Zapis jest tylko w tym telefonie i działa bez internetu.</p>
      <div class="field"><label for="shName"><b>Nazwa</b></label><input class="sel" id="shName" maxlength="60" placeholder="np. Piwnica w bloku, klatka B" autocomplete="off"></div>
      <div class="field" style="margin-top:10px"><label for="shHow"><b>Jak wejść</b> <span class="muted small">(opcjonalnie)</span></label><textarea class="sel" id="shHow" rows="3" maxlength="400" style="padding:10px 12px;min-height:84px" placeholder="np. schody w dół przy windzie, klucz u administratora"></textarea></div>
      <p class="muted small" style="margin-top:10px"><b>Miejsce:</b> dotknij mapy u góry ekranu albo użyj swojej pozycji. <span id="pickInfo">Nie wskazano.</span></p>
      <div class="grid2" style="margin-top:10px"><button class="btn" id="shUseMe">Moja pozycja</button><button class="btn primary" id="shSave">Zapisz miejsce</button></div>
      <p id="shErr" class="small" style="color:var(--danger-ink)" role="alert"></p></div></details>
  <p id="shNote" class="muted small" style="margin-top:12px"></p>
  <p class="muted small" style="margin-top:12px">Punkty schronienia pochodzą z publicznego Rejestru Punktów Schronienia (MSWiA / Państwowa Straż Pożarna, ${PSP_URL.replace("https://", "")}) i uzupełniająco z OpenStreetMap (© współtwórcy OpenStreetMap, ODbL). EGIDA nie jest aplikacją PSP; dane bywają niepełne lub nieaktualne. Punkt schronienia to istniejący obiekt, który zwiększa bezpieczeństwo, ale nie daje prawa wstępu tam, gdzie obowiązują ograniczenia: dostępność podajemy tak, jak w rejestrze.</p>`;
}

export function initSheltersScreen(ctx, { demo = false, mode = "schrony" } = {}) {
  destroyScreens();
  if (!document.getElementById("shList")) return;
  let dead = false;
  const cleanups = [];
  setActive({ destroy() { dead = true; cleanups.forEach((f) => { try { f(); } catch { /* */ } }); cleanups.length = 0; } });
  const $ = (id) => document.getElementById(id);
  const st = () => ctx.state;
  let pos = demo ? DEMO_USER : getUser();
  let db = demo ? { items: demoShelters(), source: "demo", at: "", count: 4, stale: false } : null; // OSM (lub demo)
  let pspItems = [], pspIdx = null, pspState = demo ? "ok" : "idle"; // idle | loading | ok | none
  const pspMemo = new Map(), pspCache = demo ? null : makePspCache(CONFIG.pspUrl);
  let pspSeq = 0;
  let filter = MODES.includes(mode) ? mode : "schrony", openHow = new Set(), pick = null;
  let L = null, map = null, gMarks = null, gUser = null, pmarker = null;

  const med = { aed: null, szpitale: null }, medState = { aed: demo ? "ok" : "idle", szpitale: demo ? "ok" : "idle" }; // null = jeszcze niewczytane
  const isMed = () => filter === "aed" || filter === "szpitale";
  const radius = () => (demo ? 150 : filter === "szpitale" ? 100 : RADIUS_KM);
  const mineList = () => (st().shelters || []).map((s) => ({ ...s, kind: "moje", mine: true, src: "mine" }));
  const all = () => {
    if (filter === "aed") return med.aed?.items || [];
    if (filter === "szpitale") return med.szpitale?.items || [];
    if (filter === "mine") return mineList();
    return [...mineList(), ...mergeSources(pspItems, db?.items || [])];
  };
  const ensureMed = (k) => {
    if (demo || med[k] || medState[k] === "loading") return;
    medState[k] = "loading"; draw();
    loadMedicalDb(k, k === "aed" ? CONFIG.aedUrl : CONFIG.hospitalsUrl).then((d) => { if (dead) return; med[k] = d; medState[k] = d ? "ok" : "none"; draw(); }).catch(() => { if (!dead) { medState[k] = "none"; draw(); } });
  };

  const dist = (s) => `<b class="shdist">${esc(fmtDist(s.distKm))}${s.kind === "szpital" && s.distKm > 3 ? "" : ` · ${walkMin(s.distKm)} min pieszo`}</b>`;
  const howTitle = () => "Jak wejść";
  // Układ jak przy schronach: tytuł = adres (AED) / nazwa (szpital), szara plakietka = rodzaj obiektu, obok krótkie informacje; opis miejsca w niebieskiej ramce.
  const GENERIC = new Set(["Defibrylator AED", ""]);
  const titleOf = (s) => (s.kind === "aed" ? s.addr || (GENERIC.has(s.name) ? "Defibrylator AED" : s.name) : s.name);
  const badgeOf = (s) => (s.kind === "aed" ? s.obj || (GENERIC.has(s.name) || s.name === titleOf(s) ? "Defibrylator AED" : s.name) : kindLabel(s));
  const approx = (s) => (s.addr && (s.addrD > 15 || s.addrD < 0) ? "adres orientacyjny (najbliższy budynek w OSM)" : "");
  const howBox = (s) => s.kind === "szpital" ? "" : s.how ? `<div class="howbox" id="how-${esc(s.id)}">${s.kind === "aed" ? "" : `<b>${howTitle(s)}</b>`}<p${s.kind === "aed" ? ` style="margin:0;font-weight:600"` : ""}>${esc(s.how)}</p>${s.kind === "aed" ? "" : `<p class="src">Źródło opisu: ${esc(srcLabel(s))}</p>`}</div>` : "";
  const meta = (s) => (s.kind === "aed"
    ? [s.indoor && "wewnątrz budynku", s.level && `poziom ${esc(s.level)}`, s.access && `dostęp: ${esc(s.access)}`, s.hours && `godziny: ${esc(s.hours)}`, s.checked && `sprawdzono: ${esc(s.checked)}`, !s.addr && "adres: brak w OSM", !s.how && "opis miejsca: brak w OSM", approx(s) && esc(approx(s))]
    : s.kind === "szpital"
      ? [s.addr ? esc(s.addr) : "adres: brak w OSM", s.phone && `tel. <a href="tel:${esc(s.phone.replace(/[^\d+]/g, ""))}">${esc(s.phone)}</a>`, approx(s) && esc(approx(s))]
      : [s.mine ? "zapisane w telefonie" : "", s.capacity && `ok. ${esc(s.capacity)} osób`, s.level && `poziom ${esc(s.level)}`, s.access && `dostęp: ${esc(s.access)}`, s.hours && `godziny: ${esc(s.hours)}`, s.addr && esc(s.addr)]
  ).filter(Boolean).join(" · ");
  const btns = (s, feat) => `<div class="shbtns"><a class="btn primary sm" href="${esc(dirUrl(s, "walking"))}" target="_blank" rel="noopener noreferrer">Pieszo</a><a class="btn primary sm" href="${esc(dirUrl(s, "driving"))}" target="_blank" rel="noopener noreferrer">Autem</a>${
    s.how && s.kind !== "aed" ? `<button class="btn sm howbtn" data-how="${esc(s.id)}" aria-expanded="${feat || openHow.has(s.id)}">${howTitle(s)}</button>` : (s.kind === "aed" || s.kind === "szpital") ? "" : `<span class="btn sm disabled" aria-disabled="true">Brak opisu wejścia</span>`}${s.mine ? `<button class="btn sm" data-del="${esc(s.id)}" aria-label="Usuń miejsce ${esc(s.name)}">Usuń</button>` : ""}</div>`;
  const kindBadge = (s) => `<span class="badge ${s.mine || s.sor ? "ok" : "soon"}">${esc(badgeOf(s))}</span>`;

  const draw = () => {
    if (dead) return;
    $("shGate").hidden = !!pos;
    const list = pos ? nearest(all(), pos, { maxKm: radius(), limit: 400 }) : [];
    const shown = list;
    const feat = shown[0], rest = shown.slice(1, SHOW);
    const MED_NAME = { aed: "defibrylatorów AED", szpitale: "szpitali" };
    let status = "";
    if (isMed()) {
      const ms = medState[filter];
      if (!pos) status = "";
      else if (demo) status = `<div class="note neutral">W trybie demonstracyjnym nie ma przykładowych ${MED_NAME[filter]}. <a href="#/schrony">Wyjdź z trybu demo</a>.</div>`;
      else if (ms === "loading" || ms === "idle") status = `<p class="muted">Wczytuję listę ${MED_NAME[filter]}…</p>`;
      else if (ms === "none") status = `<div class="note warn"><b>Nie udało się wczytać listy ${MED_NAME[filter]}</b> (brak internetu albo dane jeszcze nie zostały opublikowane). Wcześniej pobrana kopia w telefonie nie jest dostępna. Możesz ją pobrać z internetem w Ustawieniach → „Na wypadek braku internetu”.</div>`;
      else if (!shown.length) status = `<div class="note neutral">W promieniu ${radius()} km nie ma ${MED_NAME[filter]} w bazie. <b>To nie znaczy, że ich nie ma</b>: dane z OpenStreetMap bywają niepełne.${filter === "aed" ? " W nagłym wypadku zadzwoń pod 112 – dyspozytor wskaże najbliższy defibrylator." : ""}</div>`;
      else if (med[filter]?.stale) status = `<div class="note warn">Pokazuję kopię danych zapisaną w telefonie (brak internetu). Może być nieaktualna.</div>`;
      else if (feat.distKm > 5) status = `<div class="note neutral">Najbliższy punkt w bazie jest ${esc(fmtKmPl(feat.distKm))} od Ciebie. Bliżej mogą być miejsca, których w bazie nie ma.</div>`;
    }
    else if (!pos) status = "";
    else if (pspState === "loading" && !shown.length) status = `<p class="muted">Wczytuję punkty schronienia z Twojej okolicy…</p>`;
    else if (pspState === "none" && !shown.length) status = `<div class="note warn"><b>Nie udało się wczytać punktów schronienia</b> (brak internetu albo dane jeszcze nie zostały opublikowane). Brak danych nie oznacza, że schronów nie ma. Oficjalna mapa PSP: <a href="${PSP_URL}" target="_blank" rel="noopener noreferrer">${PSP_URL.replace("https://", "")}</a>.</div>`;
    else if (filter === "mine" && !shown.length) status = `<div class="note neutral">Nie masz jeszcze zapisanych miejsc. Dodaj własne miejsce poniżej (np. piwnicę w bloku) – zostanie tylko w tym telefonie.</div>`;
    else if (!shown.length) status = `<div class="note neutral">W promieniu ${RADIUS_KM} km nie ma punktów w rejestrze. <b>To nie znaczy, że nie ma schronów</b>: rejestr może być niepełny. Sprawdź oficjalną mapę PSP: <a href="${PSP_URL}" target="_blank" rel="noopener noreferrer">${PSP_URL.replace("https://", "")}</a> albo dodaj własne miejsce poniżej.</div>`;
    else if (pspState === "none") status = `<div class="note warn">Nie wszystkie dane z okolicy udało się wczytać (brak internetu?). Lista może być niepełna.</div>`;
    else if (feat.distKm > 5 && !demo) status = `<div class="note neutral">Najbliższy punkt w rejestrze jest ${esc(fmtKmPl(feat.distKm))} od Ciebie. <b>Bliżej mogą być miejsca, których w rejestrze nie ma</b>. Oficjalna mapa PSP: <a href="${PSP_URL}" target="_blank" rel="noopener noreferrer">${PSP_URL.replace("https://", "")}</a>.</div>`;
    $("shStatus").innerHTML = status;
    $("shFeat").innerHTML = feat ? `<article class="shfeat" aria-label="Najbliższe miejsce"><div class="row"><span class="badge ok">Najbliższy</span><span class="spacer"></span>${dist(feat)}</div>
      <h2 style="margin:8px 0 2px">${esc(titleOf(feat))}</h2><p class="muted small" style="margin:0 0 8px">${kindBadge(feat)} ${meta(feat)}</p>${howBox(feat)}${btns(feat, true)}</article>` : "";
    $("shList").innerHTML = rest.map((s) => `<li class="shitem"><div class="row"><b style="font-family:var(--font-h)">${esc(titleOf(s))}</b><span class="spacer"></span>${dist(s)}</div>
      <p class="muted small" style="margin:2px 0 6px">${kindBadge(s)} ${meta(s)}</p><div id="hw-${esc(s.id)}" ${openHow.has(s.id) || s.kind === "aed" ? "" : "hidden"}>${howBox(s)}</div>${btns(s, false)}</li>`).join("");
    const parts = [];
    if (pspIdx) parts.push(`Rejestr Punktów Schronienia (MSWiA / PSP): ${esc(String(pspIdx.count))} punktów w Polsce${pspIdx.builtAt ? `, stan z ${esc(fmtDt(pspIdx.builtAt))}` : ""}`);
    if (db?.count) parts.push(`OpenStreetMap: ${esc(String(db.count))} wpisów, niezweryfikowane${db.stale ? " (kopia z telefonu)" : ""}`);
    if (isMed()) { const m = med[filter]; parts.length = 0; if (m) parts.push(`OpenStreetMap: ${esc(String(m.count))} ${filter === "aed" ? "defibrylatorów" : "szpitali"}${m.at ? `, stan z ${esc(fmtDt(m.at))}` : ""}, niezweryfikowane${m.stale ? " (kopia z telefonu)" : ""}`); }
    $("shMeta").innerHTML = demo ? "" : parts.length ? "Źródła: " + parts.join("; ") + "." : "";
    if (!demo && filter === "schrony" && feat && feat.distKm != null) { try { sessionStorage.setItem("egida.nearest", JSON.stringify({ min: walkMin(feat.distKm), t: Date.now() })); } catch { /* tryb prywatny */ } }
    const NOTE = { aed: "Defibrylatory (AED) pochodzą z OpenStreetMap (© współtwórcy OpenStreetMap, ODbL) i są wpisywane przez społeczność, więc urządzenie mogło zostać zdjęte, a budynek może być zamknięty. <b>Przy zatrzymaniu krążenia najpierw zadzwoń pod 112</b> – dyspozytor poprowadzi resuscytację i wskaże najbliższy AED. Podczas rozmowy poproś kogoś, żeby po niego pobiegł.", szpitale: "Szpitale pochodzą z OpenStreetMap (© współtwórcy OpenStreetMap, ODbL); „Szpital z SOR” oznacza wpis z całodobową pomocą w nagłych przypadkach, ale wpisy bywają niepełne. <b>W zagrożeniu życia dzwoń pod 112</b> – dyspozytor wybierze właściwy szpital. Aktualne kolejki w SOR sprawdzisz na oficjalnej stronie pacjent.gov.pl (szukaj: SOR).", mine: "", schrony: "" };
    $("shNote").innerHTML = NOTE[filter] || "";
    $("shNote").hidden = !NOTE[filter];
    const hideAdd = isMed(); $("addBox").hidden = hideAdd;
    drawMap();
  };

  /* ---- mapa ---- */
  const popup = (s) => `<div class="pop"><b>${esc(titleOf(s))}</b><br><span class="small muted">${[esc(badgeOf(s)), s.distKm != null ? esc(fmtDist(s.distKm)) : ""].filter(Boolean).join(" · ")}</span>${s.kind === "aed" && s.how ? `<br><span class="small"><b>${esc(s.how)}</b></span>` : ""}${s.kind === "szpital" ? `<br><span class="small">${s.addr ? esc(s.addr) : "adres: brak w OSM"}</span>${s.phone ? `<br><span class="small">tel. ${esc(s.phone)}</span>` : ""}` : ""}${s.access && s.kind !== "szpital" ? `<br><span class="small">Dostępność: ${esc(s.access)}</span>` : ""}<p class="small" style="margin:6px 0"><a href="${esc(dirUrl(s, "walking"))}" target="_blank" rel="noopener noreferrer">Trasa pieszo</a> · <a href="${esc(dirUrl(s, "driving"))}" target="_blank" rel="noopener noreferrer">Autem</a></p></div>`;
  // Rysujemy WSZYSTKIE punkty widoczne na mapie (od zoomu 12), a nie tylko najbliższe z listy.
  // Znaczniki są utrzymywane „różnicowo” (po id): nie czyścimy ich przy każdym odświeżeniu, bo to zamykało otwartą etykietę (popup).
  const marks = new Map(); let marksFilter = null, userMark = null;
  const makeMark = (x) => {
    const o = { bubblingMouseEvents: false };
    if (x.kind === "aed") return L.circleMarker([x.lat, x.lon], { ...o, renderer: canvas, radius: 9, color: "#fff", weight: 2, fillColor: "#C62828", fillOpacity: 1 });
    if (x.kind === "szpital") return L.marker([x.lat, x.lon], { icon: hospitalIcon(L, x.sor), keyboard: false, bubblingMouseEvents: false });
    if (x.mine || x.src === "osm" || x.src === "demo") return L.marker([x.lat, x.lon], { icon: shelterIcon(L, !!x.mine), keyboard: false, bubblingMouseEvents: false });
    return L.circleMarker([x.lat, x.lon], { ...o, renderer: canvas, radius: 8, color: "#fff", weight: 2, fillColor: "#2A4DA0", fillOpacity: 1 });
  };
  const drawMap = () => {
    if (!map || !L || dead) return;
    if (pos) { if (userMark) userMark.setLatLng([pos.lat, pos.lon]); else userMark = L.circleMarker([pos.lat, pos.lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#2A4DA0", fillOpacity: 1, interactive: false }).addTo(gUser); }
    else if (userMark) { gUser.clearLayers(); userMark = null; }
    const hint = $("shMapHint");
    const minZ = filter === "szpitale" ? 8 : 12;
    if (marksFilter !== filter) { gMarks.clearLayers(); marks.clear(); marksFilter = filter; }
    const want = new Map();
    if (map.getZoom() < minZ) { if (hint) hint.textContent = filter === "szpitale" ? "Przybliż mapę, aby zobaczyć szpitale. Lista poniżej pokazuje najbliższe od Ciebie." : filter === "aed" ? "Przybliż mapę (zoom 12 lub więcej), aby zobaczyć defibrylatory. Lista poniżej pokazuje najbliższe od Ciebie." : "Przybliż mapę (zoom 12 lub więcej), aby zobaczyć punkty schronienia. Lista poniżej pokazuje najbliższe od Ciebie."; }
    else {
      if (hint) hint.textContent = "";
      const bounds = map.getBounds().pad(0.1);
      const base = pos ? withDistance(all(), pos) : all().map((x) => ({ ...x, distKm: null }));
      for (const x of base) {
        if (want.size >= 1500) break;
        if (bounds.contains([x.lat, x.lon])) want.set(x.id, x);
      }
    }
    for (const [id, m] of marks) if (!want.has(id) && !m.isPopupOpen?.()) { gMarks.removeLayer(m); marks.delete(id); }
    for (const [id, x] of want) {
      let m = marks.get(id);
      if (m) { m._egx = x; continue; }
      m = makeMark(x); m._egx = x;
      m.bindPopup(() => popup(m._egx), { autoPanPadding: [30, 30] }).addTo(gMarks);
      marks.set(id, m);
    }
    $("shMap").dataset.markers = String(want.size);
    if (pos && needFit && (isMed() ? medState[filter] !== "loading" && medState[filter] !== "idle" : pspState !== "loading")) {
      needFit = false;
      const close = filter === "szpitale" ? 15 : 3;
      let near = nearest(all(), pos, { maxKm: radius(), limit: 4 }).filter((x) => x.distKm <= close);
      if (!near.length) near = nearest(all(), pos, { maxKm: radius(), limit: 1 });
      map.fitBounds(L.latLngBounds([[pos.lat, pos.lon], ...near.map((x) => [x.lat, x.lon])]).pad(0.25), { maxZoom: 16, animate: false });
    }
  };
  let canvas = null, viewTimer = null;
  const loadView = () => {
    if (demo || !map || dead || map.getZoom() < 12 || isMed()) return;
    const c = map.getCenter();
    loadPspAround(CONFIG.pspUrl, c.lat, c.lng, { cache: pspCache, memo: pspMemo }).then((r) => {
      if (dead) return;
      const before = pspItems.length;
      pspItems = [...new Map([...pspItems, ...r.items].map((x) => [x.id, x])).values()];
      if (pspItems.length !== before) drawMap();
    }).catch(() => {});
  };
  let needFit = true;

  let loadedAt = null; // pozycja, dla której ostatnio wczytano kafelki
  const loadPsp = () => {
    if (demo || !pos) return;
    loadedAt = { lat: pos.lat, lon: pos.lon };
    const seq = ++pspSeq; if (!pspItems.length) pspState = "loading"; draw();
    loadPspNearest(CONFIG.pspUrl, pos.lat, pos.lon, { maxKm: RADIUS_KM, want: SHOW, cache: pspCache, memo: pspMemo }).then((r) => {
      if (dead || seq !== pspSeq) return;
      pspItems = [...new Map([...pspItems, ...r.items].map((x) => [x.id, x])).values()];
      pspState = r.failed ? "none" : "ok"; draw();
    }).catch(() => { if (!dead && seq === pspSeq) { pspState = "none"; draw(); } });
  };
  // explicit: pierwsze ustalenie pozycji lub świadomy wybór (dotknięcie mapy, przycisk) ⇒ ustaw widok mapy; zwykła aktualizacja GPS tylko przesuwa „Ty”
  const setPos = (p, manual, explicit = true) => {
    pos = p; if (explicit) needFit = true;
    if (!loadedAt || haversineKm(loadedAt, pos) > 2) loadPsp(); else draw();
    setLive();
  };
  const setLive = () => { const el = $("shLive"); if (!el) return; el.textContent = demo ? "" : liveOn ? "● Na żywo: niebieska kropka to pozycja GPS telefonu, lista odświeża się, gdy się przemieszczasz." : ""; };
  let liveOn = false, stopWatch = null, lastTick = 0, lastTouch = 0, popupOpen = false;
  const startWatch = () => {
    stopWatch?.(); liveOn = true; let first = true;
    stopWatch = locate((p) => {
      if (dead) return;
      const now = Date.now();
      if (!first && pos && haversineKm(pos, p) < 0.015 && now - lastTick < 5000) return; // bez migotania: ignoruj drobne zmiany
      lastTick = now;
      const wasFirst = first; first = false;
      $("shLocMsg").textContent = "";
      setPos(p, false, wasFirst);
      if (wasFirst && map) map.setView([p.lat, p.lon], 15, { animate: false });
      else if (map && !popupOpen && Date.now() - lastTouch > 20000) map.panTo([p.lat, p.lon], { animate: true, duration: 0.6 }); // mapa jedzie razem z Tobą, dopóki jej nie przesuwasz palcem
    }, () => { liveOn = false; setLive(); if (!dead) $("shLocMsg").textContent = "Nie udało się ustalić pozycji GPS. Włącz lokalizację w telefonie (Ustawienia → Prywatność → Usługi lokalizacji) i dotknij „Użyj mojej pozycji”."; }, true);
    cleanups.push(() => stopWatch?.());
    setLive();
  };

  loadLeaflet().then((Lf) => {
    if (dead) return;
    L = Lf; const el = $("shMap"); el.innerHTML = ""; canvas = L.canvas({ padding: 0.3 });
    map = L.map(el, { center: pos ? [pos.lat, pos.lon] : [51.6, 22.8], zoom: pos ? 15 : 6, minZoom: 4 });
    cleanups.push(() => map.remove());
    const fail = (k) => { const n = $("shTileMsg"); if (n) { n.hidden = false; n.textContent = "Mapa podkładowa nie odpowiada. Lista poniżej działa bez niej."; } };
    baseLayer(L, "map", fail).addTo(map);
    gMarks = L.layerGroup().addTo(map); gUser = L.layerGroup().addTo(map);
    map.on("dragstart zoomstart", () => { lastTouch = Date.now(); });
    map.on("popupopen", () => { popupOpen = true; lastTouch = Date.now(); }); map.on("popupclose", () => { popupOpen = false; lastTouch = Date.now(); });
    map.on("moveend", () => { drawMap(); clearTimeout(viewTimer); viewTimer = setTimeout(loadView, 400); });
    cleanups.push(() => clearTimeout(viewTimer));
    setTimeout(() => { if (!dead) map.invalidateSize(); }, 0);
    map.on("click", (e) => {
      const p = { lat: e.latlng.lat, lon: e.latlng.lng };
      if ($("addBox").open) { setPick(p); return; }
      // Dotknięcie mapy nie zmienia Twojej pozycji: niebieska kropka to zawsze GPS telefonu.

    });
    draw();
  }).catch((e) => { console.error("EGIDA mapa schronów:", e); if (!dead) $("shMap").innerHTML = `<p class="note warn" style="margin:12px">Nie udało się załadować mapy. Lista działa bez niej.</p>`; });

  /* ---- filtry, rozwijanie opisu, usuwanie ---- */
  $("shChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    filter = b.dataset.f; needFit = true;
    if (isMed()) ensureMed(filter);
    document.querySelectorAll("#shChips [data-f]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    draw();
  });
  const onClick = (e) => {
    const h = e.target.closest("[data-how]");
    if (h) { const id = h.dataset.how; const box = $("hw-" + id); if (box) { box.hidden = !box.hidden; if (box.hidden) openHow.delete(id); else openHow.add(id); h.setAttribute("aria-expanded", String(!box.hidden)); } else { const f = document.querySelector("#shFeat .howbox"); if (f) f.hidden = !f.hidden; h.setAttribute("aria-expanded", String(!!f && !f.hidden)); } return; }
    const d = e.target.closest("[data-del]");
    if (d) { if (!confirm("Usunąć to miejsce z telefonu?")) return; st().shelters = (st().shelters || []).filter((x) => x.id !== d.dataset.del); ctx.save(); draw(); }
  };
  $("shFeat").addEventListener("click", onClick); $("shList").addEventListener("click", onClick);

  /* ---- pozycja ---- */
  const doLocate = (silent) => { if (!silent) $("shLocMsg").textContent = "Ustalam pozycję…"; startWatch(); };
  $("shLocate").addEventListener("click", () => doLocate(false));
  if (!demo && (pos || st().consent?.gps)) startWatch();

  /* ---- dodawanie własnego miejsca ---- */
  const setPick = (p) => { pick = p; $("pickInfo").textContent = `Wskazano: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`; if (map && L) { if (pmarker) pmarker.setLatLng([p.lat, p.lon]); else pmarker = L.marker([p.lat, p.lon]).addTo(map); } };
  $("shUseMe").addEventListener("click", () => {
    $("shErr").textContent = "";
    locate((p) => { if (dead) return; setPick({ lat: p.lat, lon: p.lon }); if (map) map.setView([p.lat, p.lon], 17, { animate: false }); if (!pos) setPos(p, false); }, () => { if (!dead) $("shErr").textContent = "Nie udało się ustalić pozycji. Otwórz tę sekcję i dotknij mapy u góry, aby wskazać miejsce."; }, false);
  });
  $("shSave").addEventListener("click", () => {
    const r = makeShelter({ name: $("shName").value, how: $("shHow").value, lat: pick?.lat, lon: pick?.lon });
    if (!r.ok) { $("shErr").textContent = r.error; return; }
    $("shErr").textContent = "";
    (st().shelters ||= []).push(r.shelter); ctx.save();
    $("shName").value = ""; $("shHow").value = ""; pick = null; $("pickInfo").textContent = "Zapisano. Możesz dodać kolejne miejsce.";
    if (pmarker && map) { map.removeLayer(pmarker); pmarker = null; }
    draw();
  });
  $("addBox").addEventListener("toggle", () => { if ($("addBox").open && map) { $("shMap").scrollIntoView({ block: "nearest" }); } });

  /* ---- baza ---- */
  if (!demo) {
    loadShelterDb(CONFIG.sheltersUrl).then((d) => { if (dead) return; db = d; draw(); }).catch(() => {});
    fetch(CONFIG.pspUrl + "index.json", { signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!dead && j && Number.isFinite(j.count)) { pspIdx = j; draw(); } }).catch(() => {});
    if (pos) loadPsp();
  }
  if (isMed()) ensureMed(filter);
  draw();
}
