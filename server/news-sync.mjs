// EGIDA – „Ważne w regionie”: zbiera aktualności z OFICJALNYCH źródeł (Policja, MEN, RCB, urzędy wojewódzkie, kuratoria) do news.json.
// Nic nie jest pisane ręcznie ani zatwierdzane przez człowieka; źródło i link do oryginału zawsze zostają przy wpisie.
// Nie omijamy zabezpieczeń: odpowiedź inna niż 200 = źródło pomijamy (raz na przebieg, bez ponawiania) i zapisujemy to w news-report.json.
//   node news-sync.mjs            – normalny przebieg (zapis $NEWS_OUT i $NEWS_REPORT_OUT)
//   node news-sync.mjs --dump     – tylko wypisz raport, nic nie zapisuj
import { writeFileSync, readFileSync, renameSync } from "node:fs";
import { robotsAllows } from "./news-lib.mjs";
import { VOIVODESHIPS } from "../js/content.js";
import { parseGddkia, parseRss, parseHtmlList, discoverFeeds, discoverRssPages, toItem, mergeItems } from "./news-lib.mjs";
import { SOURCES } from "./news-sources.mjs";

const OUT = process.env.NEWS_OUT || "news.json";
const REPORT = process.env.NEWS_REPORT_OUT || "news-report.json";
const UA = "EGIDA/0.3 (unofficial PWA; reads public news pages of Polish public institutions every ~15 min; repo lewym90/egida)";
const CACHE = process.env.NEWS_CACHE_FILE || "news-feeds.json"; // znalezione adresy kanałów RSS (żeby nie szukać ich co 15 min)
const DUMP = process.argv.includes("--dump");
const now = Date.now();

const robotsCache = new Map();
async function robotsOk(url) { // dla mediów: szanujemy robots.txt rozgłośni
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    try { const r = await fetch(u.origin + "/robots.txt", { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10000) }); robotsCache.set(u.origin, r.ok ? await r.text() : ""); }
    catch { robotsCache.set(u.origin, ""); }
  }
  return robotsAllows(robotsCache.get(u.origin), u.pathname + u.search);
}
let cache = {}; try { cache = JSON.parse(readFileSync(CACHE, "utf8")); } catch { /* pierwszy przebieg */ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastAt = new Map(); // grzeczność: min. 1,2 s między zapytaniami do tej samej domeny nadrzędnej (policja.gov.pl itp.)
const family = (u) => new URL(u).hostname.split(".").slice(-3).join(".");
async function get(url) {
  const fam = family(url), wait = 1200 - (Date.now() - (lastAt.get(fam) || 0));
  lastAt.set(fam, Date.now() + Math.max(0, wait));
  if (wait > 0) await sleep(wait);
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  // Kodowanie z nagłówka XML (np. windows-1250 / iso-8859-2), żeby polskie litery się nie psuły.
  const buf = new Uint8Array(await r.arrayBuffer()), head = new TextDecoder("latin1").decode(buf.slice(0, 200)), enc = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1] || "utf-8";
  try { return new TextDecoder(enc).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

async function runSource(src) {
  const rep = { id: src.id, label: src.label, region: src.region, ok: false, fetched: 0, kept: 0, error: null, urls: [] };
  const raws = [];
  try {
    let urls = src.urls || [];
    if (src.discover) { // kanały RSS Policji różnią się adresem między jednostkami: szukamy raz, potem pamiętamy
      if (cache[src.id]?.length) { urls = cache[src.id]; rep.fromCache = true; }
      else {
        try {
          const html = await get(src.discover);
          let found = discoverFeeds(html, src.discover);
          if (!found.length) for (const pg of discoverRssPages(html, src.discover)) { // strona „Kanały RSS” jednostki
            try {
              const pageHtml = await get(pg);
              found = discoverFeeds(pageHtml, pg);
              (rep.rssPages ||= []).push({ url: pg, bytes: pageHtml.length, rssHrefs: [...pageHtml.matchAll(/href\s*=\s*["']([^"']*rss[^"']*)["']/gi)].map((m) => m[1]).slice(0, 8) }); // diagnostyka: jak naprawdę wyglądają linki
            } catch (e) { rep.discoverError = String(e.message || e); }
            if (found.length) break;
          }
          found = found.slice(0, 3);
          rep.discovered = found.length;
          if (found.length) { urls = found; cache[src.id] = found; }
        } catch (e) { rep.discoverError = String(e.message || e); }
      }
      if (!urls.length && !src.htmlFallback) throw new Error(rep.discoverError || "nie znaleziono kanału RSS na stronie");
    }
    for (const u of urls) {
      try {
        if (src.kind === "media" && !(await robotsOk(u))) throw new Error("robots.txt rozgłośni zabrania pobierania – pomijam");
        const body = await get(u);
        const items = src.kind === "gddkia" ? parseGddkia(body, now, VOIVODESHIPS.map((v) => v.id)) : src.kind === "rss" || src.kind === "media" ? parseRss(body) : parseHtmlList(body, u);
        rep.urls.push({ url: u, status: 200, items: items.length });
        raws.push(...items);
        if (items.length) break; // pierwszy działający adres wystarcza
      } catch (e) { rep.urls.push({ url: u, error: String(e.message || e) }); }
    }
    if (!raws.length && src.htmlFallback) { // zapasowo: lista „Aktualności” ze strony jednostki
      try { const html = await get(src.htmlFallback); const items = parseHtmlList(html, src.htmlFallback);
        if (items.length < 3) rep.htmlSample = [...html.matchAll(/<a[^>]+href\s*=\s*["'][^"']*\/\d{4,},[^>]*>/gi)].slice(0, 2).map((m) => html.slice(Math.max(0, m.index - 150), m.index + 1400));; // diagnostyka układu strony
        rep.urls.push({ url: src.htmlFallback, status: 200, items: items.length, fallback: true }); raws.push(...items); }
      catch (e) { rep.urls.push({ url: src.htmlFallback, error: String(e.message || e), fallback: true }); }
    }
    rep.fetched = raws.length;
    rep.ok = rep.urls.some((x) => x.status === 200 && x.items > 0);
    if (!rep.ok) rep.error = rep.urls.map((x) => x.error).filter(Boolean)[0] || "brak wpisów w odpowiedzi";
  } catch (e) { rep.error = String(e.message || e); }
  const items = raws.map((r) => toItem(r, src, now)).filter(Boolean);
  if (src.noCap) items.noCap = true;
  rep.kept = items.length;
  return { rep, items };
}

const results = [];
const queue = [...SOURCES];
await Promise.all(Array.from({ length: 3 }, async () => { for (let s; (s = queue.shift()); ) results.push(await runSource(s)); })); // 3 równolegle, ale zapytania do jednej domeny idą z odstępem

const items = mergeItems(results.map((r) => r.items), now);
const okCount = results.filter((r) => r.rep.ok).length;
const report = { generatedAt: new Date(now).toISOString(), sources: SOURCES.length, ok: okCount, items: items.length, details: results.map((r) => r.rep).sort((a, b) => a.id.localeCompare(b.id)) };
for (const d of report.details) console.log(`${d.ok ? "OK " : "ERR"} ${d.id.padEnd(22)} pobrano ${d.fetched}, po filtrze ${d.kept}${d.error ? " – " + d.error : ""}`);
console.log(`Źródła: ${okCount}/${SOURCES.length}, wpisów w news.json: ${items.length}`);
if (DUMP) process.exit(0);

if (!okCount) { console.log("Żadne źródło nie odpowiedziało – zostaje poprzedni news.json"); try { writeFileSync(REPORT, JSON.stringify(report, null, 1)); } catch { /* ignoruj */ } process.exit(1); }
try { writeFileSync(CACHE, JSON.stringify(cache)); } catch { /* ignoruj */ }
const save = (file, obj) => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(obj)); renameSync(tmp, file); };
// Wpisy ze źródeł, które chwilowo zawiodły, zachowujemy z poprzedniego pliku (do limitu wieku), aby wiadomość nie znikała przez jeden błąd sieci.
let prev = []; try { prev = JSON.parse(readFileSync(OUT, "utf8")).items || []; } catch { /* pierwszy przebieg */ }
const failedLabels = new Set(results.filter((r) => !r.rep.ok).map((r) => r.rep.label));
const keep = prev.filter((p) => failedLabels.has(p.source));
save(OUT, { generatedAt: report.generatedAt, items: mergeItems([items, keep], now) });
save(REPORT, report);
