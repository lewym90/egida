// EGIDA – sonda formatu NEPTUN. Co ~30 min (z run.sh) robi PO JEDNYM zapytaniu do /threats, /alerts, /messages oraz
// 8 s nasłuchu WebSocket i zapisuje RAPORT O STRUKTURZE (nazwy pól, typy, kilka próbek) do neptun-schema.json.
// Plik trafia na gałąź "data" (publikacja jak alerts.json), dzięki czemu autor kodu widzi prawdziwy format bez ręcznego --dump.
// Zasady: jasny User-Agent, zero omijania blokad (403/429 = zapis błędu i koniec), próbki ucięte i bez danych osobowych
// (NEPTUN nie podaje danych osobowych). Źródło i atrybucja: neptun.in.ua.
import { writeFileSync } from "node:fs";

const BASE = process.env.NEPTUN_BASE || "https://neptun.in.ua/api/v1";
const OUT = process.env.NEPTUN_SCHEMA_OUT || "neptun-schema.json";
const UA = "EGIDA/0.3 (unofficial PWA; format probe every 30 min; repo lewym90/egida)";

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
function shape(v, depth = 0) {
  if (Array.isArray(v)) return { type: "array", length: v.length, item: v.length && depth < 4 ? mergeShapes(v.slice(0, 50).map((x) => shape(x, depth + 1))) : null };
  if (v && typeof v === "object") {
    if (depth >= 4) return { type: "object" };
    return { type: "object", fields: Object.fromEntries(Object.entries(v).slice(0, 60).map(([k, x]) => [k, shape(x, depth + 1)])) };
  }
  return { type: typeOf(v) };
}
function mergeShapes(list) {
  const objs = list.filter((s) => s.type === "object" && s.fields);
  if (objs.length === list.length && objs.length) {
    const keys = new Set(objs.flatMap((s) => Object.keys(s.fields)));
    const fields = {};
    for (const k of keys) {
      const present = objs.filter((s) => k in s.fields);
      const types = [...new Set(present.map((s) => s.fields[k].type))];
      fields[k] = { types, presentIn: `${present.length}/${objs.length}`, ...(present[0].fields[k].fields || present[0].fields[k].item ? { nested: present[0].fields[k] } : {}) };
    }
    return { type: "object", fields };
  }
  return { types: [...new Set(list.map((s) => s.type))] };
}
const clip = (v, d = 0) => {
  if (typeof v === "string") return v.length > 160 ? v.slice(0, 160) + "…" : v;
  if (Array.isArray(v)) return d > 3 ? "[…]" : v.slice(0, 5).map((x) => clip(x, d + 1));
  if (v && typeof v === "object") return d > 3 ? "{…}" : Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, clip(x, d + 1)]));
  return v;
};

async function probe(path) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/${path}`, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    const out = { path, status: r.status, ms: Date.now() - t0, contentType: r.headers.get("content-type"), bytes: text.length, cors: r.headers.get("access-control-allow-origin") };
    if (!r.ok) return { ...out, head: text.slice(0, 200) };
    let json; try { json = JSON.parse(text); } catch { return { ...out, error: "notjson", head: text.slice(0, 200) }; }
    const list = Array.isArray(json) ? json : Object.values(json || {}).find(Array.isArray);
    // wartości pól wyliczeniowych z CAŁEJ listy obiektów oraz próbki rekordów ze śladem / celem (nie tylko pierwsze 3)
    const threats = Array.isArray(json?.threats) ? json.threats : Array.isArray(json) ? json : [];
    const enums = {};
    for (const k of ["type", "status", "lifecycle", "positionQuality", "confidenceLevel", "displayConfidence"]) {
      const c = {}; for (const t of threats) if (t && t[k] != null) c[String(t[k])] = (c[String(t[k])] || 0) + 1; if (Object.keys(c).length) enums[k] = c;
    }
    const pick = (f) => threats.filter(f).slice(0, 2).map((x) => clip(x));
    const extra = threats.length ? { enums, withTrail: pick((t) => Array.isArray(t.trail) && t.trail.length), withCount: pick((t) => t.count > 1), areaOnly: pick((t) => t.areaOnly === true), stale: pick((t) => t.status && t.status !== "active") } : {};
    return { ...out, ...extra, topLevel: Array.isArray(json) ? "array" : Object.keys(json || {}), shape: shape(json), samples: (list || []).slice(0, 3).map((x) => clip(x)), scalarFields: Array.isArray(json) ? null : clip(Object.fromEntries(Object.entries(json || {}).filter(([, v]) => typeof v !== "object"))) };
  } catch (e) { return { path, error: "network", msg: String(e.message || e), ms: Date.now() - t0 }; }
}

function probeWs(ms = 20000) {
  return new Promise((resolve) => {
    const res = { url: "/stream", frames: [], opened: false };
    if (typeof WebSocket === "undefined") return resolve({ ...res, error: "brak WebSocket w tej wersji Node" });
    let ws, finished = false;
    const done = (extra = {}) => { if (finished) return; finished = true; try { ws?.close(); } catch {} resolve({ ...res, ...extra }); };
    try { ws = new WebSocket(BASE.replace(/^http/, "ws") + "/stream"); } catch (e) { return done({ error: String(e.message || e) }); }
    const timer = setTimeout(() => done(), ms);
    ws.onopen = () => { res.opened = true; };
    ws.onmessage = (ev) => {
      if (res.frames.length >= 6) return;
      let j = null; try { j = JSON.parse(String(ev.data)); } catch {}
      if (res.frames.length < 6) res.frames.push(j ? { type: j.type ?? null, keys: Object.keys(j), shape: shape(j.data ?? null), sample: clip(j.data ?? j) } : { raw: String(ev.data).slice(0, 200) });
    };
    ws.onerror = () => { clearTimeout(timer); done({ error: "ws error" }); };
    ws.onclose = () => { clearTimeout(timer); done(); };
  });
}

const report = { generatedAt: new Date().toISOString(), note: "Raport o strukturze danych NEPTUN (neptun.in.ua). Próbki ucięte, tylko do diagnostyki formatu.", rest: [], ws: null };
for (const p of ["threats", "alerts", "messages"]) report.rest.push(await probe(p));
report.ws = await probeWs();
writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log("neptun-probe:", report.rest.map((r) => `${r.path}=${r.status ?? r.error}`).join(" "), "ws=" + (report.ws.opened ? `ok(${report.ws.frames.length} ramek)` : report.ws.error || "brak"));
