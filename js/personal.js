// Dane osobiste użytkownika: plan rodziny, karty ICE, ważne miejsca, wiadomość „Jestem bezpieczny”, import kopii.
// Czysta logika bez DOM (testowalna w Node). Wszystko zostaje WYŁĄCZNIE w urządzeniu użytkownika.

export const LIMITS = { contacts: 8, people: 6, places: 12 };
export const BLOOD = ["", "0 Rh−", "0 Rh+", "A Rh−", "A Rh+", "B Rh−", "B Rh+", "AB Rh−", "AB Rh+"];
export const PLACE_LABELS = ["Dom", "Praca", "Rodzina", "Inne"];

const CTRL = /[\u0000-\u0009\u000b-\u001f\u007f]+/g; // bez \n
/** Jedna linia: bez znaków sterujących, zwinięte spacje, przycięta do max znaków. */
export const clean = (v, max = 120) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Kilka linii (notatki): zostawia nowe wiersze, ogranicza liczbę pustych. */
export const cleanMulti = (v, max = 400) => (typeof v === "string" ? v.replace(CTRL, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");
/** Numer telefonu do wyświetlenia: cyfry, +, spacje, myślniki, nawiasy (max 20 znaków). */
export const cleanPhone = (v) => (typeof v === "string" ? v.replace(/[^\d+\-() ]/g, "").replace(/\s+/g, " ").trim().slice(0, 20) : "");
/** Odsyłacz tel: albo "" gdy numer jest nieprawidłowy (3–15 cyfr, opcjonalny + na początku). */
export const telHref = (v) => { const d = String(v ?? "").replace(/[^\d+]/g, ""); return /^\+?\d{3,15}$/.test(d) ? "tel:" + d : ""; };
const newId = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/* ---------- plan rodziny ---------- */
export const emptyPlan = () => ({ meet1: "", meet2: "", outName: "", outPhone: "", myName: "", contacts: [], people: [] });

const cleanContact = (c) => ({ id: clean(c?.id, 60) || newId(), name: clean(c?.name, 60), phone: cleanPhone(c?.phone), role: clean(c?.role, 40) });
const cleanPerson = (p) => ({
  id: clean(p?.id, 60) || newId(), name: clean(p?.name, 60), year: /^\d{4}$/.test(String(p?.year ?? "")) ? String(p.year) : "",
  blood: BLOOD.includes(p?.blood) ? p.blood : "", allergies: cleanMulti(p?.allergies, 200), meds: cleanMulti(p?.meds, 300),
  conditions: cleanMulti(p?.conditions, 300), contactName: clean(p?.contactName, 60), contactPhone: cleanPhone(p?.contactPhone), notes: cleanMulti(p?.notes, 300),
});
/** Czyści plan odczytany z pamięci lub z importu: nigdy nie ufamy kształtowi danych. */
export function normalizePlan(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    meet1: clean(r.meet1, 160), meet2: clean(r.meet2, 160), outName: clean(r.outName, 60), outPhone: cleanPhone(r.outPhone), myName: clean(r.myName, 40),
    contacts: (Array.isArray(r.contacts) ? r.contacts : []).filter((c) => c && typeof c === "object").map(cleanContact).filter((c) => c.name && telHref(c.phone)).slice(0, LIMITS.contacts),
    people: (Array.isArray(r.people) ? r.people : []).filter((p) => p && typeof p === "object").map(cleanPerson).filter((p) => p.name).slice(0, LIMITS.people),
  };
}
/** Dodaje kontakt. Zwraca { ok, error?, contact? } i zmienia plan.contacts tylko przy sukcesie. */
export function addContact(plan, { name, phone, role }) {
  const c = cleanContact({ name, phone, role, id: "" });
  if (!c.name) return { ok: false, error: "Wpisz imię lub nazwę kontaktu." };
  if (!telHref(c.phone)) return { ok: false, error: "Wpisz prawidłowy numer telefonu (np. 600 100 200 albo +48 600 100 200)." };
  if (plan.contacts.length >= LIMITS.contacts) return { ok: false, error: `Można zapisać najwyżej ${LIMITS.contacts} kontaktów. Usuń jeden, aby dodać nowy.` };
  plan.contacts.push(c);
  return { ok: true, contact: c };
}
export function addPerson(plan, name) {
  const n = clean(name, 60);
  if (!n) return { ok: false, error: "Wpisz imię osoby." };
  if (plan.people.length >= LIMITS.people) return { ok: false, error: `Można zapisać najwyżej ${LIMITS.people} kart. Usuń jedną, aby dodać nową.` };
  const p = cleanPerson({ name: n, id: "" });
  plan.people.push(p);
  return { ok: true, person: p };
}
const PERSON_FIELDS = new Set(["name", "year", "blood", "allergies", "meds", "conditions", "contactName", "contactPhone", "notes"]);
/** Zmienia jedno pole karty ICE (z oczyszczeniem). Zwraca true, gdy zapisano. */
export function setPersonField(plan, id, field, value) {
  const p = plan.people.find((x) => x.id === id);
  if (!p || !PERSON_FIELDS.has(field)) return false;
  p[field] = cleanPerson({ ...p, [field]: value })[field];
  return true;
}
export const removeById = (list, id) => { const i = list.findIndex((x) => x.id === id); if (i >= 0) list.splice(i, 1); return i >= 0; };
/** Czy karta ma cokolwiek poza imieniem (do ostrzeżenia przed pustym wydrukiem). */
export const personFilled = (p) => !!(p.blood || p.allergies || p.meds || p.conditions || p.contactPhone || p.notes || p.year);

/* ---------- „Jestem bezpieczny” ---------- */
export const osmLink = (pos) => { const la = pos.lat.toFixed(4), lo = pos.lon.toFixed(4); return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`; };
/** Tekst wiadomości. pos opcjonalna (tylko gdy użytkownik zaznaczył „dołącz pozycję”). */
export function buildSafeMessage({ name = "", date = new Date(), pos = null, tz } = {}) {
  let when = "";
  try { when = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(date); } catch { /* */ }
  const who = clean(name, 40);
  const hasPos = pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lon);
  return `Jestem bezpieczny/a.${who ? " " + who + "." : ""}${when ? " (" + when + ")" : ""}${hasPos ? "\nMoja pozycja: " + osmLink(pos) : ""}`;
}
export const smsHref = (text) => `sms:?&body=${encodeURIComponent(text)}`;
export const waHref = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/* ---------- ważne miejsca (dom, praca, rodzina) ---------- */
const validPos = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 48 && lat <= 56 && lon >= 13 && lon <= 25; // okolice Polski
/** Tworzy miejsce; współrzędne zaokrąglamy do ok. 11 m. region = id województwa albo "" (uzupełnia wywołujący). */
export function makePlace({ label, name, lat, lon, region = "" }) {
  const l = PLACE_LABELS.includes(label) ? label : "Inne";
  if (!validPos(lat, lon)) return { ok: false, error: "Wskaż miejsce w Polsce: użyj swojej pozycji albo dotknij mapy." };
  return { ok: true, place: { id: newId(), label: l, name: clean(name, 60) || l, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, region: clean(region, 40), addedAt: new Date().toISOString() } };
}
export function normalizePlaces(raw) {
  return (Array.isArray(raw) ? raw : []).filter((p) => p && typeof p === "object" && validPos(p.lat, p.lon)).slice(0, LIMITS.places).map((p) => ({
    id: clean(p.id, 60) || newId(), label: PLACE_LABELS.includes(p.label) ? p.label : "Inne", name: clean(p.name, 60) || "Miejsce",
    lat: Math.round(p.lat * 1e4) / 1e4, lon: Math.round(p.lon * 1e4) / 1e4, region: clean(p.region, 40), addedAt: clean(p.addedAt, 40),
  }));
}

/* ---------- własna apteczka: leki i środki z terminem ważności (tylko w urządzeniu) ---------- */
export const KIT_LIMIT = 60;
export const KIT_WARN_DAYS = 30; // „kończy się termin” od tylu dni przed datą
const ymd = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "")); if (!m) return ""; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : ""; };
/** Czyści listę z pamięci lub z importu. expires = RRRR-MM-DD albo "" (brak terminu). */
export function normalizeKit(raw) {
  return (Array.isArray(raw) ? raw : []).filter((x) => x && typeof x === "object" && clean(x.name, 60)).slice(0, KIT_LIMIT).map((x) => ({
    id: clean(x.id, 60) || newId(), name: clean(x.name, 60), expires: ymd(x.expires), qty: clean(x.qty, 20), note: clean(x.note, 120),
  }));
}
/** Dzień w formacie RRRR-MM-DD z daty lokalnej. */
export const todayYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Ile dni do terminu (ujemne = po terminie); null gdy brak daty. */
export function kitDays(expires, today = todayYmd()) {
  if (!ymd(expires) || !ymd(today)) return null;
  const a = Date.parse(expires + "T00:00:00Z"), b = Date.parse(today + "T00:00:00Z");
  return Math.round((a - b) / 86400000);
}
/** "expired" (po terminie) | "soon" (do 30 dni) | "ok" | "none" (bez terminu). */
export function kitStatus(item, today = todayYmd()) {
  const d = kitDays(item?.expires, today);
  if (d == null) return "none";
  return d < 0 ? "expired" : d <= KIT_WARN_DAYS ? "soon" : "ok";
}
/** Pozycje wymagające uwagi (po terminie lub kończące się), najpierw najpilniejsze. */
export function kitDue(list, today = todayYmd()) {
  return normalizeKit(list).map((x) => ({ ...x, st: kitStatus(x, today), days: kitDays(x.expires, today) })).filter((x) => x.st === "expired" || x.st === "soon").sort((a, b) => a.days - b.days);
}
/** Sortowanie: po terminie, potem według daty, na końcu bez terminu. */
export const kitSorted = (list) => normalizeKit(list).slice().sort((a, b) => (a.expires || "9999") < (b.expires || "9999") ? -1 : (a.expires || "9999") > (b.expires || "9999") ? 1 : a.name.localeCompare(b.name, "pl"));
/** Terminy ważności pozycji z list Plecak i Zapas: { idPozycji: "RRRR-MM-DD" } (tylko poprawne daty i identyfikatory). */
export function normalizeExpiry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^[\w-]{1,40}$/.test(k) && ymd(v)).slice(0, 200));
}
/** Ćwiczenie rodzinne: data ostatniego ćwiczenia. */
export const normalizeExercise = (raw) => ({ last: ymd(raw?.last) });
/* ---------- kalkulator zapasów ---------- */
export const SUPPLY_DAYS = [3, 7, 14];
export const WATER_L_PER_DAY = 3;  // Poradnik bezpieczeństwa (RCB/MSWiA): co najmniej 3 litry wody na osobę na dobę
export const KCAL_ADULT_DAY = 2000; // szacunek EGIDA dla dorosłego (dzieci: porcje wg wieku, bez liczby)
/** Liczba domowników i dni: tylko liczby w bezpiecznych granicach. */
export function normalizeSupply(raw) {
  const n = (v, min, max, d) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d; };
  const days = SUPPLY_DAYS.includes(Number(raw?.days)) ? Number(raw.days) : 3;
  return { adults: n(raw?.adults, 0, 20, 2), kids: n(raw?.kids, 0, 20, 0), days };
}
/** Ile czego potrzeba: woda wg Poradnika (3 l/os./dobę), jedzenie dla dorosłych (szacunek), liczba plecaków (każdy domownik ma własny). */
export function supplyNeeds(raw) {
  const x = normalizeSupply(raw), people = x.adults + x.kids;
  const waterL = people * WATER_L_PER_DAY * x.days;
  return { ...x, people, waterL, bottles: Math.ceil(waterL / 1.5), kcal: x.adults * KCAL_ADULT_DAY * x.days, backpacks: people };
}
/** Treść pliku kopii: tylko dane użytkownika (bez pamięci podręcznej i znaczników technicznych). */
export function exportState(state, now = new Date()) {
  const keys = ["onboarded", "consent", "region", "shelters", "checked", "plan", "places", "test", "fs", "contrast", "map", "myKit", "senior", "expiry", "exercise", "theme", "supply"];
  const data = {}; for (const k of keys) if (k in state) data[k] = state[k];
  return { egida: 1, exportedAt: now.toISOString(), ...data };
}

/* ---------- import kopii zapasowej (plik z „Zapisz kopię”) ---------- */
const bool = (v) => v === true;
/**
 * Zamienia wczytany JSON na bezpieczny stan aplikacji. Nieznane pola są odrzucane.
 * validRegions: lista dozwolonych id województw. Zwraca { ok, state?, error? }.
 */
export function importState(raw, { validRegions = [] } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "To nie wygląda na plik z danymi EGIDY." };
  const known = ["onboarded", "consent", "region", "shelters", "checked", "plan", "places", "test", "fs", "contrast", "map", "myKit", "senior", "expiry", "exercise", "theme", "supply"];
  if (!known.some((k) => k in raw)) return { ok: false, error: "W pliku nie ma żadnych danych EGIDY." };
  const out = {};
  if ("consent" in raw && raw.consent && typeof raw.consent === "object") out.consent = { gps: bool(raw.consent.gps), counter: bool(raw.consent.counter), ack: bool(raw.consent.ack), neptun: bool(raw.consent.neptun) };
  if (typeof raw.region === "string" && validRegions.includes(raw.region)) { out.region = raw.region; out.regionSource = "manual"; }
  if (raw.checked && typeof raw.checked === "object" && !Array.isArray(raw.checked)) out.checked = Object.fromEntries(Object.entries(raw.checked).filter(([k, v]) => /^[\w-]{1,40}$/.test(k) && typeof v === "boolean").slice(0, 200));
  if (Array.isArray(raw.shelters)) out.shelters = raw.shelters.filter((s) => s && validPos(s.lat, s.lon) && typeof s.name === "string").slice(0, 100).map((s) => ({ id: clean(s.id, 60) || newId(), name: clean(s.name, 60) || "Miejsce", how: clean(s.how, 400), lat: Math.round(s.lat * 1e5) / 1e5, lon: Math.round(s.lon * 1e5) / 1e5, addedAt: clean(s.addedAt, 40) }));
  if ("plan" in raw) out.plan = normalizePlan(raw.plan);
  if ("places" in raw) out.places = normalizePlaces(raw.places);
  if (raw.test && typeof raw.test === "object" && num(raw.test.score) != null) out.test = { answers: Object.fromEntries(Object.entries(raw.test.answers && typeof raw.test.answers === "object" ? raw.test.answers : {}).filter(([k, v]) => /^[\w-]{1,40}$/.test(k) && typeof v === "boolean")), score: raw.test.score, at: clean(raw.test.at, 40) };
  if ("myKit" in raw) out.myKit = normalizeKit(raw.myKit);
  if ("expiry" in raw) out.expiry = normalizeExpiry(raw.expiry);
  if ("exercise" in raw) out.exercise = normalizeExercise(raw.exercise);
  if ("supply" in raw) out.supply = normalizeSupply(raw.supply);
  if (["light", "dark", "auto"].includes(raw.theme)) out.theme = raw.theme;
  if (typeof raw.senior === "boolean") out.senior = raw.senior;
  if (["normal", "large", "xlarge"].includes(raw.fs)) out.fs = raw.fs;
  if (["normal", "high"].includes(raw.contrast)) out.contrast = raw.contrast;
  if (raw.map && typeof raw.map === "object") out.map = { base: ["map", "terrain", "sat"].includes(raw.map.base) ? raw.map.base : "map", layers: { shelters: raw.map.layers?.shelters !== false, neptun: false } };
  return { ok: true, state: out };
}
