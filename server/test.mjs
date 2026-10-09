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
console.log("OK: wszystkie testy parsera przeszły");
