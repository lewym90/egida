// Test parsera na SZTUCZNEJ próbce (nie jest to prawdziwy format RSO – służy tylko do sprawdzenia logiki).
import assert from "node:assert/strict";
import { parseRso, detectRegion, detectType } from "./rso.mjs";

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
console.log("OK: wszystkie testy parsera przeszły");
