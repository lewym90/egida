// Ocena komunikatów: waga (danger / important / info), czas ważności, odwołania.
// Zasada nadrzędna: lepiej zbyt ostrożnie niż zbyt spokojnie – komunikatu, którego nie rozumiemy, a który jest od RCB, nie uciszamy.
const H = 36e5;
export const DEFAULT_TTL_H = { rcb: 12, drogi: 6, woda: 48, pogoda: 24, inne: 24 };

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const CANCEL_RE = /(zakonczyl[ao]?\s+sie|zakonczenie|zakonczony|odwola|koniec\s+(ataku|alarmu|zagrozenia)|ustapil|ustalo|przestal)/;
const ATTACK_RE = /(atak|nalot|ostrzal|alarm\s+powietrzn|zagrozenie\s+z\s+powietrza|rakiet|\bdron|pociski?\b|obiekty?\s+latajac)/;
const AIR_RE = /(ukrain|powietrzn|rakiet|\bdron|latajac|polsk)/;

export const degreeOf = (a) => { const m = /(\d)\s*\.?\s*stop(?:ie|ni)/i.exec(String(a.title || "")); return m ? Number(m[1]) : 0; };

/** Czas utrudnienia z treści: „czas utrudnienia: 2 godz”, „30 min”. Zwraca ms albo null. */
export function durationFromText(text) {
  const t = norm(text);
  const m = /(?:czas\s+utrudnien\w*|potrwa\w*|przez|okolo)\s*:?\s*(\d+(?:[.,]\d+)?)\s*(godz|h\b|min)/.exec(t);
  if (!m) return null;
  const v = parseFloat(m[1].replace(",", "."));
  return m[2] === "min" ? v * 6e4 : v * H;
}

const LIFE_RE = /(zagrozenie\s+zycia|zagrozenie\s+dla\s+zycia|natychmiast\w*\s+(sie\s+)?(schron|ukry|opusc|ewakuuj)|schron\w*\s+sie\s+natychmiast|ukryj\s+sie)/;
const FLOOD_RE = /(powodz|stan\s+alarmow|wezbran|przybor|przelanie|zalani)/;
const DRY_RE = /(susz|nizowk|niskimi?\s+przeplyw|ponizej\s+snq)/;

/** Rodzaj i waga jednego komunikatu. Ocena wg CAŁEJ treści; samo pole „alarm” z RSO ani pojedyncze słowo nie decyduje. */
export function classifyOne(a) {
  const t = norm(`${a.title || ""} ${a.body || ""}`);
  const type = a.type || "inne";
  const cancel = CANCEL_RE.test(t) && (type === "rcb" || ATTACK_RE.test(t) || /ukrain|powietrzn/.test(t));
  const airType = type === "rcb" || type === "inne";
  const attack = !cancel && airType && ATTACK_RE.test(t) && AIR_RE.test(t);
  let sev = "info", kind = type;
  if (cancel) { sev = "info"; kind = "odwolanie"; }
  else if (attack) { sev = "danger"; kind = "atak"; }
  else if (type === "rcb") { if (LIFE_RE.test(t)) { sev = "danger"; kind = "zagrozenie"; } else sev = "important"; }
  else if (type === "pogoda") { const d = degreeOf({ title: a.title }) || degreeOf({ title: a.body }); sev = d >= 3 ? "danger" : d === 2 ? "important" : "info"; if (sev === "danger") kind = "pogoda3"; }
  else if (type === "woda" && FLOOD_RE.test(t) && !DRY_RE.test(t)) { const d = degreeOf({ title: a.title }) || degreeOf({ title: a.body }); sev = d >= 3 ? "danger" : d === 2 ? "important" : "info"; if (sev === "danger") kind = "pogoda3"; }
  return { sev, kind, cancel, attack };
}

/**
 * Dodaje do każdego komunikatu pola: sev, kind, expiresAt (ms|null), active, supersededBy.
 * Odwołanie („zakończył się atak…”) kończy wcześniejsze alarmy/ataki o tym samym zasięgu.
 */
export function analyze(items, now = Date.now()) {
  const list = (items || []).map((a) => ({ ...a, ...classifyOne(a) }));
  const cancels = list.filter((a) => a.cancel);
  for (const a of list) {
    let exp = null;
    const pub = a.published ? new Date(a.published).getTime() : null;
    if (a.validTo && !isNaN(new Date(a.validTo))) exp = new Date(a.validTo).getTime();
    else if (pub != null) {
      const dur = a.type === "drogi" ? durationFromText(`${a.title} ${a.body || ""}`) : null;
      exp = pub + (dur != null ? dur : (DEFAULT_TTL_H[a.type] ?? DEFAULT_TTL_H.inne) * H);
    }
    // Komunikaty tylko informacyjne starsze niż 7 dni trafiają do „Wcześniejszych”, nawet gdy źródło podaje „do odwołania”.
    if (a.sev === "info" && !a.cancel && pub != null) { const cap = pub + (a.type === "drogi" ? 24 : 7 * 24) * H; exp = exp == null ? cap : Math.min(exp, cap); }
    a.expiresAt = exp;
    a.supersededBy = null;
    if (a.sev === "danger" && a.published) {
      const c = cancels.find((c) => c.published && c.published >= a.published && (c.voivodeship === "all" || c.voivodeship === a.voivodeship));
      if (c) a.supersededBy = c.id || true;
    }
    a.active = !a.supersededBy && (exp == null || exp > now);
  }
  return linkRelated(list);
}

export const statusOf = (active) => (active.some((a) => a.sev === "danger") ? "alarm" : active.some((a) => a.sev === "important") ? "warn" : "calm");

/** Czyści treść komunikatu do jednego, czytelnego zdania (bez urywania w środku skrótu, np. „pow.”, i bez niedomkniętych nawiasów). */
export function summarize(text, max = 150) {
  let x = String(text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  x = x.replace(/^[„"“”'\s]+/, "").replace(/^(komunikat|alert rcb|alert)\s*:\s*/i, "").replace(/^[„"“”'\s]+/, "");
  if (!x) return "";
  x = x[0].toUpperCase() + x.slice(1);
  let cut = -1;
  const re = /[.!?](?=\s+[\p{Lu}„"])/gu;
  let m;
  while ((m = re.exec(x))) {
    const before = x.slice(0, m.index).split(/\s+/).pop();
    if (/^\p{Ll}{1,4}$/u.test(before) || /^\p{Lu}$/u.test(before) || /\d$/.test(before)) continue; // skrót lub numer porządkowy
    if (m.index < 30) continue;
    cut = m.index + 1; break;
  }
  let r = cut > 0 ? x.slice(0, cut) : x;
  if (r.length > max) {
    r = r.slice(0, max);
    r = r.slice(0, Math.max(r.lastIndexOf(" "), 40));
    const open = r.lastIndexOf("(");
    if (open > 30 && r.indexOf(")", open) < 0) r = r.slice(0, open).trimEnd();
    r = r.replace(/[\s,;:–-]+$/, "") + "…";
  }
  return r;
}

const STOP = new Set(["komunikat", "alert", "woda", "dotyczy", "sledz", "zakaz", "uwaga", "gmina", "powiat", "wojewodztwo", "polska", "polski", "drogi", "droga", "kierunek", "samochody"]);
const places = (a) => new Set((`${a.title || ""} ${a.body || ""}`.match(/\p{Lu}\p{Ll}{4,}/gu) || []).map(norm).filter((w) => !STOP.has(w)));
const RANK = { danger: 2, important: 1, info: 0 };

/** Wiąże ten sam wydarzenie opisane w kilku komunikatach (np. alert RCB i komunikat o wodzie z tymi samymi miejscowościami). Słabszy dostaje relatedTo = id silniejszego. */
export function linkRelated(list) {
  const P = list.map(places);
  for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
    if (i === j) continue;
    const a = list[i], b = list[j];
    if (a.relatedTo || a.voivodeship !== b.voivodeship && a.voivodeship !== "all" && b.voivodeship !== "all") continue;
    const stronger = RANK[b.sev] > RANK[a.sev] || (RANK[b.sev] === RANK[a.sev] && b.type === "rcb" && a.type !== "rcb");
    if (!stronger || b.relatedTo) continue;
    const ta = a.published ? new Date(a.published).getTime() : null, tb = b.published ? new Date(b.published).getTime() : null;
    if (ta != null && tb != null && Math.abs(ta - tb) > 96 * H) continue;
    let shared = 0; for (const w of P[i]) if (P[j].has(w)) shared++;
    if (shared >= 3) a.relatedTo = b.id;
  }
  return list;
}
