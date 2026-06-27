// Motor da CARol.
//
// Ponto de entrada chamado pelo index.js para cada mensagem recebida. Ele:
//   1. detecta/baixa mídia (áudio/imagem) e registra a mensagem no contexto;
//   2. decide se deve responder (gate: ativo, allowlist, anti-flood, single-flight);
//   3. monta persona + histórico e chama o LLM;
//   4. segura "digitando…" pelo atraso humanizado e envia a resposta (quebrando textão).

const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const cfg = require("./config");
const context = require("./context");
const persona = require("./persona");
const fluxos = require("./fluxos");
const admin = require("./admin");
const historico = require("./historico");
const llm = require("./llm");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Single-flight por chat: enquanto gera uma resposta, novas mensagens só entram no
// contexto (não disparam outra geração paralela).
const gerando = new Set();
const ultimaResposta = new Map();
// Nome (pushName) da pessoa de cada DM, pra CARol chamar pelo nome.
const nomeDM = new Map();
// Takeover: quando o dono fala num chat, marca até quando a CARol fica pausada lá.
const pausaAte = new Map();

// Os fluxos passo a passo (retificação) só entram no system prompt quando o papo é
// sobre pendência/APP/retificação - economiza tokens no resto da conversa (a persona
// já traz o conhecimento-base). Mídia (áudio/imagem) sempre injeta, porque não dá
// pra ler o tema sem chamar o modelo.
const GATILHO_FLUXOS =
  /retific|pend[êe]nc|suspens|pol[íi]gono|georref|beira do rio|reserva legal|\bapp\b|erro no mapa|recibo/i;

const LIMITE_CHUNK = 3500;

function quebrar(texto) {
  const t = (texto || "").trim();
  if (!t) return [];
  const partes = [];
  for (let i = 0; i < t.length; i += LIMITE_CHUNK) partes.push(t.slice(i, i + LIMITE_CHUNK));
  return partes;
}

function chatLiberado(from) {
  if (admin.liberadoExtra(from)) return true; // liberados em runtime (!carol lock)
  return cfg.CHATS_LIBERADOS.size === 0 || cfg.CHATS_LIBERADOS.has(from);
}

// O dono assumiu a conversa neste chat (falou pela conta do bot). Pausa a CARol por
// cfg.PAUSA_DONO_MS e registra a fala do dono como se fosse resposta da CARol, pra o
// contexto seguir coerente quando ela voltar. Cada chamada renova o prazo.
function marcarDonoFalou(from, text) {
  if (!cfg.PAUSA_DONO_MS) return;
  pausaAte.set(from, Date.now() + cfg.PAUSA_DONO_MS);
  const t = String(text || "").trim();
  if (t) {
    context.push(from, { role: "assistant", text: t });
    historico.registrar({ chat: from, role: "dono", tipo: "texto", text: t });
  }
}

function pausadoPeloDono(from) {
  const ate = pausaAte.get(from);
  return !!ate && Date.now() < ate;
}

// Baixa a mídia (áudio/imagem) e devolve no formato dos providers: { mimeType, data }.
async function baixarMedia(sock, msg, mimetype) {
  const buffer = await downloadMediaMessage(
    msg,
    "buffer",
    {},
    { reuploadRequest: sock.updateMediaMessage }
  );
  const mime = String(mimetype || "").split(";")[0].trim() || "application/octet-stream";
  return { mimeType: mime, data: buffer.toString("base64") };
}

// Mantém "digitando…" até completar o atraso humanizado (desde `inicio`), renovando
// a presença a cada poucos segundos pra não sumir.
async function esperarDigitando(sock, from, inicio, totalMs) {
  while (true) {
    const restante = totalMs - (Date.now() - inicio);
    if (restante <= 0) break;
    try {
      await sock.sendPresenceUpdate("composing", from);
    } catch {}
    await sleep(Math.min(restante, 4000));
  }
}

/**
 * Trata uma mensagem recebida. Retorna true se a CARol "assumiu" a mensagem
 * (chat liberado), pra o caller saber que não precisa fazer mais nada com ela.
 */
async function handle({ sock, from, senderId, name, text, msg }) {
  if (!admin.estaAtivo()) return false;
  if (!chatLiberado(from)) return false;

  const ehGrupo = String(from).endsWith("@g.us");
  if (!ehGrupo && name) nomeDM.set(from, name);

  // 1. detecta mídia. Áudio nunca tem texto; imagem pode ter legenda. A mídia vai
  // só na chamada ATUAL ao modelo (no histórico guardamos só um marcador, pra ficar leve).
  const m = (msg && msg.message) || {};
  let mediaAtual = null;
  let textoEntrada = (text || "").trim();
  let tipoEntrada = "texto";
  try {
    if (m.imageMessage) {
      mediaAtual = await baixarMedia(sock, msg, m.imageMessage.mimetype);
      tipoEntrada = "imagem";
      if (!textoEntrada) textoEntrada = "[imagem]";
    } else if (m.audioMessage) {
      mediaAtual = await baixarMedia(sock, msg, m.audioMessage.mimetype);
      tipoEntrada = "audio";
      if (!textoEntrada) textoEntrada = "[áudio]";
    }
  } catch (e) {
    console.error("[CARol] erro baixando mídia:", e?.message || e);
  }

  if (!textoEntrada && !mediaAtual) return true; // nada útil (sticker, etc.)

  context.push(from, { role: "user", name: name || "alguém", text: textoEntrada });
  // Persistência física pra análise futura (não gasta token, é só disco).
  historico.registrar({
    chat: from,
    grupo: ehGrupo,
    role: "user",
    senderId,
    nome: name || null,
    tipo: tipoEntrada,
    text: textoEntrada,
  });

  // Dono assumiu a conversa há pouco? Guarda a fala da pessoa no contexto, mas a
  // CARol fica calada (takeover manual) até o prazo passar.
  if (pausadoPeloDono(from)) return true;

  // 2. gate de geração.
  if (gerando.has(from)) return true;
  if (cfg.INTERVALO_MIN_MS > 0) {
    const dt = Date.now() - (ultimaResposta.get(from) || 0);
    if (dt < cfg.INTERVALO_MIN_MS) return true;
  }

  gerando.add(from);
  const inicio = Date.now();
  try {
    try {
      await sock.sendPresenceUpdate("composing", from);
    } catch {}

    let system = persona.montar({ ehGrupo });
    // Fluxos de referência (guia, não roteiro fixo) só quando o tema pede - olha as
    // últimas falas da pessoa + a atual. Mídia sempre injeta (tema desconhecido).
    const recente = context
      .get(from)
      .filter((h) => h.role === "user")
      .slice(-3)
      .map((h) => h.text)
      .join(" ");
    if (mediaAtual || GATILHO_FLUXOS.test(recente)) {
      system += "\n\n" + fluxos.FLUXOS;
    }
    // Injeta o nome da pessoa no system prompt (só DM). Constante por chat, então
    // não atrapalha o prompt caching daquele chat.
    const nome = nomeDM.get(from);
    if (!ehGrupo && nome) {
      system +=
        `\n\nA pessoa com quem você está conversando se chama ${nome}. ` +
        "Use o nome dela só na saudação do primeiro contato e, se fizer sentido, na " +
        "despedida. No meio da conversa NÃO repita o nome.";
    }
    const history = context.get(from);

    const resposta = await llm.responder({ system, history, mediaAtual });

    if (resposta) {
      await esperarDigitando(sock, from, inicio, cfg.DELAY_RESPOSTA_MS);
      context.push(from, { role: "assistant", text: resposta });
      for (const parte of quebrar(resposta)) {
        await sock.sendMessage(from, { text: parte });
      }
      ultimaResposta.set(from, Date.now());
      historico.registrar({
        chat: from,
        grupo: ehGrupo,
        role: "assistant",
        provider: cfg.PROVIDER,
        tipo: "texto",
        text: resposta,
      });
      console.log(`[CARol] ${from} | ${cfg.PROVIDER} -> ${resposta.slice(0, 60)}`);
    }
  } catch (e) {
    console.error("[CARol] erro:", e?.message || e);
    try {
      await sock.sendMessage(from, { text: "Deu um erro aqui, tenta de novo." });
    } catch {}
  } finally {
    try {
      await sock.sendPresenceUpdate("paused", from);
    } catch {}
    gerando.delete(from);
  }
  return true;
}

module.exports = { handle, chatLiberado, marcarDonoFalou, comando: admin.comando };
