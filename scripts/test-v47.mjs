// Testy paczki v47: stopnie alarmowe (parser komunikatów RCB, kolektor na serwerze, ekran w aplikacji, tabele).
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOrders, textOf, titleOf, publishedOf, legalBasisOf, alarmLinks, mergeOrders, isActive, robotsAllows, warsawIso } from "../server/alarm-lib.mjs";
import { normalizeAlarm, alarmStatus, daysLeft, daysWord, scopeTitle, sortAlarms, renderAlarmHtml, alarmSummary, ALARM_STALE_H } from "../js/alarm.js";
import { GENERAL_TABLE, CRP_TABLE, LEVEL_STYLE } from "../js/alarm-table.js";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => readFileSync(path.join(root, p), "utf8");
let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error("BŁĄD:", name, "\n", e.message); process.exit(1); } };

// Treść komunikatu RCB z 26.08.2026 (tekst ze strony gov.pl, bez obrazków), zapisana jako HTML.
const PAGE = `<html><head><title>Przedłużenie obowiązywania stopni alarmowych (do 30 listopada 2026 r.) - Rządowe Centrum Bezpieczeństwa - Portal Gov.pl</title><script>var x="nr 99 z dnia 1 stycznia 2026 roku";</script></head><body>
<h1>Przedłużenie obowiązywania stopni alarmowych (do 30 listopada 2026 r.)</h1><span>26.08.2026</span>
<p>Prezes Rady Ministrów na podstawie art. 16 ust. 1 pkt 1 ustawy z dnia 10 czerwca 2016 roku o działaniach antyterrorystycznych (Dz. U. z 2025 r. poz. 194) podpisał zarządzenia:</p><ul>
<li><b>nr 47</b> z dnia 25 sierpnia 2026 roku w sprawie wprowadzenia <b>drugiego stopnia alarmowego (<u>stopień BRAVO</u>)</b> na całym terytorium Rzeczypospolitej Polskiej, obowiązuje od dnia 1 września 2026 r., od godz. 00.00, do dnia 30 listopada 2026 r., do godz. 23.59,</li>
<li><b>nr 48</b> z dnia 25 sierpnia 2026 roku w sprawie wprowadzenia <b>trzeciego stopnia alarmowego (<u>stopień CHARLIE</u>)</b> na obszarach linii kolejowych zarządzanych przez PKP Polskie Linie Kolejowe S.A. i PKP Linia Hutnicza Szerokotorowa Sp. z o.o., obowiązuje od dnia 1 września 2026 r., od godz. 00.00, do dnia 30 listopada 2026 r., do godz. 23.59,</li>
<li><b>nr 49</b> z dnia 25 sierpnia 2026 roku w sprawie wprowadzenia <b>drugiego stopnia alarmowego (<u>stopień BRAVO)</u></b> wobec polskiej infrastruktury energetycznej mieszczącej się poza granicami Rzeczypospolitej Polskiej, obowiązuje od dnia 1 września 2026 r., od godz. 00.00, do dnia 30 listopada 2026 r., do godz. 23.59,</li>
<li><b>nr 50</b> z dnia 25 sierpnia 2026 roku w sprawie wprowadzenia <b>drugiego stopnia alarmowego CRP (<u>stopień BRAVO-CRP</u>)</b> na całym terytorium Rzeczypospolitej Polskiej, obowiązuje od dnia 1 września 2026 r., od godz. 00.00, do dnia 30 listopada 2026 r., do godz. 23.59.</li></ul></body></html>`;
const SEED_URL = "https://www.gov.pl/web/rcb/przedluzenie-obowiazywania-stopni-alarmowych-do-30-listopada-2026-r";

// ---------- parser ----------
await t("parser: cztery zarządzenia z komunikatu RCB (numer, stopień, zasięg, terminy w czasie polskim)", () => {
  const o = parseOrders(textOf(PAGE), { url: SEED_URL });
  assert.equal(o.length, 4);
  assert.deepEqual(o.map((x) => [x.nr, x.level, x.crp]), [[47, "BRAVO", false], [48, "CHARLIE", false], [49, "BRAVO", false], [50, "BRAVO-CRP", true]]);
  assert.equal(o[0].scope, "na całym terytorium Rzeczypospolitej Polskiej");
  assert.match(o[1].scope, /^na obszarach linii kolejowych zarządzanych przez PKP Polskie Linie Kolejowe S\.A\. i PKP Linia Hutnicza Szerokotorowa Sp\. z o\.o\.$/);
  assert.match(o[2].scope, /^wobec polskiej infrastruktury energetycznej/);
  for (const x of o) { assert.equal(x.date, "2026-08-25"); assert.equal(x.from, "2026-09-01T00:00:00+02:00"); assert.equal(x.until, "2026-11-30T23:59:00+01:00"); assert.equal(x.url, SEED_URL); }
});
await t("parser: skrypty ze strony nie są traktowane jak treść, tytuł, data publikacji i podstawa prawna", () => {
  const text = textOf(PAGE);
  assert.ok(!/nr 99/.test(text));
  assert.equal(titleOf(PAGE), "Przedłużenie obowiązywania stopni alarmowych (do 30 listopada 2026 r.)");
  assert.equal(publishedOf(text), "2026-08-26");
  assert.deepEqual(legalBasisOf(text), { article: "art. 16 ust. 1 pkt 1 ustawy z dnia 10 czerwca 2016 roku o działaniach antyterrorystycznych", journal: "Dz. U. z 2025 r. poz. 194" });
});
await t("parser: odrzuca zarządzenie, w którym nazwa słowna i nazwa w nawiasie się nie zgadzają albo daty są odwrócone", () => {
  const bad1 = "nr 1 z dnia 1 maja 2026 roku w sprawie wprowadzenia drugiego stopnia alarmowego (stopień CHARLIE) na całym terytorium, obowiązuje od dnia 1 maja 2026 r., od godz. 00.00, do dnia 2 maja 2026 r., do godz. 23.59";
  const bad2 = "nr 2 z dnia 1 maja 2026 roku w sprawie wprowadzenia drugiego stopnia alarmowego (stopień BRAVO) na całym terytorium, obowiązuje od dnia 5 maja 2026 r., od godz. 00.00, do dnia 2 maja 2026 r., do godz. 23.59";
  assert.equal(parseOrders(bad1).length, 0); assert.equal(parseOrders(bad2).length, 0);
  assert.equal(parseOrders("nr 3 z dnia 1 maja 2026 roku w sprawie wprowadzenia pierwszego stopnia alarmowego (stopień ALFA) na całym terytorium RP, obowiązuje od dnia 1 maja 2026 r., od godz. 00.00, do dnia 2 maja 2026 r., do godz. 23.59")[0].level, "ALFA");
  assert.equal(parseOrders("brak zarządzeń w tym tekście").length, 0);
});
await t("strefa czasowa: lato +02:00, zima +01:00, przejście 25.10.2026", () => {
  assert.equal(warsawIso(2026, 9, 1, 0, 0), "2026-09-01T00:00:00+02:00");
  assert.equal(warsawIso(2026, 11, 30, 23, 59), "2026-11-30T23:59:00+01:00");
  assert.equal(warsawIso(2026, 10, 25, 1, 0), "2026-10-25T01:00:00+02:00");
  assert.equal(warsawIso(2026, 10, 26, 12, 0), "2026-10-26T12:00:00+01:00");
});
await t("linki: znajdujemy tylko komunikaty RCB o stopniach alarmowych", () => {
  const html = `<a href="/web/rcb/przedluzenie-obowiazywania-stopni-alarmowych-do-30-listopada-2026-r">a</a><a href="/web/rcb/odwolanie-stopnia-alarmowego-bravo">b</a><a href="/web/rcb/raport-dobowy3">c</a><a href="https://www.gov.pl/web/rcb/wprowadzenie-stopni-alarmowych-charlie-bravo-i-bravo-crp">d</a><a href="https://example.com/web/rcb/stopni-alarmowych">e</a>`;
  assert.deepEqual(alarmLinks(html), ["https://www.gov.pl/web/rcb/przedluzenie-obowiazywania-stopni-alarmowych-do-30-listopada-2026-r", "https://www.gov.pl/web/rcb/odwolanie-stopnia-alarmowego-bravo", "https://www.gov.pl/web/rcb/wprowadzenie-stopni-alarmowych-charlie-bravo-i-bravo-crp"]);
});
await t("scalanie i robots.txt", () => {
  const a = parseOrders(textOf(PAGE)), upd = [{ ...a[0], scope: "zmieniony" }, { nr: 51, date: "2026-11-20", level: "CHARLIE", crp: false, scope: "x", from: "2026-12-01T00:00:00+01:00", until: "2027-02-28T23:59:00+01:00" }];
  const m = mergeOrders(a, upd);
  assert.equal(m.length, 5); assert.equal(m[0].nr, 51); assert.equal(m.find((x) => x.nr === 47).scope, "zmieniony");
  assert.equal(isActive(a[0], Date.parse("2026-10-19T12:00:00Z")), true); assert.equal(isActive(a[0], Date.parse("2026-12-01T12:00:00Z")), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /web/rcb/tajne", "/web/rcb/"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /web/rcb/", "/web/rcb/"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /web/\nAllow: /web/rcb/", "/web/rcb/"), true);
  assert.equal(robotsAllows("User-agent: bot\nDisallow: /", "/web/rcb/"), true);
});

// ---------- plik dla aplikacji ----------
const NOW = Date.parse("2026-10-19T12:16:00Z"); // 14:16 w Warszawie
const seed = JSON.parse(src("server/alarm-seed.json"));
const file = (over = {}) => ({ at: "2026-10-19T11:00:00Z", source: { name: "Rządowe Centrum Bezpieczeństwa (gov.pl/rcb)", url: "https://www.gov.pl/web/rcb" }, basis: seed.basis, items: seed.items, notices: [], ...over });
await t("plik startowy serwera zgadza się z parserem (te same cztery zarządzenia)", () => {
  const o = parseOrders(textOf(PAGE), { url: SEED_URL });
  for (const x of o) { const s = seed.items.find((y) => y.nr === x.nr); for (const k of ["date", "level", "crp", "scope", "from", "until"]) assert.equal(s[k], x[k], `${x.nr}.${k}`); }
  assert.equal(seed.items.length, 4);
});
await t("normalizeAlarm: poprawny plik, odrzucanie złego kształtu i złych wpisów, starość", () => {
  const a = normalizeAlarm(file(), { now: NOW });
  assert.equal(a.items.length, 4); assert.equal(a.stale, false); assert.equal(a.basis.journal, "Dz. U. z 2025 r. poz. 194");
  assert.equal(normalizeAlarm(null, { now: NOW }), null); assert.equal(normalizeAlarm({ at: "x", items: [] }, { now: NOW }), null); assert.equal(normalizeAlarm(file({ items: [] }), { now: NOW }), null);
  assert.equal(normalizeAlarm(file({ at: "2026-10-30T00:00:00Z" }), { now: NOW }), null); // data z przyszłości
  const bad = normalizeAlarm(file({ items: [...seed.items, { nr: 1, level: "ZULU", from: "2026-01-01T00:00:00Z", until: "2026-02-01T00:00:00Z" }, { nr: 2, level: "BRAVO", from: "2026-05-01T00:00:00Z", until: "2026-04-01T00:00:00Z" }, null, "x"] }), { now: NOW });
  assert.equal(bad.items.length, 4);
  assert.equal(normalizeAlarm(file({ at: new Date(NOW - (ALARM_STALE_H + 1) * 36e5).toISOString() }), { now: NOW }).stale, true);
  assert.equal(normalizeAlarm(file({ items: [{ ...seed.items[0], url: "javascript:alert(1)" }] }), { now: NOW }).items[0].url, "");
});
await t("stan i licznik dni: 19.10.2026 14:16 → obowiązuje, zostało 42 dni; po terminie → wygasło", () => {
  const o = normalizeAlarm(file(), { now: NOW }).items[0];
  assert.equal(alarmStatus(o, NOW), "active"); assert.equal(daysLeft(o, NOW), 42);
  assert.equal(alarmStatus(o, Date.parse("2026-08-30T12:00:00Z")), "upcoming");
  assert.equal(alarmStatus(o, Date.parse("2026-11-30T22:58:00Z")), "active"); // 23:58 czasu polskiego
  assert.equal(alarmStatus(o, Date.parse("2026-11-30T23:00:00Z")), "ended"); // 00:00 1.12 czasu polskiego
  assert.equal(daysLeft(o, Date.parse("2026-11-30T10:00:00Z")), 0);
  assert.equal(daysWord(1), "1 dzień"); assert.equal(daysWord(42), "42 dni");
});
await t("zasięg: czytelne tytuły i kolejność kart (kraj, potem reszta, CRP na końcu)", () => {
  const a = normalizeAlarm(file(), { now: NOW }).items;
  assert.equal(scopeTitle(a.find((x) => x.nr === 47).scope), "Cała Polska");
  assert.equal(scopeTitle(a.find((x) => x.nr === 48).scope), "Linie kolejowe (PKP PLK i PKP LHS)");
  assert.equal(scopeTitle(a.find((x) => x.nr === 49).scope), "Polska infrastruktura energetyczna za granicą");
  assert.deepEqual(sortAlarms(a).map((x) => x.nr), [47, 48, 49, 50]);
  assert.equal(alarmSummary(normalizeAlarm(file(), { now: NOW }), NOW), "BRAVO"); // CHARLIE jest tylko na kolejach, więc nie jest „stopniem kraju”
  assert.equal(alarmSummary(normalizeAlarm(file(), { now: NOW }), Date.parse("2027-01-01T00:00:00Z")), null);
});

// ---------- ekran ----------
await t("ekran: cztery karty, termin, podstawa, źródło, tabele, brak dokładnych tekstów z pustych danych", () => {
  const h = renderAlarmHtml(normalizeAlarm(file(), { now: NOW }), { now: NOW });
  assert.equal((h.match(/class="card alcard active"/g) || []).length, 4);
  assert.match(h, /Zostało 42 dni/); assert.match(h, /Obowiązują teraz/); assert.match(h, /Cała Polska/);
  assert.match(h, /od 1 września 2026, godz\.&nbsp;00:00/); assert.match(h, /do 30 listopada 2026, godz\.&nbsp;23:59/);
  assert.match(h, /Zarządzenie nr 47 Prezesa Rady Ministrów z dnia 25 sierpnia 2026/);
  assert.match(h, /art\. 16 ust\. 1 pkt 1 ustawy z dnia 10 czerwca 2016 roku o działaniach antyterrorystycznych \(Dz\. U\. z 2025 r\. poz\. 194\)/);
  assert.match(h, /Komunikat RCB z 26 sierpnia 2026/); assert.match(h, /gov\.pl\/web\/rcb/);
  assert.match(h, /Najważniejsze zadania dla administracji/); assert.match(h, /BRAVO-CRP/); assert.match(h, /Zadania obywatela/);
  assert.ok(!/spokojn/i.test(h));
  assert.ok(!/class="status warn"/.test(h)); // dane świeże: brak ostrzeżeń
});
await t("ekran: brak danych, dane stare, brak obowiązującego zarządzenia, wygasłe, nowe komunikaty RCB", () => {
  assert.match(renderAlarmHtml(null, { now: NOW }), /Brak aktualnych danych/);
  assert.match(renderAlarmHtml(null, { now: NOW, loading: true }), /Wczytuję/);
  const stale = renderAlarmHtml(normalizeAlarm(file({ at: "2026-10-10T00:00:00Z" }), { now: NOW }), { now: NOW });
  assert.match(stale, /Ostatnie sprawdzenie źródła/); assert.match(stale, /sprawdź komunikaty RCB/);
  const after = renderAlarmHtml(normalizeAlarm(file(), { now: NOW }), { now: Date.parse("2026-12-05T10:00:00Z") });
  assert.match(after, /nie ma obowiązującego zarządzenia/); assert.match(after, /To nie znaczy, że zagrożenia nie ma/); assert.match(after, /Wygasłe zarządzenia \(4\)/); assert.ok(!/Obowiązują teraz/.test(after));
  const nt = renderAlarmHtml(normalizeAlarm(file({ notices: [{ title: "Odwołanie stopnia alarmowego", url: "https://www.gov.pl/web/rcb/odwolanie", published: "2026-11-02" }] }), { now: NOW }), { now: NOW });
  assert.match(nt, /nowy komunikat o stopniach alarmowych/); assert.match(nt, /Odwołanie stopnia alarmowego \(2 listopada 2026\)/);
});
await t("ekran: tekst z serwera jest escapowany, adresy tylko https", () => {
  const evil = file({ items: [{ ...seed.items[2], scope: "na <img src=x onerror=alert(1)> terytorium", url: "https://www.gov.pl/a\"onmouseover=\"x" }], notices: [{ title: "<script>alert(1)</script>", url: "javascript:alert(1)" }] });
  const h = renderAlarmHtml(normalizeAlarm(evil, { now: NOW }), { now: NOW });
  assert.ok(!/<img src=x/.test(h)); assert.ok(!/<script>alert/.test(h)); assert.ok(!/javascript:/.test(h)); assert.ok(!/"onmouseover="/.test(h));
});
await t("tabele: przepisane z infografiki RCB, kolory stopni, CRP kompletne, braki oznaczone", () => {
  assert.deepEqual(CRP_TABLE.rows.map((r) => r.level), ["ALFA-CRP", "BRAVO-CRP", "CHARLIE-CRP", "DELTA-CRP"]);
  assert.ok(CRP_TABLE.rows.every((r) => r.admin.length > 0 && r.admin.every((x) => /[;.]$/.test(x))));
  assert.deepEqual(CRP_TABLE.rows[1].admin, ["zwiększenie dyspozycyjności personelu bezpieczeństwa systemów;", "całodobowe dyżury administratorów systemów kluczowych."]);
  assert.deepEqual(GENERAL_TABLE.rows.map((r) => r.level), ["ALFA", "BRAVO", "CHARLIE", "DELTA"]);
  assert.deepEqual(GENERAL_TABLE.rows.map((r) => r.admin.length), [5, 6, 5, 5]);
  assert.equal(GENERAL_TABLE.complete, true);
  assert.deepEqual(GENERAL_TABLE.rows[3].admin[0], "ograniczenia komunikacyjne w rejonach zagrożonych;");
  assert.deepEqual(GENERAL_TABLE.rows[3].admin[4], "przygotowanie do zapewnienia ciągłości działania w zapasowym miejscu.");
  assert.equal(GENERAL_TABLE.rows[2].admin[4], "całodobowy nadzór nad miejscami nieobjętymi nadzorem.");
  assert.deepEqual(GENERAL_TABLE.citizen.items, ["zachowanie czujności;", "informowanie służb po zaobserwowaniu podejrzanych zdarzeń;", "stosowanie się do poleceń służb."]);
  for (const k of ["ALFA", "BRAVO", "CHARLIE", "DELTA"]) assert.match(LEVEL_STYLE[k].bg, /^#[0-9A-F]{6}$/i);
  const h = renderAlarmHtml(null, { now: NOW });
  assert.ok(!/w przygotowaniu/.test(h) && !/To nie jest cały wiersz/.test(h)); // tabela jest kompletna, bez znaczników „w przygotowaniu”
  assert.match(h, /DELTA/); assert.match(h, /Zadania obywatela/);
});

// ---------- kolektor na serwerze (lokalny serwer udający gov.pl) ----------
function fakeSite(routes) {
  return new Promise((resolve) => {
    const hits = [];
    const srv = createServer((req, res) => {
      hits.push(req.url);
      const r = routes[req.url];
      if (!r) { res.writeHead(404); return res.end("nie ma"); }
      res.writeHead(r.status || 200, { "Content-Type": "text/html; charset=utf-8" }); res.end(r.body ?? "");
    }).listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${srv.address().port}`, hits, close: () => srv.close() }));
  });
}
const run = (env) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(root, "server/alarm-sync.mjs")], { env: { ...process.env, ALARM_PAUSE_MS: "0", ...env } });
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  p.on("close", (code) => resolve({ code, out }));
});
const tmp = () => mkdtempSync(path.join(tmpdir(), "alarm-"));
const SEED_PATH = "/web/rcb/przedluzenie-obowiazywania-stopni-alarmowych-do-30-listopada-2026-r";
const NEWER = `<h1>Wprowadzenie stopnia alarmowego (od 1 grudnia 2026 r.)</h1><p>04.11.2026</p><p>Prezes Rady Ministrów na podstawie art. 16 ust. 1 pkt 1 ustawy z dnia 10 czerwca 2016 roku o działaniach antyterrorystycznych (Dz. U. z 2025 r. poz. 194) podpisał zarządzenia: nr 60 z dnia 3 listopada 2026 roku w sprawie wprowadzenia trzeciego stopnia alarmowego (stopień CHARLIE) na całym terytorium Rzeczypospolitej Polskiej, obowiązuje od dnia 1 grudnia 2026 r., od godz. 00.00, do dnia 28 lutego 2027 r., do godz. 23.59.</p>`;

await t("kolektor: czyta komunikat i nowy komunikat z listy, scala i zapisuje plik z polem at", async () => {
  const site = await fakeSite({
    "/robots.txt": { body: "User-agent: *\nDisallow: /admin/\n" },
    "/web/rcb": { body: `<a href="/web/rcb/wprowadzenie-stopnia-alarmowego-od-1-grudnia-2026-r">x</a><a href="/web/rcb/raport-dobowy3">y</a>` },
    [SEED_PATH]: { body: PAGE },
    "/web/rcb/wprowadzenie-stopnia-alarmowego-od-1-grudnia-2026-r": { body: NEWER },
  });
  const dir = tmp(), out = path.join(dir, "alarm-levels.json");
  const r = await run({ ALARM_BASE: site.base, ALARM_OUT: out });
  site.close();
  assert.equal(r.code, 0, r.out);
  const j = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(j.items.map((x) => x.nr), [60, 50, 49, 48, 47]);
  assert.equal(j.items[0].level, "CHARLIE"); assert.equal(j.items[0].published, "2026-11-04"); assert.equal(j.items[0].until, "2027-02-28T23:59:00+01:00");
  assert.ok(Date.now() - Date.parse(j.at) < 60e3); assert.equal(j.basis.journal, "Dz. U. z 2025 r. poz. 194");
  assert.ok(!site.hits.includes("/web/rcb/raport-dobowy3"));
  assert.ok(normalizeAlarm(j, { now: Date.now() }));
});
await t("kolektor: komunikat, którego treści nie rozumie (np. odwołanie), trafia do notices zamiast zmieniać stopnie", async () => {
  const site = await fakeSite({
    "/robots.txt": { body: "" },
    "/web/rcb": { body: `<a href="/web/rcb/odwolanie-stopnia-alarmowego-bravo">x</a>` },
    [SEED_PATH]: { body: PAGE },
    "/web/rcb/odwolanie-stopnia-alarmowego-bravo": { body: `<h1>Odwołanie stopnia alarmowego BRAVO</h1><p>20.11.2026</p><p>Prezes Rady Ministrów odwołał stopień alarmowy.</p>` },
  });
  const out = path.join(tmp(), "alarm-levels.json");
  const r = await run({ ALARM_BASE: site.base, ALARM_OUT: out }); site.close();
  assert.equal(r.code, 0, r.out);
  const j = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(j.items.length, 4); assert.equal(j.notices.length, 1);
  assert.equal(j.notices[0].title, "Odwołanie stopnia alarmowego BRAVO"); assert.equal(j.notices[0].published, "2026-11-20");
  assert.match(j.notices[0].url, /odwolanie-stopnia-alarmowego-bravo$/);
});
await t("kolektor: serwer nie odpowiada (403/404) → kod 1, poprzedni plik bez zmian, pierwszy raz zapisuje tylko plik startowy", async () => {
  const site = await fakeSite({ "/robots.txt": { status: 403 }, [SEED_PATH]: { status: 403 }, "/web/rcb": { status: 403 } });
  const dir = tmp(), out = path.join(dir, "alarm-levels.json");
  const r1 = await run({ ALARM_BASE: site.base, ALARM_OUT: out });
  assert.equal(r1.code, 1, r1.out);
  const j1 = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(j1.items.length, 4); assert.equal(j1.at, "2026-10-19T12:00:00+02:00"); // znacznik z pliku startowego, nie „teraz”
  const before = readFileSync(out, "utf8");
  const r2 = await run({ ALARM_BASE: site.base, ALARM_OUT: out }); site.close();
  assert.equal(r2.code, 1, r2.out); assert.equal(readFileSync(out, "utf8"), before);
});
await t("kolektor: robots.txt zabrania /web/rcb/ → nic nie pobiera", async () => {
  const site = await fakeSite({ "/robots.txt": { body: "User-agent: *\nDisallow: /web/rcb/\n" }, [SEED_PATH]: { body: PAGE } });
  const out = path.join(tmp(), "alarm-levels.json");
  const r = await run({ ALARM_BASE: site.base, ALARM_OUT: out }); site.close();
  assert.equal(r.code, 1, r.out); assert.ok(!site.hits.includes(SEED_PATH));
});
await t("kolektor: strona bez zarządzeń (zmieniony układ) nie psuje poprzedniego pliku", async () => {
  const site = await fakeSite({ "/robots.txt": { body: "" }, [SEED_PATH]: { body: "<h1>Inny układ strony</h1><p>Brak treści.</p>" }, "/web/rcb": { status: 404 } });
  const out = path.join(tmp(), "alarm-levels.json");
  writeFileSync(out, JSON.stringify(file({ at: "2026-10-18T10:00:00Z" })));
  const r = await run({ ALARM_BASE: site.base, ALARM_OUT: out }); site.close();
  assert.equal(r.code, 1, r.out); assert.equal(JSON.parse(readFileSync(out, "utf8")).at, "2026-10-18T10:00:00Z");
});

// ---------- podpięcie do aplikacji i serwera ----------
await t("podpięcie: menu Więcej i boczne, trasa, sw.js, config, run.sh, publish.sh, strażnik, wersja", () => {
  const app = src("js/app.js"), sw = src("sw.js");
  assert.match(app, /h: "#\/alarmowe", t: "Stopnie alarmowe"/); assert.match(app, /h: "#\/alarmowe", k: "alarmowe"/); assert.match(app, /case "alarmowe": inner = screenAlarmowe\(\)/); assert.match(app, /alarmowe: "wiecej"/);
  assert.match(sw, /js\/alarm\.js/); assert.match(sw, /js\/alarm-table\.js/);
  assert.match(src("js/config.js"), /alarmUrl: "https:\/\/raw\.githubusercontent\.com\/lewym90\/egida\/data\/alarm-levels\.json"/);
  assert.match(src("server/run.sh"), /node alarm-sync\.mjs/); assert.match(src("server/publish.sh"), /git add alarm-levels\.json/);
  assert.match(src("server/watchdog.mjs"), /"alarm-levels\.json": 30/); assert.match(src("server/watchdog.mjs"), /"water\.json", "alarm-levels\.json"/);
  assert.match(src("js/version.js"), /APP_VERSION = "v47"/); assert.match(sw, /const VERSION = "egida-v47"/);
});
await t("nazwy: bez pseudonimu autora w nowych plikach", () => {
  for (const f of ["js/alarm.js", "js/alarm-table.js", "server/alarm-lib.mjs", "server/alarm-sync.mjs", "server/alarm-seed.json"]) assert.ok(!/lewym90\/(?!egida)/.test(src(f)), f);
});
console.log(`test-v47: ${n} testów OK`);
