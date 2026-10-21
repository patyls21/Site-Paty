// Roda no GitHub Actions a cada poucos minutos: envia pelo WhatsApp o que está na hora e anota em data/estado.json.
// Telefones ficam só no Secret LEMBREI_CONTATOS: {"Mãe":{"telefone":"5511999999999","apikey":"123456"}, ...}
import { readFile, writeFile } from 'node:fs/promises';
import { devidos, addDias, hojeLocal } from './logica.mjs';

const dir = new URL('./data/', import.meta.url);
const ler = async n => JSON.parse(await readFile(new URL(n, dir), 'utf8'));
const contatos = JSON.parse(process.env.LEMBREI_CONTATOS || '{}');
const provedor = (process.env.WHATSAPP_PROVIDER || 'callmebot').toLowerCase();

async function enviarWhats(c, texto) {
  const fone = String(c.telefone).replace(/\D/g, '');
  if (provedor === 'callmebot') {
    const u = `https://api.callmebot.com/whatsapp.php?phone=${fone}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(c.apikey)}`;
    const r = await fetch(u);
    const corpo = await r.text();
    if (!r.ok) throw new Error(`CallMeBot ${r.status}: ${corpo.slice(0, 200)}`);
    return;
  }
  if (provedor === 'meta') {
    const id = process.env.META_PHONE_ID, token = process.env.META_TOKEN, modelo = process.env.META_TEMPLATE;
    const body = modelo
      ? { messaging_product: 'whatsapp', to: fone, type: 'template', template: { name: modelo, language: { code: process.env.META_LANG || 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: texto.replace(/\n/g, ' ') }] }] } }
      : { messaging_product: 'whatsapp', to: fone, type: 'text', text: { body: texto } };
    const r = await fetch(`https://graph.facebook.com/v20.0/${id}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Meta ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return;
  }
  throw new Error(`Provedor desconhecido: ${provedor}`);
}

const teste = (process.env.TESTE_PARA || '').trim();
if (teste) {
  const c = contatos[teste];
  if (!c) { console.error(`Contato "${teste}" não está no Secret LEMBREI_CONTATOS.`); process.exit(1); }
  await enviarWhats(c, '✅ *Lembrei!* Teste: está tudo certo por aqui.');
  console.log(`Teste enviado para ${teste}.`);
  process.exit(0);
}

const { lembretes = [] } = await ler('lembretes.json');
const estado = await ler('estado.json');
estado.enviados ||= {};
const lista = devidos(lembretes, estado.enviados);
let falhas = 0;
for (const d of lista) {
  const c = contatos[d.nome];
  if (!c) { console.error(`Sem telefone para "${d.nome}" (adicione no Secret LEMBREI_CONTATOS).`); falhas++; continue; }
  try {
    await enviarWhats(c, d.texto);
    estado.enviados[d.chave] = new Date().toISOString();
    console.log(`Enviado a ${d.nome}: ${d.lembrete.titulo}`);
  } catch (e) { console.error(`Falhou para ${d.nome}: ${e.message}`); falhas++; }
}
// limpa registros com mais de 60 dias
const corte = addDias(hojeLocal(), -60);
for (const k of Object.keys(estado.enviados)) if (k.split('|')[1] < corte) delete estado.enviados[k];
await writeFile(new URL('estado.json', dir), JSON.stringify(estado, null, 2) + '\n');
console.log(`${lista.length} aviso(s) na hora, ${falhas} falha(s).`);
if (falhas) process.exit(1);
