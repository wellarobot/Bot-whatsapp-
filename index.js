/**
 * TANZANIA DATING Bot — WhatsApp group bot (Baileys) + REST API
 * Deploy: Replit au Render (Node 20+). Start command: npm start
 *
 * Endpoints:
 *   GET  /                 -> { bot, status, connected }
 *   GET  /status           -> { status, connected }
 *   POST /pairing-code     -> body { number } -> { code } au { connected: true }
 *   POST /reset            -> futa session na anza upya
 *   GET/POST /settings     -> soma / badili config
 *   GET  /warns            -> orodha ya maonyo
 *   POST /remove           -> kumuondoa mwanachama { groupId, jid }
 *   DELETE /warns/:jid     -> futa onyo
 */
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import express from "express";
import cors from "cors";
import pino from "pino";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "config.json");
const WARN_PATH = path.join(__dirname, "warns.json");
const AUTH_DIR = path.join(__dirname, "auth");

const readJson = (p, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2));

let config = readJson(CONFIG_PATH, {});
let warns = readJson(WARN_PATH, {});

const LINK_REGEX =
  /(chat\.whatsapp\.com\/|wa\.me\/|whatsapp\.com\/channel\/|t\.me\/|telegram\.me\/|youtube\.com\/|youtu\.be\/|https?:\/\/\S+)/i;

let sock = null;
let connected = false;
let socketReady = false;
let pairingInProgress = false;
let starting = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clearAuth() {
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

async function startBot() {
  if (starting) return starting;
  starting = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    socketReady = false;
    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr || connection === "connecting") socketReady = true;

      if (connection === "open") {
        connected = true;
        pairingInProgress = false;
        console.log("✅ TANZANIA DATING Bot imeunganishwa.");
      }
      if (connection === "close") {
        connected = false;
        socketReady = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log("Connection closed, code:", code);
        sock = null;
        starting = null;
        if (code === DisconnectReason.loggedOut) {
          console.log("⚠️ Logged out — nafuta session na kuanza upya.");
          clearAuth();
        }
        setTimeout(() => startBot().catch(console.error), 2000);
      }
    });

    sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
      if (!config.welcomeOn || action !== "add") return;
      for (const p of participants) {
        const jid = typeof p === "string" ? p : p.id;
        const text = (config.welcomeText || "").replace(/@user/g, `@${jid.split("@")[0]}`);
        await sock.sendMessage(id, { text, mentions: [jid] });
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages?.[0];
      if (!msg?.message || msg.key.fromMe) return;
      const from = msg.key.remoteJid;
      if (!from?.endsWith("@g.us")) return;

      const sender = msg.key.participant || from;
      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        "";

      if (config.antilinkOn && LINK_REGEX.test(body)) {
        try {
          await sock.sendMessage(from, { delete: msg.key });
        } catch {
          /* bot lazima awe admin wa group */
        }
        const entry = warns[sender] || { count: 0, name: msg.pushName || "", reason: "link" };
        entry.count += 1;
        entry.name = msg.pushName || entry.name;
        entry.reason = "link";
        entry.groupId = from;
        warns[sender] = entry;
        writeJson(WARN_PATH, warns);

        const warnText = (config.antilinkText || "")
          .replace(/@user/g, `@${sender.split("@")[0]}`)
          .replace(/\{count\}/g, String(entry.count));
        await sock.sendMessage(from, { text: warnText, mentions: [sender] });

        if (config.autoRemoveOn && entry.count >= (config.warnLimit || 3)) {
          try {
            await sock.groupParticipantsUpdate(from, [sender], "remove");
            delete warns[sender];
            writeJson(WARN_PATH, warns);
          } catch {
            await sock.sendMessage(from, { text: "Siwezi kumuondoa — nifanye admin wa group." });
          }
        }
        return;
      }

      if (config.autoReplyOn) {
        const key = body.trim().toLowerCase();
        const reply = (config.replies || {})[key];
        if (reply) await sock.sendMessage(from, { text: reply }, { quoted: msg });
      }
    });
  })();
  try {
    await starting;
  } catch (e) {
    starting = null;
    throw e;
  }
}

/* ---------------- REST API ---------------- */
const app = express();
app.use(cors());
app.use(express.json());

const statusText = () => (connected ? "connected" : pairingInProgress ? "pairing" : "disconnected");

app.get("/", (_req, res) => res.json({ bot: config.botName, status: statusText(), connected }));
app.get(["/status", "/api/status"], (_req, res) => res.json({ status: statusText(), connected }));

async function handlePair(req, res) {
  const number = String(req.body?.number || req.query.number || "").replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(number))
    return res.status(400).json({ error: "Namba si sahihi. Mfano: 255712345678" });
  if (connected) return res.json({ connected: true, code: "IMEUNGANISHWA" });

  try {
    if (sock) {
      try {
        sock.ev.removeAllListeners("connection.update");
        sock.end(undefined);
      } catch {
        /* ignore */
      }
      sock = null;
      starting = null;
    }
    clearAuth();
    await startBot();

    for (let i = 0; i < 30 && !socketReady; i++) await sleep(500);
    await sleep(1500);

    pairingInProgress = true;
    const raw = await sock.requestPairingCode(number);
    const code = raw?.match(/.{1,4}/g)?.join("-") ?? raw;
    console.log("🔑 Pairing code:", code);
    res.json({ code });
  } catch (e) {
    pairingInProgress = false;
    res.status(500).json({ error: String(e?.message || e) });
  }
}
app.post(["/pairing-code", "/api/pair"], handlePair);
app.get("/api/pair", handlePair);

app.post("/reset", async (_req, res) => {
  try {
    sock?.end(undefined);
  } catch {
    /* ignore */
  }
  sock = null;
  starting = null;
  connected = false;
  clearAuth();
  await startBot().catch(() => {});
  res.json({ ok: true });
});

app.get(["/settings", "/api/settings"], (_req, res) => res.json(config));
app.post(["/settings", "/api/settings"], (req, res) => {
  const body = { ...req.body };
  if (typeof body.welcomeMessage === "boolean") body.welcomeOn = body.welcomeMessage;
  config = { ...config, ...body };
  writeJson(CONFIG_PATH, config);
  res.json({ ok: true, config });
});

app.get(["/warns", "/api/warns"], (_req, res) =>
  res.json(Object.entries(warns).map(([jid, v]) => ({ jid, ...v }))),
);

app.post(["/remove", "/api/remove"], async (req, res) => {
  const { jid } = req.body || {};
  const groupId = req.body?.groupId || warns[jid]?.groupId;
  if (!groupId || !jid) return res.status(400).json({ error: "groupId na jid zinahitajika" });
  try {
    await sock.groupParticipantsUpdate(groupId, [jid], "remove");
    delete warns[jid];
    writeJson(WARN_PATH, warns);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.delete(["/warns/:jid", "/api/warns/:jid"], (req, res) => {
  delete warns[req.params.jid];
  writeJson(WARN_PATH, warns);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 API iko port ${PORT}`));
startBot().catch(console.error);
