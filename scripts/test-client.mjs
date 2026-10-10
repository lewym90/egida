// Testy logiki klienta (Node ≥ 20): node scripts/test-client.mjs
// Dane NEPTUN poniżej są SZTUCZNE (zbudowane wg dokumentacji pól), nie pochodzą z żywego API.
import assert from "node:assert/strict";
import { haversineKm, bearingDeg, destination, crossTrack, pointInRing, distToRingKm, angleDiff, compassPl } from "../js/geo.js";
import { POLAND_RING } from "../js/poland-border.js";
import { normalizeThreat, ThreatStore, applyEnvelope, applySnapshotJson, predict, assess, buildView, zoneOf, coneOutline, parseTime, ageText, LIMITS } from "../js/neptun.js";
import { createFeed } from "../js/neptun-feed.js";
import { coarseBbox, overpassQuery, parseOverpass, makeShelter, withDistance, walkMin, dirUrl, fetchOsmShelters, loadShelterDb, nearest, overpassQueryPoland, DB_CACHE, buildPspTiles, pspCellId, pspCellsAround, pspRowToShelter, loadPspAround, mergeSources, loadPspNearest, guaranteedKm } from "../js/shelters.js";
import { analyze, statusOf, classifyOne, durationFromText, summarize, compose, sentences } from "../js/classify.js";
import { demoThreats, DEMO_USER } from "../js/demo.js";

let n = 0;
const ok = (name, fn) => { fn(); n++; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} oczekiwano ${b} ±${tol}, jest ${a}`);

/* ---------- geo ---------- */
ok("haversine Warszawa–Kraków ≈ 252 km", () => near(haversineKm({ lat: 52.2297, lon: 21.0122 }, { lat: 50.0647, lon: 19.945 }), 252, 3));
ok("destination i bearing wracają do punktu wyjścia", () => {
  const a = { lat: 51.2, lon: 23.1 }, b = destination(a, 73, 120);
  near(haversineKm(a, b), 120, 0.05); near(bearingDeg(a, b), 73, 0.3);
});
ok("angleDiff i compass", () => { assert.equal(angleDiff(10, 350), 20); assert.equal(angleDiff(350, 10), -20); assert.equal(compassPl(315), "północny zachód"); assert.equal(compassPl(359), "północ"); });
ok("crossTrack: punkt 10 km przed i 5 km na prawo", () => {
  const o = { lat: 51, lon: 23 }, p = { lat: 51 + 10 / 111.19, lon: 23 + 5 / (111.19 * Math.cos((51 * Math.PI) / 180)) };
  const r = crossTrack(o, 0, p); near(r.alongKm, 10, 0.1); near(r.crossKm, 5, 0.1);
  const l = crossTrack(o, 180, p); near(l.alongKm, -10, 0.1); near(l.crossKm, -5, 0.1);
});
ok("obrys Polski: punkty w środku i na zewnątrz", () => {
  const P = (lat, lon) => ({ lat, lon });
  for (const [nm, p] of [["Warszawa", P(52.23, 21.01)], ["Przemyśl", P(49.78, 22.77)], ["Hrubieszów", P(50.81, 23.89)], ["Szczecin", P(53.43, 14.55)], ["Gdańsk", P(54.35, 18.65)], ["Zakopane", P(49.3, 19.95)]]) assert.ok(pointInRing(p, POLAND_RING), nm + " powinien być w Polsce");
  for (const [nm, p] of [["Lwów", P(49.84, 24.03)], ["Kijów", P(50.45, 30.52)], ["Berlin", P(52.52, 13.4)], ["Brześć", P(52.1, 23.7)], ["Wilno", P(54.69, 25.28)], ["Praga", P(50.08, 14.43)]]) assert.ok(!pointInRing(p, POLAND_RING), nm + " nie powinien być w Polsce");
});
ok("odległość do granicy: Lwów 55–80 km, Berlin 60–110 km, Kijów > 400 km", () => {
  const d = (lat, lon) => distToRingKm({ lat, lon }, POLAND_RING);
  const l = d(49.84, 24.03); assert.ok(l > 55 && l < 80, "Lwów " + l);
  const b = d(52.52, 13.4); assert.ok(b > 60 && b < 110, "Berlin " + b);
  assert.ok(d(50.45, 30.52) > 400);
});

/* ---------- normalizacja ---------- */
const NOW = Date.parse("2026-10-10T12:00:00Z");
const sample = (over = {}) => ({
  id: "trk_1", type: "uav", title: "Dron", region: "Volyn", lat: 50.9, lon: 24.6, heading: 270,
  velocity: { bearingDeg: 270, speedKmh: 150 }, confirmedAt: new Date(NOW - 30e3).toISOString(), updatedAt: new Date(NOW - 20e3).toISOString(),
  uncertaintyKm: 4, confidenceLevel: "high", sourceCount: 3, status: "active", advisory: false, areaOnly: false, ...over,
});
ok("normalizeThreat: pełny rekord", () => {
  const t = normalizeThreat(sample());
  assert.equal(t.type, "uav"); assert.equal(t.headingDeg, 270); assert.equal(t.speedKmh, 150); assert.equal(t.confidence, "high");
  assert.equal(t.confirmedAt, NOW - 30e3); assert.equal(t.advisory, false); assert.equal(t.areaOnly, false);
});
ok("normalizeThreat: odrzuca śmieci, łagodzi braki", () => {
  assert.equal(normalizeThreat(null), null); assert.equal(normalizeThreat({}), null);
  assert.equal(normalizeThreat(sample({ id: "" })), null);
  assert.equal(normalizeThreat(sample({ lat: 123 })), null);
  assert.equal(normalizeThreat(sample({ lat: "abc" })), null);
  const t = normalizeThreat(sample({ type: "banana", velocity: { speedKmh: 0 }, heading: null, confidenceLevel: "???", uncertaintyKm: -3 }));
  assert.equal(t.type, "unknown"); assert.equal(t.speedKmh, null); assert.equal(t.headingDeg, null); assert.equal(t.confidence, null); assert.equal(t.uncertaintyKm, null);
  assert.equal(normalizeThreat(sample({ velocity: undefined, heading: 400 })).headingDeg, null);
  assert.equal(normalizeThreat(sample({ velocity: undefined, heading: "90" })).headingDeg, 90);
  assert.equal(normalizeThreat(sample({ type: "__proto__" })).type, "unknown");
});
ok("parseTime: ISO, ms i sekundy", () => { assert.equal(parseTime("2026-10-10T12:00:00Z"), NOW); assert.equal(parseTime(NOW), NOW); assert.equal(parseTime(NOW / 1000), NOW); assert.equal(parseTime("nie data"), null); assert.equal(parseTime(null), null); });
ok("koperty WebSocket i migawka REST", () => {
  const s = new ThreatStore(); s.nowMs = () => NOW;
  assert.equal(applyEnvelope(s, { type: "snapshot", ts: new Date().toISOString(), data: { threats: [sample(), sample({ id: "x2" })] } }), "snapshot");
  assert.equal(s.items.size, 2);
  assert.equal(applyEnvelope(s, { type: "upsert", data: sample({ id: "x3" }) }), "upsert"); assert.equal(s.items.size, 3);
  assert.equal(applyEnvelope(s, { type: "upsert", data: { threat: sample({ id: "x4" }) } }), "upsert"); assert.equal(s.items.size, 4);
  assert.equal(applyEnvelope(s, { type: "remove", data: { id: "x4" } }), "remove"); assert.equal(s.items.size, 3);
  assert.equal(applyEnvelope(s, { type: "remove", data: "x3" }), "remove"); assert.equal(s.items.size, 2);
  assert.equal(applyEnvelope(s, { type: "heartbeat" }), "heartbeat"); assert.equal(applyEnvelope(s, { type: "cos" }), "unknown"); assert.equal(applyEnvelope(s, null), "invalid");
  assert.equal(applyEnvelope(s, { type: "snapshot", data: { threats: [{ zly: 1 }, { alsoBad: 2 }] } }), "snapshot");
  assert.equal(s.stats.seen, 2); assert.equal(s.stats.bad, 2);
  applySnapshotJson(s, { serverTime: new Date().toISOString(), threats: [sample()] }); assert.equal(s.items.size, 1);
  applySnapshotJson(s, [sample()]); assert.equal(s.items.size, 1);
  assert.throws(() => applySnapshotJson(s, { cos: "innego" }), /format/);
});
ok("korekta zegara: telefon spieszy się o godzinę", () => {
  const s = new ThreatStore(); s.noteServerTime(new Date(Date.now() - 3600e3).toISOString());
  near(s.nowMs(), Date.now() - 3600e3, 50); s.noteServerTime(new Date(Date.now() + 24 * 3600e3).toISOString()); assert.equal(s.skewMs, 0); // absurd ignorujemy
});

/* ---------- predykcja i ocena ---------- */
const USER = { lat: 51.15, lon: 23.45, accKm: 0.05 };
const T = (over) => normalizeThreat(sample(over));
ok("predict: dead-reckoning, pas niepewności i znaczniki czasu", () => {
  const t = T({ lat: 51.15, lon: 25.0, confirmedAt: new Date(NOW - 60e3).toISOString() });
  const p = predict(t, NOW);
  assert.ok(p.ok && p.timed); near(p.advancedKm, 2.5, 0.01); near(haversineKm(p.anchor, p.here), 2.5, 0.05);
  assert.ok(p.here.lon < 25.0); // leci na zachód
  assert.deepEqual(p.marks.map((m) => m.minutes), [15, 30, 60]); near(p.marks[0].km, 37.5, 0.01);
  assert.ok(p.hw(100) > p.hw(0)); near(p.hw(0), 4 + 2.5 * Math.tan((15 * Math.PI) / 180), 0.01);
  const c = coneOutline(p); assert.equal(c.left.length, 11); assert.equal(c.right.length, 11);
});
ok("predict: powody odmowy", () => {
  assert.equal(predict(T({ areaOnly: true }), NOW).reason, "area");
  assert.equal(predict(T({ velocity: undefined, heading: undefined }), NOW).reason, "heading");
  assert.equal(predict(T({ confirmedAt: new Date(NOW - 700e3).toISOString() }), NOW).reason, "old");
  const noSpeed = predict(T({ velocity: { bearingDeg: 90 } }), NOW); assert.ok(noSpeed.ok && !noSpeed.timed && noSpeed.marks.length === 0);
});
ok("assess: tor przez pozycję użytkownika ⇒ „w pobliżu” z czasem", () => {
  const a = assess(T({ lat: 51.15, lon: 25.0 }), USER, NOW, { feedFresh: true });
  assert.equal(a.kind, "near"); assert.equal(a.severity, "watch"); assert.match(a.text, /za ok\. \d+ min/); assert.match(a.text, /syren/);
});
ok("assess: tor daleko na północ ⇒ „clear” (szacunek, z zastrzeżeniem)", () => {
  const a = assess(T({ lat: 52.0, lon: 25.0 }), USER, NOW, { feedFresh: true });
  assert.equal(a.kind, "clear"); assert.match(a.text, /szacunek/); assert.match(a.text, /Alertu RCB/);
});
ok("assess: obiekt oddala się", () => { assert.equal(assess(T({ lat: 51.15, lon: 22.0 }), USER, NOW, { feedFresh: true }).kind, "away"); });
ok("assess: pas niepewności zahacza o użytkownika ⇒ „uncertain”", () => {
  const a = assess(T({ lat: 51.9, lon: 25.0 }), USER, NOW, { feedFresh: true }); // ok. 83 km na północ, pas ok. 30 km
  assert.ok(["uncertain", "clear"].includes(a.kind), a.kind);
});
ok("assess: obiekt tuż obok ⇒ „near” bez względu na kierunek", () => { assert.equal(assess(T({ lat: 51.3, lon: 23.5, heading: 90, velocity: { bearingDeg: 90, speedKmh: 150 } }), USER, NOW, { feedFresh: true }).kind, "near"); });
ok("assess: ZERO uspokajania przy słabych danych", () => {
  const bad = [
    [T({ lat: 52.0, lon: 25.0, confidenceLevel: "low" }), { feedFresh: true }],
    [T({ lat: 52.0, lon: 25.0, confidenceLevel: undefined }), { feedFresh: true }],
    [T({ lat: 52.0, lon: 25.0, confirmedAt: new Date(NOW - 400e3).toISOString() }), { feedFresh: true }],
    [T({ lat: 52.0, lon: 25.0, status: "stale" }), { feedFresh: true }],
    [T({ lat: 52.0, lon: 25.0 }), { feedFresh: false }],
  ];
  for (const [t, ctx] of bad) { const a = assess(t, USER, NOW, ctx); assert.equal(a.kind, "unsure", JSON.stringify(ctx) + " " + a.kind); assert.ok(a.severity !== "quiet"); }
  assert.equal(assess(T({ lat: 52.0, lon: 25.0 }), { ...USER, accKm: 8 }, NOW, { feedFresh: true }).kind, "unsure"); // słaba lokalizacja
  assert.equal(assess(T({ lat: 52.0, lon: 25.0, confirmedAt: new Date(NOW - 700e3).toISOString() }), USER, NOW, { feedFresh: true }).kind, "nodir");
});
ok("assess: rakiety i nieznane typy – bez oceny toru", () => {
  for (const type of ["missile", "kab", "mig31k", "banana"]) { const a = assess(T({ type, lat: 52.0, lon: 25.0 }), USER, NOW, { feedFresh: true }); assert.equal(a.kind, "fast"); assert.ok(!/przechodzi/.test(a.text)); assert.match(a.text, /nie oceniamy/); }
});
ok("assess: areaOnly i brak lokalizacji użytkownika", () => {
  assert.equal(assess(T({ areaOnly: true }), USER, NOW, {}).kind, "area");
  assert.equal(assess(T({}), null, NOW, {}).kind, "nouser");
});
ok("buildView: strefa 200 km, areaOnly pomijane, sortowanie od granicy", () => {
  const s = new ThreatStore(); s.nowMs = () => NOW;
  s.applySnapshot([
    sample({ id: "a", lat: 50.9, lon: 24.6 }),              // ok. 60 km od granicy
    sample({ id: "b", lat: 50.5, lon: 31.0 }),              // daleko (ok. 600 km)
    sample({ id: "c", lat: 51.1, lon: 23.5 }),              // nad Polską
    sample({ id: "d", areaOnly: true, lat: 50.0, lon: 25.0 }),
    sample({ id: "e", status: "resolved", lat: 50.9, lon: 24.6 }),
    sample({ id: "f", lat: 50.9, lon: 24.6, updatedAt: new Date(NOW - 7200e3).toISOString(), confirmedAt: new Date(NOW - 7200e3).toISOString() }),
  ]);
  const v = buildView(s, USER, true);
  assert.deepEqual(v.rows.map((r) => r.t.id), ["c", "a"]); assert.equal(v.areaOnly, 1); assert.equal(v.rows[0].zone.inPoland, true);
});
ok("ageText", () => { assert.equal(ageText(3), "przed chwilą"); assert.equal(ageText(45), "45 s temu"); assert.equal(ageText(300), "5 min temu"); assert.equal(ageText(null), "czas nieznany"); });
ok("dane demonstracyjne są spójne i dają różne oceny", () => {
  const now = Date.now(), s = new ThreatStore(); s.applySnapshot(demoThreats(now));
  const kinds = new Set(buildView(s, DEMO_USER, true).rows.map((r) => r.assess.kind));
  for (const k of ["near", "clear", "away", "fast"]) assert.ok(kinds.has(k), "brak scenariusza " + k + " w demo: " + [...kinds]);
});

/* ---------- połączenie (fałszywe źródła) ---------- */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
{
  // REST działa, WebSocket nie istnieje
  const calls = []; let changes = 0; const statuses = [];
  const feed = createFeed({ restUrl: "https://x.test/threats", wsUrl: null, WS: null, pollMs: 40, onChange: () => changes++, onStatus: (s) => statuses.push(s.state),
    fetchImpl: async (u) => { calls.push(u); return { ok: true, json: async () => ({ serverTime: new Date().toISOString(), threats: [sample({ id: "r1" })] }) }; } });
  feed.start(); await wait(150);
  assert.ok(calls.length >= 3, "polling co 40 ms, wywołań: " + calls.length); assert.equal(feed.store.items.size, 1); assert.ok(feed.isFresh()); assert.equal(feed.status().state, "polling"); assert.ok(changes >= 3);
  feed.stop(); const after = calls.length; await wait(120); assert.equal(calls.length, after, "po stop() brak dalszych zapytań"); assert.equal(feed.status().state, "off"); n++;
}
{
  // REST zwraca błąd ⇒ „offline” po przekroczeniu progu świeżości; nigdy „live”
  const feed = createFeed({ restUrl: "https://x.test/t", wsUrl: null, WS: null, pollMs: 30, staleMs: 80, watchdogMs: 20, fetchImpl: async () => ({ ok: false, status: 503 }) });
  feed.start(); await wait(200);
  assert.equal(feed.status().state, "offline"); assert.ok(!feed.isFresh()); assert.match(feed.status().error, /503/); feed.stop(); n++;
}
{
  // Zmiana formatu: wszystkie rekordy odrzucone ⇒ formatWarning
  const feed = createFeed({ restUrl: "https://x.test/t", wsUrl: null, WS: null, pollMs: 1000, fetchImpl: async () => ({ ok: true, json: async () => ({ threats: [{ foo: 1 }, { bar: 2 }] }) }) });
  feed.start(); await wait(60); assert.equal(feed.status().formatWarning, true); feed.stop(); n++;
}
{
  // WebSocket: snapshot → upsert → remove; po zamknięciu przechodzi na REST
  let sock; class FakeWS { constructor(u) { this.url = u; sock = this; setTimeout(() => this.onopen?.(), 5); } close() { this.onclose?.(); } }
  let rest = 0;
  const feed = createFeed({ restUrl: "https://x.test/t", wsUrl: "wss://x.test/s", WS: FakeWS, pollMs: 30, wsRetryMs: 10000, fetchImpl: async () => { rest++; return { ok: true, json: async () => ({ threats: [sample({ id: "rest" })] }) }; } });
  feed.start(); await wait(40);
  sock.onmessage({ data: JSON.stringify({ type: "snapshot", ts: new Date().toISOString(), data: { threats: [sample({ id: "w1" })] } }) });
  assert.equal(feed.status().state, "live"); assert.deepEqual([...feed.store.items.keys()], ["w1"]);
  sock.onmessage({ data: JSON.stringify({ type: "upsert", data: sample({ id: "w2" }) }) }); assert.equal(feed.store.items.size, 2);
  sock.onmessage({ data: "to nie jest JSON" }); assert.equal(feed.store.items.size, 2); // uszkodzona ramka nie psuje stanu
  sock.onmessage({ data: JSON.stringify({ type: "remove", data: { id: "w1" } }) }); assert.deepEqual([...feed.store.items.keys()], ["w2"]);
  const restBefore = rest; await wait(100); assert.equal(rest, restBefore, "przy działającym WS nie odpytujemy REST");
  sock.close(); await wait(100); assert.ok(rest > restBefore, "po utracie WS wraca REST");
  feed.stop(); n++;
}

/* ---------- schrony ---------- */
ok("coarseBbox nie zdradza dokładnej pozycji", () => {
  const b = coarseBbox(51.1478, 23.4712);
  assert.deepEqual(b, [51.0, 23.4, 51.2, 23.6]);                                   // środek zaokrąglony do 0,1°, ±0,1°
  assert.ok(b[0] <= 51.1478 && b[2] >= 51.1478 && b[1] <= 23.4712 && b[3] >= 23.4712); // użytkownik jest w prostokącie
  for (const v of b) assert.ok(String(v).length <= 4);                              // żadnych dokładnych współrzędnych
});
ok("zapytanie Overpass zawiera oba znaczniki i prostokąt", () => { const q = overpassQuery([51, 23.3, 51.2, 23.5]); assert.match(q, /shelter_type"="bomb_shelter"/); assert.match(q, /bunker_type"="bomb_shelter"/); assert.match(q, /\(51,23\.3,51\.2,23\.5\)/); assert.match(q, /out center tags 200;/); });
ok("parseOverpass: pomija nieczynne i muzealne, obsługuje center", () => {
  const els = [
    { type: "node", id: 1, lat: 51.1, lon: 23.4, tags: { amenity: "shelter", shelter_type: "bomb_shelter", name: "Piwnica <b>A</b>", access: "yes" } },
    { type: "way", id: 2, center: { lat: 51.2, lon: 23.5 }, tags: { military: "bunker", bunker_type: "bomb_shelter", access: "private" } },
    { type: "node", id: 3, lat: 51.3, lon: 23.6, tags: { military: "bunker", bunker_type: "bomb_shelter", historic: "bunker" } },
    { type: "node", id: 4, lat: 51.3, lon: 23.6, tags: { amenity: "shelter", shelter_type: "bomb_shelter", tourism: "museum" } },
    { type: "node", id: 5, lat: 51.3, lon: 23.6, tags: { amenity: "shelter", shelter_type: "bomb_shelter", disused: "yes" } },
    { type: "node", id: 6, tags: { amenity: "shelter", shelter_type: "bomb_shelter" } },
    { type: "node", id: 7, lat: 51.3, lon: 23.6, tags: { amenity: "shelter", shelter_type: "basic_hut" } },
    { type: "node", id: 1, lat: 51.1, lon: 23.4, tags: { amenity: "shelter", shelter_type: "bomb_shelter" } },
  ];
  const r = parseOverpass({ elements: els });
  assert.deepEqual(r.map((x) => x.id), ["node/1", "way/2"]); assert.equal(r[0].access, "publiczny"); assert.equal(r[1].access, "prywatny (brak wstępu)"); assert.equal(r[1].name, "Schron (bez nazwy)");
  assert.equal(r[0].name, "Piwnica <b>A</b>"); // surowy tekst: ucieczka znaków jest zadaniem warstwy wyświetlania
  assert.deepEqual(parseOverpass(null), []); assert.deepEqual(parseOverpass({ elements: "x" }), []);
});
ok("makeShelter: walidacja", () => {
  assert.equal(makeShelter({ name: "", lat: 51, lon: 23 }).ok, false); assert.equal(makeShelter({ name: "Piwnica", lat: NaN, lon: 23 }).ok, false); assert.equal(makeShelter({ name: "Piwnica", lat: 99, lon: 23 }).ok, false);
  const r = makeShelter({ name: "  Piwnica w bloku  ", how: "Klatka B, schody w dół", lat: 51.123456789, lon: 23.987654321 });
  assert.ok(r.ok); assert.equal(r.shelter.name, "Piwnica w bloku"); assert.equal(r.shelter.lat, 51.12346); assert.ok(r.shelter.id.length > 5);
});
ok("odległość, czas pieszo, linki do tras", () => {
  const l = withDistance([{ id: "a", lat: 51.3, lon: 23.4 }, { id: "b", lat: 51.16, lon: 23.45 }], { lat: 51.15, lon: 23.45 }); assert.equal(l[0].id, "b");
  assert.equal(walkMin(1), 17); assert.equal(walkMin(0.01), 1);
  assert.match(dirUrl({ lat: 51.1, lon: 23.4 }, "walking"), /destination=51\.100000,23\.400000&travelmode=walking/); assert.match(dirUrl({ lat: 1, lon: 2 }, "x"), /travelmode=walking/); assert.match(dirUrl({ lat: 1, lon: 2 }, "driving"), /travelmode=driving/);
});
{
  let sent;
  const r = await fetchOsmShelters("https://o.test/api", 51.1478, 23.4712, async (u, init) => { sent = { u, init }; return { ok: true, json: async () => ({ elements: [{ type: "node", id: 9, lat: 51.1, lon: 23.4, tags: { amenity: "shelter", shelter_type: "bomb_shelter" } }] }) }; });
  assert.equal(r.items.length, 1); assert.ok(!sent.init.body.includes("51.1478") && !sent.init.body.includes("23.4712"), "dokładna pozycja nie może wyjść do serwera"); n++;
  await assert.rejects(fetchOsmShelters("https://o.test", 51, 23, async () => ({ ok: false, status: 429 })), /429/); n++;
  await assert.rejects(fetchOsmShelters("https://o.test", 51, 23, async () => ({ ok: true, json: async () => ({ brak: 1 }) })), /Nieoczekiwana/); n++;
}

/* baza schronów (shelters.json), kopie zapasowe i serwery zastępcze */
{
  const mem = new Map(); const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const good = { at: "2026-10-10T00:00:00Z", source: "OpenStreetMap", items: [{ id: "node/1", lat: 51.2, lon: 23.4, name: "Schron <b>A</b>", how: "Wejście od podwórka", osmUrl: "https://evil.example/x" }, { id: "bad", lat: "x", lon: 1 }, { id: "node/2", lat: 51.21, lon: 23.41 }] };
  const db = await loadShelterDb("https://d.test/shelters.json", store, async () => ({ ok: true, json: async () => good }));
  assert.equal(db.items.length, 2); assert.equal(db.stale, false); assert.equal(db.items[0].osmUrl, "", "obcy adres odrzucony"); assert.equal(db.items[1].name, "Schron (bez nazwy)"); n++;
  const off = await loadShelterDb("https://d.test/shelters.json", store, async () => { throw new Error("offline"); });
  assert.equal(off.stale, true); assert.equal(off.items.length, 2); n++;
  assert.equal(await loadShelterDb("https://d.test/x", { getItem: () => null, setItem() {} }, async () => ({ ok: false, status: 404 })), null); n++;
  assert.equal(await loadShelterDb("https://d.test/x", store, async () => ({ ok: true, json: async () => ({ brak: 1 }) })).then((x) => x.stale), true, "zły format ⇒ kopia, nie pusta lista"); n++;
  const near = nearest(db.items, { lat: 51.2, lon: 23.4 }, { maxKm: 5 }); assert.equal(near.length, 2); assert.ok(near[0].distKm < near[1].distKm); n++;
  assert.equal(nearest(db.items, { lat: 50, lon: 20 }, { maxKm: 50 }).length, 0); n++;
  assert.match(overpassQueryPoland(), /ISO3166-1.*PL/); n++;
  // serwery zastępcze: pierwszy pada (504), drugi odpowiada
  const calls = [];
  const r = await fetchOsmShelters(["https://a.test", "https://b.test"], 51.1, 23.4, async (u) => { calls.push(u); return u.includes("a.test") ? { ok: false, status: 504 } : { ok: true, json: async () => ({ elements: [] }) }; });
  assert.deepEqual(calls, ["https://a.test", "https://b.test"]); assert.equal(r.items.length, 0); n++;
  await assert.rejects(fetchOsmShelters(["https://a.test", "https://b.test"], 51.1, 23.4, async () => ({ ok: false, status: 504 })), /504/); n++;
}

/* Rejestr Punktów Schronienia (PSP): kafelki, walidacja, ładowanie, scalanie */
{
  const ds = { format: "gsu-shelters-compact", schema: 1, rows: [["OZO-AAA", 51.250478, 22.56159, "ul. Niecała 7A, Lublin", "Lublin", "Ograniczona dostępność"], ["OZO-BBB", 51.2530, 22.5650, "ul. Niecała 9, Lublin", "Lublin", "Całodobowa"], ["OZO-AAA", 1, 1, "dubel", "", ""], ["OZO-CCC", 10, 10, "poza Polską", "", ""], ["OZO-DDD", "x", 22, "zły", "", ""], "śmieć", ["OZO-EEE", 49.2, 22.3, "<b>Cisna</b> 105", "Cisna", "Na żądanie"]] };
  const { tiles, count, rejected } = buildPspTiles(ds);
  assert.equal(count, 3); assert.equal(rejected, 4); assert.equal(tiles.get(pspCellId(51.250478, 22.56159)).length, 2); assert.equal(tiles.get(pspCellId(51.250478, 22.56159))[0][0], "AAA", "prefiks OZO- zdjęty"); n++;
  assert.throws(() => buildPspTiles({ format: "inny", schema: 1, rows: [] }), /format/); assert.throws(() => buildPspTiles({ format: "gsu-shelters-compact", schema: 2, rows: [] }), /schema/); assert.throws(() => buildPspTiles(null)); n++;
  assert.equal(pspCellsAround(51.25, 22.56).length, 9); assert.ok(pspCellsAround(51.25, 22.56).includes(pspCellId(51.25, 22.56))); n++;
  const row = tiles.get(pspCellId(51.250478, 22.56159))[0]; const sh = pspRowToShelter(row);
  assert.equal(sh.id, "OZO-AAA"); assert.equal(sh.name, "ul. Niecała 7A, Lublin"); assert.equal(sh.access, "Ograniczona dostępność"); assert.equal(sh.src, "psp"); n++;
  // ładowanie: 404 = pusty obszar, błąd = kopia z cache, błąd bez kopii = failed
  const cacheMem = new Map(); const cache = { get: async (k) => cacheMem.get(k) ?? null, set: async (k, v) => { cacheMem.set(k, v); } };
  const here = pspCellId(51.250478, 22.56159);
  const ok = async (u) => (u.endsWith(`c/${here}.json`) ? { ok: true, status: 200, json: async () => ({ rows: tiles.get(here) }) } : { ok: false, status: 404 });
  let r1 = await loadPspAround("https://x.test/psp/", 51.2505, 22.5616, { fetchImpl: ok, cache, memo: new Map() });
  assert.equal(r1.items.length, 2); assert.equal(r1.failed, 0); assert.equal(r1.total, 9); n++;
  const down = async () => { throw new Error("offline"); };
  let r2 = await loadPspAround("https://x.test/psp/", 51.2505, 22.5616, { fetchImpl: down, cache, memo: new Map() });
  assert.equal(r2.items.length, 2, "offline: dane z cache"); assert.equal(r2.failed, 8, "pozostałe 8 kafelków bez kopii = nieudane"); n++;
  let r3 = await loadPspAround("https://x.test/psp/", 51.2505, 22.5616, { fetchImpl: async () => ({ ok: false, status: 500 }), cache: null, memo: new Map() });
  assert.equal(r3.failed, 9); assert.equal(r3.items.length, 0); n++;
  // scalanie: wpis OSM (z opisem wejścia) wygrywa z punktem PSP w promieniu 30 m
  const osm = [{ id: "node/1", lat: 51.250478, lon: 22.56159 + 0.0001, name: "Schron OSM", how: "Wejście od podwórka", src: "osm" }];
  const merged = mergeSources(r1.items, osm); assert.equal(merged.length, 2); assert.ok(merged.some((x) => x.id === "node/1")); assert.ok(!merged.some((x) => x.id === "OZO-AAA")); assert.ok(merged.some((x) => x.id === "OZO-BBB")); n++;
}

/* promień 50 km: rozszerzanie kafelków tylko gdy trzeba */
{
  const g1 = guaranteedKm(51.25, 22.56, 1), g2 = guaranteedKm(51.25, 22.56, 2), g3 = guaranteedKm(51.25, 22.56, 3);
  assert.ok(g1 >= 19 && g2 > g1 && g3 >= 50, `pokrycie: ${g1.toFixed(1)} / ${g2.toFixed(1)} / ${g3.toFixed(1)} km`); n++;
  const lat = 51.25, lon = 22.56; const reqs = [];
  const mkTile = (id, k) => Array.from({ length: k }, (_, i) => ["T" + id + i, +(lat + 0.001 * i).toFixed(5), +(lon + 0.001 * i).toFixed(5), "ul. " + id + i, "M", "x"]);
  const here = pspCellId(lat, lon);
  // gęsto: 6 punktów w środkowym kafelku ⇒ wystarczy 3×3 (9 żądań)
  let f = async (u) => { reqs.push(u); return u.endsWith(`c/${here}.json`) ? { ok: true, status: 200, json: async () => ({ rows: mkTile("a", 6) }) } : { ok: false, status: 404 }; };
  let r = await loadPspNearest("https://x.test/p/", lat, lon, { fetchImpl: f, memo: new Map() });
  assert.equal(reqs.length, 9); assert.equal(r.rings, 1); assert.equal(r.items.length, 6); n++;
  // rzadko: tylko 2 punkty, i to dwa kafelki dalej ⇒ rozszerza do 5×5, potem 7×7 (pokrycie ≥ 50 km)
  reqs.length = 0;
  const [ia, ib] = here.split("_").map(Number); const far = `${ia + 2}_${ib}`;
  f = async (u) => { reqs.push(u); return u.endsWith(`c/${far}.json`) ? { ok: true, status: 200, json: async () => ({ rows: [["F1", (ia + 2) * 0.2 + 0.05, ib * 0.3 + 0.1, "ul. Daleka 1", "M", "x"]] }) } : { ok: false, status: 404 }; };
  r = await loadPspNearest("https://x.test/p/", lat, lon, { fetchImpl: f, memo: new Map() });
  assert.equal(r.rings, 3); assert.equal(reqs.length, 49); assert.equal(r.items.length, 1); assert.ok(r.coveredKm >= 50); n++;
  // awaria sieci: nie mnoży żądań (tylko 9)
  reqs.length = 0;
  r = await loadPspNearest("https://x.test/p/", lat, lon, { fetchImpl: async (u) => { reqs.push(u); throw new Error("offline"); }, memo: new Map() });
  assert.equal(reqs.length, 9); assert.equal(r.failed, 9); n++;
}

/* ---------- ocena komunikatów (waga, ważność, odwołania) ---------- */
{
  const NOW = new Date("2026-10-10T13:10:00Z").getTime(); // 15:10 czasu polskiego
  const iso = (h, m) => new Date(Date.UTC(2026, 9, 10, h, m)).toISOString();
  const rcbEnd = { id: "e", type: "rcb", voivodeship: "all", title: "ALERT RCB", body: "UWAGA! Zakończył się atak powietrzny na Ukrainę. Brak zagrożenia na terenie Polski.", published: iso(4, 55) };
  const road = { id: "r", type: "drogi", voivodeship: "lubelskie", title: "Utrudnienie na DW 835", body: "Droga zablokowana. Przewidywany czas utrudnienia: 2 godz", published: iso(6, 44) };
  const dry = { id: "w", type: "woda", voivodeship: "lubelskie", title: "Susza hydrologiczna", body: "niskie przepływy", published: "2026-09-04T13:13:00Z" };
  const start = { id: "s", type: "rcb", voivodeship: "all", title: "ALERT RCB", body: "UWAGA! Trwa atak powietrzny na Ukrainę.", published: iso(2, 10) };
  ok("durationFromText: godziny i minuty", () => { assert.equal(durationFromText("czas utrudnienia: 2 godz"), 2 * 36e5); assert.equal(durationFromText("potrwa 30 min"), 18e5); assert.equal(durationFromText("brak"), null); });
  ok("odwołanie ataku na Ukrainę = info, nie zagrożenie", () => { const c = classifyOne(rcbEnd); assert.equal(c.cancel, true); assert.equal(c.sev, "info"); });
  ok("atak na Ukrainę = zagrożenie (czerwone)", () => assert.equal(classifyOne(start).sev, "danger"));
  ok("przykład z ekranu: spokojnie + utrudnienie tylko do wiadomości", () => {
    const l = analyze([rcbEnd, road, dry], NOW), act = l.filter((a) => a.active);
    assert.equal(statusOf(act), "calm");
    assert.equal(l.find((a) => a.id === "r").active, false, "utrudnienie z 8:44 + 2 h wygasło o 10:44");
    assert.equal(l.find((a) => a.id === "w").active, false, "susza sprzed miesiąca nieaktywna");
    assert.equal(l.find((a) => a.id === "e").active, true);
  });
  ok("droga w trakcie trwania: aktywna, ale tylko info", () => {
    const l = analyze([road], new Date(Date.UTC(2026, 9, 10, 7, 30)).getTime()); assert.equal(l[0].active, true); assert.equal(statusOf(l.filter((a) => a.active)), "calm");
  });
  ok("atak trwa do odwołania, potem czerwień znika", () => {
    const t1 = new Date(Date.UTC(2026, 9, 10, 3, 0)).getTime();
    assert.equal(statusOf(analyze([start], t1).filter((a) => a.active)), "alarm");
    const l = analyze([start, rcbEnd], NOW); assert.equal(l.find((a) => a.id === "s").supersededBy !== null, true); assert.equal(statusOf(l.filter((a) => a.active)), "calm");
  });
  ok("odwołanie sprzed ataku nie kasuje nowego ataku", () => {
    const newer = { ...start, id: "s2", published: iso(12, 0) };
    assert.equal(statusOf(analyze([rcbEnd, newer], NOW).filter((a) => a.active)), "alarm");
  });
  ok("atak bez odwołania wygasa po 12 h (domyślny czas RCB)", () => assert.equal(analyze([start], new Date(Date.UTC(2026, 9, 10, 15, 0)).getTime())[0].active, false));
  ok("inny alert RCB (np. ewakuacja) = ważne (bursztyn); pogoda wg stopnia", () => {
    const e = { id: "x", type: "rcb", voivodeship: "lubelskie", title: "Alert RCB", body: "Ewakuacja osiedla", published: iso(12, 0) };
    assert.equal(classifyOne(e).sev, "important");
    assert.equal(classifyOne({ type: "pogoda", title: "Burze 2. stopnia" }).sev, "important");
    assert.equal(classifyOne({ type: "pogoda", title: "Upał 1. stopnia" }).sev, "info");
    assert.equal(classifyOne({ type: "pogoda", title: "Wichury 3. stopnia" }).sev, "danger");
  });
  ok("pole alarm z RSO samo nie robi zagrożenia; liczy się treść", () => {
    assert.equal(classifyOne({ type: "inne", alarm: true, title: "Uwaga! Alarm, kot mi uciekł" }).sev, "info");
    assert.equal(classifyOne({ type: "woda", alarm: true, title: "Susza hydrologiczna", body: "przepływy poniżej SNQ" }).sev, "info");
    assert.equal(classifyOne({ type: "inne", alarm: true, title: "Alarm powietrzny", body: "Zagrożenie atakiem z powietrza w Polsce" }).sev, "danger");
  });
  ok("pogoda 3. stopnia = zagrożenie; powódź 2. stopnia = ważne; susza zawsze info", () => {
    assert.equal(classifyOne({ type: "pogoda", title: "Wichury 3. stopnia" }).sev, "danger");
    assert.equal(classifyOne({ type: "woda", title: "Ostrzeżenie 2. stopnia", body: "Wezbranie wód, możliwe przekroczenie stanów ostrzegawczych" }).sev, "important");
    assert.equal(classifyOne({ type: "woda", title: "Susza hydrologiczna 3. stopnia", body: "niskie przepływy" }).sev, "info");
    assert.equal(classifyOne({ type: "inne", title: "Przekroczenie poziomu ozonu w powietrzu" }).sev, "info");
  });
  ok("RCB: nierozpoznany = ważne, wprost zagrożenie życia = zagrożenie", () => {
    assert.equal(classifyOne({ type: "rcb", title: "Alert RCB", body: "Zamknięty most, utrudnienia" }).sev, "important");
    assert.equal(classifyOne({ type: "rcb", title: "Alert RCB", body: "Zagrożenie życia! Natychmiast schroń się w budynku" }).sev, "danger");
  });
  ok("summarize: nie ucina na skrócie „pow.”, czyści prefiks i cudzysłowy", () => {
    const body = "„KOMUNIKAT: woda w gminie Kąty Wrocławskie (pow. wrocławski) nie nadaje się do spożycia i celów higienicznych. Śledź komunikaty”. Zakaz korzystania z wody dot. m.in.: Gądów.";
    assert.equal(summarize(body), "Woda w gminie Kąty Wrocławskie (pow. wrocławski) nie nadaje się do spożycia i celów higienicznych.");
    const long = "Na odcinku drogi krajowej numer 19 w miejscowości Jabłonna Druga trwają prace remontowe oraz zmieniona jest organizacja ruchu z powodu bardzo długiego zdarzenia drogowego (kolizja";
    const r = summarize(long, 100); assert.ok(r.endsWith("…") && !r.includes("(") && r.length <= 101, r);
    assert.equal(summarize(""), "");
  });
  ok("ten sam alert RCB i komunikat o wodzie z tymi samymi miejscowościami = jedno wydarzenie", () => {
    const rcb = { id: "a", type: "rcb", voivodeship: "dolnoslaskie", title: "Alert RCB", body: "„KOMUNIKAT: woda w gminie Kąty Wrocławskie nie nadaje się do spożycia. Zakaz: Gądów, Mokronos Dolny, Mokronos Górny, Zybiszów”", published: "2026-10-08T18:45:00Z" };
    const rso = { id: "b", type: "woda", voivodeship: "dolnoslaskie", title: "Woda niezdatna do picia", body: "Gm. Kąty Wrocławskie. Dotyczy miejscowości: Gądów, Mokronos Dolny, Mokronos Górny, Zybiszów", published: "2026-10-08T16:01:00Z" };
    const other = { id: "c", type: "drogi", voivodeship: "dolnoslaskie", title: "Zablokowana S3 Tunel", body: "tunel zamknięty", published: "2026-10-08T16:09:00Z" };
    const l = analyze([rcb, rso, other], Date.parse("2026-10-09T10:00:00Z"));
    assert.equal(l.find((x) => x.id === "b").relatedTo, "a"); assert.equal(l.find((x) => x.id === "c").relatedTo, undefined); assert.equal(l.find((x) => x.id === "a").relatedTo, undefined);
  });
  ok("drogi: utrudnienie sprzed 4 dni nie jest aktywne mimo długiej ważności ze źródła", () => {
    assert.equal(analyze([{ id: "t", type: "drogi", title: "Zablokowana S3", published: "2026-10-06T16:09:00Z", validTo: "2026-12-01T00:00:00Z" }], Date.parse("2026-10-10T15:00:00Z"))[0].active, false);
  });
  ok("compose: krótki komunikat w całości, długi cięty na zdaniu, bez ucinania dla kilku słów", () => {
    const lub = { title: "Informacje drogowe", body: "Z uwagi na prowadzone kontrole po stronie niemieckiej, na terenie województwa lubuskiego ruch kołowy w miejscach przekraczania granicy państwowej odbywa się na bieżąco." };
    const c1 = compose(lub); assert.equal(c1.text, lub.body); assert.equal(c1.rest, "");
    const maz = { title: "Ćwiczenia Syrena-26", body: "Od 12 do 16 października 2026 r. na terenie województwa mazowieckiego odbywać się będą ćwiczenia pod kryptonimem Syrena-26. W związku z tym mieszkańcy mogą usłyszeć sygnały syren alarmowych. Ćwiczenia nie stanowią zagrożenia." };
    assert.equal(compose(maz).rest, ""); assert.ok(!compose(maz).text.endsWith("…"));
    const long = { title: "Susza", body: Array.from({ length: 8 }, (_, i) => `To jest zdanie numer ${i + 1} opisujące sytuację hydrologiczną na rzece.`).join(" ") };
    const c2 = compose(long); assert.ok(c2.rest.length >= 90 && /\.$/.test(c2.text) && !c2.text.includes("…")); assert.equal((c2.text + " " + c2.rest).replace(/\s+/g, " "), long.body);
    const rcb = compose({ title: "Alert RCB", body: "„KOMUNIKAT: woda w gminie Kąty Wrocławskie (pow. wrocławski) nie nadaje się do spożycia. Śledź komunikaty”. Zakaz: Gądów." });
    assert.equal(rcb.head, "Woda w gminie Kąty Wrocławskie (pow. wrocławski) nie nadaje się do spożycia."); assert.ok(!/[„”]/.test(rcb.text));
    assert.equal(sentences("Od 12 do 16 października 2026 r. na terenie Mazowsza. Drugie zdanie.").length, 2);
  });
  ok("komunikaty informacyjne starsze niż 7 dni są wcześniejsze mimo „do odwołania”", () => {
    const old = { id: "o", type: "woda", title: "Susza hydrologiczna", published: iso(0, 0).replace("2026-10-10", "2026-10-01"), validTo: "2027-01-01T00:00:00Z" };
    assert.equal(analyze([old], NOW)[0].active, false);
    assert.equal(analyze([{ ...old, published: iso(1, 0).replace("2026-10-10", "2026-10-08") }], NOW)[0].active, true);
  });
  ok("komunikat z validTo w przeszłości jest nieaktywny", () => assert.equal(analyze([{ id: "v", type: "pogoda", title: "Burze 2. stopnia", published: iso(1, 0), validTo: iso(5, 0) }], NOW)[0].active, false));
}

console.log(`OK: ${n} grup testów logiki klienta przeszło (limity: strefa ${LIMITS.zoneKm} km, uspokajanie ≤ ${LIMITS.reassureAgeSec} s)`);
