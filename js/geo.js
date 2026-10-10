// Czysta geometria (bez DOM): odległości, kierunki, położenie punktu względem toru.
// Wszystko to SZACUNKI na kuli ziemskiej; dla odległości do kilkuset km błąd jest rzędu 1%.

export const R_KM = 6371.0088;
export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;
export const normDeg = (d) => ((d % 360) + 360) % 360;
/** Najmniejsza różnica kątów a−b w zakresie −180…180. */
export const angleDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

/** Odległość po powierzchni Ziemi w km. a, b = {lat, lon}. */
export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Kierunek początkowy z a do b w stopniach (0 = północ, 90 = wschód). */
export function bearingDeg(a, b) {
  const p1 = rad(a.lat), p2 = rad(b.lat), dl = rad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normDeg(deg(Math.atan2(y, x)));
}

/** Punkt odległy o distKm od p w kierunku bearing (stopnie). */
export function destination(p, bearing, distKm) {
  const d = distKm / R_KM, t = rad(bearing), p1 = rad(p.lat), l1 = rad(p.lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lon: ((deg(l2) + 540) % 360) - 180 };
}

/** Płaski układ lokalny wokół o (km): x = na wschód, y = na północ. */
export function toLocalKm(o, p) {
  return { x: rad(p.lon - o.lon) * R_KM * Math.cos(rad(o.lat)), y: rad(p.lat - o.lat) * R_KM };
}

/**
 * Położenie punktu p względem półprostej wychodzącej z origin w kierunku bearing.
 * alongKm > 0: punkt jest „przed” obiektem (obiekt leci w jego stronę); < 0: za nim.
 * crossKm: odchylenie boczne (dodatnie = po prawej stronie kierunku lotu).
 */
export function crossTrack(origin, bearing, p) {
  const { x, y } = toLocalKm(origin, p);
  const b = rad(bearing), ux = Math.sin(b), uy = Math.cos(b);
  return { alongKm: x * ux + y * uy, crossKm: x * uy - y * ux, distKm: Math.hypot(x, y) };
}

/** Czy punkt leży wewnątrz pierścienia ring = [[lon, lat], …] (algorytm promienia). */
export function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Najmniejsza odległość punktu od krawędzi pierścienia w km (niezależnie od tego, czy jest w środku). */
export function distToRingKm(p, ring) {
  const KY = rad(1) * R_KM, KX = KY * Math.cos(rad(p.lat));
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ax = (a[0] - p.lon) * KX, ay = (a[1] - p.lat) * KY, bx = (b[0] - p.lon) * KX, by = (b[1] - p.lat) * KY;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? -(ax * dx + ay * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}

const COMPASS = ["północ", "północny wschód", "wschód", "południowy wschód", "południe", "południowy zachód", "zachód", "północny zachód"];
/** Kierunek słowami po polsku, np. 45 → „północny wschód”. */
export const compassPl = (d) => COMPASS[Math.round(normDeg(d) / 45) % 8];
