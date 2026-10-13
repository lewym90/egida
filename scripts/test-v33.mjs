// v33: wiadomości – poważne zdarzenia z kraju nie giną w filtrze; odświeżanie na żywo w aplikacji.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toItem, passesMedia } from "../server/news-lib.mjs";
import { nationalThreat, strongIncident, foreignEvent } from "../server/news-places.mjs";
import { SOURCES } from "../server/news-sources.mjs";
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("  ok", name); };
const now = Date.parse("2026-10-13T07:00:00Z");
const S = { kind: "media", national: true, polishOnly: true, label: "T", region: "all", filter: "media" };
const reg = (title, s = S) => { const r = toItem({ title, url: "https://x/" + Math.random(), date: "2026-10-13T06:30:00Z" }, s, now, []); return r ? r.region : null; };

await ok("zatrzymany Ukrainiec planujący zamach w Polsce trafia do całego kraju, zamach za granicą nie", () => {
  assert.equal(nationalThreat("Zatrzymany Ukrainiec planował zamach na wiele osób"), true);
  assert.equal(nationalThreat("Rosjanin planował zamach w Moskwie"), false);
  assert.equal(nationalThreat("Zamach w Pakistanie. Wielu zabitych"), false);
  assert.equal(reg("Zatrzymany Ukrainiec planował zamach na wiele osób"), "all");
  assert.equal(reg("Zamach w Pakistanie. Wielu zabitych"), null);
});
await ok("poważne zdarzenie bez pewnego miejsca jest pomijane (nie zgadujemy), zagranica odpada", () => {
  assert.equal(reg("Wypadek autobusu. Nie żyją trzy osoby"), null, "v37: miejsca nie ustalono pewnie → wpis pomijany, nie „cały kraj”");
  assert.equal(reg("Nożownik zaatakował w sklepie. Policja zatrzymała sprawcę", { ...S, polishOnly: false }), null);
  assert.equal(reg("Katastrofa lotnicza w Brazylii. Nie żyje 20 osób", { ...S, polishOnly: false }), null);
  assert.equal(reg("Atak nożownika w Radomsku. Są ranni"), "lodzkie");
  assert.equal(reg("Kierowca zginął na S7 pod Warszawą"), "mazowieckie");
});
await ok("sport, kultura i wyroki nadal odpadają; słowo „wideo” nie kasuje wypadku", () => {
  for (const t of ["Legia wygrała mecz. Zabił bramkę", "Skazany za zabójstwo. Wyrok sądu", "Koncert w Lublinie, ranni po bójce"]) assert.equal(passesMedia(t), false, t);
  for (const t of ["Wideo: wypadek na S8, nie żyje kierowca", "Ekspert o ataku nożownika w szkole"]) assert.equal(passesMedia(t), true, t);
  assert.ok(strongIncident("Nożownik zaatakował") && !strongIncident("Remont drogi w Lublinie") && foreignEvent("Wybuch w Strefie Gazy"));
});
await ok("źródła: dodana Wirtualna Polska, kanały polskie mają polishOnly, raport zawiera próbkę odrzuconych", () => {
  const ids = SOURCES.map((x) => x.id); assert.ok(ids.includes("media-wp") && ids.includes("media-onet"));
  assert.equal(SOURCES.find((x) => x.id === "media-polsatnews").polishOnly, true); assert.ok(!SOURCES.find((x) => x.id === "media-wp").polishOnly);
  assert.equal(SOURCES.find((x) => x.id === "media-tvn24").urls[0], "https://tvn24.pl/polska.xml");
  assert.match(src("server/news-sync.mjs"), /rep\.dropped =/);
});
await ok("aplikacja: odświeżanie na żywo (minuta/2 min, powrót z tła, sieć), przerysowanie tylko przy zmianie danych, 5 wiadomości na Pulpicie", () => {
  const a = src("js/app.js");
  assert.match(a, /LIVE_ALERT_MS = 60 \* 1000/); assert.match(a, /visibilitychange", resumeLive/); assert.match(a, /addEventListener\("online"/); assert.match(a, /pageshow", resumeLive/);
  assert.match(a, /sigAlerts\(\) !== before\[0\]/); assert.match(a, /softRender\(\)/); assert.match(a, /newsForRegion\(newsData, state\.region, \{ max: 5 \}\)/);
  assert.ok(!/10 \* 60 \* 1000\);\n/.test(a.split("odświeżanie na żywo")[1] || ""), "stare długie interwały usunięte");
});
console.log(`OK: ${n} grup testów v33`);
