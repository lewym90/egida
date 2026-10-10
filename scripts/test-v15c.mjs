// Testy v15 (część 3): PRAWDZIWY format NEPTUN (próbki z raportu serwera z 10.10.2026, pola jak w API; teksty skrócone).
// Uruchamianie: node scripts/test-v15c.mjs
import assert from "node:assert/strict";
import { normalizeThreat, ThreatStore, applySnapshotJson, applyAlertsJson, applyMessagesJson, applyEnvelope, borderApproach, buildView, predict, assess } from "../js/neptun.js";
import { loadRegions } from "../js/regions.js";
import { candidates, buildMessage } from "../server/neptun-notify.mjs";
let n = 0;
const ok = (name, fn) => { try { fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };
const now = Date.parse("2026-10-10T18:59:30Z");
const REAL = {
  kab: { id: "trk_00255029", type: "kab", title: "Керована авіабомба", region: "Донецька область", district: "", locality: "Удачне", lat: 48.24099, lon: 36.99243, heading: null, confidenceLevel: "medium", sourceCount: 1, updatedAt: "2026-10-10T18:58:54Z", explanationShort: "…", status: "active", confirmedAt: "2026-10-10T18:58:54Z", uncertaintyKm: 4, positionQuality: "confirmed", lifecycle: "created", displayConfidence: "medium" },
  uav: { id: "trk_00254850", type: "uav", title: "БпЛА", region: "Дніпропетровська область", district: "", locality: "Перещепине", lat: 49.02512, lon: 35.36885, heading: 190, confidenceLevel: "high", sourceCount: 2, count: 1, updatedAt: "2026-10-10T18:54:21Z", status: "active", confirmedAt: "2026-10-10T18:54:21Z", uncertaintyKm: 4, positionQuality: "confirmed", lifecycle: "confirmed", displayConfidence: "high", presumptiveCourse: true },
  dest: { id: "trk_00255005", type: "uav", title: "БпЛА", region: "", district: "", locality: "Новотаврійське", lat: 47.66909291676888, lon: 35.658553352039554, heading: 318, confidenceLevel: "medium", sourceCount: 2, updatedAt: "2026-10-10T18:53:10Z", status: "active", uncertaintyKm: 25, positionQuality: "approx", lifecycle: "uncertain", displayConfidence: "medium", destination: true, presumptiveCourse: true },
  fpv: { id: "trk_f", type: "fpv", title: "FPV-дрон", region: "Харківська область", lat: 49.5, lon: 36.5, heading: null, confidenceLevel: "medium", sourceCount: 1, updatedAt: "2026-10-10T18:58:00Z", status: "active", uncertaintyKm: 4, positionQuality: "confirmed", lifecycle: "confirmed", displayConfidence: "medium" },
};
const REAL_ALERTS = { version: 1791658739, updatedAt: "2026-10-10T18:58:59.269066767Z",
  raions: [{ key: "бахмутський", name: "Бахмутський район", oblast: "Донецька область", since: "2026-10-10T17:05:50.098184Z", level: "red", reasons: ["Ракетна загроза (червоний рівень)"] }, { key: "бердянський", name: "Бердянський район", oblast: "Запорізька область", since: "2026-10-10T17:40:03.0579Z", level: "red", reasons: ["Ракетна загроза (червоний рівень)"] }],
  oblasts: [{ key: "луганська", name: "Луганська область", oblast: "Луганська область", since: "2026-10-10T10:00:00Z", level: "red" }] };
const REAL_MSG = { messages: [{ channel: "@nikalert", text: "Ⓜ️⚒️ Кр.Ріг : Вилітає на Херсонщину", date: "2026-10-10T18:59:09Z" }, { channel: "Моніторинг|Україна", text: "2 реактиви на півночі Чернігівщини вектор на Славутич.", date: "2026-10-10T18:59:22Z" }], updatedAt: "2026-10-10T19:00:02.382665689Z" };

ok("prawdziwe rekordy: wszystkie się normalizują, typy i nazwy po polsku", () => {
  const k = normalizeThreat(REAL.kab), u = normalizeThreat(REAL.uav);
  assert.equal(k.type, "kab"); assert.equal(k.headingDeg, null); assert.equal(k.locality, "Udaczne"); assert.equal(k.region, "obwód doniecki");
  assert.equal(u.headingDeg, 190); assert.equal(u.presumptive, true); assert.equal(u.speedKmh, null); assert.equal(u.posQuality, "confirmed");
  assert.equal(normalizeThreat(REAL.fpv).type, "fpv");
});
ok("destination: kurs na miejscowość, brak toru, brak oceny uspokajającej", () => {
  const d = normalizeThreat(REAL.dest);
  assert.equal(d.destination, true); assert.equal(d.posQuality, "approx"); assert.equal(d.uncertaintyKm, 25);
  assert.equal(predict(d, now).reason, "destination");
  const a = assess(d, { lat: 50, lon: 20, accKm: 0.05 }, now, { feedFresh: true });
  assert.equal(a.kind, "dest");
});
ok("kurs przypuszczalny nigdy nie daje zielonej oceny „tor przechodzi daleko”", () => {
  const u = normalizeThreat({ ...REAL.uav, confirmedAt: new Date(now - 30e3).toISOString(), updatedAt: new Date(now - 20e3).toISOString(), lat: 51, lon: 27, heading: 0 });
  const a = assess(u, { lat: 50.0, lon: 20.0, accKm: 0.05 }, now, { feedFresh: true });
  assert.notEqual(a.severity, "quiet"); assert.ok(["unsure", "uncertain", "near", "away"].includes(a.kind) || a.severity !== "quiet");
});
ok("alarmy: prawdziwy format oblasts + raions", () => {
  const s = new ThreatStore(); applyAlertsJson(s, REAL_ALERTS);
  assert.equal(s.alerts.size, 3);
  const v = buildView(s, null, true);
  assert.equal(v.alerts.length, 3);
  assert.ok(v.alerts.some((a) => a.scope === "oblast" && a.region === "obwód ługański"));
  const b = v.alerts.find((a) => a.scope === "raion");
  assert.ok(b.reasons.includes("zagrożenie rakietowe")); assert.ok(!/[Ѐ-ӿ]/.test(b.region + b.name));
});
ok("alarmy: koperta WebSocket w prawdziwym formacie", () => {
  const s = new ThreatStore();
  assert.equal(applyEnvelope(s, { type: "alerts", ts: "2026-10-10T18:59:00Z", data: REAL_ALERTS }), "alerts");
  assert.equal(s.alerts.size, 3);
  assert.equal(applyEnvelope(s, { type: "heartbeat", ts: "2026-10-10T18:59:10Z" }), "heartbeat");
});
ok("wiadomości: prawdziwy format { messages: [{channel,text,date}] }", () => {
  const s = new ThreatStore(); applyMessagesJson(s, REAL_MSG);
  assert.equal(s.messages.length, 2); assert.equal(s.messages[0].channel, "Моніторинг|Україна"); assert.ok(s.messages[0].at > 1e12);
});
ok("migawka WebSocket/REST: { serverTime, threats } z prawdziwymi rekordami", () => {
  const s = new ThreatStore(); applySnapshotJson(s, { serverTime: "2026-10-10T18:59:59.233Z", threats: Object.values(REAL) });
  assert.equal(s.items.size, 4); assert.equal(s.stats.bad, 0);
});
const regions = await loadRegions();
const near = (o) => ({ ...REAL.uav, id: "n" + Math.random(), lat: 51.2, lon: 24.4, heading: 270, presumptiveCourse: false, confirmedAt: new Date(now - 30e3).toISOString(), updatedAt: new Date(now - 20e3).toISOString(), ...o });
ok("powiadomienia: dokładna pozycja + kurs na granicę → tak; z kursem przypuszczalnym → tak, z adnotacją", () => {
  assert.ok(borderApproach(normalizeThreat(near({})), now).ok);
  const t = normalizeThreat(near({ presumptiveCourse: true }));
  const a = borderApproach(t, now); assert.ok(a.ok);
  assert.match(buildMessage("lubelskie", [{ t, ap: a, regions: ["lubelskie"] }]), /przypuszczalny/);
});
ok("powiadomienia: destination, FPV, pozycja ±>30 km, zbyt daleko → NIE", () => {
  assert.equal(borderApproach(normalizeThreat(near({ destination: true })), now).reason, "destination");
  assert.equal(borderApproach(normalizeThreat(near({ type: "fpv" })), now).reason, "fpv");
  assert.equal(borderApproach(normalizeThreat(near({ uncertaintyKm: 40 })), now).reason, "imprecise");
  assert.equal(borderApproach(normalizeThreat(near({ lon: 30 })), now).ok, false);
});
ok("powiadomienia: pozycja przybliżona ±25 km jest dopuszczona i opisana w wiadomości", () => {
  const t = normalizeThreat(near({ positionQuality: "approx", uncertaintyKm: 25 }));
  const a = borderApproach(t, now); assert.ok(a.ok);
  assert.match(buildMessage("lubelskie", [{ t, ap: a, regions: ["lubelskie"] }]), /Pozycja przybliżona \(±25 km\)/);
});
ok("kandydaci z prawdziwej migawki: rekordy z głębi Ukrainy nie wywołują powiadomień", () => {
  const s = new ThreatStore(); applySnapshotJson(s, { serverTime: new Date(now).toISOString(), threats: Object.values(REAL) }); s.skewMs = now - Date.now();
  assert.equal(candidates(s, now, regions).cands.length, 0);
});
console.log(`OK: ${n} grup testów v15c przeszło`);
