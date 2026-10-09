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
  body: ["description", "opis", "tresc", "content", "body", "text", "summary"],
  date: ["pubdate", "published", "date", "data", "created", "updated", "datapublikacji"],
  link: ["link", "url", "href"],
  region: ["wojewodztwo", "voivodeship", "region", "obszar", "area"],
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
  for (const k of Object.keys(obj)) if (names.includes(norm(k).replace(/[^a-z0-9]/g, ""))) { const t = text(obj[k]); if (t) return t; }
  return "";
};

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
    const d = dateRaw ? new Date(dateRaw) : null;
    const category = pick(r, FIELD_MAP.category);
    const type = detectType(category, title, body);
    const link = pick(r, FIELD_MAP.link);
    const id = pick(r, FIELD_MAP.id) || idFor(`${title}|${dateRaw}|${regions.join(",")}`);
    const base = {
      title: title || body.slice(0, 120), body: title && body ? body.slice(0, 600) : "", type,
      published: d && !isNaN(d) ? d.toISOString() : null, url: /^https?:\/\//.test(link) ? link : "", source: "RSO (komunikaty.tvp.pl)",
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
