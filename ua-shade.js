// Cieniowanie obwodów Ukrainy z alarmem powietrznym (dane o alarmach: NEPTUN; granice: Natural Earth). Bez DOM, żeby dało się testować w Node.
// Zasada: cieniujemy cały obwód tylko wtedy, gdy NEPTUN podaje alarm dla CAŁEGO obwodu. Gdy alarm dotyczy tylko niektórych rejonów,
// obwód dostaje lżejsze, „częściowe” cieniowanie (nie mamy granic rejonów, więc nie zgadujemy, które jego części są objęte).
import { UA_OBLASTS } from "./ua-oblasts.js";

const apos = /[’ʼ`´]/g;
/** „Донецька область” → „донецька”; „м. Київ” / „Київ” / „місто Київ” → „київ” (miasto), „Київська область” → „київська” (obwód). */
export function oblastKey(name) {
  let n = String(name ?? "").toLowerCase().replace(apos, "'").replace(/\s+/g, " ").trim();
  n = n.replace(/^(?:м\.|місто)\s*/, "").replace(/\s*(?:область|обл\.?)$/, "").trim();
  return n;
}
const INDEX = new Map(Object.entries(UA_OBLASTS).map(([name, rings]) => [oblastKey(name), { name, rings }]));

/**
 * alerts: aktywne alarmy z buildView (pola: region, oblastRaw, scope: "oblast" | "raion", reasons, since).
 * Zwraca { areas: [{ key, name, regionPl, rings, whole, raions, reasons[], since }], unmatched: [nazwy bez granic] }.
 */
export function shadeAreas(alerts) {
  const by = new Map(), unmatched = new Set();
  for (const a of Array.isArray(alerts) ? alerts : []) {
    if (!a || a.active === false) continue;
    const key = oblastKey(a.oblastRaw || a.region);
    const geo = INDEX.get(key);
    if (!geo) { unmatched.add(a.region || a.oblastRaw || "?"); continue; }
    const g = by.get(key) || { key, name: geo.name, regionPl: a.region, rings: geo.rings, whole: false, raions: 0, reasons: new Set(), since: null };
    if (a.scope === "oblast") g.whole = true; else g.raions++;
    for (const r of a.reasons || []) g.reasons.add(r);
    if (a.since != null && (g.since == null || a.since < g.since)) g.since = a.since;
    by.set(key, g);
  }
  const areas = [...by.values()].map((g) => ({ ...g, reasons: [...g.reasons] })).sort((x, y) => x.key.localeCompare(y.key, "uk"));
  return { areas, unmatched: [...unmatched] };
}
/** Skrót zawartości do porównania „czy trzeba przerysować”. */
export const shadeSignature = (areas) => areas.map((a) => `${a.key}|${a.whole ? 1 : 0}|${a.raions}|${a.reasons.join(",")}`).join(";");
