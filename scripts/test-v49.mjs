// Testy paczki v49: przekaźnik NEPTUN na serwerze EGIDA – przełączanie w aplikacji (przekaźnik → NEPTUN bezpośrednio → z powrotem).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFeed } from "../js/neptun-feed.js";
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log("  ok " + name); };
const TH = (id, lat = 49.8, lon = 24.0) => ({ id, type: "uav", title: "Шахед", lat, lon, heading: 280, confidenceLevel: "high", status: "active", updatedAt: new Date().toISOString(), region: "Львівська область", locality: "Львів" });
class FakeWS { static list = []; constructor(url) { this.url = url; this.closed = false; FakeWS.list.push(this); setTimeout(() => this.onopen?.(), 5); } close() { this.closed = true; } }
const resp = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: (k) => headers[k] ?? null } });

function harness(relay) {
  const calls = { relay: 0, since: 0, rest: 0, msgs: 0 };
  FakeWS.list = [];
  const fetchImpl = async (url) => {
    if (url.startsWith("https://relay.test/snapshot")) { calls.relay++; if (url.includes("since=")) calls.since++; return relay(url); }
    if (url.startsWith("https://relay.test/messages")) { calls.msgs++; return resp(200, { messages: [{ channel: "@kpszsu", text: "x", date: new Date().toISOString() }] }); }
    if (url.startsWith("https://neptun.test/threats")) { calls.rest++; return resp(200, { serverTime: new Date().toISOString(), threats: [TH("direct")] }); }
    if (url.startsWith("https://neptun.test/alerts")) return resp(200, { raions: [], oblasts: [] });
    throw new Error("nieznany adres " + url);
  };
  const feed = createFeed({ relayUrl: "https://relay.test/snapshot", relayMessagesUrl: "https://relay.test/messages", restUrl: "https://neptun.test/threats", alertsUrl: "https://neptun.test/alerts", wsUrl: "wss://neptun.test/stream", WS: FakeWS, fetchImpl, pollMs: 40, extrasMs: 60, relayRetryMs: 120, wsGraceMs: 20, watchdogMs: 1000 });
  return { feed, calls };
}

await t("przekaźnik działa: dane z przekaźnika, ZERO połączeń z NEPTUN, wiadomości z przekaźnika, potem „bez zmian” (since)", async () => {
  let v = 7;
  const { feed, calls } = harness((url) => url.includes("since=7") ? resp(204, null, { "X-Server-Time": new Date().toISOString() }) : resp(200, { serverTime: new Date().toISOString(), version: v, threats: [TH("r1")], alerts: { raions: [], oblasts: [{ key: "lvivska", name: "Львівська область", since: new Date().toISOString() }] } }));
  feed.start(); await sleep(250);
  assert.equal(feed.status().via, "relay"); assert.equal(feed.status().state, "live"); assert.ok(feed.isFresh());
  assert.ok(feed.store.items.has("r1")); assert.equal(calls.rest, 0); assert.equal(FakeWS.list.length, 0, "bez WebSocket do NEPTUN");
  assert.ok(calls.since >= 1, "kolejne zapytania z ?since="); assert.ok(calls.msgs >= 1);
  feed.stop();
});
await t("przekaźnik nie odpowiada 2 razy → NEPTUN bezpośrednio (WebSocket); przekaźnik wraca → NEPTUN rozłączony", async () => {
  let relayUp = false;
  const { feed, calls } = harness(() => relayUp ? resp(200, { serverTime: new Date().toISOString(), version: 1, threats: [TH("back")] }) : resp(503, { error: "x" }));
  feed.start(); await sleep(120);
  assert.equal(FakeWS.list.length, 1, "otwarty WebSocket do NEPTUN"); assert.equal(FakeWS.list[0].url, "wss://neptun.test/stream");
  assert.ok(feed.store.items.has("direct") || calls.rest >= 1, "pierwsze dane z NEPTUN REST");
  relayUp = true; await sleep(300);
  assert.equal(feed.status().via, "relay"); assert.ok(FakeWS.list[0].closed, "WebSocket NEPTUN zamknięty po powrocie przekaźnika");
  const restAfter = calls.rest; await sleep(200); assert.equal(calls.rest, restAfter, "po powrocie przekaźnika nie odpytujemy NEPTUN");
  feed.stop();
});
await t("pojedynczy błąd przekaźnika nie przełącza na NEPTUN", async () => {
  let k = 0;
  const { feed } = harness(() => (++k === 3 ? resp(502, {}) : resp(200, { serverTime: new Date().toISOString(), version: k, threats: [TH("x")] })));
  feed.start(); await sleep(250);
  assert.equal(FakeWS.list.length, 0); assert.equal(feed.status().via, "relay");
  feed.stop();
});
await t("bez adresu przekaźnika – zachowanie jak dotąd (WebSocket NEPTUN)", async () => {
  FakeWS.list = [];
  const feed = createFeed({ restUrl: "https://neptun.test/threats", wsUrl: "wss://neptun.test/stream", WS: FakeWS, fetchImpl: async () => resp(200, { threats: [TH("d")] }), pollMs: 40, wsGraceMs: 20 });
  feed.start(); await sleep(60);
  assert.equal(FakeWS.list.length, 1); feed.stop();
});
await t("konfiguracja i serwer: adresy przekaźnika w CONFIG, mapa je przekazuje, przekaźnik startuje z co-minutowego zadania, wersja v49", () => {
  assert.match(src("js/config.js"), /relayUrl: "/); assert.match(src("js/mapscreen.js"), /relayUrl: CONFIG\.neptun\.relayUrl/);
  assert.match(src("js/mapscreen.js"), /przez serwer EGIDA/);
  const w = src("server/run-neptun-watch.sh"); assert.ok(w.indexOf("run-neptun-relay.sh") > 0 && w.indexOf("run-neptun-relay.sh") < w.indexOf("neptun-watch.lock"));
  assert.match(src("server/run-neptun-relay.sh"), /relay\.off/); assert.match(src("server/neptun-relay.mjs"), /HOST = process\.env\.NEPTUN_RELAY_HOST \|\| "127\.0\.0\.1"/);
  assert.match(src("js/version.js"), /APP_VERSION = "v49"/); assert.match(src("sw.js"), /const VERSION = "egida-v49"/);
});
console.log(`test-v49: ${n} testów OK`);
