// v19: rozbudowana treść (pierwsza pomoc, poradnik, plecak), logo, anonimowość treści.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FIRST_AID, WHAT_TO_DO, PLECAK, READINESS_QUESTIONS } from "../js/content.js";
import { APP_VERSION } from "../js/version.js";

let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error("BŁĄD: " + name + "\n  " + e.message); process.exit(1); } };

ok("pierwsza pomoc: unikalne id, grupy, kroki", () => {
  const ids = FIRST_AID.others.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 30);
  for (const id of ["krwotok", "opaska", "wstrzas", "rko-dziecko", "aed", "anafilaksja", "hipoglikemia", "drgawki", "astma", "zlamania", "glowa-kregoslup", "czad", "upal", "hipotermia", "tonienie", "brak-zasiegu", "blackout-pomoc", "improwizacja"]) assert.ok(ids.includes(id), id);
  for (const o of FIRST_AID.others) { assert.ok(o.g && o.t, o.id); assert.ok(o.steps.length >= 3, o.id); for (const s of o.steps) assert.ok(s.trim().length > 10, o.id); }
  assert.equal(FIRST_AID.reviewed, "2026-10-12");
});
ok("RKO: ocena oddechu do 10 s, oddech agonalny, pełne puszczenie klatki, rytm 100–120", () => {
  const adult = FIRST_AID.rko.steps.map((x) => x.d).join(" ");
  assert.match(adult, /10 sekund/); assert.match(adult, /agonaln/); assert.match(adult, /całkowicie zwolnij nacisk/); assert.match(adult, /2–3 spokojne/);
  const kid = FIRST_AID.others.find((o) => o.id === "rko-dziecko").steps.join(" ");
  assert.match(kid, /10 sekund/); assert.match(kid, /co najmniej 2/); assert.match(kid, /całkowicie zwolnij nacisk/);
  assert.ok(FIRST_AID.rko.bpm >= 100 && FIRST_AID.rko.bpm <= 120);
});
ok("poradnik: nowe tematy i grupy", () => {
  const ids = WHAT_TO_DO.items.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["blackout-godzina", "blackout-cieplo", "blackout-jedzenie", "blackout-zostac", "brak-wody", "czad", "platnosci", "brak-lacznosci", "dezinformacja", "oszustwo-telefon", "oszustwo-sms", "oszustwo-po-fakcie", "senior-oszustwa", "ewakuacja"]) assert.ok(ids.includes(id), id);
  for (const x of WHAT_TO_DO.items) assert.ok(x.g, x.id);
  assert.equal(WHAT_TO_DO.reviewed, "2026-10-12");
});
ok("plecak: unikalne id we wszystkich listach, plan rodzinny", () => {
  const all = [...PLECAK.start, ...PLECAK.later, ...PLECAK.zapas, ...PLECAK.dokumenty, ...PLECAK.rodzina].map((x) => x.id);
  assert.equal(new Set(all).size, all.length);
  assert.equal(PLECAK.start.length, 5, "pasek postępu liczy 5 rzeczy na start");
  assert.ok(PLECAK.rodzina.length >= 8);
  for (const x of [...PLECAK.later, ...PLECAK.zapas, ...PLECAK.dokumenty, ...PLECAK.rodzina]) assert.ok(x.t && x.d, x.id);
});
ok("test gotowości: linki prowadzą do istniejących instrukcji", () => {
  const ids = new Set(WHAT_TO_DO.items.map((x) => x.id));
  for (const q of READINESS_QUESTIONS) { const m = /^#\/co-robic\/(.+)$/.exec(q.link); if (m) assert.ok(ids.has(m[1]), q.link); }
});
ok("bezpieczeństwo treści: brak niebezpiecznych porad", () => {
  const txt = JSON.stringify([FIRST_AID, WHAT_TO_DO]).toLowerCase();
  assert.match(txt, /nigdy nie używaj sznurka/);
  assert.match(txt, /nie wywołuj wymiotów/);
  assert.match(txt, /nie wysysaj jadu/);
});
ok("anonimowość: w repozytorium nie ma śladu autora ani tytułów publikacji", () => {
  const bad = [new RegExp("Ma" + "rek\\s+Wi" + "lk", "i"), new RegExp("Alp" + "ha\\s+Wo" + "lf", "i"), new RegExp("Tactical\\s+Consult", "i"), new RegExp("Bez\\s*Pr" + "ądu\\s+ebook", "i"), new RegExp("Bez prądu\\.\\s*72", "i"), new RegExp("Zagrożenia\\s+hybrydowe\\s+(?:FINAL|ebook|poradnik)", "i"), new RegExp("Pierwsza\\s+pomoc\\s+TOM", "i")];
  const skip = new Set(["node_modules", ".git"]);
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (skip.has(f.name)) continue; const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|mjs|json|html|css|md|txt|yml|yaml|sh|webmanifest)$/.test(f.name)) { const t = fs.readFileSync(p, "utf8"); for (const r of bad) assert.ok(!r.test(t), p + " zawiera " + r); } } };
  walk(path.resolve(import.meta.dirname, ".."));
});
ok("logo: pliki istnieją i są w SHELL, stare SVG usunięte, wersja podbita", () => {
  const root = path.resolve(import.meta.dirname, "..");
  for (const f of ["icons/logo.png", "icons/favicon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/maskable-512.png"]) assert.ok(fs.existsSync(path.join(root, f)), f);
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(sw, /icons\/logo\.png/); assert.match(sw, /icons\/favicon\.png/);
  assert.ok(!/icon\.svg|maskable\.svg/.test(sw + fs.readFileSync(path.join(root, "index.html"), "utf8") + fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8")));
  assert.equal(APP_VERSION, "v34"); assert.match(sw, /egida-v34/);
});
console.log(`OK: ${n} grup testów v19 przeszło`);
