// Persistência física do histórico de conversas da CARol (arquivos, não banco).
//
// UM ARQUIVO POR JID/CHAT: data/historico/<jid>.jsonl. Assim cada DM (ou grupo)
// tem o seu próprio arquivo, fácil de isolar pra análise de uma pessoa só. Cada
// linha é um objeto JSON (append-only, O(1), não gasta token - só disco).
//
// Guarda toda interação (mensagem da pessoa, resposta da CARol, intervenção do
// dono), com metadados pra análise futura do comportamento do público alvo:
// quando, qual chat, quem, tipo (texto/áudio/imagem), conteúdo, provider.
//
// Os arquivos ficam LOCAIS na VPS e são gitignored (não vão pro GitHub).

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "data", "historico");

// Nome de arquivo seguro a partir do JID ("274607458255048@lid" -> "274607458255048_lid").
function arquivoDe(chat) {
  const safe = String(chat || "sem-chat").replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(DIR, safe + ".jsonl");
}

function registrar(reg) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const linha = JSON.stringify({ ts: new Date().toISOString(), ...reg });
    fs.appendFileSync(arquivoDe(reg.chat), linha + "\n");
  } catch (e) {
    // Persistência nunca pode derrubar o atendimento; só loga e segue.
    console.error("[historico] falha ao gravar:", e?.message || e);
  }
}

module.exports = { registrar, DIR, arquivoDe };
