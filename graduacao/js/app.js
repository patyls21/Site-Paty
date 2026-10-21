(() => {
'use strict';
const KEY = 'grad-v1';
const DIAS = ['', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const ABERTAS = ['Pretendida', 'Planejada', 'Em curso'];
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = n => Math.round(n).toLocaleString('pt-BR');
const pc = n => (n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const uid = () => Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const sum = (l, f = () => true) => l.filter(f).reduce((a, c) => a + (c.ch || 0), 0);

// ---------- semestres ----------
const semIdx = s => { const [y, n] = String(s).split('.').map(Number); return y * 10 + (n || 0); };
const semCmp = (a, b) => semIdx(a) - semIdx(b);
const semNext = s => { const [y, n] = String(s).split('.').map(Number); return n === 1 ? `${y}.2` : `${y + 1}.1`; };
const semMax = l => l.filter(Boolean).reduce((m, s) => (!m || semCmp(s, m) > 0 ? s : m), '');
const semOpcoes = () => { const o = []; let s = S.semAtual; for (let i = 0; i < 8; i++) { o.push(s); s = semNext(s); } return o; };

// ---------- estado ----------
let S = carregar();
let aba = (location.hash || '#painel').slice(1);
function carregar() {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) { /* sem storage */ }
  return clone(window.SEED);
}
function salvar() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sem storage */ } }
function mudou() { salvar(); render(); }

const ehObrig = c => c.flag === '' || c.flag === 'e';
const tipoDe = c => (ehObrig(c) ? 'obrig' : 'optat');
const rotuloTipo = c => (c.flag === '#' ? 'Eletiva' : ehObrig(c) ? 'Obrigatória' : 'Optativa');

function casaCursando(p) {
  return S.cursando.find(c => c.codigo === p.codigo)
    || S.cursando.find(c => ehObrig(c) && norm(c.nome) === norm(p.nome) && /Equivalente/.test(p.status || ''))
    || null;
}
function statusPend(p) {
  const c = casaCursando(p);
  if (!c) return 'futura';
  return c.resultado === 'passei' ? 'passei' : c.resultado === 'reprovei' ? 'refazer' : 'cursando';
}

// ---------- cálculos (replicam as fórmulas das planilhas) ----------
function calcular() {
  const ex = S.carga.exigido, i0 = S.carga.integralizado, cur = S.cursando, man = S.optativas, fr = S.frances;
  const cat = c => tipoDe(c);
  const frH = fr.ch || 0;
  const frAceito = fr.status === 'aceito' ? frH : 0, frAnalise = fr.status === 'analise' ? frH : 0;
  const manConc = sum(man, o => o.status === 'Concluída');
  const feito = {
    obrig: i0.obrig + sum(cur, c => cat(c) === 'obrig' && c.resultado === 'passei'),
    optat: i0.optat + sum(cur, c => cat(c) === 'optat' && c.resultado === 'passei') + manConc + frAceito
  };
  const emCurso = {
    obrig: sum(cur, c => cat(c) === 'obrig' && c.resultado === 'cursando'),
    optat: sum(cur, c => cat(c) === 'optat' && c.resultado === 'cursando') + sum(man, o => ABERTAS.includes(o.status) && o.semestre === S.semAtual)
  };
  const futuras = sum(man, o => ABERTAS.includes(o.status) && o.semestre !== S.semAtual);
  const feitoTotal = feito.obrig + feito.optat + (i0.compl || 0);
  const exTotal = ex.total;
  const semAntes = feitoTotal + emCurso.obrig + emCurso.optat;
  const cen = {
    obrig: emCurso.obrig, optat: emCurso.optat, frances: frAnalise,
    total: emCurso.obrig + emCurso.optat + frAnalise
  };
  cen.pendente = Math.max(exTotal - feitoTotal - cen.total, 0);
  cen.pctCom = (feitoTotal + cen.total) / exTotal;
  cen.pctSem = (feitoTotal + emCurso.obrig + emCurso.optat) / exTotal;
  cen.pendenteSem = Math.max(exTotal - feitoTotal - emCurso.obrig - emCurso.optat, 0);
  const faltaOpt = Math.max(ex.optat - feito.optat - emCurso.optat - futuras - frAnalise, 0);
  const faltaOptSem = Math.max(ex.optat - feito.optat - emCurso.optat - futuras, 0);
  const rep = S.cursando.filter(c => c.resultado === 'reprovei');
  return { ex, i0, feito, emCurso, futuras, feitoTotal, exTotal, cen, semAntes, faltaOpt, faltaOptSem, frH, frAnalise, frAceito, rep, plano: planejar() };
}

function planejar() {
  const porCod = new Map(S.pendentes.map(p => [p.codigo, p]));
  const memo = new Map();
  function ef(p) { // semestre efetivo em que a pendência é resolvida
    if (memo.has(p.codigo)) return memo.get(p.codigo);
    memo.set(p.codigo, null);
    const st = statusPend(p);
    let s = st === 'cursando' || st === 'passei' ? S.semAtual : (p.semestre || (st === 'refazer' ? semNext(S.semAtual) : ''));
    if (st !== 'passei') for (const cod of p.pre || []) {
      const q = porCod.get(cod); if (!q) continue;
      if (statusPend(q) === 'passei') continue;
      const qs = ef(q);
      if (qs) { const min = semNext(qs); if (!s || semCmp(s, min) < 0) s = min; }
    }
    memo.set(p.codigo, s);
    return s;
  }
  const itens = S.pendentes.map(p => ({ p, st: statusPend(p), sem: ef(p) }));
  const abertas = itens.filter(i => i.st !== 'passei');
  const manAbertas = S.optativas.filter(o => ABERTAS.includes(o.status));
  const todos = [...abertas.map(i => i.sem), ...manAbertas.map(o => o.semestre)];
  const previsao = abertas.length || manAbertas.length ? (semMax(todos) || semNext(S.semAtual)) : S.semAtual;
  const ult = semMax([previsao, S.semAtual]);
  const sems = []; let s = S.semAtual;
  for (let k = 0; k < 12; k++) { sems.push(s); if (semCmp(s, ult) >= 0 && sems.length >= 3) break; s = semNext(s); }
  const i0 = S.carga.integralizado, ex = S.carga.exigido, fr = S.frances;
  let restO = ex.obrig - i0.obrig;
  let restP = ex.optat - i0.optat - sum(S.optativas, o => o.status === 'Concluída') - (fr.status === 'aceito' ? fr.ch : 0);
  const linhas = sems.map(sm => {
    const ob = itens.filter(i => i.sem === sm).reduce((a, i) => a + i.p.ch, 0);
    const op = (sm === S.semAtual ? sum(S.cursando, c => tipoDe(c) === 'optat' && c.resultado !== 'reprovei') + (fr.status === 'analise' ? fr.ch : 0) : 0)
      + sum(S.optativas, o => ABERTAS.includes(o.status) && o.semestre === sm);
    restO = Math.max(restO - ob, 0); restP = Math.max(restP - op, 0);
    return { sem: sm, obrig: ob, optat: op, total: ob + op, restO, restP };
  });
  return { itens, linhas, previsao, restP };
}

// ---------- gráficos ----------
function rosca(feito, curso, total) {
  const r = 52, c = 2 * Math.PI * r, f = Math.min(feito / total, 1), g = Math.min(curso / total, 1 - f);
  const seg = (frac, off, cor, extra = '') => `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${cor}" stroke-width="16" stroke-dasharray="${frac * c} ${c}" stroke-dashoffset="${-off * c}" transform="rotate(-90 70 70)" ${extra}/>`;
  return `<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Progresso total ${pc(f)} concluído">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--soft)" stroke-width="16"/>
    ${seg(g, f, '#c9a8f5')}${seg(f, 0, 'var(--pri)')}
    <text x="70" y="68" text-anchor="middle" font-size="22" font-weight="800">${pc(f)}</text>
    <text x="70" y="86" text-anchor="middle" font-size="10" style="fill:var(--mut)">concluído</text></svg>`;
}
function barraCat(nome, exigido, feito, curso) {
  const p = v => Math.min(Math.max(v / (exigido || 1), 0), 1) * 100;
  const a = p(feito), b = Math.min(p(curso), 100 - a);
  return `<div style="margin-bottom:14px"><div class="row" style="justify-content:space-between;margin-bottom:5px"><b>${nome}</b><span class="mut sm">${nf(feito)} h de ${nf(exigido)} h · ${pc(feito / (exigido || 1))}</span></div>
    <div class="bar" role="img" aria-label="${nome}: ${nf(feito)} horas feitas, ${nf(curso)} em curso, de ${nf(exigido)}"><i class="a" style="width:${a}%"></i><i class="b" style="width:${b}%"></i></div></div>`;
}
function colunas(dados) { // [{rot, feito, plan}]
  const w = 560, h = 190, pb = 30, pt = 14, n = dados.length, bw = Math.min(34, (w - 20) / n - 6);
  const max = Math.max(...dados.map(d => d.feito + d.plan), 60);
  const y = v => pt + (h - pb - pt) * (1 - v / max);
  let o = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Horas por semestre">`;
  o += `<line x1="0" x2="${w}" y1="${h - pb}" y2="${h - pb}" stroke="var(--line)"/>`;
  dados.forEach((d, i) => {
    const x = 10 + i * ((w - 20) / n) + ((w - 20) / n - bw) / 2;
    if (d.feito) o += `<rect x="${x}" y="${y(d.feito)}" width="${bw}" height="${h - pb - y(d.feito)}" rx="4" fill="var(--pri)"><title>${d.rot}: ${d.feito} h concluídas</title></rect>`;
    if (d.plan) o += `<rect x="${x}" y="${y(d.feito + d.plan)}" width="${bw}" height="${y(d.feito) - y(d.feito + d.plan)}" rx="4" fill="#c9a8f5"><title>${d.rot}: ${d.plan} h planejadas</title></rect>`;
    o += `<text x="${x + bw / 2}" y="${y(d.feito + d.plan) - 4}" text-anchor="middle" font-size="10" font-weight="700">${d.feito + d.plan}</text>`;
    o += `<text x="${x + bw / 2}" y="${h - 12}" text-anchor="middle" font-size="10" style="fill:var(--mut)">${d.rot}</text>`;
  });
  return o + '</svg>';
}

// ---------- componentes ----------
const seg = (id, c) => `<div class="seg" role="group" aria-label="Resultado de ${esc(c.nome)}">
  <button data-act="res" data-id="${esc(id)}" data-v="cursando" class="${c.resultado === 'cursando' ? 'on warn' : ''}">Cursando</button>
  <button data-act="res" data-id="${esc(id)}" data-v="passei" class="${c.resultado === 'passei' ? 'on ok' : ''}">Passei ✔</button>
  <button data-act="res" data-id="${esc(id)}" data-v="reprovei" class="${c.resultado === 'reprovei' ? 'on bad' : ''}">Reprovei ✖</button></div>`;
const segFr = () => `<div class="seg" role="group" aria-label="Situação do francês">
  ${[['analise', 'Em análise', 'warn'], ['aceito', 'Aceito ✔', 'ok'], ['negado', 'Não aceito ✖', 'bad']].map(([v, t, k]) => `<button data-act="fr" data-v="${v}" class="${S.frances.status === v ? 'on ' + k : ''}">${t}</button>`).join('')}</div>`;
const optSem = (sel, vazio = 'a definir') => `<option value="">${vazio}</option>` + semOpcoes().map(s => `<option ${s === sel ? 'selected' : ''}>${s}</option>`).join('');
const chipSt = st => ({ cursando: '<span class="chip warn">Cursando</span>', passei: '<span class="chip ok">Passei ✔</span>', refazer: '<span class="chip bad">Refazer</span>', futura: '<span class="chip">Futura</span>' }[st]);

// ---------- abas ----------
function vazio() {
  return `<div class="card empty"><h2>🎓 Envie seu histórico para começar</h2>
    <p class="mut">Suba o PDF do histórico escolar do SIGAA e eu monto o painel, o planner e as matérias que faltam.</p>
    <p><button class="btn pri" data-act="upload">Escolher PDF do histórico</button></p></div>`;
}

function painel() {
  const k = calcular(), { ex, feito, emCurso, cen, plano } = k;
  const pendTotal = Math.max(k.exTotal - k.feitoTotal, 0);
  const alertas = [];
  for (const c of k.rep) {
    alertas.push(`<div class="alert bad">✖<div><b>Reprovou em ${esc(c.nome)}</b> (${c.ch} h). ${tipoDe(c) === 'obrig'
      ? `Obrigatória: volta para a lista do que falta, refazer em <b>${semNext(S.semAtual)}</b>.` : `As ${c.ch} h deixam de contar e voltam para as optativas que faltam.`}</div></div>`);
  }
  const exceder = plano.previsao && S.aluno.prazo && semCmp(plano.previsao, S.aluno.prazo.split('/')[0].trim()) > 0;
  if (exceder) alertas.push(`<div class="alert bad">⏳<div>A previsão (<b>${plano.previsao}</b>) passa do prazo padrão de conclusão (${esc(S.aluno.prazo)}).</div></div>`);
  if (S.frances.status === 'analise') alertas.push(`<div class="alert">⚠️<div><b>Francês (${k.frH} h) em análise.</b> Se a coordenação não aceitar, o total ao fim do semestre cai de <b>${pc(cen.pctCom)}</b> para <b>${pc(cen.pctSem)}</b>.</div></div>`);
  if (k.faltaOpt > 0) alertas.push(`<div class="alert info">🧩<div>Ainda faltam planejar <b>${nf(k.faltaOpt)} h</b> de optativas (≈ ${(k.faltaOpt / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} disciplinas de 60 h). Adicione na aba <a href="#optativas">Optativas</a>.</div></div>`);
  const enade = S.pendentes.find(p => p.codigo === 'ENADE');
  if (enade) alertas.push(`<div class="alert info">📝<div>ENADE concluinte pendente: não altera a carga horária, mas é requisito para a formatura.</div></div>`);

  const porSem = {};
  for (const m of S.historico) if (['APR', 'CUMP'].includes(m.situacao) && m.ch) porSem[m.periodo] = (porSem[m.periodo] || 0) + m.ch;
  const barras = Object.keys(porSem).sort((a, b) => semCmp(a, b)).filter(s => semCmp(s, S.semAtual) < 0).map(s => ({ rot: s, feito: porSem[s], plan: 0 }));
  for (const l of plano.linhas.filter(x => x.total)) barras.push({ rot: l.sem, feito: 0, plan: l.total });

  return `<div class="alerts">${alertas.join('')}</div>
  <div class="grid g4">
    <div class="card kpi"><div class="l">Carga total exigida</div><div class="v">${nf(k.exTotal)} h</div><div class="s">${esc(S.aluno.curso || '')}</div></div>
    <div class="card kpi"><div class="l">Já integralizada</div><div class="v">${nf(k.feitoTotal)} h</div><div class="s">${k.i0.total !== k.feitoTotal ? `histórico: ${nf(k.i0.total)} h + resultados marcados` : 'conforme o histórico'}</div></div>
    <div class="card kpi"><div class="l">Total pendente</div><div class="v">${nf(pendTotal)} h</div><div class="s">${nf(Math.max(ex.obrig - feito.obrig, 0))} h obrigatórias · ${nf(Math.max(ex.optat - feito.optat, 0))} h optativas</div></div>
    <div class="card kpi"><div class="l">Previsão de formatura</div><div class="v">${plano.previsao}</div><div class="s">${S.aluno.prazo ? 'prazo padrão / máx.: ' + esc(S.aluno.prazo) : ''}</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>📊 Progresso por categoria</h2>
      <div class="row" style="align-items:center;gap:20px;flex-wrap:wrap"><div>${rosca(k.feitoTotal, emCurso.obrig + emCurso.optat, k.exTotal)}</div>
      <div style="flex:1;min-width:220px">${barraCat('Obrigatórias', ex.obrig, feito.obrig, emCurso.obrig)}${barraCat('Optativas', ex.optat, feito.optat, emCurso.optat + k.frAnalise)}</div></div>
      <div class="leg"><span style="--c:var(--pri)">Concluído</span><span style="--c:#c9a8f5">Em curso / em análise</span><span style="--c:var(--soft)">Pendente</span></div></div>
    <div class="card"><h2>📌 Cenário planejado para ${S.semAtual}</h2>
      <div class="scroll"><table><tr><th>Indicador</th><th class="n">Horas</th></tr>
      <tr><td>Obrigatórias</td><td class="n">${nf(cen.obrig)}</td></tr>
      <tr><td>Optativas / eletivas cursando</td><td class="n">${nf(cen.optat)}</td></tr>
      <tr><td>Francês (em análise)</td><td class="n">${nf(cen.frances)}</td></tr>
      <tr class="sum"><td>Total do semestre</td><td class="n">${nf(cen.total)}</td></tr>
      <tr><td>Pendente após ${S.semAtual}</td><td class="n">${nf(cen.pendente)}</td></tr></table></div>
      <div class="grid g2" style="margin-top:12px;gap:10px">
        <div class="alert ok" style="flex-direction:column;gap:0"><span class="sm">Porcentagem após passar</span><b style="font-size:22px">${pc(cen.pctCom)}</b></div>
        <div class="alert ${S.frances.status === 'analise' ? '' : 'info'}" style="flex-direction:column;gap:0"><span class="sm">Se não aceitarem o francês</span><b style="font-size:22px">${pc(cen.pctSem)}</b></div></div></div>
  </div>
  <div class="card" style="margin-top:16px"><h2>📅 Horas por semestre <small>concluídas e planejadas</small></h2>${colunas(barras)}
    <div class="leg"><span style="--c:var(--pri)">Concluídas</span><span style="--c:#c9a8f5">Planejadas</span></div></div>`;
}

function semestre() {
  const k = calcular(), cur = S.cursando;
  const mat = cur.map(c => `<div class="mat"><div class="t">${esc(c.nome)}<small>${esc(c.codigo)} · ${c.ch} h · ${rotuloTipo(c)}</small></div>${seg(c.id, c)}</div>`).join('');
  const fr = S.frances;
  const frLinha = `<div class="mat"><div class="t">Curso de Francês (aproveitamento)<small>${fr.ch} h · Optativa · ${fr.status === 'analise' ? 'em análise pela coordenação' : fr.status === 'aceito' ? 'aceito' : 'não aceito'}</small></div>${segFr()}</div>`;
  const obrig = sum(cur, c => tipoDe(c) === 'obrig'), opt = sum(cur, c => tipoDe(c) === 'optat');
  const resumo = `<table>
    <tr><td>Obrigatórias</td><td class="n">${nf(obrig)} h</td></tr>
    <tr><td>Optativas / eletivas</td><td class="n">${nf(opt)} h</td></tr>
    <tr class="sum"><td>Carga matriculada</td><td class="n">${nf(obrig + opt)} h</td></tr>
    <tr><td>Francês (se aceito)</td><td class="n">+ ${nf(S.frances.ch)} h</td></tr>
    <tr><td>Objetivo</td><td class="n">Formar em ${k.plano.previsao}</td></tr></table>`;
  const chk = S.checklist.map(i => `<div class="chk ${i.ok ? 'ok' : ''}"><input type="checkbox" id="ck${i.id}" data-act="chk" data-id="${i.id}" ${i.ok ? 'checked' : ''}><label for="ck${i.id}"><span>${esc(i.t)}</span></label><button class="btn sm" data-act="chk-del" data-id="${i.id}" aria-label="Remover">✕</button></div>`).join('');
  return `<div class="card"><h2>💜 Planner ${S.semAtual} <small>${esc((S.aluno.nome || '').split(' ')[0])}</small></h2>
    <div class="scroll">${planner()}</div>
    <div class="lgd"><span style="--c:var(--c-obrig);--b:var(--b-obrig)">Obrigatória</span><span style="--c:var(--c-optat);--b:var(--b-optat)">Optativa</span><span style="--c:var(--c-est);--b:var(--b-est)">Estágio</span><span style="--c:var(--c-tcc);--b:var(--b-tcc)">TCC</span><span style="--c:var(--c-out);--b:var(--b-out)">Outro</span></div>${conflitos()}</div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>📚 Matérias do semestre <small>marque como foi</small></h2>${mat}${frLinha}
      <p class="mut sm" style="margin:10px 0 0">Reprovou? Marque “Reprovei ✖”: a carga deixa de contar e a matéria volta para a lista do que falta.</p></div>
    <div class="grid" style="align-content:start">
      <div class="card"><h2>🎓 Resumo do semestre</h2>${resumo}</div>
      <div class="card"><h2>✅ Checklist</h2>${chk}
        <form data-form="chk" class="row" style="margin-top:8px"><input type="text" name="t" placeholder="Nova tarefa" required style="flex:1"><button class="btn sm pri">Adicionar</button></form></div>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><h2>🕘 Horários <small>edite os blocos do planner</small></h2>${editorHorario()}</div>`;
}

function blocoInfo(b) {
  const c = b.ref ? S.cursando.find(x => x.codigo === b.ref) : null;
  let cls = 'c-out';
  if (b.tipo === 'estagio') cls = 'c-est'; else if (b.tipo === 'tcc') cls = 'c-tcc'; else if (c) cls = tipoDe(c) === 'obrig' ? 'c-obrig' : 'c-optat';
  const emoji = { 'c-obrig': '🟪', 'c-optat': '🟣', 'c-est': '🔵', 'c-tcc': '🌸', 'c-out': '⚪' }[cls];
  return { cls, emoji, res: c ? c.resultado : '' };
}
const min = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function achaConflitos() {
  const out = new Set(), pares = [];
  for (let i = 0; i < S.horario.length; i++) for (let j = i + 1; j < S.horario.length; j++) {
    const a = S.horario[i], b = S.horario[j];
    if (a.dia === b.dia && min(a.ini) < min(b.fim) && min(b.ini) < min(a.fim)) { out.add(a.id); out.add(b.id); pares.push([a, b]); }
  }
  return { ids: out, pares };
}
function conflitos() {
  const { pares } = achaConflitos();
  if (!pares.length) return '';
  return `<div class="alert" style="margin-top:12px">⚠️<div><b>Horários que se sobrepõem:</b> ${pares.map(([a, b]) => `${esc(a.nome)} × ${esc(b.nome)} (${DIAS[a.dia]})`).join('; ')}</div></div>`;
}

function planner() {
  const usaSab = S.horario.some(b => b.dia === 6), nd = usaSab ? 6 : 5;
  const ini = Math.min(7 * 60, ...S.horario.map(b => Math.floor(min(b.ini) / 60) * 60));
  const fim = Math.max(21 * 60, ...S.horario.map(b => Math.ceil(min(b.fim) / 60) * 60));
  const PX = 0.9, alt = (fim - ini) * PX, { ids } = achaConflitos();
  let o = `<div class="planner" style="--dias:${nd};--alt:${alt}px;--hora:${60 * PX}px"><div class="hd">Hora</div>`;
  for (let d = 1; d <= nd; d++) o += `<div class="hd">${DIAS[d]}</div>`;
  o += '<div class="hrs">';
  for (let m = ini; m < fim; m += 60) o += `<span style="top:${(m - ini) * PX}px">${m / 60}h</span>`;
  o += '</div>';
  for (let d = 1; d <= nd; d++) {
    const bl = S.horario.filter(b => b.dia === d).sort((a, b) => min(a.ini) - min(b.ini));
    const faixas = []; // posiciona lado a lado quando sobrepõe
    bl.forEach(b => {
      let f = faixas.findIndex(e => e <= min(b.ini));
      if (f < 0) { f = faixas.length; faixas.push(0); }
      faixas[f] = min(b.fim); b._f = f;
    });
    o += `<div class="col">` + bl.map(b => {
      const i = blocoInfo(b), n = Math.max(...bl.filter(x => min(x.ini) < min(b.fim) && min(b.ini) < min(x.fim)).map(x => x._f)) + 1;
      const h = (min(b.fim) - min(b.ini)) * PX;
      return `<div class="blk ${i.cls} ${i.res === 'reprovei' ? 'rep' : i.res === 'passei' ? 'pas' : ''} ${ids.has(b.id) ? 'clash' : ''}" style="top:${(min(b.ini) - ini) * PX}px;height:${h - 2}px;left:calc(${b._f * 100 / n}% + 2px);width:calc(${100 / n}% - 4px)" title="${esc(b.nome)} ${b.ini}–${b.fim}">${i.emoji} ${esc(b.nome)}${h > 40 ? `<small>${b.ini}–${b.fim}</small>` : ''}${i.res === 'reprovei' ? ' ✖' : i.res === 'passei' ? ' ✔' : ''}</div>`;
    }).join('') + '</div>';
  }
  return o + '</div>';
}

function editorHorario() {
  const ord = S.horario.slice().sort((a, b) => a.dia - b.dia || min(a.ini) - min(b.ini));
  const dias = sel => [1, 2, 3, 4, 5, 6].map(d => `<option value="${d}" ${d === sel ? 'selected' : ''}>${DIAS[d]}</option>`).join('');
  const linhas = ord.map(b => `<tr><td><input type="text" value="${esc(b.nome)}" data-chg="blk" data-id="${b.id}" data-f="nome" aria-label="Nome" style="width:150px"></td>
    <td><select data-chg="blk" data-id="${b.id}" data-f="dia" aria-label="Dia">${dias(b.dia)}</select></td>
    <td><input type="time" value="${b.ini}" data-chg="blk" data-id="${b.id}" data-f="ini" aria-label="Início"></td>
    <td><input type="time" value="${b.fim}" data-chg="blk" data-id="${b.id}" data-f="fim" aria-label="Fim"></td>
    <td><button class="btn sm danger" data-act="blk-del" data-id="${b.id}" aria-label="Remover bloco">✕</button></td></tr>`).join('');
  const opts = S.cursando.map(c => `<option value="${esc(c.codigo)}">${esc(c.nome)}</option>`).join('');
  return `<details><summary>Ver / editar os ${S.horario.length} blocos</summary><div class="scroll" style="margin-top:10px"><table><tr><th>Nome no planner</th><th>Dia</th><th>Início</th><th>Fim</th><th></th></tr>${linhas}</table></div></details>
  <form data-form="blk" class="form">
    <label>Matéria ou atividade<select name="ref"><option value="">Outra (digite o nome)</option><option value="@estagio">Estágio / trabalho</option>${opts}</select></label>
    <label>Nome no planner<input type="text" name="nome" placeholder="ex.: Academia"></label>
    <label>Dia<select name="dia">${dias(1)}</select></label>
    <label>Início<input type="time" name="ini" value="08:00" required></label>
    <label>Fim<input type="time" name="fim" value="10:00" required></label>
    <button class="btn pri">Adicionar bloco</button></form>`;
}

function faltam() {
  const k = calcular(), { plano } = k;
  const linhas = plano.itens.map(({ p, st, sem }) => {
    const c = casaCursando(p);
    const semCel = st === 'cursando' || st === 'passei' ? `${S.semAtual}` : `<select data-chg="pend" data-code="${esc(p.codigo)}" data-f="semestre" aria-label="Semestre de ${esc(p.nome)}">${optSem(p.semestre, st === 'refazer' ? semNext(S.semAtual) + ' (padrão)' : 'a definir')}</select>${sem && sem !== p.semestre && st !== 'cursando' && st !== 'passei' ? `<div class="mut sm">efetivo: ${sem}</div>` : ''}`;
    return `<tr class="${st === 'passei' ? 'done' : ''}"><td>${esc(p.codigo)}</td><td>${esc(p.nome)}</td><td class="n">${p.ch} h</td><td>${chipSt(st)}${c ? `<div style="margin-top:6px">${seg(c.id, c)}</div>` : ''}</td><td>${semCel}</td>
      <td><input type="text" value="${esc(p.obs)}" data-chg="pend" data-code="${esc(p.codigo)}" data-f="obs" aria-label="Observação" style="width:100%;min-width:140px"></td></tr>`;
  }).join('');
  const pendH = plano.itens.filter(i => i.st !== 'passei').reduce((a, i) => a + i.p.ch, 0);
  const tl = plano.linhas.map(l => `<tr><td><b>${l.sem}</b></td><td class="n">${nf(l.obrig)}</td><td class="n">${nf(l.optat)}</td><td class="n">${nf(l.total)}</td><td class="n">${nf(l.restO)}</td><td class="n">${nf(l.restP)}</td></tr>`).join('');
  return `<div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><div class="l">Obrigatórias que faltam</div><div class="v">${nf(pendH)} h</div><div class="s">${plano.itens.filter(i => i.st !== 'passei').length} componentes (inclui os que está cursando)</div></div>
    <div class="card kpi"><div class="l">Obrigatórias após ${S.semAtual}</div><div class="v">${nf(plano.linhas[0].restO)} h</div><div class="s">se passar em tudo</div></div>
    <div class="card kpi"><div class="l">Optativas após ${S.semAtual}</div><div class="v">${nf(plano.linhas[0].restP)} h</div><div class="s">com o francês ${S.frances.status === 'negado' ? '(não aceito)' : 'contando'}</div></div>
    <div class="card kpi"><div class="l">Previsão</div><div class="v">${plano.previsao}</div><div class="s">${k.rep.length ? '⚠️ há reprovação marcada' : 'conforme planejado'}</div></div></div>
  <div class="card"><h2>📚 Componentes obrigatórios pendentes</h2><div class="scroll"><table><tr><th>Código</th><th>Componente curricular</th><th class="n">CH</th><th>Status</th><th>Semestre planejado</th><th>Observação</th></tr>${linhas}</table></div></div>
  <div class="card" style="margin-top:16px"><h2>🗓️ Planejamento por semestre</h2><div class="scroll"><table><tr><th>Semestre</th><th class="n">Obrigatórias</th><th class="n">Optativas</th><th class="n">Total</th><th class="n">Obrig. restantes</th><th class="n">Optat. restantes</th></tr>${tl}</table></div>
    <p class="mut sm" style="margin:10px 0 0">Optativas restantes dependem do que você cadastrar na aba Optativas. Obrigatória reprovada entra automaticamente no próximo semestre e empurra as que dependem dela (TCC 2, Lab. de Conversão).</p></div>`;
}

function optativas() {
  const k = calcular(), fr = S.frances, ex = k.ex;
  const concl = S.historico.filter(m => ['APR', 'CUMP'].includes(m.situacao) && m.flag && m.flag !== 'e' && m.ch)
    .sort((a, b) => semCmp(a.periodo, b.periodo));
  const curs = S.cursando.filter(c => tipoDe(c) === 'optat');
  const man = S.optativas.map(o => `<tr><td><input type="text" value="${esc(o.nome)}" data-chg="opt" data-id="${o.id}" data-f="nome" aria-label="Nome" style="width:180px"></td>
    <td><input type="number" min="0" step="15" value="${o.ch}" data-chg="opt" data-id="${o.id}" data-f="ch" aria-label="Carga horária" style="width:70px"></td>
    <td><select data-chg="opt" data-id="${o.id}" data-f="status" aria-label="Status">${['Pretendida', 'Planejada', 'Em curso', 'Concluída', 'Não aprovada'].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td><select data-chg="opt" data-id="${o.id}" data-f="semestre" aria-label="Semestre">${optSem(o.semestre)}</select></td>
    <td><input type="text" value="${esc(o.obs || '')}" data-chg="opt" data-id="${o.id}" data-f="obs" aria-label="Observação"></td>
    <td><button class="btn sm danger" data-act="opt-del" data-id="${o.id}" aria-label="Remover">✕</button></td></tr>`).join('');
  const cobertas = k.feito.optat + k.emCurso.optat + k.futuras + k.frAnalise;
  return `<div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><div class="l">Exigidas</div><div class="v">${nf(ex.optat)} h</div></div>
    <div class="card kpi"><div class="l">Já feitas</div><div class="v">${nf(k.feito.optat)} h</div><div class="s">${pc(k.feito.optat / ex.optat)} do total</div></div>
    <div class="card kpi"><div class="l">Em curso / planejadas</div><div class="v">${nf(k.emCurso.optat + k.futuras + k.frAnalise)} h</div><div class="s">${k.frAnalise ? 'inclui francês em análise' : ''}</div></div>
    <div class="card kpi"><div class="l">Ainda faltam planejar</div><div class="v">${nf(k.faltaOpt)} h</div><div class="s">${k.faltaOpt ? '≈ ' + (k.faltaOpt / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' disciplinas de 60 h' : 'tudo coberto 🎉'}${S.frances.status === 'analise' && k.faltaOptSem !== k.faltaOpt ? ` · sem o francês: ${nf(k.faltaOptSem)} h` : ''}</div></div></div>
  <div class="card frances ${fr.status === 'aceito' ? 'ok' : ''}" style="margin-bottom:16px"><h2>🇫🇷 Curso de Francês — aproveitamento de ${fr.ch} h</h2>
    <div class="row" style="justify-content:space-between">${segFr()}
      <label class="sm">Comprovante <select data-chg="fr" data-f="comprovante"><option ${fr.comprovante === 'Pendente' ? 'selected' : ''}>Pendente</option><option ${fr.comprovante === 'Entregue' ? 'selected' : ''}>Entregue</option></select></label></div>
    <p class="sm" style="margin:10px 0 0">${fr.status === 'analise' ? 'Em análise: pode não ser aceito. O painel mostra os dois cenários (com e sem as 120 h).' : fr.status === 'aceito' ? 'Aceito: as horas já contam como integralizadas.' : 'Não aceito: as horas não contam. Complete com outras optativas.'}</p></div>
  <div class="grid g2">
    <div class="card"><h2>🧩 Optativas que preciso pegar <small>digite à mão</small></h2>
      ${S.optativas.length ? `<div class="scroll"><table><tr><th>Disciplina / atividade</th><th>CH</th><th>Status</th><th>Semestre</th><th>Obs.</th><th></th></tr>${man}</table></div>` : '<p class="mut">Nenhuma ainda. Adicione abaixo as optativas que pretende cursar.</p>'}
      <form data-form="opt" class="form"><label class="wide">Nome<input type="text" name="nome" required placeholder="ex.: Energias Renováveis"></label>
        <label>CH<input type="number" name="ch" min="0" step="15" value="60" required></label>
        <label>Semestre<select name="semestre">${optSem(semNext(S.semAtual))}</select></label>
        <label>Status<select name="status"><option>Pretendida</option><option>Planejada</option><option>Em curso</option><option>Concluída</option></select></label>
        <button class="btn pri">Adicionar</button></form></div>
    <div class="card"><h2>📘 Neste semestre</h2>${curs.map(c => `<div class="mat"><div class="t">${esc(c.nome)}<small>${esc(c.codigo)} · ${c.ch} h · ${rotuloTipo(c)}</small></div>${seg(c.id, c)}</div>`).join('') || '<p class="mut">Nenhuma optativa matriculada.</p>'}
      <details style="margin-top:14px"><summary>Já concluídas (${nf(sum(concl))} h)</summary><div class="scroll" style="margin-top:8px"><table><tr><th>Período</th><th>Componente</th><th class="n">CH</th></tr>${concl.map(m => `<tr><td>${m.periodo}</td><td>${esc(m.nome)} <span class="mut sm">${m.flag === '#' ? 'eletiva' : ''}</span></td><td class="n">${m.ch} h</td></tr>`).join('')}</table></div></details></div>
  </div>`;
}

function historico() {
  const a = S.aluno;
  const por = {};
  for (const m of S.historico) (por[m.periodo] = por[m.periodo] || []).push(m);
  const nomeSit = { APR: ['Aprovada', 'ok'], CUMP: ['Cumpriu', 'ok'], REP: ['Reprovada', 'bad'], REPF: ['Reprovada por falta', 'bad'], REPMF: ['Reprovada', 'bad'], TRANC: ['Trancada', 'warn'], DISP: ['Dispensada', 'ok'], CANC: ['Cancelada', ''], '--': ['—', ''] };
  const filtro = S.verRep !== false;
  const lista = Object.keys(por).sort((x, y) => semCmp(y, x)).map(p => `<details ${p === Object.keys(por).sort((x, y) => semCmp(y, x))[0] ? 'open' : ''}><summary>${p} <span class="mut sm">· ${sum(por[p], m => ['APR', 'CUMP'].includes(m.situacao))} h concluídas</span></summary>
    <div class="scroll"><table><tr><th>Código</th><th>Componente</th><th class="n">CH</th><th>Nota</th><th>Situação</th></tr>${por[p].filter(m => filtro || !['REP', 'REPF', 'REPMF', 'TRANC'].includes(m.situacao)).map(m => `<tr><td>${esc(m.codigo)}</td><td>${esc(m.nome)}</td><td class="n">${m.ch} h</td><td>${esc(m.nota)}</td><td><span class="chip ${nomeSit[m.situacao]?.[1] || ''}">${nomeSit[m.situacao]?.[0] || m.situacao}</span></td></tr>`).join('')}</table></div></details>`).join('');
  const repet = S.historico.filter(m => ['REP', 'REPF', 'REPMF'].includes(m.situacao));
  return `<div class="grid g2"><div class="card"><h2>👩‍🎓 Dados do aluno</h2><table>
      <tr><td class="mut">Nome</td><td><b>${esc(a.nome)}</b></td></tr><tr><td class="mut">Matrícula</td><td>${esc(a.matricula)}</td></tr>
      <tr><td class="mut">Curso</td><td>${esc(a.curso)}</td></tr><tr><td class="mut">Currículo</td><td>${esc(a.curriculo)}</td></tr>
      <tr><td class="mut">IRA</td><td>${esc(a.ira)}</td></tr><tr><td class="mut">Prazo padrão / máximo</td><td>${esc(a.prazo || '—')}</td></tr>
      <tr><td class="mut">Histórico emitido em</td><td>${esc(a.emissao)}</td></tr><tr><td class="mut">Reprovações no histórico</td><td>${repet.length} (${nf(sum(repet))} h)</td></tr></table></div>
    <div class="card"><h2>📄 Atualizar histórico</h2><div class="drop" data-act="upload" id="drop" tabindex="0" role="button">Arraste o PDF do SIGAA aqui ou <b>clique para escolher</b><div class="mut sm" style="margin-top:6px">Ao enviar um novo histórico, o que você marcou como passei/reprovei, os horários e as optativas digitadas são mantidos.</div></div>
      <div class="row" style="margin-top:14px"><button class="btn sm" data-act="export">⬇ Exportar backup</button><button class="btn sm" data-act="import">⬆ Importar backup</button><button class="btn sm danger" data-act="reset">Restaurar dados originais</button></div></div></div>
  <div class="card" style="margin-top:16px"><h2>🗂️ Componentes cursados <label class="sm mut" style="margin-left:auto;font-weight:500"><input type="checkbox" data-act="verrep" ${filtro ? 'checked' : ''}> mostrar reprovações e trancamentos</label></h2>${lista}</div>`;
}

const ABAS = { painel: ['📊 Painel', painel], semestre: ['💜 Semestre', semestre], faltam: ['📚 O que falta', faltam], optativas: ['🧩 Optativas', optativas], historico: ['🗂️ Histórico', historico] };

function render() {
  if (!ABAS[aba]) aba = 'painel';
  const a = S.aluno || {};
  $('#sub').textContent = a.nome ? `${a.nome} · ${a.curso || ''} · matrícula ${a.matricula} · IRA ${a.ira}` : 'Planejamento da graduação';
  $('#tabs').innerHTML = Object.entries(ABAS).map(([k, [t]]) => `<button role="tab" data-tab="${k}" aria-selected="${k === aba}">${t}</button>`).join('');
  const y = window.scrollY;
  $('#app').innerHTML = S.historico && S.historico.length ? ABAS[aba][1]() : vazio();
  window.scrollTo(0, y);
}

// ---------- upload do PDF ----------
function carregaScript(src) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Não consegui carregar o leitor de PDF (verifique a internet).')); document.head.appendChild(s); });
}
async function lerPdf(file) {
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let base = 'lib/';
  if (!window.pdfjsLib) { try { await carregaScript(base + 'pdf.min.js'); } catch (_) { base = CDN; await carregaScript(CDN + 'pdf.min.js'); } }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
  const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.map(t => ({ s: t.str, x: t.transform[4], y: t.transform[5], h: t.height })));
  }
  return window.Parser.parseHistorico(pages);
}
function aplicaHistorico(r) {
  const rows = r.materias;
  const matr = rows.filter(m => m.situacao === 'MATR');
  const ult = semMax(rows.map(m => m.periodo).filter(p => /^\d{4}\.\d$/.test(p)));
  const antigoCurs = new Map(S.cursando.map(c => [c.id, c]));
  const antigoPend = new Map(S.pendentes.map(p => [p.codigo, p]));
  S.aluno = { ...S.aluno, ...r.aluno };
  if (r.carga) S.carga = r.carga;
  S.semAtual = matr.length ? semMax(matr.map(m => m.periodo)) : semNext(ult);
  S.historico = rows.filter(m => m.situacao !== 'MATR').map(({ periodo, flag, codigo, nome, ch, nota, situacao }) => ({ periodo, flag, codigo, nome, ch, nota, situacao }));
  S.cursando = matr.map(m => { const id = m.codigo + '@' + m.periodo; return { id, codigo: m.codigo, nome: m.nome, ch: m.ch, flag: m.flag, periodo: m.periodo, resultado: (antigoCurs.get(id) || {}).resultado || 'cursando' }; });
  S.pendentes = r.pendentes.map(p => { const o = antigoPend.get(p.codigo) || {}; return { codigo: p.codigo, nome: p.nome, ch: p.ch, status: p.status, semestre: o.semestre || '', obs: o.obs || '', pre: o.pre || [] }; });
  S.horario = S.horario.filter(b => !b.ref || S.cursando.some(c => c.codigo === b.ref) || b.tipo);
  mudou();
}
async function enviar(file) {
  if (!file) return;
  aviso('Lendo o histórico…');
  try {
    const r = await lerPdf(file);
    if (!r.materias.length) throw new Error('Não encontrei a tabela de componentes. É o histórico escolar do SIGAA em PDF?');
    aplicaHistorico(r);
    aviso(`Histórico carregado: ${r.materias.length} componentes, ${S.cursando.length} em curso.`);
  } catch (e) { aviso('Erro: ' + (e.message || e)); }
}
function aviso(t) {
  let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = t; clearTimeout(aviso.t); aviso.t = setTimeout(() => el.remove(), 4500);
}
function arquivoPorDialogo(accept, cb) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none'; document.body.appendChild(i);
  i.onchange = () => { cb(i.files[0]); i.remove(); }; i.click();
}

// ---------- eventos ----------
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (t) { aba = t.dataset.tab; location.hash = aba; render(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset;
  switch (d.act) {
    case 'upload': arquivoPorDialogo('application/pdf', enviar); break;
    case 'res': { const c = S.cursando.find(x => x.id === d.id); if (c) { c.resultado = d.v; mudou(); } break; }
    case 'fr': S.frances.status = d.v; mudou(); break;
    case 'opt-del': S.optativas = S.optativas.filter(o => o.id !== d.id); mudou(); break;
    case 'blk-del': S.horario = S.horario.filter(x => x.id !== d.id); mudou(); break;
    case 'chk-del': S.checklist = S.checklist.filter(x => x.id !== d.id); mudou(); break;
    case 'export': {
      if (window.Android && window.Android.compartilhar) { window.Android.compartilhar('Backup Minha Graduação', JSON.stringify(S)); break; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
      a.download = 'minha-graduacao-backup.json'; a.click(); break;
    }
    case 'import': arquivoPorDialogo('application/json,text/plain,.json,.txt', async f => { try { const j = JSON.parse(await f.text()); if (!j.carga || !j.historico) throw 0; S = j; mudou(); aviso('Backup importado.'); } catch (_) { aviso('Arquivo de backup inválido.'); } }); break;
    case 'reset': if (confirm('Voltar para os dados originais? Isso apaga o que você marcou e digitou.')) { S = clone(window.SEED); mudou(); } break;
    default: break;
  }
});
document.addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  if (d.act === 'chk') { const i = S.checklist.find(x => x.id === d.id); if (i) { i.ok = el.checked; mudou(); } return; }
  if (d.act === 'verrep') { S.verRep = el.checked; mudou(); return; }
  if (d.chg === 'fr') { S.frances[d.f] = el.value; mudou(); return; }
  if (d.chg === 'opt') { const o = S.optativas.find(x => x.id === d.id); if (o) { o[d.f] = d.f === 'ch' ? Number(el.value) || 0 : el.value; mudou(); } return; }
  if (d.chg === 'pend') { const p = S.pendentes.find(x => x.codigo === d.code); if (p) { p[d.f] = el.value; mudou(); } return; }
  if (d.chg === 'blk') { const b = S.horario.find(x => x.id === d.id); if (b) { b[d.f] = d.f === 'dia' ? Number(el.value) : el.value; mudou(); } }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f).entries());
  if (f.dataset.form === 'chk') S.checklist.push({ id: uid(), t: v.t.trim(), ok: false });
  if (f.dataset.form === 'opt') S.optativas.push({ id: uid(), nome: v.nome.trim(), ch: Number(v.ch) || 0, status: v.status, semestre: v.semestre, obs: '' });
  if (f.dataset.form === 'blk') {
    if (min(v.fim) <= min(v.ini)) { aviso('O fim precisa ser depois do início.'); return; }
    const c = S.cursando.find(x => x.codigo === v.ref);
    S.horario.push({ id: uid(), nome: v.nome.trim() || (c ? c.nome : v.ref === '@estagio' ? 'Estágio' : 'Atividade'), ref: c ? c.codigo : null, tipo: v.ref === '@estagio' ? 'estagio' : null, dia: Number(v.dia), ini: v.ini, fim: v.fim });
  }
  mudou();
});
document.addEventListener('dragover', e => { if (e.target.closest('#drop')) { e.preventDefault(); $('#drop').classList.add('over'); } });
document.addEventListener('dragleave', e => { if (e.target.closest('#drop')) $('#drop').classList.remove('over'); });
document.addEventListener('drop', e => { if (e.target.closest('#drop')) { e.preventDefault(); enviar(e.dataTransfer.files[0]); } });
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'drop') { e.preventDefault(); arquivoPorDialogo('application/pdf', enviar); } });
window.addEventListener('hashchange', () => { aba = (location.hash || '#painel').slice(1); render(); });
$('#btn-upload').addEventListener('click', () => arquivoPorDialogo('application/pdf', enviar));
render();
})();
