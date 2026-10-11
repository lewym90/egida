// Testy v16: szacowanie prędkości z ruchu, czas do granicy, cieniowanie obwodów, skumulowany raport NEPTUN.
// Uruchamianie: node scripts/test-v16.mjs. Dane w testach są SZTUCZNE albo skrócone próbki z raportu serwera z 10.10.2026.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ThreatStore, applySnapshotJson, estimateMotion, buildView, normalizeAlert, TRACK } from "../js/neptun.js";
import { destination } from "../js/geo.js";
import { shadeAreas, shadeSignature, oblastKey } from "../js/ua-shade.js";
import { UA_OBLASTS } from "../js/ua-oblasts.js";
import { mergeSeen, loadSeen, saveSeen, tagsOf, SEEN_LIMITS } from "../server/neptun-seen.mjs";
let n = 0;
const ok = (name, fn) => { try { fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };

/* ---------- ruch ---------- */
const T0 = Math.floor((Date.now() - 6 * 60e3) / 1000) * 1000; // względem „teraz”, bo widok odrzuca stare obiekty
const pt = (sec, p, unc = 4) => ({ at: T0 + sec * 1000, lat: p.lat, lon: p.lon, unc });
const START = { lat: 50.5, lon: 27.0 };
ok("estimateMotion: prędkość z przesunięcia (150 km/h przez 5 min = 12,5 km, więcej niż niepewność 4+4 km)", () => {
  const b = destination(START, 270, 12.5);
  const m = estimateMotion([pt(0, START), pt(300, b)], 270);
  assert.ok(m); assert.ok(Math.abs(m.kmh - 150) < 3, `kmh=${m.kmh}`); assert.ok(Math.abs(m.bearing - 270) < 3);
});
ok("estimateMotion: za krótki odstęp czasu albo za małe przesunięcie ⇒ null", () => {
  assert.equal(estimateMotion([pt(0, START), pt(20, destination(START, 270, 5))], 270), null);
  assert.equal(estimateMotion([pt(0, START), pt(300, destination(START, 270, 2))], 270), null); // < minMoveKm
});
ok("estimateMotion: przesunięcie w granicach szumu pozycji (niepewność ±4 km ×2) ⇒ null", () => {
  assert.equal(estimateMotion([pt(0, START, 4), pt(240, destination(START, 270, 7))], 270), null); // 7 km < 4+4
});
ok("estimateMotion: kierunek ruchu niezgodny z kursem ⇒ null; nierealna prędkość ⇒ null", () => {
  assert.equal(estimateMotion([pt(0, START), pt(300, destination(START, 90, 12.5))], 270), null);
  assert.equal(estimateMotion([pt(0, START), pt(60, destination(START, 270, 100))], 270), null); // 6000 km/h
  assert.equal(estimateMotion([pt(0, START)], 270), null);
});
const rec = (id, at, p, over = {}) => ({ id, type: "uav", title: "БпЛА", region: "Волинська область", lat: p.lat, lon: p.lon, heading: 270, confidenceLevel: "high", sourceCount: 2, updatedAt: new Date(at).toISOString(), confirmedAt: new Date(at).toISOString(), status: "active", uncertaintyKm: 4, positionQuality: "confirmed", lifecycle: "confirmed", ...over });
ok("ThreatStore: po kilku odczytach dolicza prędkość (speedEst), bez ruchu brak prędkości", () => {
  const s = new ThreatStore();
  for (let i = 0; i <= 4; i++) applySnapshotJson(s, { serverTime: new Date(T0 + i * 60e3).toISOString(), threats: [rec("a", T0 + i * 60e3, destination(START, 270, 2.5 * i))] });
  const t = s.items.get("a");
  assert.equal(t.speedEst, true); assert.ok(Math.abs(t.speedKmh - 150) < 5, `speed=${t.speedKmh}`);
  const s2 = new ThreatStore();
  for (let i = 0; i <= 4; i++) applySnapshotJson(s2, { threats: [rec("b", T0 + i * 60e3, START)] });
  assert.equal(s2.items.get("b").speedKmh, null);
});
ok("ThreatStore: prędkość podana przez źródło ma pierwszeństwo, a pozycje przybliżone i „destination” nie są śledzone", () => {
  const s = new ThreatStore();
  for (let i = 0; i <= 4; i++) applySnapshotJson(s, { threats: [rec("c", T0 + i * 60e3, destination(START, 270, 2.5 * i), { velocity: { bearingDeg: 270, speedKmh: 90 } })] });
  assert.equal(s.items.get("c").speedKmh, 90); assert.ok(!s.items.get("c").speedEst);
  const s2 = new ThreatStore();
  for (let i = 0; i <= 4; i++) applySnapshotJson(s2, { threats: [rec("d", T0 + i * 60e3, destination(START, 270, 2.5 * i), { positionQuality: "approx", uncertaintyKm: 25 }), rec("e", T0 + i * 60e3, destination(START, 270, 2.5 * i), { destination: true })] });
  assert.equal(s2.items.get("d").speedKmh, null); assert.equal(s2.items.get("e").speedKmh, null); assert.equal(s2.hist.size, 0);
});
ok("ThreatStore: ślad znika razem z obiektem (migawka bez niego, remove)", () => {
  const s = new ThreatStore();
  applySnapshotJson(s, { threats: [rec("a", T0, START), rec("b", T0, START)] });
  assert.equal(s.hist.size, 2);
  applySnapshotJson(s, { threats: [rec("a", T0 + 10e3, START)] });
  assert.equal(s.hist.size, 1); s.remove("a"); assert.equal(s.hist.size, 0);
});
ok("ThreatStore: starszy odczyt nie cofa śladu, historia ma limit punktów", () => {
  const s = new ThreatStore();
  for (let i = 0; i < 30; i++) applySnapshotJson(s, { threats: [rec("a", T0 + i * 10e3, destination(START, 270, i * 0.4))] });
  assert.ok(s.hist.get("a").length <= TRACK.maxPoints);
  applySnapshotJson(s, { threats: [rec("a", T0, START)] }); // stary odczyt
  assert.ok(s.hist.get("a").at(-1).at > T0);
});
ok("widok: obiekt z szacunkiem prędkości zbliżający się do granicy dostaje czas do granicy (border.etaMin)", () => {
  const s = new ThreatStore();
  const start = { lat: 51.0, lon: 24.9 }; // ok. 70 km na wschód od granicy; leci na zachód
  for (let i = 0; i <= 4; i++) applySnapshotJson(s, { serverTime: new Date(T0 + i * 60e3).toISOString(), threats: [rec("a", T0 + i * 60e3, destination(start, 270, 2.5 * i))] });
  const v = buildView(s, null, true, {});
  assert.equal(v.rows.length, 1);
  const r = v.rows[0];
  assert.ok(r.border && r.border.ok, JSON.stringify(r.border)); assert.ok(r.border.etaMin > 0 && r.border.etaMin < 120, `eta=${r.border.etaMin}`);
});
ok("widok: bez prędkości brak czasu do granicy (nie zgadujemy)", () => {
  const s = new ThreatStore();
  applySnapshotJson(s, { serverTime: new Date(T0).toISOString(), threats: [rec("a", T0, { lat: 51.0, lon: 24.5 })] });
  assert.equal(buildView(s, null, true, {}).rows[0].border, null);
});

/* ---------- cieniowanie ---------- */
ok("oblastKey: warianty nazw tego samego obwodu i miasto Kijów ≠ obwód kijowski", () => {
  assert.equal(oblastKey("Донецька область"), "донецька"); assert.equal(oblastKey("донецька обл."), "донецька");
  assert.equal(oblastKey("м. Київ"), "київ"); assert.equal(oblastKey("Київ"), "київ"); assert.equal(oblastKey("Київська область"), "київська");
  assert.notEqual(oblastKey("Київська область"), oblastKey("м. Київ"));
});
ok("granice obwodów: 25 jednostek, poprawne współrzędne w obrębie Ukrainy, plik lekki", () => {
  const names = Object.keys(UA_OBLASTS); assert.equal(names.length, 25);
  for (const [nm, rings] of Object.entries(UA_OBLASTS)) {
    assert.ok(rings.length >= 1, nm);
    for (const ring of rings) { assert.ok(ring.length >= 4, nm); for (const [lon, lat] of ring) assert.ok(lon > 21 && lon < 41 && lat > 44 && lat < 53, `${nm} ${lon},${lat}`); }
  }
  assert.ok(readFileSync(new URL("../js/ua-oblasts.js", import.meta.url)).length < 80_000);
});
const REAL_ALERTS = { oblasts: [{ key: "луганська", name: "Луганська область", oblast: "Луганська область", since: "2026-10-10T10:00:00Z", level: "red" }],
  raions: [{ key: "бахмутський", name: "Бахмутський район", oblast: "Донецька область", since: "2026-10-10T17:05:50Z", level: "red", reasons: ["Ракетна загроза (червоний рівень)"] }, { key: "краматорський", name: "Краматорський район", oblast: "Донецька область", since: "2026-10-10T17:30:00Z", level: "red", reasons: ["Дронова загроза (жовтий рівень)"] }, { key: "x", name: "Сімферопольський район", oblast: "Автономна Республіка Крим", level: "red" }] };
ok("normalizeAlert zachowuje oryginalną nazwę obwodu (oblastRaw)", () => {
  const a = normalizeAlert(REAL_ALERTS.raions[0], "raion");
  assert.equal(a.oblastRaw, "Донецька область"); assert.equal(a.scope, "raion");
});
ok("shadeAreas: cały obwód vs część rejonów, powody i najwcześniejszy początek; Krym bez granic", () => {
  const s = new ThreatStore(); s.applyAlerts(REAL_ALERTS.oblasts, REAL_ALERTS.raions);
  const { areas, unmatched } = shadeAreas(buildView(s, null, true).alerts);
  assert.equal(areas.length, 2);
  const lug = areas.find((a) => a.key === "луганська"), don = areas.find((a) => a.key === "донецька");
  assert.equal(lug.whole, true); assert.equal(don.whole, false); assert.equal(don.raions, 2);
  assert.deepEqual(don.reasons.sort(), ["zagrożenie dronami", "zagrożenie rakietowe"]);
  assert.equal(don.since, Date.parse("2026-10-10T17:05:50Z"));
  assert.equal(unmatched.length, 1); assert.ok(!/[Ѐ-ӿ]/.test(unmatched[0]));
});
ok("shadeAreas: puste dane i alarm całego obwodu + rejony ⇒ obwód „whole”; podpis zmienia się z danymi", () => {
  assert.deepEqual(shadeAreas([]), { areas: [], unmatched: [] });
  const s = new ThreatStore(); s.applyAlerts([{ name: "Донецька область", oblast: "Донецька область", level: "red" }], REAL_ALERTS.raions.slice(0, 1));
  const a = shadeAreas(buildView(s, null, true).alerts).areas;
  assert.equal(a.length, 1); assert.equal(a[0].whole, true);
  const s2 = new ThreatStore(); s2.applyAlerts([], REAL_ALERTS.raions.slice(0, 1));
  assert.notEqual(shadeSignature(a), shadeSignature(shadeAreas(buildView(s2, null, true).alerts).areas));
});

/* ---------- skumulowany raport ---------- */
const SAMPLE = [rec("1", T0, START), rec("2", T0, START, { type: "kab", heading: null }), rec("3", T0, START, { trail: [{ lat: 50, lon: 27, t: 1 }, { lat: 50.1, lon: 27.1, t: 2 }] }), rec("4", T0, START, { count: 3, velocity: { speedKmh: 120, bearingDeg: 10 } })];
ok("mergeSeen: typy, pola, wartości pól wyliczeniowych i próbki rzadkich rekordów (trail, speed, count>1)", () => {
  const s = mergeSeen(null, SAMPLE, [{ type: "snapshot", keys: ["type", "ts", "data"], sample: { threats: [] } }], "2026-10-10T20:00:00Z");
  assert.deepEqual(Object.keys(s.types).sort(), ["kab", "uav"]); assert.equal(s.types.uav.count, 3);
  assert.equal(s.records, 4); assert.equal(s.runs, 1);
  assert.ok(s.fields.trail && s.fields.velocity && s.fields.heading);
  assert.equal(s.enums.type.kab.count, 1);
  assert.ok(s.samples.trail && s.samples["speed"] && s.samples["count>1"] && s.samples["type:kab"]);
  assert.deepEqual(s.samples.trail[0].record.trail[0], { lat: 50, lon: 27, t: 1 });
  assert.equal(s.ws.snapshot.count, 1);
});
ok("mergeSeen: raport tylko rośnie, nie zmienia wejścia, pierwsze próbki nie są nadpisywane, limity działają", () => {
  const a = mergeSeen(null, SAMPLE, [], "2026-10-10T20:00:00Z");
  const copy = JSON.stringify(a);
  const b = mergeSeen(a, [rec("9", T0, START, { type: "missile", trail: [1] })], [], "2026-10-10T21:00:00Z");
  assert.equal(JSON.stringify(a), copy);
  assert.equal(b.runs, 2); assert.ok(b.types.missile && b.types.uav); assert.equal(b.since, "2026-10-10T20:00:00Z"); assert.equal(b.updatedAt, "2026-10-10T21:00:00Z");
  assert.equal(b.samples.trail.length, 2); assert.deepEqual(b.samples.trail[0].record.trail[0], { lat: 50, lon: 27, t: 1 });
  const many = Array.from({ length: 100 }, (_, i) => rec("x" + i, T0, START, { type: "t" + i }));
  const c = mergeSeen(null, many, [], "2026-10-10T20:00:00Z");
  assert.ok(Object.keys(c.types).length <= SEEN_LIMITS.types); assert.ok(Object.keys(c.samples).length <= SEEN_LIMITS.tags);
  assert.ok(JSON.stringify(c).length < 100_000);
});
ok("mergeSeen: śmieciowe wejście nie wywraca raportu; tagsOf rozpoznaje rzadkie rekordy", () => {
  const s = mergeSeen(null, [null, 5, "x", {}, { type: null }], [null, {}], "2026-10-10T20:00:00Z");
  assert.equal(s.records, 2);
  assert.deepEqual(tagsOf({ type: "uav", trail: [] }), ["type:uav"]); assert.ok(tagsOf({ areaOnly: true, status: "stale" }).includes("status:stale"));
});
ok("loadSeen / saveSeen: zapis atomowy i odczyt; brak pliku ⇒ null", () => {
  const dir = mkdtempSync(join(tmpdir(), "egida-seen-")); const f = join(dir, "seen.json");
  assert.equal(loadSeen(f), null);
  const s = mergeSeen(null, SAMPLE, [], "2026-10-10T20:00:00Z"); saveSeen(f, s);
  assert.deepEqual(loadSeen(f), s);
  writeFileSync(f, "{uszkodzony"); assert.equal(loadSeen(f), null); // uszkodzony plik nie zatrzymuje obserwatora: zaczynamy od nowa
  assert.equal(mergeSeen(loadSeen(f), SAMPLE, [], "2026-10-10T20:00:00Z").runs, 1);
});

console.log(`OK: ${n} grup testów v16 przeszło`);
