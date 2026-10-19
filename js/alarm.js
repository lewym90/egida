// Stopnie alarmowe w kraju lub jego części (zarządzenia Prezesa Rady Ministrów, komunikaty RCB).
// Czysta logika + budowa HTML bez dostępu do DOM; dane (alarm-levels.json) pobiera app.js z CONFIG.alarmUrl.
import { GENERAL_TABLE, CRP_TABLE, LEVEL_STYLE, ALARM_TABLE_SOURCE, ALARM_TABLE_REVIEWED } from "./alarm-table.js";

export const ALARM_LEVELS = ["ALFA", "BRAVO", "CHARLIE", "DELTA", "ALFA-CRP", "BRAVO-CRP", "CHARLIE-CRP", "DELTA-CRP"];
export const ALARM_STALE_H = 72; // po tylu godzinach od ostatniego sprawdzenia źródła pokazujemy ostrzeżenie „sprawdź RCB”
const ORDINAL = { ALFA: "I stopień", BRAVO: "II stopień", CHARLIE: "III stopień", DELTA: "IV stopień" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https:\/\//i.test(u || "") ? u : "");
const isoOk = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && Number.isFinite(Date.parse(s));

/** Czyści plik alarm-levels.json. Zwraca null, gdy kształt jest zły. Starość danych nie wyrzuca pliku, tylko ustawia stale. */
export function normalizeAlarm(raw, { now = Date.now() } = {}) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return null;
  const at = Date.parse(raw.at);
  if (!Number.isFinite(at) || at - now > 3600e3) return null;
  const items = raw.items.filter((o) => o && Number.isInteger(o.nr) && ALARM_LEVELS.includes(o.level) && isoOk(o.from) && isoOk(o.until) && Date.parse(o.until) > Date.parse(o.from))
    .map((o) => ({
      nr: o.nr, date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || "") ? o.date : "", level: o.level, crp: o.level.endsWith("-CRP"),
      scope: String(o.scope || "").slice(0, 400), from: o.from, until: o.until,
      url: safeUrl(o.url), published: /^\d{4}-\d{2}-\d{2}$/.test(o.published || "") ? o.published : "",
    }));
  if (!items.length) return null;
  const notices = (Array.isArray(raw.notices) ? raw.notices : []).filter((n) => n && safeUrl(n.url)).slice(0, 5)
    .map((n) => ({ title: String(n.title || "Komunikat RCB o stopniach alarmowych").slice(0, 200), url: safeUrl(n.url), published: /^\d{4}-\d{2}-\d{2}$/.test(n.published || "") ? n.published : "" }));
  const basis = raw.basis && typeof raw.basis === "object" && raw.basis.article ? { article: String(raw.basis.article).slice(0, 300), journal: String(raw.basis.journal || "").slice(0, 120) } : null;
  const src = raw.source && safeUrl(raw.source.url) ? { name: String(raw.source.name || "Rządowe Centrum Bezpieczeństwa").slice(0, 120), url: safeUrl(raw.source.url) } : { name: "Rządowe Centrum Bezpieczeństwa (gov.pl/rcb)", url: "https://www.gov.pl/web/rcb" };
  return { at: raw.at, stale: now - at > ALARM_STALE_H * 3600e3, items, notices, basis, source: src };
}

/** Stan zarządzenia względem chwili now: "active" | "upcoming" | "ended". */
export function alarmStatus(o, now = Date.now()) {
  if (now < Date.parse(o.from)) return "upcoming";
  return now <= Date.parse(o.until) ? "active" : "ended";
}
/** Ile dni kalendarzowych (czas polski) zostało do końca doby, w której wygasa zarządzenie; 0 = wygasa dziś. */
export function daysLeft(o, now = Date.now()) {
  const day = (ms) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  const [a, b] = [day(now), day(Date.parse(o.until))].map((s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
  return Math.round((b - a) / 864e5);
}
export const plDay = (iso) => new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "long", year: "numeric" }).format(new Date(typeof iso === "string" && iso.length === 10 ? iso + "T12:00:00Z" : iso));
export const plHour = (iso) => new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
export const plStamp = (iso) => new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
export const daysWord = (n) => (n === 1 ? "1 dzień" : `${n} dni`);

/** Krótki tytuł zasięgu (czytelny na telefonie); pełny opis z zarządzenia pokazujemy pod spodem. */
export function scopeTitle(scope) {
  const s = String(scope || "").toLowerCase();
  if (/całym terytorium/.test(s)) return "Cała Polska";
  if (/linii kolejowych/.test(s)) return "Linie kolejowe (PKP PLK i PKP LHS)";
  if (/infrastruktur\S* energetyczn/.test(s) && /poza granicami/.test(s)) return "Polska infrastruktura energetyczna za granicą";
  return scope ? scope.charAt(0).toUpperCase() + scope.slice(1) : "Zasięg wg zarządzenia";
}
/** Kolejność kart: najpierw zarządzenia na cały kraj, potem pozostałe zakresy, na końcu stopnie CRP; w grupie wyższy stopień wyżej. */
export function sortAlarms(list) {
  const rank = (o) => ALARM_LEVELS.indexOf(o.level) % 4;
  const w = (o) => (o.crp ? 2 : /całym terytorium/i.test(o.scope) ? 0 : 1);
  return [...list].sort((a, b) => w(a) - w(b) || rank(b) - rank(a) || b.nr - a.nr);
}
const baseLevel = (l) => l.replace("-CRP", "");
const stl = (l) => LEVEL_STYLE[baseLevel(l)] || LEVEL_STYLE.ALFA;
const pill = (l) => `<span class="alpill" style="background:${stl(l).bg};color:${stl(l).ink}">${esc(l)}</span>`;

function cardHtml(o, now, kind) {
  const left = daysLeft(o, now);
  const when = kind === "active" ? (left <= 0 ? "Wygasa dziś" : `Zostało ${daysWord(left)}`) : kind === "upcoming" ? `Zacznie obowiązywać ${plDay(o.from)}` : `Wygasło ${plDay(o.until)}`;
  const title = o.crp ? `${ORDINAL[baseLevel(o.level)]} alarmowy CRP (cyberprzestrzeń)` : `${ORDINAL[o.level]} alarmowy`;
  return `<article class="card alcard ${kind}" style="border-left:6px solid ${stl(o.level).bg}">
    <div class="alhead">${pill(o.level)}<span class="altime">${esc(when)}</span></div>
    <h3>${esc(scopeTitle(o.scope))}</h3>
    <p class="muted small">${esc(title)}. Zasięg wg zarządzenia: ${esc(o.scope.replace(/\.$/, ""))}.</p>
    <dl class="aldl"><dt>Obowiązuje</dt><dd>od ${esc(plDay(o.from))}, godz.&nbsp;${esc(plHour(o.from))}<br>do ${esc(plDay(o.until))}, godz.&nbsp;${esc(plHour(o.until))}</dd>
    <dt>Podstawa</dt><dd>Zarządzenie nr ${o.nr} Prezesa Rady Ministrów z dnia ${esc(o.date ? plDay(o.date) : "—")}</dd></dl>
    ${o.url ? `<a class="alsrc" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Komunikat RCB${o.published ? " z " + esc(plDay(o.published)) : ""}</a>` : ""}
  </article>`;
}

function tableHtml(tbl, { citizen = null, title, id }) {
  const rows = tbl.rows.map((r) => {
    const st = LEVEL_STYLE[baseLevel(r.level)] || LEVEL_STYLE.ALFA;
    const body = r.admin
      ? `<ul>${r.admin.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>${r.partial ? '<p class="muted small alnote">To nie jest cały wiersz. Pełną tabelę zobacz w komunikacie RCB.</p>' : ""}`
      : '<p class="muted small alnote">Treść tego wiersza jest w przygotowaniu. Pełną tabelę zobacz w komunikacie RCB.</p>';
    return `<tr><th scope="row" style="background:${st.bg};color:${st.ink}">${esc(r.level)}</th><td>${body}</td></tr>`;
  }).join("");
  const cit = citizen ? `<tr class="alcit"><th scope="row">Zadania obywatela</th><td><ul>${citizen.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="muted small alnote">W infografice RCB to jedna wspólna kolumna dla wszystkich stopni (ALFA–DELTA).</p></td></tr>` : "";
  return `<div class="card flat altablewrap"><h3 id="${id}">${esc(title)}</h3><table class="altable" aria-labelledby="${id}"><thead><tr><th scope="col">Stopień</th><th scope="col">Najważniejsze zadania dla administracji</th></tr></thead><tbody>${rows}${cit}</tbody></table></div>`;
}

/** Cały ekran „Stopnie alarmowe”. data = wynik normalizeAlarm albo null (brak danych). */
export function renderAlarmHtml(data, { now = Date.now(), back = "", loading = false } = {}) {
  const head = `${back}<div class="hero"><h1>Stopnie alarmowe</h1><p>Obowiązujące w kraju lub jego części. Dane z komunikatów Rządowego Centrum Bezpieczeństwa.</p></div>`;
  const src = (data && data.source) || { name: "Rządowe Centrum Bezpieczeństwa (gov.pl/rcb)", url: "https://www.gov.pl/web/rcb" };
  let body = "";
  if (!data && loading) {
    body = `<p class="muted" role="status">Wczytuję aktualne dane…</p>`;
  } else if (!data) {
    body = `<div class="status warn" role="status"><span><b>Brak aktualnych danych.</b> Nie udało się pobrać listy obowiązujących stopni alarmowych. Sprawdź komunikaty na stronie RCB.</span></div><a class="btn" href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">Otwórz stronę RCB</a>`;
  } else {
    const active = sortAlarms(data.items.filter((o) => alarmStatus(o, now) === "active"));
    const upcoming = sortAlarms(data.items.filter((o) => alarmStatus(o, now) === "upcoming"));
    const ended = data.items.filter((o) => alarmStatus(o, now) === "ended").sort((a, b) => Date.parse(b.until) - Date.parse(a.until));
    const warn = [];
    if (data.stale) warn.push(`Ostatnie sprawdzenie źródła: ${esc(plStamp(data.at))}. Dane mogły się zmienić, sprawdź komunikaty RCB.`);
    if (data.notices.length) warn.push(`RCB opublikowało nowy komunikat o stopniach alarmowych, którego treści nie odczytaliśmy automatycznie: ${data.notices.map((n) => `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}${n.published ? " (" + esc(plDay(n.published)) + ")" : ""}</a>`).join("; ")}.`);
    if (!active.length) warn.push("W ostatnich danych nie ma obowiązującego zarządzenia. To nie znaczy, że zagrożenia nie ma. Sprawdź komunikaty RCB.");
    body += warn.map((w) => `<div class="status warn" role="status"><span>${w}</span></div>`).join("");
    if (active.length) body += `<h2 class="alh">Obowiązują teraz</h2>${active.map((o) => cardHtml(o, now, "active")).join("")}`;
    if (upcoming.length) body += `<h2 class="alh">Zapowiedziane</h2>${upcoming.map((o) => cardHtml(o, now, "upcoming")).join("")}`;
    if (ended.length) body += `<details class="card alended"><summary>Wygasłe zarządzenia (${ended.length})</summary>${ended.map((o) => cardHtml(o, now, "ended")).join("")}</details>`;
    if (data.basis) body += `<div class="card"><h3>Podstawa prawna</h3><p>Zarządzenia wydaje Prezes Rady Ministrów na podstawie ${esc(data.basis.article)}${data.basis.journal ? " (" + esc(data.basis.journal) + ")" : ""}.</p></div>`;
  }
  const tables = `<h2 class="alh">Tabela stopni</h2>
    <p class="muted small">Przepisane z infografiki RCB. Stopnie alarmowe i ich zadania dotyczą przede wszystkim administracji i służb.</p>
    ${tableHtml(GENERAL_TABLE, { citizen: GENERAL_TABLE.citizen, title: "Stopnie alarmowe", id: "altab1" })}
    ${tableHtml(CRP_TABLE, { title: "Stopnie alarmowe CRP (cyberprzestrzeń)", id: "altab2" })}`;
  const foot = `<p class="src">Źródło: <a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.name)}</a>${data ? `. Dane sprawdzone przez serwer EGIDA: ${esc(plStamp(data.at))}` : ""}. Tabele: <a href="${esc(ALARM_TABLE_SOURCE.url)}" target="_blank" rel="noopener noreferrer">${esc(ALARM_TABLE_SOURCE.name)}</a>, ostatni przegląd ${esc(plDay(ALARM_TABLE_REVIEWED))}. EGIDA jest nieoficjalna, nie zastępuje komunikatów RCB.</p>`;
  return head + body + tables + foot;
}

/** Skrót do listy „Więcej”: najwyższy obowiązujący stopień ogólny (bez CRP) na całym terytorium kraju albo null. */
export function alarmSummary(data, now = Date.now()) {
  if (!data) return null;
  const act = data.items.filter((o) => alarmStatus(o, now) === "active" && !o.crp && /całym terytorium/i.test(o.scope));
  if (!act.length) return null;
  return act.reduce((a, b) => (ALARM_LEVELS.indexOf(b.level) > ALARM_LEVELS.indexOf(a.level) ? b : a)).level;
}
