// Nowe ekrany (v14): Tryb zagrożenia, Plan rodziny (+ karty ICE, „Jestem bezpieczny”), Ważne miejsca, Polityka prywatności
// oraz wydruki. Wszystkie dane osobiste zostają w urządzeniu. Ekrany dostają kontekst (stan, zapis, ikony) z app.js.
import { CONFIG } from "./config.js";
import { EMERGENCY, PRIVACY, FIRST_AID, WHAT_TO_DO, PLECAK, VOIVODESHIPS } from "./content.js";
import { compose, statusOf } from "./classify.js";
import { LIMITS, BLOOD, PLACE_LABELS, emptyPlan, normalizePlan, addContact, addPerson, setPersonField, removeById, personFilled, telHref, cleanPhone, buildSafeMessage, smsHref, waHref, makePlace, normalizePlaces } from "./personal.js";
import { loadLeaflet, baseLayer, locate, setActive, destroyScreens } from "./mapscreen.js";
import { loadPspNearest, makePspCache, loadShelterDb, mergeSources, nearest, walkMin, dirUrl } from "./shelters.js";
import { fmtKmPl } from "./neptun.js";

const $ = (id) => document.getElementById(id);
const reviewLine = (E, m) => `<p class="src">Źródło: ${E(m.source)}. Ostatni przegląd: ${m.reviewed ? E(m.reviewed) : "<b>oczekuje na zatwierdzenie</b>"}.</p>`;
const regName = (id) => VOIVODESHIPS.find((v) => v.id === id)?.name || "";
const fmtDist = (km) => (km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : fmtKmPl(km));

/* ---------- udostępnianie i wydruk ---------- */
/** Udostępnia tekst przez systemowe okno „Udostępnij”; bez niego kopiuje do schowka. Zwraca "shared" | "copied" | "cancelled" | "failed". */
export async function shareText(text) {
  try { if (navigator.share) { await navigator.share({ text }); return "shared"; } } catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  try { await navigator.clipboard.writeText(text); return "copied"; } catch { /* */ }
  try {
    const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove();
    return ok ? "copied" : "failed";
  } catch { return "failed"; }
}
export const shareNote = (r) => (r === "copied" ? "Skopiowano do schowka. Wklej to w wiadomości." : r === "failed" ? "Nie udało się udostępnić. Przepisz wiadomość ręcznie." : "");

/** Otwiera okno drukowania z czystym arkuszem (bez menu aplikacji). */
export function printSheet(title, bodyHtml, note = "") {
  let el = document.getElementById("printSheet");
  if (!el) { el = document.createElement("div"); el.id = "printSheet"; document.body.appendChild(el); }
  const date = new Date().toLocaleDateString("pl-PL");
  el.innerHTML = `<h1>${title}</h1>${bodyHtml}<p class="pfoot">${note ? note + " " : ""}Wydruk z aplikacji EGIDA (nieoficjalna), ${date}. W zagrożeniu życia dzwoń 112.</p>`;
  const done = () => { document.body.classList.remove("print-sheet"); el.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  document.body.classList.add("print-sheet");
  try { window.print(); } catch { done(); }
}
const draftNote = (m) => (m.reviewed ? "" : "Wersja robocza: treść oczekuje na zatwierdzenie merytoryczne.");

export function planPrintHtml(plan, E) {
  const row = (k, v) => (v ? `<tr><th>${k}</th><td>${E(v)}</td></tr>` : "");
  const meet = [row("Najpierw (blisko domu)", plan.meet1), row("Jeśli nie wrócimy do domu", plan.meet2), row("Kontakt poza miastem", [plan.outName, plan.outPhone].filter(Boolean).join(", "))].join("");
  const contacts = plan.contacts.map((c) => `<tr><td>${E(c.name)}${c.role ? ` <span class="pmuted">(${E(c.role)})</span>` : ""}</td><td>${E(c.phone)}</td></tr>`).join("");
  const ice = plan.people.map((p) => `<section class="ice"><h3>${E(p.name)}${p.year ? ` <span class="pmuted">(rocznik ${E(p.year)})</span>` : ""}</h3><table>
    ${row("Grupa krwi", p.blood)}${row("Alergie", p.allergies)}${row("Leki stałe", p.meds)}${row("Choroby i ważne informacje", p.conditions)}${row("Kontakt alarmowy", [p.contactName, p.contactPhone].filter(Boolean).join(", "))}${row("Uwagi", p.notes)}</table></section>`).join("");
  return `${meet ? `<h2>Miejsce spotkania</h2><table>${meet}</table>` : ""}
    ${contacts ? `<h2>Kontakty</h2><table class="plist"><thead><tr><th>Kto</th><th>Telefon</th></tr></thead><tbody>${contacts}</tbody></table>` : ""}
    ${ice ? `<h2>Karty ICE (informacje dla ratowników)</h2>${ice}` : ""}
    ${!meet && !contacts && !ice ? "<p>Plan jest jeszcze pusty.</p>" : ""}`;
}
export function packPrintHtml(state, E) {
  const sec = (t, arr) => `<h2>${t}</h2><ul class="chk">${arr.map((x) => `<li>${state.checked?.[x.id] ? "☑" : "☐"} <b>${E(x.t)}</b> <span class="pmuted">${E(x.d)}</span></li>`).join("")}</ul>`;
  return sec("Na start: pięć rzeczy", PLECAK.start) + sec("Gdy masz czas", PLECAK.later) + sec("Zapas domowy na min. 3 dni", PLECAK.zapas) + sec("Dokumenty i informacje", PLECAK.dokumenty) + `<p class="pmuted">${E(PLECAK.note)}</p>`;
}
export function guidePrintHtml(E) {
  const R = FIRST_AID.rko;
  const rko = `<section class="g"><h2>Resuscytacja (RKO)</h2><ol>${R.steps.map((s) => `<li><b>${E(s.t)}.</b> ${E(s.d)}</li>`).join("")}</ol></section>`;
  const others = FIRST_AID.others.map((o) => `<section class="g"><h3>${E(o.t)}</h3><ol>${o.steps.map((s) => `<li>${E(s)}</li>`).join("")}</ol></section>`).join("");
  const todo = WHAT_TO_DO.items.map((o) => `<section class="g"><h3>${E(o.t)}</h3><ol>${o.steps.map((s) => `<li>${E(s)}</li>`).join("")}</ol></section>`).join("");
  return `<h2>Pierwsza pomoc</h2>${rko}${others}<h2>Co robić, gdy…</h2>${todo}`;
}

/* =========================================================
   TRYB ZAGROŻENIA
   ========================================================= */
function nearestMinutes() { try { const j = JSON.parse(sessionStorage.getItem("egida.nearest") || "null"); return j && Date.now() - j.t < 600000 && Number.isFinite(j.min) ? { min: j.min, ago: Math.max(0, Math.round((Date.now() - j.t) / 60000)) } : null; } catch { return null; } }

function emStatus(ctx) {
  const { I, esc: E, state } = ctx;
  if (!state.region) return `<div class="note warn"><b>Nie wybrano województwa.</b> Wybierz je na górze ekranu, żeby zobaczyć komunikaty dla swojej okolicy.</div>`;
  if (!ctx.alertsFresh()) return `<div class="note warn"><b>Brak aktualnych danych o komunikatach.</b> To nie znaczy, że jest bezpiecznie. Słuchaj syren, sprawdź Alert RCB w telefonie i oficjalne komunikaty.</div>`;
  const list = ctx.regionAlerts();
  const lvl = statusOf(list);
  if (lvl === "calm") return `<div class="note neutral"><b>Brak aktywnych ostrzeżeń</b> w znanych nam źródłach dla województwa: ${E(regName(state.region))}. Aplikacja nie zastępuje syren ani Alertu RCB.</div>`;
  const shown = list.filter((a) => (lvl === "alarm" ? a.sev === "danger" : a.sev === "important")).slice(0, 3);
  const items = shown.map((a) => { const c = compose(a); return `<li><b class="shead">${E(c.head)}</b>${c.text ? `<span class="ssub">${E(c.text)}</span>` : ""}</li>`; }).join("");
  return `<div class="status ${lvl === "alarm" ? "alert" : "warn"}"><span class="ico">${I.alert}</span><div class="sbody"><h2>${lvl === "alarm" ? "Zagrożenie" : "Ostrzeżenie"}</h2><ul class="slist">${items}</ul><a class="slink" href="#/alerty">Wszystkie komunikaty ${I.chevr}</a></div></div>`;
}

export function renderEmergency(ctx) {
  const { I, esc: E, state } = ctx;
  const plan = normalizePlan(state.plan);
  const nm = nearestMinutes();
  const steps = EMERGENCY.steps.map((s, i) => `<li><span class="dot done">${i + 1}</span><span><b>${E(s.t)}</b><br>${E(s.d)}</span></li>`).join("");
  const calls = plan.contacts.slice(0, 3).map((c) => `<a class="btn" href="${E(telHref(c.phone))}">${I.phone}Zadzwoń: ${E(c.name)}</a>`).join("");
  return `<div class="hero"><h1>Tryb zagrożenia</h1><p>Najważniejsze rzeczy na jednym ekranie. Działa bez internetu.</p></div>
  <a class="call112" href="tel:112" aria-label="Zadzwoń pod numer alarmowy 112">${I.phone}<span><b>Zadzwoń 112</b><small>Gdy ktoś jest w niebezpieczeństwie</small></span></a>
  ${emStatus(ctx)}
  <div class="card"><h2>Zrób teraz</h2><ol class="estep">${steps}</ol>${reviewLine(E, EMERGENCY)}</div>
  <div class="card"><h2>Najbliższy schron</h2>
    <p>${nm ? `Najbliżej: <b>${nm.min} min pieszo</b> <span class="muted small">(ustalone ${nm.ago === 0 ? "przed chwilą" : nm.ago + " min temu"})</span>` : "Otwórz listę schronów, aby ustalić najbliższy punkt od Twojej pozycji."}</p>
    <a class="btn primary" href="#/schrony">Pokaż schrony i trasę</a></div>
  <div class="card"><h2>Bliscy</h2>
    ${calls ? `<div class="col">${calls}</div>` : `<p class="muted">Nie zapisano jeszcze kontaktów. Uzupełnij <a href="#/plan-rodziny">Plan rodziny</a>, a tu pojawią się przyciski „Zadzwoń”.</p>`}
    <button class="btn" id="emSafe" style="margin-top:10px">${I.send}Napisz: jestem bezpieczny</button><p id="emSafeMsg" class="muted small" role="status" aria-live="polite"></p></div>
  <div class="card"><h2>Światło</h2><div class="grid2"><button class="btn" id="torchBtn" aria-pressed="false">Latarka</button><button class="btn" id="lightBtn">Ekran jako światło</button></div>
    <p id="torchMsg" class="muted small" role="status" aria-live="polite" style="margin-top:8px"></p></div>
  <a class="btn" href="#/pierwsza-pomoc">${I.heart}Pierwsza pomoc (RKO)</a>
  <div id="lightOv" class="lightov" hidden role="dialog" aria-label="Ekran świeci jako latarka. Dotknij, aby wyłączyć."><span>Dotknij ekranu, aby wyłączyć</span></div>`;
}

export function initEmergency(ctx) {
  destroyScreens();
  if (!$("emSafe")) return;
  let torch = null, wake = null;
  const stopTorch = () => { if (torch) { try { torch.stream.getTracks().forEach((t) => t.stop()); } catch { /* */ } torch = null; } const b = $("torchBtn"); if (b) { b.setAttribute("aria-pressed", "false"); b.textContent = "Latarka"; } };
  const stopLight = () => { const o = $("lightOv"); if (o) o.hidden = true; try { wake?.release?.(); } catch { /* */ } wake = null; };
  setActive({ destroy() { stopTorch(); stopLight(); } });
  $("emSafe").addEventListener("click", async () => {
    const plan = normalizePlan(ctx.state.plan);
    const r = await shareText(buildSafeMessage({ name: plan.myName }));
    $("emSafeMsg").textContent = shareNote(r);
  });
  $("torchBtn").addEventListener("click", async () => {
    const msg = $("torchMsg");
    if (torch) { stopTorch(); msg.textContent = ""; return; }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("brak");
      msg.textContent = "Proszę o dostęp do aparatu (potrzebny tylko do włączenia lampy)…";
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      const track = stream.getVideoTracks()[0];
      if (!track?.getCapabilities?.().torch) { stream.getTracks().forEach((t) => t.stop()); throw new Error("brak lampy"); }
      await track.applyConstraints({ advanced: [{ torch: true }] });
      torch = { stream }; $("torchBtn").setAttribute("aria-pressed", "true"); $("torchBtn").textContent = "Wyłącz latarkę"; msg.textContent = "Latarka włączona. Obraz z aparatu nie jest nigdzie zapisywany ani wysyłany.";
    } catch { stopTorch(); msg.textContent = "Ta przeglądarka lub telefon nie pozwala włączyć lampy ze strony (tak jest m.in. na iPhone). Użyj opcji „Ekran jako światło” albo latarki systemowej."; }
  });
  $("lightBtn").addEventListener("click", async () => {
    $("lightOv").hidden = false;
    try { wake = await navigator.wakeLock?.request?.("screen"); } catch { /* */ }
  });
  $("lightOv").addEventListener("click", stopLight);
}

/* =========================================================
   PLAN RODZINY
   ========================================================= */
const personHtml = (p, E) => `<details class="acc person" data-pid="${E(p.id)}"><summary>${E(p.name)}${personFilled(p) ? "" : ' <span class="badge soon">uzupełnij</span>'}</summary>
  <div class="body"><div class="grid2">
    <div class="field"><label class="muted small" for="pf-${E(p.id)}-year">Rocznik (opcjonalnie)</label><input class="sel" id="pf-${E(p.id)}-year" data-pf="year" inputmode="numeric" maxlength="4" value="${E(p.year)}" autocomplete="off"></div>
    <div class="field"><label class="muted small" for="pf-${E(p.id)}-blood">Grupa krwi</label><select class="sel" id="pf-${E(p.id)}-blood" data-pf="blood">${BLOOD.map((b) => `<option value="${E(b)}" ${p.blood === b ? "selected" : ""}>${b || "nie wiem / nie podaję"}</option>`).join("")}</select></div></div>
  <div class="field" style="margin-top:10px"><label class="muted small" for="pf-${E(p.id)}-allergies">Alergie</label><textarea class="sel" id="pf-${E(p.id)}-allergies" data-pf="allergies" rows="2" maxlength="200" style="min-height:64px;padding:10px 12px">${E(p.allergies)}</textarea></div>
  <div class="field" style="margin-top:10px"><label class="muted small" for="pf-${E(p.id)}-meds">Leki stałe (nazwa, dawka)</label><textarea class="sel" id="pf-${E(p.id)}-meds" data-pf="meds" rows="2" maxlength="300" style="min-height:64px;padding:10px 12px">${E(p.meds)}</textarea></div>
  <div class="field" style="margin-top:10px"><label class="muted small" for="pf-${E(p.id)}-conditions">Choroby i ważne informacje (np. cukrzyca, rozrusznik)</label><textarea class="sel" id="pf-${E(p.id)}-conditions" data-pf="conditions" rows="2" maxlength="300" style="min-height:64px;padding:10px 12px">${E(p.conditions)}</textarea></div>
  <div class="grid2" style="margin-top:10px"><div class="field"><label class="muted small" for="pf-${E(p.id)}-cn">Kontakt alarmowy (imię)</label><input class="sel" id="pf-${E(p.id)}-cn" data-pf="contactName" maxlength="60" value="${E(p.contactName)}" autocomplete="off"></div>
    <div class="field"><label class="muted small" for="pf-${E(p.id)}-cp">Telefon kontaktu</label><input class="sel" id="pf-${E(p.id)}-cp" data-pf="contactPhone" type="tel" inputmode="tel" maxlength="20" value="${E(p.contactPhone)}" autocomplete="off"></div></div>
  <div class="field" style="margin-top:10px"><label class="muted small" for="pf-${E(p.id)}-notes">Uwagi (np. nosi okulary, nie słyszy na prawe ucho)</label><textarea class="sel" id="pf-${E(p.id)}-notes" data-pf="notes" rows="2" maxlength="300" style="min-height:64px;padding:10px 12px">${E(p.notes)}</textarea></div>
  <button class="btn" data-delperson="${E(p.id)}" style="margin-top:12px">Usuń tę kartę</button></div></details>`;

const contactsHtml = (plan, E, I) => plan.contacts.length
  ? `<ul class="list ctlist">${plan.contacts.map((c) => `<li><div class="row"><div style="flex:1;min-width:0"><b style="font-family:var(--font-h)">${E(c.name)}</b>${c.role ? ` <span class="muted small">${E(c.role)}</span>` : ""}<br><span class="muted">${E(c.phone)}</span></div><a class="btn sm" href="${E(telHref(c.phone))}" aria-label="Zadzwoń: ${E(c.name)}">${I.phone}Zadzwoń</a><button class="btn sm" data-delcontact="${E(c.id)}" aria-label="Usuń kontakt ${E(c.name)}">Usuń</button></div></li>`).join("")}</ul>`
  : `<p class="muted">Nie zapisano jeszcze żadnego kontaktu.</p>`;

export function renderPlan(ctx) {
  const { I, esc: E, state } = ctx;
  const plan = normalizePlan(state.plan);
  const f = (id, label, val, extra = "") => `<div class="field"><label for="${id}"><b>${label}</b></label><input class="sel" id="${id}" data-plan="${id.replace("pl_", "")}" maxlength="160" value="${E(val)}" autocomplete="off" ${extra}></div>`;
  return `<div class="hero"><h1>Plan rodziny</h1><p>Ustal to dziś, zanim będzie potrzebne. Wszystko zapisuje się tylko w tym telefonie.</p></div>
  <div class="card"><h2>Miejsce spotkania</h2>
    <div class="col" style="gap:12px;margin-top:8px">
    ${f("pl_meet1", "Najpierw: blisko domu", plan.meet1, 'placeholder="np. przed klatką, plac przy kościele"')}
    ${f("pl_meet2", "Jeśli nie możemy wrócić do domu", plan.meet2, 'placeholder="np. mieszkanie dziadków, ul. Polna 5"')}
    <div class="grid2"><div class="field"><label for="pl_outName"><b>Kontakt poza naszym miastem</b></label><input class="sel" id="pl_outName" data-plan="outName" maxlength="60" value="${E(plan.outName)}" placeholder="imię" autocomplete="off"></div>
    <div class="field"><label for="pl_outPhone"><b>Telefon</b></label><input class="sel" id="pl_outPhone" data-plan="outPhone" type="tel" inputmode="tel" maxlength="20" value="${E(plan.outPhone)}" placeholder="+48 …" autocomplete="off"></div></div></div>
    <p class="muted small" style="margin-top:10px">Gdy sieć jest przeciążona, wszyscy z rodziny dzwonią lub piszą do jednej osoby spoza okolicy, a ona przekazuje wieści dalej.</p></div>
  <div class="card"><h2>Kontakty</h2><div id="ctBox">${contactsHtml(plan, E, I)}</div>
    <details class="acc" style="margin-top:8px" id="ctAdd"><summary>Dodaj kontakt<span class="muted">${I.chev}</span></summary><div class="body">
      <div class="field"><label for="ctName" class="muted small">Imię lub nazwa</label><input class="sel" id="ctName" maxlength="60" autocomplete="off"></div>
      <div class="grid2" style="margin-top:10px"><div class="field"><label for="ctPhone" class="muted small">Telefon</label><input class="sel" id="ctPhone" type="tel" inputmode="tel" maxlength="20" autocomplete="off"></div>
      <div class="field"><label for="ctRole" class="muted small">Kim jest (opcjonalnie)</label><input class="sel" id="ctRole" maxlength="40" placeholder="np. mama" autocomplete="off"></div></div>
      <button class="btn primary" id="ctSave" style="margin-top:12px">Zapisz kontakt</button><p id="ctErr" class="small" style="color:var(--danger-ink)" role="alert"></p></div></details></div>
  <div class="card"><h2>Karty ICE</h2><p class="muted small">ICE („in case of emergency”) to informacje, które pomogą ratownikom. Możesz je wydrukować i schować do portfela lub plecaka. <b>Nie wpisuj numeru PESEL, haseł ani numerów kart.</b></p>
    <div id="pBox" class="card flat" style="margin-top:10px">${plan.people.length ? plan.people.map((p) => personHtml(p, E)).join("") : `<p class="muted" style="padding:14px 16px">Nie dodano jeszcze żadnej karty.</p>`}</div>
    <div class="row" style="margin-top:10px;gap:8px"><input class="sel" id="pName" maxlength="60" placeholder="Imię osoby" aria-label="Imię osoby dla nowej karty" style="flex:1" autocomplete="off"><button class="btn sm" id="pAdd">Dodaj kartę</button></div>
    <p id="pErr" class="small" style="color:var(--danger-ink)" role="alert"></p></div>
  <div class="card"><h2>Jestem bezpieczny</h2><p class="muted small">Gotowa wiadomość do bliskich. Wysyłasz ją sam, swoim komunikatorem lub SMS-em. EGIDA jej nie widzi.</p>
    <div class="field" style="margin-top:8px"><label for="safeName" class="muted small">Podpis w wiadomości (opcjonalnie)</label><input class="sel" id="safeName" data-plan="myName" maxlength="40" value="${E(plan.myName)}" placeholder="np. Ania" autocomplete="off"></div>
    <div class="field" style="margin-top:10px"><label for="safeText" class="muted small">Treść (możesz zmienić)</label><textarea class="sel" id="safeText" rows="3" style="min-height:80px;padding:10px 12px"></textarea></div>
    <label class="switch" style="border:0;padding-bottom:4px"><input type="checkbox" id="safePos"><span><b>Dołącz link do mojej pozycji</b><span class="muted small">Domyślnie wyłączone. Pozycję ustalamy w telefonie, a link trafia tylko do wiadomości, którą sam wyślesz.</span></span></label>
    <div class="grid2" style="margin-top:6px"><button class="btn primary" id="safeShare">${I.send}Udostępnij</button><a class="btn" id="safeSms" href="#">SMS</a></div>
    <a class="btn" id="safeWa" href="#" target="_blank" rel="noopener noreferrer" style="margin-top:10px">WhatsApp</a>
    <p id="safeMsg" class="muted small" role="status" aria-live="polite"></p></div>
  <a class="tile" style="flex-direction:row;align-items:center;margin:12px 0" href="#/miejsca"><span class="ti t-blue">${I.pin}</span><b>Ważne miejsca: dom, praca, rodzina</b></a>
  <a class="tile" style="flex-direction:row;align-items:center;margin-bottom:12px" href="#/zagrozenie"><span class="ti t-red">${I.alert}</span><b>Tryb zagrożenia</b></a>
  <button class="btn" id="planPrint">Drukuj plan i karty ICE</button>
  <p class="src">Zapis tylko w tym urządzeniu. Wydruk jest Twoją kopią: chroń go jak dokument. Usuniesz wszystko w Ustawieniach („Usuń dane”).</p>`;
}

export function initPlan(ctx) {
  destroyScreens();
  if (!$("pBox")) return;
  const E = ctx.esc, I = ctx.I;
  const getPlan = () => { const p = normalizePlan(ctx.state.plan); ctx.state.plan = p; return p; };
  const plan = () => ctx.state.plan || getPlan();
  getPlan();
  let timer = null;
  const saveSoon = () => { clearTimeout(timer); timer = setTimeout(() => ctx.save(), 300); };
  setActive({ destroy() { clearTimeout(timer); ctx.save(); } });

  // Wiadomość „Jestem bezpieczny”
  let gen = "";
  const refreshSafe = () => { const t = $("safeText"); if (!t) return; const cur = t.value; const next = buildSafeMessage({ name: plan().myName }); if (!cur || cur === gen) t.value = next; gen = next; setLinks(); };
  const setLinks = () => { const t = $("safeText")?.value || ""; $("safeSms").href = smsHref(t); $("safeWa").href = waHref(t); };
  refreshSafe();
  $("safeText").addEventListener("input", setLinks);

  // pola planu (zapis przy wpisywaniu)
  document.querySelectorAll("[data-plan]").forEach((el) => el.addEventListener("input", () => {
    const k = el.dataset.plan, p = plan();
    p[k] = k.endsWith("Phone") ? cleanPhone(el.value) : normalizePlan({ ...p, [k]: el.value })[k];
    saveSoon(); if (k === "myName") refreshSafe();
  }));

  // kontakty
  const redrawContacts = () => { $("ctBox").innerHTML = contactsHtml(plan(), E, I); };
  $("ctSave").addEventListener("click", () => {
    const r = addContact(plan(), { name: $("ctName").value, phone: $("ctPhone").value, role: $("ctRole").value });
    if (!r.ok) { $("ctErr").textContent = r.error; return; }
    $("ctErr").textContent = ""; ctx.save(); $("ctName").value = ""; $("ctPhone").value = ""; $("ctRole").value = ""; redrawContacts(); $("ctAdd").open = false;
  });
  $("ctBox").addEventListener("click", (e) => { const b = e.target.closest("[data-delcontact]"); if (b && confirm("Usunąć ten kontakt?")) { removeById(plan().contacts, b.dataset.delcontact); ctx.save(); redrawContacts(); } });

  // karty ICE
  const redrawPeople = (openId) => {
    $("pBox").innerHTML = plan().people.length ? plan().people.map((p) => personHtml(p, E)).join("") : `<p class="muted" style="padding:14px 16px">Nie dodano jeszcze żadnej karty.</p>`;
    if (openId) { const d = document.querySelector(`[data-pid="${CSS.escape(openId)}"]`); if (d) d.open = true; }
  };
  $("pAdd").addEventListener("click", () => {
    const r = addPerson(plan(), $("pName").value);
    if (!r.ok) { $("pErr").textContent = r.error; return; }
    $("pErr").textContent = ""; $("pName").value = ""; ctx.save(); redrawPeople(r.person.id);
  });
  const onPerson = (e) => {
    const el = e.target.closest("[data-pf]"); if (!el) return;
    const id = el.closest("[data-pid]")?.dataset.pid; if (!id) return;
    setPersonField(plan(), id, el.dataset.pf, el.value); saveSoon();
  };
  $("pBox").addEventListener("input", onPerson); $("pBox").addEventListener("change", onPerson);
  $("pBox").addEventListener("click", (e) => { const b = e.target.closest("[data-delperson]"); if (b && confirm("Usunąć tę kartę ICE?")) { removeById(plan().people, b.dataset.delperson); ctx.save(); redrawPeople(); } });

  // „Jestem bezpieczny”: udostępnij / SMS / WhatsApp
  const withPos = () => new Promise((res) => {
    if (!$("safePos").checked) return res(null);
    $("safeMsg").textContent = "Ustalam pozycję…";
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    setTimeout(() => fin(null), 12000);
    locate((p) => fin({ lat: p.lat, lon: p.lon }), () => fin(null), false);
  });
  const finalText = async () => {
    let text = $("safeText").value.trim() || buildSafeMessage({ name: plan().myName });
    const pos = await withPos();
    if ($("safePos").checked) {
      if (pos) { const link = buildSafeMessage({ pos }).split("\n")[1]; if (!text.includes("openstreetmap.org")) text += "\n" + link; $("safeMsg").textContent = ""; }
      else $("safeMsg").textContent = "Nie udało się ustalić pozycji, więc wiadomość nie zawiera linku do mapy.";
    }
    return text;
  };
  $("safeShare").addEventListener("click", async () => { const t = await finalText(); const r = await shareText(t); const n = shareNote(r); if (n) $("safeMsg").textContent = n; });
  for (const id of ["safeSms", "safeWa"]) $(id).addEventListener("click", async (e) => {
    if (!$("safePos").checked) { setLinks(); return; } // bez pozycji: zwykły odsyłacz
    e.preventDefault(); const t = await finalText(); const href = id === "safeSms" ? smsHref(t) : waHref(t);
    if (id === "safeWa") window.open(href, "_blank", "noopener,noreferrer"); else location.href = href;
  });

  // wydruk
  $("planPrint").addEventListener("click", () => {
    ctx.save();
    const p = plan();
    if (p.people.length && p.people.every((x) => !personFilled(x)) && !confirm("Karty ICE są prawie puste (tylko imiona). Drukować mimo to?")) return;
    printSheet("Plan rodziny", planPrintHtml(p, E));
  });
}

/* =========================================================
   WAŻNE MIEJSCA (dom, praca, rodzina)
   ========================================================= */
export function renderPlaces(ctx) {
  const { I, esc: E } = ctx;
  return `<div class="hero"><h1>Ważne miejsca</h1><p>Dom, praca, rodzina: dla każdego miejsca pokażemy województwo, komunikaty i najbliższy punkt schronienia.</p></div>
  <div id="plList"></div>
  <div class="card"><h2>Dodaj miejsce</h2>
    <div class="grid2" style="margin-top:8px"><div class="field"><label for="plLabel" class="muted small">Rodzaj</label><select class="sel" id="plLabel">${PLACE_LABELS.map((l) => `<option>${E(l)}</option>`).join("")}</select></div>
    <div class="field"><label for="plName" class="muted small">Nazwa (opcjonalnie)</label><input class="sel" id="plName" maxlength="60" placeholder="np. mieszkanie mamy" autocomplete="off"></div></div>
    <div class="grid2" style="margin-top:12px"><button class="btn" id="plGps">${I.pin}Moja pozycja</button><button class="btn" id="plMapBtn" aria-expanded="false">Wskaż na mapie</button></div>
    <div id="plMapBox" hidden><p class="muted small" style="margin-top:10px">Dotknij mapy w miejscu, które chcesz zapisać.</p><div id="plMap" class="map map-sm" role="region" aria-label="Mapa do wskazania miejsca"><p class="muted" style="padding:12px">Ładuję mapę…</p></div></div>
    <p class="muted small" style="margin-top:10px" id="plPick">Nie wskazano miejsca.</p>
    <button class="btn primary" id="plSave" style="margin-top:6px">Zapisz miejsce</button><p id="plErr" class="small" style="color:var(--danger-ink)" role="alert"></p></div>
  <p class="src">Miejsca zapisują się tylko w tym telefonie (do ${LIMITS.places} sztuk, pozycja zaokrąglona do ok. 11 m). Aby znaleźć schron, pobieramy z internetu kafelek danych obejmujący okolicę (ok. 20 km), a nie Twoją dokładną pozycję. Województwo wskazujemy z uproszczonych granic, przy granicy województw sprawdź też sąsiednie.</p>`;
}

export function initPlaces(ctx) {
  destroyScreens();
  if (!$("plList")) return;
  const E = ctx.esc, I = ctx.I, st = () => ctx.state;
  let dead = false, pick = null, map = null, pm = null, L = null;
  const cleanups = [];
  setActive({ destroy() { dead = true; cleanups.forEach((f) => { try { f(); } catch { /* */ } }); cleanups.length = 0; } });
  st().places = normalizePlaces(st().places);
  const pspMemo = new Map(), pspCache = makePspCache(CONFIG.pspUrl);
  let osm = [];
  const info = new Map(); // id → { state: "loading" | "ok" | "none" | "empty", s: schron }

  const alertsLine = (pl) => {
    if (!pl.region) return `<span class="muted">Województwo: ustalam…</span>`;
    const name = E(regName(pl.region));
    if (!ctx.alertsFresh()) return `Województwo: <b>${name}</b>. <span class="muted">Brak aktualnych danych o komunikatach.</span>`;
    const act = ctx.alertsFor(pl.region);
    const lvl = statusOf(act);
    const badge = lvl === "alarm" ? '<span class="badge danger">Zagrożenie</span>' : lvl === "warn" ? '<span class="badge unofficial">Ostrzeżenie</span>' : '<span class="badge ok">Brak ostrzeżeń</span>';
    return `Województwo: <b>${name}</b> ${badge}${act.length ? ` <span class="muted small">(aktywnych komunikatów: ${act.length})</span>` : ""}`;
  };
  const shelterLine = (pl) => {
    const i = info.get(pl.id);
    if (!i || i.state === "loading") return `<span class="muted">Szukam najbliższego punktu schronienia…</span>`;
    if (i.state === "none") return `<span class="muted">Nie udało się wczytać punktów schronienia (brak internetu?).</span>`;
    if (i.state === "empty") return `<span class="muted">W promieniu 50 km nie ma punktów w rejestrze. To nie znaczy, że nie ma schronów.</span>`;
    const s = i.s;
    return `Najbliższy punkt schronienia: <b>${E(fmtDist(s.distKm))} · ok. ${walkMin(s.distKm)} min pieszo</b><br><span class="muted small">${E(s.name)}</span><br><a href="${E(dirUrl(s, "walking"))}" target="_blank" rel="noopener noreferrer">Trasa pieszo</a> · <a href="${E(dirUrl(s, "driving"))}" target="_blank" rel="noopener noreferrer">Autem</a>`;
  };
  const draw = () => {
    if (dead) return;
    const list = st().places;
    $("plList").innerHTML = list.length ? list.map((pl) => `<article class="card plcard" data-plid="${E(pl.id)}"><div class="row"><span class="badge ok">${E(pl.label)}</span><b style="font-family:var(--font-h);flex:1">${E(pl.name)}</b></div>
      <p style="margin:8px 0 4px">${alertsLine(pl)}</p><p style="margin:4px 0 8px">${shelterLine(pl)}</p>
      <div class="grid2"><button class="btn sm" data-setreg="${E(pl.id)}" ${pl.region ? "" : "disabled"}>Ustaw jako moje województwo</button><button class="btn sm" data-delpl="${E(pl.id)}" aria-label="Usuń miejsce ${E(pl.name)}">Usuń</button></div></article>`).join("")
      : `<div class="card"><p class="muted">Nie zapisano jeszcze żadnego miejsca. Dodaj dom, pracę lub miejsce, w którym mieszkają bliscy.</p></div>`;
  };
  const loadFor = (pl) => {
    info.set(pl.id, { state: "loading" });
    loadPspNearest(CONFIG.pspUrl, pl.lat, pl.lon, { maxKm: 50, want: 1, cache: pspCache, memo: pspMemo }).then((r) => {
      if (dead) return;
      const items = mergeSources(r.items, osm);
      const n = nearest(items, { lat: pl.lat, lon: pl.lon }, { maxKm: 50, limit: 1 });
      info.set(pl.id, n.length ? { state: "ok", s: n[0] } : { state: r.failed ? "none" : "empty" }); draw();
    }).catch(() => { if (!dead) { info.set(pl.id, { state: "none" }); draw(); } });
  };
  const ensureRegion = async (pl) => {
    if (pl.region) return;
    try { const { regionFromGps } = await import("./regions.js"); const r = await regionFromGps(pl.lat, pl.lon); if (r && !dead) { pl.region = r.id; ctx.save(); draw(); } } catch { /* */ }
  };
  draw();
  st().places.forEach((pl) => { loadFor(pl); ensureRegion(pl); });
  loadShelterDb(CONFIG.sheltersUrl).then((db) => { if (dead || !db) return; osm = db.items; st().places.forEach(loadFor); }).catch(() => {});

  $("plList").addEventListener("click", (e) => {
    const d = e.target.closest("[data-delpl]");
    if (d && confirm("Usunąć to miejsce z telefonu?")) { st().places = st().places.filter((x) => x.id !== d.dataset.delpl); ctx.save(); draw(); return; }
    const s = e.target.closest("[data-setreg]");
    if (s) { const pl = st().places.find((x) => x.id === s.dataset.setreg); if (pl?.region) { st().region = pl.region; st().regionSource = "place"; st().regionNear = null; ctx.save(); ctx.rerender(); } }
  });

  const setPick = (p, text) => { pick = p; $("plPick").textContent = text || `Wskazano: ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`; if (map && L) { if (pm) pm.setLatLng([p.lat, p.lon]); else pm = L.marker([p.lat, p.lon]).addTo(map); } };
  $("plGps").addEventListener("click", () => {
    $("plErr").textContent = ""; $("plPick").textContent = "Ustalam pozycję…";
    locate((p) => { if (dead) return; setPick({ lat: p.lat, lon: p.lon }, "Wskazano: Twoja aktualna pozycja."); if (map) map.setView([p.lat, p.lon], 15, { animate: false }); }, () => { if (!dead) { $("plPick").textContent = "Nie wskazano miejsca."; $("plErr").textContent = "Nie udało się ustalić pozycji. Sprawdź, czy lokalizacja jest włączona, albo wskaż miejsce na mapie."; } }, false);
  });
  $("plMapBtn").addEventListener("click", () => {
    const box = $("plMapBox"); box.hidden = !box.hidden; $("plMapBtn").setAttribute("aria-expanded", String(!box.hidden));
    if (box.hidden || map) { if (map) setTimeout(() => map.invalidateSize(), 0); return; }
    loadLeaflet().then((Lf) => {
      if (dead) return; L = Lf; const el = $("plMap"); el.innerHTML = "";
      map = L.map(el, { center: [52.0, 19.4], zoom: 6, minZoom: 4 }); cleanups.push(() => map.remove());
      baseLayer(L, "map", () => { $("plErr").textContent = "Mapa podkładowa nie odpowiada. Użyj przycisku „Moja pozycja”."; }).addTo(map);
      map.on("click", (ev) => setPick({ lat: ev.latlng.lat, lon: ev.latlng.lng }));
      setTimeout(() => map.invalidateSize(), 0);
    }).catch(() => { if (!dead) $("plMap").innerHTML = `<p class="note warn" style="margin:12px">Nie udało się załadować mapy. Użyj przycisku „Moja pozycja”.</p>`; });
  });
  $("plSave").addEventListener("click", async () => {
    $("plErr").textContent = "";
    if (st().places.length >= LIMITS.places) { $("plErr").textContent = `Można zapisać najwyżej ${LIMITS.places} miejsc. Usuń jedno, aby dodać nowe.`; return; }
    const r = makePlace({ label: $("plLabel").value, name: $("plName").value, lat: pick?.lat, lon: pick?.lon });
    if (!r.ok) { $("plErr").textContent = r.error; return; }
    st().places.push(r.place); ctx.save();
    $("plName").value = ""; pick = null; $("plPick").textContent = "Zapisano. Możesz dodać kolejne miejsce.";
    if (pm && map) { map.removeLayer(pm); pm = null; }
    draw(); loadFor(r.place); ensureRegion(r.place);
  });
}

/* =========================================================
   POLITYKA PRYWATNOŚCI
   ========================================================= */
export function renderPrivacy(ctx) {
  const { esc: E } = ctx;
  const sec = PRIVACY.sections.map((s) => `<div class="card"><h2>${E(s.h)}</h2>${s.p.map((x) => `<p>${E(x)}</p>`).join("")}</div>`).join("");
  return `${ctx.back("#/ustawienia", "Ustawienia")}<div class="hero"><h1>Polityka prywatności</h1><p>Prosto: co zostaje w telefonie i z kim łączy się aplikacja.</p></div>${sec}
  <p class="src">Ostatnia aktualizacja: ${E(PRIVACY.updated)}. ${PRIVACY.reviewed ? `Przegląd prawny: ${E(PRIVACY.reviewed)}.` : "<b>Tekst oczekuje na przegląd prawny.</b>"}${CONFIG.contactUrl ? "" : " Dane kontaktowe wydawcy zostaną uzupełnione."}</p>`;
}
