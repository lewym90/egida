// Testy paczki v42: powietrze (zanieczyszczenie decydujące), woda, plecak (terminy), ćwiczenie, motyw, mapa zagrożeń, wiadomości "civil".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseIndex, pollutantOf } from "../server/air-lib.mjs";
import { airAdvice, normalizeAir, AIR_POLL, AIR_ADVICE } from "../js/air.js";
import { parseWater, unpackWater, overpassQueryTile, loadMedicalDb, WATER_KINDS } from "../js/medical.js";
import { normalizeExpiry, normalizeExercise, exportState, importState } from "../js/personal.js";
const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("BŁĄD:", name, "\n", e.message); process.exit(1); } };
const ta = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error("BŁĄD:", name, "\n", e.message); process.exit(1); } };

t("powietrze: kod zanieczyszczenia", () => { assert.equal(pollutantOf("pm2.5"), "PM2.5"); assert.equal(pollutantOf("PM25"), "PM2.5"); assert.equal(pollutantOf("xx"), null); });
t("powietrze: wskaźnik krytyczny wprost", () => {
  const r = parseIndex({ AqIndex: { "Nazwa kategorii indeksu": "Zły", "Data wykonania obliczeń indeksu": "2026-10-14 10:00:00", "Kod zanieczyszczenia krytycznego": "PM10" } });
  assert.deepEqual(r, { idx: 4, at: "2026-10-14 10:00:00", p: "PM10" });
});
t("powietrze: wyznaczanie z najwyższego wskaźnika", () => {
  const r = parseIndex({ AqIndex: { "Nazwa kategorii indeksu": "Dostateczny", "Nazwa kategorii indeksu dla wskaźnika PM10": "Dobry", "Nazwa kategorii indeksu dla wskaźnika O3": "Dostateczny", "Nazwa kategorii indeksu dla wskaźnika NO2": "Umiarkowany" } });
  assert.equal(r.p, "O3");
});
t("powietrze: brak zgodności z poziomem ogólnym = brak wskazania", () => {
  const r = parseIndex({ AqIndex: { "Nazwa kategorii indeksu": "Zły", "Nazwa kategorii indeksu dla wskaźnika PM10": "Dobry" } });
  assert.equal(r.p, null);
});
t("powietrze: dobry poziom nie dostaje dopisku o zanieczyszczeniu", () => {
  assert.equal(airAdvice({ i: 1, p: "PM10" }).pollutant, null);
  const a = airAdvice({ i: 4, p: "PM10" }); assert.equal(a.text, AIR_ADVICE[4]); assert.match(a.pollutant, /PM10/); assert.ok(a.extra.length > 10);
  assert.equal(airAdvice({ i: 4, p: null }).pollutant, null);
  assert.equal(airAdvice({ i: 4, p: "ZZZ" }).pollutant, null);
});
t("powietrze: normalizeAir zachowuje p tylko poprawne i nie ma linku GIOŚ w karcie", () => {
  const now = Date.now();
  const air = normalizeAir({ updated: new Date(now).toISOString(), stations: [{ id: 1, n: "A", la: 51, lo: 17, i: 3, p: "O3" }, { id: 2, n: "B", la: 51, lo: 17, i: 3, p: "<script>" }] }, { now });
  assert.equal(air.stations[0].p, "O3"); assert.equal(air.stations[1].p, null);
  const app = src("js/app.js"); const card = app.slice(app.indexOf("function airCardHtml"), app.indexOf("function airCardHtml") + 1800);
  assert.ok(!/gios\.gov\.pl/.test(card));
});

t("woda: zapytanie Overpass i parsowanie", () => {
  assert.match(overpassQueryTile([50, 20, 51, 21], "water"), /drinking_water/);
  assert.ok(!/defibrillator/.test(overpassQueryTile([50, 20, 51, 21], "water")));
  const j = { elements: [
    { type: "node", id: 1, lat: 50.1, lon: 20.1, tags: { amenity: "drinking_water", name: "Poidełko" } },
    { type: "node", id: 2, lat: 50.2, lon: 20.2, tags: { amenity: "drinking_water", drinking_water: "no" } },
    { type: "node", id: 3, lat: 50.3, lon: 20.3, tags: { amenity: "water_point", seasonal: "yes", description: "przy remizie" } },
    { type: "node", id: 4, lat: 50.4, lon: 20.4, tags: { natural: "spring" } },
    { type: "node", id: 5, lat: 50.5, lon: 20.5, tags: { natural: "spring", drinking_water: "yes" } },
    { type: "node", id: 6, lat: 50.6, lon: 20.6, tags: { amenity: "drinking_water", "disused:amenity": "drinking_water" } },
    { type: "node", id: 7, lat: 10, lon: 10, tags: { amenity: "drinking_water" } },
    { type: "node", id: 8, lat: 50.8, lon: 20.8, tags: { amenity: "drinking_water", access: "private" } },
  ] };
  const rows = parseWater(j);
  assert.deepEqual(rows.map((r) => r[0]), ["n1", "n3", "n5"]);
  const u = rows.map(unpackWater);
  assert.equal(u[0].kind, "woda"); assert.equal(u[1].seasonal, true); assert.equal(u[1].where, "przy remizie"); assert.equal(u[2].wtype, WATER_KINDS[2]); assert.equal(u[0].how, "");
});
await ta("woda: loadMedicalDb(\"woda\") pobiera i zapisuje kopię", async () => {
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const rows = [["n1", 50.1, 20.1, "", 0, "", 0, ""]];
  const ok = await loadMedicalDb("woda", "https://x/water.json", storage, async () => ({ ok: true, json: async () => ({ at: "2026-10-14T00:00:00Z", rows }) }));
  assert.equal(ok.count, 1); assert.equal(ok.items[0].kind, "woda"); assert.equal(ok.stale, false);
  const off = await loadMedicalDb("woda", "https://x/water.json", storage, async () => { throw new Error("offline"); });
  assert.equal(off.stale, true); assert.equal(off.items.length, 1);
});
t("woda: ekran, serwer i konfiguracja", () => {
  const s = src("js/sheltersscreen.js");
  assert.match(s, /\["woda", "Woda"\]/); assert.match(s, /CONFIG\.waterUrl/); assert.match(s, /#0277BD/); assert.match(s, /Jakość wody nie jest tu badana/);
  assert.match(src("js/config.js"), /waterUrl: "https:\/\/raw\.githubusercontent\.com\/lewym90\/egida\/data\/water\.json"/);
  assert.match(src("server/publish.sh"), /git add water\.json/);
  assert.match(src("server/run.sh"), /--only=water/);
  assert.match(src("js/offline.js"), /waterUrl/);
});

t("plecak: terminy ważności i ćwiczenie w kopii danych", () => {
  assert.deepEqual(normalizeExpiry({ p_woda: "2027-01-31", zly: "2027-02-30", "a b": "2027-01-01" }), { p_woda: "2027-01-31" });
  assert.deepEqual(normalizeExpiry(null), {}); assert.deepEqual(normalizeExpiry([1]), {});
  assert.deepEqual(normalizeExercise({ last: "2026-10-01" }), { last: "2026-10-01" }); assert.deepEqual(normalizeExercise({ last: "x" }), { last: "" });
  const ex = exportState({ expiry: { a: "2027-01-01" }, exercise: { last: "2026-10-01" }, theme: "dark" });
  assert.equal(ex.theme, "dark"); assert.deepEqual(ex.expiry, { a: "2027-01-01" });
  const im = importState({ expiry: { a: "2027-01-01", b: "zle" }, exercise: { last: "2026-10-01" }, theme: "auto" });
  assert.deepEqual(im.state.expiry, { a: "2027-01-01" }); assert.equal(im.state.theme, "auto");
  assert.equal(importState({ theme: "neon", senior: true }).state.theme, undefined);
  const app = src("js/app.js");
  assert.match(app, /id="exerciseDone"/); assert.match(app, /data-exp=/);
  // brak kart na Pulpicie
  const pulpit = app.slice(app.indexOf("function screenPulpit"), app.indexOf("function screenPulpit") + 4000);
  assert.ok(!/expiryDueHtml|exerciseHtml/.test(pulpit));
});
t("motyw: ciemny w CSS, domyślnie jasny, wybór w Ustawieniach", () => {
  const css = src("css/style.css");
  assert.match(css, /:root\[data-theme="dark"\]\{--bg:/); assert.match(css, /@media \(prefers-color-scheme:dark\)\{\s*:root\[data-theme="auto"\]/);
  assert.ok(!/^@media \(prefers-color-scheme:dark\)\{\s*:root\{/m.test(css));
  const app = src("js/app.js");
  assert.match(app, /theme: "light"/); assert.match(app, /id="setTheme"/); assert.match(app, /dataset\.theme/);
});
t("mapa zagrożeń: bez schronów, bez przycisku pozycji, GPS na stałe", () => {
  const m = src("js/mapscreen.js");
  assert.ok(!/lyShelters|btnLocate|Pokaż mnie|gShelters|loadPspAround/.test(m));
  assert.match(m, /locate\(onPos/); assert.match(m, /zoom: 8/); assert.match(m, /< 0\.015/); assert.match(m, /20000/); assert.match(m, /120000/);
});
t("wersja i service worker", () => {
  assert.match(src("js/version.js"), /APP_VERSION = "v42"/); assert.match(src("sw.js"), /const VERSION = "egida-v42"/);
});
console.log(`OK: v42 – ${n} testów`);
