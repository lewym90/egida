// „Ratuj z sercem – Mapa AED” (ratujzsercem.pl): publicznie dostępna mapa defibrylatorów. Pobieramy z niej tylko położenie i opis punktów,
// zawsze z podaniem źródła w aplikacji. Zasady: respektujemy robots.txt, jedno zapytanie na stronę mapy (+ skrypty, jeśli wolno), maks. raz na dobę,
// jawny User-Agent. Czysta logika bez sieci (testowalna); pobieranie jest w ratuj-sync.mjs.
export const RATUJ_BASE = process.env.RATUJ_BASE_URL || "https://www.ratujzsercem.pl";
export const RATUJ_MAP_PATH = "/Map.aspx";
export const RATUJ_UA = "EGIDA-sync/1.0 (nieoficjalna aplikacja informacyjna; https://github.com/lewym90/egida)";

const PL = { s: 48.9, w: 14.0, n: 55.0, e: 24.4 };
export const inPoland = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= PL.s && lat <= PL.n && lon >= PL.w && lon <= PL.e;

/** robots.txt → lista zakazanych prefiksów dla User-agent: * (i dla naszego UA). */
export function parseRobots(text) {
  const dis = [], allow = []; let applies = false, any = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (any && !applies) { /* nowa grupa */ } applies = v === "*" || /egida/i.test(v); any = true; }
    else if (applies && k === "disallow" && v) dis.push(v);
    else if (applies && k === "allow" && v) allow.push(v);
  }
  return { dis, allow };
}
/** Czy ścieżka jest dozwolona (najdłuższy pasujący wpis wygrywa, Allow przy remisie). */
export function allowedByRobots(rules, path) {
  const p = String(path || "/").split("?")[0].toLowerCase();
  let best = { len: -1, allow: true };
  for (const d of rules.dis) if (p.startsWith(d.toLowerCase()) && d.length > best.len) best = { len: d.length, allow: false };
  for (const a of rules.allow) if (p.startsWith(a.toLowerCase()) && a.length >= best.len) best = { len: a.length, allow: true };
  return best.allow;
}

const stripTags = (s) => String(s || "").replace(/<br\s*\/?>/gi, ", ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\["'\/]/g, (m) => m[1]).replace(/\s+/g, " ").trim();
const clip = (s, n) => stripTags(s).slice(0, n);
const r5 = (x) => Math.round(x * 1e5) / 1e5;

/** Raport diagnostyczny strony: co zawiera i skąd może brać punkty (bez zapisywania całej treści). */
export function probeHtml(html, pageUrl = RATUJ_BASE + RATUJ_MAP_PATH) {
  const h = String(html || "");
  const scripts = [...h.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const inline = [...h.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const count = (re) => (h.match(re) || []).length;
  const snip = (re, n = 3, w = 220) => { const out = []; for (const m of h.matchAll(re)) { if (out.length >= n) break; out.push(h.slice(Math.max(0, m.index - 40), m.index + w).replace(/\s+/g, " ")); } return out; };
  const hidden = [...h.matchAll(/<input[^>]*type=["']hidden["'][^>]*name=["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 20);
  const pts = extractPoints(h);
  return {
    url: pageUrl, bytes: h.length, title: stripTags((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").slice(0, 120),
    scriptSrc: scripts.slice(0, 40), inlineScripts: inline.length, inlineBytes: inline.reduce((a, s) => a + s.length, 0),
    iframes: [...h.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 10),
    counts: { LatLng: count(/LatLng\s*\(/g), googleMarker: count(/google\.maps\.Marker/g), latKeys: count(/["']?lat(itude)?["']?\s*[:=]\s*-?\d/gi), lngKeys: count(/["']?(lng|lon|long|longitude)["']?\s*[:=]\s*-?\d/gi), ajax: count(/\$\.ajax|XMLHttpRequest|fetch\s*\(/g), pageMethods: count(/PageMethods|WebMethod|__doPostBack/g), ashx: count(/\.ashx|\.asmx|\.svc|\/api\//gi), json: count(/application\/json/gi) },
    hiddenFields: hidden,
    snippets: { LatLng: snip(/LatLng\s*\(/g), ajax: snip(/\$\.ajax|XMLHttpRequest|fetch\s*\(/g, 3, 400), endpoints: snip(/\.ashx|\.asmx|\.svc|\/api\//gi, 4, 260), latKeys: snip(/["']?lat(itude)?["']?\s*[:=]\s*-?\d/gi, 2, 300) },
    extractedPoints: pts.length, sample: pts.slice(0, 3),
  };
}

/** Szuka w kodzie strony punktów (lat, lon, nazwa, opis). Kilka typowych układów danych; filtr: tylko Polska. */
export function extractPoints(text) {
  const t = String(text || ""), found = [], seen = new Set();
  const add = (lat, lon, name, desc) => {
    lat = Number(lat); lon = Number(lon); if (!inPoland(lat, lon)) return;
    const k = lat.toFixed(5) + "," + lon.toFixed(5); if (seen.has(k)) return; seen.add(k);
    found.push({ lat: r5(lat), lon: r5(lon), name: clip(name, 80), desc: clip(desc, 200) });
  };
  // 1) new google.maps.LatLng(lat, lon) z title / content w pobliżu
  for (const m of t.matchAll(/LatLng\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)) {
    const win = t.slice(Math.max(0, m.index - 250), m.index + 500);
    const title = (win.match(/title\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/) || [])[2], desc = (win.match(/(?:content|description|info|html)\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/) || [])[2];
    add(m[1], m[2], title || "", desc || "");
  }
  // 2) obiekty { lat: .., lng: .. , name/title/desc }
  for (const m of t.matchAll(/\{[^{}]{0,800}?["']?lat(?:itude)?["']?\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)["']?[^{}]{0,800}?\}/gi)) {
    const o = m[0], lon = (o.match(/["']?(?:lng|lon|long|longitude)["']?\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)/i) || [])[1]; if (lon == null) continue;
    const g = (re) => (o.match(re) || [])[2] || "";
    add(m[1], lon, g(/["']?(?:name|title|nazwa)["']?\s*[:=]\s*(["'])((?:\\.|(?!\1).)*)\1/i), g(/["']?(?:desc|description|opis|info|location|lokalizacja|content|address|adres)["']?\s*[:=]\s*(["'])((?:\\.|(?!\1).)*)\1/i));
  }
  // 3) tablice [ 'Nazwa', lat, lon, ... ]
  for (const m of t.matchAll(/\[\s*(["'])((?:\\.|(?!\1).){2,200})\1\s*,\s*(-?\d{2}\.\d+)\s*,\s*(-?\d{2}\.\d+)(?:\s*,\s*(["'])((?:\\.|(?!\5).){0,300})\5)?/g)) add(m[3], m[4], m[2], m[6] || "");
  return found;
}

/** Punkty → wiersze w formacie aed.json: [id, lat, lon, nazwa, gdzie, dostęp, godziny, adres, data, wewnątrz, operator, piętro, szpital, obiekt, odl. adresu]. */
export function toRows(points, dateStr = "") {
  return points.map((p) => {
    const generic = !p.name || /^(aed|defibrylator)\b/i.test(p.name) ? "Defibrylator AED" : p.name;
    return ["r" + Math.round(p.lat * 1e4) + "_" + Math.round(p.lon * 1e4), p.lat, p.lon, generic, p.desc || "", "", "", "", dateStr, 0, "", "", "", "", 0];
  });
}
