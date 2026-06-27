#!/usr/bin/env node
// Lê o histórico de conversas (data/historico/<jid>.jsonl, um arquivo por chat) e
// mostra um resumo ou exporta CSV pra análise (planilha, ferramenta de dados, etc.).
//
// Uso:
//   node scripts/historico.js                 -> resumo geral + por chat
//   node scripts/historico.js --csv           -> CSV de TODOS os chats no stdout
//   node scripts/historico.js --chat <jid>    -> resumo só daquele chat
//   node scripts/historico.js --chat <jid> --csv > pessoa.csv
//
// Cada DM já está num arquivo próprio, então pra pegar uma pessoa também dá pra
// ler direto: cat data/historico/<jid>.jsonl
//
// Roda sem subir o bot e sem gastar token: só lê os arquivos locais.

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "data", "historico");

function safe(chat) {
  return String(chat || "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function lerArquivo(file) {
  return fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function ler(chatFiltro) {
  if (!fs.existsSync(DIR)) return [];
  let arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl"));
  if (chatFiltro) arquivos = arquivos.filter((f) => f === safe(chatFiltro) + ".jsonl");
  const regs = [];
  for (const f of arquivos) regs.push(...lerArquivo(path.join(DIR, f)));
  regs.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return regs;
}

const args = process.argv.slice(2);
const ehCsv = args.includes("--csv");
const iChat = args.indexOf("--chat");
const chatFiltro = iChat !== -1 ? args[iChat + 1] : null;

const regs = ler(chatFiltro);

function csvCampo(v) {
  return `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
}

if (ehCsv) {
  console.log("ts,chat,grupo,role,senderId,nome,tipo,text");
  for (const r of regs) {
    console.log(
      [r.ts, r.chat, r.grupo ? 1 : 0, r.role, r.senderId, r.nome, r.tipo, r.text]
        .map(csvCampo)
        .join(",")
    );
  }
  process.exit(0);
}

// Resumo
const porRole = {};
const porTipo = {};
const porChat = {};
const porDia = {};
let min = null;
let max = null;

for (const r of regs) {
  porRole[r.role] = (porRole[r.role] || 0) + 1;
  if (r.tipo) porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1;
  if (r.chat) porChat[r.chat] = (porChat[r.chat] || 0) + 1;
  const dia = String(r.ts || "").slice(0, 10);
  if (dia) porDia[dia] = (porDia[dia] || 0) + 1;
  if (r.ts && (!min || r.ts < min)) min = r.ts;
  if (r.ts && (!max || r.ts > max)) max = r.ts;
}

console.log("Pasta:", DIR);
if (chatFiltro) console.log("Filtro de chat:", chatFiltro);
console.log("Total de registros:", regs.length);
console.log("Período:", min || "-", "->", max || "-");
console.log("Chats únicos:", Object.keys(porChat).length);
console.log("Por papel:", JSON.stringify(porRole));
console.log("Por tipo:", JSON.stringify(porTipo));
console.log("\nMensagens por dia:");
Object.keys(porDia)
  .sort()
  .forEach((d) => console.log("  " + d + ": " + porDia[d]));
console.log("\nChats por volume:");
Object.entries(porChat)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([c, n]) => console.log("  " + c + ": " + n));
