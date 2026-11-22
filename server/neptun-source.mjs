// Skąd serwer EGIDA bierze listę obiektów NEPTUN (obserwator Telegram, dziennik): najpierw lokalny przekaźnik
// (jedno połączenie z NEPTUN dla wszystkich – NEPTUN nie dostaje dodatkowych zapytań), a gdy go nie ma albo nie ma świeżych danych
// (503) – bezpośrednio REST NEPTUN, jak dawniej.
// NEPTUN_RELAY_LOCAL=off – zawsze bezpośrednio; ustawienie NEPTUN_REST (testy) bez NEPTUN_RELAY_LOCAL też pomija przekaźnik.
export const NEPTUN_REST_URL = process.env.NEPTUN_REST || "https://neptun.in.ua/api/v1/threats";
export function relayLocalUrl(env = process.env) {
  const v = env.NEPTUN_RELAY_LOCAL;
  if (v === "off") return "";
  if (v) return v;
  if (env.NEPTUN_REST) return "";
  return `http://127.0.0.1:${env.NEPTUN_RELAY_PORT || 8790}/egida/neptun/snapshot`;
}

/** Zwraca { ok:true, json, text, status, via:"relay"|"neptun" } albo { ok:false, status?, error, via }. Nigdy nie rzuca. */
export async function fetchThreats({ ua, timeoutMs = 10000, relayUrl = relayLocalUrl(), restUrl = NEPTUN_REST_URL, fetchImpl = fetch } = {}) {
  if (relayUrl) {
    try {
      const r = await fetchImpl(relayUrl, { headers: { "user-agent": ua, accept: "application/json" }, signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const text = await r.text();
        const json = JSON.parse(text);
        if (json && Array.isArray(json.threats)) return { ok: true, json, text, status: r.status, via: "relay" };
      }
    } catch { /* przekaźnik nie działa – idziemy bezpośrednio */ }
  }
  try {
    const r = await fetchImpl(restUrl, { headers: { "user-agent": ua, accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    const text = await r.text();
    if (!r.ok) return { ok: false, status: r.status, error: "http", text, via: "neptun" };
    let json;
    try { json = JSON.parse(text); } catch { return { ok: false, status: r.status, error: "notjson", text, via: "neptun" }; }
    return { ok: true, json, text, status: r.status, via: "neptun" };
  } catch (e) { return { ok: false, error: "network", message: String(e?.message || e), via: "neptun" }; }
}
