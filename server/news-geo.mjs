// EGIDA – ustalanie miejsca wiadomości (województwa) i ocena, czy wiadomość „ze świata” wpływa na Polskę.
// Zasady (ustalone z właścicielem): dokładność ponad zasięg. Gdy nie ma pewności, wiadomość NIE trafia do żadnego województwa
// (jest pomijana, nigdzie jej nie pokazujemy). Nic nie jest zgadywane.
//  * Dopasowanie po CAŁYCH WYRAZACH i znanych końcówkach (Poznań, Poznania, w Poznaniu, poznański, poznańskie, Wielkopolska, w Wielkopolsce…).
//  * Nazwy dwuznaczne (Łask, Żary, Piła, Świecie, Brzeg…) są „słabe”: same nigdy nie rozstrzygają.
//  * Dwa różne województwa w jednym tekście = konflikt = wstrzymanie (brak przypisania).
//  * Warstwy: kategoria/adres → tytuł → opis → treść artykułu (ta ostatnia tylko, gdy wcześniejsze nic nie wskazały).

export const fold = (s) => String(s || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");

// Końcówki (po zwinięciu polskich liter: ą→a, ę→e, ó→o…). Rzeczownik, przymiotnik (poznański, łódzki), mieszkańcy.
const NOUN = ["", "a", "e", "i", "u", "y", "ie", "iu", "em", "ia", "ii", "o", "owi", "iem", "ach", "ami", "om", "ze", "ej"];
const ADJ = ["ski", "skie", "skiego", "skiemu", "skim", "skiem", "ska", "skiej", "skich", "skimi", "scy", "ki", "kie", "kiego", "kiemu", "kim", "kiej", "kich", "kimi", "cy", "ie", "iego", "iemu", "i", "im", "imi", "ich", "iej"];
const INH = ["ianin", "ianina", "ianie", "ianom", "ianami", "ian", "ak", "aka", "acy", "akow", "anin", "anina", "anie", "czyk", "czycy"];
const WORDSUF = [...new Set([...NOUN, ...ADJ, "y", "ym", "ymi", "ego", "emu", "ej", "ych"])];
const TOWNSUF = [...new Set([...NOUN, ...ADJ, ...INH])];

// ---------- Miejscowości ----------
// Zapis: „Nazwa” albo „Nazwa=dodatkowy_rdzeń/inny” (rdzenie bez polskich liter). „?” na początku = nazwa słaba (dwuznaczna).
// Rdzeń powstaje z nazwy (bez ostatniej samogłoski) i z dodatków; do każdego dopisujemy końcówki.
const TOWNS = {
  dolnoslaskie: "Wrocław;Wałbrzych=walbrzysk;Legnica=legnick;Jelenia Góra=jeleniogor;Lubin;Głogów=glogowsk;Świdnica=swidnick;Bolesławiec=boleslawc/boleslawiec;Zgorzelec=zgorzelc/zgorzeleck;Kłodzko=klodzk;Oława=olawsk;Oleśnica=olesnick;Dzierżoniów=dzierzoniowsk;Świebodzice;Polkowice=polkowick;Złotoryja=zlotoryjsk;Lubań=luban/lubansk;Milicz;Trzebnica=trzebnick;Strzelin;Kamienna Góra;Bielawa;Nowa Ruda;Ząbkowice Śląskie;Bystrzyca Kłodzka;Szklarska Poręba;Karpacz;?Karkonosze;?Sudety;?Wołów;?Jawor;Lwówek Śląski;Środa Śląska;Brzeg Dolny;Oborniki Śląskie;Kudowa-Zdrój;Polanica-Zdrój;Szczawno-Zdrój;Boguszów-Gorce;Głuszyca;Zawidów;Bogatynia;Turoszów;Chojnów;Prochowice;Ścinawa;Żmigród;Syców;?Sobótka;?Wąsosz;Dolny Śląsk=dolnoslask",
  "kujawsko-pomorskie": "Bydgoszcz=bydgosk;Toruń;Włocławek=wloclawk/wloclawsk;Grudziądz=grudziadzk;Inowrocław=inowroclawsk;Brodnica=brodnick;Świecie nad Wisłą;Chełmno;Tuchola=tucholsk;Radziejów;Aleksandrów Kujawski;Rypin;Golub-Dobrzyń;Mogilno;Sępólno Krajeńskie;Nakło nad Notecią;Żnin;Wąbrzeźno;Chełmża;?Lipno;Szubin;Kcynia;Koronowo;Solec Kujawski;Ciechocinek;Kruszwica;Strzelno;Nieszawa;Barcin;Łabiszyn;Janikowo;Kujawy=kujawsk",
  lubelskie: "Lublin=lubel;Zamość=zamosc/zamojsk;Chełm=chelmsk;Biała Podlaska;Puławy=pulawsk;Świdnik;Kraśnik=krasnick;Łuków=lukowsk;Łęczna;Kazimierz Dolny;Tomaszów Lubelski;Hrubieszów;Parczew;Radzyń Podlaski;Włodawa;Opole Lubelskie;Lubartów;Biłgoraj=bilgorajsk;Janów Lubelski;Krasnystaw=krasnystawsk;?Roztocze;Terespol;Dęblin;Ryki;Łosice;Międzyrzec Podlaski;Rejowiec;Szczebrzeszyn;Annopol;Poniatowa;Lubelszczyzna=lubelszczyzn;Zwierzyniec;Frampol",
  lubuskie: "Zielona Góra=zielonogor;Gorzów Wielkopolski=gorzow/gorzowsk;Nowa Sól=nowosol;Żagań;Świebodzin;Sulechów;Słubice;Kostrzyn nad Odrą;Międzyrzecz;Wschowa;Strzelce Krajeńskie;Krosno Odrzańskie;Gubin;Żary=zarsk;Żagań;Szprotawa;Drezdenko;Skwierzyna;Sulęcin;Lubsko;Witnica;Cybinka;Rzepin;Zbąszynek;Babimost;Ziemia Lubuska=lubusk;Lubuskie=lubusk",
  lodzkie: "Piotrków Trybunalski=piotrkow;Pabianice=pabianick;Tomaszów Mazowiecki;Bełchatów=belchatowsk;Zgierz;Skierniewice=skierniewick;Radomsko=radomszczansk;Sieradz=sieradzk;Zduńska Wola;Kutno=kutnowsk;?Łask;Łowicz=lowick;Wieluń=wielunsk;Opoczno=opoczynsk;Brzeziny;Rawa Mazowiecka;Pajęczno;Głowno;Aleksandrów Łódzki;Konstantynów Łódzki;Ozorków;Zelów;Wolbórz;Uniejów;Szadek;Rzgów;Koluszki;Sulejów;?Zduny;Poddębice;Łęczyca=leczyck;Wieruszów;Działoszyn",
  malopolskie: "Kraków;Tarnów;Nowy Sącz;Nowy Targ;Zakopane=zakopian;Oświęcim=oswiecimsk;Chrzanów;Olkusz;Wieliczka=wielick;Bochnia=bochensk;Gorlice=gorlick;Limanowa=limanowsk;Myślenice=myslenick;Wadowice=wadowick;Skawina;Proszowice;Miechów;Brzesko=brzeski;Dąbrowa Tarnowska;?Tatry;Podhale=podhalansk;Szczawnica;Sucha Beskidzka;Andrychów;Krynica-Zdrój;Muszyna;Rabka-Zdrój;Maków Podhalański;Kalwaria Zebrzydowska;Trzebinia;Libiąż;Alwernia;Niepołomice;Bobowa;Grybów;Zator;Kęty;Małopolska=malopolsc/malopolsk;Rytro",
  mazowieckie: "Warszawa=warszaw;Radom;Płock=plock;Siedlce=siedlec;Ostrołęka=ostrolec;Ciechanów=ciechanowsk;Pruszków=pruszkowsk;Legionowo=legionowsk;Otwock=otwock;Wołomin;Piaseczno=piaseczyn;Mława=mlawsk;Sochaczew;Żyrardów=zyrardowsk;Garwolin;Mińsk Mazowiecki;Grodzisk Mazowiecki;Konstancin-Jeziorna;Kozienice;Przasnysz;Pułtusk;Wyszków;Płońsk;Nowy Dwór Mazowiecki;Grójec;Białobrzegi;Szydłowiec;Gostynin;Sierpc;Maków Mazowiecki;Łomianki;Wawer;Bemowo;Mokotów;Ursynów;Targówek;Białołęka;Ursus;Wilanów;Rembertów;Ożarów Mazowiecki;?Marki;?Ząbki;?Zielonka;?Józefów;Mazowsze=mazowsz/mazowiec;Radzymin;Sulejówek;Brwinów;Podkowa Leśna;Nadarzyn;Raszyn;Lesznowola;Żuromin;Węgrów;Łosice;Sokołów Podlaski;Mszczonów;?Błonie;Teresin;Kałuszyn;??Tłuszcz",
  opolskie: "Opole=opolsk;Kędzierzyn-Koźle=kedzierzyn;Nysa=nysk;Kluczbork=kluczbork;Prudnik;Namysłów;Krapkowice;Strzelce Opolskie;Gogolin;Głubczyce;Olesno;Biały Kościół;Ozimek;Zdzieszowice;Głuchołazy;Paczków;Brzeg=brzesk;Ujazd;Dobrodzień;?Zawadzkie;Grodków;Lewin Brzeski;Niemodlin;Byczyna;Opolszczyzna=opolszczyzn;Śląsk Opolski",
  podkarpackie: "Rzeszów=rzeszowsk;Przemyśl=przemysk;Krosno;Tarnobrzeg=tarnobrzesk;Stalowa Wola;Mielec=mielc;Jarosław=jaroslawsk;Sanok=sanock;Jasło=jaselsk;Dębica=debick;Łańcut=lancuck;Leżajsk=lezajsk;Ustrzyki Dolne;Lesko=lesk;Brzozów;Dynów;Ropczyce;Sędziszów Małopolski;Kolbuszowa;Lubaczów;Przeworsk;Strzyżów;Bieszczady=bieszczadzk;Medyka;Korczowa;Hruszów;Radymno;Rudnik nad Sanem;?Nisko;Ulanów;Zagórz;Baligród;Pilzno;Podkarpacie=podkarpaci/podkarpack;Ustrzyki;Zaklików;Kańczuga;Dukla",
  podlaskie: "Białystok=bialostock/bialymstok;Suwałki=suwalsk;Łomża=lomzynsk/lomzy;Augustów=augustowsk;Bielsk Podlaski;Hajnówka=hajnowsk;Sokółka=sokolsk;Grajewo;Wysokie Mazowieckie;Zambrów;Siemiatycze;Mońki;Sejny;?Kolno;Czarna Białostocka;Białowieża;?Kuźnica;?Bobrowniki;Połowce;Puszcza Białowieska;Supraśl;Wasilków;Choroszcz;Knyszyn;Dąbrowa Białostocka;?Łapy;Michałowo;Tykocin;Drohiczyn;Podlasie=podlasi/podlask;Narew;Narewka",
  pomorskie: "Gdańsk=gdansk;Gdynia=gdyn;Sopot=sopock;Słupsk=slupsk;Tczew=tczewsk;Wejherowo=wejherowsk;Rumia;?Puck;Kartuzy=kartusk;Kościerzyna=koscierski;Starogard Gdański;Malbork=malborsk;Kwidzyn=kwidzyńsk/kwidzynsk;Chojnice=chojnick;Lębork=lebork;Bytów;Człuchów;?Hel;Jastarnia;Ustka;Kaszuby=kaszubsk;Trójmiasto=trojmiejsk/trojmiesci;Reda;Władysławowo;Sztum;Gniew;Pruszcz Gdański;Skarszewy;Nowy Dwór Gdański;Krynica Morska;Łeba;Dzierzgoń;Hel;Żukowo;Cedry Wielkie",
  slaskie: "Katowice=katowic;Gliwice=gliwic;Zabrze=zabrzan;Bytom=bytomsk;Sosnowiec=sosnowc/sosnowiec;Bielsko-Biała=bielsko/bielsku;Częstochowa=czestochowsk;Rybnik=rybnick;Tychy=tysk;Dąbrowa Górnicza;Chorzów;Ruda Śląska;Jastrzębie-Zdrój=jastrzeb;Jaworzno=jaworznick;Mikołów;Żory=zorsk;Wodzisław Śląski;Cieszyn=cieszynsk;Pszczyna=pszczynsk;Zawiercie=zawiercian;Myszków;Lubliniec=lublinc;Tarnowskie Góry;Racibórz=raciborsk;Knurów;Siemianowice Śląskie;Świętochłowice;Piekary Śląskie;Żywiec=zywiecki/zywc;Szczyrk;Ustroń;Poręba Zawierciańska;Czechowice-Dziedzice;Bieruń;Imielin;Mysłowice;Orzesze;Czerwionka-Leszczyny;Rydułtowy;Radlin;Pyskowice;Toszek;Kalety;Koziegłowy;Blachownia;Kłobuck;Skoczów;Wisła;Brenna;Beskidy=beskidzk;Śląsk=slask;Górny Śląsk=gornoslask;Zagłębie Dąbrowskie;Strumień;Łazy;Siewierz;Bobrowniki Śląskie;Ogrodzieniec;?Porąbka;Bestwina",
  swietokrzyskie: "Kielce=kielec;Ostrowiec Świętokrzyski;Starachowice=starachowick;Skarżysko-Kamienna;Sandomierz=sandomiersk;Busko-Zdrój;Jędrzejów=jedrzejowsk;Pińczów;Staszów;Opatów;?Końskie;Włoszczowa=wloszczowsk;Kazimierza Wielka;Chmielnik;Ćmielów;Chęciny;Bodzentyn;Daleszyce;?Łagów;Świętokrzyskie=swietokrzysk;Góry Świętokrzyskie;Ziemia Świętokrzyska;?Ożarów;Zawichost;Koprzywnica;Połaniec;Małogoszcz;Nowy Korczyn;Morawica;Suchedniów;Ostrowiec",
  "warminsko-mazurskie": "Olsztyn=olsztyn;Elbląg=elblask;Iława=ilawsk;Giżycko=gizyck;Kętrzyn=ketrzynsk;Ostróda=ostrodsk;Mrągowo=mragowsk;Szczytno;Nidzica;Braniewo;Lidzbark Warmiński;Bartoszyce;Gołdap;Olecko;Orzysz;Działdowo;?Mikołajki;Biskupiec;Reszel;Frombork;Zalew Wiślany;Warmia=warminsk;Mazury=mazursk;Pisz;Ełk;Węgorzewo;Barczewo;Morąg;Pasłęk;Młynary;Tolkmicko;Sorkwity;Ruciane-Nida;Kruklanki;Dobre Miasto;Jeziorany;Lubawa;Susz",
  wielkopolskie: "Poznań;Kalisz=kalisk;Konin;Leszno=leszczyn;Gniezno=gnieznien;Ostrów Wielkopolski;Krotoszyn;Środa Wielkopolska;Swarzędz;Luboń;Kostrzyn Wielkopolski;?Września;Słupca;Chodzież;Czarnków;Wągrowiec;?Oborniki;Nowy Tomyśl;Szamotuły;Rawicz;Gostyń;Kościan;Jarocin;Pleszew;Kępno;?Złotów;Turek;Koło;Śrem;Wolsztyn;Grodzisk Wielkopolski;Buk;Murowana Goślina;Mosina;?Komorniki;Tarnowo Podgórne;Kórnik;Dopiewo;Wielkopolska=wielkopolsc/wielkopolsk;Piła=pilsk;Ostrzeszów;Trzemeszno;Witkowo;Kleczew;Rogoźno;Skoki;Zbąszyń;Opalenica;Pniewy;Międzychód;Wronki;Obrzycko;Czempiń;Stęszew;Rydzyna;Jutrosin",
  zachodniopomorskie: "Szczecin=szczecin;Koszalin=koszalin;Kołobrzeg=kolobrzesk;Świnoujście=swinoujsk;Stargard=stargardzk;Szczecinek=szczecink;Świdwin;Gryfice;Gryfino;Pyrzyce;Goleniów;#Wałcz;Drawsko Pomorskie;Białogard;Darłowo;Kamień Pomorski;Wolin;Dziwnów;Międzyzdroje;Choszczno;Myślibórz;Barlinek;Sianów;Resko;Dąbie;?Police;Łobez;Połczyn-Zdrój;Trzebiatów;Mielno;Ustronie Morskie;Rewal;Pobierowo;Szczecin Dąbie;Zachodniopomorskie=zachodniopomorsk;Pomorze Zachodnie;Zachodnie Pomorze;Nowogard;Kalisz Pomorski;Recz;Węgorzyno;?Płoty;Maszewo;Stepnica;Cedynia;Moryń;Trzcińsko-Zdrój;Dębno",
};

// Nazwy regionów (przymiotniki i rzeczowniki); dodatkowe, nie będące miejscowościami. Wpisy z „slaskie” i „pomorskie” są rozstrzygane najdłuższym dopasowaniem.
const REGION_STEMS = {
  dolnoslaskie: ["dolnoslask"], "kujawsko-pomorskie": [], lubelskie: ["lubelsk", "lubelszczyzn"], lubuskie: ["lubusk"], lodzkie: ["lodzk"], malopolskie: ["malopolsk", "malopolsc"],
  mazowieckie: ["mazowiec", "mazowsz"], opolskie: ["opolsk", "opolszczyzn"], podkarpackie: ["podkarpac", "podkarpaci"], podlaskie: ["podlask", "podlasi"], pomorskie: ["pomorsk"],
  slaskie: ["slask"], swietokrzyskie: ["swietokrzysk"], "warminsko-mazurskie": ["warmi", "warminsk", "mazursk"], wielkopolskie: ["wielkopolsk", "wielkopolsc"], zachodniopomorskie: ["zachodniopomorsk"],
};
// Nazwy złożone z łącznikiem (muszą być rozpoznane przed podziałem na wyrazy, żeby „kujawsko-pomorskie” nie dało „pomorskie”).
const COMPOUND = [
  ["kujawsko-pomorskie", /kujawsko[- ]?pomorsk[a-z]*/g], ["warminsko-mazurskie", /warminsko[- ]?mazursk[a-z]*/g],
  ["zachodniopomorskie", /zachodnio[- ]?pomorsk[a-z]*/g],
];
// Wyrażenia wieloczłonowe regionów (np. „Dolny Śląsk”, „Pomorze Gdańskie”). Rozstrzygane najdłuższym dopasowaniem, więc „Dolny Śląsk” nie da „śląskie”.
const REGION_PHRASES = [
  ["dolnoslaskie", "Dolny Śląsk"], ["slaskie", "Górny Śląsk"], ["opolskie", "Śląsk Opolski"], ["pomorskie", "Pomorze Gdańskie"], ["zachodniopomorskie", "Pomorze Zachodnie"], ["zachodniopomorskie", "Zachodnie Pomorze"],
  ["warminsko-mazurskie", "Warmia i Mazury"], ["swietokrzyskie", "Ziemia Świętokrzyska"], ["lubuskie", "Ziemia Lubuska"], ["slaskie", "Śląsk Cieszyński"], ["podkarpackie", "Ziemia Przemyska"],
];
const REGION_WEAK_FORMS = ["Pomorze"]; // „na Pomorzu” może być pomorskie albo zachodniopomorskie – nie rozstrzyga

// Pełna nazwa pasuje ze wszystkimi końcówkami (łącznie z pustą); rdzeń po odjęciu ostatniej samogłoski – bez pustej (inaczej „Tychy” dałoby słowo „tych”).
const stemsOf = (w) => { const f = fold(w).replace(/[^a-z0-9]/g, ""); const out = [[f, true]]; if (f.length >= 4 && /[aeiouy]$/.test(f)) out.push([f.slice(0, -1), false]); const adj = /^(.*(?:sk|ck|zk))(?:ie|i|a|y)$/.exec(f); if (adj) out.push([adj[1], false]); return out; }; // „Tarnowskie” → rdzeń „tarnowsk” (Tarnowskich Górach)
const withSuf = (stems, sufs) => stems.flatMap(([s, bare]) => (s.length < 3 ? [] : sufs.filter((x) => bare || x !== "").map((x) => s + x)));
const ENTRIES = []; // { seq: [Set,...], region, weak, name }
const FIRST = new Map(); // pierwszy wyraz → [entry]
function addEntry(region, name, weak, extras = []) {
  const words = fold(name).replace(/[^a-z0-9 -]/g, "").split(/[\s-]+/).filter(Boolean);
  if (!words.length) return;
  const origWords = name.split(/[\s-]+/).filter(Boolean);
  const seq = origWords.map((w) => new Set(withSuf(stemsOf(w), words.length === 1 ? TOWNSUF : WORDSUF)));
  if (seq.some((s) => !s.size)) return;
  const ent = { seq, region, weak, name };
  ENTRIES.push(ent);
  for (const f of seq[0]) (FIRST.get(f) || FIRST.set(f, []).get(f)).push(ent);
  if (words.length === 1) return;
  // Wersja zlana (przymiotnik, np. „zielonogorski”) – rdzenie podane po „=”.
}
for (const [region, list] of Object.entries(TOWNS)) {
  for (let raw of list.split(";")) {
    raw = raw.trim(); if (!raw) continue;
    const weak = raw.startsWith("?"); if (weak) raw = raw.slice(1);
    if (raw.startsWith("#")) { raw = raw.slice(1); const f = fold(raw); const seq = [new Set([f, f + "u", f + "em", f + "owi"])]; const ent = { seq, region, weak: false, name: raw }; ENTRIES.push(ent); for (const w of seq[0]) (FIRST.get(w) || FIRST.set(w, []).get(w)).push(ent); continue; } // krótka nazwa kolidująca z czasownikiem (walczą/walczy): tylko formy jednoznaczne
    const [name, ex] = raw.split("="); const extras = ex ? ex.split("/") : [];
    addEntry(region, name, weak);
    for (const x of extras) { // dodatkowy rdzeń (np. „lubel”, „kielec”) jako samodzielny wyraz jednowyrazowy
      if (x.length < 4) continue;
      const seq = [new Set((/(sk|ck|zk)$/.test(x) ? [...ADJ, ""] : TOWNSUF).map((s) => x + s))];
      const ent = { seq, region, weak, name: `${name} (${x})` };
      ENTRIES.push(ent); for (const f of seq[0]) (FIRST.get(f) || FIRST.set(f, []).get(f)).push(ent);
    }
  }
  // Nazwy regionów jako samodzielne wyrazy
  for (const s of REGION_STEMS[region] || []) {
    const seq = [new Set([...ADJ, ...NOUN].filter((x) => x || s.length > 6).map((x) => s + x))];
    const ent = { seq, region, weak: false, name: `region ${s}`, isRegion: true };
    ENTRIES.push(ent); for (const f of seq[0]) (FIRST.get(f) || FIRST.set(f, []).get(f)).push(ent);
  }
}
for (const [region, ph] of REGION_PHRASES) addEntry(region, ph, false);

// Formy, które trafiają do różnych województw (np. wspólna końcówka), uznajemy za dwuznaczne – nie rozstrzygają.
const ambiguousForms = new Set();
{
  const owner = new Map();
  for (const ent of ENTRIES) if (ent.seq.length === 1) for (const f of ent.seq[0]) { const o = owner.get(f); if (o && o !== ent.region) ambiguousForms.add(f); else owner.set(f, ent.region); }
}
// Słowa pospolite, które nie mogą być nazwą miejscowości w tytule (pasują do rdzenia, ale znaczą co innego).
const COMMON = new Set(["swiecie", "konskie", "lasku", "laski", "brzeg", "brzegu", "brzegiem", "zary", "pila", "pile", "pily", "nysa", "nysie", "nysy", "lipsk", "hel", "puck", "police", "wola", "gora", "gory", "goro", "dobre", "praga", "kozy", "wisla", "wisle", "wisly", "wislo", "zalew", "zalewu", "kolo", "kola", "koly", "kolem", "buk", "buka", "turek", "turka", "turku", "wolow", "ryki", "pisz", "pisza", "piszu", "gniew", "gniewu", "gniewem", "marki", "marek", "zielonka", "lewin", "rewal", "mielno", "reda", "reszel", "sztum", "poreba", "sudety", "narew", "jawor", "jaworze", "susz", "dukla", "czarna", "lazy", "dabie", "ujazd", "ursus", "ostrowiec", "tych", "mazur", "mazura", "mazurem", "mazurowi", "lubomierz", "pniewy", "skoki", "witkowo", "zator", "kety"]);

// ---------- Dopasowanie w tekście ----------
function lettersOnly(text) { return fold(text); }
/** Wyszukuje miejsca w tekście. Zwraca { strong: Set(regiony), weak: Set(regiony), hits: [{region, text, weak}] }. */
export function findPlaces(text) {
  const orig = String(text || "");
  const hits = [];
  let work = orig;
  // 1) Łódź: tylko z wielką literą („z łodzi”/„łódź z migrantami” to łódź wodna); na początku zdania słabo.
  work = work.replace(/(^|[^\p{L}])(Łódź|Łodzi|Łodzią|Łodzie|[Łł]ódzk\p{L}*)(?![\p{L}])(\s*[:,–—-])?/gu, (m, pre, word, punct, idx, whole) => {
    const atStart = idx === 0 || /[.!?]\s*$/.test(whole.slice(0, idx)); // początek zdania: „Łódź z migrantami…” to łódź wodna, „Łódź: pożar…” to miasto
    const adj = /^[Łł]ódzk/.test(word);
    hits.push({ region: "lodzkie", text: word, weak: !adj && atStart && !punct });
    return pre + " ".repeat(word.length) + (punct || "");
  });
  let t = fold(work);
  // 2) Nazwy złożone (kujawsko-pomorskie itd.)
  for (const [region, re] of COMPOUND) t = t.replace(re, (m) => { hits.push({ region, text: m, weak: false }); return " ".repeat(m.length); });
  // 3) Wyrazy
  const toks = [...t.matchAll(/[a-z0-9]+/g)].map((m) => ({ w: m[0], i: m.index }));
  const cands = []; // { s, e, region, weak, text, len }
  for (let i = 0; i < toks.length; i++) {
    for (const ent of FIRST.get(toks[i].w) || []) {
      let ok = true;
      for (let k = 0; k < ent.seq.length; k++) if (!toks[i + k] || !ent.seq[k].has(toks[i + k].w)) { ok = false; break; }
      if (!ok) continue;
      const single = ent.seq.length === 1, w = toks[i].w;
      let weak = ent.weak || (single && (COMMON.has(w) || ambiguousForms.has(w)));
      cands.push({ s: i, e: i + ent.seq.length - 1, region: ent.region, weak, text: toks.slice(i, i + ent.seq.length).map((x) => x.w).join(" "), len: ent.seq.length });
    }
  }
  // Najdłuższe dopasowanie wygrywa (np. „Dolny Śląsk” przed „Śląsk”, „Tarnowskie Góry” przed „Tarnów”).
  cands.sort((a, b) => b.len - a.len || a.s - b.s);
  const used = new Set();
  for (const c of cands) {
    let free = true; for (let k = c.s; k <= c.e; k++) if (used.has(k)) free = false;
    if (!free) continue;
    for (let k = c.s; k <= c.e; k++) used.add(k);
    hits.push({ region: c.region, text: c.text, weak: c.weak });
  }
  const strong = new Set(hits.filter((h) => !h.weak).map((h) => h.region)), weak = new Set(hits.filter((h) => h.weak).map((h) => h.region));
  return { strong, weak, hits };
}

/** Województwo z etykiety kategorii („wielkopolskie”, „Mazowsze”, „woj. śląskie”) – cała etykieta albo jej część. */
export function regionFromLabel(label) {
  const r = findPlaces(label);
  return r.strong.size === 1 ? [...r.strong][0] : null;
}
/** Województwo z adresu (segmenty ścieżki, bez ostatniego – to tytuł artykułu). */
export function regionFromUrl(url) {
  const r = findPlaces(urlText(url));
  return r.strong.size === 1 ? [...r.strong][0] : null;
}
export const isWorldPath = (url) => { try { return /(^|\/)(swiat|swiecie|world|zagranica|europa)(\/|$)/.test(fold(new URL(url).pathname)); } catch { return false; } };

/**
 * Ustala województwo wiadomości. Wejście: { title, summary, cats: [..] albo string, url, page: { text, cats } }.
 * Zwraca { region, status: "ok"|"none"|"conflict", layer, hits } – region tylko przy statusie „ok”.
 * Warstwy: kategoria + adres + tytuł (razem) → opis → treść artykułu. Pierwsza warstwa, która coś wskazuje, rozstrzyga;
 * dwa różne województwa w jednej warstwie = konflikt (wstrzymanie).
 */
export function resolvePlace(raw) {
  const cats = Array.isArray(raw.catList) ? raw.catList.join(" ; ") : String(raw.cats || "");
  const layers = [
    ["etykieta+adres+tytuł", [cats, raw.url ? urlText(raw.url) : "", raw.title]],
    ["opis", [raw.summary]],
    ["artykuł", [raw.page?.cats, raw.page?.text]],
  ];
  let weakSeen = false;
  for (const [name, parts] of layers) {
    const strong = new Set(), hits = [];
    for (const p of parts) { if (!p) continue; const r = findPlaces(p); r.strong.forEach((x) => strong.add(x)); hits.push(...r.hits); if (r.weak.size) weakSeen = true; }
    if (strong.size === 1) return { region: [...strong][0], status: "ok", layer: name, hits };
    if (strong.size > 1) return { region: null, status: "conflict", layer: name, hits };
  }
  return { region: null, status: "none", layer: null, hits: [], weakOnly: weakSeen };
}
// Segmenty adresu bez ostatniego (to tytuł artykułu). W adresie „lodz” to miasto (nazwy działów), więc przywracamy wielką literę i ogonki dla Łodzi.
function urlText(url) {
  try { return new URL(url).pathname.split("/").filter(Boolean).slice(0, -1).map((x) => x.replace(/[-_,]+/g, " ")).filter((x) => !/^\d+$/.test(x)).join(" / ").replace(/\blodz(?=$|[^a-z])/g, "Łódź").replace(/\blodzk/g, "łódzk"); } catch { return ""; }
}

// ---------- „Ze świata”: tylko to, co realnie wpływa na Polskę ----------
// Reguła ścisła: (A) temat z wąskiej listy ORAZ (B) wprost wskazany związek z Polską/Ukrainą/Rosją/Białorusią/NATO/UE/Europą.
// Bez (B) – nic: wybuch w Iraku, atak w USA czy plany zamachu na Grenlandii nie trafiają do aplikacji.
const TOPIC = /(^|[^a-z0-9])(?:wojn[a-z]{0,3}|wojsk[a-z]{0,3}|armi[a-z]{0,2}|rakiet[a-z]{0,3}|pocisk[a-z]{0,3}|dron[a-z]{0,3}|ostrzal[a-z]{0,3}|mobilizac[a-z]{0,3}|inwazj[a-z]{0,3}|agresj[a-z]{0,3}|okupac[a-z]{0,3}|sabotaz[a-z]{0,3}|dywersj[a-z]{0,3}|szpieg[a-z]{0,5}|cyberatak[a-z]{0,3}|hakersk[a-z]{0,3}|zamach[a-z]{0,3}|terror[a-z]{0,6}|bron[a-z]{0,3} (?:jadrow|biologiczn|chemiczn|masowego razenia|atomow)|glowic[a-z]{0,3} (?:jadrow|atomow)|(?:uderzeni|atak)[a-z]{0,2} (?:jadrow|chemiczn|biologiczn)|przestrzen[a-z]{0,3} powietrzn|zestrzel[a-z]{0,6}|incydent[a-z]{0,3} (?:graniczn|na granicy)|atak[a-z]{0,3} (?:na|w|z|rakiet|dron|cyber|hakers|terror|bombow)|ataki (?:rakiet|dron|cyber|hakers|terror)|nato\b|art\. ?[45]\b|artykul[a-z]{0,2} [45]\b|balon[a-z]{0,3}.*granic|migrant[a-z]{0,3}.*granic|granic[a-z]{0,3}.*migrant|dostaw[a-z]{0,3} broni)/;
const POLAND = /(^|[^a-z0-9])(?:polsk[a-z]{0,4}|polac[a-z]{0,3}|polakow|tusk[a-z]{0,3}|nawrocki[a-z]{0,3}|kosiniak[a-z-]{0,12}|sikorsk[a-z]{0,3}|abw\b)/; // także nazwiska polskich władz (zamach na premiera Tuska dotyczy Polski)
// Związek z naszym regionem świata: Ukraina, Rosja, Białoruś, NATO, UE, Europa, państwa bałtyckie, Kaliningrad.
const OTHER = /(^|[^a-z0-9])(?:ukrain[a-z]{0,4}|rosj[a-z]{0,3}|rosyjsk[a-z]{0,4}|rosjan[a-z]{0,4}|putin[a-z]{0,3}|kreml[a-z]{0,3}|bialorus[a-z]{0,3}|bialorusk[a-z]{0,4}|lukaszenk[a-z]{0,3}|kaliningrad[a-z]{0,3}|zelensk[a-z]{0,4}|nato\b|ue\b|unii europejsk[a-z]{0,3}|unia europejsk[a-z]{0,3}|europ[a-z]{0,3}|europejsk[a-z]{0,4}|baltyk[a-z]{0,3}|baltyck[a-z]{0,4}|litw[a-z]{0,3}|lotw[a-z]{0,3}|estoni[a-z]{0,3}|wschodni[a-z]{0,3} flank[a-z]{0,3}|flank[a-z]{0,3} wschodni[a-z]{0,3})/;
const NOT_NEWS = /(^|[^a-z0-9])(?:mecz|ligi|liga|pilkar|siatkar|koszykar|mistrzostw|turniej|puchar|trener|bramk|olimpi|tenis|formul[a-z] 1|serial|film|koncert|recenzj|horoskop|przepis|kurs[a-z]{0,2} (?:walut|euro|dolara))/;

/**
 * Wiadomość bez wskazanego województwa z portalu krajowego: „all” (z kraju), „world” (ze świata, wpływ na Polskę) albo null (odrzuć).
 * Reguła ścisła: (A) temat z wąskiej listy (wojna, atak, rakiety, drony, sabotaż, szpiegostwo, terroryzm, broń masowego rażenia, granica…)
 * ORAZ (B) wprost wskazany związek: Polska albo Ukraina/Rosja/Białoruś/NATO/UE/Europa/państwa bałtyckie. Bez (B) – nic.
 * Dotyczy Polski i nie jest z działu „świat” → z kraju; ze świata, ale z powiązaniem → ze świata.
 */
// Wyjątek (ustalony z użytkownikiem): ostrzeżenia służb wywiadowczych państw NATO (MI5, MI6, CIA, BND, DGSE, szef wywiadu) przed bronią masowego rażenia,
// terroryzmem, sabotażem lub cyberatakiem dotyczą całego Zachodu, więc wchodzą do „Ze świata” nawet bez nazwy kraju. FBI/policja nie (to sprawy krajowe USA).
const INTEL = /(^|[^a-z0-9])(?:mi[56]\b|cia\b|bnd\b|dgse\b|szef[a-z]{0,2} wywiad[a-z]{0,2}|wywiad[a-z]{0,2} (?:brytyjsk|niemieck|francusk|amerykansk|nato)[a-z]{0,4}|sluzb[a-z]{0,3} wywiadowcz[a-z]{0,3} (?:wielkiej brytanii|niemiec|francji|usa|nato))/;
const INTEL_TOPIC = /(^|[^a-z0-9])(?:terror[a-z]{0,6}|zamach[a-z]{0,3}|sabotaz[a-z]{0,3}|dywersj[a-z]{0,3}|cyberatak[a-z]{0,3}|atak[a-z]{0,3} hybrydow[a-z]{0,3}|bron[a-z]{0,3} (?:jadrow|biologiczn|chemiczn|atomow|masowego razenia)[a-z]{0,3})/;
export function nationalScope(text, url = "") {
  const t = fold(text);
  if (NOT_NEWS.test(t)) return null;
  if (INTEL.test(t) && INTEL_TOPIC.test(t)) return "world";
  if (!TOPIC.test(t)) return null;
  const poland = POLAND.test(t), other = OTHER.test(t), foreignPath = isWorldPath(url);
  if (!poland && !other) return null;
  if (poland && !foreignPath) return "all";
  return "world";
}
export const worldImpact = (text, url = "") => nationalScope(text, url) === "world";
/** Czy w tekście jest temat z wąskiej listy „bezpieczeństwo/wojna” (bez sprawdzania powiązania z Polską). */
export const topicHit = (text) => { const t = fold(text); return !NOT_NEWS.test(t) && (TOPIC.test(t) || (INTEL.test(t) && INTEL_TOPIC.test(t))); };

/** Zamach / atak / zabójstwo skierowane na najwyższe władze Polski – sprawa ogólnopolska, nawet gdy w tekście pada miasto (np. prokuratura w Warszawie). */
export const topTarget = (text) => /(?:zamach|atak|zabojstw|zabic|zastrzel|planowan[a-z]{0,6} (?:zamach|atak))[a-z]{0,4}[^.;:]{0,25}(?:premier|prezydent|tusk|nawrock|kosiniak|sikorsk|czarzast|marszalk[a-z]{0,3} sejm|szef[a-z]{0,2} mon)/.test(fold(text));
