// Stopnie alarmowe (RCB / Prezes Rady Ministrów): czysta logika parsowania, testowalna bez sieci.
// Źródło: komunikaty na gov.pl/web/rcb („Przedłużenie obowiązywania stopni alarmowych…”, „Wprowadzenie stopnia alarmowego…”).
// Zarządzenia są w tych komunikatach zapisane zwykłym tekstem, np.:
//   „nr 47 z dnia 25 sierpnia 2026 roku w sprawie wprowadzenia drugiego stopnia alarmowego (stopień BRAVO) na całym terytorium
//    Rzeczypospolitej Polskiej, obowiązuje od dnia 1 września 2026 r., od godz. 00.00, do dnia 30 listopada 2026 r., do godz. 23.59,”
export const RCB_BASE = "https://www.gov.pl";
export const RCB_SEED_PATH = "/web/rcb/przedluzenie-obowiazywania-stopni-alarmowych-do-30-listopada-2026-r";
const MONTHS = { stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6, lipca: 7, sierpnia: 8, września: 9, wrzesnia: 9, października: 10, pazdziernika: 10, listopada: 11, grudnia: 12 };
export const LEVEL_NAMES = { pierwszego: "ALFA", drugiego: "BRAVO", trzeciego: "CHARLIE", czwartego: "DELTA" };
export const VALID_LEVELS = ["ALFA", "BRAVO", "CHARLIE", "DELTA", "ALFA-CRP", "BRAVO-CRP", "CHARLIE-CRP", "DELTA-CRP"];

/** Przesunięcie strefy Europe/Warsaw (w minutach) dla danej chwili – bez zależności zewnętrznych. */
function warsawOffsetMin(utcMs) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  return Math.round((Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(utcMs / 1000) * 1000) / 60000);
}
/** Czas lokalny polski (rok, miesiąc, dzień, godzina, minuta) → ISO z przesunięciem, np. 2026-11-30T23:59:00+01:00. */
export function warsawIso(y, mo, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let off = warsawOffsetMin(guess - 2 * 3600e3);
  const t = guess - off * 60000;
  off = warsawOffsetMin(t);
  const sign = off >= 0 ? "+" : "-", a = Math.abs(off);
  const p = (n) => String(n).padStart(2, "0");
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:00${sign}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

const decode = (s) => s.replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
/** HTML → zwykły tekst z pojedynczymi spacjami (bez skryptów i stylów). */
export function textOf(html) {
  return decode(String(html || "").replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

const ORDER_RE = /nr\s+(\d{1,4})\s+z\s+dnia\s+(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})\s*(?:r\.|roku)\s+w\s+sprawie\s+wprowadzenia\s+(pierwszego|drugiego|trzeciego|czwartego)\s+stopnia\s+alarmowego(\s+CRP)?\s*\(\s*(?:stopień\s+)?([A-ZŁ]+(?:-CRP)?)\s*\)\s*(.*?)\s*,?\s*obowiązuje\s+od\s+dnia\s+(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})\s*r\.?\s*,?\s*od\s+godz\.?\s*(\d{1,2})[.:](\d{2})\s*,?\s*do\s+dnia\s+(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})\s*r\.?\s*,?\s*do\s+godz\.?\s*(\d{1,2})[.:](\d{2})/gi;

/** Opis zasięgu z fragmentu po nawiasie ze stopniem: „na całym terytorium…”, „na obszarach linii kolejowych…”, „wobec polskiej infrastruktury…”. */
function cleanScope(s) {
  const t = String(s || "").replace(/\s+/g, " ").replace(/^[\s,;:]+|[\s,;:]+$/g, "");
  return t.slice(0, 400);
}

/** Tekst komunikatu RCB → lista zarządzeń. Zwraca tylko poprawne wpisy (znane stopnie, poprawne daty, koniec po początku). */
export function parseOrders(text, { url = "" } = {}) {
  const out = [];
  ORDER_RE.lastIndex = 0;
  let m;
  while ((m = ORDER_RE.exec(text))) {
    const [, nr, d, mon, y, ord, crp, label, scope, d1, mon1, y1, h1, mi1, d2, mon2, y2, h2, mi2] = m;
    const mo = MONTHS[mon.toLowerCase()], m1 = MONTHS[mon1.toLowerCase()], m2 = MONTHS[mon2.toLowerCase()];
    if (!mo || !m1 || !m2) continue;
    const level = LEVEL_NAMES[ord.toLowerCase()] + (crp ? "-CRP" : "");
    const lab = label.toUpperCase().replace("Ł", "L");
    if (lab !== level || !VALID_LEVELS.includes(level)) continue; // nazwa słowna i nazwa w nawiasie muszą się zgadzać
    const from = warsawIso(Number(y1), m1, Number(d1), Number(h1), Number(mi1));
    const until = warsawIso(Number(y2), m2, Number(d2), Number(h2), Number(mi2));
    if (!(Date.parse(until) > Date.parse(from))) continue;
    const date = `${y}-${String(mo).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
    out.push({ nr: Number(nr), date, level, crp: !!crp, scope: cleanScope(scope), from, until, ...(url ? { url } : {}) });
  }
  return out;
}

/** Data publikacji komunikatu (dd.mm.rrrr) – pierwsza data w tekście po tytule; null, gdy brak. */
export function publishedOf(text) {
  const m = /\b(\d{2})\.(\d{2})\.(20\d{2})\b/.exec(text);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
/** Tytuł z <h1> albo <title>. */
export function titleOf(html) {
  const h = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return h ? textOf(h[1]).replace(/\s*-\s*Rządowe Centrum Bezpieczeństwa.*$/i, "").slice(0, 200) : "";
}
/** Podstawa prawna z tekstu komunikatu (np. „art. 16 ust. 1 pkt 1 ustawy z dnia 10 czerwca 2016 roku o działaniach antyterrorystycznych (Dz. U. z 2025 r. poz. 194)”). */
export function legalBasisOf(text) {
  const m = /na podstawie\s+(art\.\s*\d+[^,]*?ustawy z dnia\s+\d{1,2}\s+[a-ząćęłńóśźż]+\s+\d{4}\s*(?:r\.|roku)\s+o działaniach antyterrorystycznych)\s*\((Dz\.\s*U\.[^)]*)\)/i.exec(text);
  return m ? { article: m[1].replace(/\s+/g, " ").trim(), journal: m[2].replace(/\s+/g, " ").trim() } : null;
}

/** Adresy komunikatów o stopniach alarmowych z podanego HTML-a (strona listy RCB); zwracane pod adresem bazowym base. */
export function alarmLinks(html, base = RCB_BASE) {
  const found = new Set();
  const re = /href="(?:https:\/\/www\.gov\.pl)?(\/web\/rcb\/[a-z0-9-]*(?:stopni|stopien|stopnia|stopnie)[a-z0-9-]*alarmow[a-z0-9-]*)"/gi;
  let m;
  while ((m = re.exec(html))) found.add(base + m[1]);
  return [...found];
}

/** Klucz zarządzenia: ten sam numer z tą samą datą to to samo zarządzenie. */
export const orderKey = (o) => `${o.date}#${o.nr}`;
/** Scala listy zarządzeń: nowsze źródło nadpisuje to samo zarządzenie; wynik posortowany malejąco po dacie i numerze. */
export function mergeOrders(...lists) {
  const map = new Map();
  for (const l of lists) for (const o of l || []) map.set(orderKey(o), o);
  return [...map.values()].sort((a, b) => (b.date === a.date ? b.nr - a.nr : b.date.localeCompare(a.date)));
}
/** Czy zarządzenie obowiązuje w danej chwili. */
export const isActive = (o, now = Date.now()) => Date.parse(o.from) <= now && now <= Date.parse(o.until);
/** Prosta kontrola robots.txt: czy ścieżka jest dozwolona dla User-agent: *. */
export function robotsAllows(robotsTxt, path) {
  let applies = false, best = null;
  for (const raw of String(robotsTxt || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "user-agent") applies = v === "*";
    else if (applies && (k === "disallow" || k === "allow") && v && path.startsWith(v.replace(/\*$/, ""))) {
      if (!best || v.length > best.len || (v.length === best.len && k === "allow")) best = { len: v.length, allow: k === "allow" };
    }
  }
  return best ? best.allow : true;
}
