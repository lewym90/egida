// „Ważne w regionie” – czysta logika po stronie aplikacji (bez DOM). Dane przygotowuje serwer (server/news-sync.mjs) z oficjalnych źródeł.
import { VOIVODESHIPS } from "./content.js";

export const NEWS_STALE_H = 3; // po tylu godzinach bez odświeżenia pliku pokazujemy „Brak aktualnych danych”
const IDS = new Set(VOIVODESHIPS.map((v) => v.id));
const httpsOnly = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

/** Sprawdza strukturę pobranego pliku; odrzuca wpisy z adresem innym niż https i z nieznanym województwem. Zwraca null, gdy plik jest bezużyteczny. */
export function normalizeNews(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return null;
  const items = [];
  for (const x of raw.items) {
    if (!x || typeof x !== "object") continue;
    const title = String(x.title || "").trim().slice(0, 240), url = String(x.url || ""), t = Date.parse(x.date);
    const region = x.region === "all" || x.region === "mixed" || IDS.has(x.region) ? x.region : null; // „mixed” = portal krajowy bez ustalonego regionu
    if (!title || !httpsOnly(url) || !Number.isFinite(t) || !region) continue;
    items.push({ id: String(x.id || url).slice(0, 200), title, summary: String(x.summary || "").slice(0, 300), url, date: new Date(t).toISOString(), source: String(x.source || "").slice(0, 80), region });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  return { generatedAt: Number.isFinite(Date.parse(raw.generatedAt)) ? new Date(raw.generatedAt).toISOString() : null, items };
}

export function newsFresh(feed, nowMs = Date.now()) {
  const t = feed?.generatedAt ? Date.parse(feed.generatedAt) : NaN;
  return Number.isFinite(t) && nowMs - t <= NEWS_STALE_H * 36e5;
}

/** Wpisy dla województwa użytkownika + ogólnopolskie (bez województwa: wszystkie, także „mixed”). opts: {max, onlyRegion, onlyAll} */
export function newsForRegion(feed, regionId, opts = {}) {
  if (!feed) return [];
  let l = feed.items;
  if (opts.onlyAll) l = l.filter((x) => x.region === "all");
  else if (regionId) l = l.filter((x) => (opts.onlyRegion ? x.region === regionId : x.region === regionId || x.region === "all"));
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
