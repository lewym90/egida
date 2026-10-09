// Parser komunikatów RSO (komunikaty.tvp.pl, „Pobierz wersję XML”).
//
// UWAGA: prawdziwej struktury XML nie widziano w czasie pisania (sieć środowiska była zablokowana).
// Dlatego parser jest ZACHOWAWCZY: znajduje powtarzające się węzły-komunikaty i wyciąga pola
// po nazwach (title/tytuł, description/treść, pubDate/data, link, województwo). Po pierwszym
// uruchomieniu na żywym pliku uruchom `node poll.mjs --dump` i dopasuj FIELD_MAP poniżej.
import { XMLParser } from "fast-xml-parser";

export const RSO_URL = process.env.RSO_URL || "https://komunikaty.tvp.pl/komunikaty/wszystkie/wszystkie/0?_format=xml";

export const VOIVODESHIPS = {
  dolnoslaskie: "dolnośląsk", "kujawsko-pomorskie": "kujawsko-pomorsk", lubelskie: "lubelsk", lubuskie: "lubusk",
  lodzkie: "łódzk", malopolskie: "małopolsk", mazowieckie: "mazowiecki", opolskie: "opolsk", podkarpackie: "podkarpack",
  podlaskie: "podlask", pomorskie: "pomorsk", slaskie: "śląsk", swietokrzyskie: "świętokrzysk",
  "warminsko-mazurskie": "warmińsko-mazursk", wielkopolskie: "wielkopolsk", zachodniopomorskie: "zachodniopomorsk",
};

// Nazwy pól do przeszukania (małe litery, bez polskich znaków diakrytycznych w porównaniu).
export const FIELD_MAP = {
  title: ["title", "tytul", "name", "nazwa"],
  body: ["content", "description", "opis", "tresc", "body", "text", "shortcut", "summary"],
  date: ["validfrom", "pubdate", "published", "date", "data", "createdat", "created", "datapublikacji"],
  validTo: ["validto", "expires", "wazneDo"],
  alarm: ["rsoalarm", "alarm"],
  water: ["rivername", "waterlevelvalue", "waterlevelalarmstatusvalue"],
  link: ["link", "url", "href"],
  region: ["provinces", "province", "wojewodztwo", "voivodeship", "region", "obszar", "area"],
  category: ["category", "kategoria", "type", "typ", "rodzaj"],
  id: ["guid", "id", "uuid", "nid"],
};
const ITEM_NAMES = ["item", "entry", "komunikat", "alert", "message", "row", "node", "result"];

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const text = (v) => {
  if (v == null) return "";
  if (typeof v === "object") return v["#text"] != null ? text(v["#text"]) : Object.values(v).map(text).join(" ").trim();
  return String(v).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
};
const pick = (obj, names) => {
  const keys = Object.keys(obj).map((k) => [norm(k).replace(/[^a-z0-9]/g, ""), k]);
  for (const n of names) for (const [nk, k] of keys) if (nk === n.toLowerCase()) { const t = text(obj[k]); if (t) return t; }
  return "";
};

// RSO podaje czas bez strefy („2026-10-09 17:35:00”) – to czas polski (Europe/Warsaw), niezależnie od strefy serwera.
export function parseWarsaw(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(str || "").trim());
  if (!m) { const d = new Date(str); return isNaN(d) ? null : d; }
  const [y, mo, d, h, mi, se] = m.slice(1).map((x) => Number(x || 0));
  const guess = Date.UTC(y, mo - 1, d, h, mi, se);
  const off = (t) => { const p = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Warsaw", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)).reduce((a, x) => (a[x.type] = x.value, a), {}); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t; };
  let t = guess - off(guess); t = guess - off(t);
  return new Date(t);
}

export function findItems(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return [];
  for (const [k, v] of Object.entries(node)) {
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object") && ITEM_NAMES.includes(norm(k))) return v;
  }
  let best = [];
  for (const v of Object.values(node)) {
    const found = Array.isArray(v) && v.length > 1 && v.every((x) => x && typeof x === "object") ? v : findItems(Array.isArray(v) ? v[0] : v, depth + 1);
    if (found.length > best.length) best = found;
  }
  return best;
}

export function detectRegion(...parts) {
  // Najdłuższe nazwy najpierw i usuwanie dopasowanych fragmentów, żeby „dolnośląskie” nie dało też „śląskie”,
  // a „zachodniopomorskie” / „kujawsko-pomorskie” nie dały „pomorskie”. Dopasowanie tylko od początku słowa.
  let hay = " " + norm(parts.join(" ")) + " ";
  const hits = [];
  const entries = Object.entries(VOIVODESHIPS).sort((a, b) => b[1].length - a[1].length);
  for (const [id, stem] of entries) {
    const s = norm(stem).replace(/[-]/g, "[- ]");
    const re = new RegExp(`(?<![a-z])${s}[a-z]*`, "g");
    if (re.test(hay)) { hits.push(id); hay = hay.replace(re, " "); }
  }
  return hits.sort();
}
export function detectType(...parts) {
  const h = norm(parts.join(" "));
  if (/alert rcb|rcb|znajdz bezpieczne|ewakuacj/.test(h)) return "rcb";
  if (/jakosc wody|woda|susza|powodz|hydro|przybor|stan wody|wodoci/.test(h)) return "woda";
  if (/droga|drogi|\bdk ?\d|\bs\d{1,2}\b|\ba\d\b|utrudnien|wypadek|zamkni/.test(h)) return "drogi";
  if (/sztorm|wiatr|burza|mroz|upal|opady|snieg|gololedz|mgla|imgw|burz/.test(h)) return "pogoda";
  return "inne";
}

const idFor = (s) => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return "r" + h.toString(36); };

export function parseRso(xml) {
  const p = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, processEntities: true });
  const root = p.parse(xml);
  const raw = findItems(root);
  const items = [];
  for (const r of raw) {
    const title = pick(r, FIELD_MAP.title);
    const body = pick(r, FIELD_MAP.body);
    if (!title && !body) continue;
    const regionText = pick(r, FIELD_MAP.region);
    let regions = detectRegion(regionText);
    if (!regions.length) regions = detectRegion(title, body);
    const dateRaw = pick(r, FIELD_MAP.date);
    const d = dateRaw ? parseWarsaw(dateRaw) : null;
    const to = pick(r, FIELD_MAP.validTo);
    const dTo = to ? parseWarsaw(to) : null;
    const category = pick(r, FIELD_MAP.category);
    const type = pick(r, FIELD_MAP.water) ? "woda" : detectType(category, title, body);
    const alarm = ["1", "true"].includes(pick(r, FIELD_MAP.alarm).toLowerCase());
    const link = pick(r, FIELD_MAP.link);
    const id = pick(r, FIELD_MAP.id) || idFor(`${title}|${dateRaw}|${regions.join(",")}`);
    const base = {
      title: title || body.slice(0, 120), body: title && body ? body.slice(0, 600) : "", type,
      published: d && !isNaN(d) ? d.toISOString() : null, validTo: dTo && !isNaN(dTo) ? dTo.toISOString() : null, alarm, url: /^https?:\/\//.test(link) ? link : "", source: "RSO (komunikaty.tvp.pl)",
    };
    // Komunikat bez rozpoznanego województwa trafia do „all” (widoczny wszędzie), żeby niczego nie zgubić.
    if (!regions.length) items.push({ ...base, id: `${id}:all`, voivodeship: "all" });
    else for (const reg of regions) items.push({ ...base, id: `${id}:${reg}`, voivodeship: reg });
  }
  return items;
}

export async function fetchRso(url = RSO_URL) {
  const res = await fetch(url, { headers: { "User-Agent": "EGIDA/0.1 (nieoficjalna aplikacja informacyjna)", Accept: "application/xml,text/xml" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`RSO HTTP ${res.status}`);
  return await res.text();
}
