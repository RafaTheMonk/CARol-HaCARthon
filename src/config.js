// Configuração da CARol.
//
// A CARol lê TODA mensagem dos chats liberados e responde via LLM mantendo o
// contexto da conversa (diferente de bots de comando "!"). Para não sair falando
// onde não deve, ela só age nos JIDs de RT_CHATS (allowlist). Vazio = todos.

const liberados = (process.env.RT_CHATS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = {
  // ── Allowlist de chats ─────────────────────────────────────────────────────
  // Enquanto não estiver vazia, SÓ esses chats acionam a CARol.
  // Vazia = responde em qualquer chat (cuidado em produção).
  CHATS_LIBERADOS: new Set(liberados),

  // ── Provider do LLM ────────────────────────────────────────────────────────
  // "gemini" (padrão, barato, áudio+imagem nativos) ou "claude".
  PROVIDER: process.env.RT_PROVIDER || "gemini",
  MODELO_CLAUDE: process.env.RT_MODELO_CLAUDE || "claude-haiku-4-5",
  MODELO_GEMINI: process.env.RT_MODELO_GEMINI || "gemini-2.5-flash-lite",

  // ── Janela de contexto ─────────────────────────────────────────────────────
  // Quantas mensagens recentes reenviar ao modelo por chat. Menor = mais barato.
  MAX_HISTORICO: Number(process.env.RT_MAX_HISTORICO || 5),

  // ── Geração ────────────────────────────────────────────────────────────────
  // Teto de tokens de SAÍDA (output custa ~4x o input; teto baixo força resposta curta).
  MAX_TOKENS: Number(process.env.RT_MAX_TOKENS || 400),

  // ── Atraso humanizado ──────────────────────────────────────────────────────
  // Tempo mínimo (ms) até responder, mostrando "digitando…". A geração já conta;
  // só completa o que faltar. 0 = responde assim que ficar pronto.
  DELAY_RESPOSTA_MS: Number(process.env.RT_DELAY_MS || 10000),

  // ── Anti-flood ─────────────────────────────────────────────────────────────
  // Intervalo mínimo (ms) entre respostas no mesmo chat. 0 = sem limite.
  INTERVALO_MIN_MS: Number(process.env.RT_INTERVALO_MIN_MS || 0),

  // ── Takeover do dono ───────────────────────────────────────────────────────
  // Quando o dono fala num DM liberado (assume a conversa pela conta do bot), a
  // CARol pausa nesse chat por esse tempo. Cada fala do dono renova; passado o
  // tempo sem ele falar, a CARol volta a responder. 0 = desliga o recurso.
  PAUSA_DONO_MS: Number(process.env.RT_PAUSA_DONO_MS || 60000),

  // Liga/desliga global (kill switch em runtime).
  ativo: true,
};
