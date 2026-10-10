// Dane DEMONSTRACYJNE: całkowicie wymyślone, służą wyłącznie do podglądu wyglądu mapy (adres: #/mapa/demo).
// Nie wolno ich mieszać z danymi żywymi – ekran demo ma wielki, stały baner „DANE WYMYŚLONE”.
export const DEMO_USER = { lat: 51.15, lon: 23.45, accKm: 0.05 };

export function demoThreats(nowMs = Date.now()) {
  const iso = (secAgo) => new Date(nowMs - secAgo * 1000).toISOString();
  const W = { heading: 270, velocity: { bearingDeg: 270, speedKmh: 150 } }; // leci na zachód
  const base = (id, over) => ({
    id, type: "uav", title: "DEMO", region: "demo", status: "active", confidenceLevel: "high", sourceCount: 3,
    uncertaintyKm: 4, advisory: false, areaOnly: false, confirmedAt: iso(30), updatedAt: iso(20), ...over,
  });
  return [
    base("demo-1", { title: "DEMO: dron, tor przez pozycję demo", lat: 51.15, lon: 25.0, ...W }),
    base("demo-2", { title: "DEMO: dron, tor daleko na północ", lat: 52.0, lon: 25.0, ...W }),
    base("demo-3", { title: "DEMO: dron oddalający się", lat: 51.15, lon: 22.0, ...W }),
    base("demo-4", { title: "DEMO: rakieta", type: "missile", lat: 50.6, lon: 26.5, heading: 280, velocity: { bearingDeg: 280, speedKmh: 800 }, confidenceLevel: "medium", sourceCount: 2 }),
    base("demo-5", { title: "DEMO: obserwacja bez alarmu", lat: 50.2, lon: 25.2, heading: 300, velocity: { bearingDeg: 300, speedKmh: 140 }, advisory: true, confidenceLevel: "medium", sourceCount: 1 }),
    base("demo-6", { title: "DEMO: nieaktualny", status: "stale", lat: 51.8, lon: 25.5, ...W, confirmedAt: iso(500), updatedAt: iso(400) }),
    base("demo-7", { title: "DEMO: tylko obwód", areaOnly: true, lat: 50.0, lon: 26.5, count: 3, region: "DEMO: obwód A" }),
    base("demo-8", { title: "DEMO: daleko w głębi Ukrainy", type: "recon", lat: 49.0, lon: 33.0, ...W }),
    base("demo-9", { title: "DEMO: balistyczny", type: "ballistic", lat: 50.9, lon: 27.4, heading: 285, velocity: { bearingDeg: 285, speedKmh: 2500 }, confidenceLevel: "low", sourceCount: 1 }),
  ];
}

export function demoAlerts() {
  return [{ id: "d1", region: "DEMO: obwód A", active: true }, { id: "d2", region: "DEMO: obwód B", active: true }, { id: "d3", region: "DEMO: obwód C", active: false }];
}
export function demoMessages(nowMs = Date.now()) {
  return [
    { id: "m1", text: "DEMO: wymyślona wiadomość o obiektach przy granicy.", publishedAt: new Date(nowMs - 120e3).toISOString(), channel: "DEMO" },
    { id: "m2", text: "DEMO: kolejna wymyślona wiadomość.", publishedAt: new Date(nowMs - 600e3).toISOString(), channel: "DEMO" },
  ];
}
