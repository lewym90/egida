// EGIDA – „wczesne ostrzeżenie”: wiadomości ukraińskich kanałów monitoringu i Sił Powietrznych ZSU o celach w obwodach
// przy granicy z Polską. Czysta logika (bez sieci i plików), testowalna w Node.
// Źródła: wiadomości z NEPTUN (/messages i WebSocket – 89 kanałów) oraz publiczny podgląd kanału Sił Powietrznych (t.me/s/kpszsu).
import { appLink } from "./tg-policy.mjs";
// To NIE jest alarm ani pozycja obiektu – tylko sygnał „coś leci w stronę zachodniej Ukrainy / Polski”, zwykle kilka–kilkanaście minut wcześniej.

export const LIMITS = {
  activeMin: 30,       // ostrzeżenie trwa 30 min od ostatniej pasującej wiadomości
  maxAgeMin: 30,       // starszych wiadomości nie bierzemy pod uwagę
  maxLen: 400,         // dłuższe wpisy to podsumowania/artykuły, nie bieżący monitoring
  maxItems: 8,
  confirmMin: 10,      // bez Sił Powietrznych potrzebne 2 różne kanały w ciągu 10 min, żeby wysłać na Telegram
  tgGapMin: 20,        // najwyżej jedno ostrzeżenie na województwo co 20 min (wyjątek: eskalacja dron → rakieta, strefa zachód → granica)
  seenMax: 5000,
};

// Obwody (lowercase, litery ukraińskie i rosyjskie). Granice słów robimy ręcznie: \b w JS nie działa dla cyrylicy.
const L = "\\p{L}";
const word = (body) => new RegExp(`(?<!${L})(?:${body})(?!${L})`, "iu");
export const OBLASTS = [
  { id: "volyn", zone: "border", pl: "wołyński", re: word(`волин${L}*|луцьк${L}*|луцк${L}*|ковел${L}*|нововолинськ${L}*|любомл${L}*|шацьк${L}*|ратн${L}*`) },
  { id: "lviv", zone: "border", pl: "lwowski", re: word(`льв[іо]в${L}*|шептицьк${L}*|червоноград${L}*|яворів${L}*|рава-руськ${L}*|мостиськ${L}*|самбір${L}*|самбор${L}*|дрогобич${L}*|стри[йю]${L}*|сокал${L}*`) },
  { id: "rivne", zone: "west", pl: "rówieński", re: word(`рівненщин${L}*|рівне|рівного|рівному|рівненськ${L}*|ровенск${L}*|сарн${L}*|дубн${L}*|вараш${L}*`) },
  { id: "ternopil", zone: "west", pl: "tarnopolski", re: word(`тернопіл${L}*|тернопол${L}*`) },
  { id: "ivano", zone: "west", pl: "iwanofrankiwski", re: word(`івано-франків${L}*|франківщин${L}*|франківськ${L}*|прикарпатт${L}*|ивано-франковск${L}*|калуш${L}*`) },
  { id: "zakarpattia", zone: "west", pl: "zakarpacki", re: word(`закарпат${L}*|ужгород${L}*|мукачев${L}*`) },
];
const POLAND = word(`польщ${L}*|польш${L}*|польськ${L}*|польск${L}*|поляк${L}*`);
const MISSILE = word(`ракет${L}*|крилат${L}*|крылат${L}*|балістик${L}*|баллистик${L}*|кр|калібр${L}*|калибр${L}*|х-101|x-101|х-555|х-22|кинджал${L}*|кинжал${L}*|іскандер${L}*|искандер${L}*|циркон${L}*`);
const DRONE = word(`бпла|безпілотник${L}*|беспилотник${L}*|шахед${L}*|шахід${L}*|герань${L}*|гербер${L}*|дрон${L}*|мопед${L}*`);
const TARGET = word(`ціль|цілі|цілей|цілями|цель|цели|целей`);
const CANCEL = word(`відбій|отбой|відбою`);
const WEST = word(`курсом на захід|на захід|західн${L}* напрям${L}*|північно-захід${L}*|північний захід|південно-захід${L}*|південний захід|на запад|западн${L}* направлен${L}*`);
const OFFICIAL = /kpszsu|повітряні сили|air force/i;

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeHtml(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

/** Publiczny podgląd kanału Telegram (t.me/s/<kanał>) → [{ id, channel, date, text }] (od najstarszej). */
export function parseTgPreview(html, channel) {
  const out = [];
  for (const part of String(html).split('class="tgme_widget_message_wrap').slice(1)) {
    const post = /data-post="([^"]+)"/.exec(part)?.[1];
    const date = /<time datetime="([^"]+)"/.exec(part)?.[1];
    const m = /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(part);
    if (!post || !date || !m) continue;
    const text = decodeHtml(m[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").trim();
    const t = Date.parse(date);
    if (!text || !Number.isFinite(t)) continue;
    out.push({ id: "tg:" + post, channel: "@" + channel, date: new Date(t).toISOString(), text });
  }
  return out;
}

function assessOne(t) {
  const obl = OBLASTS.filter((o) => o.re.test(t));
  const poland = POLAND.test(t);
  if (!obl.length && !poland) return null;
  if (CANCEL.test(t)) return { oblasts: obl.map((o) => o.id), zone: null, weapon: null, poland, west: false, cancel: true };
  const weapon = MISSILE.test(t) ? "rakieta" : DRONE.test(t) || /🏍|🛵|🛸/u.test(t) ? "dron" : TARGET.test(t) ? "cel" : null;
  if (!weapon) return null; // pogoda, polityka, wiadomości bez obiektu w powietrzu
  const zone = poland || obl.some((o) => o.zone === "border") ? "border" : "west";
  return { oblasts: obl.map((o) => o.id), zone, weapon, poland, west: WEST.test(t), cancel: false };
}
/**
 * Ocena jednej wiadomości. Zwraca null albo { oblasts, zone, weapon, poland, west, cancel, excerpt }.
 * Wiadomość wielowierszowa (Siły Powietrzne często podają kilka obwodów naraz) – każdy wiersz osobno, żeby kurs czy broń
 * z wiersza o innym obwodzie nie przyczepiły się do zachodu; excerpt = tylko pasujące wiersze.
 */
export function assessEarly(text) {
  const t = String(text || "");
  if (!t || t.length > LIMITS.maxLen) return null;
  const lines = t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (lines.length > 1) {
    const hits = lines.map((l) => [l, assessOne(l)]).filter(([, a]) => a && !a.cancel);
    if (hits.length) {
      const as = hits.map(([, a]) => a);
      return {
        oblasts: [...new Set(as.flatMap((a) => a.oblasts))], zone: as.some((a) => a.zone === "border") ? "border" : "west",
        weapon: as.reduce((w, a) => (RANK[a.weapon] > RANK[w] ? a.weapon : w), "cel"), poland: as.some((a) => a.poland), west: as.some((a) => a.west),
        cancel: false, excerpt: hits.map(([l]) => l).join("\n"),
      };
    }
  }
  const a = assessOne(t);
  return a ? { ...a, excerpt: t } : null;
}

const RANK = { cel: 0, dron: 1, rakieta: 2 };
const keyOf = (m) => m.id || `${m.channel}|${m.date}|${m.text}`;

/** Stan ostrzeżenia: zbiera pasujące wiadomości z wielu źródeł, bez powtórzeń. */
export class EarlyState {
  constructor() { this.seen = new Map(); this.items = []; this.cancels = []; }
  /** msg = { id?, channel, date (ISO), text }. Zwraca true, gdy zmienił się stan. */
  add(msg, now) {
    const at = Date.parse(msg?.date);
    if (!msg?.text || !Number.isFinite(at)) return false;
    const k = keyOf(msg);
    if (this.seen.has(k)) return false;
    this.seen.set(k, at);
    if (this.seen.size > LIMITS.seenMax) for (const kk of [...this.seen.keys()].slice(0, this.seen.size - LIMITS.seenMax)) this.seen.delete(kk);
    if (now - at > LIMITS.maxAgeMin * 6e4 || at - now > 5 * 6e4) return false; // stare albo z przyszłości (zły zegar)
    const a = assessEarly(msg.text);
    if (!a) return false;
    // ta sama treść z innego kanału (przedruk) – dokładamy tylko źródło
    const norm = msg.text.replace(/\s+/g, " ").trim().toLowerCase();
    if (a.cancel) { this.cancels.push({ at, oblasts: a.oblasts }); return true; }
    const dup = this.items.find((x) => x.norm === norm && Math.abs(x.at - at) < 10 * 6e4);
    if (dup) { if (!dup.channels.includes(msg.channel)) { dup.channels.push(msg.channel); return true; } return false; }
    const { excerpt, ...rest } = a;
    this.items.push({ key: k, at, channels: [msg.channel], official: OFFICIAL.test(msg.channel), text: String(excerpt || msg.text).slice(0, 300), norm, ...rest });
    return true;
  }
  prune(now) {
    this.items = this.items.filter((x) => now - x.at <= LIMITS.activeMin * 6e4);
    this.cancels = this.cancels.filter((c) => now - c.at <= LIMITS.activeMin * 6e4);
  }
  /** Bieżące pozycje (najnowsze pierwsze), bez tych odwołanych późniejszym „відбій” dla wszystkich ich obwodów. */
  active(now) {
    this.prune(now);
    return this.items
      .filter((x) => !(x.oblasts.length && x.oblasts.every((o) => this.cancels.some((c) => c.at > x.at && c.oblasts.includes(o)))))
      .sort((a, b) => b.at - a.at);
  }
  /** Dane dla aplikacji i obserwatora Telegram. */
  snapshot(now) {
    const act = this.active(now);
    const level = act.some((x) => x.zone === "border") ? "border" : act.length ? "west" : null;
    return {
      level,
      weapon: act.reduce((w, x) => (RANK[x.weapon] > RANK[w] ? x.weapon : w), act.length ? "cel" : null),
      lastAt: act[0] ? new Date(act[0].at).toISOString() : null,
      items: act.slice(0, LIMITS.maxItems).map((x) => ({ key: x.key, at: new Date(x.at).toISOString(), channels: x.channels, official: x.official, text: x.text, oblasts: x.oblasts, zone: x.zone, weapon: x.weapon, poland: x.poland, west: x.west })),
    };
  }
}

// Które województwa dostają ostrzeżenie (obwody graniczące z Polską i ich najbliższe sąsiedztwo).
export const TG_REGIONS = { volyn: ["lubelskie"], lviv: ["podkarpackie", "lubelskie"], poland: ["lubelskie", "podkarpackie"] };

/** Czy pozycja jest wiarygodna dla Telegram: Siły Powietrzne ZSU albo ≥ 2 różne kanały w ciągu confirmMin. */
export function confirmed(item, all) {
  if (item.official) return true;
  const at = Date.parse(item.at);
  const chans = new Set();
  for (const x of all) {
    if (Math.abs(Date.parse(x.at) - at) > LIMITS.confirmMin * 6e4) continue;
    if (!x.oblasts.some((o) => item.oblasts.includes(o)) && !(x.poland && item.poland)) continue;
    x.channels.forEach((c) => chans.add(c));
  }
  return chans.size >= 2;
}

/**
 * Decyzja o wysyłce na Telegram. snap = EarlyState.snapshot(), state = { sent: { <region>: { at, weapon, keys:[] } } }.
 * Zwraca { byRegion: { <region>: [item…] }, state } (nie zmienia przekazanego state). Tylko strefa „border”, tylko potwierdzone.
 */
export function decideEarly(snap, stateIn, now) {
  const state = { sent: { ...(stateIn?.sent || {}) } };
  for (const [r, v] of Object.entries(state.sent)) if (now - v.at > 6 * 36e5) delete state.sent[r];
  const byRegion = {};
  for (const it of snap?.items || []) {
    if (it.zone !== "border" || !confirmed(it, snap.items)) continue;
    if (now - Date.parse(it.at) > 10 * 6e4) continue; // nie wysyłamy zaległych (np. po restarcie)
    const regs = new Set([...it.oblasts.flatMap((o) => TG_REGIONS[o] || []), ...(it.poland ? TG_REGIONS.poland : [])]);
    for (const r of regs) {
      const prev = state.sent[r];
      if (prev?.keys?.includes(it.key)) continue;
      const escalation = prev && RANK[it.weapon] > RANK[prev.weapon];
      if (prev && now - prev.at < LIMITS.tgGapMin * 6e4 && !escalation) continue;
      (byRegion[r] ||= []).push(it);
    }
  }
  return { byRegion, state };
}
export function markEarlySent(state, region, items, now) {
  const prev = state.sent[region];
  const w = items.reduce((m, x) => (RANK[x.weapon] > RANK[m] ? x.weapon : m), prev && now - prev.at < LIMITS.tgGapMin * 6e4 ? prev.weapon : "cel");
  state.sent[region] = { at: now, weapon: w, keys: [...new Set([...(prev?.keys || []), ...items.map((x) => x.key)])].slice(-50) };
}

const NAMES = { lubelskie: "Lubelskie", podkarpackie: "Podkarpackie" };
const OBL_PL = Object.fromEntries(OBLASTS.map((o) => [o.id, o.pl]));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hhmmPl = (iso) => new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
export const WEAPON_PL = { rakieta: "rakiety", dron: "drony", cel: "cele powietrzne" };
export function whereText(it) {
  const o = it.oblasts.map((x) => OBL_PL[x]).filter(Boolean);
  const parts = [];
  if (o.length) parts.push(`obwód ${o.join(" / ")}`);
  if (it.poland) parts.push("wzmianka o Polsce");
  return parts.join(", ") || "zachodnia Ukraina";
}
/** Treść wiadomości Telegram (HTML). */
export function buildEarlyMessage(region, items, { appUrl = "" } = {}) {
  const top = items.reduce((m, x) => (RANK[x.weapon] > RANK[m.weapon] ? x : m), items[0]);
  const lines = items.slice(0, 3).map((x) => `• ${hhmmPl(x.at)} – ${esc(whereText(x))}${x.west ? ", kurs na zachód" : ""}\n  „${esc(x.text.slice(0, 180))}” <i>(${esc(x.official ? "Siły Powietrzne ZSU" : x.channels.join(", "))})</i>`);
  return `🟡 <b>WCZESNE OSTRZEŻENIE · NIEOFICJALNE</b> · ${esc(NAMES[region] || region)}\n` +
    `<b>Ukraińskie źródła zgłaszają ${esc(WEAPON_PL[top.weapon])} przy granicy z Polską</b>\n${lines.join("\n")}\n\n` +
    `⚠️ To <b>nie jest alarm dla Polski</b>. Obiekt może zmienić kurs albo zostać zestrzelony. Bądź w gotowości: sprawdź, gdzie jest najbliższe schronienie. ` +
    `Jeśli zabrzmią syreny albo przyjdzie Alert RCB – działaj według nich.\n` +
    `📲 Aplikacja: ${appLink(appUrl)}\n` + `Źródła: Siły Powietrzne ZSU (t.me/kpszsu), kanały monitoringu przez NEPTUN (neptun.in.ua)`;
}
