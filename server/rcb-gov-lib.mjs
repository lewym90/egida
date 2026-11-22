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
import { regionsMentioned } from "./news-places.mjs";

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

/**
 * Data z tytułu: „(20.11)”, „(20.11.2026)”, „(21-22.11)”, „20.11 – aktualizacja”. Najpierw data w NAWIASIE (ostatnia w nim),
 * potem pierwsza data w tytule – godzina zapisana z kropką („g. 10.05”) nie może udawać daty. Bez roku: rok najbliższy dacie „teraz”.
 * Data dalej niż 3 dni od „teraz” = podejrzana → null (wtedy datę bierzemy ze strony alertu).
 */
export function dateFromTitle(title, now = Date.now()) {
  const t = String(title || "");
  const DATE = /(?<![\d.])(\d{1,2})\.(\d{1,2})(?:\.(20\d{2}))?(?![\d])/g;
  let m = null;
  for (const par of t.matchAll(/\(([^()]*)\)/g)) { const inP = [...par[1].matchAll(DATE)]; if (inP.length) m = inP[inP.length - 1]; }
  if (!m) m = [...t.matchAll(DATE)][0] || null;
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]);
  if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return null;
  let y;
  if (m[3]) y = Number(m[3]);
  else {
    const y0 = new Date(now).getUTCFullYear();
    y = [y0 - 1, y0, y0 + 1].sort((a, b) => Math.abs(Date.UTC(a, mo - 1, d) - now) - Math.abs(Date.UTC(b, mo - 1, d) - now))[0];
  }
  if (Math.abs(Date.UTC(y, mo - 1, d) - now) > 4 * 864e5) return null;
  return { y, m: mo, d };
}

/**
 * Lista komunikatów RCB → alerty RCB: [{ slug, url, title, intro, date: {y,m,d}|null }].
 * Rozpoznajemy odnośniki /web/rcb/… z tekstem zaczynającym się od „Alert RCB”.
 */
export function parseList(html, now = Date.now(), origin = RCB_ORIGIN) {
  const out = [], seen = new Set();
  const re = /<a[^>]+href="(?:https:\/\/www\.gov\.pl)?(\/web\/rcb\/([a-z0-9-]{3,160}))"[^>]*>([\s\S]{0,400}?)<\/a>([\s\S]{0,1200}?)(?=<a[^>]+href=|<\/li>|$)/gi;
  let m;
  while ((m = re.exec(html))) {
    const [, path, slug, inner, after] = m;
    const title = plain(inner).replace(/\s*¶\s*/g, " ").trim();
    if (!/^alert\s+rcb\b/i.test(title) || seen.has(slug)) continue;
    seen.add(slug);
    const im = /class="intro"[^>]*>([\s\S]*?)<\/div>/i.exec(after);
    out.push({ slug, url: origin + path, title: title.slice(0, 200), intro: im ? plain(im[1]).replace(/\s*¶\s*/g, " ").slice(0, 400) : "", date: dateFromTitle(title, now) });
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
 * Województwa z opisu odbiorców; „całej Polski”/„kraju” → ["all"]. Zwraca [] gdy nie da się ustalić (NIGDY „all” z braku danych).
 * 1) nazwy województw w znanych układach („woj. lubelskiego, podkarpackiego, podlaskiego i mazowieckiego”, „województwa lubelskiego”,
 *    „- podlaskiego - powiaty:”, „(woj. lubelskie)”) – cała lista, dowolnie długa; nigdy z list powiatów (powiat opolski leży w lubelskim);
 * 2) gdy brak nazwy województwa: po nazwach powiatów i miast („pow. hrubieszowskiego, m. Zamość”) wg spisu miejscowości z news-places.mjs.
 */
export function regionsOf(recipients) {
  const s = String(recipients || "");
  const n = norm(s);
  if (/(calej\s+polski|calego\s+kraju|terenie\s+kraju|wszystkich\s+wojewodztw\b)/.test(n)) return ["all"];
  const W = "[a-ząćęłńóśźż]+(?:-[a-ząćęłńóśźż]+)?";
  const names = [];
  let m;
  const LIST = new RegExp(`\\bwoj(?:\\.|ewództw[a-ząćęłńóśźż]*)\\s*:?\\s+(${W}(?:\\s*(?:,|\\bi\\b|\\boraz\\b)\\s*${W})*)`, "giu");
  while ((m = LIST.exec(s))) names.push(m[1]);
  const BUL = new RegExp(`(?:^|[\\s:;,.])[-–—]\\s*(${W})\\s*[-–—]\\s*powiat`, "giu");
  while ((m = BUL.exec(s))) names.push(m[1]);
  // „powiaty” itp. po nazwie województwa nie są województwem – detectRegion i tak ich nie rozpozna.
  const hits = detectRegion(names.join(" "));
  if (hits.length) return hits;
  return regionsFromPlaces(s);
}

/** Powiaty i miasta → województwa (przymiotnik powiatu sprowadzony do rdzenia: „hrubieszowskiego” → „hrubieszow”). */
export function regionsFromPlaces(text) {
  // Biała Podlaska i powiat bialski leżą w LUBELSKIM – „Podlaska” nie może dać województwa podlaskiego.
  const t = String(text || "").replace(/bia[łl]\p{L}*\s+podlask\p{L}*/giu, " lubelszczyzna ").replace(/\b(pow|powiat\p{L}*|gm|gmin\p{L}*|m|miast\p{L}*)\.?\s*:?/giu, " ");
  // Powiaty o tej samej nazwie w dwóch województwach (opolski: lubelskie i opolskie, tomaszowski: lubelskie i łódzkie, świdnicki: lubelskie
  // i dolnośląskie…) – z samej nazwy nie wiadomo, gdzie leżą, więc ich nie używamy.
  const words = t.split(/[\s,;()]+/).filter((w) => w.length >= 4 && !AMBIGUOUS_POWIAT.test(norm(w)));
  const stems = [];
  for (const w of words) {
    const a = /^(.*?)(sk|ck|dzk)(?:iego|iemu|ich|im|ie|i|a|iej)$/iu.exec(w);
    if (!a) continue;
    stems.push(a[1]);                         // hrubieszowskiego → hrubieszow
    if (a[2].toLowerCase() === "ck") stems.push(a[1] + "k"); // sanockiego → sanok
  }
  const found = regionsMentioned(`${t} , ${stems.join(" , ")}`);
  // Tylko jednoznaczny wynik: przy alarmie lepiej nie wysłać (wysyłka idzie wtedy zapasowo wg innych wysyłek z tej strony) niż wysłać do złego województwa.
  return found.length === 1 ? found : [];
}
const AMBIGUOUS_POWIAT = /^(opolsk|tomaszowsk|swidnick|bielsk|brzesk|grodzisk|krosniensk|nowodworsk|ostrowsk|sredzk|bialsk|nowomiejsk|kamiensk|strzelec)/;

/**
 * Strona → komunikaty w formacie alerts.json (jeden na województwo i wysyłkę).
 * firstSeen: { [klucz wpisu]: ms } – kiedy pierwszy raz widzieliśmy wpis bez godziny (wtedy to jego czas).
 */
export function toItems(page, { slug, url, firstSeen = {}, regionMemo = null, now = Date.now() } = {}) {
  const items = [];
  if (!page?.date) return items;
  const { y, m, d } = page.date;
  let dayShift = 0, prevMin = -1;
  // Województwa całej strony – zapas dla wysyłki, której odbiorców nie da się przypisać (ta sama akcja RCB, te same okolice).
  const pageRegions = [...new Set(page.entries.flatMap((e) => regionsOf(e.recipients)).filter((r) => r !== "all"))].sort();
  const seenTimes = {};
  for (let idx = 0; idx < page.entries.length; idx++) {
    const e = page.entries[idx];
    // Klucz: strona + GODZINA wysyłki (+ numer kolejny przy dwóch wysyłkach o tej samej godzinie). Nie zmienia się, gdy RCB poprawi
    // literówkę, odbiorców albo układ innych wpisów (numer pozycji na stronie mógłby się przesunąć i „zabrać” identyfikator nowej wysyłce).
    const hm = `${e.hh ?? "-"}:${e.mm ?? "-"}`;
    const k = (seenTimes[hm] = (seenTimes[hm] ?? -1) + 1);
    const key = `${slug}|${hm}|${k}`;
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
    let regions = regionsOf(e.recipients), approx = false;
    if (!regions.length && pageRegions.length) {
      // Zapas: województwa z innych wysyłek tej strony – ZAMROŻONE przy pierwszym przypisaniu (późniejsza wysyłka do innego
      // województwa nie może „dopisać” tamtego województwa do starego wpisu i wysłać go tam z opóźnieniem).
      regions = regionMemo?.[key] || pageRegions; approx = true;
      if (regionMemo && !regionMemo[key]) regionMemo[key] = regions;
    }
    const recip = e.recipients ? `Alert RCB wysłano do odbiorców na terenie ${e.recipients.replace(/[.\s]+$/, "")}.` : "";
    const { title, rest } = headline(e.text);
    const base = {
      title, body: `${rest}${rest && !/[.!?]$/.test(rest) ? "." : ""}${recip ? (rest ? " " : "") + recip : ""}`.slice(0, 1200), type: "rcb",
      published, validTo: null, alarm: true, url, source: SOURCE, key,
      // Podpis treści: ta sama strona, godzina, tytuł i odbiorcy = ta sama wysyłka (ochrona przed ponowną wysyłką po przebudowie strony).
      // Godzina jest w podpisie, bo RCB może ponowić identyczne „Zagrożenie atakiem z powietrza” po odwołaniu – to NOWA wysyłka.
      sig: idFor(`${slug}|${e.hh ?? "-"}:${e.mm ?? "-"}|${norm(title)}|${norm(e.recipients).replace(/[^a-z0-9]+/g, "")}`), ...(approx ? { regionApprox: true } : {}),
    };
    const id = "g" + idFor(key);
    // Nie umiemy ustalić województwa: NIE wysyłamy do całej Polski (fałszywy alarm w 16 województwach) – wpis pomijamy, obserwator to loguje.
    if (!regions.length) { items.unresolved = (items.unresolved || 0) + 1; continue; }
    for (const r of regions) items.push({ ...base, id: `${id}:${r}`, voivodeship: r });
  }
  return items;
}
