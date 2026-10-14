// Wiadomości i utrudnienia drogowe (news.json) na Telegram: czysta logika bez sieci i plików, żeby dało się ją testować.
// Zasady (decyzja autora, 14.10.2026):
//  - województwo: wszystkie nowe wiadomości, bez limitu, na kanał tego województwa;
//  - z kraju: najwyżej 10 na godzinę (na wszystkie kanały), ze świata (wpływ na Polskę): najwyżej 5 na godzinę;
//  - utrudnienia drogowe GDDKiA: nowe wpisy na kanał województwa, bez limitu;
//  - kolor wg powagi: 🔴 PILNE, 🟠 UWAGA, 🔵 INFORMACJA (drogi: 🟠 zamknięcie, 🟡 pozostałe utrudnienia);
//  - w treści nigdy nie ma gołego adresu aplikacji: jest ukryty link „Śledź w aplikacji EGIDA – Twoje centrum bezpieczeństwa”.
import { strongIncident, nationalThreat } from "./news-places.mjs";
import { dedupeSimilar } from "../js/similar.js";
import { appLink } from "./tg-policy.mjs";

const H = 36e5;
export const LIMITS = { kraj: 10, swiat: 5, recentH: 3, titleChars: 240, summaryChars: 300, keepDays: 14, maxPerRun: 25 };
export const NAMES = { dolnoslaskie: "Dolnośląskie", "kujawsko-pomorskie": "Kujawsko-pomorskie", lubelskie: "Lubelskie", lubuskie: "Lubuskie", lodzkie: "Łódzkie", malopolskie: "Małopolskie", mazowieckie: "Mazowieckie", opolskie: "Opolskie", podkarpackie: "Podkarpackie", podlaskie: "Podlaskie", pomorskie: "Pomorskie", slaskie: "Śląskie", swietokrzyskie: "Świętokrzyskie", "warminsko-mazurskie": "Warmińsko-mazurskie", wielkopolskie: "Wielkopolskie", zachodniopomorskie: "Zachodniopomorskie" };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fold = (s) => String(s || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");
const WARN = /(^|[^a-z0-9])(?:ostrzez|ostrzeg|zagroz|ewakuac|alarm|pozar|powodz|podtopien|wichur|nawalnic|gololed|skazeni|wybuch|dron|rakiet|atak|grozb|zatruc|epidemi|brak pradu|brak wody|przerw w dostaw|awaria prad|awaria wodoc|awaria gazoc|cyberatak|sabota|dywersj|wypad|zablokowan|zamkniet|katastrof|ranni|rannych)/;

/** Kategoria wiadomości: "droga" | "region" | "kraj" | "swiat". */
export const categoryOf = (it) => (it.kind === "gddkia" ? "droga" : it.region === "all" ? "kraj" : it.region === "world" ? "swiat" : "region");
/** Powaga: "danger" | "warn" | "info" (wiadomości) albo "closed" | "traffic" (drogi). */
export function levelOf(it) {
  const t = `${it.title || ""}`;
  if (it.kind === "gddkia") return /zamknie|zamknieta/.test(fold(t)) ? "closed" : "traffic";
  if (strongIncident(t) || nationalThreat(t)) return "danger";
  if (WARN.test(fold(t))) return "warn";
  return "info";
}
const ICON = { danger: "🔴", warn: "🟠", info: "🔵", closed: "🟠", traffic: "🟡" };
const LABEL = { danger: "PILNE", warn: "UWAGA", info: "INFORMACJA", closed: "DROGA ZAMKNIĘTA", traffic: "UTRUDNIENIA" };
const RANK = { danger: 0, closed: 1, warn: 1, traffic: 2, info: 3 };

const when = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
const safeUrl = (u) => (/^https:\/\/[^\s"<>]+$/.test(u || "") ? String(u).replace(/&/g, "&amp;") : "");
const FOOT = "<i>Więcej ważnych wiadomości dotyczących bezpieczeństwa czeka w aplikacji EGIDA.</i>";
const RULE = "──────────────";

/** Treść jednej wiadomości (HTML Telegrama). Cały tekst z zewnątrz jest escapowany; adres aplikacji jest tylko w ukrytym linku. */
export function newsMessage(it, { appUrl = "" } = {}) {
  const cat = categoryOf(it), lv = levelOf(it);
  const place = cat === "region" || cat === "droga" ? `📍 <b>${esc(NAMES[it.region] || it.region)}</b>` : cat === "kraj" ? "🇵🇱 <b>Z kraju</b>" : "🌍 <b>Ze świata · wpływ na Polskę</b>";
  const kind = cat === "droga" ? "🚧 Drogi krajowe" : it.kind === "media" ? "📰 Doniesienie medialne" : "";
  const head = `${ICON[lv]} <b>${LABEL[lv]}</b>  ·  ${place}${kind ? `\n${kind}` : ""}`;
  const sum = it.summary ? `\n\n${esc(String(it.summary).slice(0, LIMITS.summaryChars))}` : "";
  const t = when(it.date), u = safeUrl(it.url);
  const src = esc(it.source || "źródło");
  const until = cat === "droga" && it.until && !isNaN(Date.parse(it.until)) ? `\n⏳ do ${esc(when(it.until))}` : "";
  const meta = `\n\n${t ? `🕒 ${esc(t)} · ` : ""}${u ? `<a href="${u}">${src}</a>` : src}${until}`;
  const media = it.kind === "media" ? "\n<i>To doniesienie medialne, nie komunikat służb. Kieruj się syrenami i Alertem RCB.</i>" : "";
  const emergency = lv === "danger" ? "\n🛡 W zagrożeniu życia dzwoń <b>112</b>." : "";
  return `${head}\n${RULE}\n<b>${esc(String(it.title).slice(0, LIMITS.titleChars))}</b>${sum}${meta}${media}${emergency}\n${RULE}\n📲 ${appLink(appUrl)}${cat === "droga" ? "" : `\n${FOOT}`}`;
}

/**
 * Wybór wiadomości do wysłania. items = znormalizowane wpisy news.json, state = { sent: { id: ts }, titles: [{ title, at }], rate: { kraj: [ts], swiat: [ts] } }.
 * Zwraca { send: [{ it, cat, lv }], state } – state to kopia z oczyszczonymi licznikami (nie zawiera jeszcze wysłanych).
 * Wpisy ponad limit godzinowy zostają do następnego przebiegu (dopóki mieszczą się w oknie świeżości), pierwsze idą pilniejsze i nowsze.
 */
export function selectNews(items, stateIn, { now = Date.now(), limits = LIMITS, kinds = null } = {}) {
  const state = { sent: { ...(stateIn?.sent || {}) }, titles: [...(stateIn?.titles || [])], rate: { kraj: [...(stateIn?.rate?.kraj || [])], swiat: [...(stateIn?.rate?.swiat || [])] } };
  state.titles = state.titles.filter((x) => now - x.at < 24 * H);
  for (const k of ["kraj", "swiat"]) state.rate[k] = state.rate[k].filter((ts) => now - ts < H);
  const fresh = items.filter((it) => {
    if (state.sent[it.id]) return false;
    const cat = categoryOf(it);
    if (kinds && !kinds.has(cat)) return false;
    if (cat === "droga") return !it.until || Date.parse(it.until) >= now; // wpis drogowy: dopóki obowiązuje (data „od” bywa sprzed tygodni, więc nie liczy się świeżość)
    const t = Date.parse(it.date);
    return Number.isFinite(t) && now - t <= limits.recentH * H && t - now < H;
  });
  // ta sama sprawa innymi słowami: wcześniej wysłane wygrywają, a w obrębie nowych – pilniejsze i nowsze
  const ranked = fresh.map((it) => ({ it, cat: categoryOf(it), lv: levelOf(it) })).sort((a, b) => RANK[a.lv] - RANK[b.lv] || String(b.it.date).localeCompare(String(a.it.date)));
  const past = state.titles.map((x, i) => ({ id: `past${i}`, title: x.title }));
  const roads = ranked.filter((r) => r.cat === "droga"), news = ranked.filter((r) => r.cat !== "droga");
  const keep = new Set(dedupeSimilar([...past, ...news.map((r) => r.it)], (x) => x.title, { share: 0.75, minTokens: 4 }));
  const uniq = [...roads, ...news.filter((r) => keep.has(r.it))];
  const used = { kraj: state.rate.kraj.length, swiat: state.rate.swiat.length }, send = [];
  for (const r of uniq) {
    if (send.length >= limits.maxPerRun) break;
    if (r.cat === "kraj" || r.cat === "swiat") { if (used[r.cat] >= limits[r.cat]) continue; used[r.cat]++; }
    send.push(r);
  }
  return { send, state, duplicates: news.filter((r) => !keep.has(r.it)).map((r) => r.it) };
}
/** Zapisuje w stanie wysłaną wiadomość (wołać po udanej wysyłce). */
export function markNewsSent(state, r, now = Date.now()) {
  state.sent[r.it.id] = now;
  if (r.cat !== "droga") state.titles.push({ title: r.it.title, at: now });
  if (r.cat === "kraj" || r.cat === "swiat") state.rate[r.cat].push(now);
}
/** Pomija i zapamiętuje podobne duplikaty, żeby nie wracały co przebieg. */
export function markSkipped(state, items, now = Date.now()) { for (const it of items) state.sent[it.id] = now; }
export function cleanSent(state, now = Date.now(), days = LIMITS.keepDays) { for (const [k, t] of Object.entries(state.sent)) if (now - t > days * 24 * H) delete state.sent[k]; return state; }
/** Kanały docelowe: województwo → jeden kanał; kraj i świat → wszystkie. */
export const channelsFor = (it, channels) => (categoryOf(it) === "kraj" || categoryOf(it) === "swiat" ? Object.values(channels) : [channels[it.region]].filter(Boolean));

/** Wiadomości próbne (do komendy --sample): po jednej na rodzaj, z wyraźnym oznaczeniem PRÓBA. */
export function sampleItems(now = Date.now()) {
  const d = (m) => new Date(now - m * 6e4).toISOString();
  return [
    { id: "sample-danger", kind: "media", region: "mazowieckie", source: "Przykładowe źródło", url: "https://example.com/", date: d(5), title: "PRÓBA: Zamach w centrum miasta, służby na miejscu", summary: "To jest wiadomość próbna, żebyś zobaczył wygląd powiadomienia. Nic się nie stało." },
    { id: "sample-warn", kind: "rss", region: "mazowieckie", source: "Policja Mazowiecka", url: "https://example.com/", date: d(10), title: "PRÓBA: Ostrzeżenie przed wichurami w województwie", summary: "Wiadomość próbna z poziomem „UWAGA”." },
    { id: "sample-info", kind: "rss", region: "mazowieckie", source: "Urząd Wojewódzki", url: "https://example.com/", date: d(15), title: "PRÓBA: Komunikat informacyjny dla mieszkańców", summary: "Wiadomość próbna z poziomem „INFORMACJA”." },
    { id: "sample-kraj", kind: "html", region: "all", source: "RCB", url: "https://example.com/", date: d(20), title: "PRÓBA: Ogólnopolski komunikat o bezpieczeństwie", summary: "Tak wygląda wiadomość z kategorii „Z kraju”." },
    { id: "sample-swiat", kind: "media", region: "world", source: "Polsat News Świat", url: "https://example.com/", date: d(25), title: "PRÓBA: Cyberatak na infrastrukturę w Europie, trop prowadzi do Rosji", summary: "Tak wygląda wiadomość z kategorii „Ze świata”." },
    { id: "sample-droga", kind: "gddkia", region: "mazowieckie", source: "GDDKiA (drogi krajowe)", url: "https://drogi.gddkia.gov.pl/informacje-drogowe/lista-utrudnien", date: d(30), until: new Date(now + 6 * H).toISOString(), title: "PRÓBA: 7 · Warszawa - Radom: droga zamknięta", summary: "Objazd prowadzony drogami lokalnymi." },
  ];
}
