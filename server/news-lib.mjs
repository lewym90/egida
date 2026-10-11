// EGIDA – logika „Ważne w regionie”: parsery RSS i list gov.pl, filtr słów kluczowych, deduplikacja. Czysta, bez sieci (testy: scripts/test-v17.mjs).
// Zasada: tylko oficjalne, zaufane źródła (Policja, MEN, RCB, urzędy wojewódzkie, kuratoria). Nic nie piszemy od siebie, nic nie omijamy.
import { XMLParser } from "fast-xml-parser";

export const LIMITS = { perSource: 15, total: 120, maxAgeDays: 14, titleChars: 200, summaryChars: 280 };

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
    out.push({ title, url, date: toIso(txt(it.pubDate) || txt(it.date)), summary: stripTags(txt(it.description)) });
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

const DATE_RE = /\b(\d{2})\.(\d{2})\.(\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/;
const dateFrom = (s) => { const m = DATE_RE.exec(s); if (!m) return null; const [y, mo, d] = m[1] ? [m[3], m[2], m[1]] : [m[4], m[5], m[6]]; return toIso(`${y}-${mo}-${d}T12:00:00+02:00`); };

/**
 * Lista aktualności ze strony HTML (gov.pl i podobne): link o treści ≥ 25 znaków + najbliższa data DD.MM.YYYY (lub RRRR-MM-DD) w pobliżu.
 * Zwraca [{title, url, date}]; wpisy bez daty pomijamy (nie wiemy, czy są świeże).
 */
export function parseHtmlList(html, baseUrl) {
  const out = [], seen = new Set(), src = String(html);
  for (const m of src.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = stripTags(m[2]);
    if (title.length < 25 || title.length > 400) continue;
    let url; try { url = safeHttps(new URL(m[1].replace(/&amp;/g, "&"), baseUrl).href); } catch { continue; }
    if (!url || seen.has(url)) continue;
    // Data: w treści linku, potem tuż przed nim (nagłówek karty), na końcu tuż po nim.
    const idx = m.index;
    // Okno „przed” kończy się na poprzednim linku/elemencie listy, okno „po” na następnym, żeby nie pożyczyć daty od sąsiedniego wpisu.
    let before = src.slice(Math.max(0, idx - 350), idx), after = src.slice(idx + m[0].length, idx + m[0].length + 200);
    before = before.slice(Math.max(before.lastIndexOf("</a>") + 4, before.lastIndexOf("</li>") + 5, before.lastIndexOf("<li") >= 0 ? before.lastIndexOf("<li") : 0, 0));
    const cut = after.search(/<a\b|<li\b/i); if (cut >= 0) after = after.slice(0, cut);
    const date = dateFrom(stripTags(m[2])) || dateFrom(stripTags(before).slice(-60)) || dateFrom(stripTags(after).slice(0, 60));
    if (!date) continue;
    seen.add(url); out.push({ title: title.replace(DATE_RE, "").replace(/\s+/g, " ").trim() || title, url, date, summary: "" });
  }
  return out;
}

/** Normalizacja wpisu źródłowego do formatu news.json. */
export function toItem(raw, src, nowMs) {
  if (!raw.date) return null;
  const t = new Date(raw.date).getTime();
  if (!Number.isFinite(t) || t > nowMs + 36e5 || nowMs - t > LIMITS.maxAgeDays * 864e5) return null; // za stare albo z przyszłości
  if (!passesFilter(src.filter, raw.title, raw.summary)) return null;
  const id = raw.url.replace(/^https:\/\/(www\.)?/, "").replace(/[?#].*$/, "");
  return { id, title: clip(raw.title, LIMITS.titleChars), summary: clip(raw.summary || "", LIMITS.summaryChars), url: raw.url, date: new Date(t).toISOString(), source: src.label, region: src.region, kind: src.kind };
}

/** Łączy wpisy ze wszystkich źródeł: deduplikacja po adresie, limit na źródło, sortowanie od najnowszych. */
export function mergeItems(lists, nowMs) {
  const byId = new Map();
  for (const items of lists) {
    const per = [...items].sort((a, b) => b.date.localeCompare(a.date)).slice(0, LIMITS.perSource);
    for (const it of per) if (!byId.has(it.id)) byId.set(it.id, it);
  }
  return [...byId.values()].filter((x) => nowMs - new Date(x.date).getTime() <= LIMITS.maxAgeDays * 864e5).sort((a, b) => b.date.localeCompare(a.date)).slice(0, LIMITS.total);
}
