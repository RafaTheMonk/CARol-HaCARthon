# CARol

Assistente de WhatsApp que ajuda **donos de terra e produtores rurais** a entender o
**CAR - Cadastro Ambiental Rural**. A CARol responde em **tempo real** (sem comandos),
em **linguagem simples**, mantendo o contexto da conversa. Lê **texto, áudio e imagem**.

## Como funciona

- Conecta no WhatsApp via [Baileys](https://github.com/WhiskeySockets/Baileys) (parear por QR code).
- Cada mensagem dos chats liberados é entregue ao motor, que monta a persona + as
  últimas mensagens da conversa e chama o LLM.
- A "memória" da conversa é mantida do nosso lado (as APIs de LLM são *stateless*):
  guardamos as últimas mensagens por chat e reenviamos a cada chamada.
- Multimodal pelo Gemini: transcreve áudio e lê imagem na mesma chamada.

## Estrutura

```
index.js            conexão WhatsApp + roteamento das mensagens
src/
  config.js         configuração (provider, modelos, allowlist, atraso, custos)
  env.js            carrega o .env sem dependências
  persona.js        system prompt da CARol (quem ela é, regras, linguagem simples)
  context.js        buffer de contexto rolante por chat
  engine.js         motor: mídia, gate, geração, "digitando…", envio
  llm/
    index.js        abstração de provider (interface única)
    gemini.js       provider Gemini (padrão; áudio + imagem nativos)
    claude.js       provider Claude (texto + imagem; áudio não)
```

## Rodar

```bash
npm install
cp .env.example .env   # preencha GEMINI_API_KEY
npm start              # escaneie o QR code no terminal
```

## Configuração (.env)

| Variável | Padrão | O que faz |
|---|---|---|
| `GEMINI_API_KEY` | - | Chave do Gemini (provider padrão) |
| `ANTHROPIC_API_KEY` | - | Chave da Claude (só se `RT_PROVIDER=claude`) |
| `RT_PROVIDER` | `gemini` | `gemini` ou `claude` |
| `RT_CHATS` | (vazio) | JIDs onde a CARol responde, separados por vírgula. Vazio = todos |
| `RT_MAX_HISTORICO` | `5` | Mensagens recentes reenviadas por chat (memória da conversa) |
| `RT_MAX_TOKENS` | `400` | Teto de tokens de saída (resposta curta = mais barato) |
| `RT_DELAY_MS` | `10000` | Atraso humanizado antes de responder (mostra "digitando…") |
| `RT_INTERVALO_MIN_MS` | `0` | Intervalo mínimo entre respostas no mesmo chat |

## Trocar de provider

`RT_PROVIDER=gemini` (barato, áudio + imagem) ou `RT_PROVIDER=claude` (texto + imagem).
A abstração em `src/llm` troca um pelo outro sem mexer no resto.
