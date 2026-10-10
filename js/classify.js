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

/** Rodzaj i waga jednego komunikatu (bez uwzględniania odwołań innych komunikatów). */
export function classifyOne(a) {
  const t = norm(`${a.title || ""} ${a.body || ""}`);
  const cancel = CANCEL_RE.test(t) && (a.type === "rcb" || ATTACK_RE.test(t) || /ukrain|powietrzn/.test(t)) && !a.alarm;
  const attack = !cancel && (a.alarm || ((a.type === "rcb" || AIR_RE.test(t)) && ATTACK_RE.test(t) && AIR_RE.test(t)));
  let sev = "info", kind = a.type || "inne";
  if (cancel) { sev = "info"; kind = "odwolanie"; }
  else if (attack) { sev = "danger"; kind = a.alarm ? "alarm" : "atak"; }
  else if (a.type === "rcb") sev = "important";
  else if (a.type === "pogoda") { const d = degreeOf(a); sev = d >= 3 ? "danger" : d === 2 ? "important" : "info"; }
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
    a.expiresAt = exp;
    a.supersededBy = null;
    if (a.sev === "danger" && a.published) {
      const c = cancels.find((c) => c.published && c.published >= a.published && (c.voivodeship === "all" || c.voivodeship === a.voivodeship));
      if (c) a.supersededBy = c.id || true;
    }
    a.active = !a.supersededBy && (exp == null || exp > now);
  }
  return list;
}

export const statusOf = (active) => (active.some((a) => a.sev === "danger") ? "alarm" : active.some((a) => a.sev === "important") ? "warn" : "calm");
