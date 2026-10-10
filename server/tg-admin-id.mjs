// Pokazuje numer Twojego czatu z botem (ADMIN_CHAT_ID), potrzebny do powiadomień o awarii serwera.
// Najpierw napisz do bota (@egida_alerty_bot) w prywatnej rozmowie dowolną wiadomość, np. „cześć”, potem uruchom ten skrypt.
// Skrypt NIE wypisuje tokenu.
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.log("Brak TELEGRAM_BOT_TOKEN w pliku env."); process.exit(1); }
const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(15000) }).then((x) => x.json()).catch((e) => ({ ok: false, description: e.message }));
if (!r.ok) { console.log("Telegram odpowiedział błędem:", r.description); process.exit(1); }
const seen = new Map();
for (const u of r.result || []) { const c = (u.message || u.edited_message)?.chat; if (c?.type === "private") seen.set(c.id, [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || "(bez nazwy)"); }
if (!seen.size) { console.log("Nie widzę żadnej prywatnej rozmowy z botem z ostatnich 24 h. Napisz do bota „cześć” i uruchom ponownie."); process.exit(0); }
for (const [id, name] of seen) console.log(`Czat prywatny: ${name} → ADMIN_CHAT_ID=${id}`);
console.log("\nDopisz właściwą linię do /opt/egida/env (np. nano /opt/egida/env), potem: node watchdog.mjs --test");
