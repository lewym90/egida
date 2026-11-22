// Testy paczki v48: Alerty RCB o zagrożeniu z powietrza z gov.pl (obserwator, scalanie z komunikatami, ocena wagi, teksty aplikacji).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyOne, analyze, statusOf } from "../js/classify.js";
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log("  ok " + name); };

await t("waga: zagrożenie atakiem z powietrza = czerwone, atak na Ukrainie z monitorowaniem = żółte", () => {
  assert.equal(classifyOne({ type: "rcb", title: "Zagrożenie atakiem z powietrza", body: "Znajdź bezpieczne miejsce. Stosuj się do poleceń służb." }).sev, "danger");
  assert.equal(classifyOne({ type: "rcb", title: "Zagrożenie atakiem z powietrza", body: "Znajdź bezpieczne miejsce." }).kind, "atak");
  const mon = classifyOne({ type: "rcb", title: "Rosyjski atak powietrzny na Ukrainie", body: "Sytuacja jest monitorowana. Podniesiono gotowość Systemu Obrony Powietrznej RP." });
  assert.equal(mon.sev, "important"); assert.equal(mon.kind, "monitoring");
  const c = classifyOne({ type: "rcb", title: "Odwołano zagrożenie atakiem z powietrza", body: "Brak zagrożenia na terenie Polski." });
  assert.equal(c.cancel, true); assert.equal(c.airCancel, true);
});
await t("odwołanie kończy ostrzeżenie „monitorowane”, nie kończy powodzi 3. stopnia; odwołanie nie jest „tym samym wydarzeniem”", () => {
  const i = (id, o) => ({ id, voivodeship: "lubelskie", validTo: null, ...o });
  const l = analyze([
    i("m", { type: "rcb", title: "Rosyjski atak powietrzny na Ukrainie", body: "Sytuacja jest monitorowana. Lublin, Chełm, Zamość, Biłgoraj.", published: "2026-11-20T07:58:00Z", url: "https://www.gov.pl/web/rcb/a" }),
    i("c", { type: "rcb", title: "Zakończył się atak powietrzny na Ukrainę", body: "Brak zagrożenia. Lublin, Chełm, Zamość, Biłgoraj.", published: "2026-11-20T08:48:00Z", url: "https://www.gov.pl/web/rcb/a" }),
    i("f", { type: "woda", title: "Ostrzeżenie hydrologiczne 3. stopnia", body: "wezbranie, przekroczenie stanów alarmowych", published: "2026-11-20T06:00:00Z" }),
  ], Date.parse("2026-11-20T09:00:00Z"));
  assert.equal(l.find((a) => a.id === "m").active, false);
  assert.equal(l.find((a) => a.id === "f").active, true);
  assert.equal(l.find((a) => a.id === "c").relatedTo, undefined);
  assert.equal(statusOf(l.filter((a) => a.active)), "alarm"); // powódź 3. stopnia nadal czerwona
});
await t("poprawki po przeglądzie: „do odwołania alarmu” to nie odwołanie; odwołanie innej sprawy nie gasi alarmu z powietrza", () => {
  assert.equal(classifyOne({ type: "rcb", title: "Alert RCB", body: "Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce i pozostań w nim do odwołania alarmu." }).sev, "danger");
  assert.equal(classifyOne({ type: "rcb", title: "Alert RCB", body: "Zagrożenie z powietrza. Sytuacja jest monitorowana. Stosuj się do poleceń służb." }).sev, "danger");
  const l = analyze([
    { id: "a", type: "rcb", title: "Zagrożenie atakiem z powietrza", body: "Znajdź bezpieczne miejsce.", voivodeship: "lubelskie", published: "2026-11-20T05:30:00Z" },
    { id: "w", type: "rcb", title: "Alert RCB", body: "Odwołano ostrzeżenie o wodzie niezdatnej do picia w gminie X.", voivodeship: "lubelskie", published: "2026-11-20T06:00:00Z" },
  ], Date.parse("2026-11-20T06:05:00Z"));
  assert.equal(l.find((a) => a.id === "a").active, true);
});
await t("serwer: obserwator co minutę, scalanie w poll.mjs, natychmiastowa publikacja, strażnik", () => {
  assert.match(src("server/run-neptun-watch.sh"), /node rcb-watch\.mjs/);
  assert.match(src("server/run.sh"), /node rcb-watch\.mjs/);
  assert.match(src("server/run.sh"), /EGIDA_ALERTS_ONLY/);
  assert.match(src("server/run.sh"), /exec 8>&-/);
  assert.match(src("server/poll.mjs"), /RCB_GOV_FILE/);
  assert.match(src("server/rcb-watch.mjs"), /robotsAllows/);
  assert.match(src("server/rcb-watch.mjs"), /EGIDA_ALERTS_ONLY: "1"/);
  assert.match(src("server/watchdog.mjs"), /rcbMin: 20/);
  assert.match(src("server/run.sh"), /rcb-publish\.pending/); assert.match(src("server/poll.mjs"), /exitCode = 3/);
  assert.ok(src("server/run-neptun-watch.sh").indexOf("rcb-watch.mjs") < src("server/run-neptun-watch.sh").indexOf("neptun-watch.lock"), "RCB przed blokadą NEPTUN");
});
await t("aplikacja: źródło na Pulpicie i opisy wymieniają Alerty RCB z powietrza; wersja v48", () => {
  const app = src("js/app.js");
  assert.ok(!app.includes("· Źródło: RSO · ${when}"));
  assert.match(app, /zagrożenie atakiem z powietrza/);
  assert.match(src("js/content.js"), /Alerty RCB o zagrożeniu z powietrza/);
  assert.match(src("js/version.js"), /APP_VERSION = "v50"/); assert.match(src("sw.js"), /const VERSION = "egida-v50"/);
});
console.log(`test-v48: ${n} testów OK`);
