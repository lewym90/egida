// Testy wczesnego ostrzeżenia (early-lib.mjs): podgląd kanału t.me, ocena wiadomości, stan, decyzja o wysyłce na Telegram.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseTgPreview, assessEarly, EarlyState, decideEarly, markEarlySent, buildEarlyMessage, confirmed, decodeHtml } from "./early-lib.mjs";

let n = 0; const t = (name, fn) => { fn(); n++; console.log("  ok " + name); };
const html = readFileSync(new URL("./test-fixtures/tg/kpszsu.html", import.meta.url), "utf8");
const T0 = Date.parse("2026-11-22T16:00:00Z");
const m = (channel, minAgo, text, id) => ({ id, channel, date: new Date(T0 - minAgo * 6e4).toISOString(), text });

t("podgląd t.me: wiadomości z tekstem, datą i numerem; encje (&#33;) i <br> zamienione; wpis bez tekstu pominięty", () => {
  const l = parseTgPreview(html, "kpszsu");
  assert.equal(l.length, 5);
  assert.equal(l[3].id, "tg:kpszsu/4104"); assert.equal(l[3].channel, "@kpszsu"); assert.equal(l[3].date, "2026-11-22T15:56:30.000Z");
  assert.equal(l[3].text, "🚀 Волинь: крилаті ракети курсом на Ковель!\nУвага!");
  assert.equal(l[4].text.startsWith("Львівщина:"), true, "znaczniki <b> usunięte");
  assert.equal(decodeHtml("&#x41;&amp;&nbsp;&quot;"), 'A& "');
  assert.deepEqual(parseTgPreview("<html>Cloudflare</html>", "x"), [], "inna strona – pusta lista, bez błędu");
});

t("ocena: obwody przy Polsce = strefa granica, dalsze zachodnie = strefa zachód; wschód i Winnica – nic", () => {
  // prawdziwe wpisy z t.me/kpszsu z 22.11.2026 (wschód i centrum) – nie mogą dawać ostrzeżenia
  for (const x of ["🏍 Вінниччина: реактивний БпЛА повз Погребище курсом на захід.", "🏍 Київщина: реактивний БпЛА на Обухів.", "🏍 Русанівські Сади.", "🏍 Чернігівщина: реактивний БпЛА повз Сновськ ➡️ у південному напрямку."]) assert.equal(assessEarly(x), null, x);
  const v = assessEarly("🚀 Волинь: крилаті ракети курсом на Ковель!");
  assert.deepEqual([v.zone, v.weapon, v.oblasts.join()], ["border", "rakieta", "volyn"]);
  const l = assessEarly("Львівщина: група БпЛА на Яворів з півдня, рух у напрямку кордону з Польщею.");
  assert.deepEqual([l.zone, l.weapon, l.poland], ["border", "dron", true]);
  const r = assessEarly("🏍 Рівненщина: реактивний БпЛА повз Сарни курсом на північний захід!");
  assert.deepEqual([r.zone, r.weapon, r.west], ["west", "dron", true]);
  assert.equal(assessEarly("КР в напрямку Польщі").weapon, "rakieta", "skrót КР = rakieta manewrująca");
  assert.equal(assessEarly("Ціль на Луцьк").weapon, "cel");
});

t("prawdziwe wpisy Sił Powietrznych (piątek 20.11.2026, noc 9/10.09.2025) – złapane; wiersz o innym obwodzie nie miesza", () => {
  for (const [x, zone, weapon] of [
    ["🚀Ракета в р-ні Жидачіва (Львівщина)", "border", "rakieta"],
    ["🚀Ракети з Рівненщини та Воли ні на північ Львівщини", "border", "rakieta"],
    ["🚀Ракети з Івано-Франківщини на Львівщину та змінюють курс у напрямку Львова.", "border", "rakieta"],
    ["🛵 Ворожі ударні БпЛА з Волині наближаються до державного кордону з Польщею!\n🛵 Північ Хмельниччини та Львівщини - загроза застосування ворогом ударних БпЛА.", "border", "dron"],
    ["🏍 Реактивні БпЛА з Житомирщини на Рівненщину.", "west", "dron"],
    ["🛵 Закарпаття: БпЛА на Мукачево.", "west", "dron"],
  ]) { const a = assessEarly(x); assert.ok(a, x); assert.deepEqual([a.zone, a.weapon], [zone, weapon], x); }
  const multi = assessEarly("🛵 БпЛА на сході Дніпропетровщини, курс на захід.\n🛵 БпЛА на заході Чернігівщини, курс на Київщину.\n🛵 БпЛА на заході Волині, курс в напрямку кордону з Польщею.");
  assert.equal(multi.west, false, "„курс на захід” był w wierszu o Dnieprze"); assert.equal(multi.poland, true);
  assert.equal(multi.excerpt, "🛵 БпЛА на заході Волині, курс в напрямку кордону з Польщею.");
  assert.equal(assessEarly("🚀 Ракети:\nВолинь, Львівщина").weapon, "rakieta", "nagłówek w osobnym wierszu – ocena całości");
  assert.equal(assessEarly("⚡️ ЗБИТО/ПОДАВЛЕНО 413 ЦІЛЕЙ ПРОТИВНИКА\n" + "Волинь, Львівщина. ".repeat(30)), null, "poranny raport");
});

t("ocena: fałszywe trafienia odrzucone (pogoda, „рівень”, długie podsumowania, brak obiektu); „відбій” = odwołanie", () => {
  assert.equal(assessEarly("ℹ️ У Львові можливий дощ зі снігом"), null);
  assert.equal(assessEarly("Підвищений рівень небезпеки! ракета на Дніпро"), null, "„рівень” to nie Równe");
  assert.equal(assessEarly("Польський прем'єр заявив про підтримку України"), null, "polityka bez obiektu");
  assert.equal(assessEarly("Протягом ночі збито 50 дронів над Волинню. " + "x".repeat(400)), null, "długie podsumowanie");
  const c = assessEarly("Відбій тривоги у Волинській області");
  assert.equal(c.cancel, true); assert.deepEqual(c.oblasts, ["volyn"]);
  assert.equal(assessEarly("Ракета у напрямку Ковеля!").zone, "border", "dopełniacz nazwy miasta");
});

t("stan: przedruk tej samej treści = jedno ostrzeżenie z wieloma kanałami; stare i z przyszłości pomijane; wygasa po 30 min", () => {
  const E = new EarlyState();
  assert.equal(E.add(m("@kpszsu", 2, "🚀 Волинь: крилаті ракети курсом на Ковель!", "tg:kpszsu/1"), T0), true);
  assert.equal(E.add(m("@kpszsu", 2, "🚀 Волинь: крилаті ракети курсом на Ковель!", "tg:kpszsu/1"), T0), false, "to samo id");
  assert.equal(E.add(m("Повітряні Сили ЗСУ", 1.5, "🚀  Волинь: крилаті ракети курсом на Ковель!"), T0), true, "przedruk z NEPTUN");
  assert.equal(E.add(m("@x", 45, "Ракета на Луцьк"), T0), false, "starsze niż 30 min");
  assert.equal(E.add(m("@x", -20, "Ракета на Луцьк"), T0), false, "z przyszłości");
  let s = E.snapshot(T0);
  assert.equal(s.level, "border"); assert.equal(s.weapon, "rakieta"); assert.equal(s.items.length, 1);
  assert.deepEqual(s.items[0].channels, ["@kpszsu", "Повітряні Сили ЗСУ"]); assert.equal(s.items[0].official, true);
  s = E.snapshot(T0 + 27 * 6e4); assert.equal(s.level, "border", "28,5 min od ostatniej wiadomości");
  s = E.snapshot(T0 + 33 * 6e4); assert.equal(s.level, null); assert.deepEqual(s.items, []);
});

t("stan: „відбій” dla obwodu gasi wcześniejsze wpisy tylko tego obwodu", () => {
  const E = new EarlyState();
  E.add(m("@a", 10, "Шахеди на Ковель"), T0);
  E.add(m("@b", 8, "Ракета на Львів"), T0);
  E.add(m("@a", 5, "Відбій тривоги на Волині"), T0);
  const s = E.snapshot(T0);
  assert.equal(s.items.length, 1); assert.deepEqual(s.items[0].oblasts, ["lviv"]);
});

t("Telegram: tylko strefa granica i tylko potwierdzone (Siły Powietrzne albo 2 kanały); bez zaległości po restarcie", () => {
  const E = new EarlyState();
  E.add(m("@monitor1", 3, "Шахеди на Ковель"), T0);
  E.add(m("@rivne_monitor", 2, "🏍 Рівненщина: БпЛА курсом на захід"), T0);
  let d = decideEarly(E.snapshot(T0), { sent: {} }, T0);
  assert.deepEqual(d.byRegion, {}, "jeden nieoficjalny kanał i strefa zachód – nic");
  E.add(m("@monitor2", 1, "Група шахедів на Луцьк"), T0);
  d = decideEarly(E.snapshot(T0), { sent: {} }, T0);
  assert.deepEqual(Object.keys(d.byRegion), ["lubelskie"], "Wołyń → lubelskie, 2 kanały");
  const old = new EarlyState(); old.add(m("@kpszsu", 15, "Ракета на Львів", "tg:kpszsu/9"), T0);
  assert.deepEqual(decideEarly(old.snapshot(T0), { sent: {} }, T0).byRegion, {}, "wpis sprzed 15 min nie idzie");
  const lv = new EarlyState(); lv.add(m("@kpszsu", 1, "Ракета на Львів", "tg:kpszsu/10"), T0);
  assert.deepEqual(Object.keys(decideEarly(lv.snapshot(T0), { sent: {} }, T0).byRegion).sort(), ["lubelskie", "podkarpackie"]);
  assert.equal(confirmed({ official: false, at: new Date(T0).toISOString(), oblasts: ["volyn"], channels: ["@a"] }, []), false);
});

t("Telegram: najwyżej raz na 20 min na województwo; wyjątek – eskalacja dron → rakieta; ta sama pozycja nigdy dwa razy", () => {
  const E = new EarlyState();
  E.add(m("@kpszsu", 1, "Шахеди на Ковель", "tg:kpszsu/20"), T0);
  let d = decideEarly(E.snapshot(T0), { sent: {} }, T0);
  const st = d.state; markEarlySent(st, "lubelskie", d.byRegion.lubelskie, T0);
  d = decideEarly(E.snapshot(T0), st, T0 + 6e4); assert.deepEqual(d.byRegion, {}, "już wysłane");
  E.add(m("@kpszsu", -2, "Ще шахеди на Луцьк", "tg:kpszsu/21"), T0 + 3 * 6e4);
  d = decideEarly(E.snapshot(T0 + 3 * 6e4), st, T0 + 3 * 6e4); assert.deepEqual(d.byRegion, {}, "kolejny dron w ciągu 20 min – cisza");
  E.add(m("@kpszsu", -4, "Крилаті ракети на Ковель!", "tg:kpszsu/22"), T0 + 5 * 6e4);
  d = decideEarly(E.snapshot(T0 + 5 * 6e4), st, T0 + 5 * 6e4); assert.deepEqual(Object.keys(d.byRegion), ["lubelskie"], "eskalacja do rakiet");
  assert.equal(d.byRegion.lubelskie.some((x) => x.weapon === "rakieta"), true);
});

t("treść Telegram: nieoficjalne, nie alarm, źródło, oryginalny tekst bez wstrzyknięcia HTML", () => {
  const E = new EarlyState(); E.add(m("@kpszsu", 1, "Ракета на Львів <b>x</b>", "tg:kpszsu/30"), T0);
  const msg = buildEarlyMessage("podkarpackie", E.snapshot(T0).items, { appUrl: "https://lewym90.github.io/egida/" });
  assert.match(msg, /WCZESNE OSTRZEŻENIE · NIEOFICJALNE/); assert.match(msg, /nie jest alarm dla Polski/); assert.match(msg, /Siły Powietrzne ZSU/);
  assert.match(msg, /obwód lwowski/); assert.match(msg, /&lt;b&gt;x&lt;\/b&gt;/); assert.match(msg, /Alert RCB/);
});

// ---------- obserwator Telegram (neptun-watch.mjs) z atrapą przekaźnika i Telegrama ----------
{
  const sent = [];
  let early = null;
  const srv = http.createServer((req, res) => {
    const u = req.url;
    if (u.startsWith("/egida/neptun/snapshot")) { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ serverTime: new Date().toISOString(), version: 1, threats: [] })); }
    if (u.startsWith("/egida/neptun/early")) { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ early })); }
    if (u.startsWith("/botTEST/sendMessage")) { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { sent.push(JSON.parse(b)); res.setHeader("Content-Type", "application/json"); res.end('{"ok":true}'); }); return; }
    res.statusCode = 404; res.end("{}");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port, dir = mkdtempSync(path.join(tmpdir(), "early-"));
  writeFileSync(path.join(dir, "channels.json"), JSON.stringify({ lubelskie: { chat: "-1001234567" }, podkarpackie: { chat: "-1007654321" } }));
  const E = new EarlyState(); const now = Date.now();
  E.add({ id: "tg:kpszsu/77", channel: "@kpszsu", date: new Date(now - 60000).toISOString(), text: "🚀 Волинь: крилаті ракети курсом на Ковель!" }, now);
  early = E.snapshot(now);
  const run = () => new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), "neptun-watch.mjs"), "--once"], { env: { ...process.env, NEPTUN_REST: "", NEPTUN_RELAY_LOCAL: `http://127.0.0.1:${port}/egida/neptun/snapshot`, TELEGRAM_API: `http://127.0.0.1:${port}`, TELEGRAM_BOT_TOKEN: "TEST", CHANNELS_FILE: path.join(dir, "channels.json"), NEPTUN_STATE: path.join(dir, "ns.json"), NEPTUN_HEALTH: path.join(dir, "nh.json"), NEPTUN_SEEN: path.join(dir, "seen.json"), EARLY_STATE: path.join(dir, "early.json") } });
    let out = ""; p.stdout.on("data", (c) => (out += c)); p.stderr.on("data", (c) => (out += c)); p.on("exit", () => resolve(out));
  });
  let out = await run();
  t("obserwator: wczesne ostrzeżenie z przekaźnika → Telegram tylko do lubelskiego (Wołyń), raz", () => {
    assert.equal(sent.length, 1, out); assert.equal(sent[0].chat_id, "-1001234567"); assert.match(sent[0].text, /WCZESNE OSTRZEŻENIE/);
  });
  out = await run();
  t("obserwator: kolejny przebieg nie wysyła tego samego drugi raz (stan w pliku)", () => { assert.equal(sent.length, 1, out); });
  srv.close();
}
console.log(`test-early: ${n} testów OK`);
