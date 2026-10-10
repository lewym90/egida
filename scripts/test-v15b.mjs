// Testy v15 (część 2): polskie nazwy, ocena zbliżania do granicy, wybór kanałów Telegram, deduplikacja, treść wiadomości.
// Dane SZTUCZNE. Uruchamianie: node scripts/test-v15b.mjs
import assert from "node:assert/strict";
import { polishPlace, hasCyrillic } from "../js/polish.js";
import { normalizeThreat, ThreatStore, borderApproach } from "../js/neptun.js";
import { loadRegions, regionsWithin } from "../js/regions.js";
import { candidates, decide, markSent, buildMessage, LIMITS } from "../server/neptun-notify.mjs";
let n = 0;
const ok = (name, fn) => { try { fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };
const now = Date.parse("2026-10-10T18:00:00Z");
const iso = (secAgo) => new Date(now - secAgo * 1000).toISOString();
const mk = (id, o = {}) => ({ id, type: "uav", status: "active", confidenceLevel: "medium", lat: 51.2, lon: 24.6, velocity: { bearingDeg: 270, speedKmh: 150 }, confirmedAt: iso(30), updatedAt: iso(20), ...o });
const T = (o) => normalizeThreat(o);

ok("nazwy: słownik i obwody", () => {
  assert.equal(polishPlace("Луцьк"), "Łuck");
  assert.equal(polishPlace("Волинська область"), "obwód wołyński");
  assert.equal(polishPlace("Тернопільська обл."), "obwód tarnopolski");
  assert.equal(polishPlace("Львів"), "Lwów");
});
ok("nazwy: transliteracja nieznanych i brak zmian dla łaciny", () => {
  assert.equal(polishPlace("Горохів"), "Horochów");
  assert.equal(polishPlace("Любешів"), "Lubeszów");
  assert.equal(polishPlace("Lutsk"), "Lutsk");
  assert.equal(polishPlace(""), "");
  assert.equal(polishPlace(null), "");
  assert.ok(!hasCyrillic(polishPlace("Ковельський район")));
});
ok("nazwy: rekord NEPTUN dostaje polskie nazwy, tytuł z cyrylicą jest ukryty", () => {
  const t = T(mk("a", { region: "Волинська область", locality: "Луцьк", title: "Група БпЛА на Волині" }));
  assert.equal(t.region, "obwód wołyński"); assert.equal(t.locality, "Łuck");
  assert.equal(t.title, ""); assert.ok(t.titleRaw.includes("БпЛА"));
  assert.equal(T(mk("b", { title: "Drone group" })).title, "Drone group");
});
ok("granica: dron 55 km od granicy z kursem na zachód → powiadomienie poziom 100/50", () => {
  const a = borderApproach(T(mk("d1", { lon: 24.4 })), now);
  assert.ok(a.ok, JSON.stringify(a)); assert.ok([100, 50].includes(a.level)); assert.ok(a.distKm < 100);
  assert.ok(a.etaMin > 0 && a.etaMin < 120);
});
ok("granica: dron 100+ km od granicy → brak powiadomienia", () => {
  const a = borderApproach(T(mk("d2", { lon: 26.5 })), now);
  assert.equal(a.ok, false); assert.equal(a.reason, "far");
});
ok("granica: blisko, ale leci OD granicy → brak", () => {
  const a = borderApproach(T(mk("d3", { lon: 24.4, velocity: { bearingDeg: 90, speedKmh: 150 } })), now);
  assert.equal(a.ok, false); assert.equal(a.reason, "away");
});
ok("granica: tor równoległy do granicy (na północ) → brak", () => {
  const a = borderApproach(T(mk("d4", { lon: 24.4, velocity: { bearingDeg: 0, speedKmh: 150 } })), now);
  assert.equal(a.ok, false);
});
ok("granica: bez kursu (blisko, poza Polską) → brak; nad Polską → tak", () => {
  assert.equal(borderApproach(T(mk("d5", { lon: 24.4, velocity: undefined })), now).ok, false);
  const over = borderApproach(T(mk("d6", { lon: 22.8, velocity: undefined })), now);
  assert.ok(over.ok && over.level === 0);
});
ok("granica: pomijane — advisory, stara pozycja, niska pewność, status stale, tylko obwód", () => {
  for (const o of [{ advisory: true }, { confirmedAt: iso(900), updatedAt: iso(900) }, { confidenceLevel: "low" }, { status: "stale" }, { areaOnly: true }]) {
    assert.equal(borderApproach(T(mk("x", { lon: 24.4, ...o })), now).ok, false, JSON.stringify(o));
  }
});
ok("granica: rakieta też wywołuje powiadomienie (z uwagą o szybkim locie)", () => {
  const t = T(mk("m1", { type: "missile", lon: 25.0, velocity: { bearingDeg: 270, speedKmh: 800 } }));
  const a = borderApproach(t, now); assert.ok(a.ok);
  const msg = buildMessage("lubelskie", [{ t, ap: a, regions: ["lubelskie"] }]);
  assert.match(msg, /bardzo szybko/);
});
const regions = await loadRegions();
ok("kanały: wejście koło Włodawy → lubelskie (i ewentualnie sąsiedzi do 50 km)", () => {
  const r = regionsWithin(51.55, 23.55, regions, 50);
  assert.equal(r[0].id, "lubelskie");
});
ok("kanały: wejście przy granicy Lubelskie/Podkarpackie obejmuje oba", () => {
  const r = regionsWithin(50.4, 23.5, regions, 50).map((x) => x.id);
  assert.ok(r.includes("lubelskie") && r.includes("podkarpackie"), r.join());
});
ok("kandydaci: tylko spełniający warunki, z kanałem głównym", () => {
  const s = new ThreatStore();
  s.applySnapshot([mk("c1", { lon: 24.4 }), mk("c2", { lon: 27 }), mk("c3", { lon: 24.4, advisory: true })]);
  s.skewMs = now - Date.now();
  const { cands, skipped } = candidates(s, now, regions);
  assert.equal(cands.length, 1); assert.equal(cands[0].t.id, "c1"); assert.equal(cands[0].primary, "lubelskie");
  assert.equal(skipped.length, 2);
});
ok("deduplikacja: drugi raz ten sam obiekt na tym samym poziomie nie jest wysyłany", () => {
  const s = new ThreatStore(); s.applySnapshot([mk("e1", { lon: 24.4 })]);
  const { cands } = candidates(s, now, regions);
  let st = null;
  let d = decide(cands, st, now);
  assert.ok(d.byRegion.lubelskie?.length === 1);
  for (const [r, items] of Object.entries(d.byRegion)) markSent(d.state, r, items, now);
  d = decide(cands, d.state, now + 60e3);
  assert.deepEqual(Object.keys(d.byRegion), []);
});
ok("eskalacja: po zbliżeniu do <50 km (poziom 50) wysyłamy ponownie, po nad Polską też", () => {
  const far = { t: T(mk("f1")), ap: { level: 100, distKm: 80 }, regions: ["lubelskie"] };
  const mid = { ...far, ap: { level: 50, distKm: 40 } };
  const over = { ...far, ap: { level: 0, distKm: 0 } };
  let r = decide([far], null, now); markSent(r.state, "lubelskie", r.byRegion.lubelskie, now);
  assert.equal(Object.keys(decide([far], r.state, now + 1e3).byRegion).length, 0);
  r = decide([mid], r.state, now + 2e3); assert.equal(r.byRegion.lubelskie.length, 1); markSent(r.state, "lubelskie", r.byRegion.lubelskie, now + 2e3);
  r = decide([over], r.state, now + 3e3); assert.equal(r.byRegion.lubelskie.length, 1);
});
ok("limit: nie więcej niż N wiadomości na godzinę na kanał", () => {
  const c = { t: T(mk("g")), ap: { level: 100, distKm: 80 }, regions: ["lubelskie"] };
  let st = { sent: {}, rate: { lubelskie: Array.from({ length: LIMITS.perRegionPerHour }, (_, i) => now - i * 1000) } };
  assert.deepEqual(Object.keys(decide([c], st, now).byRegion), []);
  assert.equal(Object.keys(decide([c], st, now + 2 * 36e5).byRegion).length, 1); // po godzinie wolno
});
ok("wiadomość: zastrzeżenie, źródło, 112, escapowanie HTML, ucięcie listy", () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ t: T(mk("h" + i, { locality: "<b>x</b>" })), ap: { level: 100, distKm: 60 + i, entry: { lat: 51, lon: 23 }, centerHit: true, etaMin: 20 }, regions: ["lubelskie"] }));
  const msg = buildMessage("lubelskie", items, { appUrl: "https://x.example/egida/" });
  assert.match(msg, /NIEOFICJALNE/); assert.match(msg, /neptun\.in\.ua/); assert.match(msg, /112/);
  assert.ok(!msg.includes("<b>x</b>")); assert.match(msg, /i 2 innych obiektów/);
  assert.ok(msg.length < 3500);
});
console.log(`OK: ${n} grup testów v15b przeszło`);
