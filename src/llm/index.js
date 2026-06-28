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

// Gemini às vezes 503a ("high demand"). Depois dos retries internos dele, se ainda
// falhar por sobrecarga, cai pro Claude - mas só pra texto/imagem (Claude não lê
// áudio cru) e só se houver ANTHROPIC_API_KEY. Sem fallback possível, repropaga o
// erro original do Gemini (o engine mostra a mensagem humana de erro).
function ehSobrecarga(e) {
  const s = JSON.stringify(e?.message || e || "");
  return e?.status === 503 || /UNAVAILABLE|503|high demand|overloaded/i.test(s);
}

async function responder(args) {
  const primario = getProvider();
  try {
    return await primario.responder(args);
  } catch (e) {
    const ehAudioCru = /^audio\//.test(args?.mediaAtual?.mimeType || "");
    const claude = providers.claude;
    if (
      ehSobrecarga(e) &&
      PROVIDER !== "claude" &&
      !ehAudioCru &&
      claude.temChave &&
      claude.temChave()
    ) {
      console.warn("[CARol] Gemini sobrecarregado (503), fallback -> Claude");
      try {
        return await claude.responder(args);
      } catch (e2) {
        console.error("[CARol] fallback Claude falhou:", e2?.message || e2);
        throw e; // repropaga o erro original do Gemini
      }
    }
    throw e;
  }
}

async function transcrever(args) {
  const p = getProvider();
  return p.transcrever ? p.transcrever(args) : "";
}

module.exports = { responder, transcrever, getProvider };
