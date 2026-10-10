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
import { evaluate, decide, LIMITS as WD } from "./watchdog.mjs";
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
let w = decide(false, {}, NOW); assert.equal(w.action, "none");
w = decide(true, w.state, NOW); assert.equal(w.action, "down", "pierwszy alarm");
w = decide(true, w.state, NOW + 36e5); assert.equal(w.action, "none", "bez powtarzania co 10 min");
w = decide(true, w.state, NOW + (WD.remindH + 0.1) * 36e5); assert.equal(w.action, "remind", "przypomnienie po kilku godzinach");
w = decide(false, w.state, NOW + 10 * 36e5); assert.equal(w.action, "up", "wiadomość o powrocie do normy"); assert.equal(w.state.down, false);
assert.equal(decide(false, w.state, NOW + 11 * 36e5).action, "none");
console.log("OK: wszystkie testy serwera przeszły (parser RSO, reguły Telegram wg wagi, strażnik)");
