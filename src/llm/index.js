// Abstração de provider de LLM.
//
// Interface única pro resto da CARol:
//
//   responder({ system, history, mediaAtual, onDelta }) -> Promise<string>
//
//   - system     : string do system prompt (persona)
//   - history    : array [{ role:"user"|"assistant", name?, text }] (ver context.js)
//   - mediaAtual : opcional { mimeType, data(base64) } - áudio/imagem da msg atual
//   - onDelta    : opcional, recebe cada pedaço do texto durante o streaming
//   - retorna    : o texto final completo da resposta
//
// O provider concreto (claude.js | gemini.js) é escolhido por config.PROVIDER.

const { PROVIDER } = require("../config");

const providers = {
  claude: require("./claude"),
  gemini: require("./gemini"),
};

function getProvider(nome = PROVIDER) {
  const p = providers[nome];
  if (!p) throw new Error(`Provider de LLM desconhecido: ${nome}`);
  return p;
}

async function responder(args) {
  return getProvider().responder(args);
}

module.exports = { responder, getProvider };
