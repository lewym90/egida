// Miejscowości i nazwy regionalne do sprawdzania, czy wpis z rozgłośni naprawdę dotyczy jej województwa.
// Dopasowanie: początek wyrazu + do 3 liter końcówki (Rzeszów → „w Rzeszowie”, „rzeszowski”). Dane geograficzne ogólnodostępne (stolice powiatów, największe miasta).
export const PLACES = {
  dolnoslaskie: ["jeleniej gor", "jeleniej gorze", "legnicy", "lubinie", "glogowie", "swidnicy", "klodzk", "dolnosl", "dolny slask", "dolnym slasku", "wroclaw", "walbrzych", "legnic", "jelenia gor", "lubin", "glogow", "swidnic", "boleslawiec", "zgorzelec", "klodzk", "olawa", "oleśnic", "olesnic", "dzierzoniow", "swiebodzic", "polkowic", "zlotoryj", "kamienn", "luban", "milicz", "trzebnic", "strzelin", "sroda slask", "karkonosz", "sudet"],
  "kujawsko-pomorskie": ["bydgoszczy", "toruniu", "wloclawku", "grudziadzu", "kujawsk", "bydgoszcz", "torun", "wloclawek", "grudziadz", "inowroclaw", "brodnic", "swiecie", "chelmno", "tuchol", "radziejow", "aleksandrow kuj", "rypin", "golub", "mogilno", "sepolno", "naklo nad"],
  lubelskie: ["stalowej", "bialej podlask", "bialej podl", "pulawach", "chelmie", "zamosciu", "lublinie", "lubelsk", "lubelszczyzn", "lublin", "zamosc", "chelm", "biala podlask", "pulaw", "swidnik", "krasnik", "lukow", "leczn", "kraśnik", "kazimierz dolny", "tomaszow lubel", "hrubieszow", "parczew", "radzyn podl", "włodaw", "wlodaw", "opole lubel", "lubartow", "bilgoraj", "janow lubel", "krasnystaw", "roztocz"],
  lubuskie: ["zielonej gorze", "gorzowie", "zaganiu", "lubusk", "gorzow", "zielona gor", "zielonej gor", "nowa sol", "zagan", "zary", "swiebodzin", "sulechow", "slubic", "kostrzyn", "miedzyrzecz", "wschow", "strzelce krajen", "krosno odrz", "gubin", "zlocz"],
  lodzkie: ["lodzi", "piotrkowie", "tomaszowie maz", "belchatowie", "lodzk", "lodz", "piotrkow", "pabianic", "tomaszow maz", "belchatow", "zgierz", "skierniewic", "radomsk", "sieradz", "zdunska wol", "kutno", "lask", "lowicz", "wielun", "opoczn", "brzezin", "rawa maz", "pajeczno", "lodzi"],
  malopolskie: ["krakowie", "tarnowie", "nowym saczu", "nowym targu", "zakopanem", "malopols", "krakow", "tarnow", "nowy sacz", "nowego sacz", "oswiecim", "zakopan", "nowy targ", "nowego targ", "chrzanow", "olkusz", "wieliczk", "bochni", "gorlic", "limanow", "myslenic", "wadowic", "skawin", "proszowic", "miechow", "brzesk", "dabrow tarn", "tatr", "podhal", "szczawnic", "sucha beskid", "andrychow"],
  mazowieckie: ["warszawie", "radomiu", "plocku", "siedlcach", "ostrolece", "mazowiec", "mazowsz", "warszaw", "radom", "plock", "siedlc", "ostrolek", "ciechanow", "pruszkow", "legionow", "otwock", "wolomin", "piaseczn", "mlawa", "sochaczew", "zyrardow", "garwolin", "minsk maz", "grodzisk maz", "konstancin", "kozienic", "lipsk", "przasnysz", "pultusk", "wyszkow", "plonsk", "nowy dwor maz", "grojec", "bialobrzeg", "szydlowiec", "gostynin", "sierpc", "makow maz", "lomianki", "wawer", "bemowo", "mokotow"],
  opolskie: ["opolu", "kedzierzynie", "nysie", "opolsk", "opol", "kedzierzyn", "nysa", "nysy", "kluczbork", "prudnik", "namyslow", "krapkowic", "strzelce opol", "gogolin", "glubczyc", "olesno", "bialy kosciol", "ozimek", "zdzieszowic", "gorazd", "slask opol"],
  podkarpackie: ["mielc", "stalowej woli", "stalowej wol", "jasle", "jasel", "debic", "lancucie", "lezajsku", "sanoku", "krosnie", "przemyslu", "tarnobrzegu", "jaroslawiu", "podkarpac", "rzeszow", "przemysl", "krosno", "tarnobrzeg", "stalowa wol", "mielec", "jaroslaw", "sanok", "jaslo", "debic", "lezajsk", "lancut", "ustrzyk", "lesko", "brzozow", "dynow", "ropczyc", "sedziszow", "kolbuszow", "lubaczow", "przeworsk", "strzyzow", "bieszczad", "bircz", "medyk", "korczow", "hruszow", "rzeszowsk"],
  podlaskie: ["bialymstoku", "suwalkach", "lomzy", "podlask", "bialystok", "suwalk", "lomz", "augustow", "bielsk podl", "hajnowk", "sokolk", "grajew", "wysokie maz", "zambrow", "siemiatycz", "monki", "sejn", "kolno", "czarna bialost", "bialowiez", "kuznic", "bobrownik", "polowce", "puszcz"],
  pomorskie: ["gdansku", "gdyni", "slupsku", "tczewie", "pomorsk", "pomorz", "gdansk", "gdyni", "gdynia", "sopot", "slupsk", "tczew", "wejherow", "rumi", "puck", "kartuz", "koscierzyn", "starogard", "malbork", "kwidzyn", "chojnic", "lebork", "bytow", "czluchow", "jastarni", "ustk", "kaszub", "trojmiast", "elbl", "s6 "],
  slaskie: ["rudzie slask", "rudzie sl", "tarnowskich gor", "dabrowie gorn", "bielsku", "czestochow", "zorach", "slask", "katowic", "gliwic", "zabrz", "bytom", "sosnowiec", "bielsko", "czestochow", "rybnik", "tychy", "dabrowa gorn", "chorzow", "ruda slask", "jastrzeb", "jaworzn", "mikolow", "zory", "wodzislaw", "cieszyn", "pszczyn", "zawierci", "myszkow", "lubliniec", "tarnowskie gory", "raciborz", "knurow", "siemianowic", "swietochlowic", "piekary", "zywiec", "zywc", "beskid", "szczyrk", "ustron", "gornoslask", "zaglebi"],
  swietokrzyskie: ["kielcach", "ostrowcu", "starachowicach", "swietokrzys", "kielc", "ostrowiec", "starachowic", "skarzysk", "sandomierz", "busk", "jedrzejow", "pinczow", "staszow", "opatow", "konsk", "ostrowiec", "wloszczow", "kazimierz wielk", "sedziszow malop", "chmielnik", "ilz", "checin", "bodzentyn"],
  "warminsko-mazurskie": ["olsztynie", "elblagu", "ilawie", "gizycku", "ketrzynie", "warminsk", "mazur", "olsztyn", "elblag", "elblaskie", "elblaska", "elk", "gizyck", "ketrzyn", "ostrod", "ilaw", "mragow", "szczytn", "nidzic", "braniew", "lidzbark", "bartoszyc", "gołdap", "goldap", "olecko", "orzysz", "dzialdow", "mikolajk", "biskupiec", "reszel", "frombork", "zalew wislan"],
  wielkopolskie: ["poznaniu", "kaliszu", "koninie", "lesznie", "gnieznie", "wielkopols", "poznan", "kalisz", "konin", "leszn", "gniezn", "ostrow wielk", "krotoszyn", "sroda wielk", "swarzedz", "luboń", "lubon", "kostrzyn wielk", "wrzesni", "sloska", "slupc", "chodziez", "czarnkow", "wagrowiec", "obornik", "nowy tomysl", "szamotul", "rawicz", "gostyn", "koscian", "jarocin", "pleszew", "kepn", "zlotow", "zlotowsk"],
  zachodniopomorskie: ["szczecinie", "koszalinie", "kolobrzegu", "swinoujsciu", "stargardzie", "zachodniopomors", "zachodniopomorz", "szczecin", "koszalin", "stargard", "kolobrzeg", "swinoujsc", "szczecinek", "swidwin", "gryfic", "gryfin", "pyrzyc", "goleniow", "walczu", "walczem", "drawsko", "bialogard", "darlowo", "kamien pomor", "wolin", "dziwnow", "miedzyzdroj", "choszczn", "mysliborz", "barlinek", "sianow", "resko", "dabie szczecin"],
};
// Wyrażenia, które wyglądają jak miejscowość tego województwa, a oznaczają inne miejsce (np. Radomsko leży w łódzkim, nie koło Radomia).
const EXCLUDE = { mazowieckie: ["radomsk"], lubelskie: ["chelmno","chelmza"], zachodniopomorskie: [] };
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
const FOREIGN = /(^|[^a-z0-9])(?:dzibuti|izrael|gaz[aey]\b|iran|syri|afganist|jemen|libi|libanu|somali|nigeri|sudan|egipt|turcj|chin|japon|indi[ia]|pakistan|usa\b|stan[a-z]{0,2} zjednoczon|niemc|francj|wielk[a-z]{1,3} brytani|londyn|paryz|berlin|waszyngton|nowy jork|moskw|kijow|ukrain|rosj|bialorus|migrant[a-z]{0,3} (?:statk|lodz)|statk)/;
const POLISH = /(^|[^a-z0-9])(?:polsk|polac|polic|polski)/;

/** Czy tytuł opisuje poważne zagrożenie bezpieczeństwa o znaczeniu ogólnopolskim (bez wskazanej miejscowości)? Zagraniczne zdarzenia odpadają. */
export function nationalThreat(text) {
  const t = fold(text);
  if (!THREAT.test(t)) return false;
  return !FOREIGN.test(t) || POLISH.test(t);
}
/** Województwa wskazane w tekście (kolejność jak w gazetteerze). */
export function regionsMentioned(text) { return Object.keys(PLACES).filter((id) => mentionsRegion(text, id)); }
