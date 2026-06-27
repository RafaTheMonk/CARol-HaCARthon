// Provider Claude (Anthropic) - resposta em tempo real, em-processo, com streaming.
//
// Chamamos a API HTTP direto pelo SDK: sem cold start de processo, com streaming e
// concorrência real. A "sessão" é o histórico que reenviamos (a API é stateless).
//
// Modelos: claude-haiku-4-5 (barato/rápido) ou claude-opus-4-8 (qualidade).
// Lê IMAGEM (vision); NÃO aceita áudio (use Gemini pra áudio).
// Chave: ANTHROPIC_API_KEY.

const { MODELO_CLAUDE, MAX_TOKENS } = require("../config");

let _client = null;
function client() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("falta ANTHROPIC_API_KEY pro provider claude");
  const Anthropic = require("@anthropic-ai/sdk");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// Histórico interno -> mensagens da API da Claude. Só há user/assistant; num grupo
// as falas de várias pessoas viram "user" com o nome prefixado. A API aceita
// mensagens consecutivas do mesmo papel.
function toClaudeMessages(history) {
  const msgs = history
    .map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: h.role === "user" && h.name ? `${h.name}: ${h.text}` : h.text,
    }))
    .filter((m) => m.content && m.content.trim());

  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

async function responder({ system, history, onDelta, mediaAtual }) {
  const messages = toClaudeMessages(history);
  if (!messages.length) return "";

  // Claude lê IMAGEM; áudio é ignorado aqui.
  if (mediaAtual && mediaAtual.data && /^image\//.test(mediaAtual.mimeType)) {
    const ultimo = messages[messages.length - 1];
    if (ultimo && ultimo.role === "user") {
      ultimo.content = [
        { type: "text", text: typeof ultimo.content === "string" ? ultimo.content : "" },
        {
          type: "image",
          source: { type: "base64", media_type: mediaAtual.mimeType, data: mediaAtual.data },
        },
      ];
    }
  }

  const stream = client().messages.stream({
    model: MODELO_CLAUDE,
    max_tokens: MAX_TOKENS,
    // cache_control no system prompt: o pré-contexto fixo é cacheado e custa ~0.1x
    // nas releituras (importante no modo sempre-ativo, com muitas chamadas).
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  });

  if (onDelta) stream.on("text", (t) => onDelta(t));

  const final = await stream.finalMessage();
  return final.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

module.exports = { responder };
