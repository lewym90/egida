// Testy dodane w v14: wersje i powłoka SW, granice województw, plan rodziny / ICE / „Jestem bezpieczny”, ważne miejsca, import kopii, treści.
// Uruchamianie: node scripts/test-v14.mjs (Node ≥ 20). Dane w testach są SZTUCZNE.
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { loadRegions, regionAt, nearBorder } from "../js/regions.js";
import { APP_VERSION } from "../js/version.js";
import { VOIVODESHIPS, SOURCES, EMERGENCY, WHAT_TO_DO, PRIVACY } from "../js/content.js";
import * as P from "../js/personal.js";

let n = 0;
const ok = (name, fn) => { try { fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };
const okA = async (name, fn) => { try { await fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };
const root = new URL("../", import.meta.url);

/* ---------- wersja i powłoka service workera ---------- */
ok("wersja w sw.js zgadza się z js/version.js", () => {
  const sw = readFileSync(new URL("sw.js", root), "utf8");
  assert.match(sw, new RegExp(`const VERSION = "egida-${APP_VERSION}";`));
});
ok("każdy plik z listy SHELL istnieje (inaczej instalacja SW się wywróci)", () => {
  const sw = readFileSync(new URL("sw.js", root), "utf8");
  const block = sw.slice(sw.indexOf("const SHELL = ["), sw.indexOf("];", sw.indexOf("const SHELL = [")));
  const files = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(files.length > 30);
  for (const f of files) if (f !== "./") assert.ok(existsSync(new URL(f, root)), "brak pliku: " + f);
});
ok("każdy moduł js/*.js (poza vendor) jest w SHELL, żeby działał offline", () => {
  const sw = readFileSync(new URL("sw.js", root), "utf8");
  for (const f of readdirSync(new URL("js/", root)).filter((x) => x.endsWith(".js"))) assert.ok(sw.includes(`"js/${f}"`), "brak w SHELL: js/" + f);
});

/* ---------- granice województw ---------- */
const R = await loadRegions();
const CITIES = [
  ["Warszawa", 52.2297, 21.0122, "mazowieckie"], ["Kraków", 50.0647, 19.945, "malopolskie"], ["Lublin", 51.2465, 22.5684, "lubelskie"], ["Wrocław", 51.1079, 17.0385, "dolnoslaskie"],
  ["Gdańsk", 54.352, 18.6466, "pomorskie"], ["Szczecin", 53.4285, 14.5528, "zachodniopomorskie"], ["Poznań", 52.4064, 16.9252, "wielkopolskie"], ["Łódź", 51.7592, 19.456, "lodzkie"],
  ["Katowice", 50.2649, 19.0238, "slaskie"], ["Białystok", 53.1325, 23.1688, "podlaskie"], ["Olsztyn", 53.7784, 20.4801, "warminsko-mazurskie"], ["Rzeszów", 50.0412, 21.9991, "podkarpackie"],
  ["Kielce", 50.8661, 20.6286, "swietokrzyskie"], ["Opole", 50.6751, 17.9213, "opolskie"], ["Bydgoszcz", 53.1235, 18.0084, "kujawsko-pomorskie"], ["Zielona Góra", 51.9356, 15.5062, "lubuskie"],
  ["Zawiercie", 50.4866, 19.4119, "slaskie"], ["Olkusz", 50.2813, 19.5667, "malopolskie"], ["Oświęcim", 50.0344, 19.2098, "malopolskie"], ["Sandomierz", 50.6826, 21.7492, "swietokrzyskie"],
  ["Puławy", 51.4166, 21.9697, "lubelskie"], ["Łuków", 51.9274, 22.382, "lubelskie"], ["Skierniewice", 51.9545, 20.1583, "lodzkie"], ["Leszno", 51.8403, 16.5749, "wielkopolskie"],
  ["Elbląg", 54.1522, 19.4088, "warminsko-mazurskie"], ["Częstochowa", 50.7964, 19.1203, "slaskie"], ["Radom", 51.4027, 21.1471, "mazowieckie"], ["Przemyśl", 49.7838, 22.7678, "podkarpackie"],
];
ok("granice: 28 miast przypisanych do właściwego województwa", () => { for (const [nm, la, lo, id] of CITIES) assert.equal(regionAt(la, lo, R)?.id, id, nm); });
ok("granice: id z danych to dokładnie 16 znanych województw", () => assert.deepEqual(Object.keys(R).sort(), VOIVODESHIPS.map((v) => v.id).sort()));
ok("granice: poza Polską (Lwów, Berlin, Praga) = null", () => { for (const [la, lo] of [[49.84, 24.03], [52.52, 13.4], [50.08, 14.43]]) assert.equal(regionAt(la, lo, R), null); });
ok("granice: tuż przy granicy województw jest sąsiad i ostrzeżenie", () => {
  const o = regionAt(50.2813, 19.5667, R); assert.equal(o.neighbor, "slaskie"); assert.ok(nearBorder(o, 10)); assert.ok(!nearBorder(regionAt(52.2297, 21.0122, R)));
  assert.ok(nearBorder(regionAt(54.65, 18.8, R)), "morze tuż przy brzegu to „przy granicy”");
});
ok("granice: wydajność (52 zapytania < 1 s)", () => { const t = performance.now(); for (let i = 0; i < 2; i++) for (const [, la, lo] of CITIES) regionAt(la, lo, R); assert.ok(performance.now() - t < 1000); });

/* ---------- pomocnicze: telefony, czyszczenie ---------- */
ok("telHref / cleanPhone", () => {
  assert.equal(P.telHref("600 100 200"), "tel:600100200"); assert.equal(P.telHref("+48 (600) 100-200"), "tel:+48600100200"); assert.equal(P.telHref("112"), "tel:112");
  assert.equal(P.telHref("abc"), ""); assert.equal(P.telHref("12"), ""); assert.equal(P.telHref("javascript:alert(1)"), "");
  assert.equal(P.cleanPhone("+48 600<script>"), "+48 600"); assert.equal(P.cleanPhone("1".repeat(40)).length, 20);
});
ok("clean: znaki sterujące, długość; cleanMulti zostawia nowe wiersze", () => {
  assert.equal(P.clean("  a\u0000b\n\nc  ", 10), "a b c"); assert.equal(P.clean("x".repeat(500), 20).length, 20); assert.equal(P.clean(123), "");
  assert.equal(P.cleanMulti("a\n\n\n\nb\u0007", 50), "a\n\nb");
});

/* ---------- plan rodziny i karty ICE ---------- */
ok("addContact: walidacja, limit, zapis", () => {
  const plan = P.emptyPlan();
  assert.equal(P.addContact(plan, { name: "", phone: "600100200" }).ok, false);
  assert.equal(P.addContact(plan, { name: "Mama", phone: "xx" }).ok, false);
  assert.equal(plan.contacts.length, 0);
  const r = P.addContact(plan, { name: "Mama", phone: "600 100 200", role: "mama" }); assert.ok(r.ok); assert.equal(plan.contacts[0].phone, "600 100 200");
  for (let i = 1; i < P.LIMITS.contacts; i++) assert.ok(P.addContact(plan, { name: "K" + i, phone: "5001002" + (10 + i) }).ok);
  const over = P.addContact(plan, { name: "Za dużo", phone: "500100299" }); assert.equal(over.ok, false); assert.equal(plan.contacts.length, P.LIMITS.contacts);
});
ok("karty ICE: dodawanie, limit, edycja pól z oczyszczeniem, usuwanie", () => {
  const plan = P.emptyPlan();
  assert.equal(P.addPerson(plan, "  ").ok, false);
  const a = P.addPerson(plan, "Ania"); assert.ok(a.ok);
  const id = a.person.id;
  assert.ok(P.setPersonField(plan, id, "blood", "A Rh+")); assert.equal(plan.people[0].blood, "A Rh+");
  assert.ok(P.setPersonField(plan, id, "blood", "Z Rh+")); assert.equal(plan.people[0].blood, "", "nieznana grupa krwi jest odrzucana");
  assert.ok(P.setPersonField(plan, id, "year", "1985")); assert.equal(plan.people[0].year, "1985");
  assert.ok(P.setPersonField(plan, id, "year", "85")); assert.equal(plan.people[0].year, "");
  P.setPersonField(plan, id, "meds", "x".repeat(900)); assert.equal(plan.people[0].meds.length, 300);
  assert.equal(P.setPersonField(plan, id, "id", "hack"), false); assert.equal(plan.people[0].id, id);
  assert.equal(P.setPersonField(plan, "nie-ma", "name", "X"), false);
  assert.equal(P.personFilled(plan.people[0]), true);
  for (let i = 1; i < P.LIMITS.people; i++) assert.ok(P.addPerson(plan, "Osoba " + i).ok);
  assert.equal(P.addPerson(plan, "Siódma").ok, false);
  assert.ok(P.removeById(plan.people, id)); assert.equal(plan.people.length, P.LIMITS.people - 1); assert.equal(P.removeById(plan.people, id), false);
});
ok("normalizePlan: odrzuca śmieci, ucina długości, nie ufa kształtowi", () => {
  assert.deepEqual(P.normalizePlan(null), P.emptyPlan()); assert.deepEqual(P.normalizePlan("tekst"), P.emptyPlan());
  const p = P.normalizePlan({ meet1: "a".repeat(999), contacts: [{ name: "Ok", phone: "600100200" }, { name: "Zły numer", phone: "x" }, null, 5, { phone: "600100200" }], people: [{ name: "P", blood: "0 Rh+", year: "1999" }, { blood: "A Rh+" }, "x"], extra: "<img onerror=1>" });
  assert.equal(p.meet1.length, 160); assert.equal(p.contacts.length, 1); assert.equal(p.people.length, 1); assert.equal(p.people[0].blood, "0 Rh+"); assert.ok(!("extra" in p));
  const again = P.normalizePlan(p); assert.deepEqual(again, p, "normalizacja jest idempotentna (stabilne id)");
});

/* ---------- „Jestem bezpieczny” ---------- */
ok("buildSafeMessage: tekst, podpis, czas, pozycja tylko gdy podana", () => {
  const d = new Date("2026-10-10T16:30:00Z");
  const m = P.buildSafeMessage({ name: "Ania", date: d, tz: "Europe/Warsaw" });
  assert.match(m, /^Jestem bezpieczny\/a\. Ania\. \(10\.10, 18:30\)$/);
  assert.ok(!/openstreetmap/.test(m));
  const m2 = P.buildSafeMessage({ date: d, tz: "Europe/Warsaw", pos: { lat: 51.24651, lon: 22.56839 } });
  assert.ok(m2.includes("https://www.openstreetmap.org/?mlat=51.2465&mlon=22.5684#map=17/51.2465/22.5684"));
  assert.ok(!P.buildSafeMessage({ name: "<b>x</b>\n\n", date: d, tz: "UTC" }).includes("\n"), "podpis nie wprowadza nowych wierszy");
});
ok("smsHref / waHref kodują treść", () => {
  const t = "Jestem bezpieczny/a. Ania & Jan\nlink?a=b";
  assert.ok(P.smsHref(t).startsWith("sms:?&body=") && !P.smsHref(t).includes("\n") && P.smsHref(t).includes("%26"));
  assert.ok(P.waHref(t).startsWith("https://wa.me/?text="));
});

/* ---------- ważne miejsca ---------- */
ok("makePlace: walidacja, rodzaje, zaokrąglenie do ~11 m", () => {
  assert.equal(P.makePlace({ label: "Dom", name: "x", lat: undefined, lon: undefined }).ok, false);
  assert.equal(P.makePlace({ label: "Dom", name: "x", lat: 40.7, lon: -74 }).ok, false, "poza okolicą Polski");
  const r = P.makePlace({ label: "Praca", name: "  Biuro ", lat: 52.229712, lon: 21.012233, region: "mazowieckie" });
  assert.ok(r.ok); assert.equal(r.place.name, "Biuro"); assert.equal(r.place.lat, 52.2297); assert.equal(r.place.lon, 21.0122); assert.equal(r.place.label, "Praca");
  assert.equal(P.makePlace({ label: "Hack", lat: 52, lon: 21 }).place.label, "Inne");
  assert.equal(P.makePlace({ label: "Dom", name: "", lat: 52, lon: 21 }).place.name, "Dom");
});
ok("normalizePlaces: filtr, limit", () => {
  const raw = Array.from({ length: 30 }, (_, i) => ({ id: "p" + i, label: "Dom", name: "M" + i, lat: 52 + i / 100, lon: 21 }));
  raw.push({ lat: 1, lon: 1 }, null, "x");
  assert.equal(P.normalizePlaces(raw).length, P.LIMITS.places); assert.deepEqual(P.normalizePlaces("x"), []);
});

/* ---------- import kopii zapasowej ---------- */
ok("importState: odrzuca nie-obiekty i obce pliki", () => {
  for (const bad of [null, 5, "x", [], {}, { cos: 1 }]) assert.equal(P.importState(bad).ok, false);
});
ok("importState: czyści dane, nie włącza NEPTUN, ignoruje nieznane województwo", () => {
  const ids = VOIVODESHIPS.map((v) => v.id);
  const r = P.importState({ onboarded: true, region: "lodzkie", consent: { gps: true, neptun: true, counter: "tak" }, fs: "gigantyczny", contrast: "high",
    checked: { woda: true, "zły klucz!": true, leki: "tak" }, map: { base: "sat", layers: { shelters: true, neptun: true } },
    plan: { meet1: "pod blokiem", contacts: [{ name: "Mama", phone: "600100200" }] }, places: [{ label: "Dom", name: "Dom", lat: 51.7592, lon: 19.456 }, { lat: 0, lon: 0 }],
    shelters: [{ name: "Piwnica", lat: 51.76, lon: 19.45, how: "w dół" }, { name: "zły", lat: 99, lon: 0 }] }, { validRegions: ids });
  assert.ok(r.ok); const s = r.state;
  assert.equal(s.region, "lodzkie"); assert.equal(s.consent.gps, true); assert.equal(s.consent.neptun, true); assert.equal(s.consent.counter, false);
  assert.ok(!("fs" in s)); assert.equal(s.contrast, "high"); assert.deepEqual(s.checked, { woda: true });
  assert.equal(s.map.base, "sat"); assert.equal(s.map.layers.neptun, false, "warstwa NEPTUN nie włącza się sama po imporcie");
  assert.equal(s.plan.contacts.length, 1); assert.equal(s.places.length, 1); assert.equal(s.shelters.length, 1);
  assert.equal(P.importState({ onboarded: true, region: "narnia" }, { validRegions: ids }).state.region, undefined);
});
ok("importState: eksport → import zachowuje plan i miejsca", () => {
  const plan = P.emptyPlan(); P.addContact(plan, { name: "Tata", phone: "+48 500 100 200" }); P.addPerson(plan, "Jan"); P.setPersonField(plan, plan.people[0].id, "allergies", "orzechy");
  const places = [P.makePlace({ label: "Dom", lat: 52.2, lon: 21, region: "mazowieckie" }).place];
  const back = P.importState(JSON.parse(JSON.stringify({ onboarded: true, plan, places })), { validRegions: [] }).state;
  assert.deepEqual(back.plan, plan); assert.deepEqual(back.places, places);
});

/* ---------- treści ---------- */
ok("źródła: Rejestr PSP, GUGiK i Telegram są wymienione, nie ma już „tylko odsyłacza” do PSP", () => {
  const names = SOURCES.map((s) => s.n).join("|");
  assert.match(names, /Rejestr Punktów Schronienia/); assert.match(names, /Państwowy Rejestr Granic/); assert.match(names, /Telegram/);
  assert.ok(!SOURCES.some((s) => /Jej danych nie kopiujemy/.test(s.l)), "stary opis PSP został zastąpiony");
  for (const s of SOURCES) assert.ok(/^https:\/\//.test(s.u), "adres źródła: " + s.n);
});
ok("tryb zagrożenia: 3 kroki; „Co robić” ma nowe instrukcje z niepustymi krokami", () => {
  assert.equal(EMERGENCY.steps.length, 3);
  const ids = WHAT_TO_DO.items.map((x) => x.id);
  for (const id of ["alert-rcb", "powodz", "pozar", "brak-pradu", "burza", "syreny", "chemia", "terror"]) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length, "identyfikatory są unikalne");
  for (const it of WHAT_TO_DO.items) { assert.ok(it.t && it.d && it.steps.length >= 3, it.id); for (const st of it.steps) assert.ok(st.trim().length > 10, it.id); }
  assert.equal(EMERGENCY.reviewed, null, "treść robocza nie może udawać zatwierdzonej");
});
ok("polityka prywatności: sekcje i brak obietnic, których nie spełniamy", () => {
  const all = PRIVACY.sections.map((s) => s.h + " " + s.p.join(" ")).join(" ");
  assert.ok(PRIVACY.sections.length >= 7); assert.match(all, /GitHub/); assert.match(all, /Telegram/); assert.match(all, /NEPTUN/); assert.match(all, /EOX/);
  assert.ok(!/nie zbieramy żadnych danych/i.test(all), "nie twierdzimy, że nikt nigdy nie widzi IP");
  assert.equal(PRIVACY.reviewed, null);
});

console.log(`OK: ${n} grup testów v14 przeszło (wersja ${APP_VERSION})`);
