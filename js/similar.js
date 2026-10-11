// Wykrywanie tej samej wiadomości podanej różnymi słowami (np. dwa komunikaty o tym samym ćwiczeniu, ta sama sprawa w policji i w radiu).
// Czysta funkcja bez sieci; używana w aplikacji (komunikaty, wiadomości) i na serwerze (news-lib.mjs).
const STOP = new Set(["oraz", "ktory", "ktora", "ktore", "przez", "podczas", "tylko", "jest", "dla", "jako", "przy", "bedzie", "beda", "tego", "tych", "tez", "lub", "albo", "aby", "wiec", "gdy", "ktorych", "swoje", "swoich"]);
const fold = (s) => String(s || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Zbiór „rdzeni” znaczących słów (pierwsze 5 liter, żeby odmiana nie szkodziła) i liczb. */
export function storyTokens(text) {
  const out = new Set();
  for (const w of fold(text).split(/[^a-z0-9]+/)) {
    if (!w || STOP.has(w)) continue;
    if (/^\d+$/.test(w)) { out.add(w); continue; }
    if (w.length >= 4) out.add(w.slice(0, 5));
  }
  return out;
}
/** Udział wspólnych rdzeni w mniejszym z dwóch zbiorów (0..1) i rozmiar mniejszego zbioru. */
export function overlap(a, b) {
  const A = a instanceof Set ? a : storyTokens(a), B = b instanceof Set ? b : storyTokens(b);
  const min = Math.min(A.size, B.size); if (!min) return { share: 0, min: 0 };
  let c = 0; for (const t of A) if (B.has(t)) c++;
  return { share: c / min, min };
}
/** Czy to ta sama sprawa? opts.share – wymagany udział wspólnych rdzeni, opts.minTokens – minimalna długość krótszego tekstu. */
// Poważne zagrożenia (zamach, terroryzm…) opisują media różnymi zdaniami; wspólne słowo-klucz zagrożenia i kilka wspólnych rdzeni wystarczy.
const THREAT_STEMS = ["zamac", "teror", "dywer", "sabot", "zakla", "ladun"];
export function sameStory(a, b, opts = {}) {
  const { share = 0.75, minTokens = 4 } = opts, A = a instanceof Set ? a : storyTokens(a), B = b instanceof Set ? b : storyTokens(b), o = overlap(A, B);
  if (o.min >= minTokens && o.share >= share) return true;
  const sharedCount = Math.round(o.share * o.min);
  return o.min >= minTokens && o.share >= 0.35 && sharedCount >= 3 && THREAT_STEMS.some((t) => A.has(t) && B.has(t));
}
/** Zostawia pierwszy z każdej grupy podobnych (kolejność = pierwszeństwo wywołującego). */
export function dedupeSimilar(list, text, opts = {}) {
  const kept = [];
  for (const x of list) {
    const tk = storyTokens(text(x));
    if (!kept.some((k) => sameStory(k.tk, tk, opts))) kept.push({ x, tk });
  }
  return kept.map((k) => k.x);
}
