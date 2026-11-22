// Testy paczki v50: wczesne ostrzeżenie (Siły Powietrzne ZSU + kanały monitoringu przez serwer EGIDA) w aplikacji.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { earlyHtml, earlyActive } from "../js/early.js";
import { createFeed } from "../js/neptun-feed.js";
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log("  ok " + name); };
const now = Date.now(), iso = (minAgo) => new Date(now - minAgo * 6e4).toISOString();
const EARLY = { level: "border", weapon: "rakieta", lastAt: iso(2), items: [
  { key: "tg:kpszsu/1", at: iso(2), channels: ["@kpszsu"], official: true, text: "🚀 Волинь: крилаті ракети курсом на Ковель!", oblasts: ["volyn"], zone: "border", weapon: "rakieta", poland: false, west: false },
  { key: "x", at: iso(5), channels: ["@monitor1", "@monitor2"], official: false, text: "Шахеди на Луцьк <script>", oblasts: ["volyn"], zone: "border", weapon: "dron", poland: false, west: true },
] };

await t("karta: nieoficjalne, nie alarm, po polsku (broń, obwód, kurs), oryginał w nawiasie, bez wstrzyknięcia HTML", () => {
  const h = earlyHtml(EARLY, { now });
  assert.match(h, /Wczesne ostrzeżenie · nieoficjalne/); assert.match(h, /zgłaszają rakiety przy granicy z Polską/);
  assert.match(h, /rakieta · obwód wołyński/); assert.match(h, /dron · obwód wołyński · kurs na zachód/);
  assert.match(h, /Siły Powietrzne ZSU/); assert.match(h, /@monitor1, @monitor2/); assert.match(h, /nie jest alarm dla Polski/);
  assert.match(h, /&lt;script&gt;/); assert.doesNotMatch(h, /<script>/); assert.match(h, /lang="uk"/);
});
await t("karta: brak danych, poziom null albo ostatnia wiadomość starsza niż 30 min → nic", () => {
  assert.equal(earlyHtml(null), ""); assert.equal(earlyHtml({ level: null, items: [] }), "");
  assert.equal(earlyActive({ ...EARLY, lastAt: iso(31) }, now), false);
  assert.equal(earlyHtml({ ...EARLY, lastAt: iso(31) }, { now }), "");
  assert.match(earlyHtml({ ...EARLY, level: "west", weapon: "dron" }, { now }), /drony w zachodniej Ukrainie/);
});
await t("mapa: ostrzeżenie przychodzi z serwera EGIDA razem z obiektami; po przejściu na NEPTUN bezpośrednio znika (nie pokazujemy starego)", async () => {
  let relayUp = true;
  const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } });
  const feed = createFeed({ relayUrl: "https://relay.test/snapshot", restUrl: "https://neptun.test/threats", wsUrl: "", WS: undefined, pollMs: 40, relayRetryMs: 1000, watchdogMs: 1000,
    fetchImpl: async (url) => url.startsWith("https://relay.test") ? (relayUp ? resp(200, { version: 1, threats: [], early: EARLY }) : resp(503, {})) : resp(200, { threats: [] }) });
  feed.start(); await sleep(30);
  assert.equal(feed.store.extras.early.level, "border");
  relayUp = false; await sleep(150);
  assert.equal(feed.status().via === "relay", false); assert.equal(feed.store.extras.early, null);
  feed.stop();
});
await t("wpięcie: Pulpit (co 30 s, tylko przy zgodzie NEPTUN), mapa, adres w CONFIG, plik w pamięci offline, prywatność, źródła, wersja v50", () => {
  const app = src("js/app.js");
  assert.match(app, /earlyWanted\(\) \? earlyHtml\(earlyData\)/); assert.match(app, /state\.consent\?\.neptun === true/); assert.match(app, /setInterval\(refreshEarly, 30 \* 1000\)/); assert.match(app, /earlyOn \? "Brak oficjalnych ostrzeżeń" : "W Twojej okolicy jest spokojnie"/);
  assert.match(src("js/mapscreen.js"), /earlyHtml\(feed\.store\.extras\.early\)/);
  assert.match(src("js/config.js"), /earlyUrl: "https:\/\/188-68-247-201\.sslip\.io\/egida\/neptun\/early"/);
  assert.match(src("sw.js"), /"js\/early\.js"/);
  assert.match(src("js/content.js"), /wczesne ostrzeżenie co 30 s/); assert.match(src("js/content.js"), /t\.me\/s\/kpszsu/);
  assert.match(src("js/version.js"), /APP_VERSION = "v50"/); assert.match(src("sw.js"), /const VERSION = "egida-v50"/);
});
console.log(`test-v50: ${n} testów OK`);
