// Testy v17: „Ważne w regionie” – parsery RSS/HTML, filtry, deduplikacja (serwer) i logika aplikacji (js/news.js). Dane SZTUCZNE.
import assert from "node:assert/strict";
import { parseRss, parseHtmlList, discoverFeeds, discoverRssPages, passesFilter, toItem, mergeItems, safeHttps } from "../server/news-lib.mjs";
import { SOURCES } from "../server/news-sources.mjs";
import { newsForRegion, newsFresh, ageLabel, normalizeNews, NEWS_STALE_H } from "../js/news.js";
import { VOIVODESHIPS } from "../js/content.js";
let n = 0;
const ok = (name, fn) => { try { fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };
const NOW = Date.parse("2026-10-11T10:00:00Z");

const RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Policja Mazowiecka - Aktualności</title><link>https://mazowiecka.policja.gov.pl</link>
<item><title>Policjanci zabezpieczyli niebezpieczny arsenał 14-latka</title><link>https://mazowiecka.policja.gov.pl/ra/aktualnosci/aktualnosci/139552,Policjanci.html</link><description>Błyskawiczna reakcja policjantów z Garwolina &amp; spółka</description><pubDate>Sat, 10 Oct 2026 15:50:00 +0200</pubDate></item>
<item><title>Narkotyki w samochodzie</title><link>https://mazowiecka.policja.gov.pl/ra/aktualnosci/aktualnosci/139492,Narkotyki.html</link><description>Siedleccy kryminalni</description><pubDate>Sun, 11 Oct 2026 07:00:00 +0200</pubDate></item>
<item><title>Złośliwy</title><link>javascript:alert(1)</link><pubDate>Sun, 11 Oct 2026 07:00:00 +0200</pubDate></item>
</channel></rss>`;

ok("RSS: parsowanie, encje, odrzucenie linków innych niż https", () => {
  const r = parseRss(RSS);
  assert.equal(r.length, 2);
  assert.match(r[0].summary, /Garwolina & spółka/);
  assert.equal(r[0].date, "2026-10-10T13:50:00.000Z");
});
ok("RSS: zepsuty XML nie wywala", () => { assert.deepEqual(parseRss("<rss><channel><item>"), []); assert.deepEqual(parseRss(""), []); });
ok("Atom", () => {
  const r = parseRss(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Ostrzeżenie przed burzami</title><link rel="alternate" href="https://example.gov.pl/a"/><updated>2026-10-11T08:00:00Z</updated><summary>x</summary></entry></feed>`);
  assert.equal(r.length, 1); assert.equal(r[0].url, "https://example.gov.pl/a");
});
ok("odkrywanie kanałów RSS Policji ze strony głównej", () => {
  const html = `<a href="/dokumenty/rss/271-rss-o-1488.rss">RSS</a><a href='/dokumenty/rss/271-rss-s-9.rss'>x</a><link rel="alternate" type="application/rss+xml" href="/dokumenty/rss/5-rss-o-3.rss">`;
  const f = discoverFeeds(html, "https://mazowiecka.policja.gov.pl/");
  assert.ok(f[0].includes("rss-o-"));
  assert.ok(f.every((u) => u.startsWith("https://mazowiecka.policja.gov.pl/dokumenty/rss/")));
  assert.equal(discoverFeeds("<html></html>", "https://x.pl/").length, 0);
});
ok("strona „Kanały RSS” jednostki: link /ra/rss albo odgadnięty z /opo/sitemap", () => {
  assert.deepEqual(discoverRssPages('<a href="/ra/rss">RSS</a>', "https://mazowiecka.policja.gov.pl/"), ["https://mazowiecka.policja.gov.pl/ra/rss"]);
  assert.deepEqual(discoverRssPages('<a href="/opo/sitemap">Mapa</a>', "https://opole.policja.gov.pl/"), ["https://opole.policja.gov.pl/opo/rss"]);
  assert.deepEqual(discoverRssPages("<p>nic</p>", "https://x.pl/"), []);
});
const HTML = `<ul><li><img src="a.jpg"><div>08.10.2026</div><a href="https://www.gov.pl/web/premier/szybka-reakcja-rzadu-na-przemoc-w-szkolach">Szybka reakcja rządu na przemoc w szkołach</a></li>
<li><span>06.10.2026</span><a href="/web/rcb/komunikat-w-sprawie-pogody">Komunikat w sprawie pogody na weekend</a></li>
<li><a href="/web/rcb/bez-daty-bez-daty-bez-daty">Wpis bez żadnej daty w pobliżu linku</a></li><li><a href="/x">Menu</a></li></ul>`;
ok("lista HTML (gov.pl): data + link, względne adresy, pomija wpisy bez daty i krótkie linki", () => {
  const r = parseHtmlList(HTML, "https://www.gov.pl/web/rcb");
  assert.equal(r.length, 2);
  assert.equal(r[1].url, "https://www.gov.pl/web/rcb/komunikat-w-sprawie-pogody");
  assert.ok(r[0].date.startsWith("2026-10-08"));
});
ok("filtr bezpieczeństwa: łapie szkołę/groźby, odrzuca rutynę", () => {
  assert.ok(passesFilter("safety", "Alarm bombowy w szkole – ewakuacja"));
  assert.ok(passesFilter("safety", "Apel policji o ostrożność", ""));
  assert.ok(passesFilter("safety", "Fałszywe informacje o zagrożeniu w szkołach"));
  assert.ok(!passesFilter("safety", "Narkotyki w samochodzie", "Siedleccy kryminalni"));
  assert.ok(!passesFilter("safety", "Rozprawa apelacyjna w sądzie"));
  assert.ok(passesFilter("all", "cokolwiek"));
  assert.ok(passesFilter("school", "Komunikat w sprawie bezpieczeństwa uczniów"));
  assert.ok(!passesFilter("school", "Konkurs plastyczny dla klas IV–VI"));
});
const SRC = { filter: "safety", label: "Policja Mazowiecka", region: "mazowieckie", kind: "rss" };
ok("toItem: stare, przyszłe i bez daty odpadają; poprawny wpis ma region i źródło", () => {
  const base = { title: "Zagrożenie bombowe w szkole", url: "https://a.pl/x?utm=1", summary: "" };
  assert.equal(toItem({ ...base, date: "2026-09-01T00:00:00Z" }, SRC, NOW), null);
  assert.equal(toItem({ ...base, date: "2026-10-20T00:00:00Z" }, SRC, NOW), null);
  assert.equal(toItem({ ...base, date: null }, SRC, NOW), null);
  const it = toItem({ ...base, date: "2026-10-10T12:00:00Z" }, SRC, NOW);
  assert.equal(it.region, "mazowieckie"); assert.equal(it.source, "Policja Mazowiecka"); assert.equal(it.id, "a.pl/x");
});
ok("mergeItems: deduplikacja, sortowanie, limit na źródło", () => {
  const mk = (i, d) => ({ id: "a/" + i, title: "t" + i, summary: "", url: "https://a/" + i, date: d, source: "s", region: "all", kind: "rss" });
  const A = Array.from({ length: 30 }, (_, i) => mk(i, new Date(NOW - i * 36e5).toISOString()));
  const m = mergeItems([A, [mk(0, A[0].date)]], NOW);
  assert.equal(m.length, 15);
  assert.equal(m[0].id, "a/0");
  assert.ok(m.every((x, i) => i === 0 || m[i - 1].date >= x.date));
});
ok("safeHttps", () => { assert.equal(safeHttps("http://a.pl"), null); assert.equal(safeHttps("data:text/html,x"), null); assert.ok(safeHttps("https://a.pl/x")); });
ok("źródła: 16 jednostek Policji, wszystkie id województw istnieją, adresy https", () => {
  const ids = new Set(VOIVODESHIPS.map((v) => v.id));
  assert.equal(SOURCES.filter((s) => s.id.startsWith("kwp-")).length, 16);
  for (const s of SOURCES) { assert.ok(s.region === "all" || s.region === "mixed" || ids.has(s.region), s.id); assert.ok(["rss", "html"].includes(s.kind)); for (const u of [...(s.urls || []), s.discover].filter(Boolean)) assert.ok(u.startsWith("https://"), u); }
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length);
});

// --- aplikacja ---
const FEED = { generatedAt: "2026-10-11T09:50:00Z", items: [
  { id: "1", title: "Mazowsze 1", url: "https://a/1", date: "2026-10-11T08:00:00Z", source: "Policja Mazowiecka", region: "mazowieckie", summary: "" },
  { id: "2", title: "Lubelskie 1", url: "https://a/2", date: "2026-10-11T07:00:00Z", source: "Policja Lubelska", region: "lubelskie", summary: "" },
  { id: "3", title: "Cała Polska", url: "https://a/3", date: "2026-10-10T07:00:00Z", source: "MEN", region: "all", summary: "" },
  { id: "4", title: "x", url: "javascript:alert(1)", date: "2026-10-10T07:00:00Z", source: "zły", region: "all" },
  { id: "6", title: "Portal krajowy", url: "https://a/6", date: "2026-10-10T05:00:00Z", source: "Policja (portal krajowy)", region: "mixed" },
  { id: "5", title: "Nieznane woj.", url: "https://a/5", date: "2026-10-10T06:00:00Z", source: "s", region: "marsjanskie" },
] };
ok("normalizeNews: odrzuca niebezpieczne adresy i nieznane województwa", () => {
  const f = normalizeNews(FEED);
  assert.deepEqual(f.items.map((x) => x.id), ["1", "2", "3", "6"]);
  assert.equal(normalizeNews(null), null); assert.equal(normalizeNews({ items: "x" }), null);
});
ok("newsForRegion: województwo użytkownika + ogólnopolskie; bez regionu – wszystko", () => {
  const f = normalizeNews(FEED);
  assert.deepEqual(newsForRegion(f, "mazowieckie").map((x) => x.id), ["1", "3"]);
  assert.deepEqual(newsForRegion(f, "lubelskie").map((x) => x.id), ["2", "3"]);
  assert.equal(newsForRegion(f, null).length, 4); // „Wszystkie regiony” zawiera też portal krajowy
  assert.ok(!newsForRegion(f, "mazowieckie").some((x) => x.region === "mixed"), "portal krajowy nie trafia do Mojego województwa");
  assert.ok(!newsForRegion(f, null, { onlyAll: true }).some((x) => x.region === "mixed"));
  assert.equal(newsForRegion(f, "mazowieckie", { max: 1 }).length, 1);
  assert.deepEqual(newsForRegion(f, "mazowieckie", { onlyRegion: true }).map((x) => x.id), ["1"]);
});
ok("newsFresh: po NEWS_STALE_H godzinach dane uznajemy za nieaktualne", () => {
  assert.equal(newsFresh(normalizeNews(FEED), NOW), true);
  assert.equal(newsFresh(normalizeNews(FEED), NOW + (NEWS_STALE_H + 1) * 36e5), false);
  assert.equal(newsFresh(null, NOW), false);
});
ok("ageLabel", () => {
  assert.equal(ageLabel("2026-10-11T09:30:00Z", NOW), "30 min temu");
  assert.equal(ageLabel("2026-10-11T07:00:00Z", NOW), "3 godz. temu");
  assert.equal(ageLabel("2026-10-09T07:00:00Z", NOW), "2 dni temu");
  assert.equal(ageLabel("2026-10-10T07:00:00Z", NOW), "wczoraj");
  assert.equal(ageLabel("2026-10-11T10:00:30Z", NOW), "przed chwilą");
});
console.log(`test-v17: OK (${n} grup)`);
