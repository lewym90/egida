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
import { newsMessage, levelOf as nLevel, categoryOf as nCat, selectNews, markNewsSent, channelsFor, sampleItems, LIMITS as NL } from "./tg-news-lib.mjs";
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
console.log("OK: wszystkie testy serwera przeszły (parser RSO, reguły Telegram wg wagi, strażnik)");
