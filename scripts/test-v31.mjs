// v31: ręcznie potwierdzone defibrylatory (js/aed-extra.js), wskazówka o szpitalu, szybsze mapy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AED_EXTRA } from "../js/aed-extra.js";
import { loadMedicalDb } from "../js/medical.js";
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const mem = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
const fake = (rows) => async () => ({ ok: true, json: async () => ({ at: "2026-10-13T00:00:00Z", rows }) });
const osmRow = ["n1", 50.0, 20.0, "Defibrylator AED", "hol", "", "", "", "", 0, "", "", "", "", 0];

assert.ok(AED_EXTRA.length >= 1);
for (const r of AED_EXTRA) { assert.equal(r.length, 15, "wiersz ma 15 pól"); assert.ok(Number.isFinite(r[1]) && Number.isFinite(r[2]) && r[1] > 48 && r[1] < 55 && r[2] > 14 && r[2] < 25); assert.ok(r[3] && r[7]); }
console.log("  ok wpisy aed-extra mają poprawny format");

let d = await loadMedicalDb("aed", "https://x/aed.json", mem(), fake([osmRow]));
assert.equal(d.count, 1); assert.equal(d.extra, AED_EXTRA.length); assert.equal(d.items.length, 1 + AED_EXTRA.length);
assert.ok(d.items.some((x) => x.id === AED_EXTRA[0][0] && x.addr.includes("Radziwiłłowska")));
console.log("  ok punkty potwierdzone na miejscu są dodawane do listy z OSM");

const near = ["n2", AED_EXTRA[0][1] + 0.0001, AED_EXTRA[0][2], "Defibrylator AED", "", "", "", "", "", 0, "", "", "", "", 0];
d = await loadMedicalDb("aed", "https://x/aed.json", mem(), fake([osmRow, near]));
assert.equal(d.extra, 0); assert.equal(d.items.length, 2);
console.log("  ok wpis znika, gdy w OSM jest już defibrylator w promieniu 30 m");

assert.match(src("sw.js"), /js\/aed-extra\.js/);
assert.match(src("js/sheltersscreen.js"), /Bliżej jest szpital/);
assert.match(src("js/mapscreen.js"), /updateWhenIdle: false/);
assert.match(src("index.html"), /preconnect" href="https:\/\/tile\.openstreetmap\.org/);
console.log("  ok sw, wskazówka o szpitalu, opcje map");
console.log("OK: 4 grupy testów v31");
