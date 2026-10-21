import { envios, hojeLocal, addDias, pad } from './logica.mjs';

const $ = id => document.getElementById(id);
const CAMINHO = 'lembrei/data/lembretes.json';
const RAMO = 'main';
const guardar = (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} };
const lembrar = k => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };

let dados = { contatos: [], lembretes: [] };
let sha = null;
let editando = null; // lembrete em edição (ou null = novo)

const repo = () => lembrar('lb-repo') || 'patyls21/Site-Paty';
const token = () => lembrar('lb-token');
const api = (p, o = {}) => fetch(`https://api.github.com/repos/${repo()}/${p}`, {
  ...o, headers: { Accept: 'application/vnd.github+json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(o.headers || {}) },
});

function toast(t) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 3500); }
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));
const b64enc = s => { let r = ''; new TextEncoder().encode(s).forEach(b => r += String.fromCharCode(b)); return btoa(r); };
const novoId = () => Math.random().toString(36).slice(2, 10);
const dataBR = d => d.split('-').reverse().join('/');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function carregar() {
  const r = await api(`contents/${CAMINHO}?ref=${RAMO}&t=${Date.now()}`);
  if (!r.ok) { $('aviso').hidden = false; $('aviso').textContent = `Não consegui carregar os lembretes (${r.status}). Confira o repositório e o token em ⚙.`; return; }
  const j = await r.json();
  sha = j.sha;
  const d = JSON.parse(b64dec(j.content));
  dados = { contatos: d.contatos || [], lembretes: d.lembretes || [] };
  $('aviso').hidden = true;
  desenhar();
}

async function salvar(msg) {
  if (!token()) { toast('Coloque o token do GitHub em ⚙ para salvar.'); throw new Error('sem token'); }
  const corpo = { message: `Lembrei: ${msg}`, branch: RAMO, sha, content: b64enc(JSON.stringify(dados, null, 2) + '\n') };
  const r = await api(`contents/${CAMINHO}`, { method: 'PUT', body: JSON.stringify(corpo) });
  if (r.status === 409 || r.status === 422) { await carregar(); toast('Mudou em outro lugar. Recarreguei, tente de novo.'); throw new Error('conflito'); }
  if (!r.ok) { toast(`Não salvou (${r.status}).`); throw new Error('falha'); }
  sha = (await r.json()).content.sha;
  desenhar();
}

function resumoRepete(l) {
  const r = l.repete;
  return r ? `a cada ${r.cada} ${r.unidade}` : `uma vez, ${dataBR(l.data)}`;
}
function resumoAviso(a) { return `${a.diasAntes === 0 ? 'no dia' : a.diasAntes === 1 ? 'na véspera' : a.diasAntes + ' dias antes'} às ${a.hora}`; }

function desenhar() {
  const L = $('lista'); L.innerHTML = '';
  if (!dados.lembretes.length) L.innerHTML = '<p class="vazio">Nenhum lembrete ainda. Toque em “＋ Novo”.</p>';
  for (const l of dados.lembretes) {
    const c = document.createElement('div'); c.className = 'card' + (l.ativo === false ? ' off' : '');
    c.innerHTML = `<b>${esc(l.titulo)}</b><div class="m">${esc(resumoRepete(l))} · começa em ${dataBR(l.data)}</div>` +
      (l.avisos || []).map(a => `<span class="tag">${resumoAviso(a)}</span>`).join('') +
      (l.para || []).map(n => `<span class="tag">👤 ${esc(n)}</span>`).join('');
    c.onclick = () => abrirForm(l);
    L.appendChild(c);
  }
  const hoje = hojeLocal(), agora = new Date();
  const prox = envios(dados.lembretes, hoje, addDias(hoje, 30)).filter(e => e.quando >= agora).slice(0, 12);
  $('proximos').innerHTML = prox.length ? prox.map(e => {
    const d = new Date(e.quando.getTime() - 3 * 3600e3);
    return `<div class="prox"><time>${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${e.hora}</time><span>${esc(e.lembrete.titulo)} → ${esc((e.lembrete.para || []).join(', ') || 'ninguém')}</span></div>`;
  }).join('') : '<p class="vazio">Nada previsto nos próximos 30 dias.</p>';
}

// ---- formulário ----
function linhaAviso(a = { diasAntes: 0, hora: '08:00' }) {
  const d = document.createElement('div'); d.className = 'av';
  d.innerHTML = `<select>${[[0, 'No dia'], [1, '1 dia antes'], [2, '2 dias antes'], [3, '3 dias antes'], [7, '1 semana antes']].map(([v, t]) => `<option value="${v}" ${v === a.diasAntes ? 'selected' : ''}>${t}</option>`).join('')}</select><input type="time" value="${a.hora}" required><button type="button" class="perigo" aria-label="Remover">✕</button>`;
  d.querySelector('button').onclick = () => d.remove();
  $('f-avisos').appendChild(d);
}
function desenharPara(sel) {
  $('f-para').innerHTML = dados.contatos.length ? '' : '<span class="mini">Cadastre as pessoas em ⚙ primeiro.</span>';
  for (const n of dados.contatos) {
    const l = document.createElement('label'); l.className = 'chip';
    l.innerHTML = `<input type="checkbox" value="${esc(n)}" ${sel.includes(n) ? 'checked' : ''}> ${esc(n)}`;
    $('f-para').appendChild(l);
  }
}
function abrirForm(l) {
  editando = l || null;
  $('f-titulo').textContent = l ? 'Editar lembrete' : 'Novo lembrete';
  $('f-titulo-txt').value = l?.titulo || '';
  $('f-msg').value = l?.mensagem || '';
  $('f-data').value = l?.data || hojeLocal();
  $('f-rep').value = l?.repete ? '1' : '';
  $('f-cada').value = l?.repete?.cada || 15;
  $('f-unid').value = l?.repete?.unidade || 'dias';
  $('f-fim').value = l?.fim || '';
  $('f-ativo').checked = l ? l.ativo !== false : true;
  $('f-avisos').innerHTML = '';
  (l?.avisos || [{ diasAntes: 1, hora: '20:00' }, { diasAntes: 0, hora: '08:00' }]).forEach(linhaAviso);
  desenharPara(l?.para || []);
  $('f-del').hidden = !l;
  mostrarRep();
  $('d-form').showModal();
}
function mostrarRep() { const r = $('f-rep').value === '1'; $('f-cada-w').hidden = !r; $('f-fim-w').hidden = !r; }
$('f-rep').onchange = mostrarRep;
$('f-add-aviso').onclick = () => linhaAviso();
$('f-cancel').onclick = () => $('d-form').close();
$('b-novo').onclick = () => abrirForm(null);

$('f').onsubmit = async ev => {
  ev.preventDefault();
  const avisos = [...$('f-avisos').children].map(d => ({ diasAntes: +d.querySelector('select').value, hora: d.querySelector('input').value }));
  const para = [...$('f-para').querySelectorAll('input:checked')].map(i => i.value);
  if (!avisos.length) return toast('Escolha ao menos um horário de aviso.');
  if (!para.length) return toast('Escolha quem recebe.');
  const rep = $('f-rep').value === '1';
  const l = {
    id: editando?.id || novoId(), titulo: $('f-titulo-txt').value.trim(), mensagem: $('f-msg').value.trim() || undefined,
    data: $('f-data').value, repete: rep ? { cada: Math.max(1, +$('f-cada').value || 1), unidade: $('f-unid').value } : undefined,
    fim: rep && $('f-fim').value ? $('f-fim').value : undefined, avisos, para, ativo: $('f-ativo').checked,
  };
  const antes = JSON.stringify(dados);
  if (editando) dados.lembretes[dados.lembretes.indexOf(editando)] = l; else dados.lembretes.push(l);
  try { await salvar(`${editando ? 'editar' : 'novo'} "${l.titulo}"`); $('d-form').close(); toast('Salvo ✔'); }
  catch (_) { dados = JSON.parse(antes); desenhar(); }
};
$('f-del').onclick = async () => {
  if (!confirm(`Excluir "${editando.titulo}"?`)) return;
  const antes = JSON.stringify(dados);
  dados.lembretes = dados.lembretes.filter(x => x !== editando);
  try { await salvar(`excluir "${editando.titulo}"`); $('d-form').close(); }
  catch (_) { dados = JSON.parse(antes); desenhar(); }
};

// ---- configurações ----
function desenharContatos() {
  $('c-contatos').innerHTML = dados.contatos.length ? '' : '<span class="mini">Ninguém ainda.</span>';
  for (const n of dados.contatos) {
    const c = document.createElement('span'); c.className = 'chip';
    c.innerHTML = `${esc(n)}<button type="button" aria-label="Remover ${esc(n)}">✕</button>`;
    c.querySelector('button').onclick = () => { dados.contatos = dados.contatos.filter(x => x !== n); desenharContatos(); };
    $('c-contatos').appendChild(c);
  }
}
$('b-config').onclick = () => { $('c-repo').value = repo(); $('c-token').value = token(); desenharContatos(); $('d-config').showModal(); };
$('c-fechar').onclick = () => { $('d-config').close(); carregar(); };
$('c-add').onclick = () => { const n = $('c-novo').value.trim(); if (n && !dados.contatos.includes(n)) dados.contatos.push(n); $('c-novo').value = ''; desenharContatos(); };
$('c').onsubmit = async ev => {
  ev.preventDefault();
  guardar('lb-repo', $('c-repo').value.trim() || undefined); guardar('lb-token', $('c-token').value.trim() || undefined);
  try { await salvar('pessoas'); $('d-config').close(); toast('Salvo ✔'); } catch (_) {}
};
$('c-teste').onclick = async () => {
  const nome = prompt(`Mandar teste para quem?\n${dados.contatos.join(', ')}`);
  if (!nome) return;
  guardar('lb-repo', $('c-repo').value.trim() || undefined); guardar('lb-token', $('c-token').value.trim() || undefined);
  const r = await api('actions/workflows/lembrei.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: RAMO, inputs: { teste_para: nome.trim() } }) });
  toast(r.ok ? 'Teste pedido. Chega em ~1 minuto.' : `Não consegui pedir o teste (${r.status}). O token precisa de Actions: Read and write.`);
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
carregar();
