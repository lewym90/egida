// v34: Lubliniec to nie Lubelskie; wiadomości zza granicy nie trafiają do kraju; encje HTML w tytułach; schrony mają własny kolor.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toItem, decodeEntities } from "../server/news-lib.mjs";
import { mentionsRegion, regionsMentioned } from "../server/news-places.mjs";
import { normalizeNews } from "../js/news.js";
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("  ok", name); };
const now = Date.parse("2026-10-13T07:00:00Z");
const S = { kind: "media", national: true, polishOnly: false, label: "T", region: "all", filter: "media" };
const reg = (title, url, s = S) => { const r = toItem({ title, url: url || "https://x/" + Math.random(), date: "2026-10-13T06:30:00Z" }, s, now, []); return r ? r.region : null; };

await ok("Lubliniec (i „w Lublińcu”) leży w śląskim, nie w lubelskim; Lublin dalej w lubelskim", () => {
  assert.equal(mentionsRegion("Gaz gromadził się w studzience. Nocna ewakuacja w Lublińcu", "lubelskie"), false);
  assert.equal(mentionsRegion("Gaz gromadził się w studzience. Nocna ewakuacja w Lublińcu", "slaskie"), true);
  assert.equal(mentionsRegion("Pożar w Lubliniec", "lubelskie"), false);
  assert.deepEqual(regionsMentioned("Wypadek w Lublinie"), ["lubelskie"]);
  assert.equal(reg("Gaz gromadził się w studzience. Nocna ewakuacja w Lublińcu"), "slaskie");
});
await ok("zdarzenia z USA i innych krajów nie trafiają do żadnego województwa, do „all” ani „world”", () => {
  assert.equal(reg("Tragedia w parku rozrywki. Mężczyzna wypadł z rollercoastera", "https://wydarzenia.interia.pl/swiat/news-tragedia-w-parku-rozrywki,1"), null);
  assert.equal(reg("Tragedia w parku rozrywki w Atlancie. Mężczyzna wypadł z rollercoastera"), null);
  assert.equal(reg("Strzelanina w Teksasie. Nie żyją trzy osoby"), null);
  assert.equal(reg("Tragedia w parku rozrywki. Mężczyzna wypadł z kolejki", "https://wydarzenia.interia.pl/polska/news-x,2"), null, "v37: polskie zdarzenie bez ustalonego miejsca → pomijane");
});
await ok("encje HTML w tytule są zamieniane na znaki (serwer i aplikacja)", () => {
  assert.equal(decodeEntities("Ćwiczenia w Wałbrzychu &ndash; ruch utrudniony"), "Ćwiczenia w Wałbrzychu – ruch utrudniony");
  assert.equal(decodeEntities("Rozb&oacute;j &amp;ndash; &#8222;x&#8221; &#x2013;"), "Rozbój – „x” –");
  const r = toItem({ title: "Ćwiczenia w Wałbrzychu &ndash; utrudnienia", url: "https://x/1", date: "2026-10-13T06:30:00Z" }, S, now, []);
  assert.equal(r.title, "Ćwiczenia w Wałbrzychu – utrudnienia");
  const f = normalizeNews({ items: [{ title: "A &ndash; B", url: "https://x/2", date: "2026-10-13T06:30:00Z", region: "all" }] });
  assert.equal(f.items[0].title, "A – B");
});
await ok("schrony mają pomarańczowy kolor, inny niż niebieska kropka GPS", () => {
  const m = src("js/mapscreen.js"), s = src("js/sheltersscreen.js");
  assert.match(m, /"#0B6B63" : "#E65100"/);
  assert.match(s, /radius: 8[^}]*fillColor: "#E65100"/);
});
await ok("rozgłośnia regionalna nie wypycha wiadomości do innego województwa ani do całego kraju (PiK Bydgoszcz nie w Lubelskiem)", () => {
  const R = (region) => ({ kind: "media", region, label: "R", filter: "media" });
  assert.equal(reg("Ataki w szkołach i horror na bydgoskim Błoniu. Mówili o tym wojewoda Michał Sztybel i nadinsp. Jakub Gorczyński", undefined, R("kujawsko-pomorskie")), "kujawsko-pomorskie");
  assert.equal(reg("Kryzys psychiczny i ataki w szkołach. Ekspert: młodzież potrzebuje uwagi", undefined, R("warminsko-mazurskie")), "warminsko-mazurskie");
  assert.equal(reg("Nie tylko stwarzanie zagrożenia, ale także rozbój ma mieć na sumieniu Wrocławianin, który planował zamach", undefined, R("dolnoslaskie")), "dolnoslaskie");
  assert.equal(mentionsRegion("Ćwiczenia służb na Dolnym Śląsku", "slaskie"), false);
  assert.equal(mentionsRegion("Wypadek na bydgoskim Błoniu", "kujawsko-pomorskie"), true);
});
await ok("opis „sala operacyjna” przy poczcie jest ukrywany, przy szpitalu zostaje", async () => {
  const { sanitizeHow } = await import("../js/medical.js");
  assert.equal(sanitizeHow("wewnątrz placówki - sala operacyjna", "AED – Poczta Polska - UP Lublin 1", ""), "");
  assert.equal(sanitizeHow("wewnątrz placówki - sala operacyjna", "AED – Szpital Wojewódzki", ""), "wewnątrz placówki - sala operacyjna");
  assert.equal(sanitizeHow("parter, klatka schodowa", "Defibrylator AED", ""), "parter, klatka schodowa");
});
console.log(`v34: ${n} testów OK`);
