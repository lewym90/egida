// Service worker: offline dla treści (powłoka aplikacji z cache), komunikaty zawsze najpierw z sieci.
const VERSION = "egida-v9";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "js/app.js", "js/content.js", "js/config.js",
  "js/geo.js", "js/neptun.js", "js/neptun-feed.js", "js/shelters.js", "js/mapscreen.js",
  "js/sheltersscreen.js", "js/poland-border.js", "js/demo.js",
  "js/vendor/leaflet/leaflet.js", "js/vendor/leaflet/leaflet.css",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "fonts/manrope-latin-500-normal.woff2", "fonts/manrope-latin-700-normal.woff2", "fonts/manrope-latin-800-normal.woff2",
  "fonts/manrope-latin-ext-500-normal.woff2", "fonts/manrope-latin-ext-700-normal.woff2", "fonts/manrope-latin-ext-800-normal.woff2",
  "fonts/source-sans-3-latin-400-normal.woff2", "fonts/source-sans-3-latin-600-normal.woff2", "fonts/source-sans-3-latin-700-normal.woff2",
  "fonts/source-sans-3-latin-ext-400-normal.woff2", "fonts/source-sans-3-latin-ext-600-normal.woff2", "fonts/source-sans-3-latin-ext-700-normal.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // nie dotykamy zewnętrznych żądań
  // Dane o komunikatach: sieć najpierw, w razie braku ostatnia kopia.
  if (url.pathname.endsWith(".json")) {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); return r; }).catch(() => caches.match(req)));
    return;
  }
  // Reszta: cache najpierw, w tle odświeżanie.
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
