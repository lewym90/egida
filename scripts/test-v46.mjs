// Testy paczki v46: kalkulator zapasów, kopia danych z zapasami, reguły dla komunikatów lotniczych, strażnik (NEPTUN, szpitale).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeSupply, supplyNeeds, SUPPLY_DAYS, WATER_L_PER_DAY, exportState, importState } from "../js/personal.js";
import { passesMedia } from "../server/news-lib.mjs";
import { isAirDefence } from "../server/tg-news-lib.mjs";
import { isAirIncident, pinAirIncidents, newsForRegion, PIN_H } from "../js/news.js";
import { evaluate, LIMITS } from "../server/watchdog.mjs";
const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("BŁĄD:", name, "\n", e.message); process.exit(1); } };

t("zapasy: woda wg Poradnika = 3 l na osobę na dobę (4 osoby, 3 dni = 36 l)", () => {
  assert.equal(WATER_L_PER_DAY, 3);
  const x = supplyNeeds({ adults: 2, kids: 2, days: 3 });
  assert.equal(x.waterL, 36); assert.equal(x.bottles, 24); assert.equal(x.backpacks, 4); assert.equal(x.kcal, 12000);
});
t("zapasy: 7 i 14 dni liczą te same stawki, jedzenie tylko dla dorosłych", () => {
  assert.equal(supplyNeeds({ adults: 1, kids: 0, days: 7 }).waterL, 21);
  assert.equal(supplyNeeds({ adults: 0, kids: 2, days: 14 }).kcal, 0);
  assert.deepEqual(SUPPLY_DAYS, [3, 7, 14]);
});
t("zapasy: dane są czyszczone (zła liczba dni, tekst, wartości spoza zakresu)", () => {
  assert.deepEqual(normalizeSupply({ adults: "x", kids: 99, days: 5 }), { adults: 2, kids: 20, days: 3 });
  assert.deepEqual(normalizeSupply({ adults: -4, kids: 1.6, days: "7" }), { adults: 0, kids: 2, days: 7 });
  assert.deepEqual(normalizeSupply(null), { adults: 2, kids: 0, days: 3 });
  assert.equal(supplyNeeds({ adults: 0, kids: 0 }).waterL, 0);
});
t("zapasy: kopia danych zapisuje i przywraca kalkulator, a śmieci odrzuca", () => {
  const ex = exportState({ onboarded: true, supply: { adults: 3, kids: 1, days: 7 } });
  const back = importState(JSON.parse(JSON.stringify(ex)), { validRegions: [] });
  assert.ok(back.ok); assert.deepEqual(back.state.supply, { adults: 3, kids: 1, days: 7 });
  assert.deepEqual(importState({ onboarded: true, supply: { adults: "<script>", kids: 500, days: 1 } }).state.supply, { adults: 2, kids: 20, days: 3 });
});
t("zapasy: ekran Plecak ma kalkulator w zakładce Zapas domowy i obsługę przycisków", () => {
  const app = src("js/app.js");
  assert.match(app, /function supplyCalcHtml/); assert.match(app, /Zapas domowy na min\. 3 dni<\/h2>\$\{supplyCalcHtml\(\)\}/);
  assert.match(app, /button\[data-sup\]/); assert.match(app, /supply: \{ adults: 2, kids: 0, days: 3 \}/);
  assert.match(app, /Poradnik[^"]*bezpiecze/);
});
t("lotnictwo: poderwane myśliwce i zamknięte lotniska przechodzą filtr mediów, myśliwy nie", () => {
  for (const x of ["Polska poderwała myśliwce po atakach Rosji na Ukrainę", "Lotniska w Lublinie i Rzeszowie zamknięte", "Dowództwo Operacyjne: wzmożona aktywność lotnictwa"]) assert.ok(passesMedia(x), x);
  assert.equal(isAirDefence("Polska poderwała myśliwce"), true); assert.equal(isAirDefence("Myśliwy postrzelił psa w lesie"), false);
});
t("incydent 18.10: artykuły o podejrzeniu naruszenia przestrzeni powietrznej przechodzą filtr we wszystkich odmianach", () => {
  for (const x of ["Podejrzenie naruszenia przestrzeni powietrznej. Żołnierze i policjanci prowadzą poszukiwania pod Lublinem", "Niezidentyfikowany obiekt mógł naruszyć polską przestrzeń powietrzną. Komunikat wojska", "Wojsko sprawdza zarejestrowany sygnał radiolokacyjny na południe od Lublina", "Niezidentyfikowany obiekt nad Lubelszczyzną. Trwają poszukiwania"]) assert.ok(passesMedia(x), x);
  assert.ok(!passesMedia("Koncert w filharmonii. Naruszenie rytmu w przestrzeni sali"), "kultura nadal odrzucana");
});
t("incydent 18.10: isAirIncident łapie zdarzenia w powietrzu, a nie rutynowe poderwanie myśliwców ani poszukiwania zaginionych", () => {
  for (const x of ["Podejrzenie naruszenia przestrzeni powietrznej. Żołnierze i policjanci prowadzą poszukiwania pod Lublinem", "Niezidentyfikowany obiekt mógł naruszyć polską przestrzeń powietrzną", "Wojsko szuka obiektu pod Lublinem. Mieszkańcy słyszeli głośny przelot", "Żołnierze WOT poszukują szczątków drona pod Chełmem"]) assert.equal(isAirIncident(x), true, x);
  for (const x of ["Rosyjski atak w Ukrainie. Polska poderwała samoloty", "Żołnierze WOT poszukują zaginionej kobiety", "Policja poszukuje sprawcy napadu", "Naruszenie zakazu parkowania w centrum"]) assert.equal(isAirIncident(x), false, x);
  for (const x of ["Rosyjski atak w Ukrainie. Polska poderwała samoloty", "Podejrzenie naruszenia przestrzeni powietrznej pod Lublinem"]) assert.equal(isAirDefence(x), true, x);
});
t("Pulpit: komunikat o zdarzeniu w powietrzu jest na górze, ale tylko przez PIN_H godzin", () => {
  const NOW = Date.parse("2026-10-18T07:50:00Z"), ago = (h) => new Date(NOW - h * 36e5).toISOString();
  const mk = (id, title, h, region = "lubelskie") => ({ id, title, summary: "", url: "https://example.com/" + id, date: ago(h), source: "Test", region, kind: "media" });
  const feed = { generatedAt: ago(0), items: [mk("a", "Rodziny ćwiczyły reakcje na zagrożenia. Trening w 118 punktach", 0.6), mk("b", "Zupełnie inna sprawa lokalna z drogi", 1), mk("c", "Niezidentyfikowany obiekt mógł naruszyć polską przestrzeń powietrzną. Komunikat wojska", 3.5), mk("d", "Kolejny wpis lokalny o remoncie szkoły", 4), mk("e", "Stare: podejrzenie naruszenia przestrzeni powietrznej", PIN_H + 2), mk("f", "Ostrzeżenie dla innego województwa: niezidentyfikowany obiekt", 1, "mazowieckie")] };
  const l = newsForRegion(feed, "lubelskie", { max: 5, now: NOW });
  assert.equal(l[0].id, "c"); assert.equal(l[0].pin, true); assert.equal(l.findIndex((x) => x.id === "e") > 0, true, "stary wpis nie jest przypięty");
  assert.ok(!l.some((x) => x.id === "f"), "inne województwo");
  assert.equal(pinAirIncidents([mk("z", "Wpis lokalny o remoncie", 1)], NOW)[0].pin, undefined);
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8"); assert.match(app, /badge pin/);
});
t("strażnik: szpitale mają własny limit, NEPTUN jest pilnowany tylko, gdy obserwator zostawia znacznik", () => {
  assert.equal(LIMITS.fileH["hospitals.json"], 200); assert.equal(LIMITS.dailyH, 48);
  assert.equal(evaluate({ pushAgeMin: 1, remoteAgeMin: 1, dailyAgesH: { "hospitals.json": 100 } }).problem, false);
  assert.equal(evaluate({ pushAgeMin: 1, remoteAgeMin: 1, dailyAgesH: { "aed.json": 100 } }).problem, true);
  assert.equal(evaluate({ pushAgeMin: 1, remoteAgeMin: 1, neptunAgeMin: LIMITS.neptunMin + 1 }).problem, true);
  assert.equal(evaluate({ pushAgeMin: 1, remoteAgeMin: 1 }).problem, false);
  assert.match(src("server/neptun-watch.mjs"), /neptun-health\.json/); assert.match(src("server/run-neptun-watch.sh"), /NEPTUN_HEALTH/);
});
console.log(`test-v46: OK (${n} grup)`);
