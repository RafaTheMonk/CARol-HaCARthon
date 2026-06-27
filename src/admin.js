// Estado de administração da CARol em runtime, persistido em data/admin.json
// (sobrevive a restart). Guarda:
//   - ativo: liga/desliga global
//   - liberados: JIDs liberados em runtime (somados aos fixos do config.js)
//
// Os comandos são acionados por quem opera o bot (gating de dono é feito por quem
// chama `comando`, ver index.js). Formato: "!carol <ação> [jid]".

const fs = require("fs");
const path = require("path");
const cfg = require("./config");

const FILE = path.join(__dirname, "..", "data", "admin.json");
const EXP_FILE = path.join(__dirname, "..", "data", "carolexp.md");

let estado = { ativo: cfg.ativo !== false, liberados: [] };
try {
  if (fs.existsSync(FILE)) estado = { ...estado, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
} catch {}

function salvar() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(estado, null, 2));
  } catch {}
}

function estaAtivo() {
  return estado.ativo !== false;
}
function setAtivo(v) {
  estado.ativo = !!v;
  salvar();
}
function liberados() {
  return estado.liberados || [];
}
function liberadoExtra(jid) {
  return (estado.liberados || []).includes(jid);
}
function addChat(jid) {
  estado.liberados = estado.liberados || [];
  if (!estado.liberados.includes(jid)) estado.liberados.push(jid);
  salvar();
}
function removeChat(jid) {
  estado.liberados = (estado.liberados || []).filter((j) => j !== jid);
  salvar();
}

// Interpreta um comando "!carol ...". Devolve a resposta (string) pra enviar, ou
// null se o texto não for um comando da CARol. `chatAtual` é o JID de onde veio,
// usado quando o comando não passa um JID explícito (ex.: "!carol lock" libera o
// próprio chat).
function comando(text, chatAtual) {
  const t = String(text || "").trim();
  if (!/^!carol\b/i.test(t)) return null;

  const args = t.replace(/^!carol\s*/i, "").trim();
  const partes = args.split(/\s+/).filter(Boolean);
  const acao = (partes[0] || "").toLowerCase();
  const alvo = partes[1] || chatAtual;

  switch (acao) {
    case "on":
    case "ligar":
      setAtivo(true);
      return "CARol ligada.";
    case "off":
    case "desligar":
      setAtivo(false);
      return "CARol desligada.";
    case "lock":
    case "add":
      addChat(alvo);
      return `Chat liberado: ${alvo}`;
    case "unlock":
    case "remove":
      removeChat(alvo);
      return `Chat removido: ${alvo}`;
    case "status":
      return (
        `CARol ${estaAtivo() ? "ligada" : "desligada"}.\n` +
        `Liberados em runtime: ${liberados().join(", ") || "(nenhum)"}`
      );
    default:
      return "Comandos: !carol on | off | lock [jid] | unlock [jid] | status";
  }
}

// Resumo do processo/criação da CARol (comando oculto !carolexp). O conteúdo fica
// num arquivo LOCAL (data/carolexp.md, gitignored) - não vai pro repositório.
function resumoExp() {
  try {
    const t = fs.readFileSync(EXP_FILE, "utf8").trim();
    if (t) return t;
  } catch {}
  return "Resumo não configurado neste ambiente (falta data/carolexp.md).";
}

module.exports = {
  estaAtivo,
  setAtivo,
  liberados,
  liberadoExtra,
  addChat,
  removeChat,
  comando,
  resumoExp,
};
