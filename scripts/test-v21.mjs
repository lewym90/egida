// v21: ta sama wiadomość nigdy nie pokazuje się dwa razy (komunikaty RSO i wiadomości z kilku źródeł).
import assert from "node:assert/strict";
import { storyTokens, sameStory, dedupeSimilar } from "../js/similar.js";
import { dedupeNews } from "../js/news.js";
import { mergeItems } from "../server/news-lib.mjs";
let n = 0;
const ok = (name, fn) => { try { fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };

const A = "Ćwiczenie Syrena „ĆWICZENIA: 12-16 października na terenie woj. mazowieckiego odbędzie się ćwiczenie Syrena-26 z wykorzystaniem syren alarmowych. Zachowaj spokój”.";
const B = "Ćwiczenia Syrena-26 Od 12 do 16 października 2026 r. na terenie województwa mazowieckiego odbywać się będą ćwiczenia pod kryptonimem Syrena-26. W związku z tym, uruchomiony zostanie system alarmowania oraz ostrzegania ludności w postaci syren alarmowych. W trakcie ćwiczenia emitowany będzie ciągły dźwięk syren alarmowych trwający 1 minutę.";
ok("dwa komunikaty o tym samym ćwiczeniu to ta sama sprawa", () => {
  assert.ok(sameStory(A, B, { share: 0.5, minTokens: 5 }));
});
ok("różne komunikaty nie są łączone", () => {
  const C = "Ostrzeżenie przed silnym wiatrem. W województwie mazowieckim od środy możliwe porywy wiatru do 80 km/h, połamane drzewa i przerwy w dostawie prądu.";
  assert.ok(!sameStory(A, C, { share: 0.5, minTokens: 5 }));
  const D = "Alert RCB ĆWICZENIA: jutro (12.10) w godz. 08:00-16:30 w pow. wałbrzyskim i Wałbrzychu odbędzie się trening systemu alarmowania z wykorzystaniem syren. Zachowaj spokój.";
  assert.ok(storyTokens(D).size > 5);
});
ok("wiadomości: ta sama sprawa z kilku źródeł pokazuje się raz, wygrywa oficjalne", () => {
  const l = [
    { id: "r1", kind: "media", region: "mazowieckie", title: "Policja zatrzymała mężczyznę podejrzanego o planowanie ataku na premiera", date: "2026-10-11T10:00:00Z" },
    { id: "p1", kind: "rss", region: "mazowieckie", title: "Policjanci zatrzymali mężczyznę podejrzanego o planowanie ataku na premiera", date: "2026-10-11T09:00:00Z" },
    { id: "x", kind: "rss", region: "mazowieckie", title: "Pożar hali magazynowej w Radomiu. Strażacy gasili ogień całą noc", date: "2026-10-11T08:00:00Z" },
  ];
  const out = dedupeNews(l).map((x) => x.id);
  assert.deepEqual(out, ["p1", "x"].sort((a, b) => l.findIndex((y) => y.id === a) - l.findIndex((y) => y.id === b)));
});
ok("serwer: podobne tytuły w tym samym regionie zwijane, inna sprawa w innym regionie zostaje", () => {
  const NOW = Date.parse("2026-10-11T12:00:00Z");
  const mk = (id, region, title, kind = "rss") => ({ id, region, title, kind, source: "s", url: "https://x/" + id, date: "2026-10-11T10:00:00Z", summary: "" });
  const out = mergeItems([[mk("a", "lubelskie", "Policja ostrzega przed oszustami podszywającymi się pod pracowników banku"), mk("b", "lubelskie", "Policja ostrzega przed oszustami podszywającymi się pod pracowników banków"), mk("c", "slaskie", "Policja ostrzega: oszuści podszywający się pod pracowników banku wyłudzają pieniądze od seniorów")]], NOW);
  assert.equal(out.length, 2);
  assert.ok(out.some((x) => x.region === "slaskie") && out.some((x) => x.region === "lubelskie"));
});
ok("ten sam zamach opisany czterema różnymi zdaniami to jedna sprawa, inne zdarzenia zostają osobno", () => {
  const T = ["Zamach na premiera RP i szefa MON? „Sprawę traktujemy śmiertelnie poważnie”", "Służby otrzymały dziś informację o możliwym zamachu na premiera Donalda Tuska oraz na wicepremiera i szefa MON", "Możliwy zamach na premiera i szefa MON? Wiceminister komentuje działania służb", "Alarm w służbach. Policja otrzymała informację o możliwym zamachu na premiera i szefa MON"];
  assert.equal(dedupeSimilar(T, (x) => x, { share: 0.75, minTokens: 4 }).length, 1);
  const other = ["Zamach bombowy w Paryżu. Nie żyją ludzie", "Pożar tartaku w Bolesławiu koło Olkusza. Na miejscu dziewięć zastępów straży"];
  assert.equal(dedupeSimilar([T[0], ...other], (x) => x, { share: 0.75, minTokens: 4 }).length, 3);
});
console.log(`OK: ${n} grup testów v21 przeszło`);
