// Alerty RCB o zagrożeniu z powietrza ze strony gov.pl/web/rcb/komunikaty – czysta logika parsowania, testowalna bez sieci.
//
// Dlaczego: RSO (komunikaty.tvp.pl) NIE publikuje Alertów RCB o ataku z powietrza (np. 20.11.2026, 6:30, Zamość/Hrubieszów).
// RCB publikuje każdy taki alert jako stronę „Alert RCB - atak z powietrza (20.11)”, a kolejne wysyłki dopisuje NA GÓRZE tej
// samej strony („Aktualizacja - g. 07:30 …”). Bierzemy z gov.pl tylko alerty dotyczące zagrożenia z powietrza – pozostałe
// (woda, ćwiczenia syren) są już w RSO i nie chcemy ich dublować.
//
// Format stron NIE jest jednolity (pisane ręcznie w edytorze). Spotkane warianty znacznika czasu:
//   „Aktualizacja - g. 09:48”, „Aktualizacja! - 22:41”, „g. 2:30”, samo „10:20”, a pierwotny wpis bywa bez godziny.
// Dlatego dzielimy treść po zdaniu „Alert RCB został wysłany do odbiorców na terenie …”, które kończy KAŻDĄ wysyłkę.
import { detectRegion } from "./rso.mjs";
import { warsawIso } from "./alarm-lib.mjs";

export const RCB_LIST_URL = "https://www.gov.pl/web/rcb/komunikaty";
export const RCB_ORIGIN = "https://www.gov.pl";
export const SOURCE = "RCB (gov.pl)";

const ENT = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", sbquo: "‚", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  oacute: "ó", Oacute: "Ó", aacute: "á", eacute: "é", uacute: "ú", iacute: "í", shy: "" };
export function decodeEntities(s) {
  return String(s ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " "; }
    return ENT[e] ?? ENT[e.toLowerCase()] ?? m;
  });
}
/** HTML → zwykły tekst (skrypty i style usunięte, encje zdekodowane, pojedyncze spacje). */
export function plain(html) {
  return decodeEntities(String(html || "").replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<hr\s*\/?>/gi, " ¶ ").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\r\n ]+/g, " ").trim();
}
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

/** Czy alert dotyczy zagrożenia z powietrza (wtedy bierzemy go z gov.pl). */
export const AIR_TOPIC_RE = /(z\s+powietrza|powietrzn|rakiet|\bdron|nalot|obiekt\w*\s+latajac|obrony\s+powietrznej)/;
export const isAirTopic = (...parts) => AIR_TOPIC_RE.test(norm(parts.join(" ")));

/** Data z nawiasu w tytule „(20.11)” + rok: najbliższa dacie „teraz” (obsługa przełomu roku). Zwraca { y, m, d } albo null. */
export function dateFromTitle(title, now = Date.now()) {
  const m = /\((\d{1,2})\.(\d{1,2})\)\s*$/.exec(String(title || "").trim());
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]);
  if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return null;
  const y0 = new Date(now).getUTCFullYear();
  const cand = [y0 - 1, y0, y0 + 1].map((y) => ({ y, m: mo, d, t: Date.UTC(y, mo - 1, d) }));
  cand.sort((a, b) => Math.abs(a.t - now) - Math.abs(b.t - now));
  const { y } = cand[0];
  return { y, m: mo, d };
}

/**
 * Lista komunikatów RCB → alerty RCB: [{ slug, url, title, intro, date: {y,m,d}|null }].
 * Rozpoznajemy odnośniki /web/rcb/… z tekstem zaczynającym się od „Alert RCB”.
 */
export function parseList(html, now = Date.now()) {
  const out = [], seen = new Set();
  const re = /<a[^>]+href="(?:https:\/\/www\.gov\.pl)?(\/web\/rcb\/([a-z0-9-]{3,160}))"[^>]*>([\s\S]{0,400}?)<\/a>([\s\S]{0,1200}?)(?=<a[^>]+href=|<\/li>|$)/gi;
  let m;
  while ((m = re.exec(html))) {
    const [, path, slug, inner, after] = m;
    const title = plain(inner).replace(/\s*¶\s*/g, " ").trim();
    if (!/^alert\s+rcb\b/i.test(title) || seen.has(slug)) continue;
    seen.add(slug);
    const im = /class="intro"[^>]*>([\s\S]*?)<\/div>/i.exec(after);
    out.push({ slug, url: RCB_ORIGIN + path, title: title.slice(0, 200), intro: im ? plain(im[1]).replace(/\s*¶\s*/g, " ").slice(0, 400) : "", date: dateFromTitle(title, now) });
  }
  return out;
}

const RECIP_RE = /Alert\s+RCB\s+zosta[łl]\s+wys[łl]any\s+do\s+odbiorc[óo]w\s+na\s+terenie\s*/gi;
// Znacznik czasu wysyłki na początku fragmentu: „Aktualizacja - g. 09:48”, „Aktualizacja! - 22:41”, „g. 2:30”, „10:20”.
const TIME_RE = /^(?:[-–—\s¶]*)(?:Aktualizacja\s*!?\s*[-–—:]?\s*)?(?:(?:g\.|godz\.?)\s*)?(\d{1,2})[:.](\d{2})\b/i;
const QUOTE_START = /[„“"]/;

/**
 * Strona jednego alertu → { title, date: {y,m,d}|null, entries: [{ hh, mm, text, recipients }] } – wpisy od NAJSTARSZEGO.
 * Wpis bez godziny ma hh = mm = null.
 */
export function parseAlertPage(html, now = Date.now()) {
  const art = /<article[\s\S]*?<\/article>/i.exec(html)?.[0] || html;
  const title = plain(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i.exec(art)?.[1] || "").replace(/\s*¶\s*/g, " ").trim();
  const dm = /class="event-date"[^>]*>\s*(\d{2})\.(\d{2})\.(20\d{2})/i.exec(art);
  const date = dm ? { y: Number(dm[3]), m: Number(dm[2]), d: Number(dm[1]) } : dateFromTitle(title, now);
  const ec = art.indexOf("editor-content");
  const body = plain(ec >= 0 ? art.slice(ec).replace(/^[^>]*>/, "") : art);
  const lead = plain(/class="intro"[^>]*>([\s\S]*?)<\/p>/i.exec(art)?.[1] || "");

  // Dzielimy po zdaniu o odbiorcach: [wiadomość][odbiorcy][wiadomość][odbiorcy]…
  const parts = [];
  let last = 0, m;
  RECIP_RE.lastIndex = 0;
  const marks = [];
  while ((m = RECIP_RE.exec(body))) marks.push({ at: m.index, end: RECIP_RE.lastIndex });
  const entries = [];
  for (let i = 0; i < marks.length; i++) {
    const msgRaw = body.slice(last, marks[i].at);
    // Odbiorcy kończą się przed separatorem, znacznikiem „Aktualizacja”, cudzysłowem nowej wiadomości albo godziną nowej wysyłki.
    const restEnd = i + 1 < marks.length ? marks[i + 1].at : body.length;
    const rest = body.slice(marks[i].end, restEnd);
    const stop = rest.search(/-{4,}|Aktualizacja|[„“"]|(?:^|\s)(?:g\.\s*)?\d{1,2}[:.]\d{2}\s+[„“"]/i);
    const recip = (stop >= 0 ? rest.slice(0, stop) : rest).replace(/¶/g, " ").replace(/\s+/g, " ").replace(/[\s;,]+$/, "").trim();
    last = marks[i].end + (stop >= 0 ? stop : rest.length);
    parts.push({ msgRaw, recip });
  }
  for (const { msgRaw, recip } of parts) {
    let x = msgRaw.replace(/¶/g, " ").replace(/\s+/g, " ").replace(/^[\s\-–—]+/, "").trim();
    let hh = null, mm = null;
    const t = TIME_RE.exec(x);
    if (t && Number(t[1]) < 24 && Number(t[2]) < 60) { hh = Number(t[1]); mm = Number(t[2]); x = x.slice(t[0].length).trim(); }
    else {
      // Godzina może stać przed cudzysłowem po innym tekście (np. separatorze) – szukamy jej tuż przed treścią.
      const q = x.search(QUOTE_START);
      const pre = q > 0 ? x.slice(0, q) : "";
      const t2 = /(?:Aktualizacja\s*!?\s*[-–—:]?\s*)?(?:(?:g\.|godz\.?)\s*)?(\d{1,2})[:.](\d{2})\s*$/i.exec(pre.trim());
      if (t2 && Number(t2[1]) < 24 && Number(t2[2]) < 60) { hh = Number(t2[1]); mm = Number(t2[2]); }
      if (q >= 0) x = x.slice(q);
    }
    const text = x.replace(/^[„“"']+|[”"'“]+\s*$/g, "").replace(/[”"“]+\s*\.?\s*$/, "").replace(/\s+([.,!?])/g, "$1").trim();
    if (!text) continue;
    entries.push({ hh, mm, text: text.slice(0, 600), recipients: recip.slice(0, 900) });
  }
  // Strona wymienia wysyłki od najnowszej; odwracamy, żeby iść od najstarszej.
  entries.reverse();
  // Wpis bez godziny na samej górze strony bywa streszczeniem – ale RCB zawsze kończy wpis zdaniem o odbiorcach, więc to pełna wysyłka.
  return { title, date, lead, entries };
}

/** „UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce…” → { title: „Zagrożenie atakiem z powietrza”, rest: „Znajdź…” }. Etykieta „Alert RCB” jest już w nagłówku (typ komunikatu). */
export function headline(text) {
  const x = String(text || "").replace(/^(?:\s*(?:UWAGA|KOMUNIKAT|ĆWICZENIA)\s*[!:]+\s*)+/iu, "").trim();
  const m = /^(.{8,140}?[.!?])(?=\s+\p{Lu}|\s*$)/u.exec(x);
  const title = (m ? m[1].replace(/[.!]+$/, "") : x.length <= 140 ? x.replace(/[.!]+$/, "") : "").trim();
  if (!title) return { title: "Alert RCB", rest: x };
  return { title, rest: x.slice(m ? m[1].length : x.length).trim() };
}

const idFor = (s) => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h.toString(36); };

/**
 * Województwa z opisu odbiorców; „całej Polski”/„kraju” → ["all"].
 * Czytamy TYLKO nazwy województw („woj. lubelskiego i podkarpackiego”, „województwa lubelskiego”, „- podlaskiego - powiaty:”,
 * „(woj. lubelskie)”), nigdy listy powiatów – powiat opolski leży w lubelskim, a „opolski” to też rdzeń województwa opolskiego.
 */
export function regionsOf(recipients) {
  const s = String(recipients || "");
  const n = norm(s);
  if (/(calej\s+polski|calego\s+kraju|terenie\s+kraju|wszystkich\s+wojewodztw\b)/.test(n)) return ["all"];
  const W = "([a-ząćęłńóśźż]+(?:-[a-ząćęłńóśźż]+)?)";
  const names = [];
  const add = (re) => { let m; re.lastIndex = 0; while ((m = re.exec(s))) names.push(...m.slice(1).filter(Boolean)); };
  add(new RegExp(`\\bwoj(?:\\.|ewództw[a-z]*)\\s*:?\\s+${W}(?:\\s*(?:,|i|oraz)\\s+${W})?(?:\\s*(?:,|i|oraz)\\s+${W})?`, "giu"));
  add(new RegExp(`(?:^|[\\s:;,.])[-–—]\\s*${W}\\s*[-–—]\\s*powiat`, "giu"));
  const hits = detectRegion(names.join(" "));
  if (hits.length) return hits;
  // Brak nazwy województwa w znanym układzie: rozpoznajemy z treści po usunięciu list powiatów i gmin.
  const stripped = s.replace(/\b(?:pow(?:iat\w*)?|gm(?:ina|iny)?)\.?\s*:?[^;()]*?(?=;|\(|$)/giu, " ");
  return detectRegion(stripped);
}

/**
 * Strona → komunikaty w formacie alerts.json (jeden na województwo i wysyłkę).
 * firstSeen: { [klucz wpisu]: ms } – kiedy pierwszy raz widzieliśmy wpis bez godziny (wtedy to jego czas).
 */
export function toItems(page, { slug, url, firstSeen = {}, now = Date.now() } = {}) {
  const items = [];
  if (!page?.date) return items;
  const { y, m, d } = page.date;
  let dayShift = 0, prevMin = -1;
  for (const e of page.entries) {
    const key = `${slug}|${e.hh ?? "-"}:${e.mm ?? "-"}|${idFor(e.text + "|" + e.recipients)}`;
    let published;
    if (e.hh != null) {
      const min = e.hh * 60 + e.mm;
      if (prevMin >= 0 && min + 6 * 60 < prevMin) dayShift++; // przejście przez północ (23:50 → 00:20)
      prevMin = min;
      const base = new Date(Date.UTC(y, m - 1, d + dayShift));
      published = new Date(warsawIso(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), e.hh, e.mm)).toISOString();
    } else {
      const fs = firstSeen[key];
      published = new Date(Number.isFinite(fs) ? fs : Date.parse(warsawIso(y, m, d, 0, 0))).toISOString();
    }
    if (Date.parse(published) > now + 2 * 6e4) continue; // data z przyszłości (poza różnicą zegarów) = błąd odczytu, pomijamy
    const regions = regionsOf(e.recipients);
    const recip = e.recipients ? `Alert RCB wysłano do odbiorców na terenie ${e.recipients.replace(/[.\s]+$/, "")}.` : "";
    const { title, rest } = headline(e.text);
    const base = {
      title, body: `${rest}${rest && !/[.!?]$/.test(rest) ? "." : ""}${recip ? (rest ? " " : "") + recip : ""}`.slice(0, 1200), type: "rcb",
      published, validTo: null, alarm: true, url, source: SOURCE, key,
    };
    const id = "g" + idFor(key);
    if (!regions.length) items.push({ ...base, id: `${id}:all`, voivodeship: "all" });
    else for (const r of regions) items.push({ ...base, id: `${id}:${r}`, voivodeship: r });
  }
  return items;
}
