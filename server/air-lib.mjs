// Jakość powietrza (GIOŚ, API v1): czysta logika parsowania, testowalna bez sieci.
export const AIR_BASE = "https://api.gios.gov.pl/pjp-api/v1/rest";
export const AIR_LEVELS = ["Bardzo dobry", "Dobry", "Umiarkowany", "Dostateczny", "Zły", "Bardzo zły"];
const norm = (s) => String(s ?? "").trim().toLowerCase();
/** Nazwa kategorii indeksu → liczba 0–5 (0 = bardzo dobry) albo null. */
export function levelOf(name) {
  const i = AIR_LEVELS.findIndex((l) => norm(l) === norm(name));
  return i >= 0 ? i : null;
}
/** Odpowiedź /station/findAll → [{id,name,lat,lon}] (tylko stacje z poprawnymi współrzędnymi w okolicach Polski). */
export function parseStations(json) {
  const list = Array.isArray(json?.["Lista stacji pomiarowych"]) ? json["Lista stacji pomiarowych"] : [];
  const out = [];
  for (const s of list) {
    const id = Number(s?.["Identyfikator stacji"]);
    const lat = Number(String(s?.["WGS84 φ N"] ?? "").replace(",", ".")), lon = Number(String(s?.["WGS84 λ E"] ?? "").replace(",", "."));
    if (!Number.isInteger(id) || !(lat >= 48 && lat <= 56 && lon >= 13 && lon <= 25)) continue;
    out.push({ id, name: String(s?.["Nazwa stacji"] ?? "").trim().slice(0, 80), lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 });
  }
  return out;
}
/** Odpowiedź /aqindex/getIndex/{id} → { idx, at } albo null (brak indeksu). */
export function parseIndex(json) {
  const a = json?.AqIndex;
  if (!a || typeof a !== "object") return null;
  const idx = levelOf(a["Nazwa kategorii indeksu"]);
  if (idx == null) return null;
  const at = String(a["Data wykonania obliczeń indeksu"] ?? a["Data danych źródłowych, z których policzono wartość indeksu dla wskaźnika st"] ?? "").slice(0, 19);
  return { idx, at };
}
