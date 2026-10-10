// Polskie nazwy miejsc z danych NEPTUN (ukraiński / rosyjski → polski). Czysta logika, bez DOM.
// 1) słownik obwodów i większych miejscowości (polskie egzonimy: Łuck, Lwów, Tarnopol…),
// 2) dla reszty: transliteracja cyrylicy na polską pisownię (np. „Горохів” → „Horochów”).
// Tekst bez cyrylicy zostaje bez zmian.
export const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(String(s ?? ""));

const OBLAST = {
  "волинська": "wołyński", "волынская": "wołyński", "рівненська": "rówieński", "ровенская": "rówieński",
  "львівська": "lwowski", "львовская": "lwowski", "тернопільська": "tarnopolski", "тернопольская": "tarnopolski",
  "хмельницька": "chmielnicki", "хмельницкая": "chmielnicki", "житомирська": "żytomierski", "житомирская": "żytomierski",
  "київська": "kijowski", "киевская": "kijowski", "чернігівська": "czernihowski", "черниговская": "czernihowski",
  "сумська": "sumski", "сумская": "sumski", "харківська": "charkowski", "харьковская": "charkowski",
  "луганська": "ługański", "луганская": "ługański", "донецька": "doniecki", "донецкая": "doniecki",
  "запорізька": "zaporoski", "запорожская": "zaporoski", "дніпропетровська": "dniepropetrowski", "днепропетровская": "dniepropetrowski",
  "полтавська": "połtawski", "полтавская": "połtawski", "черкаська": "czerkaski", "черкасская": "czerkaski",
  "кіровоградська": "kirowohradzki", "кировоградская": "kirowohradzki", "вінницька": "winnicki", "винницкая": "winnicki",
  "одеська": "odeski", "одесская": "odeski", "миколаївська": "mikołajowski", "николаевская": "mikołajowski",
  "херсонська": "chersoński", "херсонская": "chersoński", "івано-франківська": "iwanofrankiwski", "ивано-франковская": "iwanofrankiwski",
  "закарпатська": "zakarpacki", "закарпатская": "zakarpacki", "чернівецька": "czerniowiecki", "черновицкая": "czerniowiecki",
  "брестська": "brzeski", "брестская": "brzeski", "гродненська": "grodzieński", "гродненская": "grodzieński",
  "мінська": "miński", "минская": "miński", "гомельська": "homelski", "гомельская": "homelski",
};
const PLACE = {
  "луцьк": "Łuck", "луцк": "Łuck", "рівне": "Równe", "ровно": "Równe", "львів": "Lwów", "львов": "Lwów",
  "тернопіль": "Tarnopol", "тернополь": "Tarnopol", "хмельницький": "Chmielnicki", "хмельницкий": "Chmielnicki",
  "житомир": "Żytomierz", "київ": "Kijów", "киев": "Kijów", "чернігів": "Czernihów", "чернигов": "Czernihów",
  "суми": "Sumy", "сумы": "Sumy", "харків": "Charków", "харьков": "Charków", "луганськ": "Ługańsk", "луганск": "Ługańsk",
  "донецьк": "Donieck", "донецк": "Donieck", "запоріжжя": "Zaporoże", "запорожье": "Zaporoże", "дніпро": "Dniepr", "днепр": "Dniepr",
  "полтава": "Połtawa", "черкаси": "Czerkasy", "черкассы": "Czerkasy", "кропивницький": "Kropywnycki", "кировоград": "Kropywnycki",
  "вінниця": "Winnica", "винница": "Winnica", "одеса": "Odessa", "одесса": "Odessa", "миколаїв": "Mikołajów", "николаев": "Mikołajów",
  "херсон": "Chersoń", "івано-франківськ": "Iwano-Frankiwsk", "ивано-франковск": "Iwano-Frankiwsk", "ужгород": "Użhorod",
  "чернівці": "Czerniowce", "черновцы": "Czerniowce", "севастополь": "Sewastopol", "крим": "Krym", "крым": "Krym",
  "ковель": "Kowel", "дубно": "Dubno", "кременець": "Krzemieniec", "кременец": "Krzemieniec", "червоноград": "Czerwonogród",
  "самбір": "Sambor", "стрий": "Stryj", "дрогобич": "Drohobycz", "коломия": "Kołomyja", "мукачево": "Mukaczewo",
  "кременчук": "Krzemieńczuk", "умань": "Humań", "бердичів": "Berdyczów", "горохів": "Horochów", "любомль": "Lubomla",
  "ківерці": "Kiwerce", "сарни": "Sarny", "костопіль": "Kostopol", "радивилів": "Radziwiłłów", "броди": "Brody",
  "золочів": "Złoczów", "яворів": "Jaworów", "нововолинськ": "Nowowołyńsk", "здолбунів": "Zdołbunów", "острог": "Ostróg",
  "шепетівка": "Szepetówka", "коростень": "Korosteń", "камінь-каширський": "Kamień Koszyrski", "ратне": "Ratne",
  "володимир": "Włodzimierz Wołyński", "володимир-волинський": "Włodzimierz Wołyński", "володимир-волынский": "Włodzimierz Wołyński",
  "брест": "Brześć", "мінськ": "Mińsk", "минск": "Mińsk", "гомель": "Homel", "гродно": "Grodno", "біла церква": "Biała Cerkiew",
  "кам'янець-подільський": "Kamieniec Podolski", "каменец-подольский": "Kamieniec Podolski",
  "україна": "Ukraina", "украина": "Ukraina", "білорусь": "Białoruś", "беларусь": "Białoruś", "росія": "Rosja", "россия": "Rosja",
  "чорне море": "Morze Czarne", "черное море": "Morze Czarne",
};
const WORD = { "область": "obwód", "обл.": "obwód", "район": "rejon", "р-н": "rejon", "м.": "", "місто": "miasto", "город": "miasto", "громада": "gmina" };

const LAT = { а: "a", б: "b", в: "w", д: "d", е: "e", ж: "ż", з: "z", и: "y", і: "i", й: "j", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "ch", ц: "c", ч: "cz", ш: "sz", щ: "szcz", ы: "y", э: "e", ґ: "g", ё: "io" };
const SOFT = new Set(["ь", "ъ", "'", "’", "ʼ"]);
const HARD = new Set(["л", "ц", "ч", "ш", "щ", "ж"]); // po nich Polacy piszą -a/-u/-e, nie -ia/-iu/-ie
const VOWELS = new Set("аеєиіїоуюяыэё".split(""));

/** Transliteracja jednego słowa (cyrylica → polska pisownia). uk = tekst ukraiński (г → h), inaczej rosyjski (г → g). */
export function translitWord(word, uk) {
  const w = word.toLowerCase();
  let out = "";
  for (let i = 0; i < w.length; i++) {
    const c = w[i], prev = w[i - 1], next = w[i + 1];
    const afterVowelOrStart = i === 0 || VOWELS.has(prev) || SOFT.has(prev);
    if (c === "г") out += uk ? "h" : "g";
    else if (c === "л") out += next && ("іїьєюя".includes(next) || (!uk && next === "и")) ? "l" : "ł";
    else if (c === "є") out += afterVowelOrStart ? "je" : HARD.has(prev) ? "e" : "ie";
    else if (c === "ї") out += "ji";
    else if (c === "ю") out += afterVowelOrStart ? "ju" : HARD.has(prev) ? "u" : "iu";
    else if (c === "я") out += afterVowelOrStart ? "ja" : HARD.has(prev) ? "a" : "ia";
    else if (c === "ь") { if (prev === "н" && next !== "к" && (next === undefined || !VOWELS.has(next))) out = out.slice(0, -1) + "ń"; }
    else if (SOFT.has(c)) { /* pomijamy */ }
    else if (c === "и" && !uk) out += "i";
    else if (c in LAT) out += LAT[c];
    else out += c;
  }
  // końcówki: -ів → -ów, -ький/-ський/-цький → -ki/-ski/-cki (przymiotniki), -ий/-ій → -y/-ij
  out = out.replace(/iw$/, "ów").replace(/ckyj$|ckij$/, "cki").replace(/skyj$|skij$/, "ski").replace(/kyj$|kij$/, "ki");
  if (word[0] && word[0] !== word[0].toLowerCase()) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}

/**
 * Polska nazwa miejsca. Zna słownik (obwody, miasta), resztę transliteruje. Brak cyrylicy ⇒ bez zmian.
 * „Волинська область” → „obwód wołyński”, „Луцьк” → „Łuck”, „Горохів” → „Horochów”.
 */
export function polishPlace(input) {
  const s0 = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!s0 || !hasCyrillic(s0)) return s0;
  const low = s0.toLowerCase().replace(/[’ʼ`]/g, "'");
  if (PLACE[low]) return PLACE[low];
  const uk = !/[ыэъё]/i.test(s0); // NEPTUN jest ukraiński: domyślnie ukraiński, rosyjski tylko gdy są litery typowe dla rosyjskiego
  // „<przymiotnik> область/обл.” → „obwód <przymiotnik>”
  let m = /^(\S+)\s+(?:область|обл\.?)$/.exec(low);
  if (m && OBLAST[m[1]]) return `obwód ${OBLAST[m[1]]}`;
  m = /^(?:область|обл\.?)\s+(\S+)$/.exec(low);
  if (m && OBLAST[m[1]]) return `obwód ${OBLAST[m[1]]}`;
  // słowo po słowie
  return s0.split(/(\s+|,|\/|·)/).map((tok) => {
    if (!tok.trim() || /^[\s,/·]+$/.test(tok)) return tok;
    const t = tok.toLowerCase().replace(/[’ʼ`]/g, "'");
    if (PLACE[t]) return PLACE[t];
    if (Object.hasOwn(WORD, t)) return WORD[t];
    if (!hasCyrillic(tok)) return tok;
    return translitWord(tok, uk);
  }).join("").replace(/\s+/g, " ").trim();
}
