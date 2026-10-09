// Odpytuje RSO, zapisuje ../data/alerts.json i (opcjonalnie) wysyła NOWE komunikaty na Telegram.
// Uruchamianie: `node poll.mjs` co 5 min (cron/systemd timer). `--dump` pokazuje strukturę XML.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRso, parseRso, findItems } from "./rso.mjs";
import { XMLParser } from "fast-xml-parser";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.ALERTS_OUT || path.join(here, "..", "data", "alerts.json");
const STATE = process.env.STATE_FILE || path.join(here, "state.json");
const MAX_ITEMS = 500;

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
// JSON: {"mazowieckie":"@egida_mazowieckie", ...} – publiczne kanały (bot musi być ich administratorem).
let TG_CHANNELS = {};
try { TG_CHANNELS = JSON.parse(process.env.TELEGRAM_CHANNELS || "{}"); } catch { console.error("TELEGRAM_CHANNELS: niepoprawny JSON"); }
// Prostsza konfiguracja: TELEGRAM_PREFIX=egida_ i TELEGRAM_REGIONS=lodzkie,mazowieckie => @egida_lodzkie, @egida_mazowieckie.
for (const id of (process.env.TELEGRAM_REGIONS || "").split(",").map((x) => x.trim()).filter(Boolean)) {
  TG_CHANNELS[id] ??= "@" + (process.env.TELEGRAM_PREFIX || "egida_") + id.replace(/-/g, "_");
}
const APP_URL = process.env.APP_URL || "";

const NAMES = { dolnoslaskie: "Dolnośląskie", "kujawsko-pomorskie": "Kujawsko-pomorskie", lubelskie: "Lubelskie", lubuskie: "Lubuskie", lodzkie: "Łódzkie", malopolskie: "Małopolskie", mazowieckie: "Mazowieckie", opolskie: "Opolskie", podkarpackie: "Podkarpackie", podlaskie: "Podlaskie", pomorskie: "Pomorskie", slaskie: "Śląskie", swietokrzyskie: "Świętokrzyskie", "warminsko-mazurskie": "Warmińsko-mazurskie", wielkopolskie: "Wielkopolskie", zachodniopomorskie: "Zachodniopomorskie" };
const TYPE_NAMES = { rcb: "Alert RCB", pogoda: "Pogoda", woda: "Woda", drogi: "Drogi", inne: "Komunikat" };
// Na Telegram wysyłamy tylko to, co ważne dla bezpieczeństwa. Drogi i „inne” zostają w aplikacji.
const TG_TYPES = new Set((process.env.TELEGRAM_TYPES || "rcb,pogoda,woda").split(","));

const readJson = async (f, d) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return d; } };
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sendTelegram(channel, html) {
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: channel, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
const tgText = (a) => {
  const head = `<b>${escHtml(TYPE_NAMES[a.type] || "Komunikat")}</b> · ${escHtml(a.voivodeship === "all" ? "cała Polska" : NAMES[a.voivodeship] || a.voivodeship)}`;
  const body = a.body ? `\n${escHtml(a.body.slice(0, 500))}` : "";
  const src = `\n\nŹródło: ${escHtml(a.source)}${a.url ? ` · ${escHtml(a.url)}` : ""}`;
  const foot = `\n<i>EGIDA – nieoficjalna aplikacja informacyjna. Kieruj się syrenami, Alertem RCB, służbami i numerem 112.</i>${APP_URL ? `\n${escHtml(APP_URL)}` : ""}`;
  return `${head}\n${escHtml(a.title)}${body}${src}${foot}`;
};

async function main() {
  if (process.argv.includes("--dump")) {
    const xml = await fetchRso();
    await writeFile(path.join(here, "last.xml"), xml);
    const root = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const items = findItems(root);
    console.log(`Pobrano ${xml.length} znaków, rozpoznanych węzłów-komunikatów: ${items.length}`);
    console.log("Pierwszy węzeł:\n" + JSON.stringify(items[0] ?? root, null, 2).slice(0, 3000));
    return;
  }
  const previous = await readJson(OUT, { items: [] });
  const state = await readJson(STATE, { sent: {} });

  let fresh;
  try {
    fresh = parseRso(await fetchRso());
    if (!fresh.length) throw new Error("Parser nie znalazł żadnych komunikatów – sprawdź strukturę XML (node poll.mjs --dump)");
  } catch (e) {
    // Nie nadpisujemy poprzednich danych; „updated” zostaje stare, więc aplikacja sama uzna dane za nieaktualne.
    console.error("Błąd pobierania RSO:", e.message);
    process.exitCode = 1;
    return;
  }

  // Tylko to, co RSO podaje TERAZ i nie wygasło. Komunikat, który zniknął z RSO (odwołany), znika też u nas.
  const now = Date.now();
  const byId = new Map();
  for (const a of fresh) if (!byId.has(a.id) && !(a.validTo && new Date(a.validTo).getTime() < now)) byId.set(a.id, a);
  const items = [...byId.values()].sort((a, b) => (b.published || "").localeCompare(a.published || "")).slice(0, MAX_ITEMS);
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), source: "RSO (komunikaty.tvp.pl)", items }, null, 1));
  console.log(`Zapisano ${items.length} komunikatów (nowych w pobraniu: ${fresh.filter((a) => !(previous.items || []).some((p) => p.id === a.id)).length}).`);

  // Telegram: tylko nowe, tylko ważne typy, tylko z ostatnich 6 godzin (żeby po pierwszym uruchomieniu nie zalać kanałów).
  const isFirstRun = !Object.keys(state.sent).length;
  const recent = Date.now() - 6 * 36e5;
  const toSend = fresh.filter((a) => !state.sent[a.id] && (TG_TYPES.has(a.type) || a.alarm) && (!a.published || new Date(a.published).getTime() >= recent));
  for (const a of fresh) if (!state.sent[a.id]) state.sent[a.id] = Date.now();
  if (!TG_TOKEN) { if (toSend.length) console.log(`Telegram wyłączony (brak TELEGRAM_BOT_TOKEN). Do wysłania byłoby: ${toSend.length}.`); }
  else if (isFirstRun && !process.env.TELEGRAM_SEND_ON_FIRST_RUN) console.log("Pierwsze uruchomienie: zapamiętuję komunikaty bez wysyłania (ustaw TELEGRAM_SEND_ON_FIRST_RUN=1, aby wysłać).");
  else for (const a of toSend) {
    const ch = a.voivodeship === "all" ? Object.values(TG_CHANNELS) : [TG_CHANNELS[a.voivodeship]].filter(Boolean);
    for (const c of ch) { try { await sendTelegram(c, tgText(a)); await new Promise((r) => setTimeout(r, 1100)); } catch (e) { console.error("Telegram:", e.message); } }
  }
  const keep = Date.now() - 14 * 864e5;
  for (const [k, t] of Object.entries(state.sent)) if (t < keep) delete state.sent[k];
  await writeFile(STATE, JSON.stringify(state));
}
main().catch((e) => { console.error(e); process.exit(1); });
