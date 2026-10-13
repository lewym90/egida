// v32: drugie źródło AED – publiczna mapa „Ratuj z sercem” (server/ratuj-lib.mjs, ratuj-sync.mjs) i łączenie z OSM w aplikacji.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
const run = (args, env) => new Promise((res) => execFile(process.execPath, args, { env: { ...process.env, ...env }, encoding: "utf8" }, (err, stdout, stderr) => res({ status: err ? err.code ?? 1 : 0, stdout, stderr })));
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRobots, allowedByRobots, extractPoints, probeHtml, toRows, inPoland } from "../server/ratuj-lib.mjs";
import { loadMedicalDb } from "../js/medical.js";
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("  ok", name); };
const mem = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };

await ok("robots.txt: katalogi zakazane, mapa dozwolona", () => {
  const r = parseRobots("User-agent: *\nDisallow: /Admin/\nDisallow: /js/\nDisallow: /DesktopModules/\n# komentarz\n");
  assert.equal(allowedByRobots(r, "/Map.aspx"), true);
  assert.equal(allowedByRobots(r, "/DesktopModules/x/handler.ashx"), false);
  assert.equal(allowedByRobots(r, "/js/a.js"), false);
  assert.equal(allowedByRobots(parseRobots("User-agent: *\nDisallow: /\nAllow: /Map.aspx"), "/Map.aspx"), true);
  assert.equal(allowedByRobots(parseRobots("User-agent: *\nDisallow: /"), "/Map.aspx"), false);
});

const fx1 = `<script>var m=new google.maps.Marker({position:new google.maps.LatLng(51.24993, 22.55887),title:'AED – Klinika \\u0141ukasza',content:'<b>hol</b> przy recepcji'});
var m2=new google.maps.Marker({position:new google.maps.LatLng(52.2297,21.0122),title:"Dworzec"});var x=new google.maps.LatLng(40.7,-74.0);</script>`;
const fx2 = `<script>var pts=[{"lat":50.0647,"lng":19.945,"name":"Rynek","desc":"przy wejściu"},{lat:"54.352",lng:"18.6466",title:"Gdańsk"}];</script>`;
const fx3 = `<script>var locations=[['Szkoła nr 5',53.1325,23.1688,'portiernia'],['Poczta',51.1079,17.0385]];</script>`;
await ok("wyciąganie punktów: LatLng, obiekty lat/lng, tablice; poza Polską odrzucane", () => {
  const a = extractPoints(fx1); assert.equal(a.length, 2); assert.equal(a[0].lat, 51.24993); assert.match(a[0].name, /Łukasza/); assert.match(a[0].desc, /hol/);
  const b = extractPoints(fx2); assert.equal(b.length, 2); assert.equal(b[1].lon, 18.6466);
  const c = extractPoints(fx3); assert.equal(c.length, 2); assert.equal(c[0].name, "Szkoła nr 5"); assert.equal(c[0].desc, "portiernia");
  assert.ok(inPoland(52, 21) && !inPoland(40, -74));
});
await ok("wiersze w formacie aed.json (15 pól), id z pozycji", () => {
  const rows = toRows(extractPoints(fx3), "2026-10-13"); assert.equal(rows.length, 2); assert.equal(rows[0].length, 15); assert.match(rows[0][0], /^r\d+_\d+$/); assert.equal(rows[1][3], "Poczta"); assert.equal(toRows([{ lat: 50, lon: 20, name: "AED 3", desc: "" }])[0][3], "Defibrylator AED");
});
await ok("raport diagnostyczny wskazuje skrypty, endpointy i liczbę punktów", () => {
  const p = probeHtml(`<html><title>Mapa</title><script src="/Resources/x.js"></script>${fx1}<script>$.ajax({url:'/Handler.ashx'})</script></html>`);
  assert.equal(p.extractedPoints, 2); assert.ok(p.scriptSrc.includes("/Resources/x.js")); assert.ok(p.counts.ajax >= 1 && p.counts.ashx >= 1);
});
await ok("aplikacja: punkty z Ratuj z sercem dopisywane tylko gdy nie ma OSM w promieniu 30 m", async () => {
  const osm = ["n1", 50.0, 20.0, "Defibrylator AED", "hol", "", "", "", "", 0, "", "", "", "", 0];
  const rClose = ["r1", 50.0001, 20.0, "Defibrylator AED", "", "", "", "", "", 0, "", "", "", "", 0], rFar = ["r2", 50.01, 20.01, "Szkoła", "portiernia", "", "", "", "", 0, "", "", "", "", 0];
  const f = (u) => async () => ({ ok: true, json: async () => (u ? { rows: [rClose, rFar] } : { at: "2026-10-13T00:00:00Z", rows: [osm] }) });
  const fetchImpl = async (u) => (String(u).includes("ratuj") ? f(true)() : f(false)());
  const st = mem(); const d = await loadMedicalDb("aed", "https://x/aed.json", st, fetchImpl, "https://x/aed-ratuj.json");
  assert.equal(d.count, 1); assert.equal(d.ratuj, 1); assert.ok(d.items.some((x) => x.id === "r2" && x.src === "ratuj")); assert.ok(!d.items.some((x) => x.id === "r1"));
  // brak pliku Ratuj (404) nie psuje listy, a wcześniejsza kopia zostaje
  const f404 = async (u) => (String(u).includes("ratuj") ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => ({ at: "x", rows: [osm] }) });
  const d2 = await loadMedicalDb("aed", "https://x/aed.json", st, f404, "https://x/aed-ratuj.json"); assert.equal(d2.ratuj, 1);
  const d3 = await loadMedicalDb("aed", "https://x/aed.json", mem(), f404, "https://x/aed-ratuj.json"); assert.equal(d3.ratuj, 0); assert.equal(d3.items.length >= 1, true);
});
await ok("ratuj-sync na atrapie serwera: respektuje robots.txt i zapisuje plik", async () => {
  const many = Array.from({ length: 25 }, (_, i) => `{"lat":${(50 + i * 0.01).toFixed(4)},"lng":${(20 + i * 0.01).toFixed(4)},"name":"AED ${i}"}`).join(",");
  const hits = [];
  const srv = createServer((q, s) => { hits.push(q.url); if (q.url === "/robots.txt") return s.end("User-agent: *\nDisallow: /js/\nDisallow: /DesktopModules/\n"); if (q.url === "/Map.aspx") return s.end(`<html><title>Mapa</title><script src="/js/secret.js"></script><script src="/Resources/data.js"></script><script>var d=[${many}];</script></html>`); if (q.url === "/Resources/data.js") return s.end("var z=1;"); s.statusCode = 404; s.end("no"); });
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port, dir = mkdtempSync(join(tmpdir(), "rj-"));
  const res = await run([new URL("../server/ratuj-sync.mjs", import.meta.url).pathname], { RATUJ_BASE_URL: `http://127.0.0.1:${port}`, RATUJ_OUT: join(dir, "a.json"), RATUJ_PROBE_OUT: join(dir, "p.json"), RATUJ_PAUSE_MS: "10" });
  srv.close(); assert.equal(res.status, 0, res.stdout + res.stderr);
  const out = JSON.parse(readFileSync(join(dir, "a.json"), "utf8")); assert.equal(out.count, 25); assert.match(out.source, /Ratuj z sercem/);
  assert.ok(!hits.includes("/js/secret.js"), "nie wolno pobierać ścieżek zakazanych w robots.txt");
  const probe = JSON.parse(readFileSync(join(dir, "p.json"), "utf8")); assert.ok(probe.scripts.some((s) => s.skipped === "robots.txt"));
});
await ok("ratuj-sync: zablokowana mapa w robots.txt = nic nie pobiera", async () => {
  const hits = []; const srv = createServer((q, s) => { hits.push(q.url); s.end(q.url === "/robots.txt" ? "User-agent: *\nDisallow: /" : "x"); });
  await new Promise((r) => srv.listen(0, r)); const dir = mkdtempSync(join(tmpdir(), "rj-"));
  const res = await run([new URL("../server/ratuj-sync.mjs", import.meta.url).pathname], { RATUJ_BASE_URL: `http://127.0.0.1:${srv.address().port}`, RATUJ_OUT: join(dir, "a.json"), RATUJ_PROBE_OUT: join(dir, "p.json"), RATUJ_PAUSE_MS: "10" });
  srv.close(); assert.equal(res.status, 0); assert.ok(!hits.includes("/Map.aspx")); assert.equal(existsSync(join(dir, "a.json")), false);
});
await ok("serwer: run.sh i publish.sh obsługują aed-ratuj.json i raport", () => {
  const run = readFileSync(new URL("../server/run.sh", import.meta.url), "utf8"), pub = readFileSync(new URL("../server/publish.sh", import.meta.url), "utf8");
  assert.match(run, /ratuj-sync\.mjs/); assert.match(pub, /aed-ratuj\.json/); assert.match(pub, /ratuj-probe\.json/);
});
console.log(`OK: ${n} grup testów v32`);
