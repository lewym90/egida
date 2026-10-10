// Kontrola treści przed publikacją (CI).
// Zasady z projektu: każda instrukcja ma źródło i datę przeglądu; przegląd starszy niż 12 miesięcy blokuje publikację.
// Tryb --strict: błąd (exit 1), gdy cokolwiek nie ma daty przeglądu. Bez --strict: tylko ostrzeżenia.
import { FIRST_AID, WHAT_TO_DO, PLECAK, EMERGENCY, PRIVACY } from "../js/content.js";

const strict = process.argv.includes("--strict");
const sets = { "Pierwsza pomoc": FIRST_AID, "Co robić": WHAT_TO_DO, "Plecak i zapasy": PLECAK, "Tryb zagrożenia": EMERGENCY, "Polityka prywatności": { source: "własne opracowanie", reviewed: PRIVACY.reviewed } };
const problems = [];
for (const [name, m] of Object.entries(sets)) {
  if (!m.source) problems.push(`${name}: brak źródła`);
  if (!m.reviewed) problems.push(`${name}: brak daty przeglądu (treść niezatwierdzona)`);
  else {
    const age = (Date.now() - new Date(m.reviewed).getTime()) / 864e5;
    if (isNaN(age)) problems.push(`${name}: niepoprawna data przeglądu`);
    else if (age > 365) problems.push(`${name}: przegląd starszy niż 12 miesięcy`);
  }
}
if (problems.length) {
  console.log((strict ? "BŁĄD" : "OSTRZEŻENIE") + " – treści wymagające uwagi:\n - " + problems.join("\n - "));
  if (strict) process.exit(1);
} else console.log("OK: wszystkie treści mają źródło i aktualny przegląd");
