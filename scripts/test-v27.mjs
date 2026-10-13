// v27: poprawki ekranu „W pobliżu” – opisy AED/szpitali, porządkowanie szpitali, etykiety map, własna pozycja, pasek dolny.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickAddress, buildBatchQuery, applyCache, objLabel, nominatimAddr } from "../server/medical-addr-lib.mjs";
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
  assert.ok(!/manualPick|shManual|manualPos|Wskaż moją pozycję/.test(s), "ręczne wskazywanie pozycji usunięte"); assert.match(s, /panTo/);
  assert.match(s, /bubblingMouseEvents: false/);
  assert.ok(!/drawMap = \(\) => \{[\s\S]{0,200}gMarks\.clearLayers\(\); gUser/.test(s));
  assert.match(s, /isPopupOpen/); assert.ok(!/Gdzie jest[^e]/.test(s), "nagłówek „Gdzie jest” usunięty z kart AED");
});
await ok("pasek dolny: układ mobilny bez jednostek vh/dvh (iOS) i zabezpieczenie po odświeżeniu", () => {
  const css = src("css/style.css");
  assert.match(css, /body\{position:fixed;inset:0;width:100%\}\.shell\{position:fixed;inset:0;height:auto/);
  assert.match(src("js/app.js"), /pageshow/);
});

const sq = (lat, lon, h = 0.0003) => [{ lat: lat - h, lon: lon - h }, { lat: lat - h, lon: lon + h }, { lat: lat + h, lon: lon + h }, { lat: lat + h, lon: lon - h }];
await ok("adres i rodzaj obiektu z OSM: budynek zawierający punkt, najbliższy adres, nazwany obiekt", () => {
  const T = { lat: 50, lon: 20, r: 40 };
  // 1) AED w szkole: budynek bez adresu, adres ma sąsiedni budynek (~25 m); obiekt = szkoła z nazwą
  let r = pickAddress(T, [
    { type: "way", id: 1, tags: { building: "yes" }, geometry: sq(50, 20, 0.0001) },
    { type: "way", id: 2, tags: { amenity: "school", name: "SP nr 5", building: "school" }, geometry: sq(50, 20, 0.0006) },
    { type: "way", id: 3, tags: { building: "yes", "addr:street": "Szkolna", "addr:housenumber": "7", "addr:city": "Lublin" }, geometry: sq(50.0003, 20.0003, 0.0001) },
  ]);
  assert.equal(r.a, "Szkolna 7, Lublin"); assert.ok(r.d > 0 && r.d < 40); assert.equal(r.o, "Szkoła – SP nr 5");
  // 2) budynek zawierający punkt ma własny adres ⇒ d = 0
  r = pickAddress(T, [{ type: "way", id: 1, tags: { building: "apartments", "addr:street": "Długa", "addr:housenumber": "3", "addr:city": "Kraków" }, geometry: sq(50, 20) }]);
  assert.deepEqual(r, { a: "Długa 3, Kraków", d: 0, o: "Budynek mieszkalny" });
  // 3) adres za daleko (> r) ⇒ brak adresu; brak obiektu ⇒ pusty
  r = pickAddress(T, [{ type: "node", id: 9, lat: 50.01, lon: 20, tags: { "addr:street": "X", "addr:housenumber": "1" } }]);
  assert.equal(r.a, ""); assert.equal(r.o, "");
  // 4) nazwany obiekt (punkt) w promieniu 15 m, miasto z sąsiedniego adresu
  r = pickAddress(T, [{ type: "node", id: 5, lat: 50.00005, lon: 20, tags: { name: "Apteka Zdrowie", amenity: "pharmacy" } }, { type: "node", id: 6, lat: 50.0001, lon: 20.0001, tags: { "addr:street": "Prosta", "addr:housenumber": "2" } }, { type: "node", id: 7, lat: 50.0002, lon: 20, tags: { "addr:city": "Radom", "addr:housenumber": "9", "addr:street": "Inna" } }]);
  assert.equal(r.o, "Apteka Zdrowie"); assert.equal(r.a, "Prosta 2, Radom");
});
await ok("zapytanie Overpass dla paczki, etykiety obiektów, Nominatim, pamięć adresów", () => {
  const q = buildBatchQuery([{ lat: 50, lon: 20, r: 40 }, { lat: 51, lon: 21, r: 120 }]);
  assert.match(q, /is_in\(50,20\)->\.a0/); assert.match(q, /around:120,51,21/); assert.match(q, /out tags geom/);
  assert.equal(objLabel({ building: "yes" }).text, ""); assert.equal(objLabel({ shop: "supermarket", name: "Biedronka" }).text, "Supermarket – Biedronka");
  assert.equal(nominatimAddr({ address: { road: "Lipowa", house_number: "4", city: "Lublin" } }), "Lipowa 4, Lublin"); assert.equal(nominatimAddr({ address: { road: "Lipowa", city: "Lublin" } }), "");
  const aed = [["n1", 50, 20, "Defibrylator AED", "", "", "", "", "", 0, "", "", "", "", 0], ["n2", 51, 21, "AED", "", "", "", "Własna 1, Miasto", "", 0, "", "", "", "", 0]];
  applyCache("aed", aed, { n1: { a: "Cache 5, Miasto", d: 20, o: "Szkoła" }, n2: { a: "Inny 2", d: 3, o: "Biuro" } });
  assert.equal(aed[0][7], "Cache 5, Miasto"); assert.equal(aed[0][14], 20); assert.equal(aed[0][13], "Szkoła"); assert.equal(aed[1][7], "Własna 1, Miasto"); assert.equal(aed[1][13], "Biuro");
  const h = [["w1", 50, 20, NONAME, 0, "", "", 0]]; applyCache("szpitale", h, { w1: { a: "Chorych 1, Łódź", d: 0 } });
  assert.equal(h[0][5], "Chorych 1, Łódź"); assert.equal(h[0][3], "Szpital, Chorych 1, Łódź");
  const u = unpackAed(aed[0]); assert.equal(u.obj, "Szkoła"); assert.equal(u.addrD, 20);
});
await ok("każdy plik JS aplikacji ma poprawną składnię (node --check)", async () => {
  const { execFileSync } = await import("node:child_process"), { readdirSync } = await import("node:fs");
  for (const dir of ["js", "server"]) for (const f of readdirSync(new URL("../" + dir + "/", import.meta.url))) if (/\.m?js$/.test(f)) execFileSync(process.execPath, ["--check", new URL(`../${dir}/${f}`, import.meta.url).pathname]);
});
console.log(`OK: ${n} grup testów v27`);
