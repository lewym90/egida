// Raz na dobę: „Ratuj z sercem – Mapa AED” → aed-ratuj.json (+ raport diagnostyczny ratuj-probe.json). Patrz ratuj-lib.mjs.
// Zasady: robots.txt respektowany, jawny User-Agent, odstęp między zapytaniami, maks. kilka zapytań na przebieg.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { RATUJ_BASE, RATUJ_MAP_PATH, RATUJ_UA, parseRobots, allowedByRobots, probeHtml, extractPoints, toRows } from "./ratuj-lib.mjs";

const OUT = process.env.RATUJ_OUT || "aed-ratuj.json", PROBE = process.env.RATUJ_PROBE_OUT || "ratuj-probe.json";
const MIN = Number(process.env.RATUJ_MIN || 20), PAUSE = Number(process.env.RATUJ_PAUSE_MS || 1500), MAX_SCRIPTS = Number(process.env.RATUJ_MAX_SCRIPTS || 6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url) => { const r = await fetch(url, { headers: { "User-Agent": RATUJ_UA, Accept: "text/html,application/javascript,*/*;q=0.5", "Accept-Language": "pl" }, signal: AbortSignal.timeout(30000), redirect: "follow" }); return { status: r.status, ok: r.ok, type: r.headers.get("content-type") || "", text: await r.text() }; };
const report = { at: new Date().toISOString(), steps: [] };
const save = () => writeFileSync(PROBE, JSON.stringify(report, null, 1));
const step = (s) => { report.steps.push(s); console.log(s); };

try {
  let rules = { dis: [], allow: [] };
  const rb = await get(RATUJ_BASE + "/robots.txt").catch((e) => { throw new Error("robots.txt niedostępny: " + e.message); });
  if (rb.status === 200) rules = parseRobots(rb.text); else if (rb.status >= 500) throw new Error("robots.txt: HTTP " + rb.status);
  report.robots = { status: rb.status, disallow: rules.dis.slice(0, 30) };
  if (!allowedByRobots(rules, RATUJ_MAP_PATH)) { step("Mapa jest zablokowana w robots.txt – nic nie pobieram."); save(); process.exit(0); }
  await sleep(PAUSE);
  const page = await get(RATUJ_BASE + RATUJ_MAP_PATH);
  step(`Map.aspx: HTTP ${page.status}, ${page.text.length} znaków`);
  if (!page.ok) throw new Error("Map.aspx: HTTP " + page.status);
  report.page = probeHtml(page.text);
  let points = extractPoints(page.text);
  report.scripts = [];
  for (const src of report.page.scriptSrc) {
    if (report.scripts.length >= MAX_SCRIPTS) break;
    let u; try { u = new URL(src, RATUJ_BASE + RATUJ_MAP_PATH); } catch { continue; }
    if (u.origin !== RATUJ_BASE) continue;
    if (!allowedByRobots(rules, u.pathname)) { report.scripts.push({ src: u.pathname, skipped: "robots.txt" }); continue; }
    if (/jquery|bootstrap|\.min\.css/i.test(u.pathname)) continue;
    await sleep(PAUSE);
    try { const sc = await get(u.href); if (!sc.ok || sc.text.length > 1.5e6) { report.scripts.push({ src: u.pathname, status: sc.status, bytes: sc.text.length, skipped: "status/rozmiar" }); continue; }
      const p2 = extractPoints(sc.text); report.scripts.push({ src: u.pathname, bytes: sc.text.length, points: p2.length }); points = points.concat(p2); } catch (e) { report.scripts.push({ src: u.pathname, error: e.message }); }
  }
  const seen = new Set(); points = points.filter((p) => { const k = p.lat + "," + p.lon; if (seen.has(k)) return false; seen.add(k); return true; });
  step(`Znalezione punkty: ${points.length}`);
  let prev = 0; try { prev = JSON.parse(readFileSync(OUT, "utf8")).count || 0; } catch { /* brak */ }
  if (points.length < MIN) step(`Za mało punktów (< ${MIN}) – nie zapisuję ${OUT}. Dane na stronie są ładowane inaczej; zobacz ratuj-probe.json.`);
  else if (prev && points.length < prev * 0.5) step(`Podejrzany spadek (${prev} → ${points.length}) – zostawiam poprzedni plik.`);
  else { const rows = toRows(points, new Date().toISOString().slice(0, 10)); writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), source: "Ratuj z sercem – Mapa AED (ratujzsercem.pl)", count: rows.length, rows })); step(`Zapisano ${OUT}: ${rows.length} punktów`); }
  save();
} catch (e) { report.error = String(e.message || e); save(); console.log("ratuj-sync: " + report.error); process.exit(1); }
