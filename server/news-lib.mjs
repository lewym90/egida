// EGIDA – logika „Ważne w regionie”: parsery RSS i list gov.pl, filtr słów kluczowych, deduplikacja. Czysta, bez sieci (testy: scripts/test-v17.mjs).
// Zasada: tylko oficjalne, zaufane źródła (Policja, MEN, RCB, urzędy wojewódzkie, kuratoria). Nic nie piszemy od siebie, nic nie omijamy.
import { XMLParser } from "fast-xml-parser";
import { dedupeSimilar } from "../js/similar.js";
import { mentionsRegion, nationalThreat, regionsMentioned } from "./news-places.mjs";

export const LIMITS = { perSource: 15, total: 200, maxAgeDays: 14, titleChars: 200, summaryChars: 280 };

// Słowa kluczowe bezpieczeństwa (rdzenie, bez polskich znaków diakrytycznych po normalizacji).
const SAFETY = [
  "alarm bombow", "grozb", "pogrozk", "zagroz", "ostrzez", "ostrzeg", "ewakuac", "zamach", "atak", "strzelani", "nozown", "niebezpiecz",
  "falszyw", "dezinformac", "fejk", "nieprawdziw", "oszust", "wyludz", "podszyw", "komunikat", "apel ", "apelu", "apeluj", "bezpieczen", "ludnosci", "obron cywiln",
  "schron", "dron", "rakiet", "wybuch", "pozar", "powodz", "wichur", "burz", "nawalnic", "upal", "gololed", "smog", "skazeni", "awari", "brak pradu",
  "cyberatak", "cyberbezp", "przemoc", "agresj", "amunicj", "materialy wybuchow", "arsenal",
];
// Dla szkół i kuratoriów: tylko wpisy o bezpieczeństwie (bez planów lekcji, konkursów itp.).
const SCHOOL_SAFETY = ["bezpiecz", "zagroz", "grozb", "alarm", "ewakuac", "przemoc", "atak", "komunikat", "apel ", "apelu", "apeluj", "ostrzez", "cyber", "policj", "ochron", "dezinformac", "falszyw", "wstrzyman", "zawiesz"];

const fold = (s) => String(s || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");
const matches = (text, words) => { const t = fold(text); return words.some((w) => new RegExp("(^|[^a-z0-9])" + fold(w)).test(t)); }; // dopasowanie od początku wyrazu

/** Filtr: "all" (bez filtra), "safety" (słowa bezpieczeństwa), "school" (węższy zestaw dla MEN/kuratoriów). */
export function passesFilter(mode, title, summary = "") {
  if (mode === "all") return true;
  if (mode === "media") return passesMedia(title); // tylko tytuł
  const text = `${title} ${summary}`;
  if (mode === "school") return matches(text, SCHOOL_SAFETY);
  return matches(text, SAFETY);
}

const stripTags = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, " ").trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const toIso = (v) => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };
/** Tylko adresy https (nigdy javascript:, data:). */
export function safeHttps(u) { try { const x = new URL(u); return x.protocol === "https:" ? x.href : null; } catch { return null; } }

/** RSS 2.0 / Atom → [{title, url, date, summary}] */
export function parseRss(xml) {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: true, trimValues: true });
  let j; try { j = p.parse(String(xml)); } catch { return []; }
  const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const txt = (v) => (v && typeof v === "object" ? v["#text"] ?? "" : v ?? "");
  const out = [];
  for (const it of arr(j?.rss?.channel?.item)) {
    const title = stripTags(txt(it.title)), url = safeHttps(stripTags(txt(it.link)));
    if (!title || !url) continue;
    out.push({ title, url, date: toIso(txt(it.pubDate) || txt(it.date) || txt(it["dc:date"])), summary: stripTags(txt(it.description)), cats: arr(it.category).map((c) => stripTags(txt(c))).join(" ") });
  }
  for (const it of arr(j?.["rdf:RDF"]?.item)) { // RSS 1.0 (RDF), np. Radio Szczecin
    const title = stripTags(txt(it.title)), url = safeHttps(stripTags(txt(it.link)));
    if (!title || !url) continue;
    out.push({ title, url, date: toIso(txt(it["dc:date"]) || txt(it.pubDate)), summary: stripTags(txt(it.description)), cats: "" });
  }
  for (const it of arr(j?.feed?.entry)) {
    const l = arr(it.link).find((x) => x?.["@_rel"] !== "self") || arr(it.link)[0];
    const title = stripTags(txt(it.title)), url = safeHttps(l?.["@_href"] || "");
    if (!title || !url) continue;
    out.push({ title, url, date: toIso(txt(it.updated) || txt(it.published)), summary: stripTags(txt(it.summary)) });
  }
  return out;
}

/** Adresy kanałów RSS Policji znalezione na stronie głównej/stronie RSS: /dokumenty/rss/<id>-rss-o-<id>.rss (różne dla każdej jednostki). */
export function discoverFeeds(html, baseUrl) {
  const found = new Set();
  for (const m of String(html).matchAll(/(?:href|src)\s*=\s*["']([^"']*\/dokumenty\/rss\/[^"']+?\.rss)["']/gi)) {
    try { found.add(new URL(m[1].replace(/&amp;/g, "&"), baseUrl).href); } catch { /* pomiń */ }
  }
  for (const m of String(html).matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)) {
    const h = /href=["']([^"']+)["']/i.exec(m[0]); if (h) try { found.add(new URL(h[1], baseUrl).href); } catch { /* pomiń */ }
  }
  const list = [...found];
  // Kanał „Aktualności” ma w nazwie „rss-o-” – bierzemy go przed pozostałymi.
  list.sort((a, b) => Number(/rss-o-/.test(b)) - Number(/rss-o-/.test(a)));
  return list;
}

/** Strony „Kanały RSS” jednostki Policji (np. /ra/rss, /opo/rss): link z głównej strony albo odgadnięty z innych linków /<skrót>/sitemap, /<skrót>/wai. */
export function discoverRssPages(html, baseUrl) {
  const out = new Set(), src = String(html);
  for (const m of src.matchAll(/href\s*=\s*["']([^"']*\/[a-z0-9]{2,6}\/rss\/?)["']/gi)) { try { out.add(new URL(m[1], baseUrl).href); } catch { /* pomiń */ } }
  if (!out.size) for (const m of src.matchAll(/href\s*=\s*["'][^"']*?\/([a-z0-9]{2,6})\/(?:sitemap|wai|kontakt)\/?["']/gi)) { try { out.add(new URL(`/${m[1]}/rss`, baseUrl).href); } catch { /* pomiń */ } break; }
  return [...out].slice(0, 2);
}

const DATE_RE = /\b(\d{2})\.(\d{2})\.(\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/;
const dateFrom = (s) => { const m = DATE_RE.exec(s); if (!m) return null; const [y, mo, d] = m[1] ? [m[3], m[2], m[1]] : [m[4], m[5], m[6]]; return toIso(`${y}-${mo}-${d}T12:00:00+02:00`); };

/**
 * Lista aktualności ze strony HTML (gov.pl i podobne): link o treści ≥ 25 znaków + najbliższa data DD.MM.YYYY (lub RRRR-MM-DD) w pobliżu.
 * Zwraca [{title, url, date}]; wpisy bez daty pomijamy (nie wiemy, czy są świeże).
 */
export function parseHtmlList(html, baseUrl) {
  const out = [], seen = new Set(), src = String(html);
  for (const m of src.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    // Karta „cały wpis w jednym linku” (Policja): tytuł bierzemy z nagłówka/elementu o klasie tytułu, a przy braku – pierwsze 160 znaków.
    const hd = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(m[2]) || /<(?:span|div|p|strong|b)[^>]*class\s*=\s*["'][^"']*(?:tytu|title|naglow|headline)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|p|strong|b)>/i.exec(m[2]);
    let title = stripTags(hd ? hd[1] : m[2]);
    if (title.length > 400) title = clip(title.replace(DATE_RE, "").replace(/\s+/g, " ").trim(), 160);
    if (title.length < 25) continue;
    let url; try { url = safeHttps(new URL(m[1].replace(/&amp;/g, "&"), baseUrl).href); } catch { continue; }
    if (!url || seen.has(url)) continue;
    // Data: w treści linku, potem tuż przed nim (nagłówek karty), na końcu tuż po nim.
    const idx = m.index;
    // Okno „przed” kończy się na poprzednim linku/elemencie listy, okno „po” na następnym wpisie (link do artykułu /NNNN,Tytul.html lub <li>), żeby nie pożyczyć daty od sąsiada.
    let before = src.slice(Math.max(0, idx - 350), idx), after = src.slice(idx + m[0].length, idx + m[0].length + 700);
    before = before.slice(Math.max(before.lastIndexOf("</a>") + 4, before.lastIndexOf("</li>") + 5, before.lastIndexOf("</p>") + 4, before.lastIndexOf("<li") >= 0 ? before.lastIndexOf("<li") : 0, 0));
    const cut = after.search(/<li\b|href\s*=\s*["'][^"']*\/\d{4,},/i); if (cut >= 0) after = after.slice(0, cut);
    const date = dateFrom((/datetime\s*=\s*["']([^"']+)["']/i.exec(m[2]) || [])[1] || "") || dateFrom(stripTags(m[2])) || dateFrom(stripTags(before).slice(-60)) || dateFrom(stripTags(after).slice(0, 400));
    if (!date) continue;
    seen.add(url); out.push({ title: title.replace(DATE_RE, "").replace(/\s+/g, " ").trim() || title, url, date, summary: "" });
  }
  return out;
}

/**
 * Rozgłośnie bez kanału RSS: czytamy listę wiadomości ze strony. Bierzemy tylko linki pasujące do wzorca artykułów rozgłośni (rule.link),
 * tytuł z nagłówka, atrybutu title albo najdłuższego fragmentu tekstu w linku. Daty na stronie bywają niejednoznaczne (np. „godzinę temu”),
 * więc datę ustala wywołujący (pierwsze zobaczenie wpisu przez serwer).
 */
export function parseMediaHtml(html, baseUrl, rule) {
  const re = new RegExp(rule.link), deny = rule.deny ? new RegExp(rule.deny, "i") : null, best = new Map();
  for (const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const hm = /href\s*=\s*["']([^"']+)["']/i.exec(m[1]); if (!hm) continue;
    let url; try { url = safeHttps(new URL(hm[1].replace(/&amp;/g, "&"), baseUrl).href); } catch { continue; }
    if (!url) continue; url = url.replace(/#.*$/, "");
    if (!re.test(url) || (deny && deny.test(url))) continue;
    const hd = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(m[2]);
    const tt = /\btitle\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    const segs = m[2].split(/<[^>]+>/).map((x) => stripTags(x)).filter((x) => x.length >= 20);
    const cands = [hd ? stripTags(hd[1]) : "", tt ? stripTags(tt[1]) : "", segs.sort((a, b) => b.length - a.length)[0] || ""].filter((x) => x.length >= 20 && x.length <= 240);
    const t = cands[0];
    if (!t) continue;
    if (!best.has(url) || (best.get(url).length < t.length && !hd)) best.set(url, t);
  }
  return [...best].map(([url, title]) => ({ title: clip(title.replace(/\s+/g, " ").trim(), LIMITS.titleChars), url, summary: "" }));
}

/** Normalizacja wpisu źródłowego do formatu news.json. */
export function toItem(raw, src, nowMs) {
  if (!raw.date) return null;
  const t = new Date(raw.date).getTime(), active = raw.until && new Date(raw.until).getTime() >= nowMs;
  if (!Number.isFinite(t) || t > nowMs + 36e5 || (!active && nowMs - t > LIMITS.maxAgeDays * 864e5)) return null; // za stare albo z przyszłości
  if (!passesFilter(src.filter, raw.title, raw.summary)) return null;
  // Media: wpis musi dotyczyć województwa rozgłośni (tytuł lub kategorie wskazują miejscowość/region), inaczej to wiadomość z kraju lub ze świata.
  // Wyjątek: poważne zagrożenie bezpieczeństwa w Polsce (zamach, planowany atak) – pokazujemy je w województwie, które wymieniono w tekście, a gdy miejsca nie ma, w całym kraju.
  let region = raw.region || src.region;
  if (src.kind === "media") {
    const txt = `${raw.title} ${raw.cats || ""}`;
    if (!mentionsRegion(txt, src.region)) {
      if (!nationalThreat(txt)) return null;
      region = regionsMentioned(txt)[0] || "all";
    }
  }
  const id = raw.key ? `gddkia/${raw.key}` : raw.url.replace(/^https:\/\/(www\.)?/, "").replace(/[?#].*$/, "");
  return { id, title: clip(raw.title, LIMITS.titleChars), summary: src.kind === "media" ? "" : clip(raw.summary || "", LIMITS.summaryChars), url: raw.url, date: new Date(t).toISOString(), source: src.label, region, kind: src.kind, ...(active ? { until: raw.until } : {}) };
}

/** Łączy wpisy ze wszystkich źródeł: deduplikacja po adresie, limit na źródło, sortowanie od najnowszych. */
const rank = (it) => (it.kind === "media" ? 2 : it.region === "mixed" ? 1 : 0);
const titleKey = (t) => String(t).toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
/** Łączy wpisy ze wszystkich źródeł: deduplikacja po adresie i po tytule (ta sama wiadomość z portalu krajowego i z komendy; zostaje wersja z komendy), limit na źródło, sortowanie od najnowszych. */
export function mergeItems(lists, nowMs) {
  const byId = new Map();
  for (const items of lists) {
    const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date)), per = items.noCap ? sorted : sorted.slice(0, LIMITS.perSource);
    for (const it of per) if (!byId.has(it.id)) byId.set(it.id, it);
  }
  const byTitle = new Map();
  for (const it of byId.values()) {
    const k = titleKey(it.title), cur = byTitle.get(k);
    if (!cur || rank(it) < rank(cur)) byTitle.set(k, it); // przy tej samej wiadomości wygrywa źródło oficjalne z regionu
  }
  const pref = [...byTitle.values()].sort((a, b) => rank(a) - rank(b) || b.date.localeCompare(a.date)); // ta sama sprawa innymi słowami: zostaje źródło oficjalne, potem nowsze
  const keepIds = new Set(); // podobne tytuły porównujemy w obrębie jednego regionu (ta sama sprawa w dwóch województwach to dwa różne wpisy)
  for (const reg of new Set(pref.map((x) => x.region))) for (const x of dedupeSimilar(pref.filter((y) => y.region === reg && y.kind !== "gddkia"), (y) => y.title, { share: 0.75, minTokens: 4 })) keepIds.add(x.id);
  return pref.filter((x) => x.kind === "gddkia" || keepIds.has(x.id)).filter((x) => nowMs - new Date(x.date).getTime() <= LIMITS.maxAgeDays * 864e5 || (x.until && new Date(x.until).getTime() >= nowMs)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, LIMITS.total);
}

// ---------- GDDKiA: oficjalny plik XML z utrudnieniami na drogach krajowych ----------
const RAW_FOLD = (x) => String(x || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
/** Czas z XML bez strefy traktujemy jako czas polski (CET/CEST). */
export function warsawToMs(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/.exec(String(str || "").trim());
  if (!m) { const t = Date.parse(str); return Number.isFinite(t) ? t : null; }
  const [, y, mo, d, h, mi, se = "0", z] = m;
  if (z) return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${se.padStart(2, "0")}${z === "Z" ? "Z" : z.length === 5 ? z.slice(0, 3) + ":" + z.slice(3) : z}`);
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  for (const off of [2, 1]) { // CEST (+2) albo CET (+1): wybieramy ten, który po przeliczeniu daje tę samą godzinę w Warszawie
    const t = asUtc - off * 36e5, hh = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hour12: false }).format(t));
    if (hh % 24 === Number(h) % 24) return t;
  }
  return asUtc - 36e5;
}
const bool = (v) => v === true || /^(true|1|tak)$/i.test(String(v ?? "").trim());
const oneLine = (v) => stripTags(typeof v === "object" && v ? v["#text"] ?? "" : v ?? "");
export const GDDKIA_LINK = "https://drogi.gddkia.gov.pl/informacje-drogowe/lista-utrudnien";

/**
 * utrdane.xml → wpisy [{title, url, date, summary, region, until}]. Pokazujemy tylko to, co poważnie wpływa na przejazd:
 * zdarzenia (typ W: wypadki, awarie, zablokowania) oraz zamknięcia drogi. Długotrwałe roboty (typ U) pomijamy, by nie zalewać listy.
 */
export function parseGddkia(xml, nowMs, regionIds) {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: true, trimValues: true });
  let j; try { j = p.parse(String(xml)); } catch { return []; }
  const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const ids = new Set(regionIds), out = [];
  for (const u of arr(j?.utrudnienia?.utr)) {
    const region = RAW_FOLD(oneLine(u.woj));
    if (!ids.has(region)) continue;
    const closed = bool(u.droga_zamknieta), event = String(oneLine(u.typ)).trim().toUpperCase() === "W";
    if (!closed && !event) continue;
    const from = warsawToMs(oneLine(u.data_powstania)), to = oneLine(u.data_likwidacji) ? warsawToMs(oneLine(u.data_likwidacji)) : null;
    if (from == null || from > nowMs + 36e5) continue;
    if (to != null && to < nowMs) continue; // już zakończone
    const road = oneLine(u.nr_drogi), sect = oneLine(u.nazwa_odcinka), eff = oneLine(u.skutki), detour = oneLine(u.objazd);
    const what = closed ? "droga zamknięta" : eff || "utrudnienia w ruchu";
    const title = clip(`${road}${sect ? ` · ${sect}` : ""}: ${what.charAt(0).toLowerCase() + what.slice(1)}`.replace(/\s+/g, " "), LIMITS.titleChars);
    out.push({ title, url: GDDKIA_LINK, date: new Date(from).toISOString(), summary: clip(detour, LIMITS.summaryChars), region, until: to != null ? new Date(to).toISOString() : null, key: `${road}|${oneLine(u.km)}|${from}` });
  }
  return out;
}

// ---------- Doniesienia medialne (regionalne rozgłośnie publiczne): tylko tytuły poważnych zdarzeń, bez sportu i kultury ----------
const MEDIA_SAFETY = ["alarm", "bomb", "ewakuac", "zagroz", "ostrzez", "grozb", "pozar", "wybuch", "wypad", "zablokowan", "zamkniet", "utrudnien", "powodz", "podtopien", "wichur", "nawalnic",
  "burz", "tornado", "gololed", "skazeni", "katastrof", "nie zyje", "nie zyja", "zgin", "smiertel", "ranni", "ranny", "rannych", "strzelani", "nozown", "atak", "zamach", "dron", "rakiet", "syren",
  "zabojstw", "morderstw", "napad", "porwan", "zaginion", "brak pradu", "brak wody", "przerw w dostaw", "awari", "zatruc", "epidemi"];
const MEDIA_DENY = ["mecz", "liga", "ligi", "turniej", "puchar", "zawodnik", "zawodnicz", "pilkarz", "pilkark", "siatkar", "koszykar", "reprezentacj", "wyscig", "koncert", "festiwal", "wystaw", "premiera", "premiery",
  "kino", "teatr", "spektakl", "konkurs", "rocznic", "jubileusz", "horoskop", "rozmowa", "reportaz", "podcast", "felieton", "wideo", "quiz", "gosc", "wywiad", "ekspert", "pogoda na", "targi", "zwyciez", "pokonal", "przegral"];
/** Filtr mediów: tytuł musi zawierać słowo o zagrożeniu/poważnym zdarzeniu i nie zawierać słów ze sportu, kultury i rozmów. */
export function passesMedia(title) { return matches(title, MEDIA_SAFETY) && (!matches(title, MEDIA_DENY) || nationalThreat(title)); } // „zamach na premiera” nie jest premierą teatralną

/** Minimalny czytnik robots.txt: czy User-agent „*” (lub nasz) może pobrać ścieżkę. Brak pliku = wolno. */
export function robotsAllows(txt, path, ua = "egida") {
  const groups = []; let cur = null, lastWasUa = false;
  for (const raw of String(txt || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "user-agent") { if (!lastWasUa) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasUa = true; continue; }
    lastWasUa = false;
    if (cur && (k === "allow" || k === "disallow")) cur.rules.push([k, v]);
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && ua.includes(a)));
  const use = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  let best = null;
  for (const g of use) for (const [k, v] of g.rules) {
    if (!v) continue;
    const pat = v.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    if (new RegExp("^" + pat).test(path) && (!best || v.length >= best.len)) best = { len: v.length, allow: k === "allow" };
  }
  return best ? best.allow : true;
}
