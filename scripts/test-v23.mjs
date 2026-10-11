// v23: doniesienia medialne z portali ogólnopolskich i regionalnych (Lublin112), PSP, szybki przebieg.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { mentionsRegion } from "../server/news-places.mjs";
import { toItem } from "../server/news-lib.mjs";
import { SOURCES } from "../server/news-sources.mjs";
let n = 0;
const ok = (name, fn) => { try { fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };
const NOW = Date.parse("2026-10-11T20:00:00Z");
const S = (id) => SOURCES.find((x) => x.id === id);
const mk = (src, title, cats = "") => toItem({ title, url: "https://x.pl/" + encodeURIComponent(title).slice(0, 40), date: "2026-10-11T18:00:00Z", summary: "tresc", cats }, S(src), NOW);

ok("portal krajowy: województwo z miejscowości w tytule, bez streszczenia", () => {
  const it = mk("media-tvn24", "Śmiertelny wypadek w Gdyni. Zginął motocyklista");
  assert.equal(it.region, "pomorskie"); assert.equal(it.kind, "media"); assert.equal(it.summary, ""); assert.equal(it.source, "TVN24");
});
ok("portal krajowy: zagrożenie krajowe bez miejsca → cały kraj", () => {
  assert.equal(mk("media-polsatnews", "Niepokojące informacje o zamachu na premiera Donalda Tuska").region, "all");
});
ok("portal krajowy: bez miejsca i bez zagrożenia krajowego odpada; zagranica i polityka też", () => {
  assert.equal(mk("media-rmf24", "Pożar magazynu. Strażacy walczą z ogniem"), null);
  assert.equal(mk("media-rmf24", "Zamach bombowy w Paryżu. Nie żyją ludzie"), null);
  assert.equal(mk("media-rmf24", "Wypadek autobusu w Berlinie"), null);
});
ok("Lublin112: wpis z Lublina → lubelskie; wiadomość z kraju odpada; zamach → cały kraj", () => {
  assert.equal(mk("media-lublin112", "Pożar mieszkania przy ulicy Willowej. Strażacy ewakuowali lokatorów", "Lublin, Wiadomości z Lublina").region, "lubelskie");
  assert.equal(mk("media-lublin112", "Pożar hali w Radomiu. Ewakuowano pracowników", "Kraj").region, "mazowieckie");
  assert.equal(mk("media-lublin112", "Wypadek na obwodnicy. Jedna osoba ranna", "Kraj"), null);
  assert.equal(mk("media-lublin112", "Zatrzymano mężczyznę, który planował zamach na Donalda Tuska. Groźby dotyczyły też szefa MON", "Kraj, zamach").region, "all");
});
ok("źródła: portale krajowe, Lublin112 i 16 komend PSP są na liście, wszystkie z jawnym adresem https", () => {
  for (const id of ["media-polsatnews", "media-tvn24", "media-rmf24", "media-radiozet", "media-interia", "media-tvpinfo", "media-polskieradio24", "media-info112", "media-lublin112"]) assert.ok(S(id), id);
  const psp = SOURCES.filter((x) => x.id.startsWith("kwpsp-")); assert.equal(psp.length, 16);
  for (const s of SOURCES) for (const u of s.urls || []) assert.ok(/^https:\/\//.test(u), s.id + " " + u);
  assert.equal(new Set(SOURCES.map((x) => x.id)).size, SOURCES.length);
});
ok("serwer: szybki przebieg --fast i harmonogram w run.sh", () => {
  const sync = readFileSync(new URL("../server/news-sync.mjs", import.meta.url), "utf8"), run = readFileSync(new URL("../server/run.sh", import.meta.url), "utf8");
  assert.ok(/--fast/.test(sync) && /FAST && !ranLabels/.test(sync));
  assert.ok(/news\.fast/.test(run) && /--fast/.test(run));
});
ok("gazetter: „walczą” i „z łodzi” nie są miejscowościami, Łódź i Wałcz nadal tak", () => {
    assert.ok(!mentionsRegion("Strażacy walczą z ogniem", "zachodniopomorskie"));
  assert.ok(!mentionsRegion("Uratowano rybaków z łodzi", "lodzkie"));
  assert.ok(mentionsRegion("Pożar w Łodzi", "lodzkie") && mentionsRegion("Wypadek w Wałczu", "zachodniopomorskie"));
});
console.log(`OK: ${n} grup testów v23 przeszło`);
