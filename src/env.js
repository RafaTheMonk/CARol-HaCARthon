// Carrega o arquivo .env para process.env, sem depender de dotenv. Variáveis já
// definidas no ambiente têm precedência (não são sobrescritas pelo arquivo).

const fs = require("fs");
const path = require("path");

function carregar(file = path.join(__dirname, "..", ".env")) {
  try {
    for (const linha of fs.readFileSync(file, "utf8").split("\n")) {
      const l = linha.trim();
      if (!l || l.startsWith("#")) continue;
      const i = l.indexOf("=");
      if (i === -1) continue;
      const k = l.slice(0, i).trim();
      const v = l.slice(i + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch {}
}

module.exports = { carregar };
