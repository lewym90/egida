// EGIDA – „Ważne w regionie”: zbiera aktualności z OFICJALNYCH źródeł (Policja, MEN, RCB, urzędy wojewódzkie, kuratoria) do news.json.
// Nic nie jest pisane ręcznie ani zatwierdzane przez człowieka; źródło i link do oryginału zawsze zostają przy wpisie.
// Nie omijamy zabezpieczeń: odpowiedź inna niż 200 = źródło pomijamy (raz na przebieg, bez ponawiania) i zapisujemy to w news-report.json.
//   node news-sync.mjs            – normalny przebieg (zapis $NEWS_OUT i $NEWS_REPORT_OUT)
//   node news-sync.mjs --dump     – tylko wypisz raport, nic nie zapisuj
import { writeFileSync, readFileSync, renameSync } from "node:fs";
import { parseRss, parseHtmlList, discoverFeeds, toItem, mergeItems } from "./news-lib.mjs";
import { SOURCES } from "./news-sources.mjs";

const OUT = process.env.NEWS_OUT || "news.json";
const REPORT = process.env.NEWS_REPORT_OUT || "news-report.json";
const UA = "EGIDA/0.3 (unofficial PWA; reads public news pages of Polish public institutions every ~15 min; repo lewym90/egida)";
const DUMP = process.argv.includes("--dump");
const now = Date.now();

async function get(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function runSource(src) {
  const rep = { id: src.id, label: src.label, region: src.region, ok: false, fetched: 0, kept: 0, error: null, urls: [] };
  const raws = [];
  try {
    let urls = src.urls || [];
    if (src.discover) { // kanały RSS Policji różnią się adresem między jednostkami: odczytujemy je ze strony głównej
      try {
        const html = await get(src.discover);
        const found = discoverFeeds(html, src.discover).slice(0, 3);
        rep.discovered = found.length;
        if (found.length) urls = found;
      } catch (e) { rep.discoverError = String(e.message || e); }
      if (!urls.length) throw new Error(rep.discoverError || "nie znaleziono kanału RSS na stronie");
    }
    for (const u of urls) {
      try {
        const body = await get(u);
        const items = src.kind === "rss" ? parseRss(body) : parseHtmlList(body, u);
        rep.urls.push({ url: u, status: 200, items: items.length });
        raws.push(...items);
        if (items.length) break; // pierwszy działający adres wystarcza
      } catch (e) { rep.urls.push({ url: u, error: String(e.message || e) }); }
    }
    rep.fetched = raws.length;
    rep.ok = rep.urls.some((x) => x.status === 200 && x.items > 0);
    if (!rep.ok) rep.error = rep.urls.map((x) => x.error).filter(Boolean)[0] || "brak wpisów w odpowiedzi";
  } catch (e) { rep.error = String(e.message || e); }
  const items = raws.map((r) => toItem(r, src, now)).filter(Boolean);
  rep.kept = items.length;
  return { rep, items };
}

const results = [];
const queue = [...SOURCES];
await Promise.all(Array.from({ length: 4 }, async () => { for (let s; (s = queue.shift()); ) results.push(await runSource(s)); })); // 4 równolegle, grzecznie

const items = mergeItems(results.map((r) => r.items), now);
const okCount = results.filter((r) => r.rep.ok).length;
const report = { generatedAt: new Date(now).toISOString(), sources: SOURCES.length, ok: okCount, items: items.length, details: results.map((r) => r.rep).sort((a, b) => a.id.localeCompare(b.id)) };
for (const d of report.details) console.log(`${d.ok ? "OK " : "ERR"} ${d.id.padEnd(22)} pobrano ${d.fetched}, po filtrze ${d.kept}${d.error ? " – " + d.error : ""}`);
console.log(`Źródła: ${okCount}/${SOURCES.length}, wpisów w news.json: ${items.length}`);
if (DUMP) process.exit(0);

if (!okCount) { console.log("Żadne źródło nie odpowiedziało – zostaje poprzedni news.json"); try { writeFileSync(REPORT, JSON.stringify(report, null, 1)); } catch { /* ignoruj */ } process.exit(1); }
const save = (file, obj) => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(obj)); renameSync(tmp, file); };
// Wpisy ze źródeł, które chwilowo zawiodły, zachowujemy z poprzedniego pliku (do limitu wieku), aby wiadomość nie znikała przez jeden błąd sieci.
let prev = []; try { prev = JSON.parse(readFileSync(OUT, "utf8")).items || []; } catch { /* pierwszy przebieg */ }
const failedLabels = new Set(results.filter((r) => !r.rep.ok).map((r) => r.rep.label));
const keep = prev.filter((p) => failedLabels.has(p.source));
save(OUT, { generatedAt: report.generatedAt, items: mergeItems([items, keep], now) });
save(REPORT, report);
