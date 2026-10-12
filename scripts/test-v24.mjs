// v24: ślad obiektu i szacowane położenie „teraz” na mapie NEPTUN; względne linki w RSS; źródła.
import assert from "node:assert/strict";
import { ThreatStore, normalizeThreat, parseTrail, estimateNow, buildView } from "../js/neptun.js";
import { haversineKm } from "../js/geo.js";
import { parseRss, passesFilter } from "../server/news-lib.mjs";
import { SOURCES } from "../server/news-sources.mjs";
let n = 0;
const ok = (name, fn) => { try { fn(); } catch (e) { e.message = `[${name}] ${e.message}`; throw e; } n++; };
const T0 = Date.parse("2026-10-11T20:00:00Z");
const raw = (over = {}) => ({ id: "trk_1", type: "uav", title: "БпЛА", lat: 51.2, lon: 31.3, heading: 350, status: "active", positionQuality: "confirmed", uncertaintyKm: 10, confirmedAt: new Date(T0).toISOString(), updatedAt: new Date(T0).toISOString(), presumptiveCourse: true, ...over });

ok("parseTrail: poprawne punkty posortowane, śmieci odrzucone", () => {
  const p = parseTrail([{ lat: 51.3, lon: 31.4, t: "2026-10-11T20:02:00Z" }, { lat: 51.2, lon: 31.3, t: "2026-10-11T20:00:00Z" }, { lat: 999, lon: 1, t: "2026-10-11T20:00:00Z" }, { lat: 1, lon: 1 }, null]);
  assert.equal(p.length, 2); assert.ok(p[0].at < p[1].at); assert.deepEqual(parseTrail("x"), []);
});
ok("estimateNow: dron z kursem bez prędkości przesuwa się wzdłuż kursu o typową prędkość", () => {
  const t = normalizeThreat(raw()), e = estimateNow(t, T0 + 120e3);
  assert.ok(e); assert.equal(e.kmh, 180); assert.ok(Math.abs(e.km - 6) < 0.01);
  assert.ok(Math.abs(haversineKm(t, e) - 6) < 0.1); assert.ok(e.lat > t.lat); // kurs 350° = prawie na północ
});
ok("estimateNow: nie zgadujemy, gdy brak kursu, jest prędkość ze źródła, zgłoszenie za świeże/za stare, rakieta lub niedokładna pozycja", () => {
  const at = (over, dt = 120e3) => estimateNow(normalizeThreat(raw(over)), T0 + dt);
  assert.equal(at({ heading: null }), null); assert.equal(at({ speedKmh: 150 }), null);
  assert.equal(at({}, 10e3), null); assert.equal(at({}, 700e3), null);
  assert.equal(at({ type: "missile" }), null); assert.equal(at({ type: "fpv" }), null);
  assert.equal(at({ uncertaintyKm: 80 }), null); assert.equal(at({ advisory: true }), null);
  assert.equal(at({ areaOnly: true }), null);
});
ok("ślad: pozycje z kolejnych zgłoszeń układają się w drogę, bez duplikatów i bez bieżącej pozycji", () => {
  const st = new ThreatStore();
  st.upsert(raw({ lat: 51.0, lon: 31.0, confirmedAt: new Date(T0 - 240e3).toISOString(), updatedAt: new Date(T0 - 240e3).toISOString() }));
  st.upsert(raw({ lat: 51.1, lon: 31.1, confirmedAt: new Date(T0 - 120e3).toISOString(), updatedAt: new Date(T0 - 120e3).toISOString() }));
  st.upsert(raw({ lat: 51.1, lon: 31.1, confirmedAt: new Date(T0 - 100e3).toISOString(), updatedAt: new Date(T0 - 100e3).toISOString() })); // ta sama pozycja
  st.upsert(raw());
  const t = st.items.get("trk_1"), tr = st.trailOf(t);
  assert.equal(tr.length, 2); assert.ok(tr[0].at < tr[1].at);
});
ok("ślad z API jest łączony z naszą pamięcią", () => {
  const st = new ThreatStore();
  st.upsert(raw({ trail: [{ lat: 50.9, lon: 30.9, t: new Date(T0 - 600e3).toISOString() }, { lat: 51.0, lon: 31.0, t: new Date(T0 - 300e3).toISOString() }, { lat: 51.2, lon: 31.3, t: new Date(T0).toISOString() }] }));
  assert.equal(st.trailOf(st.items.get("trk_1")).length, 2); // bez ostatniego (bieżącego) punktu
});
ok("buildView: wiersz ma ślad i szacunek, a ocena (assess) nie korzysta z szacunku", () => {
  const st = new ThreatStore();
  st.upsert(raw({ trail: [{ lat: 51.0, lon: 31.0, t: new Date(T0 - 300e3).toISOString() }] }));
  st.nowMs = () => T0 + 120e3;
  const v = buildView(st, null, true, {}), r = v.rows[0];
  assert.ok(r.est && r.trail.length === 1);
});
ok("RSS: adresy względne w pliku (Radio Opole) są rozwiązywane względem kanału", () => {
  const xml = `<rss version="2.0"><channel><title>x</title><link>https://radio.opole.pl</link><item><title>Pożar w Opolu</title><link>100,925163,pozar-w-opolu</link><pubDate>Sun, 11 Oct 2026 19:00:00 +0200</pubDate></item></channel></rss>`;
  const r = parseRss(xml); assert.equal(r.length, 1); assert.equal(r[0].url, "https://radio.opole.pl/100,925163,pozar-w-opolu");
});
ok("źródła: Radio ZET i TVP Info mają wyszukiwanie kanału, Polskie Radio 24 usunięte (robots.txt)", () => {
  
  assert.ok(!SOURCES.find((x) => x.id === "media-polskieradio24"));
  assert.ok(SOURCES.find((x) => x.id === "kwpsp-slaskie").urls.some((u) => u.endsWith("/wiadomosci")));
});
ok("filtry: „burza po wyborach”, remonty, sądy i nagrody odpadają; prawdziwe zdarzenia zostają", () => {
  for (const t of ["Prawica świętuje, jest kontra rządzących. Burza po wyborach w Krakowie", "Kolejne skrzyżowanie w Opolu do remontu. Będą utrudnienia", "Wyrok w sprawie śmiertelnego wypadku na DK16. Kierowca skazany", "Atak drona, ranni funkcjonariusze. Kontrterroryści rywalizowali na Pomorzu", "Jak reagować w sytuacji zagrożenia? W Olsztynie odbędzie się Forum Bezpieczeństwa"]) assert.equal(passesFilter("media", t), false, t);
  for (const t of ["Burza z gradem nad Lublinem. Strażacy wypompowują wodę", "Burze z piorunami nad Mazowszem. Ostrzeżenie IMGW", "Tragiczny wypadek w Gdyni. Nie żyją dwie osoby", "Atak nożem w szkole w Warszawie. Trzy osoby ranne", "Nowe informacje ws. zamachu na Donalda Tuska"]) assert.equal(passesFilter("media", t), true, t);
  for (const t of ["500 mln zł na rozwój polskich technologii kosmicznych. Powstaje Vinci Space Tech Fund", "Nowe inwestycje i współpraca przemysłowa dla bezpieczeństwa Bałtyku", "Uroczyste zakończenie studiów podyplomowych dla kadry Państwowej Straży Pożarnej", "Wystartowała Kampania Dzieciństwo bez Przemocy", "Komunikat dla mediów - zapowiedź briefingu"]) assert.equal(passesFilter("safety", t), false, t);
  for (const t of ["Ostrzeżenie IMGW przed silnym wiatrem w województwie lubelskim", "Czarny alert drogowy – tragiczny karambol na obwodnicy Zawiercia", "Ponad 100 mld zł na ochronę ludności i obronę cywilną", "MSWiA publikuje instrukcję reagowania podczas zagrożenia atakiem z powietrza"]) assert.equal(passesFilter("safety", t), true, t);
});
console.log(`OK: ${n} grup testów v24 przeszło`);
