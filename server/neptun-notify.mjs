// Powiadomienia Telegram z NEPTUN (poziom 2, NIEOFICJALNE). Czysta logika (bez sieci i plików), żeby dało się ją testować.
// Warunek wysyłki (decyzja autora): obiekt bliżej niż 100 km od granicy Polski i z torem w stronę granicy (albo już nad Polską).
// Kanały: województwo, w którym tor wchodzi do Polski, oraz sąsiednie w promieniu 50 km od punktu wejścia.
// Deduplikacja: jedno powiadomienie na obiekt i kanał, ponowne tylko przy eskalacji (100 km → 50 km → nad Polską).
import { borderApproach, TYPES } from "../js/neptun.js";
import { regionsWithin } from "../js/regions.js";
import { compassPl } from "../js/geo.js";

export const NAMES = { dolnoslaskie: "Dolnośląskie", "kujawsko-pomorskie": "Kujawsko-pomorskie", lubelskie: "Lubelskie", lubuskie: "Lubuskie", lodzkie: "Łódzkie", malopolskie: "Małopolskie", mazowieckie: "Mazowieckie", opolskie: "Opolskie", podkarpackie: "Podkarpackie", podlaskie: "Podlaskie", pomorskie: "Pomorskie", slaskie: "Śląskie", swietokrzyskie: "Świętokrzyskie", "warminsko-mazurskie": "Warmińsko-mazurskie", wielkopolskie: "Wielkopolskie", zachodniopomorskie: "Zachodniopomorskie" };
export const LIMITS = { regionKm: 50, perRegionPerHour: 8, keepH: 6, maxItemsPerMessage: 4 };
const H = 36e5;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Z magazynu NEPTUN wybiera obiekty spełniające warunki. Zwraca { cands, skipped }. */
export function candidates(store, now, regions) {
  const cands = [], skipped = [];
  for (const t of store.items.values()) {
    const ap = borderApproach(t, now);
    if (!ap.ok) { skipped.push({ t, reason: ap.reason, distKm: ap.distKm ?? null }); continue; }
    const near = regionsWithin(ap.entry.lat, ap.entry.lon, regions, LIMITS.regionKm);
    cands.push({ t, ap, regions: near.map((r) => r.id), primary: near[0]?.id ?? null });
  }
  return { cands, skipped };
}

/**
 * Decyzja, co wysłać. state = { sent: { "<id>|<region>": { level, at } }, rate: { <region>: [ts…] } }.
 * Zwraca { byRegion: { <region>: [cand…] }, state }. Nie zmienia przekazanego state.
 */
export function decide(cands, stateIn, now) {
  const state = { sent: { ...(stateIn?.sent || {}) }, rate: { ...(stateIn?.rate || {}) } };
  for (const [k, v] of Object.entries(state.sent)) if (now - v.at > LIMITS.keepH * H) delete state.sent[k];
  for (const r of Object.keys(state.rate)) state.rate[r] = state.rate[r].filter((ts) => now - ts < H);
  const byRegion = {};
  for (const c of cands) {
    for (const r of c.regions) {
      const key = `${c.t.id}|${r}`, prev = state.sent[key];
      if (prev && c.ap.level >= prev.level) continue; // już wysłane na tym poziomie albo wyższym
      (byRegion[r] ||= []).push(c);
    }
  }
  // limit wiadomości na godzinę na kanał
  for (const r of Object.keys(byRegion)) if ((state.rate[r] || []).length >= LIMITS.perRegionPerHour) delete byRegion[r];
  return { byRegion, state };
}
/** Zapisuje w stanie, że wysłaliśmy (wywołać po udanej wysyłce). */
export function markSent(state, region, items, now) {
  for (const c of items) state.sent[`${c.t.id}|${region}`] = { level: c.ap.level, at: now };
  (state.rate[region] ||= []).push(now);
}

const fmtKm = (km) => (km < 10 ? km.toFixed(1) : String(Math.round(km))).replace(".", ",") + " km";
function line(c) {
  const { t, ap } = c;
  const typ = `${TYPES[t.type].label}${t.count > 1 ? ` ×${t.count}` : ""}`;
  const place = t.locality || t.district || t.region;
  const where = ap.level === 0 ? "nad terytorium Polski (wg NEPTUN)" : `ok. ${fmtKm(ap.distKm)} od granicy Polski`;
  const move = t.headingDeg != null ? `, kurs ${Math.round(t.headingDeg)}° (${compassPl(t.headingDeg)})${t.speedKmh ? `, ok. ${Math.round(t.speedKmh)} km/h` : ""}` : "";
  const trk = ap.level === 0 ? "" : `\n   Tor ${ap.centerHit ? "prowadzi" : "może prowadzić"} w stronę granicy${ap.etaMin != null && ap.etaMin <= 180 ? `, przy stałej prędkości za ok. ${Math.max(1, Math.round(ap.etaMin))} min` : ""}.`;
  const fast = TYPES[t.type].kind === "fast" ? "\n   Rakiety i bomby kierowane lecą bardzo szybko, a tor może się szybko zmienić." : "";
  return `• <b>${esc(typ)}</b>${place ? ` (${esc(place)})` : ""} – ${esc(where)}${esc(move)}${trk}${fast}`;
}

/** Treść wiadomości dla jednego kanału (HTML Telegrama). Zawiera wymagane przez NEPTUN zastrzeżenie i link do źródła. */
export function buildMessage(region, items, { appUrl = "" } = {}) {
  const sorted = [...items].sort((a, b) => a.ap.level - b.ap.level || a.ap.distKm - b.ap.distKm);
  const shown = sorted.slice(0, LIMITS.maxItemsPerMessage);
  const more = sorted.length - shown.length;
  const top = sorted[0].ap.level;
  const head = top === 0 ? "Obiekt nad terytorium Polski" : top === 50 ? "Obiekt blisko granicy, leci w jej stronę" : "Obiekt zbliża się do granicy";
  return `🟠 <b>NIEOFICJALNE · NEPTUN</b> · ${esc(NAMES[region] || region)}\n<b>${esc(head)}</b>\n${shown.map(line).join("\n")}${more > 0 ? `\n…i ${more} ${more === 1 ? "inny obiekt" : "innych obiektów"}.` : ""}\n\n` +
    `⚠️ To <b>nieoficjalna</b> informacja z serwisu NEPTUN (neptun.in.ua), a nie system ostrzegania. Może być spóźniona, niepełna lub błędna. Kieruj się syrenami, Alertem RCB i poleceniami służb. W zagrożeniu życia dzwoń <b>112</b>.\n` +
    `📲 Mapa na żywo w aplikacji EGIDA${appUrl ? `: ${esc(appUrl)}` : ""}\nŹródło danych: NEPTUN (neptun.in.ua)`;
}
