// Testy v17: „Ważne w regionie” – parsery RSS/HTML, filtry, deduplikacja (serwer) i logika aplikacji (js/news.js). Dane SZTUCZNE.
import assert from "node:assert/strict";
import { passesMedia, robotsAllows, parseGddkia, warsawToMs, parseRss, parseHtmlList, discoverFeeds, discoverRssPages, passesFilter, toItem, mergeItems, safeHttps } from "../server/news-lib.mjs";
import { SOURCES } from "../server/news-sources.mjs";
import { roadsForRegion, newsForRegion, newsFresh, ageLabel, normalizeNews, NEWS_STALE_H } from "../js/news.js";
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
ok("lista HTML policji: data po streszczeniu (po linku), bez pożyczania daty od sąsiedniego wpisu", () => {
  const h = `<div><h3><a href="/pom/informacje/wiadomosci/159579,Zakonczyla-sie-edycja.html">Zakończyła się XIX edycja PARAMEDYK 2026 w Trójmieście</a></h3><p>Zespół wygrał krajowe zawody taktyczno-medyczne. 09.10.2026 KWP w Gdańsku</p></div>
  <div><h3><a href="/pom/informacje/wiadomosci/159571,Dzieki-kryminalnym.html">Dzięki kryminalnym z Oruni ponad 400 porcji narkotyków</a></h3><p>Mężczyzna ukrywał środki w mieszkaniu.</p></div>`;
  const r = parseHtmlList(h, "https://pomorska.policja.gov.pl/pom/informacje/wiadomosci");
  assert.equal(r.length, 1);
  assert.ok(r[0].date.startsWith("2026-10-09"));
});
ok("lista HTML policji: karta w jednym linku (obrazek, tytuł, streszczenie, <time datetime>)", () => {
  const card = (id, t, d) => `<li class="nnews"><a href="/lub/aktualnosci/${id},Slug.html" class="grid"><div class="img-holder" style="background-image:url(/x.png)"></div><div class="col"><h3>${t}</h3><p>${"Długie streszczenie wpisu. ".repeat(20)}</p><time datetime="${d}">11.10.2026</time><span class="dodatek">KGP</span></div></a></li>`;
  const r = parseHtmlList(card(173279, "Tymczasowy areszt dla 24-latka za udział w bójce z użyciem noża", "2026-10-11") + card(173281, "Podsumowanie tygodnia w Ośrodku Szkolenia Policji w Lublinie", "2026-10-10"), "https://lubelska.policja.gov.pl/lub/aktualnosci");
  assert.equal(r.length, 2);
  assert.equal(r[0].title, "Tymczasowy areszt dla 24-latka za udział w bójce z użyciem noża");
  assert.ok(r[1].date.startsWith("2026-10-10"));
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
ok("mergeItems: ta sama wiadomość z portalu krajowego i z komendy – zostaje wersja z komendy", () => {
  const a = { id: "p/1", title: "Miał do odsiadki ponad 3 lata za oszustwa!", summary: "", url: "https://p/1", date: "2026-10-11T08:00:00.000Z", source: "Policja (portal krajowy)", region: "mixed", kind: "rss" };
  const b = { ...a, id: "d/2", url: "https://d/2", source: "Policja Dolnośląska", region: "dolnoslaskie" };
  assert.deepEqual(mergeItems([[a], [b]], NOW).map((x) => x.region), ["dolnoslaskie"]);
  assert.deepEqual(mergeItems([[b], [a]], NOW).map((x) => x.region), ["dolnoslaskie"]);
});
const XML = `<?xml version="1.0" encoding="UTF-8"?><utrudnienia gen="2026-10-11T16:18:01+0200">
<utr><typ>W</typ><nr_drogi>A1</nr_drogi><woj>pomorskie</woj><km>44.350</km><nazwa_odcinka>Kopytkowo - Pelplin</nazwa_odcinka><data_powstania>2026-10-11 14:45:00</data_powstania><data_likwidacji>2026-10-11 20:30:00</data_likwidacji><objazd>Kierunek Gdańsk</objazd><skutki>Zablokowana jezdnia prawa</skutki><droga_zamknieta>false</droga_zamknieta></utr>
<utr><typ>U</typ><nr_drogi>A1</nr_drogi><woj>pomorskie</woj><km>65.1</km><nazwa_odcinka>Kopytkowo - Warlubie</nazwa_odcinka><data_powstania>2026-09-23 06:00:00</data_powstania><data_likwidacji>2026-11-08 18:00:00</data_likwidacji><skutki>Zwężenie</skutki><droga_zamknieta>false</droga_zamknieta></utr>
<utr><typ>U</typ><nr_drogi>DK19</nr_drogi><woj>podkarpackie</woj><km>10</km><nazwa_odcinka>Rzeszów - Boguchwała</nazwa_odcinka><data_powstania>2026-10-01 06:00:00</data_powstania><data_likwidacji>2026-10-30 18:00:00</data_likwidacji><skutki>Przebudowa mostu</skutki><droga_zamknieta>true</droga_zamknieta></utr>
<utr><typ>W</typ><nr_drogi>DK8</nr_drogi><woj>łódzkie</woj><km>5</km><nazwa_odcinka>Zakończone</nazwa_odcinka><data_powstania>2026-10-11 08:00:00</data_powstania><data_likwidacji>2026-10-11 10:00:00</data_likwidacji><skutki>Wypadek</skutki></utr>
<utr><typ>W</typ><nr_drogi>DK7</nr_drogi><woj>nieznane</woj><km>1</km><data_powstania>2026-10-11 08:00:00</data_powstania></utr></utrudnienia>`;
ok("GDDKiA: czas polski (lato/zima), zdarzenia i zamknięcia tak, roboty i zakończone nie", () => {
  assert.equal(new Date(warsawToMs("2026-10-11 14:45:00")).toISOString(), "2026-10-11T12:45:00.000Z");
  assert.equal(new Date(warsawToMs("2026-11-08 10:00:00")).toISOString(), "2026-11-08T09:00:00.000Z");
  const r = parseGddkia(XML, NOW + 3 * 36e5, VOIVODESHIPS.map((v) => v.id)); // „teraz” = 13:00Z
  assert.deepEqual(r.map((x) => x.region), ["pomorskie", "podkarpackie"]);
  assert.match(r[0].title, /^A1 · Kopytkowo - Pelplin: zablokowana jezdnia prawa$/);
  assert.match(r[1].title, /droga zamknięta/);
  assert.ok(r.every((x) => x.url.startsWith("https://drogi.gddkia.gov.pl/")));
  const it = toItem(r[1], { filter: "all", label: "GDDKiA (drogi krajowe)", region: "all", kind: "gddkia" }, NOW + 3 * 36e5);
  assert.equal(it.region, "podkarpackie"); assert.ok(it.until); // trwające zamknięcie nie odpada po 14 dniach
  assert.equal(mergeItems([[it]], NOW + 3 * 36e5).length, 1);
});
ok("media: poważne zdarzenia tak, sport/kultura/rozmowy nie", () => {
  for (const t of ["Dachowanie samochodu na S12 pod Lublinem. Zablokowany prawy pas ruchu", "Pożar hali w Radomiu. Ewakuowano pracowników", "Alarm bombowy w szkole. Policja sprawdza budynek", "Nie żyje 18-latek. Tragiczny wypadek na DK 17", "Ostrzeżenie przed wichurami w regionie"]) assert.ok(passesMedia(t), t);
  for (const t of ["Porażka Czarnych w Zamościu", "Mariusz Kamiński „Historia z drugiej ręki” | Reportaż", "Koncert w filharmonii. Atak bólu w wykonaniu zespołu", "Piotr Robakowski, ekspert ds. bezpieczeństwa, będzie Gościem Radia Gdańsk", "Wiadomości sportowe: mecz z zagrożeniem spadku", "Targi Gesty [WIDEO, ZDJĘCIA]"]) assert.ok(!passesMedia(t), t);
});
ok("media: wpis z radia ma etykietę kind=media, bez streszczenia i z regionem rozgłośni", () => {
  const src = SOURCES.find((x) => x.id === "radio-lubelskie");
  const it = toItem({ title: "Dachowanie samochodu na S12. Zablokowany prawy pas ruchu", url: "https://radio.lublin.pl/a", date: "2026-10-11T09:14:00Z", summary: "Treść, której nie pokazujemy" }, src, NOW);
  assert.equal(it.kind, "media"); assert.equal(it.summary, ""); assert.equal(it.region, "lubelskie"); assert.equal(it.source, "Radio Lublin");
  assert.equal(SOURCES.filter((x) => x.kind === "media").length, 15);
});
ok("robots.txt: Disallow dla * blokuje, Allow doprecyzowuje, brak pliku = wolno", () => {
  assert.equal(robotsAllows("User-agent: *\nDisallow: /", "/feed/"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php", "/feed/"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /feed", "/feed/"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /feed\nAllow: /feed/$", "/feed/"), true);
  assert.equal(robotsAllows("User-agent: Googlebot\nDisallow: /", "/feed/"), true);
  assert.equal(robotsAllows("", "/feed/"), true);
});
ok("mergeItems: oficjalne źródło wygrywa z mediami przy tej samej wiadomości", () => {
  const a = { id: "m/1", title: "Pożar hali w Radomiu", summary: "", url: "https://m/1", date: "2026-10-11T08:00:00.000Z", source: "Radio X", region: "mazowieckie", kind: "media" };
  const b = { ...a, id: "p/1", url: "https://p/1", source: "Policja Mazowiecka", kind: "rss" };
  assert.deepEqual(mergeItems([[a], [b]], NOW).map((x) => x.kind), ["rss"]);
});
ok("GDDKiA: osobno od wiadomości, tylko dla swojego województwa i tylko trwające", () => {
  const f = normalizeNews({ generatedAt: "2026-10-11T09:50:00Z", items: [
    { id: "g1", title: "A1 · Kopytkowo - Pelplin: zablokowana jezdnia prawa", url: "https://drogi.gddkia.gov.pl/informacje-drogowe/lista-utrudnien", date: "2026-10-11T08:00:00Z", until: "2026-10-11T12:00:00Z", source: "GDDKiA (drogi krajowe)", region: "pomorskie", kind: "gddkia" },
    { id: "g2", title: "DK17: droga zamknięta", url: "https://drogi.gddkia.gov.pl/informacje-drogowe/lista-utrudnien", date: "2026-10-11T07:00:00Z", until: "2026-10-11T08:00:00Z", source: "GDDKiA (drogi krajowe)", region: "pomorskie", kind: "gddkia" },
    { id: "n1", title: "Wiadomość", url: "https://a/1", date: "2026-10-11T07:00:00Z", source: "Policja Pomorska", region: "pomorskie", kind: "rss" }] });
  assert.deepEqual(newsForRegion(f, "pomorskie").map((x) => x.id), ["n1"]);
  assert.deepEqual(newsForRegion(f, null).map((x) => x.id), ["n1"]);
  assert.deepEqual(roadsForRegion(f, "pomorskie", {}, NOW).map((x) => x.id), ["g1"]);
  assert.deepEqual(roadsForRegion(f, "lubelskie", {}, NOW), []);
  assert.deepEqual(roadsForRegion(f, null, {}, NOW), []);
});
ok("safeHttps", () => { assert.equal(safeHttps("http://a.pl"), null); assert.equal(safeHttps("data:text/html,x"), null); assert.ok(safeHttps("https://a.pl/x")); });
ok("źródła: 16 jednostek Policji, wszystkie id województw istnieją, adresy https", () => {
  const ids = new Set(VOIVODESHIPS.map((v) => v.id));
  assert.equal(SOURCES.filter((s) => s.id.startsWith("kwp-")).length, 16);
  for (const s of SOURCES) { assert.ok(s.region === "all" || s.region === "mixed" || ids.has(s.region), s.id); assert.ok(["rss", "html", "gddkia", "media"].includes(s.kind)); for (const u of [...(s.urls || []), s.discover].filter(Boolean)) assert.ok(u.startsWith("https://"), u); }
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
