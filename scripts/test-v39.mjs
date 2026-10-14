// v39: kolorowe ikony, Moja apteczka (terminy), kopia danych, powietrze GIOŚ, przewodniki, tryb seniora, baner nowej wersji.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { normalizeKit, kitStatus, kitDays, kitDue, kitSorted, exportState, importState, todayYmd } from "../js/personal.js";
import { normalizeAir, nearestStation, distKm, AIR_NAMES, AIR_ADVICE, AIR_TONE } from "../js/air.js";
import { C } from "../js/icons.js";
import { BEZPRADU, HYBRYDOWE, SOURCES, FIRST_AID } from "../js/content.js";
import { levelOf, parseStations, parseIndex } from "../server/air-lib.mjs";

let n = 0; const t = (name, fn) => { fn(); n++; console.log("  ok " + name); };
const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

t("Moja apteczka: czyszczenie, limity i niepoprawne daty", () => {
  const k = normalizeKit([{ name: "  Paracetamol ", expires: "2027-02-30" }, { name: "Plastry", expires: "2027-03-01", note: "x".repeat(300) }, { name: "" }, null, 5]);
  assert.equal(k.length, 2); assert.equal(k[0].expires, ""); assert.equal(k[1].expires, "2027-03-01"); assert.equal(k[1].note.length, 120); assert.equal(k[0].name, "Paracetamol");
  assert.equal(normalizeKit(Array.from({ length: 200 }, (_, i) => ({ name: "a" + i }))).length, 60);
  assert.deepEqual(normalizeKit("x"), []);
});
t("terminy: po terminie / wkrótce / ważne / bez terminu", () => {
  const today = "2026-10-14";
  assert.equal(kitDays("2026-10-14", today), 0); assert.equal(kitDays("2026-10-13", today), -1); assert.equal(kitDays("2026-11-13", today), 30); assert.equal(kitDays("", today), null);
  assert.equal(kitStatus({ expires: "2026-10-13" }, today), "expired"); assert.equal(kitStatus({ expires: "2026-10-14" }, today), "soon");
  assert.equal(kitStatus({ expires: "2026-11-13" }, today), "soon"); assert.equal(kitStatus({ expires: "2026-11-14" }, today), "ok"); assert.equal(kitStatus({ expires: "" }, today), "none");
  const due = kitDue([{ name: "A", expires: "2027-05-01" }, { name: "B", expires: "2026-10-20" }, { name: "C", expires: "2026-09-01" }, { name: "D" }], today);
  assert.deepEqual(due.map((x) => x.name), ["C", "B"]);
  assert.deepEqual(kitSorted([{ name: "Z" }, { name: "B", expires: "2027-01-01" }, { name: "A", expires: "2026-01-01" }]).map((x) => x.name), ["A", "B", "Z"]);
  assert.match(todayYmd(new Date(2026, 9, 4)), /^2026-10-04$/);
});
t("kopia danych: eksport zawiera dane użytkownika, import je przywraca i czyści", () => {
  const st = { onboarded: true, region: "lodzkie", myKit: [{ name: "Plastry", expires: "2027-03-01" }], senior: true, fs: "large", lastBackup: "2026-01-01", offline: { big: 1 }, mig: {}, installDismissed: "x" };
  const ex = exportState(st, new Date("2026-10-14T10:00:00Z"));
  assert.equal(ex.egida, 1); assert.equal(ex.exportedAt, "2026-10-14T10:00:00.000Z"); assert.ok(!("offline" in ex) && !("mig" in ex) && !("lastBackup" in ex) && !("installDismissed" in ex));
  const back = importState(JSON.parse(JSON.stringify(ex)), { validRegions: ["lodzkie"] });
  assert.ok(back.ok); assert.equal(back.state.myKit.length, 1); assert.equal(back.state.senior, true); assert.equal(back.state.region, "lodzkie"); assert.equal(back.state.fs, "large");
  const evil = importState({ myKit: [{ name: "<img onerror=1>", expires: "zły" }], senior: "tak" }, {});
  assert.ok(evil.ok); assert.equal(evil.state.myKit[0].expires, ""); assert.ok(!("senior" in evil.state));
  assert.equal(importState({ cokolwiek: 1 }, {}).ok, false);
});
t("powietrze: parsowanie GIOŚ, poziomy, najbliższa stacja, przeterminowane dane", () => {
  assert.equal(levelOf("Bardzo dobry"), 0); assert.equal(levelOf(" zły "), 4); assert.equal(levelOf("Bardzo zły"), 5); assert.equal(levelOf("?"), null);
  const st = parseStations({ "Lista stacji pomiarowych": [{ "Identyfikator stacji": 114, "Nazwa stacji": "Wrocław - Bartnicza", "WGS84 φ N": "51.115933", "WGS84 λ E": "17.141125" }, { "Identyfikator stacji": 2, "WGS84 φ N": "0", "WGS84 λ E": "0" }, {}] });
  assert.equal(st.length, 1); assert.equal(st[0].id, 114);
  const st2 = parseStations({ "Lista stacji pomiarowych": [{ "Identyfikator stacji": 11, "Nazwa stacji": "Czerniawa", "WGS84 \u03d5 N": "50.912475", "WGS84 \u03bb E": "15.312190" }] }); assert.equal(st2.length, 1, "oba warianty greckiej litery");
  assert.match(readFileSync(new URL("../server/air-sync.mjs", import.meta.url), "utf8"), /Accept: "\*\/\*"/); assert.equal(st[0].lat, 51.1159);
  assert.deepEqual(parseIndex({ AqIndex: { "Nazwa kategorii indeksu": "Dobry", "Data wykonania obliczeń indeksu": "2026-10-14 10:30:00" } }), { idx: 1, at: "2026-10-14 10:30:00", p: null });
  assert.equal(parseIndex({ AqIndex: { "Nazwa kategorii indeksu": null } }), null); assert.equal(parseIndex(null), null);
  const now = Date.parse("2026-10-14T12:00:00Z");
  const raw = { updated: "2026-10-14T11:00:00Z", stations: [{ id: 1, n: "A", la: 51.11, lo: 17.14, i: 2 }, { id: 2, n: "B", la: 52.23, lo: 21.01, i: 4 }, { id: 3, n: "zła", la: 1, lo: 1, i: 9 }] };
  const air = normalizeAir(raw, { now }); assert.equal(air.stations.length, 2);
  assert.equal(normalizeAir({ ...raw, updated: "2026-10-13T00:00:00Z" }, { now }), null); assert.equal(normalizeAir({}, { now }), null);
  assert.equal(nearestStation(air, 51.1, 17.03).id, 1); assert.equal(nearestStation(air, 54.4, 18.6, 40), null);
  assert.ok(distKm(52.23, 21.01, 50.06, 19.94) > 240 && distKm(52.23, 21.01, 50.06, 19.94) < 260);
  assert.equal(AIR_NAMES.length, 6); assert.equal(AIR_ADVICE.length, 6); assert.equal(AIR_TONE.length, 6);
});
t("ikony: komplet, kolorowe i bezpieczne (bez skryptów)", () => {
  for (const k of ["home", "bell", "map", "shield", "book", "more", "drop", "heart", "kit", "bag", "users", "list", "test", "pin", "warn", "danger", "news", "tg", "gear", "bolt", "hybrid", "senior", "air", "backup", "refresh", "phone"]) {
    assert.ok(C[k] && C[k].startsWith("<svg") && C[k].endsWith("</svg>"), k); assert.match(C[k], /#[0-9A-Fa-f]{6}/, k + " ma kolory"); assert.ok(!/<script|onload|href=/i.test(C[k]), k);
  }
});
t("przewodniki: Bez prądu i Zagrożenia hybrydowe mają treść, źródło „opracowanie własne EGIDA” i działające linki", () => {
  for (const [d, nTabs] of [[BEZPRADU, 7], [HYBRYDOWE, 6]]) {
    assert.equal(d.tabs.length, nTabs); assert.match(d.source, /opracowanie własne EGIDA/i); assert.match(d.reviewed, /^2026-/);
    for (const tab of d.tabs) { assert.ok(tab.blocks.length >= 3, tab.id); for (const b of tab.blocks) { assert.ok(b.h && (b.p || b.items?.length), b.h); for (const x of b.items || []) assert.ok(x.length >= 8 && x.length < 700, x.slice(0, 40)); if (b.link) assert.match(b.link.h, /^#\/[a-z-]+(\/[\w-]+)?$/); } }
  }
});
t("aplikacja: trasy, menu, ikony kolorowe, kafelek Pierwsza pomoc, krwotok, tryb seniora, baner", () => {
  for (const r of ["bez-pradu", "hybrydowe", "moja-apteczka"]) { assert.match(app, new RegExp(`case "${r}":`)); assert.match(app, new RegExp(`h: "#/${r}"`)); assert.match(app, new RegExp(`"${r}"[:,]|${r.replace("-", "")}:`)); }
  assert.match(app, /import \{ C \} from "\.\/icons\.js"/); assert.match(app, /h: "#\/pulpit", k: "pulpit", t: "Pulpit", i: C\.home/);
  assert.match(app, /aidHero\(\)/); assert.ok(!/aidq/.test(app), "kafelek Pierwsza pomoc bez przycisków Krwotok/RKO"); assert.match(app, /krwotok: C\.drop/); assert.ok(!/zawal: C/.test(app), "zawał bez ikony");
  assert.match(app, /state\.senior/); assert.match(app, /setSenior/); assert.match(app, /sen112/); assert.match(app, /dataset\.senior/);
  assert.match(app, /updBar/); assert.match(app, /controllerchange/); assert.match(app, /id="updNow"/);
  assert.match(app, /exportBackup/); assert.match(app, /navigator\.share/); assert.match(app, /id="kitForm"/); assert.match(app, /airCardHtml\(\)/);
  assert.ok(!/id="exportData">Pobierz/.test(app), "przycisk nazywa się „Zapisz kopię”");
});
t("układ: dolny pasek bez zmiany geometrii, baner nie jest fixed, senior nie rusza paska", () => {
  assert.match(css, /\.tabbar\{position:fixed;left:0;right:0;bottom:0;[^}]*grid-template-columns:repeat\(6,1fr\);padding:4px 2px max\(6px,calc\(env\(safe-area-inset-bottom\) - 16px\)\)/);
  assert.match(css, /\.tabbar a\{font-size:\.7rem\}/); assert.match(css, /min-height:48px/);
  const upd = css.match(/\.updbar\{[^}]*\}/)[0]; assert.ok(!/fixed|sticky/.test(upd));
  assert.match(css, /:root\[data-senior="1"\] \.tabbar a\{font-size:\.6rem\}/);
});
t("Pierwsza pomoc: rytm bez napisów, pętla audio, bloki RKO i Krwotoki, 112 po zatamowaniu", () => {
  assert.ok(!/UCISKAJ|PUŚĆ CAŁKOWICIE|id="phase"/.test(app), "bez napisów Uciskaj/Puść");
  assert.match(app, /loop = true/); assert.match(app, /audioSession/); assert.match(app, /Resuscytacja krążeniowo-oddechowa/); assert.match(app, /<h3 class="grp">Krwotoki<\/h3>/);
  const sec = app.slice(app.indexOf("function screenPierwszaPomoc"), app.indexOf('let plecakTab'));
  assert.ok(sec.indexOf('class="rko"') < sec.indexOf("${cpr}") && sec.indexOf("${cpr}") < sec.indexOf("${bleed}") && sec.indexOf("${bleed}") < sec.indexOf("${others}"));
  for (const id of ["krwotok", "rana-klatki"]) { const o = FIRST_AID.others.find((x) => x.id === id); assert.ok(!/112/.test(o.steps[0]), id + ": pierwszy krok nie jest telefonem"); assert.ok(o.steps.some((x) => /112/.test(x)), id + " nadal mówi o 112"); }
  assert.ok(FIRST_AID.others.find((x) => x.id === "rko-dziecko").steps.length >= 4);
});
t("serwer: nagłówek User-Agent w air-sync jest czystym ASCII (znaki spoza Latin-1 wywalają fetch)", () => { const src = readFileSync(new URL("../server/air-sync.mjs", import.meta.url), "utf8"); const ua = /const UA = "([^"]+)"/.exec(src)[1]; assert.ok(/^[\x20-\x7e]+$/.test(ua), ua); });
t("źródła: GIOŚ jest wymieniony w Źródłach i licencjach", () => { assert.ok(SOURCES.some((x) => /GIOŚ/.test(x.n) && /^https:/.test(x.u))); });
t("serwis: nowe pliki w SHELL, wersja v40, serwer publikuje air.json", () => {
  for (const f of readdirSync(new URL("../js", import.meta.url)).filter((x) => x.endsWith(".js"))) assert.ok(sw.includes(`"js/${f}"`), f + " w SHELL");
  assert.match(sw, /egida-v43/);
  assert.match(readFileSync(new URL("../server/publish.sh", import.meta.url), "utf8"), /git add air\.json/);
  assert.match(readFileSync(new URL("../server/run.sh", import.meta.url), "utf8"), /air-sync\.mjs/);
  assert.match(readFileSync(new URL("../js/config.js", import.meta.url), "utf8"), /airUrl: "https:\/\/raw\.githubusercontent\.com\/lewym90\/egida\/data\/air\.json"/);
});
console.log(`test-v39: OK (${n} grup)`);
