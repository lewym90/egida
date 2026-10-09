// Wysyła krótką wiadomość administratorowi (Tobie) na Telegram. Użycie: node notify.mjs "tekst"
// Wymaga TELEGRAM_BOT_TOKEN i ADMIN_CHAT_ID w pliku env. Bez nich po prostu nic nie robi.
const { TELEGRAM_BOT_TOKEN: t, ADMIN_CHAT_ID: c } = process.env;
if (!t || !c) process.exit(0);
const r = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: c, text: process.argv[2] || "EGIDA: powiadomienie", disable_web_page_preview: true }),
  signal: AbortSignal.timeout(15000),
}).catch((e) => ({ ok: false, status: String(e.message) }));
if (!r.ok) console.error("notify: błąd", r.status);
