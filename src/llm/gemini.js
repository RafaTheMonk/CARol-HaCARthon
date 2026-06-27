// Provider Gemini (Google) - resposta em tempo real, em-processo, com streaming.
//
// É o provider padrão: barato (gemini-2.5-flash-lite) e multimodal - transcreve
// áudio e lê imagem na mesma chamada, sem serviço extra. A API é stateless: o
// "contexto" é o array `contents` que reenviamos.
//
// Chave: GEMINI_API_KEY (do ambiente ou do .env).

const { MODELO_GEMINI } = require("../config");

let _client = null;
function client() {
  if (_client) return _client;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("falta GEMINI_API_KEY pro provider gemini");
  const { GoogleGenAI } = require("@google/genai");
  _client = new GoogleGenAI({ apiKey: key });
  return _client;
}

// Histórico interno -> formato `contents` do Gemini.
// Papéis do Gemini: "user" e "model" (assistant vira "model"). Falas de pessoas
// num grupo vão como "user" com o nome prefixado no texto.
function toGeminiContents(history) {
  const contents = history
    .map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [
        { text: h.role === "user" && h.name ? `${h.name}: ${h.text}` : h.text },
      ],
    }))
    .filter((c) => c.parts[0].text && c.parts[0].text.trim());

  while (contents.length && contents[0].role !== "user") contents.shift();
  return contents;
}

async function responder({ system, history, onDelta, mediaAtual }) {
  const contents = toGeminiContents(history);
  if (!contents.length) return "";

  // Anexa a mídia (áudio/imagem) à ÚLTIMA mensagem do usuário - a atual.
  if (mediaAtual && mediaAtual.data) {
    const ultimo = contents[contents.length - 1];
    if (ultimo && ultimo.role === "user") {
      ultimo.parts.push({
        inlineData: { mimeType: mediaAtual.mimeType, data: mediaAtual.data },
      });
    }
  }

  const stream = await client().models.generateContentStream({
    model: MODELO_GEMINI,
    config: { systemInstruction: system },
    contents,
  });

  let full = "";
  for await (const chunk of stream) {
    let t = chunk?.text;
    if (typeof t === "function") t = t();
    if (t) {
      full += t;
      if (onDelta) onDelta(t);
    }
  }
  return full.trim();
}

// Transcreve um áudio (só o texto falado). Chamada enxuta, sem persona nem
// histórico, pra sair barata. Usada pra salvar a fala no histórico e alimentar o
// contexto como texto (em vez de reenviar o áudio na chamada principal).
async function transcrever({ media }) {
  if (!media || !media.data) return "";
  const resp = await client().models.generateContent({
    model: MODELO_GEMINI,
    contents: [
      {
        role: "user",
        parts: [
          { text: "Transcreva o áudio abaixo. Responda só com o que foi falado, em texto, sem comentar nem traduzir." },
          { inlineData: { mimeType: media.mimeType, data: media.data } },
        ],
      },
    ],
  });
  let t = resp?.text;
  if (typeof t === "function") t = t();
  return String(t || "").trim();
}

module.exports = { responder, transcrever };

