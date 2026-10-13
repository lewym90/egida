// Miejscowości i nazwy regionalne do sprawdzania, czy wpis z rozgłośni naprawdę dotyczy jej województwa.
// Dopasowanie: początek wyrazu + do 3 liter końcówki (Rzeszów → „w Rzeszowie”, „rzeszowski”). Dane geograficzne ogólnodostępne (stolice powiatów, największe miasta).
export const PLACES = {
  dolnoslaskie: ["wroclawian", "jeleniej gor", "jeleniej gorze", "legnicy", "lubinie", "glogowie", "swidnicy", "klodzk", "dolnosl", "dolny slask", "dolnym slasku", "wroclaw", "walbrzych", "legnic", "jelenia gor", "lubin", "glogow", "swidnic", "boleslawiec", "zgorzelec", "klodzk", "olawa", "oleśnic", "olesnic", "dzierzoniow", "swiebodzic", "polkowic", "zlotoryj", "kamienn", "luban", "milicz", "trzebnic", "strzelin", "sroda slask", "karkonosz", "sudet"],
  "kujawsko-pomorskie": ["bydgosk", "bydgosc", "torunsk", "wloclawsk", "grudziadzk", "bydgoszczy", "toruniu", "wloclawku", "grudziadzu", "kujawsk", "bydgoszcz", "torun", "wloclawek", "grudziadz", "inowroclaw", "brodnic", "swiecie", "chelmno", "tuchol", "radziejow", "aleksandrow kuj", "rypin", "golub", "mogilno", "sepolno", "naklo nad"],
  lubelskie: ["stalowej", "bialej podlask", "bialej podl", "pulawach", "chelmie", "zamosciu", "lublinie", "lubelsk", "lubelszczyzn", "lublin", "zamosc", "chelm", "biala podlask", "pulaw", "swidnik", "krasnik", "lukow", "leczn", "kraśnik", "kazimierz dolny", "tomaszow lubel", "hrubieszow", "parczew", "radzyn podl", "włodaw", "wlodaw", "opole lubel", "lubartow", "bilgoraj", "janow lubel", "krasnystaw", "roztocz"],
  lubuskie: ["zielonogorsk", "gorzowsk", "zielonej gorze", "gorzowie", "zaganiu", "lubusk", "gorzow", "zielona gor", "zielonej gor", "nowa sol", "zagan", "zary", "swiebodzin", "sulechow", "slubic", "kostrzyn", "miedzyrzecz", "wschow", "strzelce krajen", "krosno odrz", "gubin", "zlocz"],
  lodzkie: ["lodzi", "piotrkowie", "tomaszowie maz", "belchatowie", "lodzk", "lodz", "piotrkow", "pabianic", "tomaszow maz", "belchatow", "zgierz", "skierniewic", "radomsk", "sieradz", "zdunska wol", "kutno", "lask", "lowicz", "wielun", "opoczn", "brzezin", "rawa maz", "pajeczno", "lodzi"],
  malopolskie: ["krakowian", "krakowie", "tarnowie", "nowym saczu", "nowym targu", "zakopanem", "malopols", "krakow", "tarnow", "nowy sacz", "nowego sacz", "oswiecim", "zakopan", "nowy targ", "nowego targ", "chrzanow", "olkusz", "wieliczk", "bochni", "gorlic", "limanow", "myslenic", "wadowic", "skawin", "proszowic", "miechow", "brzesk", "dabrow tarn", "tatr", "podhal", "szczawnic", "sucha beskid", "andrychow"],
  mazowieckie: ["warszawie", "radomiu", "plocku", "siedlcach", "ostrolece", "mazowiec", "mazowsz", "warszaw", "radom", "plock", "siedlc", "ostrolek", "ciechanow", "pruszkow", "legionow", "otwock", "wolomin", "piaseczn", "mlawa", "sochaczew", "zyrardow", "garwolin", "minsk maz", "grodzisk maz", "konstancin", "kozienic", "lipsk", "przasnysz", "pultusk", "wyszkow", "plonsk", "nowy dwor maz", "grojec", "bialobrzeg", "szydlowiec", "gostynin", "sierpc", "makow maz", "lomianki", "wawer", "bemowo", "mokotow"],
  opolskie: ["opolu", "kedzierzynie", "nysie", "opolsk", "opol", "kedzierzyn", "nysa", "nysy", "kluczbork", "prudnik", "namyslow", "krapkowic", "strzelce opol", "gogolin", "glubczyc", "olesno", "bialy kosciol", "ozimek", "zdzieszowic", "gorazd", "slask opol"],
  podkarpackie: ["mielc", "stalowej woli", "stalowej wol", "jasle", "jasel", "debic", "lancucie", "lezajsku", "sanoku", "krosnie", "przemyslu", "tarnobrzegu", "jaroslawiu", "podkarpac", "rzeszow", "przemysl", "krosno", "tarnobrzeg", "stalowa wol", "mielec", "jaroslaw", "sanok", "jaslo", "debic", "lezajsk", "lancut", "ustrzyk", "lesko", "brzozow", "dynow", "ropczyc", "sedziszow", "kolbuszow", "lubaczow", "przeworsk", "strzyzow", "bieszczad", "bircz", "medyk", "korczow", "hruszow", "rzeszowsk"],
  podlaskie: ["bialymstoku", "suwalkach", "lomzy", "podlask", "bialystok", "suwalk", "lomz", "augustow", "bielsk podl", "hajnowk", "sokolk", "grajew", "wysokie maz", "zambrow", "siemiatycz", "monki", "sejn", "kolno", "czarna bialost", "bialowiez", "kuznic", "bobrownik", "polowce", "puszcz"],
  pomorskie: ["gdansku", "gdyni", "slupsku", "tczewie", "pomorsk", "pomorz", "gdansk", "gdyni", "gdynia", "sopot", "slupsk", "tczew", "wejherow", "rumi", "puck", "kartuz", "koscierzyn", "starogard", "malbork", "kwidzyn", "chojnic", "lebork", "bytow", "czluchow", "jastarni", "ustk", "kaszub", "trojmiast", "elbl", "s6 "],
  slaskie: ["rudzie slask", "rudzie sl", "tarnowskich gor", "dabrowie gorn", "bielsku", "czestochow", "zorach", "slask", "katowic", "gliwic", "zabrz", "bytom", "sosnowiec", "bielsko", "czestochow", "rybnik", "tychy", "dabrowa gorn", "chorzow", "ruda slask", "jastrzeb", "jaworzn", "mikolow", "zory", "wodzislaw", "cieszyn", "pszczyn", "zawierci", "myszkow", "lubliniec", "lublinc", "tarnowskie gory", "raciborz", "knurow", "siemianowic", "swietochlowic", "piekary", "zywiec", "zywc", "beskid", "szczyrk", "ustron", "gornoslask", "zaglebi"],
  swietokrzyskie: ["kielcach", "ostrowcu", "starachowicach", "swietokrzys", "kielc", "ostrowiec", "starachowic", "skarzysk", "sandomierz", "busk", "jedrzejow", "pinczow", "staszow", "opatow", "konsk", "ostrowiec", "wloszczow", "kazimierz wielk", "sedziszow malop", "chmielnik", "ilz", "checin", "bodzentyn"],
  "warminsko-mazurskie": ["olsztynie", "elblagu", "ilawie", "gizycku", "ketrzynie", "warminsk", "mazur", "olsztyn", "elblag", "elblaskie", "elblaska", "elk", "gizyck", "ketrzyn", "ostrod", "ilaw", "mragow", "szczytn", "nidzic", "braniew", "lidzbark", "bartoszyc", "gołdap", "goldap", "olecko", "orzysz", "dzialdow", "mikolajk", "biskupiec", "reszel", "frombork", "zalew wislan"],
  wielkopolskie: ["poznanian", "poznaniu", "kaliszu", "koninie", "lesznie", "gnieznie", "wielkopols", "poznan", "kalisz", "konin", "leszn", "gniezn", "ostrow wielk", "krotoszyn", "sroda wielk", "swarzedz", "luboń", "lubon", "kostrzyn wielk", "wrzesni", "sloska", "slupc", "chodziez", "czarnkow", "wagrowiec", "obornik", "nowy tomysl", "szamotul", "rawicz", "gostyn", "koscian", "jarocin", "pleszew", "kepn", "zlotow", "zlotowsk"],
  zachodniopomorskie: ["szczecinie", "koszalinie", "kolobrzegu", "swinoujsciu", "stargardzie", "zachodniopomors", "zachodniopomorz", "szczecin", "koszalin", "stargard", "kolobrzeg", "swinoujsc", "szczecinek", "swidwin", "gryfic", "gryfin", "pyrzyc", "goleniow", "walczu", "walczem", "drawsko", "bialogard", "darlowo", "kamien pomor", "wolin", "dziwnow", "miedzyzdroj", "choszczn", "mysliborz", "barlinek", "sianow", "resko", "dabie szczecin"],
};
// Wyrażenia, które wyglądają jak miejscowość tego województwa, a oznaczają inne miejsce (np. Radomsko leży w łódzkim, nie koło Radomia).
const EXCLUDE = { slaskie: ["dolnego slask","dolnym slask","dolny slask","dolnoslask","slaska opol"], mazowieckie: ["radomsk"], lubelskie: ["chelmno","chelmza","lublinc","lubliniec"], zachodniopomorskie: [] };
const fold = (s) => String(s || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");
const REGEX = Object.fromEntries(Object.entries(PLACES).map(([id, list]) => [id, new RegExp("(^|[^a-z0-9])(?:" + [...new Set(list.map(fold))].map((p) => p.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")[a-z]{0,3}($|[^a-z0-9])")]));

/** Czy tekst (tytuł, kategorie) wskazuje na dane województwo? */
export function mentionsRegion(text, regionId) {
  const r = REGEX[regionId], t = fold(String(text).replace(/łodz/g, "lodka")); // „z łodzi” (mała litera) to łódź wodna, a nie miasto Łódź
  return !!r && r.test(t) && !(EXCLUDE[regionId] || []).some((x) => t.includes(x));
}

// ---------- Zdarzenia o znaczeniu ogólnopolskim ----------
// Wiadomość z rozgłośni regionalnej, która nie wskazuje miejscowości, jest zwykle odrzucana (może być z kraju lub ze świata).
// Wyjątek: poważne zagrożenie bezpieczeństwa w Polsce (zamach, planowany atak, terroryzm), które trzeba pokazać, choć nie znamy miejsca.
const THREAT = /(^|[^a-z0-9])(?:zamach|terroryst|terror|dywersj|sabotaz|zakladnik|ladunk[a-z]{0,3} wybuchow|bomb[a-z]{0,3} w |(?:planowan|przygotowywan|udaremnion|zapobiezon)[a-z]{0,6} (?:zamach|atak)|atak[a-z]{0,2} (?:na|w) (?:premier|prezydent|posl|polityk|szkol|przedszkol|dworc|lotnisk|elektrowni|infrastruktur|centrum handlow)|strzelanin[a-z]{0,2} (?:w|na) (?:szkol|uczeln|centrum))/;
// Zagranica: kraje i miasta spoza Polski. Obywatele sąsiednich państw (Ukrainiec, Rosjanin…) NIE oznaczają zdarzenia za granicą:
// „zatrzymany Ukrainiec planował zamach” dotyczy Polski. Za granicą są dopiero zdarzenia „w Ukrainie”, „w Kijowie” itp.
const FOREIGN_CORE = /(^|[^a-z0-9])(?:dzibuti|manchester|liverpool|birmingham|edynburg|glasgow|dublin|amsterdam|bruksel|rotterdam|monachium|hamburg|frankfurt|drezn|wiedn|prag[aieyą]\b|bratyslaw|budapeszt|sztokholm|kopenhag|helsink|mediolan|rzym|neapol|madryt|barcelon|lizbon|aten|stambul|toronto|izrael|gaz[aey]\b|iran|syri|afganist|jemen|libi|libanu|somali|nigeri|sudan|egipt|turcj|chin|japon|indi[ia]|pakistan|usa\b|stan[a-z]{0,2} zjednoczon|ameryk|amerykansk|atlant|teksas|kaliforni|floryd|georgi|nevad|arizon|ohio|michigan|illinois|massachusetts|pensylwan|las vegas|los angeles|chicago|miami|meksyk|kanad|brazyli|argentyn|australi|hiszpan|wlosz|wloch|grecj|czech|slowacj|litw|lotw|estoni|rumuni|bulgari|wegier|szwecj|norwegi|dani[ia]|finland|holandi|belgi|austri|szwajcar|portugal|irland|szkocj|korei|tajland|filipin|indonezj|wietnam|iraku|arabi|emirat|dubaj|niemc|francj|wielk[a-z]{1,3} brytani|londyn|paryz|berlin|waszyngton|nowy jork|migrant[a-z]{0,3} (?:statk|lodz)|statk)/;
const FOREIGN_NAT = /(^|[^a-z0-9])(?:ukrain|rosj|rosyjsk|bialorus|kijow|moskw)/;
const ABROAD = /(^|[^a-z0-9])(?:w|we|na|pod|przez) (?:ukrain|rosj|bialorus|kijow|moskw|donbas|krym|odess|charkow|lwow)/;
const POLISH = /(^|[^a-z0-9])(?:polsk|polac|polski)/; // „policja” NIE oznacza Polski (policja w Manchesterze)
const DETAINED = /(^|[^a-z0-9])(?:zatrzyman|zatrzymano|aresztowan|abw\b|prokuratur|policj|funkcjonariusz)/;
// Polski kontekst w tytule (dla portali, które mieszają wiadomości z kraju i ze świata).
const POLISH_HINT = /(^|[^a-z0-9])(?:polsk|polac|polic|policj|prokuratur|straz[a-z]{0,2} pozarn|komend|zatrzyman|zatrzymano|aresztowan|abw\b|sad[a-z]{0,2} rejon|starost|gmin|powiat|wojewod)/;

/** Czy tytuł opisuje poważne zagrożenie bezpieczeństwa o znaczeniu ogólnopolskim (bez wskazanej miejscowości)? Zagraniczne zdarzenia odpadają. */
/** Najpoważniejsze zagrożenia (zamach, terroryzm, dywersja, ładunek wybuchowy): mają znaczenie w całym kraju. Ataki w szkołach itp. zostają w swoim województwie. */
export const nationalCore = (text) => /(^|[^a-z0-9])(?:zamach|terroryst|terror|dywersj|sabotaz|ladunk[a-z]{0,3} wybuchow|zakladnik|(?:planowan|przygotowywan|udaremnion)[a-z]{0,6} (?:zamach|atak)|atak[a-z]{0,2} na (?:premier|prezydent|donald|tusk|nawrock|posl|polityk)|zabojstw[a-z]{0,3} (?:premier|prezydent|tusk|polityk))/.test(fold(text));
export function nationalThreat(text) {
  const t = fold(text);
  if (!THREAT.test(t)) return false;
  if (POLISH.test(t)) return true;
  return !FOREIGN_CORE.test(t) && !ABROAD.test(t) && (!FOREIGN_NAT.test(t) || DETAINED.test(t));
}
/** Zdarzenie za granicą (kraje i miasta poza Polską, „w Ukrainie”, „w Kijowie”) – chyba że tytuł wprost wskazuje Polskę. */
export function foreignEvent(text) { const t = fold(text); return !POLISH.test(t) && (FOREIGN_CORE.test(t) || ABROAD.test(t)); }
export const polishHint = (text) => POLISH_HINT.test(fold(text));

// Poważne zdarzenia (zabójstwo, atak nożownika, strzelanina, zamach, katastrofa, ofiary…): pokazujemy je w całym kraju, nawet gdy w tytule nie ma znanej miejscowości.
const STRONG = /(^|[^a-z0-9])(?:nozown|nozem|zadzgan|dzgnal|dzgnie|zasztyleco|zabojstw|zabil|zabit|morderstw|zamordow|strzelani|postrzel|strzelal|katastrof|eksplozj|wybuch[a-z]{0,3}|porwan|uprowadz|zakladnik|zamach|terror|zgin|nie zyje|nie zyja|nie zyl|zwlok|ofiar|ranni|rannych|smiertel|utonal|utonie|tragedi|karambol|dachowa|pobit|pobicie|zgwalc|gwalt)/;
const STRONG_FIRE = /(^|[^a-z0-9])pozar[a-z]{0,3}.*(?:ewakuac|hal[aiey]|zaklad|fabryk|szpital|szkol|domu opieki|blok|kamienic|las[uy]|skladowisk|ranni|ofiar)/;
const STRONG_CRASH = /(^|[^a-z0-9])wypad(?:ek|ku|ki|kiem|kow)[a-z]*.*(?:zgin|nie zyje|ofiar|ranni|rannych|smiertel|autobus|pociag|tir\b|karambol|dzieci|zbiorow|masow|helikopter|samolot|tramwaj|prom\b)|(?:zgin|ofiar|ranni|rannych|smiertel|autobus|pociag|karambol|dzieci|helikopter|samolot|tramwaj).*wypad(?:ek|ku|ki|kiem|kow)/;
export function strongIncident(text) { const t = fold(text); return STRONG.test(t) || STRONG_FIRE.test(t) || STRONG_CRASH.test(t); }
/** Województwa wskazane w tekście (kolejność jak w gazetteerze). */
export function regionsMentioned(text) { return Object.keys(PLACES).filter((id) => mentionsRegion(text, id)); }
