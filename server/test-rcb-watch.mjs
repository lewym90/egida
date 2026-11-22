// Test integracyjny obserwatora Alertów RCB (rcb-watch.mjs) na ATRAPACH gov.pl i API Telegrama (lokalny serwer HTTP).
// Sprawdza całą ścieżkę: pierwsze uruchomienie bez wysyłki, nowa wysyłka → dokładnie jedna wiadomość, brak duplikatów,
// ponowienie tylko nieudanego kanału, poprawka literówki bez ponownej wysyłki, odwołanie, wysyłka bez województwa nie idzie
// do całej Polski, oraz poll.mjs publikujący alerty z gov.pl, gdy RSO nie działa.
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = mkdtempSync(path.join(tmpdir(), "rcbw-"));
const pl = (ms) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms)).reduce((a, x) => (a[x.type] = x.value, a), {}); return p; };
const NOW = Date.now();
// Wszystkie wysyłki tego samego dnia (polskiego), żeby test nie zależał od pory uruchomienia: cofamy się, jeśli blisko północy.
const anchor = (() => { const p = pl(NOW); return Number(p.hour) < 1 ? NOW - 2 * 36e5 : NOW; })();
const at = (minAgo) => { const p = pl(anchor - minAgo * 6e4); return `${Number(p.hour)}:${p.minute}`; };
const d = pl(anchor), DM = `${d.day}.${d.month}`, DMY = `${d.day}.${d.month}.${d.year}`;
const SLUG = `alert-rcb---atak-z-powietrza-test`, SLUG2 = `alert-rcb---zagrozenie-z-powietrza-test2`;

let pages = {}, tgFail = new Set(), sent = [];
const entry = (time, text, recip) => `<p><u><em><strong>Aktualizacja - g. ${time}</strong></em></u></p><p><strong>&bdquo;${text}&rdquo;</strong></p><p>Alert RCB został wysłany do odbiorc&oacute;w na terenie ${recip}</p><hr />`;
const page = (title, entries) => `<html><body><article class="article-area__article"><h2>${title}</h2><p class="event-date">${DMY}</p><p class="intro">x</p><div class="editor-content"><div>${entries.join("")}</div></div></article></body></html>`;
const list = () => `<ul>${Object.entries(pages).map(([slug, p]) => `<li><div><a href="/web/rcb/${slug}"> ${p.title} </a></div><div class="intro">„UWAGA! Zagrożenie atakiem z powietrza.”</div></li>`).join("")}</ul>`;

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/robots.txt") { res.end("User-agent: *\nAllow: /\n"); return; }
  if (u.pathname === "/web/rcb/komunikaty") { res.end(list()); return; }
  const m = /^\/web\/rcb\/(.+)$/.exec(u.pathname);
  if (m && pages[m[1]]) { res.end(page(pages[m[1]].title, pages[m[1]].entries)); return; }
  if (/^\/botTEST\/sendMessage$/.test(u.pathname)) {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      const j = JSON.parse(b);
      if (tgFail.has(j.chat_id)) { res.statusCode = 502; res.end('{"ok":false}'); return; }
      sent.push({ chat: j.chat_id, text: j.text }); res.end('{"ok":true}');
    }); return;
  }
  res.statusCode = 404; res.end("nie ma");
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${srv.address().port}`;
const CH = { lubelskie: "-1001000001", podkarpackie: "-1001000002", podlaskie: "-1001000003", mazowieckie: "-1001000004" };
writeFileSync(path.join(base, "channels.json"), JSON.stringify(Object.fromEntries(Object.entries(CH).map(([k, v]) => [k, { chat: v }]))));
const env = { ...process.env, EGIDA_BASE: base, RCB_ORIGIN_URL: ORIGIN, TELEGRAM_API: ORIGIN, TELEGRAM_BOT_TOKEN: "TEST", CHANNELS_FILE: path.join(base, "channels.json"), RCB_PUBLISH: "off", APP_URL: "" };
const run = (extra = {}) => new Promise((resolve) => { const p = spawn(process.execPath, [path.join(here, "rcb-watch.mjs")], { env: { ...env, ...extra }, cwd: here }); let out = ""; p.stdout.on("data", (c) => (out += c)); p.stderr.on("data", (c) => (out += c)); p.on("close", (code) => resolve({ code, out })); });
const take = () => { const s = sent; sent = []; return s.map((x) => `${Object.keys(CH).find((k) => CH[k] === x.chat)}:${/ZAGROŻENIE/.test(x.text) ? "danger" : /OSTRZEŻENIE/.test(x.text) ? "important" : /ODWOŁANIE/.test(x.text) ? "cancel" : "?"}`).sort(); };
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log("  ok " + name); };

const MON = "UWAGA! Rosyjski atak powietrzny na Ukrainie. Sytuacja jest monitorowana. Podniesiono gotowość Systemu Obrony Powietrznej RP. Oczekuj dalszych komunikat&oacute;w.";
const DANGER = "UWAGA! UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce. Stosuj się do poleceń służb. Oczekuj dalszych komunikat&oacute;w.";
const CANCEL = "UWAGA! Odwołano zagrożenie atakiem z powietrza. Brak zagrożenia na terenie Polski.";
const e1 = entry(at(40), MON, "woj. lubelskiego i podkarpackiego.");
const e2 = entry(at(20), DANGER, "pow. hrubieszowskiego, m. Zamość, zamojskiego, tomaszowskiego, biłgorajskiego (woj. lubelskie).");
const e3 = entry(at(10), DANGER, "woj. lubelskiego, podkarpackiego, podlaskiego i mazowieckiego.");
const e4 = entry(at(1), CANCEL, "woj. lubelskiego, podkarpackiego, podlaskiego i mazowieckiego.");

await t("pierwsze uruchomienie: zapamiętuje, nic nie wysyła", async () => {
  pages[SLUG] = { title: `Alert RCB - atak z powietrza (${DM})`, entries: [e1] };
  const r = await run(); assert.equal(r.code, 0, r.out); assert.deepEqual(take(), []);
  assert.equal(JSON.parse(readFileSync(path.join(base, "rcb-gov.json"), "utf8")).items.length, 2);
});
await t("nowa wysyłka (zagrożenie dla powiatów Lubelskiego) → dokładnie jedna wiadomość, na kanał Lubelskie; znacznik publikacji", async () => {
  pages[SLUG].entries = [e2, e1];
  const r = await run(); assert.deepEqual(take(), ["lubelskie:danger"], r.out);
  assert.ok(existsSync(path.join(base, "rcb-publish.pending")));
});
await t("ten sam stan strony → nic nowego", async () => { await run(); assert.deepEqual(take(), []); });
await t("cała lista 4 województw; Telegram nie działa dla Mazowieckiego → 3 wysłane, Mazowieckie w następnym przebiegu, bez duplikatów", async () => {
  pages[SLUG].entries = [e3, e2, e1]; tgFail = new Set([CH.mazowieckie]);
  const r = await run(); assert.deepEqual(take(), ["lubelskie:danger", "podkarpackie:danger", "podlaskie:danger"], r.out);
  tgFail = new Set();
  const r2 = await run(); assert.deepEqual(take(), ["mazowieckie:danger"], r2.out);
  await run(); assert.deepEqual(take(), []);
});
await t("RCB poprawia literówkę i dopisuje godzinę w starszym wpisie → bez ponownej wysyłki", async () => {
  pages[SLUG].entries = [e3, e2.replace("biłgorajskiego", "biłgorajskiego oraz"), e1.replace("Podniesiono", "Podniesiono&nbsp;")];
  const r = await run(); assert.deepEqual(take(), [], r.out);
});
await t("RCB zmienia zdanie w starszym wpisie (wpisy się scalają), potem dopisuje nową wysyłkę → nowa wysyłka idzie", async () => {
  const e2b = e2.replace("został wysłany do odbiorc&oacute;w na terenie", "wysłano do:");
  const ex = entry(at(5), MON, "woj. podlaskiego.");
  pages[SLUG].entries = [e3, e2b, e1];
  await run(); take();
  pages[SLUG].entries = [ex, e3, e2b, e1];
  const r = await run(); assert.deepEqual(take(), ["podlaskie:important"], r.out);
  pages[SLUG].entries = [e3, e2, e1];
});
await t("odwołanie → ODWOŁANIE do wszystkich 4 województw", async () => {
  pages[SLUG].entries = [e4, e3, e2, e1];
  const r = await run(); assert.deepEqual(take(), ["lubelskie:cancel", "mazowieckie:cancel", "podkarpackie:cancel", "podlaskie:cancel"], r.out);
});
await t("wysyłka bez rozpoznanego województwa NIE idzie do całej Polski", async () => {
  pages[SLUG2] = { title: `Alert RCB - zagrożenie z powietrza (${DM})`, entries: [entry(at(2), DANGER, "pow. stalowowolskiego.")] };
  const r = await run(); assert.deepEqual(take(), [], r.out); assert.match(r.out, /bez rozpoznanego województwa/);
  const j = JSON.parse(readFileSync(path.join(base, "rcb-gov.json"), "utf8"));
  assert.ok(!j.items.some((i) => i.voivodeship === "all"));
});
await t("przerwany przebieg (twardy termin) nie wysyła drugi raz tego, co już poszło", async () => {
  delete pages[SLUG2];
  const e5 = entry(at(0), DANGER, "woj. lubelskiego, podkarpackiego, podlaskiego i mazowieckiego.");
  pages[SLUG].entries = [e5, e4, e3, e2, e1];
  // Termin tak krótki, że zmieści się najwyżej część wysyłek; kolejne przebiegi dosyłają resztę – razem dokładnie po jednej.
  const all = [];
  let runs = 0;
  for (let i = 0; i < 6; i++) { const rr = await run({ RCB_DEADLINE_MS: "7000" }); if (process.env.DBG) console.log(rr.out); runs++; const got = take(); all.push(...got); if (i > 0 && !got.length && all.length >= 4) break; }
  assert.ok(runs >= 2, "termin powinien wymusić co najmniej dwa przebiegi");
  assert.deepEqual(all.sort(), ["lubelskie:danger", "mazowieckie:danger", "podkarpackie:danger", "podlaskie:danger"]);
});
await t("poll.mjs: RSO nie działa → plik dla aplikacji i tak dostaje Alerty RCB z gov.pl (kod 3, stare „updated”)", async () => {
  const out = path.join(base, "alerts.json");
  writeFileSync(out, JSON.stringify({ updated: "2026-01-01T00:00:00.000Z", source: "x", items: [{ id: "rso1", title: "Stary komunikat RSO", type: "inne", voivodeship: "lubelskie", published: "2026-01-01T00:00:00.000Z", source: "RSO (komunikaty.tvp.pl)" }] }));
  const p = await new Promise((resolve) => { const c = spawn(process.execPath, [path.join(here, "poll.mjs")], { env: { ...env, RSO_URL: ORIGIN + "/brak-rso", ALERTS_OUT: out, STATE_FILE: path.join(base, "state.json"), RCB_GOV_FILE: path.join(base, "rcb-gov.json") }, cwd: here }); let o = ""; c.stdout.on("data", (x) => (o += x)); c.stderr.on("data", (x) => (o += x)); c.on("close", (status) => resolve({ status, o })); });
  assert.equal(p.status, 3, p.o);
  const j = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(j.updated, "2026-01-01T00:00:00.000Z");
  assert.ok(j.items.some((i) => i.id === "rso1"));
  assert.ok(j.items.some((i) => i.source === "RCB (gov.pl)" && i.voivodeship === "mazowieckie"));
  assert.ok(j.items.every((i) => !("key" in i) && !("slug" in i) && !("sig" in i)));
});
srv.close();
console.log(`test-rcb-watch: ${n} testów OK`);
