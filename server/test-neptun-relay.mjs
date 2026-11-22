// Testy przekaźnika NEPTUN: logika (RelayState, historia) i proces na ATRAPIE NEPTUN (lokalny serwer HTTP, bez WebSocket).
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { RelayState, historyDiff, nearPoland, compact } from "./neptun-relay-lib.mjs";

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
await t("historia: tylko obiekty ≤ 400 km od granicy Polski, zapis tylko zmian", () => {
  assert.equal(nearPoland(LVIV), true); assert.equal(nearPoland(KHARKIV), false);
  const m = new Map([["a1", LVIV], ["b2", KHARKIV]]);
  let r = historyDiff(new Map(), m); assert.deepEqual(r.line.up.map((x) => x.id), ["a1"]); assert.deepEqual(r.line.rm, []);
  r = historyDiff(r.next, m); assert.equal(r.line, null, "bez zmian – bez wpisu");
  r = historyDiff(r.next, new Map([["a1", { ...LVIV, lat: 49.9 }]])); assert.equal(r.line.up[0].lat, 49.9);
  r = historyDiff(r.next, new Map()); assert.deepEqual(r.line.rm, ["a1"]);
  assert.equal(compact({ ...LVIV, velocity: { bearingDeg: 280, speedKmh: 750 } }).kmh, 750);
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
const proc = spawn(process.execPath, [path.join(here, "neptun-relay.mjs")], { cwd: here, env: { ...process.env, EGIDA_BASE: base, NEPTUN_RELAY_PORT: String(PORT), NEPTUN_BASE: `http://127.0.0.1:${fake.address().port}/api/v1`, NEPTUN_WS: "ws://127.0.0.1:1/", NEPTUN_RELAY_FRESH_MS: "2500", NEPTUN_RELAY_REST_MS: "400", NEPTUN_RELAY_EXTRAS_MS: "400" } });
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
    assert.ok(r.status === 204 || r.status === 200); // między odczytami REST mógł podbić wersję
    if (r.status === 204) { assert.ok(r.headers["x-server-time"]); assert.match(r.headers["access-control-expose-headers"], /X-Server-Time/); }
    assert.equal((await get("/egida/neptun/snapshot?since=-5")).status, 200);
  });
  await t("wiadomości osobno: /egida/neptun/messages", async () => { const r = await get("/egida/neptun/messages"); assert.equal(r.status, 200); assert.equal(JSON.parse(r.body).messages[0].channel, "@kpszsu"); });
  await t("REST do NEPTUN co zadany czas (atrapa: 0,4 s; dla neptun.in.ua minimum 5 s wymuszone w kodzie)", async () => { assert.ok(threatsCalls >= 2); assert.match(readFileSync(path.join(here, "neptun-relay.mjs"), "utf8"), /neptun\\.in\\.ua\/\.test\(API\) \? 5000/); });
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
} finally { proc.kill("SIGTERM"); fake.close(); }
console.log(`test-neptun-relay: ${n} testów OK`);
