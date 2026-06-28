/**
 * Gerador de áudios da CARol
 * --------------------------------------------------------------------------
 * Gera um MP3 para cada fala do fluxo, usando voz neural (ElevenLabs, Azure
 * ou OpenAI). Salva em ./audios_carol/01_ID.mp3, 02_ID.mp3 ...
 *
 * Requisitos: Node 18+ (tem fetch nativo, não precisa instalar nada).
 *
 * Como usar:
 *   1. Escolha o provedor na constante PROVIDER abaixo ("eleven" | "azure" | "openai").
 *   2. Ponha sua chave: exporte TTS_KEY no terminal, ou cole em FALLBACK_KEY.
 *        Linux/Mac:  export TTS_KEY="sua-chave"
 *        Windows:    set TTS_KEY=sua-chave
 *   3. (ElevenLabs) defina ELEVEN_VOICE_ID com uma voz BR da sua conta.
 *      (Azure) defina AZURE_REGION (ex.: brazilsouth) e a voz.
 *   4. Rode:  node gerar_audios_carol.js
 *
 * Roda de novo quando quiser: ele PULA os arquivos que já existem.
 * Para refazer tudo, apague a pasta audios_carol ou ponha OVERWRITE = true.
 * --------------------------------------------------------------------------
 */

// ====== CONFIGURAÇÃO ======================================================
const PROVIDER = "openai";          // "eleven" | "azure" | "openai"
const FALLBACK_KEY = "Adicione sua chave aqui, ou exporte TTS_KEY no terminal";
const KEY = process.env.TTS_KEY || FALLBACK_KEY;

const NOME  = "";                   // nome a colocar no lugar de {{nome}}. Vazio = áudio genérico, sem nome.
const PRAZO = "uns dias";           // substitui {{prazo_lembrete}}
const OVERWRITE = false;            // true = regrava mesmo se o arquivo já existir
const OUT_DIR = "./audios_carol";
const PAUSE_MS = 400;               // pausa entre chamadas (respeita limite da API)

// ElevenLabs
const ELEVEN_VOICE_ID = "COLE_O_VOICE_ID";  // pegue uma voz BR em elevenlabs.io > Voices
const ELEVEN_MODEL = "eleven_multilingual_v2";

// Azure
const AZURE_REGION = "brazilsouth";
const AZURE_VOICE  = "pt-BR-FranciscaNeural"; // outras: pt-BR-BrendaNeural, pt-BR-ThalitaNeural
const AZURE_RATE   = "-6%";                    // mais devagar, bom pro público rural

// OpenAI
const OPENAI_VOICE = "nova";        // vozes: nova, shimmer, coral, alloy, fable, onyx, echo, sage
const OPENAI_MODEL = "tts-1";       // "tts-1-hd" = um pouco melhor e mais caro
const OPENAI_SPEED = 0.95;          // 0.25 a 4.0
// =========================================================================

const fs = require("fs");
const path = require("path");

// ====== FALAS DO FLUXO (só as que viram áudio; internos 43/44 ficam de fora)
const NODES = [
 {n:1,id:"AUDIO_ABERTURA_ATIVA",m:`Oi, {{nome}}. Eu sou a CARol, a assistente que ajuda a entender o CAR, o Cadastro Ambiental Rural. Estou falando com você porque apareceu uma possível pendência ligada ao CAR da sua propriedade. Eu posso te explicar, com calma, o que isso quer dizer e qual pode ser o próximo passo. Você quer que eu te explique agora?`},
 {n:2,id:"AUDIO_PRIVACIDADE",m:`Antes de continuar, um cuidado importante. Não mande senha do Gov ponto br, foto de CPF, documento inteiro, assinatura, QR Code ou dado de banco por aqui. Se precisar mandar um print, cubra essas partes antes. Eu vou te orientar pelo que você me contar, sem pedir dado sensível. Podemos seguir?`},
 {n:3,id:"AUDIO_EXPLICA_PENDENCIA_APP",m:`Certo, {{nome}}. A pendência parece estar ligada à APP. APP é a área que precisa ser protegida perto de rio, nascente, lago, morro ou outro ponto sensível da propriedade. Falando bem simples: é aquela parte da terra que a lei pede para deixar mais cuidada, principalmente perto da água. No seu caso, pode ser que o desenho dessa área no mapa do CAR precise ser conferido ou ajustado. Isso não quer dizer, sozinho, que você fez algo errado. Quer dizer que alguém precisa olhar o mapa com atenção. Agora me diga: você prefere procurar ajuda no Sindicato ou EMATER, falar com um técnico de confiança, ou tentar olhar isso por conta própria?`},
 {n:4,id:"AUDIO_EXPLICA_APP_MAIS_SIMPLES",m:`Vou explicar de outro jeito. Imagine que tem um rio passando dentro ou perto da sua propriedade. A beira desse rio precisa aparecer no mapa do CAR como uma área protegida. Se o desenho ficou fora do lugar, torto ou incompleto, o sistema pode pedir correção. O caminho agora é só conferir o mapa e ver se precisa ajustar. Você quer procurar ajuda no Sindicato ou EMATER, falar com um técnico, ou tentar ver isso sozinho?`},
 {n:5,id:"AUDIO_CAMINHO_SINDICATO",m:`Boa escolha, {{nome}}. O Sindicato Rural ou a EMATER podem te ajudar a entender a pendência e ver o que precisa ser feito no sistema. Para não perder viagem, separe algumas coisas antes de sair de casa. Leve um documento com foto, CPF ou CNPJ, documento da terra se tiver, o número do CAR se você souber, e o celular com acesso ao seu e-mail ou Gov ponto br. Chegando lá, você pode dizer assim: Vim pedir ajuda para olhar uma pendência no meu CAR. Parece que o problema está no desenho da APP, perto do rio. Conseguiu entender o que precisa levar?`},
 {n:6,id:"AUDIO_REPETE_DOCUMENTOS_SINDICATO",m:`Sem problema. Vou repetir devagar. Leve cinco coisas, se você tiver: documento com foto, CPF ou CNPJ, documento da terra, número do CAR, e seu celular com acesso ao e-mail ou Gov ponto br. E diga no atendimento: Preciso olhar uma pendência no meu CAR, ligada à APP perto do rio. Ficou mais claro agora?`},
 {n:7,id:"AUDIO_SINDICATO_RECIBO",m:`Quando terminarem o atendimento, peça um comprovante ou recibo atualizado do CAR. Guarde esse arquivo ou papel com cuidado. Ele serve para mostrar que você procurou resolver a pendência. Se no aviso do órgão ambiental tiver algum prazo, siga aquele prazo. Se não tiver prazo claro, tente resolver o quanto antes, para evitar travas no futuro. Quer que eu te lembre daqui a alguns dias para saber se deu certo?`},
 {n:8,id:"AUDIO_CAMINHO_TECNICO",m:`Muito bem, {{nome}}. Se você já tem um técnico, engenheiro, agrônomo ou alguém de confiança, esse pode ser o caminho mais direto. Você pode mandar uma mensagem simples para ele. Diga assim: Oi. Apareceu uma pendência no meu CAR. Pelo que entendi, pode ser no desenho da APP, perto do rio. Você consegue verificar o mapa e ver se precisa corrigir? Quando ele terminar, peça o comprovante ou recibo atualizado do CAR. Você consegue falar com esse técnico nos próximos dias?`},
 {n:9,id:"AUDIO_TECNICO_CONFIRMADO",m:`Perfeito. Então o próximo passo é falar com ele e pedir para conferir a APP no mapa do CAR. Depois que ele fizer a análise ou correção, peça o recibo atualizado. Guarde esse comprovante. Quer que eu te lembre daqui a alguns dias para conferir se deu certo?`},
 {n:10,id:"AUDIO_SEM_TECNICO",m:`Tudo bem. Se você não tem técnico de confiança, o caminho mais seguro pode ser procurar o Sindicato Rural, a EMATER ou o órgão ambiental do seu estado. Eles podem te orientar sobre quem pode ajudar na sua região. Você quer que eu te diga o que levar nesse atendimento?`},
 {n:11,id:"AUDIO_TECNICO_REFORCO",m:`Sem pressa. O importante é não mexer no mapa sem ter segurança. Se você tiver dúvida, fale com o técnico primeiro. Se não conseguir falar com ele, procure Sindicato Rural ou EMATER. Quer que eu te lembre daqui a alguns dias?`},
 {n:12,id:"AUDIO_CAMINHO_SOZINHO",m:`Entendi, {{nome}}. Se você já tem costume com computador, mapa e sistema do CAR, pode tentar olhar por conta própria. Mas um cuidado: eu não consigo entrar no sistema por você nem validar se o desenho está certo. O que você precisa conferir é se o rio aparece no lugar correto e se a APP acompanha a beira do rio no mapa. Você já conseguiu abrir o mapa do CAR no computador?`},
 {n:13,id:"AUDIO_SOZINHO_ABRIU_MAPA",m:`Ótimo. Agora confira três coisas. Primeiro: se o rio está aparecendo no lugar certo. Segundo: se a área protegida perto do rio foi desenhada. Terceiro: se o desenho da APP acompanha bem a beira do rio. Você conseguiu encontrar onde pode estar o erro?`},
 {n:14,id:"AUDIO_SOZINHO_ENCONTROU_ERRO",m:`Ótimo. Então faça a correção com calma no sistema oficial. Depois, confira tudo de novo antes de enviar. Quando o sistema gerar o comprovante ou recibo atualizado, salve esse arquivo. Se bater dúvida em qualquer parte, pare e procure um técnico, o Sindicato Rural ou a EMATER. Quer que eu te lembre daqui a alguns dias?`},
 {n:15,id:"AUDIO_SOZINHO_DUVIDA",m:`Se bateu dúvida, é melhor não forçar. Mapa do CAR pode confundir mesmo. Para evitar corrigir uma coisa e criar outro problema, procure um técnico, Sindicato Rural ou EMATER. Você prefere procurar ajuda presencial ou falar com um técnico?`},
 {n:16,id:"AUDIO_SOZINHO_NAO_ABRIU",m:`Tudo bem. Para mexer nessa parte do CAR, normalmente você precisa de acesso ao sistema oficial, internet e um computador. Se você não conseguiu abrir, o melhor caminho é procurar alguém que já faça esse tipo de atendimento. Pode ser Sindicato Rural, EMATER, órgão ambiental ou um técnico de confiança. Você quer seguir pelo Sindicato ou EMATER?`},
 {n:17,id:"AUDIO_SEM_COMPUTADOR",m:`Entendi. Se você não tem computador, não tem problema. Nesse caso, o melhor é procurar um atendimento presencial. Leve seus documentos e peça ajuda para conferir a pendência do CAR. Pode ser no Sindicato Rural, na EMATER ou no órgão ambiental do seu estado. Quer que eu te diga o que levar?`},
 {n:18,id:"AUDIO_LEMBRETE_CONFIRMADO",m:`Combinado. Eu posso te lembrar daqui a {{prazo_lembrete}} para saber se você conseguiu resolver. Se depois você não quiser mais receber mensagem, é só responder: parar. Por hoje, o mais importante é seguir o próximo passo e guardar o comprovante atualizado do CAR.`},
 {n:19,id:"AUDIO_ENCERRAMENTO_FINAL",m:`Pronto, {{nome}}. A CARol espera ter deixado o caminho mais claro. Se precisar voltar, é só mandar uma mensagem dizendo qual parte do CAR está te travando. Eu te ajudo com calma.`},
 {n:20,id:"AUDIO_ENCERRAMENTO_DEPOIS",m:`Tudo bem, {{nome}}. Se quiser entender depois, é só mandar uma mensagem por aqui. Eu te ajudo a ver o caminho do CAR com calma.`},
 {n:21,id:"AUDIO_ENCERRAMENTO_PRIVACIDADE",m:`Tudo bem. Você não precisa continuar por aqui. Se preferir, confirme a situação do seu CAR pelo site oficial ou procure o órgão ambiental do seu estado. E lembre: não passe senha do Gov ponto br para ninguém.`},
 {n:22,id:"AUDIO_NAO_RECONHECE_CAR",m:`Entendi. Se você não reconhece esse CAR, não mande documento por aqui. O mais seguro é conferir pelos canais oficiais ou procurar o órgão ambiental do seu estado. Também não passe senha do Gov ponto br, CPF completo ou documento para ninguém. Você quer que eu te explique como conferir com segurança?`},
 {n:23,id:"AUDIO_CONFERIR_SEGURANCA",m:`Para conferir com segurança, use só canais oficiais. Acesse o site do CAR, procure atendimento do órgão ambiental do seu estado ou peça ajuda no Sindicato Rural ou EMATER. Não clique em link estranho. Não passe senha do Gov ponto br. Não envie documento completo para número desconhecido. Se tiver dúvida, pare e confirme antes.`},
 {n:24,id:"AUDIO_RESPOSTA_CONFUSA",m:`Eu entendi uma parte, mas não quero te orientar errado. Me responda só uma coisa: sua dúvida é sobre fazer o CAR, corrigir uma pendência, separar documentos ou entender uma mensagem do sistema?`},
 {n:25,id:"AUDIO_TRIAGEM_BASICA",m:`Vamos por partes. Escolha a frase que mais parece com sua situação. Um: ainda não tenho CAR. Dois: já tenho CAR, mas apareceu pendência. Três: quero saber quais documentos preciso. Quatro: minha situação da terra é complicada. Pode responder só com o número.`},
 {n:26,id:"AUDIO_AINDA_VAI_FAZER_CAR",m:`Entendi. Se você ainda vai fazer o CAR, o primeiro passo é juntar as informações da propriedade. O CAR é como um RG ambiental da terra. Ele mostra onde fica o imóvel e quais áreas precisam de cuidado, como mata nativa, beira de rio e nascente. Para começar, você geralmente precisa de documento pessoal, documento da terra se tiver, e alguma informação da localização do imóvel. Você quer que eu te diga o que separar?`},
 {n:27,id:"AUDIO_CHECKLIST_DOCUMENTOS",m:`Para se preparar, separe o que você tiver. Documento com foto. CPF ou CNPJ. Documento da terra, como matrícula, escritura, contrato, recibo ou outro papel que mostre sua relação com o imóvel. Número do CAR, se já existir. E alguma informação da localização da propriedade. Não precisa mandar esses documentos por aqui. Leve para o atendimento oficial, técnico, Sindicato ou EMATER. Quer que eu te ajude a escolher o melhor caminho?`},
 {n:28,id:"AUDIO_ESCOLHER_CAMINHO_DOCUMENTOS",m:`Você prefere procurar atendimento presencial, como Sindicato Rural ou EMATER, ou falar com um técnico de confiança?`},
 {n:29,id:"AUDIO_PEDE_PRINT_SEGURO",m:`Você pode mandar um print da mensagem, mas antes cubra os dados pessoais. Cubra CPF, assinatura, QR Code, senha, número completo de protocolo e qualquer dado que não seja necessário. Deixe visível só a mensagem de erro ou a pendência. Quando mandar, eu tento te explicar em linguagem simples.`},
 {n:30,id:"AUDIO_RECEBEU_PRINT",m:`Recebi o print. Vou olhar só a mensagem principal e te explicar com cuidado. Se não der para entender, eu vou te pedir só a frase principal do aviso, sem dados pessoais.`},
 {n:31,id:"AUDIO_PRINT_NAO_ENTENDI",m:`Não consegui entender bem a mensagem pelo print. Pode me mandar, por texto ou áudio, só a frase principal que apareceu no sistema? Não precisa mandar CPF, protocolo completo nem documento.`},
 {n:32,id:"AUDIO_CASO_COMPLEXO",m:`Esse caso precisa de mais cuidado. Quando envolve herança, briga de terra, posse, processo ou desmatamento grande, eu posso explicar o CAR, mas não posso dar parecer jurídico. O mais seguro é procurar um técnico, o Sindicato Rural, a EMATER, o órgão ambiental ou apoio jurídico. Quer que eu te dê uma frase simples para levar nesse atendimento?`},
 {n:33,id:"AUDIO_RESUMO_CASO_COMPLEXO",m:`Você pode dizer assim no atendimento: Preciso de orientação sobre o CAR da minha propriedade, mas minha situação tem uma parte de documentação, posse, herança ou processo que precisa ser analisada com cuidado. Quero saber qual é o caminho certo antes de fazer ou alterar o cadastro. Esse é o caminho mais seguro.`},
 {n:34,id:"AUDIO_PEDIDO_FAZ_POR_MIM",m:`Eu entendo que você queira resolver logo. Mas eu não consigo fazer o CAR por você, nem entrar no sistema com sua senha. O que eu posso fazer é te orientar no passo a passo, explicar pendências e te dizer que documentos separar. Para fazer ou alterar o cadastro, use o sistema oficial ou procure um técnico, Sindicato Rural, EMATER ou órgão ambiental. Você quer que eu te ajude a escolher o melhor caminho?`},
 {n:35,id:"AUDIO_FORA_ESCOPO",m:`Eu consigo te ajudar com assuntos ligados ao CAR. Isso inclui cadastro, APP, Reserva Legal, documentos, pendências, PRA e caminhos de atendimento. Esse outro assunto foge do meu trabalho. Quer me dizer qual parte do CAR está te travando?`},
 {n:36,id:"AUDIO_EXPLICA_RESERVA_LEGAL",m:`Reserva Legal é uma parte da propriedade que precisa manter vegetação nativa. É diferente da APP. APP costuma ser perto de rio, nascente, morro e outros pontos sensíveis. Reserva Legal é uma parte da área total do imóvel que precisa ficar conservada. A quantidade pode mudar conforme o estado, o bioma e a localização da propriedade. Por isso, eu não vou chutar porcentagem. O melhor é conferir no sistema oficial ou com um técnico. Você quer procurar ajuda presencial ou falar com um técnico?`},
 {n:37,id:"AUDIO_FOLLOWUP_15_DIAS",m:`Oi, {{nome}}. Aqui é a CARol. Estou passando só para saber se você conseguiu resolver aquela pendência do CAR. Você conseguiu procurar ajuda ou fazer a correção?`},
 {n:38,id:"AUDIO_FOLLOWUP_RESOLVIDO",m:`Que bom, {{nome}}. Agora guarde o recibo ou comprovante atualizado do CAR. Se aparecer outra dúvida no futuro, é só chamar a CARol por aqui.`},
 {n:39,id:"AUDIO_FOLLOWUP_NAO_RESOLVIDO",m:`Tudo bem. Vamos destravar isso de novo. Você prefere procurar Sindicato ou EMATER, falar com um técnico, ou tentar entender melhor a pendência?`},
 {n:40,id:"AUDIO_RECAPITULA_CASO",m:`Sem problema. A pendência parecia estar ligada à APP, que é a área protegida perto do rio ou da nascente. O próximo passo era conferir o mapa do CAR e ver se precisava ajustar o desenho dessa área. Você quer procurar ajuda presencial, falar com técnico ou entender melhor?`},
 {n:41,id:"AUDIO_SEM_RESPOSTA",m:`Oi, {{nome}}. Só passando para lembrar que posso te ajudar a entender a pendência do CAR com calma. Se quiser continuar, responda: quero ajuda. Se não quiser mais receber mensagens, responda: parar.`},
 {n:42,id:"AUDIO_OPT_OUT",m:`Tudo bem. Você não vai receber novos lembretes por aqui. Se precisar de ajuda sobre o CAR no futuro, procure os canais oficiais, Sindicato Rural, EMATER ou órgão ambiental do seu estado.`},
];

// ====== limpeza do texto ==================================================
function fill(t){
  let s = t.replace(/\{\{nome\}\}/g, NOME).replace(/\{\{prazo_lembrete\}\}/g, PRAZO);
  // remove pontuação solta quando NOME fica vazio ("Oi, ." -> "Oi.")
  s = s.replace(/,\s*([,.!?])/g, "$1")
       .replace(/\s+,/g, ",")
       .replace(/[ \t]{2,}/g, " ")
       .trim();
  return s;
}
function escapeXml(s){
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ====== provedores ========================================================
async function ttsEleven(text){
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}?output_format=mp3_44100_128`;
  const r = await fetch(url, {
    method:"POST",
    headers:{ "xi-api-key":KEY, "Content-Type":"application/json" },
    body: JSON.stringify({
      text,
      model_id: ELEVEN_MODEL,
      voice_settings:{ stability:0.5, similarity_boost:0.75, style:0.2, use_speaker_boost:true }
    })
  });
  if(!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}
async function ttsAzure(text){
  const ssml = `<speak version="1.0" xml:lang="pt-BR"><voice name="${AZURE_VOICE}"><prosody rate="${AZURE_RATE}">${escapeXml(text)}</prosody></voice></speak>`;
  const url = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const r = await fetch(url, {
    method:"POST",
    headers:{
      "Ocp-Apim-Subscription-Key": KEY,
      "Content-Type":"application/ssml+xml",
      "X-Microsoft-OutputFormat":"audio-24khz-48kbitrate-mono-mp3",
      "User-Agent":"carol-tts"
    },
    body: ssml
  });
  if(!r.ok) throw new Error(`Azure ${r.status}: ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}
async function ttsOpenAI(text){
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method:"POST",
    headers:{ "Authorization":`Bearer ${KEY}`, "Content-Type":"application/json" },
    body: JSON.stringify({ model: OPENAI_MODEL, voice: OPENAI_VOICE, input: text, response_format:"mp3", speed: OPENAI_SPEED })
  });
  if(!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}
function gerar(text){
  if(PROVIDER==="eleven") return ttsEleven(text);
  if(PROVIDER==="azure")  return ttsAzure(text);
  if(PROVIDER==="openai") return ttsOpenAI(text);
  throw new Error(`PROVIDER inválido: ${PROVIDER}`);
}

// ====== execução ==========================================================
(async () => {
  if(!KEY || KEY==="COLE_SUA_CHAVE_AQUI"){
    console.error("Falta a chave. Defina TTS_KEY no terminal ou edite FALLBACK_KEY no arquivo.");
    process.exit(1);
  }
  if(!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive:true });

  const totalChars = NODES.reduce((s,n)=> s + fill(n.m).length, 0);
  console.log(`Provedor: ${PROVIDER}  |  Falas: ${NODES.length}  |  Caracteres totais: ${totalChars}`);
  console.log(`Saída: ${path.resolve(OUT_DIR)}\n`);

  let feitos=0, pulados=0, erros=0;
  for(const node of NODES){
    const nome = `${String(node.n).padStart(2,"0")}_${node.id}.mp3`;
    const dest = path.join(OUT_DIR, nome);
    if(!OVERWRITE && fs.existsSync(dest)){ console.log(`· pulado (já existe)  ${nome}`); pulados++; continue; }
    try{
      const buf = await gerar(fill(node.m));
      fs.writeFileSync(dest, buf);
      console.log(`✓ gerado  ${nome}  (${(buf.length/1024).toFixed(0)} KB)`);
      feitos++;
      await sleep(PAUSE_MS);
    }catch(e){
      console.error(`✗ erro    ${nome}  ${e.message}`);
      erros++;
    }
  }
  console.log(`\nFim. Gerados: ${feitos}  |  Pulados: ${pulados}  |  Erros: ${erros}`);
  if(erros) console.log("Dica: erro 401 = chave errada. 429 = limite da API, aumente PAUSE_MS ou espere.");
})();
