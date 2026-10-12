// v27: poprawki ekranu „W pobliżu” – opisy AED/szpitali, porządkowanie szpitali, etykiety map, własna pozycja, pasek dolny.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tidyHospitalRows, addNearHospital, parseAed, parseHospitals, unpackAed, unpackHospital, NONAME } from "../js/medical.js";
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log("  ok", name); };

await ok("szpital bez nazwy dostaje adres, a budynek bez nazwy obok nazwanego szpitala jest pomijany", () => {
  const rows = [["w1", 50.0, 20.0, "Szpital Miejski", 1, "Długa 1 Kraków", "+48 12 345 67 89"], ["w2", 50.0005, 20.0005, "Szpital (bez nazwy)", 0, "", ""], ["w3", 51.0, 21.0, "", 0, "Krótka 2 Lublin", ""], ["w4", 52.0, 22.0, "Szpital (bez nazwy)", 0, "", ""]];
  const t = tidyHospitalRows(rows);
  assert.equal(t.length, 3);
  assert.ok(t.some((r) => r[3] === "Szpital, Krótka 2 Lublin"));
  assert.ok(t.some((r) => r[3] === NONAME));
  assert.ok(!t.some((r) => r[0] === "w2"));
});
await ok("ten sam szpital wpisany dwa razy blisko siebie zostaje raz (z SOR i telefonem)", () => {
  const t = tidyHospitalRows([["w1", 50.0, 20.0, "Szpital X", 0, "", ""], ["r2", 50.001, 20.001, "Szpital X", 1, "Adres 1", "+48 1 2"], ["w3", 50.5, 20.5, "Szpital X", 0, "", ""]]);
  assert.equal(t.length, 2); assert.equal(t.find((r) => r[0] === "r2")[4], 1);
});
await ok("szpital: nazwa z name:pl / official_name / operatora", () => {
  const h = parseHospitals({ elements: [
    { type: "way", id: 1, center: { lat: 50, lon: 20 }, tags: { amenity: "hospital", "name:pl": "Szpital PL" } },
    { type: "way", id: 2, center: { lat: 50.5, lon: 20 }, tags: { amenity: "hospital", operator: "SPZOZ Test" } },
  ] }).map(unpackHospital);
  assert.equal(h[0].name, "Szpital PL"); assert.equal(h[1].name, "Szpital – SPZOZ Test");
});
await ok("AED: operator, piętro i „w pobliżu szpitala”", () => {
  const a = parseAed({ elements: [{ type: "node", id: 1, lat: 50.0003, lon: 20.0, tags: { emergency: "defibrillator", operator: "Szpital X", level: "1", description: "oddziały mieszkalne" } }, { type: "node", id: 2, lat: 51, lon: 21, tags: { emergency: "defibrillator" } }] });
  addNearHospital(a, [["w1", 50.0, 20.0, "Szpital X", 1, "", ""]]);
  const [x, y] = a.map(unpackAed);
  assert.equal(x.operator, "Szpital X"); assert.equal(x.level, "1"); assert.match(x.near, /^Szpital X \(ok\. \d+ m\)$/); assert.equal(x.how, "oddziały mieszkalne");
  assert.equal(y.near, ""); assert.equal(y.how, "");
  const old = unpackAed(["n9", 50, 20, "AED", "", "", "", "", "", 0]); assert.equal(old.operator, ""); assert.equal(old.near, "");
});
await ok("ekran: dotknięcie mapy nie przesuwa pozycji, markery nie są czyszczone przy odświeżeniu, brak opisu AED jest jawny", () => {
  const s = src("js/sheltersscreen.js");
  assert.ok(!/map\.on\("click"[\s\S]{0,400}if \(!demo\) \{ stopWatch/.test(s), "stare przesuwanie pozycji");
  assert.match(s, /manualPick/); assert.match(s, /id="shManual"/);
  assert.match(s, /bubblingMouseEvents: false/);
  assert.ok(!/drawMap = \(\) => \{[\s\S]{0,200}gMarks\.clearLayers\(\); gUser/.test(s));
  assert.match(s, /isPopupOpen/); assert.match(s, /Brak opisu miejsca w OpenStreetMap/);
});
await ok("pasek dolny: układ mobilny bez jednostek vh/dvh (iOS) i zabezpieczenie po odświeżeniu", () => {
  const css = src("css/style.css");
  assert.match(css, /body\{position:fixed;inset:0;width:100%\}\.shell\{position:fixed;inset:0;height:auto/);
  assert.match(src("js/app.js"), /pageshow/);
});
console.log(`OK: ${n} grup testów v27`);
