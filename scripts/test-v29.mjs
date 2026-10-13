// v29: ekran powitalny musi leżeć w .shell (jedyny element przewijany na telefonie od v27), inaczej na iPhonie nie da się dojść do „Zaczynamy”.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const app = src("js/app.js");
const m = app.match(/function screenStart\(\) \{[\s\S]*?\n\}\n/);
assert.ok(m, "brak screenStart");
assert.match(m[0], /return `<div class="shell"><main/, "screenStart musi zaczynać się od .shell");
assert.match(m[0], /<\/main><\/div>`;/, "screenStart musi kończyć się zamknięciem .shell");
assert.match(src("css/style.css"), /\.shell\{position:fixed;inset:0[^}]*overflow-y:auto/, "na telefonie .shell ma być kontenerem przewijania");
console.log("  ok ekran powitalny jest przewijalny (w .shell)");
console.log("OK: 1 grupa testów v29");
// v30: ekran powitalny przewija się zwykłą stroną (html.onb), a service worker pobiera kod najpierw z sieci.
assert.match(app, /classList\.toggle\("onb", !state\.onboarded\)/, "render musi przełączać klasę onb");
assert.match(src("css/style.css"), /html\.onb body\{position:static/, "html.onb ma wyłączać position:fixed");
assert.match(m[0], /EGIDA \$\{APP_VERSION\}/, "ekran powitalny pokazuje wersję");
const sw = src("sw.js");
assert.match(sw, /Kod i style aplikacji: sieć najpierw/, "sw: kod aplikacji najpierw z sieci");
assert.match(sw, /cache: "no-cache"/, "sw: żądanie z pominięciem cache HTTP");
console.log("  ok v30: przewijanie ekranu powitalnego, wersja na ekranie, sieć najpierw w sw");
