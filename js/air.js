// Jakość powietrza (indeks GIOŚ) z najbliższej stacji. Czysta logika bez DOM; dane pobiera app.js z CONFIG.airUrl.
export const AIR_NAMES = ["Bardzo dobry", "Dobry", "Umiarkowany", "Dostateczny", "Zły", "Bardzo zły"];
// kolor tła i tekstu dla poziomu 0–5 (spójne z paletą aplikacji; kolor nie jest jedynym nośnikiem informacji – jest też nazwa)
export const AIR_TONE = ["ok", "ok", "ok", "warn", "alert", "alert"];
export const AIR_ADVICE = [
  "Powietrze jest czyste. Możesz bez obaw przebywać na dworze.",
  "Powietrze jest dobre. Brak ograniczeń.",
  "Powietrze jest akceptowalne. Osoby bardzo wrażliwe mogą odczuwać dyskomfort.",
  "Osoby chore na serce i płuca, dzieci i seniorzy powinni ograniczyć długi wysiłek na dworze.",
  "Ogranicz przebywanie na dworze, zwłaszcza dzieci, seniorzy i osoby z chorobami serca i płuc. Rozważ maseczkę FFP2.",
  "Unikaj przebywania na dworze. Zamknij okna, osoby z chorobami serca i płuc niech zostaną w domu.",
];
const rad = (x) => (x * Math.PI) / 180;
export function distKm(la1, lo1, la2, lo2) {
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
/** Czyści plik air.json; zwraca null, gdy kształt jest zły albo dane starsze niż maxAgeH godzin. */
export function normalizeAir(raw, { now = Date.now(), maxAgeH = 6 } = {}) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.stations)) return null;
  const t = Date.parse(raw.updated);
  if (!Number.isFinite(t) || now - t > maxAgeH * 3600e3 || t - now > 3600e3) return null;
  const stations = raw.stations.filter((s) => s && Number.isFinite(s.la) && Number.isFinite(s.lo) && Number.isInteger(s.i) && s.i >= 0 && s.i <= 5)
    .map((s) => ({ id: s.id, n: String(s.n || "").slice(0, 80), la: s.la, lo: s.lo, i: s.i }));
  return stations.length ? { updated: raw.updated, stations } : null;
}
/** Najbliższa stacja w promieniu maxKm albo null. */
export function nearestStation(air, lat, lon, maxKm = 40) {
  if (!air || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null, bd = Infinity;
  for (const s of air.stations) { const d = distKm(lat, lon, s.la, s.lo); if (d < bd) { bd = d; best = s; } }
  return best && bd <= maxKm ? { ...best, km: bd } : null;
}
