// Test parsera na SZTUCZNEJ próbce (nie jest to prawdziwy format RSO – służy tylko do sprawdzenia logiki).
import assert from "node:assert/strict";
import { parseRso, detectRegion, detectType, parseWarsaw } from "./rso.mjs";

const sample = `<?xml version="1.0"?><rss><channel>
<item><title>Sztorm/2 – strefa wschodnia wybrzeża</title><description>Burze do 9 B. Województwo pomorskie.</description><pubDate>Fri, 09 Oct 2026 08:00:00 +0200</pubDate><link>https://example.test/1</link><guid>g1</guid></item>
<item><title>Utrudnienia na DK 74 koło Kostomłot</title><description>Ruch wahadłowy, świętokrzyskie.</description><pubDate>Fri, 09 Oct 2026 09:30:00 +0200</pubDate><guid>g2</guid></item>
<item><title>Jakość wody przeznaczonej do spożycia</title><description>Woda niezdatna do picia, woj. dolnośląskie</description><pubDate>Thu, 08 Oct 2026 12:00:00 +0200</pubDate><guid>g3</guid></item>
<item><title>Komunikat bez regionu</title><description>Treść ogólna.</description><guid>g4</guid></item>
</channel></rss>`;

const items = parseRso(sample);
assert.equal(items.length, 4);
assert.equal(items[0].voivodeship, "pomorskie");
assert.equal(items[0].type, "pogoda");
assert.equal(items[1].voivodeship, "swietokrzyskie");
assert.equal(items[1].type, "drogi");
assert.equal(items[2].voivodeship, "dolnoslaskie");
assert.equal(items[2].type, "woda");
assert.equal(items[3].voivodeship, "all");
assert.ok(items[0].published.startsWith("2026-10-09"));
assert.ok(items.every((i) => i.id && i.source));
assert.deepEqual(detectRegion("Mazowieckie i Łódzkie"), ["lodzkie", "mazowieckie"]);
assert.deepEqual(detectRegion("woj. dolnośląskie"), ["dolnoslaskie"]); // nie „śląskie”
assert.deepEqual(detectRegion("Śląskie"), ["slaskie"]);
assert.deepEqual(detectRegion("zachodniopomorskie"), ["zachodniopomorskie"]); // nie „pomorskie”
assert.deepEqual(detectRegion("kujawsko-pomorskie"), ["kujawsko-pomorskie"]);
assert.deepEqual(detectRegion("Pomorskie oraz Warmińsko-Mazurskie"), ["pomorskie", "warminsko-mazurskie"]);
assert.equal(detectType("Alert RCB: znajdź bezpieczne miejsce"), "rcb");
// Zabezpieczenie przed wstrzyknięciem HTML: znaczniki są usuwane z treści
const evil = parseRso(`<rss><channel><item><title>&lt;script&gt;alert(1)&lt;/script&gt;Test</title><description>x</description><guid>e</guid></item><item><title>b</title><description>y</description><guid>f</guid></item></channel></rss>`);
assert.ok(!evil[0].title.includes("<script"));
// Format zgodny z prawdziwym zrzutem RSO (pola: content, valid_from, valid_to, provinces/province, rso_alarm)
const real = parseRso(`<response><komunikaty>
<komunikat><id>23403323</id><title>Wypadek S8 (387,4 km) m. Konopnica</title><shortcut>Wypadek na S8, krótko.</shortcut><content>Zderzenie pojazdów. Ruch pasem szybkim.</content><rso_alarm>0</rso_alarm><valid_from>2026-10-09 17:35:00</valid_from><valid_to>2026-10-09 18:59:00</valid_to><river_name></river_name><provinces><province id="5" slug="lodzkie" city="">łódzkie</province></provinces></komunikat>
<komunikat><id>1</id><title>Stan ostrzegawczy</title><content>Rzeka X</content><rso_alarm>1</rso_alarm><valid_from>2026-10-09 10:00:00</valid_from><valid_to></valid_to><river_name>Odra</river_name><provinces><province id="2">opolskie</province><province id="3">dolnośląskie</province></provinces></komunikat>
</komunikaty></response>`);
assert.equal(real.length, 3);
assert.equal(real[0].voivodeship, "lodzkie");
assert.equal(real[0].type, "drogi");
assert.equal(real[0].body, "Zderzenie pojazdów. Ruch pasem szybkim.");
assert.equal(real[0].published, "2026-10-09T15:35:00.000Z"); // 17:35 czasu polskiego (CEST = UTC+2)
assert.equal(real[0].validTo, "2026-10-09T16:59:00.000Z");
assert.equal(real[0].alarm, false);
assert.deepEqual(real.slice(1).map((x) => x.voivodeship).sort(), ["dolnoslaskie", "opolskie"]);
assert.ok(real.slice(1).every((x) => x.type === "woda" && x.alarm === true && x.validTo === null));
assert.equal(parseWarsaw("2026-01-15 12:00:00").toISOString(), "2026-01-15T11:00:00.000Z"); // zima: UTC+1


/* ---------- reguły Telegram wg wagi (tg-policy.mjs) ---------- */
import { selectForTelegram, tgText, hadDanger } from "./tg-policy.mjs";
import { evaluate, decide, dueReminders, parseDeadlines, DEADLINES, LIMITS as WD } from "./watchdog.mjs";
const NOW = Date.parse("2026-10-10T16:00:00Z");
const ago = (min) => new Date(NOW - min * 6e4).toISOString();
const it = (id, o) => ({ id, source: "RSO", voivodeship: "lubelskie", published: ago(30), validTo: null, alarm: false, ...o });
const sel = (items, state = { sent: {}, danger: {} }) => selectForTelegram(items, state, { now: NOW });
const lv = (items, state) => Object.fromEntries(sel(items, state).map(({ a, level }) => [a.id, level]));
assert.deepEqual(lv([it("atak", { type: "rcb", title: "Alert RCB", body: "Atak rakietowy z Ukrainy. Dron nad Polską, schroń się." })]), { atak: "danger" }, "atak z powietrza = czerwony");
assert.deepEqual(lv([it("woda-rcb", { type: "rcb", title: "Alert RCB", body: "Woda w gminie Kąty nie nadaje się do spożycia." })]), { "woda-rcb": "important" }, "zwykły alert RCB = żółty");
assert.deepEqual(lv([it("zycie", { type: "rcb", title: "Alert RCB", body: "Zagrożenie życia: natychmiast opuść budynek." })]), { zycie: "danger" });
assert.deepEqual(lv([it("p1", { type: "pogoda", title: "Burze 1. stopnia" }), it("p2", { type: "pogoda", title: "Burze z gradem 2. stopnia" }), it("p3", { type: "pogoda", title: "Wichury 3. stopnia" })]), { p2: "important", p3: "danger" }, "1. stopień zostaje w aplikacji");
assert.deepEqual(lv([it("d", { type: "drogi", title: "Wypadek na S8" }), it("s", { type: "woda", title: "Susza hydrologiczna" })]), {}, "drogi i susza nie idą na Telegram");
assert.deepEqual(lv([it("powodz3", { type: "woda", title: "Ostrzeżenie 3. stopnia – powódź", body: "Wezbranie rzeki Odry." })]), { powodz3: "danger" });
assert.deepEqual(lv([it("stary", { type: "rcb", title: "Alert RCB", body: "Woda niezdatna do picia.", published: ago(7 * 60) })]), {}, "starsze niż 6 h nie idą");
assert.deepEqual(lv([it("wyslany", { type: "rcb", title: "Alert RCB", body: "Woda niezdatna do picia." })], { sent: { wyslany: 1 }, danger: {} }), {}, "nie wysyłamy drugi raz");
assert.deepEqual(lv([it("wygasl", { type: "rcb", title: "Alert RCB", body: "Woda niezdatna do picia.", validTo: ago(5) })]), {}, "wygasły przed wysyłką");
// odwołania: tylko po wysłanym zagrożeniu tego zasięgu
const cancel = it("odw", { type: "rcb", title: "Alert RCB", body: "Zakończył się atak z powietrza. Odwołanie alarmu.", voivodeship: "all", published: ago(10) });
assert.deepEqual(lv([cancel]), {}, "odwołanie bez wcześniejszego zagrożenia nie idzie");
assert.deepEqual(lv([cancel], { sent: {}, danger: { lubelskie: NOW - 3 * 36e5 } }), { odw: "cancel" }, "odwołanie po zagrożeniu idzie");
assert.deepEqual(lv([cancel], { sent: {}, danger: { lubelskie: NOW - 30 * 36e5 } }), {}, "zagrożenie sprzed ponad 24 h już nie liczy się");
assert.ok(hadDanger({ danger: { all: NOW - 1000 } }, { voivodeship: "mazowieckie" }, NOW));
assert.ok(!hadDanger({ danger: { mazowieckie: NOW - 1000 } }, { voivodeship: "lubelskie" }, NOW));
// atak i jego odwołanie w tej samej partii: atak jest już nieaktualny
const both = lv([it("a2", { type: "rcb", title: "Alert RCB", body: "Atak rakietowy z Ukrainy, dron.", published: ago(60) }), cancel], { sent: {}, danger: { all: NOW - 36e5 } });
assert.deepEqual(both, { odw: "cancel" }, "odwołany atak nie jest wysyłany ponownie");
// to samo wydarzenie opisane dwa razy: wysyłamy tylko główny wpis
const rel = lv([it("r1", { type: "rcb", title: "Alert RCB", body: "Woda niezdatna do picia: Wrocławskie, Sobótka, Smolec, Mietków, Kobierzyce." }), it("r2", { type: "pogoda", title: "Burze 2. stopnia", body: "Dotyczy: Wrocławskie, Sobótka, Smolec, Mietków, Kobierzyce." })]);
assert.deepEqual(rel, { r1: "important" }, "duplikat wydarzenia nie idzie osobno");
// treść wiadomości
const txt = tgText(it("x", { type: "rcb", title: "Alert <b>RCB</b>", body: "Treść & <script>", source: "RSO", url: "https://x.pl/?a=1&b=2" }), "danger", { appUrl: "https://app.test/" });
assert.ok(txt.startsWith("🔴 <b>ZAGROŻENIE</b> · Alert RCB · Lubelskie"), txt.split("\n")[0]);
assert.ok(!txt.includes("<script>") && txt.includes("&lt;script&gt;") && txt.includes("Alert &lt;b&gt;RCB&lt;/b&gt;") && txt.includes("&amp;b=2"), "tekst z zewnątrz jest escapowany");
assert.ok(txt.includes("112") && txt.includes("nieoficjalna") && txt.includes("https://app.test/"));
assert.ok(tgText(it("y", { type: "pogoda", title: "T" }), "important").includes("🟠 <b>OSTRZEŻENIE</b>") && tgText(it("z", { type: "rcb", title: "T" }), "cancel").includes("✅ <b>ODWOŁANIE</b>"));

/* ---------- strażnik (watchdog.mjs) ---------- */
assert.deepEqual(evaluate({ pushAgeMin: 5, remoteAgeMin: 10 }), { problem: false, reasons: [] });
assert.equal(evaluate({ pushAgeMin: WD.pushMin + 1, remoteAgeMin: 10 }).problem, true, "publikacja zbyt stara");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: WD.remoteMin + 1 }).problem, true, "aplikacja widzi stare dane (np. nieudany push)");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: null }).problem, false, "brak odpowiedzi GitHuba sam w sobie nie jest alarmem serwera");
assert.equal(evaluate({ pushAgeMin: null, remoteAgeMin: null }).problem, true, "serwer nigdy nie opublikował danych");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, newsAgeMin: 30, newsSources: 72, newsOk: 72 }).problem, false, "wiadomości w normie");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, newsAgeMin: WD.newsMin + 1 }).problem, true, "stary news.json");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, newsSources: 72, newsOk: 30 }).problem, true, "większość źródeł wiadomości nie odpowiada");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, newsSources: 72, newsOk: 60 }).problem, false, "kilka błędnych źródeł to jeszcze nie awaria");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, newsAgeMin: null }).problem, false, "brak odpowiedzi GitHuba nie jest alarmem serwera");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, airAgeMin: 60 }).problem, false, "powietrze świeże");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, airAgeMin: WD.airMin + 1 }).problem, true, "stary air.json");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, dailyAgesH: { "aed.json": 20, "hospitals.json": 30 } }).problem, false, "pliki dobowe w normie");
assert.match(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, dailyAgesH: { "aed.json": WD.dailyH + 1 } }).reasons[0], /aed\.json/, "stary plik dobowy");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, dailyAgesH: { "hospitals.json": 120 } }).problem, false, "szpitale odświeżane co tydzień: 120 h to norma");
assert.match(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, dailyAgesH: { "hospitals.json": 201 } }).reasons[0], /hospitals\.json/, "szpitale starsze niż 200 h");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, neptunAgeMin: 3 }).problem, false, "NEPTUN odpowiada: norma");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10 }).problem, false, "brak znacznika NEPTUN: nie oceniamy");
assert.match(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, neptunAgeMin: WD.neptunMin + 1 }).reasons[0], /NEPTUN/, "NEPTUN milczy za długo");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, gddkiaBadH: 2 }).problem, false);
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, gddkiaBadH: WD.gddkiaH + 1 }).problem, true, "GDDKiA długo bez danych");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, addrPct: 69, addrStallH: 10 }).problem, false, "adresy: krótko stoją");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, addrPct: 69, addrStallH: WD.addrStallH + 1 }).problem, true, "adresy AED stoją za długo");
assert.equal(evaluate({ pushAgeMin: 5, remoteAgeMin: 10, addrPct: 95, addrStallH: 500 }).problem, false, "adresy prawie komplet");
{
  const T = Date.parse("2026-10-14T10:00:00Z");
  const dl = [{ date: "2026-10-30", label: "VPS" }];
  let r = dueReminders(dl, {}, T);
  assert.equal(r.messages.length, 0, "16 dni: za wcześnie");
  r = dueReminders(dl, {}, Date.parse("2026-10-17T10:00:00Z"));
  assert.equal(r.messages.length, 1, "13 dni: próg 14");
  assert.deepEqual(r.sent["2026-10-30"], [14]);
  assert.equal(dueReminders(dl, r.sent, Date.parse("2026-10-18T10:00:00Z")).messages.length, 0, "próg 14 tylko raz");
  const r3 = dueReminders(dl, r.sent, Date.parse("2026-10-28T10:00:00Z"));
  assert.equal(r3.messages.length, 1, "próg 3");
  assert.deepEqual(r3.sent["2026-10-30"], [14, 3].sort((a, b) => b - a));
  assert.match(dueReminders(dl, {}, Date.parse("2026-10-29T10:00:00Z")).messages[0].text, /jutro/);
  assert.match(dueReminders(dl, {}, Date.parse("2026-10-30T09:00:00Z")).messages[0].text, /dziś/);
  assert.equal(dueReminders(dl, {}, Date.parse("2026-11-02T10:00:00Z")).messages.length, 0, "termin minął");
  assert.deepEqual(parseDeadlines(""), DEADLINES);
  assert.deepEqual(parseDeadlines("2026-12-01|Test;zła|x"), [{ date: "2026-12-01", label: "Test" }]);
  assert.deepEqual(parseDeadlines("śmieci"), DEADLINES);
}
let w = decide(false, {}, NOW); assert.equal(w.action, "none");
w = decide(true, w.state, NOW); assert.equal(w.action, "down", "pierwszy alarm");
w = decide(true, w.state, NOW + 36e5); assert.equal(w.action, "none", "bez powtarzania co 10 min");
w = decide(true, w.state, NOW + (WD.remindH + 0.1) * 36e5); assert.equal(w.action, "remind", "przypomnienie po kilku godzinach");
w = decide(false, w.state, NOW + 10 * 36e5); assert.equal(w.action, "up", "wiadomość o powrocie do normy"); assert.equal(w.state.down, false);
assert.equal(decide(false, w.state, NOW + 11 * 36e5).action, "none");
// --- Telegram: wiadomości z news.json ---
import { appLink, APP_FOLLOW } from "./tg-policy.mjs";
import { newsMessage, isAirDefence, levelOf as nLevel, categoryOf as nCat, selectNews, markNewsSent, channelsFor, sampleItems, LIMITS as NL } from "./tg-news-lib.mjs";
{
  const strip = (h) => h.replace(/<[^>]+>/g, "");
  const APP = "https://app.test/egida/";
  const al = appLink(APP);
  assert.ok(al.includes(`href="${APP}"`) && strip(al) === APP_FOLLOW && !strip(al).includes("app.test"), "ukryty link do aplikacji");
  assert.equal(appLink(""), APP_FOLLOW); assert.equal(appLink("http://x"), APP_FOLLOW);
  assert.ok(!strip(tgText(it("x", { type: "rcb", title: "T" }), "danger", { appUrl: APP })).includes("app.test"), "adres aplikacji niewidoczny w alercie RSO");
  const NOW = Date.parse("2026-10-14T12:00:00Z"), ago = (m) => new Date(NOW - m * 6e4).toISOString();
  const mk = (id, o) => ({ id, kind: "rss", region: "mazowieckie", source: "Źr <b>", url: "https://x.pl/?a=1&b=2", date: ago(10), title: `Tytuł ${id} <i>`, summary: "", ...o });
  const m = newsMessage(mk("a", { title: "Ostrzeżenie przed wichurami & burzami" }), { appUrl: APP });
  assert.ok(m.includes("🔵") && !m.includes("🟠") && m.includes("Mazowieckie") && m.includes("&amp;") && !m.includes("<i>Tytuł") && m.includes("Więcej ważnych wiadomości") && !strip(m).includes("app.test"));
  assert.ok(m.includes(`href="${APP}"`), "link do aplikacji ukryty w tekście");
  const mr = newsMessage(mk("r", { kind: "gddkia", title: "7 · A - B: droga zamknięta", until: new Date(NOW + 36e5).toISOString() }), { appUrl: APP });
  assert.ok(mr.includes("🟠") && mr.includes("Drogi krajowe") && !mr.includes("Więcej ważnych wiadomości"), "drogi bez stopki o wiadomościach");
  assert.ok(!strip(newsMessage(mk("n"), {})).includes("http"), "bez appUrl zwykłe zdanie bez adresu");
  assert.equal(nCat(mk("k", { region: "all" })), "kraj"); assert.equal(nCat(mk("w", { region: "world" })), "swiat"); assert.equal(nCat(mk("g", { kind: "gddkia" })), "droga");
  assert.equal(nLevel(mk("g", { kind: "gddkia", title: "Remont" })), "traffic");
  for (const reg of ["mazowieckie", "all", "world"]) { const x = newsMessage(mk("b", { kind: "media", region: reg, title: "Pożar i wybuch, zamach" }), { appUrl: APP }); assert.ok(x.includes("🔵") && x.includes("doniesienie medialne") && !x.includes("🔴") && !x.includes("112"), "wiadomości zawsze niebieskie z dopiskiem medialnym: " + reg); }
  assert.ok(!newsMessage(mk("b2", { kind: "rss" }), {}).includes("doniesienie medialne"), "dopisek tylko dla mediów, jak w aplikacji");
  // limity: kraj 10/h, świat 5/h, region bez limitu
  const uniqTitles = ["Sejm uchwalił budżet", "Premier spotkał się z prezydentem", "Pogoda nad morzem", "Zmiany w kodeksie pracy", "Rosną ceny paliw", "Nowa linia kolejowa", "Rząd przyjął strategię", "Debata o szkołach", "Rekord eksportu żywności", "Ceny mieszkań spadają", "Konkurs dla uczniów", "Otwarto nowy most"];
  const kr = uniqTitles.map((t, i) => mk("kr" + i, { region: "all", title: t + " " + "x".repeat(i) }));
  const sw = ["Wybory w Brazylii", "Trzęsienie ziemi w Japonii", "Szczyt klimatyczny w Egipcie", "Strajk we Francji", "Nowa misja księżycowa", "Powódź w Indiach", "Inflacja w Turcji"].map((t, i) => mk("sw" + i, { region: "world", title: t }));
  const reg = ["Remont szkoły", "Festyn w parku", "Zmiana rozkładu autobusów", "Otwarcie basenu", "Wystawa w muzeum", "Targi pracy", "Koncert plenerowy", "Dni miasta", "Wyścig kolarski", "Nowy plac zabaw", "Kiermasz", "Bieg uliczny", "Spacer historyczny", "Pokaz filmu", "Zbiórka darów"].map((t, i) => mk("rg" + i, { title: t + " " + "y".repeat(i) }));
  let r = selectNews([...kr, ...sw, ...reg], { sent: {} }, { now: NOW });
  const cnt = (c) => r.send.filter((x) => x.cat === c).length;
  assert.equal(cnt("kraj"), NL.kraj); assert.equal(cnt("swiat"), NL.swiat); assert.equal(cnt("region"), Math.min(15, NL.maxPerRun - NL.kraj - NL.swiat), "region bez limitu godzinowego, tylko pułap na przebieg");
  // po wysłaniu limit godzinowy się wyczerpuje, po godzinie wraca
  for (const x of r.send) markNewsSent(r.state, x, NOW);
  const more = [mk("kr_new", { region: "all", title: "Zupełnie inna sprawa krajowa" })];
  assert.equal(selectNews(more, r.state, { now: NOW + 6e4 }).send.length, 0, "limit 10/h wyczerpany");
  assert.equal(selectNews([mk("kr_new2", { region: "all", title: "Zupełnie inna sprawa krajowa", date: new Date(NOW + 61 * 6e4 - 6e4).toISOString() })], r.state, { now: NOW + 61 * 6e4 }).send.length, 1, "po godzinie limit wraca");
  // lotnictwo wojskowe: nie podlega limitowi 10/h i idzie pierwsze
  const air = mk("kr_air", { region: "all", title: "Polska poderwała myśliwce. Lotniska w Rzeszowie i Lublinie zamknięte", date: new Date(NOW + 61 * 6e4 - 6e4).toISOString() });
  assert.equal(selectNews([air], r.state, { now: NOW + 6e4 }).send.length, 1, "komunikat o poderwaniu myśliwców omija limit godzinowy");
  const firstAir = selectNews([...kr.slice(0, 3), air], { sent: {} }, { now: NOW + 6e4 }).send[0];
  assert.equal(firstAir.it.id, "kr_air", "komunikat lotniczy idzie pierwszy");
  assert.equal(isAirDefence("Lotnisko Rzeszów zamknięte, wojsko podniosło lotnictwo"), true); assert.equal(isAirDefence("Wstrzymano loty nad wschodem Polski"), true);
  assert.equal(isAirDefence("Myśliwy postrzelił psa w lesie"), false, "myśliwy to nie myśliwiec"); assert.equal(isAirDefence("Nowy rozkład lotów z lotniska w Gdańsku"), false);
  // świeżość, duplikaty, już wysłane, kinds
  assert.equal(selectNews([mk("old", { date: ago(4 * 60) })], { sent: {} }, { now: NOW }).send.length, 0, "starsze niż 3 h pomijane");
  assert.equal(selectNews([mk("a1")], { sent: { a1: NOW } }, { now: NOW }).send.length, 0);
  const dup = selectNews([mk("d1", { title: "Pożar hali magazynowej w Radomiu, trwa akcja gaśnicza" }), mk("d2", { title: "Pożar hali magazynowej w Radomiu – trwa akcja gaśnicza strażaków" })], { sent: {} }, { now: NOW });
  assert.equal(dup.send.length, 1); assert.equal(dup.duplicates.length, 1);
  const road = mk("rd", { kind: "gddkia", date: ago(20 * 24 * 60), until: new Date(NOW + 36e5).toISOString(), title: "S7: utrudnienia" });
  assert.equal(selectNews([road], { sent: {} }, { now: NOW }).send.length, 1, "droga liczy się dopóki obowiązuje");
  assert.equal(selectNews([{ ...road, until: ago(5) }], { sent: {} }, { now: NOW }).send.length, 0);
  assert.equal(selectNews([...kr.slice(0, 2), road], { sent: {} }, { now: NOW, kinds: new Set(["droga"]) }).send.length, 1, "filtr kinds");
  // kanały
  const chs = { mazowieckie: "-1", slaskie: "-2" };
  assert.deepEqual(channelsFor(kr[0], chs), ["-1", "-2"]); assert.deepEqual(channelsFor(reg[0], chs), ["-1"]); assert.deepEqual(channelsFor(mk("z", { region: "pomorskie" }), chs), []);
  assert.equal(sampleItems(NOW).length, 6);
}

/* ---------- Alerty RCB o zagrożeniu z powietrza z gov.pl (rcb-gov-lib.mjs) – na PRAWDZIWYCH stronach RCB z listopada 2026 ---------- */
{
  const { readFileSync } = await import("node:fs");
  const { parseList, parseAlertPage, toItems, regionsOf, isAirTopic, headline } = await import("./rcb-gov-lib.mjs");
  const { analyze, statusOf } = await import("../js/classify.js");
  const fx = (f) => readFileSync(new URL(`./test-fixtures/rcb/${f}`, import.meta.url), "utf8");
  const T = (iso) => Date.parse(iso);

  // Lista: rozpoznaje alerty RCB, ich daty i które dotyczą zagrożenia z powietrza (woda i ćwiczenia syren są w RSO – pomijamy).
  const list = parseList(fx("list.html"), T("2026-11-22T12:00:00Z"));
  const air = list.filter((x) => isAirTopic(x.title, x.intro)).map((x) => x.slug).sort();
  assert.deepEqual(air, ["alert-rcb---atak-z-powietrza-2011", "alert-rcb---zagrozenie-z-powietrza-0911", "alert-rcb---zagrozenie-z-powietrza-1011"]);
  assert.deepEqual(list.find((x) => x.slug === "alert-rcb---atak-z-powietrza-2011").date, { y: 2026, m: 11, d: 20 });
  assert.ok(list.every((x) => x.url.startsWith("https://www.gov.pl/web/rcb/")));

  // Strona z 20.11: sześć wysyłek, od najstarszej, z godzinami w różnych zapisach.
  const p20 = parseAlertPage(fx("alert-rcb---atak-z-powietrza-2011.html"));
  assert.deepEqual(p20.entries.map((e) => `${e.hh}:${String(e.mm).padStart(2, "0")}`), ["2:30", "6:30", "6:34", "7:30", "8:58", "9:48"]);
  assert.deepEqual(regionsOf(p20.entries[1].recipients), ["lubelskie"], "6:30 – tylko powiaty lubelskie");
  assert.deepEqual(regionsOf(p20.entries[2].recipients), ["lubelskie", "podkarpackie"], "6:34 – powiat opolski (lubelskie) NIE oznacza województwa opolskiego");
  assert.deepEqual(regionsOf(p20.entries[0].recipients), ["lubelskie", "podkarpackie"]);
  // Inne zapisy godzin: „Aktualizacja! - 22:41” + pierwotny wpis bez godziny; samo „10:20”.
  const p09 = parseAlertPage(fx("alert-rcb---zagrozenie-z-powietrza-0911.html"));
  assert.deepEqual(p09.entries.map((e) => e.hh), [null, 22]);
  assert.deepEqual(regionsOf(p09.entries[1].recipients), ["lubelskie", "podlaskie"]);
  const p10 = parseAlertPage(fx("alert-rcb---zagrozenie-z-powietrza-1011.html"));
  assert.deepEqual(p10.entries.map((e) => `${e.hh}:${e.mm}`), ["10:20", "10:55"]);
  assert.deepEqual(regionsOf("powiatu opolskiego (woj. lubelskie)"), ["lubelskie"]);
  assert.deepEqual(regionsOf("na terenie całej Polski"), ["all"]);
  // Poprawki po przeglądzie: dowolnie długa lista województw, same powiaty, Biała Podlaska (lubelskie), brak danych ≠ cała Polska.
  assert.deepEqual(regionsOf("woj. lubelskiego, podkarpackiego, podlaskiego i mazowieckiego."), ["lubelskie", "mazowieckie", "podkarpackie", "podlaskie"]);
  assert.deepEqual(regionsOf("powiatów: hrubieszowskiego, zamojskiego, tomaszowskiego."), ["lubelskie"]);
  assert.deepEqual(regionsOf("pow. bialskiego, m. Biała Podlaska"), ["lubelskie"]);
  assert.deepEqual(regionsOf("pow. sanockiego i leskiego"), ["podkarpackie"]);
  assert.deepEqual(regionsOf("pow. stalowowolskiego"), []);
  const { dateFromTitle } = await import("./rcb-gov-lib.mjs");
  const NOWD = T("2026-11-22T12:00:00Z");
  assert.deepEqual(dateFromTitle("Alert RCB - atak (22.11.2026)", NOWD), { y: 2026, m: 11, d: 22 });
  assert.deepEqual(dateFromTitle("Alert RCB - atak (21-22.11)", NOWD), { y: 2026, m: 11, d: 22 });
  assert.deepEqual(dateFromTitle("Alert RCB - 22.11 – aktualizacja", NOWD), { y: 2026, m: 11, d: 22 });
  assert.equal(dateFromTitle("Alert RCB - atak z powietrza", NOWD), null);
  // Wysyłka bez województwa: gdy inne wysyłki ze strony mają województwo – bierzemy je; gdy żadna nie ma – pomijamy (nie „all”).
  const solo = toItems({ date: { y: 2026, m: 11, d: 22 }, entries: [{ hh: 10, mm: 0, text: "UWAGA! Zagrożenie atakiem z powietrza.", recipients: "pow. stalowowolskiego." }] }, { slug: "s", url: "u", now: T("2026-11-22T12:00:00Z") });
  assert.equal(solo.length, 0); assert.equal(solo.unresolved, 1);
  const withPage = toItems({ date: { y: 2026, m: 11, d: 22 }, entries: [{ hh: 9, mm: 0, text: "UWAGA! Rosyjski atak powietrzny na Ukrainie.", recipients: "woj. podkarpackiego." }, { hh: 10, mm: 0, text: "UWAGA! Zagrożenie atakiem z powietrza.", recipients: "pow. stalowowolskiego." }] }, { slug: "s", url: "u", now: T("2026-11-22T12:00:00Z") });
  assert.deepEqual(withPage.map((i) => i.voivodeship), ["podkarpackie", "podkarpackie"]);
  assert.equal(withPage[1].regionApprox, true);
  // Identyfikator wysyłki nie zmienia się, gdy RCB poprawi treść albo dopisze godzinę.
  const v1 = toItems({ date: { y: 2026, m: 11, d: 22 }, entries: [{ hh: null, mm: null, text: "UWAGA! Rosyjski atak powietrzny na Ukrainie.", recipients: "woj. lubelskiego." }] }, { slug: "s", url: "u", now: NOWD });
  const v2 = toItems({ date: { y: 2026, m: 11, d: 22 }, entries: [{ hh: 9, mm: 5, text: "UWAGA! Rosyjski atak powietrzny na Ukrainę.", recipients: "woj. lubelskiego" }] }, { slug: "s", url: "u", now: NOWD });
  assert.equal(v1[0].id, v2[0].id);
  assert.equal(headline("UWAGA! UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce.").title, "Zagrożenie atakiem z powietrza");

  // Odtworzenie piątku 20.11.2026 minuta po minucie: co widzi aplikacja i co idzie na Telegram.
  const slug = "alert-rcb---atak-z-powietrza-2011";
  const at = (iso) => toItems(p20, { slug, url: "https://www.gov.pl/web/rcb/" + slug, now: T(iso) });
  const stat = (items, reg, iso) => statusOf(analyze(items, T(iso)).filter((a) => a.active && (a.voivodeship === reg || a.voivodeship === "all")));
  // 6:31 – strona ma już wpis z 6:30 (wpisy „z przyszłości” są pomijane).
  const i631 = at("2026-11-20T05:31:00Z");
  assert.equal(i631.length, 3, "2:30 (lubelskie, podkarpackie) + 6:30 (lubelskie)");
  assert.equal(stat(i631, "lubelskie", "2026-11-20T05:31:00Z"), "alarm", "6:31 – Lubelskie: ZAGROŻENIE (czerwone)");
  assert.equal(stat(i631, "podkarpackie", "2026-11-20T05:31:00Z"), "warn", "6:31 – Podkarpackie: ostrzeżenie (atak na Ukrainie, sytuacja monitorowana)");
  assert.equal(analyze(i631, T("2026-11-20T05:31:00Z")).find((a) => a.voivodeship === "lubelskie" && a.sev === "danger").kind, "atak", "Pulpit pokaże „Zagrożenie z powietrza”");
  // Telegram: o 2:30 poszło ostrzeżenie; o 6:31 idzie ZAGROŻENIE tylko do Lubelskiego.
  const st = { sent: {}, danger: {} };
  const s230 = selectForTelegram(at("2026-11-20T01:31:00Z"), st, { now: T("2026-11-20T01:31:00Z"), recentH: 3 });
  assert.deepEqual(s230.map((x) => `${x.level}:${x.a.voivodeship}`).sort(), ["important:lubelskie", "important:podkarpackie"]);
  for (const { a } of s230) { st.sent[a.id] = 1; st.danger[a.voivodeship] = T("2026-11-20T01:31:00Z"); }
  const s631 = selectForTelegram(i631, st, { now: T("2026-11-20T05:31:00Z"), recentH: 3 });
  assert.deepEqual(s631.map((x) => `${x.level}:${x.a.voivodeship}`), ["danger:lubelskie"]);
  for (const { a } of s631) { st.sent[a.id] = 1; st.danger[a.voivodeship] = T("2026-11-20T05:31:00Z"); }
  const s635 = selectForTelegram(at("2026-11-20T05:35:00Z"), st, { now: T("2026-11-20T05:35:00Z"), recentH: 3 });
  assert.deepEqual(s635.map((x) => `${x.level}:${x.a.voivodeship}`).sort(), ["danger:lubelskie", "danger:podkarpackie"], "6:34 – rozszerzenie na Podkarpackie");
  for (const { a } of s635) { st.sent[a.id] = 1; st.danger[a.voivodeship] = T("2026-11-20T05:35:00Z"); }
  // 7:31 – odwołanie: oba województwa dostają ODWOŁANIE, a w aplikacji jest spokojnie.
  const i731 = at("2026-11-20T06:31:00Z");
  const s731 = selectForTelegram(i731, st, { now: T("2026-11-20T06:31:00Z"), recentH: 3 });
  assert.deepEqual(s731.map((x) => `${x.level}:${x.a.voivodeship}`).sort(), ["cancel:lubelskie", "cancel:podkarpackie"]);
  assert.equal(stat(i731, "lubelskie", "2026-11-20T06:31:00Z"), "calm");
  assert.equal(stat(i731, "podkarpackie", "2026-11-20T06:31:00Z"), "calm");
  // 9:00 – znów „atak na Ukrainie, sytuacja monitorowana” (żółte); 9:50 – koniec ataku, spokojnie.
  assert.equal(stat(at("2026-11-20T08:00:00Z"), "lubelskie", "2026-11-20T08:00:00Z"), "warn");
  assert.equal(stat(at("2026-11-20T08:50:00Z"), "lubelskie", "2026-11-20T08:50:00Z"), "calm");
  // Czas: 6:30 czasu polskiego (CET) = 5:30 UTC.
  assert.ok(i631.some((x) => x.published === "2026-11-20T05:30:00.000Z"));
  // Odwołanie ataku z powietrza NIE kasuje ostrzeżenia powodziowego 3. stopnia w tym samym województwie.
  const flood = { id: "f", type: "woda", title: "Ostrzeżenie hydrologiczne 3. stopnia – wezbranie z przekroczeniem stanów alarmowych", body: "Powódź", voivodeship: "lubelskie", published: "2026-11-20T04:00:00.000Z", validTo: null };
  const mixed = analyze([flood, ...at("2026-11-20T06:31:00Z")], T("2026-11-20T06:31:00Z"));
  assert.equal(mixed.find((a) => a.id === "f").active, true);
  assert.equal(mixed.find((a) => a.id === "f").sev, "danger");
  // Bez daty w przyszłości: wpis o dacie późniejszej niż „teraz” + 2 min jest pomijany.
  assert.equal(at("2026-11-20T00:00:00Z").length, 0);
  // Treść wiadomości Telegram: nagłówek ZAGROŻENIE, tytuł z treści alertu, źródło RCB.
  const msg = tgText(s631[0].a, "danger");
  assert.ok(msg.includes("ZAGROŻENIE") && msg.includes("Zagrożenie atakiem z powietrza") && msg.includes("RCB (gov.pl)") && msg.includes("hrubieszowskiego"));
}
console.log("OK: wszystkie testy serwera przeszły (parser RSO, reguły Telegram wg wagi, strażnik, Alerty RCB z gov.pl)");
