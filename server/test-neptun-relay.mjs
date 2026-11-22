// Testy przekaźnika NEPTUN: logika (RelayState, historia) i proces na ATRAPIE NEPTUN (lokalny serwer HTTP, bez WebSocket).
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { fetchThreats, relayLocalUrl } from "./neptun-source.mjs";
import { RelayState, historyDiff, nearPoland, compact, ALERTS_MAX_AGE_MS } from "./neptun-relay-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log("  ok " + name); };
const LVIV = { id: "a1", type: "missile", lat: 49.84, lon: 24.03, heading: 280, region: "Львівська область", locality: "Львів", status: "active", updatedAt: "2026-11-22T10:00:00Z" };
const KHARKIV = { id: "b2", type: "uav", lat: 49.99, lon: 36.23, heading: 270, region: "Харківська область", status: "active" };

await t("logika: snapshot, upsert, remove, heartbeat, alarmy i wiadomości z WebSocket", () => {
  const S = new RelayState({ freshMs: 1000 });
  assert.equal(S.isFresh(0), false);
  S.applyEnvelope({ type: "snapshot", ts: "2026-11-22T10:00:00Z", data: { threats: [LVIV, KHARKIV] } }, 1000);
  assert.equal(S.threats.size, 2); assert.equal(S.via, "ws"); assert.ok(S.isFresh(1500));
  const v = S.version;
  S.applyEnvelope({ type: "heartbeat" }, 1800); assert.equal(S.version, v, "heartbeat nie zmienia wersji"); assert.ok(S.isFresh(2700));
  S.applyEnvelope({ type: "upsert", data: { ...LVIV, lat: 50.1 } }, 1900); assert.equal(S.threats.get("a1").lat, 50.1);
  S.applyEnvelope({ type: "remove", data: { id: "b2" } }, 2000); assert.equal(S.threats.size, 1);
  S.applyEnvelope({ type: "alerts", data: { oblasts: [{ key: "lvivska" }], raions: [] } }, 2000); assert.equal(S.alerts.oblasts.length, 1);
  const p = S.payload(3000); assert.equal(p.threats.length, 1); assert.ok(p.alerts && p.serverTime && p.relay.source.includes("NEPTUN")); assert.equal(p.messages, undefined, "wiadomości osobno");
  S.applyMessages({ messages: [{ channel: "@x", text: "y", date: "z" }] }, 3000); assert.equal(S.messagesPayload().messages.length, 1);
  assert.throws(() => S.applySnapshot({ foo: 1 }, 3000));
  assert.equal(S.isFresh(4000), false, "po freshMs bez wiadomości – nieświeże");
});
await t("logika: wersja rośnie tylko przy prawdziwej zmianie (ten sam stan z REST → bez zmian)", () => {
  const S = new RelayState();
  S.applySnapshot({ serverTime: "2026-11-22T10:00:00Z", threats: [LVIV, KHARKIV] }, 1000);
  const v = S.version;
  S.applySnapshot({ serverTime: "2026-11-22T10:00:15Z", threats: [LVIV, KHARKIV] }, 16000); assert.equal(S.version, v, "inny serverTime, te same obiekty");
  S.applyEnvelope({ type: "upsert", data: { ...LVIV } }, 17000); assert.equal(S.version, v, "upsert bez zmian");
  S.applyEnvelope({ type: "remove", data: { id: "zz" } }, 17000); assert.equal(S.version, v, "usunięcie nieistniejącego");
  S.applyAlerts({ oblasts: [{ key: "x" }] }, 18000); const v2 = S.version; assert.ok(v2 > v);
  S.applyAlerts({ oblasts: [{ key: "x" }] }, 19000); assert.equal(S.version, v2, "te same alarmy");
  S.applySnapshot({ threats: [LVIV] }, 20000); assert.ok(S.version > v2);
});
await t("logika: stare alarmy obwodów nie są podawane dalej; czasy alarmów i wiadomości w odpowiedzi", () => {
  const S = new RelayState();
  S.applyEnvelope({ type: "alerts", data: { oblasts: [{ key: "lvivska" }] } }, 1000);
  assert.equal(S.alertsWsAt, 1000);
  let p = S.payload(1000 + 60000); assert.ok(p.alerts); assert.equal(p.relay.alertsAt, new Date(1000).toISOString());
  p = S.payload(1000 + ALERTS_MAX_AGE_MS + 1); assert.equal(p.alerts, null); assert.equal(p.relay.alertsAt, null);
  S.applyMessages({ messages: [{ id: 1, text: "a" }] }, 5000);
  assert.equal(S.messagesWsAt, null, "REST nie ustawia znacznika WebSocket");
  S.applyEnvelope({ type: "message", data: { id: 2, text: "b" } }, 6000);
  S.applyEnvelope({ type: "message", data: { id: 2, text: "b" } }, 6100);
  const m = S.messagesPayload(7000); assert.deepEqual(m.messages.map((x) => x.id), [2, 1], "pojedyncza wiadomość na początek, bez duplikatów"); assert.equal(m.relay.messagesAt, new Date(6100).toISOString());
});
await t("historia: tylko obiekty ≤ 400 km od granicy Polski, zapis tylko zmian", () => {
  assert.equal(nearPoland(LVIV), true); assert.equal(nearPoland(KHARKIV), false);
  const m = new Map([["a1", LVIV], ["b2", KHARKIV]]);
  let r = historyDiff(new Map(), m); assert.deepEqual(r.line.up.map((x) => x.id), ["a1"]); assert.deepEqual(r.line.rm, []);
  r = historyDiff(r.next, m); assert.equal(r.line, null, "bez zmian – bez wpisu");
  r = historyDiff(r.next, new Map([["a1", { ...LVIV, lat: 49.9 }]])); assert.equal(r.line.up[0].lat, 49.9);
  r = historyDiff(r.next, new Map()); assert.deepEqual(r.line.rm, ["a1"]);
  assert.equal(compact({ ...LVIV, velocity: { bearingDeg: 280, speedKmh: 750 } }).kmh, 750);
});

await t("obserwator/dziennik: najpierw lokalny przekaźnik, przy 503 lub braku – NEPTUN bezpośrednio", async () => {
  assert.equal(relayLocalUrl({}), "http://127.0.0.1:8790/egida/neptun/snapshot");
  assert.equal(relayLocalUrl({ NEPTUN_REST: "http://x" }), "", "testy z atrapą NEPTUN pomijają przekaźnik");
  assert.equal(relayLocalUrl({ NEPTUN_RELAY_LOCAL: "off" }), "");
  const mk = (relay) => async (url) => {
    if (url.startsWith("http://relay")) { if (relay === "down") throw new Error("ECONNREFUSED"); return new Response(JSON.stringify(relay === 503 ? { error: 1 } : { threats: [LVIV], version: 1 }), { status: relay === 503 ? 503 : 200 }); }
    return new Response(JSON.stringify({ threats: [KHARKIV] }), { status: 200 });
  };
  for (const [relay, via] of [["ok", "relay"], [503, "neptun"], ["down", "neptun"]]) {
    const r = await fetchThreats({ ua: "t", relayUrl: "http://relay/x", restUrl: "http://neptun/threats", fetchImpl: mk(relay) });
    assert.equal(r.ok, true); assert.equal(r.via, via, String(relay));
  }
  const bad = await fetchThreats({ ua: "t", relayUrl: "", restUrl: "http://neptun/threats", fetchImpl: async () => new Response("x", { status: 429 }) });
  assert.equal(bad.ok, false); assert.equal(bad.status, 429);
});

// ---------- proces przekaźnika na atrapie NEPTUN ----------
let up = true, threatsCalls = 0;
const fake = http.createServer((req, res) => {
  if (!up) { res.statusCode = 500; return res.end("x"); }
  const p = new URL(req.url, "http://x").pathname;
  res.setHeader("Content-Type", "application/json");
  if (p === "/api/v1/threats") { threatsCalls++; return res.end(JSON.stringify({ serverTime: new Date().toISOString(), threats: [LVIV, KHARKIV] })); }
  if (p === "/api/v1/alerts") return res.end(JSON.stringify({ raions: [], oblasts: [{ key: "lvivska", name: "Львівська область" }] }));
  if (p === "/api/v1/messages") return res.end(JSON.stringify({ messages: [{ channel: "@kpszsu", text: "Ракета курсом на захід", date: new Date().toISOString() }] }));
  res.statusCode = 404; res.end("{}");
});
await new Promise((r) => fake.listen(0, "127.0.0.1", r));
const base = mkdtempSync(path.join(tmpdir(), "relay-"));
const PORT = 20000 + Math.floor(Math.random() * 20000);
const relayEnv = { ...process.env, EGIDA_BASE: base, NEPTUN_RELAY_PORT: String(PORT), NEPTUN_BASE: `http://127.0.0.1:${fake.address().port}/api/v1`, NEPTUN_WS: "ws://127.0.0.1:1/", NEPTUN_RELAY_FRESH_MS: "2500", NEPTUN_RELAY_REST_MS: "400", NEPTUN_RELAY_EXTRAS_MS: "400" };
const proc = spawn(process.execPath, [path.join(here, "neptun-relay.mjs")], { cwd: here, env: relayEnv });
let out = ""; proc.stdout.on("data", (c) => (out += c)); proc.stderr.on("data", (c) => (out += c));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (p, headers = {}) => new Promise((resolve, reject) => { http.get({ host: "127.0.0.1", port: PORT, path: p, headers }, (res) => { const ch = []; res.on("data", (c) => ch.push(c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(ch) })); }).on("error", reject); });
try {
  await sleep(1500);
  await t("przekaźnik: /egida/neptun/snapshot – obiekty i alarmy, gzip, CORS, bez pamięci podręcznej", async () => {
    const r = await get("/egida/neptun/snapshot", { "Accept-Encoding": "gzip" });
    assert.equal(r.status, 200, out); assert.equal(r.headers["content-encoding"], "gzip"); assert.equal(r.headers["access-control-allow-origin"], "*"); assert.match(r.headers["cache-control"], /no-store/);
    const j = JSON.parse(gunzipSync(r.body)); assert.equal(j.threats.length, 2); assert.equal(j.alerts.oblasts.length, 1); assert.ok(Number.isFinite(j.version)); assert.equal(j.relay.via, "rest");
    const plain = await get("/egida/neptun/snapshot"); assert.equal(plain.headers["content-encoding"], undefined); assert.equal(JSON.parse(plain.body).threats.length, 2);
  });
  await t("„bez zmian”: ?since=<wersja> → 204 z czasem serwera; inna wersja → pełne dane", async () => {
    const j = JSON.parse((await get("/egida/neptun/snapshot")).body);
    const r = await get(`/egida/neptun/snapshot?since=${j.version}`);
    assert.equal(r.status, 204, "atrapa zwraca ciągle te same obiekty – wersja nie może rosnąć");
    assert.ok(r.headers["x-server-time"]); assert.match(r.headers["access-control-expose-headers"], /X-Server-Time/);
    assert.ok(Number(r.headers["x-relay-age-ms"]) >= 0 && Number(r.headers["x-relay-age-ms"]) < 2500, "wiek danych w nagłówku");
    assert.equal((await get("/egida/neptun/snapshot?since=-5")).status, 200);
  });
  await t("wiadomości osobno: /egida/neptun/messages", async () => { const r = await get("/egida/neptun/messages"); assert.equal(r.status, 200); assert.equal(JSON.parse(r.body).messages[0].channel, "@kpszsu"); });
  await t("bez WebSocket: REST do NEPTUN co zadany czas (atrapa: 0,4 s; dla neptun.in.ua minimum 5 s wymuszone w kodzie)", async () => { assert.ok(threatsCalls >= 2); assert.match(readFileSync(path.join(here, "neptun-relay.mjs"), "utf8"), /neptun\\.in\\.ua\/\.test\(API\) \? 5000/); });
  await t("drugi egzemplarz na zajętym porcie: kończy się kodem 3 i NIE odpytuje NEPTUN", async () => {
    const before = threatsCalls;
    const p2 = spawn(process.execPath, [path.join(here, "neptun-relay.mjs")], { cwd: here, env: { ...relayEnv, EGIDA_BASE: mkdtempSync(path.join(tmpdir(), "relay2-")) } });
    const code = await new Promise((r) => p2.on("exit", r));
    assert.equal(code, 3);
    assert.ok(threatsCalls - before <= 3, "zapytania tylko od pierwszego egzemplarza");
  });
  await t("historia: plik dzienny z obiektem przy granicy (Lwów), bez dalekiego (Charków)", async () => {
    await sleep(10500);
    const f = readdirSync(path.join(base, "neptun-history")).find((x) => x.endsWith(".jsonl"));
    assert.ok(f, out); const txt = readFileSync(path.join(base, "neptun-history", f), "utf8");
    assert.match(txt, /"id":"a1"/); assert.doesNotMatch(txt, /"id":"b2"/);
  });
  await t("NEPTUN milczy dłużej niż próg → 503 (aplikacja przejdzie na NEPTUN bezpośrednio); /health mówi prawdę", async () => {
    up = false; await sleep(3500);
    assert.equal((await get("/egida/neptun/snapshot")).status, 503);
    const h = JSON.parse((await get("/egida/neptun/health")).body); assert.equal(h.ok, false);
    up = true; await sleep(1500);
    assert.equal((await get("/egida/neptun/snapshot")).status, 200, "po powrocie NEPTUN znów 200");
  });
  await t("tylko odczyt: POST → 405, nieznana ścieżka → 404", async () => {
    const r = await new Promise((resolve) => { const q = http.request({ host: "127.0.0.1", port: PORT, path: "/egida/neptun/snapshot", method: "POST" }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); }); q.end(); });
    assert.equal(r, 405); assert.equal((await get("/egida/neptun/../etc/passwd")).status, 404);
  });
} finally { proc.kill("SIGTERM"); }

// ---------- przekaźnik z działającym WebSocket (minimalna atrapa serwera WS) ----------
const sockets = new Set(); let beat = true;
const frame = (obj) => { const b = Buffer.from(JSON.stringify(obj)); return b.length < 126 ? Buffer.concat([Buffer.from([0x81, b.length]), b]) : Buffer.concat([Buffer.from([0x81, 126, b.length >> 8, b.length & 255]), b]); };
fake.on("upgrade", (req, sock) => {
  const acc = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
  sock.on("error", () => {}); sock.on("close", () => sockets.delete(sock)); sockets.add(sock);
  sock.write(frame({ type: "snapshot", ts: new Date().toISOString(), data: { threats: [LVIV, KHARKIV] } }));
  sock.write(frame({ type: "alerts", data: { raions: [], oblasts: [{ key: "lvivska" }] } }));
  sock.write(frame({ type: "messages", data: { messages: [{ id: 9, text: "ws" }] } }));
});
const hb = setInterval(() => { if (beat) for (const s of sockets) s.write(frame({ type: "heartbeat", ts: new Date().toISOString() })); }, 300);
const PORT2 = PORT + 1;
const base2 = mkdtempSync(path.join(tmpdir(), "relay-ws-"));
let alertsCalls = 0; fake.on("request", (req) => { if (req.url.startsWith("/api/v1/alerts")) alertsCalls++; });
const proc2 = spawn(process.execPath, [path.join(here, "neptun-relay.mjs")], { cwd: here, env: { ...relayEnv, EGIDA_BASE: base2, NEPTUN_RELAY_PORT: String(PORT2), NEPTUN_WS: `ws://127.0.0.1:${fake.address().port}/api/v1/stream`, NEPTUN_RELAY_WS_SILENT_MS: "1500", NEPTUN_RELAY_RESYNC_MS: "600000", NEPTUN_RELAY_WS_STABLE_MS: "500" } });
let out2 = ""; proc2.stdout.on("data", (c) => (out2 += c)); proc2.stderr.on("data", (c) => (out2 += c));
const get2 = (p) => new Promise((resolve, reject) => { http.get({ host: "127.0.0.1", port: PORT2, path: p }, (res) => { const ch = []; res.on("data", (c) => ch.push(c)); res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(ch) })); }).on("error", reject); });
try {
  await sleep(1200);
  const c0 = threatsCalls, a0 = alertsCalls;
  await t("WebSocket działa → przekaźnik NIE odpytuje REST (/threats, /alerts) – NEPTUN widzi jedno połączenie", async () => {
    await sleep(3000);
    assert.equal(threatsCalls - c0, 0, out2); assert.equal(alertsCalls - a0, 0, "alarmy przychodzą przez WS");
    const h = JSON.parse((await get2("/egida/neptun/health")).body); assert.equal(h.ws, true); assert.equal(h.via, "ws");
    const j = JSON.parse((await get2("/egida/neptun/snapshot")).body); assert.equal(j.threats.length, 2); assert.ok(j.alerts);
  });
  await t("WebSocket otwarty, ale milczy > progu → przekaźnik go zamyka i przechodzi na REST", async () => {
    beat = false; const c1 = threatsCalls;
    await sleep(2600);
    assert.match(out2, /WS milczy/); assert.ok(threatsCalls - c1 >= 1, out2);
    assert.equal((await get2("/egida/neptun/snapshot")).status, 200, "dane nadal świeże dzięki REST");
  });
} finally { clearInterval(hb); proc2.kill("SIGTERM"); for (const s of sockets) s.destroy(); fake.close(); }
console.log(`test-neptun-relay: ${n} testów OK`);
