// Testy v37: ustalanie miejsca wiadomości (odmiany, kategorie, adres, artykuł, konflikty), „Ze świata” (ścisła reguła), trzy grupy w aplikacji. Dane SZTUCZNE.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findPlaces, resolvePlace, regionFromLabel, regionFromUrl, nationalScope } from "../server/news-geo.mjs";
import { toItem, needsArticle, articleInfo, parseRss, passesFilter } from "../server/news-lib.mjs";
import { SOURCES } from "../server/news-sources.mjs";
import { APTECZKA } from "../js/content.js";
import { normalizeNews, newsGroup, groupLabel, newsCounts, newsForRegion, NEWS_GROUPS } from "../js/news.js";
let n = 0;
const ok = (name, fn) => { try { fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };
const NOW = Date.parse("2026-10-11T10:00:00Z");
const reg = (t) => { const r = findPlaces(t); return r.strong.size === 1 ? [...r.strong][0] : r.strong.size ? "KONFLIKT" : null; };

ok("odmiany nazw: rzeczownik, miejscownik, przymiotnik, region", () => {
  const cases = {
    wielkopolskie: ["Poznań", "w Poznaniu", "z Poznania", "poznański", "Poznańskie", "poznańskiego", "Wielkopolska", "w Wielkopolsce", "wielkopolskie", "Kalisz", "w Kaliszu", "Konin", "w Koninie", "Gniezno", "w Gnieźnie", "Leszno", "w Lesznie", "leszczyński"],
    mazowieckie: ["Warszawa", "w Warszawie", "warszawski", "Radom", "w Radomiu", "Płock", "w Płocku", "Siedlce", "w Siedlcach", "Mazowsze", "na Mazowszu", "mazowieckie"],
    malopolskie: ["Kraków", "w Krakowie", "krakowski", "Tarnów", "w Tarnowie", "Nowy Sącz", "w Nowym Sączu", "Nowego Sącza", "Zakopane", "w Zakopanem", "Małopolska", "w Małopolsce"],
    slaskie: ["Katowice", "w Katowicach", "katowicki", "Gliwice", "Zabrze", "w Zabrzu", "Tychy", "w Tychach", "Bielsko-Biała", "Częstochowa", "w Częstochowie", "Zawiercie", "w Zawierciu", "Śląsk", "na Śląsku", "Górny Śląsk", "Dąbrowa Górnicza", "w Dąbrowie Górniczej", "Tarnowskie Góry", "w Tarnowskich Górach"],
    dolnoslaskie: ["Wrocław", "we Wrocławiu", "wrocławski", "Wałbrzych", "w Wałbrzychu", "Jelenia Góra", "w Jeleniej Górze", "Dolny Śląsk", "na Dolnym Śląsku", "dolnośląskie", "Lubin", "w Lubinie"],
    lubelskie: ["Lublin", "w Lublinie", "lubelski", "lubelskie", "Lubelszczyzna", "na Lubelszczyźnie", "Zamość", "w Zamościu", "Biała Podlaska", "w Białej Podlaskiej", "Puławy", "w Puławach"],
    lodzkie: ["w Łodzi", "łódzkie", "łódzki", "Łódź: pożar", "Piotrków Trybunalski", "Radomsko", "w Radomsku", "Tomaszów Mazowiecki"],
    podkarpackie: ["Rzeszów", "w Rzeszowie", "rzeszowski", "Przemyśl", "w Przemyślu", "Krosno", "w Krośnie", "Podkarpacie", "na Podkarpaciu", "Mielec", "w Mielcu"],
    pomorskie: ["Gdańsk", "w Gdańsku", "gdański", "Gdynia", "w Gdyni", "pomorskie", "Słupsk", "w Słupsku", "Kaszuby"],
    zachodniopomorskie: ["Szczecin", "w Szczecinie", "szczeciński", "Koszalin", "Kołobrzeg", "w Kołobrzegu", "zachodniopomorskie", "Pomorze Zachodnie"],
    "kujawsko-pomorskie": ["Bydgoszcz", "w Bydgoszczy", "bydgoski", "Toruń", "w Toruniu", "toruński", "Włocławek", "we Włocławku", "kujawsko-pomorskie", "Kujawsko-Pomorskie"],
    "warminsko-mazurskie": ["Olsztyn", "w Olsztynie", "olsztyński", "Elbląg", "w Elblągu", "Mazury", "na Mazurach", "warmińsko-mazurskie", "Giżycko"],
    podlaskie: ["Białystok", "w Białymstoku", "białostocki", "Suwałki", "w Suwałkach", "Podlasie", "na Podlasiu"],
    swietokrzyskie: ["Kielce", "w Kielcach", "kielecki", "w kieleckim", "świętokrzyskie", "Sandomierz"],
    opolskie: ["Opole", "w Opolu", "opolski", "opolskie", "Nysa Kłodzka" === 0 ? "" : "Kędzierzyn-Koźle", "w Kędzierzynie-Koźlu"],
    lubuskie: ["Zielona Góra", "w Zielonej Górze", "Gorzów Wielkopolski", "w Gorzowie Wielkopolskim", "lubuskie"],
  };
  for (const [id, list] of Object.entries(cases)) for (const t of list) assert.equal(reg(`Wypadek: ${t}, ranni`), id, `${t} → ${id}`);
});
ok("podobne nazwy się nie mylą", () => {
  assert.equal(reg("Pożar w Lublińcu"), "slaskie", "Lubliniec ≠ Lublin");
  assert.equal(reg("Pożar w Radomsku"), "lodzkie", "Radomsko ≠ Radom");
  assert.equal(reg("Pożar w Tarnowskich Górach"), "slaskie", "Tarnowskie Góry ≠ Tarnów");
  assert.equal(reg("Pożar na Dolnym Śląsku"), "dolnoslaskie", "Dolny Śląsk ≠ Śląsk");
  assert.equal(reg("Wypadek w Ostrowie Wielkopolskim"), "wielkopolskie");
  assert.equal(reg("Wypadek w Kostrzynie nad Odrą"), "lubuskie");
  assert.equal(reg("Wypadek w Kaliszu Pomorskim"), "zachodniopomorskie");
  assert.equal(reg("Wypadek w Kaliszu"), "wielkopolskie");
  assert.equal(reg("Policja radomska zatrzymała"), null, "radomski/radomska = Radom albo Radomsko → dwuznaczne, nie rozstrzyga");
  assert.equal(reg("Zbiórka dla dzieci z Mazowsza i Śląska"), "KONFLIKT");
  assert.equal(reg("Burze: pomorskie i zachodniopomorskie"), "KONFLIKT");
  assert.equal(reg("Pożar. Strażacy z Radomia i w Radomsku"), "KONFLIKT");
});
ok("słowa pospolite, nazwiska i łódź wodna nie dają miejsca", () => {
  assert.equal(reg("Z łodzi wypadł mężczyzna, łódź się wywróciła"), null);
  assert.equal(reg("Łódź z migrantami wywróciła się na Bałtyku"), null, "początek zdania + słowo pospolite = słabe");
  assert.equal(reg("Zatrzymano tych mężczyzn"), null, "„tych” to nie Tychy");
  assert.equal(reg("Jan Mazur zatrzymany za jazdę po pijanemu"), null);
  assert.equal(reg("Brzeg rzeki podmyty, wody w Piła i Puck bez zmian"), null, "nazwy dwuznaczne nie rozstrzygają");
  assert.equal(reg("Wydarzyło się na świecie"), null);
  assert.equal(reg("Gdzie jest ta Poręba? Wypadek na DK78"), null, "Poręba sama nie wystarcza");
});
ok("etykieta kategorii i adres", () => {
  assert.equal(regionFromLabel("Wielkopolskie"), "wielkopolskie");
  assert.equal(regionFromLabel("woj. śląskie"), "slaskie");
  assert.equal(regionFromLabel("Polska"), null);
  assert.equal(regionFromUrl("https://tvn24.pl/poznan/wypadek-na-a2-st123456"), "wielkopolskie");
  assert.equal(regionFromUrl("https://www.rmf24.pl/regiony/lodz/fakty/news-wypadek,nId,1"), "lodzkie");
  assert.equal(regionFromUrl("https://example.pl/polska/wypadek-w-poznaniu"), null, "ostatni segment (tytuł) pomijamy w adresie");
});
ok("warstwy: etykieta/tytuł → opis → artykuł; konflikt wstrzymuje", () => {
  assert.deepEqual(resolvePlace({ title: "Karambol na DK78. Są ranni", summary: "", cats: "Śląskie" }).region, "slaskie");
  assert.equal(resolvePlace({ title: "Karambol na DK78", summary: "Do wypadku doszło w Zawierciu." }).layer, "opis");
  assert.equal(resolvePlace({ title: "Karambol na DK78", summary: "", page: { text: "Do zdarzenia doszło w Porębie koło Zawiercia.", cats: "" } }).region, "slaskie");
  assert.equal(resolvePlace({ title: "Karambol na DK78", summary: "Ranni z Poznania i Gdańska" }).status, "conflict");
  assert.equal(resolvePlace({ title: "Wypadek w Poznaniu", cats: "Pomorskie" }).status, "conflict", "etykieta zaprzecza tytułowi = wstrzymanie");
  assert.equal(resolvePlace({ title: "Karambol na DK78" }).status, "none");
});
ok("Ze świata: ścisła reguła (temat + powiązanie z Polską/Ukrainą/Rosją/Białorusią/NATO/UE/Europą)", () => {
  assert.equal(nationalScope("Szef MI5: nie chcę brzmieć jak panikarz, ale terroryści mogą wkrótce użyć broni biologicznej", ""), "world", "wyjątek: ostrzeżenie służb wywiadowczych NATO");
  assert.equal(nationalScope("Szef MI5 chwali kampanię rekrutacyjną", ""), null);
  assert.equal(nationalScope("FBI aresztowało terrorystę w Teksasie", ""), null, "FBI/policja to sprawy krajowe USA");
  assert.equal(nationalScope("Szef MI5: Rosja przygotowuje broń biologiczną", "https://x.pl/swiat/a"), "world");
  assert.equal(nationalScope("Szef MI5 ostrzega przed bronią biologiczną. Zagrożenie dla Europy", ""), "world");
  assert.equal(nationalScope("Wybuch w Iraku. Zginęło dziesięć osób", "https://x.pl/swiat/a"), null);
  assert.equal(nationalScope("Plan zamachu na Grenlandii. Zatrzymano podejrzanych", ""), null);
  assert.equal(nationalScope("Atak nożownika w Teksasie", ""), null);
  assert.equal(nationalScope("Rosyjskie drony naruszyły przestrzeń powietrzną. Rosja atakuje Ukrainę", "https://x.pl/swiat/a"), "world");
  assert.equal(nationalScope("Rosyjskie drony nad Polską. Poderwano myśliwce", "https://x.pl/polska/a"), "all");
  assert.equal(nationalScope("Mecz Polska – Ukraina. Atak reprezentacji", ""), null, "sport odpada");
  assert.equal(nationalScope("Elektrownia jądrowa w Polsce. Wybrano wykonawcę", ""), null);
});

// --- pełna droga: portal krajowy ---
const NAT = { id: "media-test", label: "Portal testowy", region: "all", kind: "media", filter: "media", national: true };
const POL = { ...NAT, id: "media-testpl", label: "Portal polski", polishOnly: true };
const mk = (title, extra = {}, src = NAT) => toItem({ title, url: "https://portal.pl/" + (extra.path || "polska/") + encodeURIComponent(title).slice(0, 30), date: "2026-10-11T09:14:00Z", summary: "", ...extra }, src, NOW);
ok("portal krajowy: miejsce z kategorii/tytułu/opisu/artykułu", () => {
  assert.equal(mk("Pożar hali w Poznańskiem. Ranni").region, "wielkopolskie");
  assert.equal(mk("Nożownik zaatakował w centrum. Są ranni", { cats: "Mazowieckie" }).region, "mazowieckie");
  assert.equal(mk("Karambol na DK78. Nie żyje kierowca", { summary: "Do zderzenia doszło w Zawierciu." }, POL).region, "slaskie");
  assert.equal(mk("Laweta uderzyła w ogrodzenie cmentarza. Ranni", { page: { text: "Do wypadku doszło na DK78 w Porębie, w powiecie zawierciańskim, koło Zawiercia.", cats: "" } }, POL).region, "slaskie");
});
ok("portal krajowy: bez pewnego miejsca – nie zgadujemy, wpis pomijany", () => {
  assert.equal(mk("Karambol na DK78. Nie żyje kierowca", {}, POL), null);
  assert.equal(mk("Zderzenie z Poznania i Gdańska. Nie żyje kierowca", { summary: "Ranni z Poznania i Gdańska" }, POL), null, "konflikt = wstrzymanie");
  const why = []; toItem({ title: "Karambol na DK78. Nie żyje kierowca", url: "https://portal.pl/polska/x", date: "2026-10-11T09:14:00Z", summary: "" }, POL, NOW, why); assert.match(why[0].why, /miejsc/);
});
ok("portal krajowy: z kraju / ze świata / odrzucone", () => {
  assert.equal(mk("Zatrzymano mężczyznę planującego zamach w Polsce").region, "all");
  assert.equal(mk("Rosyjskie drony nad Polską. Poderwano myśliwce").region, "all");
  assert.equal(mk("Szef MI5: Rosja ma broń biologiczną. Zagrożenie dla Europy", { path: "swiat/" }).region, "world");
  assert.equal(mk("Wybuch w Iraku. Nie żyje dziesięć osób", { path: "swiat/" }), null);
  assert.equal(mk("Plan zamachu na Grenlandii. Zatrzymano podejrzanych", { path: "swiat/" }), null);
  assert.equal(mk("Atak nożownika w Teksasie. Nie żyją trzy osoby", { path: "swiat/" }, POL), null);
});
ok("zamach na władze Polski = z kraju, nawet gdy pada miasto; zdarzenie w obcym mieście nie jest nieprzypisane", () => {
  assert.equal(mk("Miał planować zamach na premiera. 66-latek już w prokuraturze w Warszawie").region, "all");
  assert.equal(mk("Podejrzany o zabójstwo zatrzymany w Manchesterze. Wszyscy w rękach policji", {}, POL), null);
});
ok("portal krajowy: miejsce z adresu artykułu (TVN24 /opole/, RMF24 /regiony/poznan/)", () => {
  const url = (u, title) => toItem({ title, url: u, date: "2026-10-11T09:14:00Z", summary: "" }, NAT, NOW);
  assert.equal(url("https://tvn24.pl/opole/kadlub-zabil-babcie-st1", "Zabił babcię i ojczyma. Prokuratura rozszerza zarzuty")?.region, "opolskie");
  assert.equal(url("https://www.rmf24.pl/regiony/poznan/news-x,nId,1", "Zabójstwo przy ulicy. Zatrzymano sprawcę")?.region, "wielkopolskie");
});
ok("portal krajowy: miejsce z odmiany – wszystkie formy, bez pomyłek", () => {
  for (const [t, id] of [["Pożar w Poznaniu. Ranni", "wielkopolskie"], ["Poznańskie: pożar. Ranni", "wielkopolskie"], ["Policja z poznańskiego: zamach? Zatrzymano", "wielkopolskie"], ["Wypadek we Wrocławiu. Ranni", "dolnoslaskie"], ["Wypadek w Lublinie. Ranni", "lubelskie"], ["Wypadek w Lublińcu. Ranni", "slaskie"]]) assert.equal(mk(t).region, id, t);
});
ok("rozgłośnia regionalna: nowa warstwa nie psuje starych zasad", () => {
  const src = SOURCES.find((x) => x.id === "radio-podkarpackie");
  const r = (title) => toItem({ title, url: "https://radio.rzeszow.pl/" + title.length, date: "2026-10-11T09:14:00Z", summary: "" }, src, NOW);
  assert.ok(r("Pożar hali w Mielcu. Ewakuowano pracowników"));
  assert.equal(r("Wypadek w Poznaniu. Ranni"), null);
  assert.equal(r("Katastrofa statku z migrantami. Nie żyje 139 osób"), null);
});
ok("strona artykułu: wyciąganie opisu, działu, miejsca, bez „Czytaj też”", () => {
  const html = `<html><head><meta property="og:description" content="Wypadek na DK78 w Porębie. Laweta uderzyła w ogrodzenie cmentarza."><meta property="article:section" content="Śląskie"><script type="application/ld+json">{"@type":"NewsArticle","keywords":["wypadek","DK78"],"contentLocation":{"name":"Zawiercie"}}</script></head><body><nav>Poznań Gdańsk Wrocław</nav><article><p>Czytaj też: wypadek w Poznaniu zablokował A2 na wiele godzin i spowodował korki</p><p>Do zdarzenia doszło w czwartek rano na DK78 w miejscowości Poręba, w powiecie zawierciańskim.</p></article><footer>Kraków</footer></body></html>`;
  const a = articleInfo(html);
  assert.match(a.text, /Poręba/); assert.ok(!/Poznaniu/.test(a.text), "link „Czytaj też” pominięty"); assert.ok(!/Wrocław|Kraków/.test(a.text + a.cats));
  assert.match(a.cats, /Śląskie/); assert.match(a.cats, /Zawiercie/);
  assert.equal(resolvePlace({ title: "Karambol na DK78", summary: "", page: a }).region, "slaskie");
});
ok("needsArticle: tylko portal krajowy, bez miejsca, temat istotny", () => {
  const raw = (title, extra = {}) => ({ title, url: "https://portal.pl/polska/a", date: "2026-10-11T09:14:00Z", summary: "", ...extra });
  assert.equal(needsArticle(raw("Karambol na DK78. Nie żyje kierowca"), POL), true);
  assert.equal(needsArticle(raw("Karambol w Poznaniu. Nie żyje kierowca"), POL), false, "miejsce już znamy");
  assert.equal(needsArticle(raw("Karambol na DK78. Nie żyje kierowca"), SOURCES.find((x) => x.id === "radio-podkarpackie")), false);
  assert.equal(needsArticle(raw("Karambol na DK78. Nie żyje kierowca", { page: { text: "", cats: "" } }), POL), false, "już pobrane");
});
ok("RSS: lista kategorii zachowana", () => {
  const it = parseRss(`<rss version="2.0"><channel><link>https://a.pl</link><item><title>Pożar</title><link>https://a.pl/1</link><category>Wielkopolskie</category><category>Wypadki</category><pubDate>Sun, 11 Oct 2026 09:00:00 +0200</pubDate></item></channel></rss>`)[0];
  assert.deepEqual(it.catList, ["Wielkopolskie", "Wypadki"]); assert.match(it.cats, /Wielkopolskie/);
});

// --- aplikacja ---
const FEED = normalizeNews({ generatedAt: "2026-10-11T09:50:00Z", items: [
  { id: "1", title: "Pożar w Poznaniu", url: "https://a.pl/1", date: "2026-10-11T09:00:00Z", source: "A", region: "wielkopolskie", kind: "media" },
  { id: "2", title: "Alert dla całego kraju", url: "https://a.pl/2", date: "2026-10-11T08:00:00Z", source: "RCB", region: "all", kind: "rss" },
  { id: "3", title: "Rosyjskie drony i zagrożenie dla Europy", url: "https://a.pl/3", date: "2026-10-11T07:00:00Z", source: "B", region: "world", kind: "media" },
  { id: "4", title: "Stary wpis bez ustalonego miejsca", url: "https://a.pl/4", date: "2026-10-11T06:00:00Z", source: "C", region: "mixed", kind: "media" },
  { id: "5", title: "Pożar w Gdańsku", url: "https://a.pl/5", date: "2026-10-11T05:00:00Z", source: "D", region: "pomorskie", kind: "media" },
  { id: "6", title: "Nieznany region", url: "https://a.pl/6", date: "2026-10-11T04:00:00Z", source: "E", region: "marsjanskie", kind: "media" },
] });
ok("klient: trzy grupy Moje województwo / Z kraju / Ze świata - wpływ na Polskę", () => {
  assert.equal(FEED.items.length, 4, "„mixed” i nieznane województwo odrzucone, „world” przyjęte");
  assert.deepEqual(NEWS_GROUPS.map((x) => x[1]), ["Moje województwo", "Z kraju", "Ze świata - wpływ na Polskę"]);
  const ids = (g, r = "wielkopolskie") => newsGroup(FEED, g, r).map((x) => x.id);
  assert.deepEqual(ids("region"), ["1"]); assert.deepEqual(ids("kraj"), ["2"]); assert.deepEqual(ids("swiat"), ["3"]);
  assert.deepEqual(ids("regiony"), [], "czwartej grupy nie ma");
  assert.deepEqual(ids("region", null), [], "bez wybranego województwa grupa pusta");
  assert.deepEqual(newsCounts(FEED, "wielkopolskie"), { region: 1, kraj: 1, swiat: 1 });
  assert.deepEqual(newsForRegion(FEED, "wielkopolskie").map((x) => x.id), ["1", "2"], "Pulpit: województwo + kraj, bez świata");
  assert.equal(groupLabel(FEED.items[0], "wielkopolskie"), "Twoje woj."); assert.equal(groupLabel(FEED.items[0], "pomorskie"), "Wielkopolskie");
  assert.equal(groupLabel(FEED.items.find((x) => x.id === "3"), null), "Ze świata");
});
ok("klient: ekran Wiadomości ma trzy zakładki, bez „Wszystkie regiony”", () => {
  const a = readFileSync(new URL("../js/app.js", import.meta.url), "utf8"), nw = readFileSync(new URL("../js/news.js", import.meta.url), "utf8");
  for (const t of ["NEWS_GROUPS", "data-newsscope", "data-newsgo", "Ze świata - wpływ na Polskę"]) assert.ok(a.includes(t) || nw.includes(t), t);
  assert.ok(!/Wszystkie regiony/.test(a + nw), "czwartej zakładki nie ma");
});
ok("policja.pl (portal krajowy): miejsce z kategorii/adresu/tytułu/opisu albo wpis odpada", () => {
  const src = SOURCES.find((x) => x.id === "policja-pl");
  const mkp = (title, extra = {}) => toItem({ title, url: "https://policja.pl/pol/aktualnosci/" + title.length + ",x.html", date: "2026-10-11T09:14:00Z", summary: "", ...extra }, src, NOW);
  assert.equal(mkp("Zatrzymano sprawców napadu w Rzeszowie. Grozi im do 15 lat więzienia").region, "podkarpackie");
  assert.equal(mkp("Ostrzeżenie: oszuści podszywają się pod policję", { summary: "Do zdarzenia doszło w Gdyni." }).region, "pomorskie");
  assert.equal(mkp("Ostrzeżenie: oszuści podszywają się pod policję"), null, "bez miejsca = pomijamy");
  assert.equal(mkp("Ostrzeżenie: oszuści z Poznania i Gdańska podszywają się pod policję"), null, "dwa województwa = pomijamy");
});
ok("Apteczka: pięć zakładek, pełna treść, źródło i data przeglądu, poprawne linki", () => {
  assert.deepEqual(APTECZKA.tabs.map((t) => t.id), ["dom", "auto", "terminy", "przechowywanie", "elementy"]);
  assert.ok(APTECZKA.source && APTECZKA.reviewed && APTECZKA.intro.length > 100);
  let words = 0;
  for (const t of APTECZKA.tabs) { assert.ok(t.blocks.length >= 3 || t.id === "auto", t.id); for (const b of t.blocks) { assert.ok(b.h && (b.items?.length || b.p), t.id + b.h); words += JSON.stringify(b).split(/\s+/).length; if (b.link) assert.ok(/^#\/(plecak|plan-rodziny|pierwsza-pomoc)$/.test(b.link.h)); } }
  assert.ok(words > 1200, "ekran ma być rozbudowany, nie kilka zdań: " + words);
  const txt = JSON.stringify(APTECZKA).toLowerCase();
  for (const bad of ["alpha", "wolf", "tom ii", "tomie ii", "rozdział 7", "podrozdział", "tccc"]) assert.ok(!txt.includes(bad), "nie ujawniamy źródła: " + bad);
  for (const must of ["opaska uciskowa", "hemostatyczn", "okluzyjn", "nożyczki ratownicze", "112"]) assert.ok(txt.includes(must), must);
  const a = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(a, /case "apteczka": inner = screenApteczka\(\)/); assert.match(a, /data-gtab/); assert.match(a, /href="#\/apteczka"/);
});
ok("pasek dolny: W pobliżu zaraz po Zagrożeniach, przed Poradnikiem; wszędzie „Poradnik”", () => {
  const a = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const nav = a.slice(a.indexOf("const NAV = ["), a.indexOf("const TABS"));
  const order = [...nav.matchAll(/t: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["Pulpit", "Alerty", "Zagrożenia", "W pobliżu", "Poradnik"]);
  assert.ok(!/t: "Co robić"/.test(a), "w menu bocznym nie ma „Co robić”");
  assert.match(a, /t: "Poradnik", i: C\.book/);
});
console.log(`test-v37: OK (${n} grup)`);
