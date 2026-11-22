// Wczesne ostrzeżenie (NIEOFICJALNE): ukraińskie źródła – Siły Powietrzne ZSU i kanały monitoringu – zgłaszają cele powietrzne
// w obwodach przy granicy z Polską. Dane przygotowuje serwer EGIDA (server/early-lib.mjs, przekaźnik /egida/neptun/early).
// To nie jest alarm ani pozycja obiektu. Ten moduł tylko buduje HTML (czysta funkcja, testowalna w Node).

const OBL = { volyn: "wołyński", lviv: "lwowski", rivne: "rówieński", ternopil: "tarnopolski", ivano: "iwanofrankiwski", zakarpattia: "zakarpacki" };
const WEAPON = { rakieta: "rakiety", dron: "drony", cel: "cele powietrzne" };
const WEAPON1 = { rakieta: "rakieta", dron: "dron", cel: "cel powietrzny" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hhmm = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }); };
export const MAX_AGE_MS = 30 * 60 * 1000;

const where = (it) => {
  const o = (it.oblasts || []).map((x) => OBL[x]).filter(Boolean);
  return [o.length ? `obwód ${o.join(" / ")}` : "", it.poland ? "wzmianka o Polsce" : ""].filter(Boolean).join(", ") || "zachodnia Ukraina";
};
const who = (it) => (it.official ? "Siły Powietrzne ZSU" : (it.channels || []).join(", "));

/** Czy ostrzeżenie jest aktywne i świeże (serwer i tak wygasza po 30 min; tu zabezpieczenie na stare dane w telefonie). */
export function earlyActive(early, now = Date.now()) {
  return !!(early && early.level && early.lastAt && now - Date.parse(early.lastAt) <= MAX_AGE_MS && Array.isArray(early.items) && early.items.length);
}

/** Karta na Pulpit i nad mapą. Pusta, gdy nic się nie dzieje. */
export function earlyHtml(early, { now = Date.now(), max = 3 } = {}) {
  if (!earlyActive(early, now)) return "";
  const border = early.level === "border";
  const items = early.items.filter((x) => now - Date.parse(x.at) <= MAX_AGE_MS).slice(0, max);
  const head = border ? `Ukraińskie źródła zgłaszają ${esc(WEAPON[early.weapon] || "cele powietrzne")} przy granicy z Polską` : `Ukraińskie źródła zgłaszają ${esc(WEAPON[early.weapon] || "cele powietrzne")} w zachodniej Ukrainie`;
  const li = items.map((x) => `<li><span class="lbl">${esc(hhmm(x.at))} · ${esc(who(x))}</span><b>${esc(WEAPON1[x.weapon] || "cel")} · ${esc(where(x))}${x.west ? " · kurs na zachód" : ""}</b><span class="muted small" lang="uk">${esc(x.text)}</span></li>`).join("");
  return `<div class="goodtoknow early" role="status" aria-live="polite"><h2><span class="tri" aria-hidden="true">⚠</span>Wczesne ostrzeżenie · nieoficjalne</h2>` +
    `<p style="margin:0 0 6px"><b>${head}.</b> Ostatnia wiadomość: ${esc(hhmm(early.lastAt))}.</p><ul class="slist">${li}</ul>` +
    `<p class="sfine" style="margin-top:8px">To <b>nie jest alarm dla Polski</b> i nie pokazuje, gdzie jest obiekt. Obiekt może zmienić kurs albo zostać zestrzelony. Bądź w gotowości: sprawdź najbliższe schronienie. Jeśli zabrzmią syreny albo przyjdzie Alert RCB – działaj według nich.</p>` +
    `<p class="src" style="margin:6px 0 0">Źródła: Siły Powietrzne ZSU (t.me/kpszsu), kanały monitoringu przez NEPTUN (neptun.in.ua), przez serwer EGIDA.</p></div>`;
}
