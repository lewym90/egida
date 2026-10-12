// v26: daty przeglądu zamiast komunikatów „oczekuje na zatwierdzenie”; licznik odwiedzin zawsze włączony.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOURCES } from "../server/news-sources.mjs";
import { offlineCenters, downloadOffline, offlineSummary } from "../js/offline.js";
import { parseAed, parseHospitals, loadMedicalDb, unpackAed, unpackHospital, overpassQueryAed, overpassQueryHospitals } from "../js/medical.js";
import { FIRST_AID, WHAT_TO_DO, PLECAK, EMERGENCY, PRIVACY } from "../js/content.js";
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log("  ok", name); };
const src = (f) => readFileSync(new URL("../js/" + f, import.meta.url), "utf8");

await ok("wszystkie treści mają datę przeglądu", () => {
  for (const [name, m] of Object.entries({ FIRST_AID, WHAT_TO_DO, PLECAK, EMERGENCY, PRIVACY })) assert.match(String(m.reviewed), /^\d{4}-\d{2}-\d{2}$/, name);
});
await ok("w aplikacji nie ma komunikatów o oczekiwaniu na zatwierdzenie ani wersji roboczej", () => {
  for (const f of ["app.js", "screens2.js", "content.js"]) {
    const s = src(f);
    assert.ok(!/oczekuje na (zatwierdzenie|przegląd)/i.test(s), f);
    assert.ok(!/wersja robocza/i.test(s), f);
    assert.ok(!/przegląd prawny/i.test(s), f);
    assert.ok(!/zostaną uzupełnione/i.test(s), f);
  }
});
await ok("licznik odwiedzin: bez przełączników i bez zależności od zgody", () => {
  const app = src("app.js");
  assert.ok(!/id="cCounter"|id="setCounter"/.test(app));
  const fn = app.slice(app.indexOf("function applyCounter()"), app.indexOf("/* ---------- zdarzenia"));
  assert.ok(fn.includes("gc.zgo.at/count.js"));
  assert.ok(!/consent/.test(fn), "applyCounter nie pyta o zgodę");
  assert.match(app, /applyCounter\(\);\s*$/m);
});
await ok("polityka prywatności opisuje licznik jako działający", () => {
  const all = PRIVACY.sections.map((s) => s.p.join(" ")).join(" ");
  assert.match(all, /GoatCounter/); assert.ok(!/domyślnie wyłączony/.test(all));
});
await ok("Radio ZET i TVP Info są w źródłach wiadomości (media krajowe)", () => {
  for (const id of ["media-radiozet", "media-tvpinfo"]) {
    const x = SOURCES.find((y) => y.id === id);
    assert.ok(x, id); assert.equal(x.region, "all"); assert.equal(x.filter, "media"); assert.ok(x.urls.every((u) => /^https?:\/\//.test(u)));
  }
});

await ok("tryb offline: środki obszarów (GPS, miejsca, schrony, województwo; bez powtórek i poza Polską)", () => {
  const c = offlineCenters({ gps: { lat: 52.23, lon: 21.01 }, places: [{ name: "Dom", lat: 52.231, lon: 21.012 }, { name: "Praca", lat: 50.06, lon: 19.94 }, { name: "Obce", lat: 40, lon: 2 }], shelters: [{ name: "Piwnica", lat: 54.35, lon: 18.65 }] });
  assert.deepEqual(c.map((x) => x.label), ["Twoja pozycja", "Praca", "Piwnica"]); // „Dom” to duplikat pozycji, „Obce” poza Polską
  assert.equal(c[0].r, 2); assert.equal(c[2].r, 1);
  const only = offlineCenters({ regionCenter: { lat: 51.2, lon: 22.9 } }); assert.equal(only.length, 1); assert.equal(only[0].r, 3);
  assert.equal(offlineCenters({}).length, 0);
  assert.equal(offlineCenters({ places: Array.from({ length: 12 }, (_, i) => ({ name: "m" + i, lat: 49 + i * 0.4, lon: 15 + i * 0.5 })) }).length, 8);
});
await ok("tryb offline: pobieranie zapisuje kafelki w pamięci i bazę schronów, raportuje wynik", async () => {
  const saved = new Map(), store = new Map(), urls = [];
  const cache = { async get(id) { return saved.get(id) ?? null; }, async set(id, rows) { saved.set(id, rows); } };
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const fetchImpl = async (u) => {
    urls.push(u);
    if (u.includes("shelters.json")) return { ok: true, status: 200, json: async () => ({ items: [{ id: "o1", lat: 52.2, lon: 21, name: "Schron" }] }) };
    return { ok: true, status: 200, json: async () => ({ rows: [["Z" + u.slice(-12), 52.2, 21.0, "ul. Testowa 1", "Warszawa", "24h"]] }) };
  };
  const centers = offlineCenters({ gps: { lat: 52.23, lon: 21.01 } });
  const prog = [];
  const r = await downloadOffline({ centers, pspUrl: "https://x.test/psp/", sheltersUrl: "https://x.test/shelters.json", cache, fetchImpl, storage, onProgress: (p) => prog.push(p.done), now: () => new Date("2026-10-12T08:00:00Z") });
  assert.equal(r.at, "2026-10-12T08:00:00.000Z"); assert.equal(r.centers, 1); assert.equal(r.failed, 0); assert.equal(r.tiles, 25); assert.equal(saved.size, 25); assert.equal(r.points, 25); assert.equal(r.shelterDb, 1);
  assert.ok(store.get("egida.shdb.v1")); assert.deepEqual(prog.at(-1), 2);
  assert.match(offlineSummary(r), /25 punktów schronienia z okolic 1 miejsca, 1 wpisów z OpenStreetMap\.$/);
  // brak sieci: nic nie wyjdzie, ale wcześniejsze kafelki zostają i wynik je zlicza
  const off = await downloadOffline({ centers, pspUrl: "https://x.test/psp/", sheltersUrl: "https://x.test/shelters.json", cache, fetchImpl: async () => { throw new Error("offline"); }, storage });
  assert.equal(off.failed, 0); assert.equal(off.points, 25); assert.equal(off.shelterDb, 0);
  assert.match(offlineSummary({ ...off, failed: 3 }), /Nie wszystkie obszary/);
});
await ok("podpowiedź instalacji i tryb offline są w aplikacji; powiadomień w aplikacji nie ma", () => {
  const app = src("app.js");
  assert.match(app, /id="offlineBtn"/); assert.match(app, /id="installLater"/); assert.match(app, /beforeinstallprompt/);
  assert.ok(!/Powiadomienia w aplikacji/.test(app));
  assert.match(readFileSync(new URL("../sw.js", import.meta.url), "utf8"), /js\/offline\.js/);
});
await ok("AED i szpitale z OSM: parsowanie (martwe wpisy, poza Polską, bez nazwy, telefon, SOR)", () => {
  const els = [
    { type: "node", id: 1, lat: 52.2, lon: 21.0, tags: { emergency: "defibrillator", name: "AED Urząd", "defibrillator:location": "przy recepcji", indoor: "yes", access: "yes", opening_hours: "24/7", check_date: "2026-09-01", "addr:street": "Testowa", "addr:housenumber": "1", "addr:city": "Warszawa" } },
    { type: "node", id: 2, lat: 52.3, lon: 21.1, tags: { emergency: "defibrillator", operator: "Gmina X" } },
    { type: "node", id: 3, lat: 52.3, lon: 21.1, tags: { emergency: "defibrillator", "disused:emergency": "defibrillator" } },
    { type: "node", id: 4, lat: 40.0, lon: 21.1, tags: { emergency: "defibrillator" } },
    { type: "node", id: 1, lat: 52.2, lon: 21.0, tags: { emergency: "defibrillator" } },
    { type: "way", id: 5, center: { lat: 50.06, lon: 19.94 }, tags: { amenity: "hospital", name: "Szpital Miejski", emergency: "yes", phone: "+48 12 345 67 89", "addr:city": "Kraków" } },
    { type: "way", id: 6, center: { lat: 50.1, lon: 19.9 }, tags: { amenity: "hospital", phone: "<script>" } },
    { type: "way", id: 7, center: { lat: 50.1, lon: 19.9 }, tags: { amenity: "hospital", abandoned: "yes" } },
  ];
  const a = parseAed({ elements: els }).map(unpackAed);
  assert.equal(a.length, 2);
  assert.equal(a[0].name, "AED Urząd"); assert.equal(a[0].how, "przy recepcji"); assert.equal(a[0].indoor, true); assert.equal(a[0].access, "publiczny"); assert.equal(a[0].checked, "2026-09-01"); assert.equal(a[0].kind, "aed"); assert.equal(a[0].osmUrl, "https://www.openstreetmap.org/node/1");
  assert.equal(a[1].name, "AED – Gmina X");
  const h = parseHospitals({ elements: els }).map(unpackHospital);
  assert.equal(h.length, 2);
  assert.equal(h[0].sor, true); assert.equal(h[0].phone, "+48 12 345 67 89"); assert.equal(h[0].osmUrl, "https://www.openstreetmap.org/way/5");
  assert.equal(h[1].name, "Szpital (bez nazwy)"); assert.equal(h[1].sor, false); assert.equal(h[1].phone, "");
  assert.match(overpassQueryAed(), /emergency"="defibrillator/); assert.match(overpassQueryHospitals(), /amenity"="hospital/);
});
await ok("AED i szpitale: pobieranie, kopia w telefonie przy braku sieci, zły format", async () => {
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const rows = parseAed({ elements: [{ type: "node", id: 1, lat: 52.2, lon: 21, tags: { emergency: "defibrillator" } }] });
  const good = async () => ({ ok: true, json: async () => ({ at: "2026-10-12T05:00:00Z", rows }) });
  const d = await loadMedicalDb("aed", "https://x.test/aed.json", storage, good);
  assert.equal(d.count, 1); assert.equal(d.stale, false); assert.ok(store.get("egida.aed.v1"));
  const off = await loadMedicalDb("aed", "https://x.test/aed.json", storage, async () => { throw new Error("offline"); });
  assert.equal(off.count, 1); assert.equal(off.stale, true);
  assert.equal(await loadMedicalDb("szpitale", "https://x.test/h.json", storage, async () => { throw new Error("offline"); }), null);
  assert.equal(await loadMedicalDb("szpitale", "https://x.test/h.json", storage, async () => ({ ok: true, json: async () => ({ nope: 1 }) })), null);
});
await ok("tryb offline pobiera też AED i szpitale", async () => {
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const fetchImpl = async (u) => {
    if (u.includes("aed.json")) return { ok: true, json: async () => ({ rows: [["n1", 52.2, 21, "AED", "", "", "", "", "", 0], ["n2", 52.3, 21, "AED 2", "", "", "", "", "", 0]] }) };
    if (u.includes("hospitals.json")) return { ok: true, json: async () => ({ rows: [["w1", 52.2, 21, "Szpital", 1, "", ""]] }) };
    if (u.includes("shelters.json")) return { ok: true, json: async () => ({ items: [] }) };
    return { ok: true, json: async () => ({ rows: [] }) };
  };
  const r = await downloadOffline({ centers: offlineCenters({ gps: { lat: 52.23, lon: 21.01 } }), pspUrl: "https://x.test/psp/", sheltersUrl: "https://x.test/shelters.json", aedUrl: "https://x.test/aed.json", hospitalsUrl: "https://x.test/hospitals.json", cache: null, fetchImpl, storage });
  assert.equal(r.aed, 2); assert.equal(r.hospitals, 1);
  assert.match(offlineSummary(r), /2 defibrylatorów AED, 1 szpitali/);
  assert.ok(store.get("egida.aed.v1") && store.get("egida.hosp.v1"));
});
await ok("nazwy zakładek i filtry: Zagrożenia, W pobliżu; filtry Schrony / Moje miejsca / Defibrylatory AED / Szpitale", () => {
  const app = src("app.js"), sh = src("sheltersscreen.js");
  assert.match(app, /t: "Zagrożenia"/); assert.match(app, /t: "W pobliżu"/); assert.match(app, /t: "Mapa zagrożeń"/); assert.match(app, /t: "Pomoc w pobliżu"/);
  assert.ok(!/t: "Mapa", i: I\.map/.test(app) && !/t: "Schrony", i: I\.shield/.test(app));
  assert.match(sh, /\["schrony", "Schrony"\], \["mine", "Moje miejsca"\], \["aed", "Defibrylatory AED"\], \["szpitale", "Szpitale"\]/);
  assert.ok(!/Z opisem wejścia"\]|Do 10 min/.test(sh));
  assert.match(app, /#\/schrony\/aed/); assert.match(src("screens2.js"), /#\/schrony\/szpitale/);
  assert.match(readFileSync(new URL("../sw.js", import.meta.url), "utf8"), /js\/medical\.js/);
  assert.match(readFileSync(new URL("../server/run.sh", import.meta.url), "utf8"), /medical-sync\.mjs/);
  assert.match(readFileSync(new URL("../server/publish.sh", import.meta.url), "utf8"), /aed\.json/);
});
console.log(`OK: ${n} grup testów v26`);
