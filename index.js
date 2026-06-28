// CARol - conexão WhatsApp (Baileys) + roteamento das mensagens pro motor.
//
// Sobe um socket próprio, mostra o QR code pra parear, reconecta sozinho e entrega
// cada mensagem ao motor (src/engine.js), que responde via LLM mantendo o contexto.

require("./src/env").carregar();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const engine = require("./src/engine");

let reconnecting = false;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    getMessage: async () => ({ conversation: "" }),
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("Escaneie o QR code abaixo com o WhatsApp:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      console.log("CARol conectada!");
      reconnecting = false;
    }
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log("Conexao fechada. statusCode:", statusCode);
      const naoReconectar =
        statusCode === DisconnectReason.loggedOut ||
        statusCode === DisconnectReason.connectionReplaced;
      if (naoReconectar) {
        console.log("Sessao encerrada (logout/conflito). Nao reconectando.");
        return;
      }
      if (reconnecting) return;
      reconnecting = true;
      console.log("Reconectando em 3s...");
      setTimeout(() => start(), 3000);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message || msg.message.protocolMessage) return;

    const from = msg.key.remoteJid;
    const senderId = msg.key.participant || from;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      "";

    // Comando admin (!carol ...): só o dono. fromMe = a própria conta do bot mandou
    // (sinal forte de dono); ou um OWNER_JID definido no .env. Antes do gate de
    // allowlist, pra ligar/desligar e liberar chats de qualquer lugar.
    const ownerJid = process.env.OWNER_JID;
    const ehDono =
      msg.key.fromMe || (ownerJid && (senderId === ownerJid || from === ownerJid));
    if (/^!carol/i.test(text) && ehDono) {
      // !carolexp: comando oculto que manda o resumo do processo da CARol.
      if (/^!carolexp\b/i.test(text)) {
        const resumo = engine.resumoExp();
        for (let i = 0; i < resumo.length; i += 3500) {
          await sock.sendMessage(from, { text: resumo.slice(i, i + 3500) });
        }
        return;
      }
      const resp = engine.comando(text, from);
      if (resp) {
        await sock.sendMessage(from, { text: resp });
        return;
      }
    }

    // fromMe = a conta do bot (o dono) falou. Nunca processa como mensagem de
    // usuário (anti-loop). Mas se for num DM liberado, o dono está assumindo a
    // conversa: pausa a CARol nesse chat (takeover manual).
    if (msg.key.fromMe) {
      if (engine.chatLiberado(from) && !String(from).endsWith("@g.us")) {
        engine.marcarDonoFalou(from, text);
      }
      return;
    }

    await engine.handle({
      sock,
      from,
      senderId,
      name: msg.pushName,
      text,
      msg,
    });
  });
}

process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err?.message || err);
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err?.message || err);
});

start();
