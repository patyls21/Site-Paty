import { envios, hojeLocal, addDias, pad, chave } from './logica.mjs';

const $ = id => document.getElementById(id);
const CHAVE = 'lb-dados';
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
const lembrar = k => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };

let dados = { contatos: [], lembretes: [] }; // contatos: [{nome, fone}]
let editando = null; // lembrete em edição (ou null = novo)

function toast(t) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 3500); }
const novoId = () => Math.random().toString(36).slice(2, 10);
const dataBR = d => d.split('-').reverse().join('/');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nomes = () => dados.contatos.map(c => c.nome);
const foneBR = t => { const n = String(t).replace(/\D/g, ''); return n.length <= 11 ? '55' + n : n; };

function carregar() {
  try { const d = JSON.parse(lembrar(CHAVE) || '{}'); dados = { contatos: d.contatos || [], lembretes: d.lembretes || [] }; } catch (_) {}
  $('so-app').hidden = !!window.Android;
  $('c-modo').value = lembrar('lb-modo') === 'vibra' ? 'vibra' : 'toca';
  if (window.Android) window.Android.modo($('c-modo').value);
  desenhar();
  enviarPlano();
}

// Entrega ao Android os próximos avisos (90 dias); ele agenda os alarmes e mostra as notificações.
function enviarPlano() {
  if (!window.Android) return;
  const hoje = hojeLocal(), agora = new Date(), plano = [];
  for (const e of envios(dados.lembretes, hoje, addDias(hoje, 90))) {
    if (e.quando <= agora) continue;
    for (const nome of e.lembrete.para || []) {
      const c = dados.contatos.find(x => x.nome === nome);
      if (c) plano.push({ t: e.quando.getTime(), k: chave(e.lembrete.id, e.ocorr, e.diasAntes, e.hora, nome), titulo: e.lembrete.titulo, nome, fone: foneBR(c.fone), texto: e.texto });
    }
  }
  window.Android.agendar(JSON.stringify(plano));
}

function salvar() {
  guardar(CHAVE, JSON.stringify(dados));
  desenhar();
  enviarPlano();
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
  for (const n of nomes()) {
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
  if (editando) dados.lembretes[dados.lembretes.indexOf(editando)] = l; else dados.lembretes.push(l);
  salvar(); $('d-form').close(); toast('Salvo ✔');
};
$('f-del').onclick = () => {
  if (!confirm(`Excluir "${editando.titulo}"?`)) return;
  dados.lembretes = dados.lembretes.filter(x => x !== editando);
  salvar(); $('d-form').close();
};

// ---- configurações ----
function desenharContatos() {
  $('c-contatos').innerHTML = dados.contatos.length ? '' : '<span class="mini">Ninguém ainda.</span>';
  for (const c of dados.contatos) {
    const el = document.createElement('span'); el.className = 'chip';
    el.innerHTML = `${esc(c.nome)} · ${esc(c.fone)}<button type="button" aria-label="Remover ${esc(c.nome)}">✕</button>`;
    el.querySelector('button').onclick = () => { dados.contatos = dados.contatos.filter(x => x !== c); salvar(); desenharContatos(); };
    $('c-contatos').appendChild(el);
  }
}
$('b-config').onclick = () => { desenharContatos(); $('d-config').showModal(); };
$('c-fechar').onclick = () => $('d-config').close();
$('c-add').onclick = () => {
  const nome = $('c-nome').value.trim(), fone = $('c-fone').value.trim();
  if (!nome || foneBR(fone).length < 12) return toast('Informe o nome e o WhatsApp com DDD.');
  if (dados.contatos.some(c => c.nome === nome)) return toast('Já existe alguém com esse nome.');
  dados.contatos.push({ nome, fone }); $('c-nome').value = ''; $('c-fone').value = '';
  salvar(); desenharContatos();
};
$('c-modo').onchange = () => { guardar('lb-modo', $('c-modo').value); if (window.Android) window.Android.modo($('c-modo').value); };
$('c-bat').onclick = () => window.Android ? window.Android.abrirBateria() : toast('Só funciona no aplicativo.');
$('c-tela').onclick = () => window.Android ? window.Android.abrirTelaCheia() : toast('Só funciona no aplicativo.');
$('c-teste').onclick = () => {
  const c = dados.contatos[0];
  if (!c) return toast('Cadastre alguém primeiro.');
  if (!window.Android) return toast('Só funciona no aplicativo.');
  window.Android.testar(c.nome, foneBR(c.fone)); toast('Teste enviado: veja a notificação.');
};

carregar();
