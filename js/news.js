// „Ważne w regionie” – czysta logika po stronie aplikacji (bez DOM). Dane przygotowuje serwer (server/news-sync.mjs) z oficjalnych źródeł.
import { VOIVODESHIPS } from "./content.js";

export const NEWS_STALE_H = 3; // po tylu godzinach bez odświeżenia pliku pokazujemy „Brak aktualnych danych”
const IDS = new Set(VOIVODESHIPS.map((v) => v.id));
const httpsOnly = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

/** Sprawdza strukturę pobranego pliku; odrzuca wpisy z adresem innym niż https i z nieznanym województwem. Zwraca null, gdy plik jest bezużyteczny. */
const NAMED = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", ndash: "–", mdash: "—", hellip: "…", bdquo: "„", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", oacute: "ó", Oacute: "Ó", rsquo: "’", lsquo: "‘" };
/** Zamiana encji HTML w tytule na znaki (zabezpieczenie, gdyby serwer przysłał „&ndash;”). */
export const decodeEntities = (s) => { let t = String(s || ""); for (let i = 0; i < 2; i++) t = t.replace(/&(?:#(\d{1,6})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,8}));/g, (m, d, h, n) => { try { if (d) return String.fromCodePoint(Number(d)); if (h) return String.fromCodePoint(parseInt(h, 16)); return n in NAMED ? NAMED[n] : m; } catch { return m; } }); return t; };

export function normalizeNews(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return null;
  const items = [];
  for (const x of raw.items) {
    if (!x || typeof x !== "object") continue;
    const title = decodeEntities(x.title).trim().slice(0, 240), url = String(x.url || ""), t = Date.parse(x.date);
    const region = x.region === "all" || x.region === "world" || IDS.has(x.region) ? x.region : null; // „world” = ze świata (wpływ na Polskę); starsze wpisy „mixed” (miejsce nieustalone) pomijamy
    if (!title || !httpsOnly(url) || !Number.isFinite(t) || !region) continue;
    items.push({ id: String(x.id || url).slice(0, 200), title, summary: decodeEntities(x.summary).slice(0, 300), url, date: new Date(t).toISOString(), source: String(x.source || "").slice(0, 80), region, kind: String(x.kind || "").slice(0, 20), until: Number.isFinite(Date.parse(x.until)) ? new Date(x.until).toISOString() : null });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  return { generatedAt: Number.isFinite(Date.parse(raw.generatedAt)) ? new Date(raw.generatedAt).toISOString() : null, items };
}

export function newsFresh(feed, nowMs = Date.now()) {
  const t = feed?.generatedAt ? Date.parse(feed.generatedAt) : NaN;
  return Number.isFinite(t) && nowMs - t <= NEWS_STALE_H * 36e5;
}

import { dedupeSimilar } from "./similar.js";
const NEWS_RANK = (it) => (it.kind === "media" ? 2 : it.region === "mixed" ? 1 : 0);
/** Ta sama wiadomość od kilku źródeł (inne słowa) pokazuje się raz: wygrywa źródło oficjalne, potem nowsze. */
export function dedupeNews(list) {
  const pref = [...list].sort((a, b) => NEWS_RANK(a) - NEWS_RANK(b) || String(b.date).localeCompare(String(a.date)));
  const keep = new Set(dedupeSimilar(pref, (x) => x.title, { share: 0.75, minTokens: 4 }));
  return list.filter((x) => keep.has(x));
}

/** Wpisy dla województwa użytkownika + ogólnopolskie (bez województwa: wszystkie). opts: {max, onlyRegion, onlyAll} */
export function newsForRegion(feed, regionId, opts = {}) {
  if (!feed) return [];
  let l = feed.items.filter((x) => x.kind !== "gddkia"); // utrudnienia drogowe GDDKiA mają własne miejsce: „Dobrze wiedzieć” na Pulpicie
  if (opts.onlyAll) l = l.filter((x) => x.region === "all");
  else if (regionId) l = l.filter((x) => (opts.onlyRegion ? x.region === regionId : x.region === regionId || x.region === "all"));
  l = dedupeNews(l);
  return opts.max ? l.slice(0, opts.max) : l;
}

export function ageLabel(iso, nowMs = Date.now()) {
  const m = Math.floor((nowMs - Date.parse(iso)) / 6e4);
  if (!(m >= 0)) return "przed chwilą";
  if (m < 1) return "przed chwilą";
  if (m < 60) return `${m} min temu`;
  if (m < 1440) return `${Math.floor(m / 60)} godz. temu`;
  const d = Math.floor(m / 1440);
  return d === 1 ? "wczoraj" : `${d} dni temu`;
}

/** Zdarzenia i zamknięcia dróg krajowych (GDDKiA) tylko dla wskazanego województwa; trwające, od najnowszych. */
export function roadsForRegion(feed, regionId, opts = {}, nowMs = Date.now()) {
  if (!feed || !regionId) return [];
  const l = feed.items.filter((x) => x.kind === "gddkia" && x.region === regionId && (!x.until || Date.parse(x.until) >= nowMs));
  return opts.max ? l.slice(0, opts.max) : l;
}
export const ROADS_LINK = "https://drogi.gddkia.gov.pl/informacje-drogowe/lista-utrudnien";

/* ---------- Trzy grupy wiadomości: Moje województwo / Z kraju / Ze świata - wpływ na Polskę ---------- */
export const NEWS_GROUPS = [["region", "Moje województwo"], ["kraj", "Z kraju"], ["swiat", "Ze świata - wpływ na Polskę"]];
const VOI = Object.fromEntries(VOIVODESHIPS.map((v) => [v.id, v.name]));
/** Wpisy jednej grupy (bez utrudnień GDDKiA, bez powtórzeń). region: tylko wybrane województwo; kraj: region „all”; swiat: „world”. */
export function newsGroup(feed, group, regionId, opts = {}) {
  if (!feed) return [];
  const pick = { region: (x) => !!regionId && x.region === regionId, kraj: (x) => x.region === "all", swiat: (x) => x.region === "world" }[group];
  if (!pick) return [];
  const l = dedupeNews(feed.items.filter((x) => x.kind !== "gddkia" && pick(x)));
  return opts.max ? l.slice(0, opts.max) : l;
}
/** Etykieta grupy przy wpisie: „Z kraju”, „Ze świata”, „Twoje woj.” albo nazwa innego województwa. */
export function groupLabel(x, regionId) {
  if (x.region === "all") return "Z kraju";
  if (x.region === "world") return "Ze świata";
  return x.region === regionId ? "Twoje woj." : VOI[x.region] || null;
}
export const newsCounts = (feed, regionId) => Object.fromEntries(NEWS_GROUPS.map(([g]) => [g, newsGroup(feed, g, regionId).length]));
