// Buffer de contexto rolante por chat.
//
// As APIs de LLM (Claude e Gemini) são STATELESS: não existe "sessão" guardada no
// servidor delas. Quem mantém a memória da conversa somos nós - guardamos as últimas
// N mensagens por chat e reenviamos a cada chamada, junto do system prompt (persona).
//
// Formato de cada item: { role: "user" | "assistant", name?: string, text: string }
//   - role "user"      = mensagem de uma pessoa do chat (name = quem falou)
//   - role "assistant" = resposta que a CARol deu
//
// Persistência opcional em data/context.json (debounced), pra sobreviver a restart.

const fs = require("fs");
const path = require("path");
const { MAX_HISTORICO } = require("./config");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "context.json");

/** @type {Map<string, Array<{role:string,name?:string,text:string,ts:number}>>} */
const buffers = new Map();

function carregar() {
  try {
    if (fs.existsSync(FILE)) {
      const obj = JSON.parse(fs.readFileSync(FILE, "utf8"));
      for (const [chat, arr] of Object.entries(obj)) buffers.set(chat, arr);
    }
  } catch {}
}
carregar();

let saveTimer = null;
function salvarDebounced() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(buffers.entries())));
    } catch {}
  }, 1500);
}

function get(chatId) {
  return buffers.get(chatId) || [];
}

function push(chatId, item) {
  const arr = buffers.get(chatId) || [];
  arr.push({ ...item, ts: Date.now() });
  if (arr.length > MAX_HISTORICO) arr.splice(0, arr.length - MAX_HISTORICO);
  buffers.set(chatId, arr);
  salvarDebounced();
}

function limpar(chatId) {
  buffers.delete(chatId);
  salvarDebounced();
}

module.exports = { get, push, limpar };
