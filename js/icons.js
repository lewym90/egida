// Kolorowy zestaw ikon EGIDY (menu dolne, menu boczne, „Więcej”, kafelki, listy). Wszystkie rysowane tak samo:
// jasna wypełniona bryła + ciemniejszy kontur 1,6 + jeden jaskrawy akcent. Kolory są stałe (nie dziedziczą koloru tekstu),
// dzięki czemu ikona rzuca się w oczy także na szarym tle. Ikony narzędziowe (strzałki, ptaszek, telefon) zostają jednokolorowe w js/app.js.
//   zieleń  = Pulpit, pomoc w pobliżu   bursztyn = ostrzeżenia, plan rodziny   błękit = mapa, poradnik, plecak
//   czerwień = krew, pierwsza pomoc, apteczka, tryb zagrożenia   fiolet = zagrożenia hybrydowe
const cic = (inner, s = 24) => `<svg class="ci" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;

const G = { dk: "#0B6B63", mid: "#17A58F", lt: "#CFEBE3" };       // zieleń marki
const A = { dk: "#B45309", mid: "#FFC233", lt: "#FFE7B3" };       // bursztyn
const B = { dk: "#2A4DA0", mid: "#4F7BE0", lt: "#D6E2FB" };       // błękit
const R = { dk: "#B3261E", mid: "#E5484D", lt: "#FDD9D5" };       // czerwień
const P = { dk: "#5B33AE", mid: "#8A5CE0", lt: "#E9E0FA" };       // fiolet
const S = { dk: "#4A5B6C", mid: "#8FA0B2", lt: "#E3E9EF" };       // szarość (ustawienia)
const w = 'stroke-width="1.6"';

export const C = {
  // --- menu dolne ---
  home: cic(`<path d="M4 11.4 12 4.6l8 6.8V19a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19z" fill="${G.lt}" stroke="${G.dk}" ${w}/><path d="M2.6 12 12 3.6 21.4 12" stroke="${G.dk}" stroke-width="2"/><rect x="9.6" y="13.4" width="4.8" height="7.4" rx="1.3" fill="${G.mid}" stroke="${G.dk}" stroke-width="1.4"/>`),
  bell: cic(`<path d="M6 10.2a6 6 0 0 1 12 0c0 5 2 6.2 2 6.2H4s2-1.2 2-6.2z" fill="${A.mid}" stroke="${A.dk}" ${w}/><path d="M10 19.2a2 2 0 0 0 4 0" stroke="${A.dk}" stroke-width="1.8"/><path d="M12 4.2V3" stroke="${A.dk}" stroke-width="1.8"/><circle cx="18.2" cy="5.6" r="2.7" fill="${R.mid}" stroke="#fff" stroke-width="1.2"/>`),
  map: cic(`<path d="M3 6.6 9 4.2l6 2.4 6-2.4v13.2l-6 2.4-6-2.4-6 2.4z" fill="${B.lt}" stroke="${B.dk}" ${w}/><path d="M9 4.2v13.2M15 6.6v13.2" stroke="${B.dk}" stroke-width="1.3"/><path d="M15.2 15.6s3.2-2.5 3.2-5a3.2 3.2 0 0 0-6.4 0c0 2.5 3.2 5 3.2 5z" fill="${R.mid}" stroke="#fff" stroke-width="1.1"/><circle cx="15.2" cy="10.4" r="1.1" fill="#fff"/>`),
  shield: cic(`<path d="M12 3 20 6v5.6c0 4.6-3.2 8-8 9.4-4.8-1.4-8-4.8-8-9.4V6z" fill="${G.mid}" stroke="${G.dk}" ${w}/><path d="M12 8.4v6.2M8.9 11.5h6.2" stroke="#fff" stroke-width="2"/>`),
  book: cic(`<path d="M5 4.6A1.6 1.6 0 0 1 6.6 3H19v14.6H6.6A1.6 1.6 0 0 0 5 19.2z" fill="${B.mid}" stroke="${B.dk}" ${w}/><path d="M5 19.2A1.6 1.6 0 0 0 6.6 20.8H19v-3.2" stroke="${B.dk}" ${w}/><path d="M9 7.6h6M9 11h4" stroke="#fff" stroke-width="1.7"/>`),
  more: cic(`<rect x="3.6" y="3.6" width="7.2" height="7.2" rx="2.2" fill="${G.mid}"/><rect x="13.2" y="3.6" width="7.2" height="7.2" rx="2.2" fill="${A.mid}"/><rect x="3.6" y="13.2" width="7.2" height="7.2" rx="2.2" fill="${B.mid}"/><rect x="13.2" y="13.2" width="7.2" height="7.2" rx="2.2" fill="${R.mid}"/>`),
  // --- krew i pierwsza pomoc ---
  drop: cic(`<path d="M12 2.8S5.4 9.8 5.4 14.6a6.6 6.6 0 0 0 13.2 0C18.6 9.8 12 2.8 12 2.8z" fill="${R.mid}" stroke="${R.dk}" ${w}/><path d="M8.8 14.8a3.3 3.3 0 0 0 2.5 3.2" stroke="#fff" stroke-width="1.7" opacity=".9"/>`),
  heart: cic(`<path d="M12 20.6S4 15.8 4 9.9A4.4 4.4 0 0 1 12 7.5a4.4 4.4 0 0 1 8 2.4c0 5.9-8 10.7-8 10.7z" fill="${R.mid}" stroke="${R.dk}" ${w}/><path d="M12 9.8v5.4M9.3 12.5h5.4" stroke="#fff" stroke-width="1.9"/>`),
  kit: cic(`<path d="M9 7.4V6a1.7 1.7 0 0 1 1.7-1.7h2.6A1.7 1.7 0 0 1 15 6v1.4" stroke="${R.dk}" ${w}/><rect x="3.4" y="7.4" width="17.2" height="12.6" rx="3" fill="${R.mid}" stroke="${R.dk}" ${w}/><path d="M12 10.8v5.6M9.2 13.6h5.6" stroke="#fff" stroke-width="2"/>`),
  // --- przygotowanie ---
  bag: cic(`<path d="M8.6 7V5.6a3.4 3.4 0 0 1 6.8 0V7" stroke="${B.dk}" ${w}/><rect x="4.6" y="7" width="14.8" height="13.8" rx="3.6" fill="${B.mid}" stroke="${B.dk}" ${w}/><rect x="8" y="12.2" width="8" height="5.4" rx="1.6" fill="${B.lt}" stroke="${B.dk}" stroke-width="1.2"/>`),
  users: cic(`<circle cx="9" cy="8.2" r="3.3" fill="${A.mid}" stroke="${A.dk}" stroke-width="1.5"/><path d="M3 20.2c0-3.4 2.7-6 6-6s6 2.6 6 6z" fill="${A.mid}" stroke="${A.dk}" stroke-width="1.5"/><circle cx="17" cy="9" r="2.6" fill="${A.lt}" stroke="${A.dk}" stroke-width="1.5"/><path d="M16.4 14.4c2.7 0 4.6 2 4.6 5.8h-3.6" fill="${A.lt}" stroke="${A.dk}" stroke-width="1.5"/>`),
  list: cic(`<rect x="5" y="4.6" width="14" height="16.4" rx="2.6" fill="${G.lt}" stroke="${G.dk}" ${w}/><rect x="8.6" y="2.8" width="6.8" height="3.8" rx="1.4" fill="${G.mid}" stroke="${G.dk}" stroke-width="1.4"/><path d="M8.6 11.2l1.2 1.2 2.1-2.3M13.6 11.4h2.4M8.6 16.2l1.2 1.2 2.1-2.3M13.6 16.4h2.4" stroke="${G.dk}" stroke-width="1.5"/>`),
  test: cic(`<rect x="5" y="3.4" width="14" height="17.6" rx="2.6" fill="${A.lt}" stroke="${A.dk}" ${w}/><path d="M8.6 9l1.4 1.4 2.4-2.6M8.6 14.6l1.4 1.4 2.4-2.6M14.2 9.2h1.8M14.2 14.8h1.8" stroke="${A.dk}" stroke-width="1.6"/>`),
  pin: cic(`<path d="M12 21.2s7-6 7-11.8a7 7 0 1 0-14 0c0 5.8 7 11.8 7 11.8z" fill="${G.mid}" stroke="${G.dk}" ${w}/><circle cx="12" cy="9.4" r="2.6" fill="#fff"/>`),
  // --- ostrzeżenia ---
  warn: cic(`<path d="M12 3.4 21.5 19.8a1 1 0 0 1-.9 1.5H3.4a1 1 0 0 1-.9-1.5z" fill="${A.mid}" stroke="${A.dk}" ${w}/><path d="M12 9.6v4.8M12 17.4v.2" stroke="#6B3A00" stroke-width="2"/>`),
  danger: cic(`<path d="M12 3.4 21.5 19.8a1 1 0 0 1-.9 1.5H3.4a1 1 0 0 1-.9-1.5z" fill="${R.mid}" stroke="${R.dk}" ${w}/><path d="M12 9.6v4.8M12 17.4v.2" stroke="#fff" stroke-width="2"/>`),
  news: cic(`<rect x="3.4" y="5" width="15" height="14.6" rx="2.3" fill="${B.lt}" stroke="${B.dk}" ${w}/><path d="M18.4 9h1.9a1.2 1.2 0 0 1 1.2 1.2v7.2a2.2 2.2 0 0 1-2.2 2.2h-.9" stroke="${B.dk}" ${w}/><path d="M7 9h8M7 12.4h8M7 15.8h5" stroke="${B.mid}" stroke-width="1.7"/>`),
  tg: cic(`<path d="M21 3.4 2.8 10.6l6.1 2.4 2.3 6.4 3.1-4 4.6 3.3z" fill="#5AB8F0" stroke="${B.dk}" ${w}/><path d="M21 3.4 8.9 13l.4 4.7" stroke="${B.dk}" stroke-width="1.4"/>`),
  gear: cic(`<path d="M12 3.2l1.5.2.5 2.1 1.7.7 1.9-1.1 2.1 2.1-1.1 1.9.7 1.7 2.1.5.2 1.5-.2 1.5-2.1.5-.7 1.7 1.1 1.9-2.1 2.1-1.9-1.1-1.7.7-.5 2.1-1.5.2-1.5-.2-.5-2.1-1.7-.7-1.9 1.1-2.1-2.1 1.1-1.9-.7-1.7-2.1-.5L3.2 12l.2-1.5 2.1-.5.7-1.7-1.1-1.9L7.2 4.3l1.9 1.1 1.7-.7.5-2.1z" fill="${S.lt}" stroke="${S.dk}" stroke-width="1.5"/><circle cx="12" cy="12" r="3.2" fill="#fff" stroke="${S.dk}" stroke-width="1.6"/>`),
  // --- nowe działy ---
  bolt: cic(`<path d="M13.4 2.6 5 13.4h5.8l-1 8 8.4-10.8h-5.8z" fill="${A.mid}" stroke="${A.dk}" ${w}/>`),
  hybrid: cic(`<path d="M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12z" fill="${P.lt}" stroke="${P.dk}" ${w}/><circle cx="12" cy="12" r="3.3" fill="${P.mid}" stroke="${P.dk}" stroke-width="1.4"/><circle cx="13.1" cy="10.9" r="1" fill="#fff"/>`),
  senior: cic(`<rect x="3" y="3" width="18" height="18" rx="5" fill="${G.lt}" stroke="${G.dk}" ${w}/><path d="M6.2 17.6 9.8 7l3.6 10.6M7.6 14h4.4" stroke="${G.dk}" stroke-width="1.8"/><path d="M17 8.2v5.2M14.4 10.8h5.2" stroke="${A.dk}" stroke-width="1.8"/>`),
  air: cic(`<path d="M7.4 13.8h9.3a3.5 3.5 0 0 0 .5-6.9 5.1 5.1 0 0 0-9.7 1.3 3 3 0 0 0-.1 5.6z" fill="${B.lt}" stroke="${B.dk}" ${w}/><path d="M3.6 17.4h11M3.6 20.8h7M18 17.4h2.4" stroke="${G.mid}" stroke-width="1.9"/>`),
  backup: cic(`<rect x="3.4" y="13.4" width="17.2" height="7" rx="2.4" fill="${G.lt}" stroke="${G.dk}" ${w}/><path d="M12 3.4v9M8.4 9.2 12 12.8l3.6-3.6" stroke="${G.mid}" stroke-width="2"/><circle cx="17" cy="16.9" r=".9" fill="${G.dk}"/>`),
  refresh: cic(`<path d="M19.6 8.4A8 8 0 0 0 5 10M4.4 15.6A8 8 0 0 0 19 14" stroke="${B.dk}" stroke-width="2"/><path d="M19.8 3.8v4.8h-4.8M4.2 20.2v-4.8h4.8" stroke="${B.dk}" stroke-width="2"/>`),
  phone: cic(`<path d="M5.4 3.6h3.4l1.7 4.3-2.1 1.3a10.4 10.4 0 0 0 5.4 5.4l1.3-2.1 4.3 1.7v3.4a1.8 1.8 0 0 1-1.9 1.8A15.6 15.6 0 0 1 3.6 5.5a1.8 1.8 0 0 1 1.8-1.9z" fill="${R.mid}" stroke="${R.dk}" ${w}/>`),
};
export { cic };
