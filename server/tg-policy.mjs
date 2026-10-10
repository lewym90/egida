// Reguły wysyłki na Telegram wg WAGI komunikatu (ta sama ocena co w aplikacji: ../js/classify.js).
//  - czerwony (danger)  → „ZAGROŻENIE”: atak/alarm z powietrza, zagrożenie życia, ostrzeżenie 3. stopnia, powódź 3. stopnia,
//  - żółty (important)  → „OSTRZEŻENIE”: pozostałe alerty RCB, pogoda i powódź 2. stopnia,
//  - odwołanie          → „ODWOŁANIE”, ale tylko jeśli wcześniej wysłaliśmy zagrożenie dla tego zasięgu (ostatnie 24 h),
//  - reszta (drogi, susza, ozon, pogoda 1. stopnia, informacje) zostaje tylko w aplikacji.
import { analyze } from "../js/classify.js";

const H = 36e5;
export const NAMES = { dolnoslaskie: "Dolnośląskie", "kujawsko-pomorskie": "Kujawsko-pomorskie", lubelskie: "Lubelskie", lubuskie: "Lubuskie", lodzkie: "Łódzkie", malopolskie: "Małopolskie", mazowieckie: "Mazowieckie", opolskie: "Opolskie", podkarpackie: "Podkarpackie", podlaskie: "Podlaskie", pomorskie: "Pomorskie", slaskie: "Śląskie", swietokrzyskie: "Świętokrzyskie", "warminsko-mazurskie": "Warmińsko-mazurskie", wielkopolskie: "Wielkopolskie", zachodniopomorskie: "Zachodniopomorskie" };
const TYPE_NAMES = { rcb: "Alert RCB", pogoda: "Pogoda", woda: "Woda", drogi: "Drogi", inne: "Komunikat" };
const LEVEL = { danger: { icon: "🔴", label: "ZAGROŻENIE" }, important: { icon: "🟠", label: "OSTRZEŻENIE" }, cancel: { icon: "✅", label: "ODWOŁANIE" } };

const sameScope = (key, v) => key === "all" || v === "all" || key === v;
/** Czy w ciągu ostatnich 24 h wysłaliśmy zagrożenie, które to odwołanie może kończyć. */
export const hadDanger = (state, a, now) => Object.entries(state.danger || {}).some(([k, t]) => now - t < 24 * H && sameScope(k, a.voivodeship));

/**
 * Wybiera komunikaty do wysłania. fresh = świeże dane z RSO, state = { sent, danger }.
 * Zwraca [{ a, level }] (level: danger | important | cancel).
 */
export function selectForTelegram(fresh, state, { now = Date.now(), recentH = 6 } = {}) {
  const list = analyze(fresh, now);
  const ids = new Set(list.map((x) => x.id));
  const out = [];
  for (const a of list) {
    if (state.sent?.[a.id]) continue;
    const pub = a.published ? new Date(a.published).getTime() : null;
    if (pub != null && pub < now - recentH * H) continue;
    if (a.relatedTo && ids.has(a.relatedTo)) continue; // to samo wydarzenie opisane drugi raz (słabszy wpis) – wysyłamy tylko główny
    if (a.cancel) { if (hadDanger(state, a, now)) out.push({ a, level: "cancel" }); continue; }
    if (!a.active) continue; // wygasły albo odwołany, zanim zdążyliśmy go wysłać
    if (a.sev === "danger") out.push({ a, level: "danger" });
    else if (a.sev === "important") out.push({ a, level: "important" });
  }
  return out;
}

const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const when = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };

/** Treść wiadomości na kanał (HTML Telegrama; cały tekst z zewnątrz jest escapowany). */
export function tgText(a, level, { appUrl = "" } = {}) {
  const L = LEVEL[level] || LEVEL.important;
  const region = a.voivodeship === "all" ? "cała Polska" : NAMES[a.voivodeship] || a.voivodeship;
  const head = `${L.icon} <b>${L.label}</b> · ${escHtml(TYPE_NAMES[a.type] || "Komunikat")} · ${escHtml(region)}`;
  const t = when(a.published);
  const body = a.body ? `\n${escHtml(String(a.body).slice(0, 500))}` : "";
  const time = t ? `\n🕒 ${escHtml(t)}` : "";
  const src = `\n\nŹródło: ${escHtml(a.source)}${a.url ? ` · ${escHtml(a.url)}` : ""}`;
  const follow = `\n\n📲 <b>Śledź rozwój sytuacji w aplikacji EGIDA</b>${appUrl ? `: ${escHtml(appUrl)}` : ""}\n🛡 Stosuj się do zaleceń służb, kieruj się syrenami i Alertem RCB. W zagrożeniu życia dzwoń <b>112</b>.`;
  const foot = `\n<i>EGIDA to nieoficjalna aplikacja informacyjna. Dane mogą być opóźnione lub niepełne.</i>`;
  return `${head}\n<b>${escHtml(a.title)}</b>${body}${time}${src}${follow}${foot}`;
}
