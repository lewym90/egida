// Sprawdza bota i kanał(y) Telegram. Użycie:
//   node tg-test.mjs                 – tylko sprawdza bota
//   node tg-test.mjs @kanal          – sprawdza, czy bot jest administratorem kanału
//   node tg-test.mjs @kanal --send   – dodatkowo wysyła wiadomość testową
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.log("Brak TELEGRAM_BOT_TOKEN w pliku env."); process.exit(1); }
const api = async (m, body) => (await fetch(`https://api.telegram.org/bot${token}/${m}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000) })).json();
const me = await api("getMe");
if (!me.ok) { console.log("Token odrzucony przez Telegram:", me.description); process.exit(1); }
console.log(`Bot: @${me.result.username} – token działa.`);
let targets = process.argv.slice(2).filter((a) => a.startsWith("@") || /^-?\d{5,}$/.test(a));
if (process.argv.includes("--all")) {   // wszystkie kanały z channels.json
  const { readFile } = await import("node:fs/promises");
  try { targets = Object.values(JSON.parse(await readFile(process.env.CHANNELS_FILE || new URL("./channels.json", import.meta.url).pathname, "utf8"))).map((v) => String(v.chat)).filter((x) => /^-?\d{5,}$/.test(x)); } catch { console.log("Brak pliku channels.json – najpierw uruchom tg-sync.mjs"); }
}
for (const ch of targets) {
  const chat = await api("getChat", { chat_id: ch });
  if (!chat.ok) { console.log(`${ch}: NIE ZNALEZIONO (${chat.description}). Sprawdź nazwę i czy kanał jest publiczny.`); continue; }
  const m = await api("getChatMember", { chat_id: ch, user_id: me.result.id });
  const st = m.ok ? m.result.status : "brak";
  const can = m.ok && (m.result.can_post_messages ?? st === "creator");
  console.log(`${ch}: „${chat.result.title}”, bot = ${st}, może pisać = ${can ? "TAK" : "NIE"}`);
  if (process.argv.includes("--send") && can) {
    const s = await api("sendMessage", { chat_id: ch, text: "EGIDA – wiadomość testowa. Kanał będzie publikował komunikaty RSO dla tego województwa." });
    console.log(s.ok ? "  wysłano wiadomość testową" : `  błąd wysyłki: ${s.description}`);
  }
}
