// Zbiera numery kanałów Telegram i linki zaproszeń do pliku channels.json (nie trzeba nic wpisywać ręcznie).
//   node tg-sync.mjs                         – szuka kanałów i pobiera brakujące linki zaproszeń
//   node tg-sync.mjs --link <id> <https://t.me/+…>   – wpisuje link ręcznie (gdy bot nie ma prawa „Zapraszanie”)
// Kanały muszą mieć nazwę „EGIDA <Województwo>”. Publiczne znajduje po adresie @egida_<id>, prywatne po
// zdarzeniu dodania bota (Telegram trzyma je ok. 24 h) albo po wpisanym już numerze w channels.json.
import { readFile, writeFile } from "node:fs/promises";
const token = process.env.TELEGRAM_BOT_TOKEN;
const FILE = process.env.CHANNELS_FILE || new URL("./channels.json", import.meta.url).pathname;
if (!token) { console.log("Brak TELEGRAM_BOT_TOKEN w pliku env."); process.exit(1); }
const REG = { dolnoslaskie: "Dolnośląskie", "kujawsko-pomorskie": "Kujawsko-pomorskie", lubelskie: "Lubelskie", lubuskie: "Lubuskie", lodzkie: "Łódzkie", malopolskie: "Małopolskie", mazowieckie: "Mazowieckie", opolskie: "Opolskie", podkarpackie: "Podkarpackie", podlaskie: "Podlaskie", pomorskie: "Pomorskie", slaskie: "Śląskie", swietokrzyskie: "Świętokrzyskie", "warminsko-mazurskie": "Warmińsko-mazurskie", wielkopolskie: "Wielkopolskie", zachodniopomorskie: "Zachodniopomorskie" };
const norm = (x) => String(x).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/[^a-z]/g, "");
const byTitle = Object.fromEntries(Object.entries(REG).map(([id, n]) => [norm("EGIDA " + n), id]));
const api = async (m, b) => (await fetch(`https://api.telegram.org/bot${token}/${m}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}), signal: AbortSignal.timeout(15000) })).json();
let data = {}; try { data = JSON.parse(await readFile(FILE, "utf8")); } catch { /* nowy plik */ }
const save = () => writeFile(FILE, JSON.stringify(data, null, 1));

const li = process.argv.indexOf("--link");
if (li > 0) {
  const [id, url] = [process.argv[li + 1], process.argv[li + 2]];
  if (!REG[id] || !/^https:\/\/t\.me\/(\+|joinchat\/)[\w-]+$/.test(url || "")) { console.log("Użycie: --link <id_województwa> https://t.me/+…  (id np. opolskie, kujawsko-pomorskie)"); process.exit(1); }
  data[id] = { ...(data[id] || {}), link: url }; await save(); console.log(`Zapisano link dla: ${REG[id]}`); process.exit(0);
}
// 1) publiczne – po adresie @egida_<id>
for (const id of Object.keys(REG)) {
  if (data[id]?.chat) continue;
  const c = await api("getChat", { chat_id: "@egida_" + id.replace(/-/g, "_") });
  if (c.ok && c.result.type === "channel") data[id] = { ...(data[id] || {}), chat: c.result.id, title: c.result.title };
}
// 2) prywatne – ze zdarzeń dodania bota
const up = await api("getUpdates", { allowed_updates: ["my_chat_member", "channel_post"], limit: 100 });
if (up.ok) for (const u of up.result) {
  const c = (u.my_chat_member || u.channel_post)?.chat;
  const id = c && c.type === "channel" ? byTitle[norm(c.title)] : null;
  if (id && !data[id]?.chat) data[id] = { ...(data[id] || {}), chat: c.id, title: c.title };
}
// 3) linki zaproszeń (bot musi mieć prawo „Zapraszanie użytkowników”)
const problems = {};
for (const [id, v] of Object.entries(data)) {
  if (!v.chat || v.link) continue;
  const r = await api("exportChatInviteLink", { chat_id: v.chat });
  if (r.ok) v.link = r.result; else problems[id] = r.description;
}
await save();
console.log("Województwo                 numer kanału        link zaproszenia");
for (const [id, n] of Object.entries(REG)) {
  const v = data[id] || {};
  const st = !v.chat ? "BRAK KANAŁU (nie znaleziono)" : v.link ? "OK" : "brak linku (" + (problems[id] || "?") + ")";
  console.log(`${n.padEnd(27)} ${String(v.chat ?? "-").padEnd(19)} ${st}`);
}
