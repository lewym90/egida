// Testy v15: rozszerzony adapter NEPTUN (aliasy, typy, alarmy, wiadomości, widok „cała Ukraina”, filtry, pobieranie dodatkowych punktów końcowych).
// Dane SZTUCZNE. Uruchamianie: node scripts/test-v15.mjs
import assert from "node:assert/strict";
import { normalizeThreat, normalizeAlert, normalizeMessage, ThreatStore, applyEnvelope, applyAlertsJson, applyMessagesJson, buildView, TYPES } from "../js/neptun.js";
import { createFeed } from "../js/neptun-feed.js";
import { demoThreats, demoAlerts, demoMessages } from "../js/demo.js";
let n = 0;
const ok = (name, fn) => { try { fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };
const okA = async (name, fn) => { try { await fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };
const base = { id: "x", lat: 50, lon: 25, type: "uav" };

ok("nowe typy: balistyczny i rozpoznawczy mają własne etykiety", () => {
  assert.equal(normalizeThreat({ ...base, type: "ballistic" }).type, "ballistic");
  assert.equal(normalizeThreat({ ...base, type: "recon" }).type, "recon");
  assert.equal(TYPES.ballistic.kind, "fast");
  assert.equal(TYPES.recon.kind, "slow");
});
ok("synonimy typów", () => {
  assert.equal(normalizeThreat({ ...base, type: "Shahed" }).type, "uav");
  assert.equal(normalizeThreat({ ...base, type: "cruise_missile" }).type, "missile");
  assert.equal(normalizeThreat({ ...base, type: "glide_bomb" }).type, "kab");
  assert.equal(normalizeThreat({ ...base, type: "coś nowego" }).type, "unknown");
});
ok("współrzędne z position / GeoJSON / latitude", () => {
  assert.equal(normalizeThreat({ id: 1, type: "uav", position: { lat: 51, lng: 24 } }).lon, 24);
  assert.equal(normalizeThreat({ id: 2, type: "uav", coordinates: [24.5, 51.5] }).lat, 51.5);
  assert.equal(normalizeThreat({ id: 3, type: "uav", latitude: "49.5", longitude: "30" }).lon, 30);
  const f = normalizeThreat({ type: "Feature", id: "f1", geometry: { type: "Point", coordinates: [26, 50] }, properties: { type: "missile", speed: 800, course: 280 } });
  assert.equal(f.lat, 50); assert.equal(f.type, "missile"); assert.equal(f.speedKmh, 800); assert.equal(f.headingDeg, 280);
});
ok("rekord bez pozycji albo z absurdalną pozycją jest odrzucany", () => {
  assert.equal(normalizeThreat({ id: 1, type: "uav" }), null);
  assert.equal(normalizeThreat({ id: 1, lat: 200, lon: 0 }), null);
});
ok("alarmy: różne układy pól", () => {
  assert.deepEqual([normalizeAlert({ region: "Wołyń", active: true }).active, normalizeAlert({ oblast: "Lwów", status: "ended" }).active, normalizeAlert({ name: "Kijów", state: "active" }).active], [true, false, true]);
  assert.equal(normalizeAlert({ foo: 1 }), null);
  assert.equal(normalizeAlert({ region: "X", finishedAt: "2026-10-10T10:00:00Z" }).active, false);
});
ok("wiadomości: tekst, czas, kanał; puste odrzucane", () => {
  const m = normalizeMessage({ id: 5, text: "Uwaga", ts: 1760000000, channel: "kanał" });
  assert.equal(m.text, "Uwaga"); assert.equal(m.channel, "kanał"); assert.ok(m.at > 1e12);
  assert.equal(normalizeMessage({ id: 6 }), null);
});
ok("store: alarmy i wiadomości z JSON-a o różnych kształtach", () => {
  const s = new ThreatStore();
  applyAlertsJson(s, { alerts: [{ region: "A", active: true }, { region: "B", active: false }] });
  assert.equal(s.alerts.size, 2);
  applyAlertsJson(s, [{ region: "C", active: true }]);
  assert.equal(s.alerts.size, 1);
  applyMessagesJson(s, { data: [{ id: 1, text: "a", ts: 1 }, { id: 2, text: "b", ts: 2 }] });
  assert.equal(s.messages[0].text, "b"); // najnowsze pierwsze
  assert.throws(() => applyAlertsJson(s, { zle: 1 }));
});
ok("koperta WebSocket: alerts, messages, message", () => {
  const s = new ThreatStore();
  assert.equal(applyEnvelope(s, { type: "alerts", data: { alerts: [{ region: "A", active: true }] } }), "alerts");
  assert.equal(s.alerts.size, 1);
  assert.equal(applyEnvelope(s, { type: "message", data: { id: 1, text: "hej", ts: 5 } }), "messages");
  assert.equal(s.messages.length, 1);
});
ok("widok: domyślnie pokazuje WSZYSTKIE obiekty, tryb „tylko okolice granicy” ukrywa dalekie", () => {
  const s = new ThreatStore(); s.applySnapshot(demoThreats(Date.now()));
  const all = buildView(s, null, true);
  const near = buildView(s, null, true, { nearOnly: true });
  assert.equal(all.farHidden, 0);
  assert.ok(near.farHidden >= 1);
  assert.ok(all.rows.length > near.rows.length);
  assert.ok(all.rows.some((r) => r.far));
});
ok("widok: obiekt spoza strefy nie dostaje uspokajającej oceny toru", () => {
  const s = new ThreatStore(); s.applySnapshot(demoThreats(Date.now()));
  const far = buildView(s, { lat: 51.15, lon: 23.45, accKm: 0.05 }, true, {}).rows.filter((r) => r.far);
  assert.ok(far.length >= 1);
  assert.ok(far.every((r) => r.assess.kind === "far" && r.assess.severity === "info"));
});
ok("widok: obserwacje bez pozycji trafiają na osobną listę, nie na mapę", () => {
  const s = new ThreatStore(); s.applySnapshot(demoThreats(Date.now()));
  const v = buildView(s, null, true);
  assert.equal(v.areaRows.length, v.areaOnly);
  assert.ok(v.areaRows.length >= 1);
  assert.ok(v.rows.every((r) => !r.t.areaOnly));
});
ok("widok: filtry dron / rakiety oraz podsumowanie typów", () => {
  const s = new ThreatStore(); s.applySnapshot(demoThreats(Date.now()));
  const d = buildView(s, null, true, { filter: "drones" });
  const f = buildView(s, null, true, { filter: "fast" });
  assert.ok(d.rows.length && d.rows.every((r) => TYPES[r.t.type].kind === "slow"));
  assert.ok(f.rows.length && f.rows.every((r) => TYPES[r.t.type].kind === "fast"));
  assert.ok(f.counts.ballistic >= 1);
});
ok("widok: liczba sztuk (count) wchodzi do podsumowania", () => {
  const s = new ThreatStore(); s.applySnapshot([{ id: "g", type: "uav", lat: 51, lon: 24.5, count: 5, updatedAt: new Date().toISOString(), confirmedAt: new Date().toISOString() }]);
  assert.equal(buildView(s, null, true, {}).counts.uav, 5);
});
ok("widok: alarmy tylko aktywne, posortowane", () => {
  const s = new ThreatStore(); s.applyAlerts(demoAlerts());
  const v = buildView(s, null, true);
  assert.equal(v.alerts.length, 2);
  assert.ok(demoMessages().length === 2);
});
await okA("feed: pobiera alarmy i wiadomości; błąd tych punktów nie psuje obiektów", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url.endsWith("/threats")) return { ok: true, json: async () => ({ serverTime: new Date().toISOString(), threats: [{ id: "t1", type: "uav", lat: 51, lon: 24.5, updatedAt: new Date().toISOString() }] }) };
    if (url.endsWith("/alerts")) return { ok: true, json: async () => ({ alerts: [{ region: "A", active: true }] }) };
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const feed = createFeed({ restUrl: "https://x/threats", alertsUrl: "https://x/alerts", messagesUrl: "https://x/messages", fetchImpl: fakeFetch, WS: undefined, pollMs: 1e9, extrasMs: 1e9 });
  feed.start();
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(calls.some((c) => c.endsWith("/alerts")) && calls.some((c) => c.endsWith("/messages")));
  assert.equal(feed.store.alerts.size, 1);
  assert.match(feed.store.extras.messagesErr, /500/);
  assert.equal(feed.store.items.size, 1);
  assert.ok(feed.isFresh());
  feed.stop();
});
console.log(`OK: ${n} grup testów v15 przeszło`);
