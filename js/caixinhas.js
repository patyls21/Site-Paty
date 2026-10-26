// Aba Caixinhas: uma caixinha por objetivo (celular, carro, formatura…), cada uma com meta, aportes de cada um
// (na data de cada um, editáveis por mês), rendimento em % do CDI e gráfico do que falta.
// A viagem tem a aba própria (Viagens); aqui ela aparece só como atalho com o saldo.
(() => {
  const num = (v, pad = 0) => Number.isFinite(Number(v)) ? Number(v) : pad;
  const n = k => App.nome(k);
  const ICONES = [['🐷', 'Caixinha'], ['📱', 'Celular'], ['🚗', 'Carro'], ['🎓', 'Formatura'], ['🏠', 'Casa'], ['💍', 'Casamento'], ['🎁', 'Presente'], ['🛡️', 'Reserva'], ['💻', 'Computador'], ['🎯', 'Outro']];
  const dm = iso => iso.split('-').reverse().join('/');

  // ---------- datas ----------
  const isoDe = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // dia do depósito no mês; sábado/domingo passam para a segunda-feira (feriados não são considerados)
  const diaUtil = (m, dia) => {
    const [y, mo] = m.split('-').map(Number), d = new Date(y, mo - 1, Math.min(Math.max(1, dia), new Date(y, mo, 0).getDate()));
    if (d.getDay() === 6) d.setDate(d.getDate() + 2); else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return isoDe(d);
  };
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const dataCurta = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)} (${SEM[new Date(iso + 'T12:00:00').getDay()]})`;

  // ---------- cálculo ----------
  // rende X% do CDI (CDI da configuração, o mesmo da aba Viagens)
  const taxaAno = cx => {
    const cdi = num(Store.config.cdiAnual) / 100, p = num(cx.pct) / 100, d = Math.pow(1 + cdi, 1 / 252) - 1;
    return Math.pow(1 + p * d, 252) - 1;
  };
  const taxaDia = cx => Math.pow(1 + taxaAno(cx), 1 / 365) - 1;
  const cls = k => U.ids().indexOf(k) === 0 ? 'a' : U.ids().indexOf(k) === 1 ? 'b' : '';
  // por pessoa: aporteA / diaA, aporteB / diaB… e, nos meses alterados, { A: valor, dataA: data, B: … }
  // retorna { v: { A: valor, … }, d: { A: data, … }, alterado }
  const aporteMes = (cx, m) => {
    const o = (cx.meses || {})[m], v = {}, d = {}, f = {};
    U.ids().forEach(k => { d[k] = (o && o['data' + k]) || diaUtil(m, num(cx['dia' + k], 26)); v[k] = o ? num(o[k]) : num(cx['aporte' + k]); f[k] = !!(o && o['feito' + k]); });
    return { v, d, f, alterado: !!o };
  };
  // saldo estimado em uma data: cada depósito entra na data dele e rende todo dia (bruto, antes do IR).
  // Com saldo real informado (ancora), recomeça dele e só conta os depósitos depois daquela data.
  // Depósito de hoje (ou futuro) só entra no saldo de hoje depois de marcado como "já depositei"; numa projeção futura todos entram.
  function simular(cx, fim, semAncora) {
    const td = taxaDia(cx), ini = cx.inicio || U.mesAtual(), saldoIni = num(cx.saldoInicial), hoje = U.hoje();
    const ancora = !semAncora && cx.ancoraData && cx.ancoraData <= fim ? cx.ancoraData : '';
    const dep = []; let aportado = 0;
    for (let m = ini; m + '-01' <= fim; m = U.mesSoma(m, 1)) {
      const a = aporteMes(cx, m);
      U.ids().forEach(k => { const d = a.d[k], v = a.v[k]; if (v > 0 && d <= fim && (d < hoje || a.f[k] || fim > hoje)) { aportado += v; dep.push({ d, v }); } });
    }
    // depósitos avulsos já feitos entram na data em que foram colocados (os "programados" só contam quando marcados como feitos)
    (cx.avulsos || []).forEach(a => { const d = a.feito ? (a.feitoEm || a.data) : ''; if (d && d <= fim) { aportado += a.valor; dep.push({ d, v: a.valor }); } });
    dep.sort((x, y) => x.d.localeCompare(y.d));
    let bal = ancora ? num(cx.ancoraSaldo) : saldoIni, ult = ancora || ini + '-01';
    const render = ate => { const k = U.diasEntre(ult, ate); if (k > 0) { bal *= Math.pow(1 + td, k); ult = ate; } };
    dep.forEach(x => { if (ancora && x.d <= ancora) return; render(x.d); bal += x.v; });
    render(fim);
    const saldo = Math.round(bal);
    if (!ancora) return { saldo, aportado, rendimento: saldo - saldoIni - aportado };
    // com saldo real: rendimento estimado até a data dele + o que rendeu depois (a diferença da estimativa não vira rendimento negativo)
    const depois = dep.filter(x => x.d > ancora).reduce((s, x) => s + x.v, 0);
    const rendimento = simular(cx, ancora, true).rendimento + saldo - num(cx.ancoraSaldo) - depois;
    return { saldo, aportado: saldo - saldoIni - rendimento, rendimento };
  }
  // mantendo os aportes, em que mês a caixinha chega na meta (null se não chega em 20 anos)
  function mesQueBate(cx) {
    if (!(num(cx.meta) > 0)) return null;
    const hoje = U.hoje();
    for (let i = 0, m = U.mesAtual(); i <= 240; i++, m = U.mesSoma(m, 1)) {
      const fim = i === 0 ? hoje : m + '-28';
      if (simular(cx, fim < hoje ? hoje : fim).saldo >= cx.meta) return m;
    }
    return null;
  }

  // ---------- gráfico ----------
  function rosca(partes) {
    const R = 52, L = 2 * Math.PI * R, tot = partes.reduce((s, p) => s + p.v, 0) || 1;
    let off = 0;
    const arcos = partes.filter(p => p.v > 0).map(p => {
      const len = L * p.v / tot, s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${p.cor}" stroke-width="22" stroke-dasharray="${len} ${L - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
      off += len; return s;
    }).join('');
    return `<svg viewBox="0 0 140 140" width="170" height="170" role="img" aria-label="Quanto falta para a meta"><circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--card2)" stroke-width="22"/>${arcos}</svg>`;
  }

  // ---------- formulários ----------
  const salvar = (cx, o) => Store.cofres.set(cx.id, { ...cx, ...o });

  function formCaixinha(cx) {
    const novo = !cx, ids = U.ids();
    const v = novo ? { icone: '🐷', inicio: U.mesAtual(), saldoInicial: 0, pct: Store.config.pctCdi, meta: 0, alvo: '' } : cx;
    const vals = { ...v, meta: v.meta ? U.valorInput(v.meta) : '', saldoInicial: U.valorInput(num(v.saldoInicial)), pct: String(v.pct).replace('.', ',') };
    ids.forEach(k => { vals['aporte' + k] = U.valorInput(num(v['aporte' + k])); vals['dia' + k] = String(num(v['dia' + k], 26)); });
    App.form(novo ? 'Nova caixinha' : 'Editar caixinha', [
      { k: 'nome', rotulo: 'Nome (ex.: Celular novo, Carro, Formatura)', req: true },
      { k: 'icone', rotulo: 'Ícone', tipo: 'select', opcoes: ICONES.map(([i, t]) => [i, `${i} ${t}`]) },
      { k: 'meta', rotulo: 'Meta de valor (R$) — vazio se não tiver', inputmode: 'decimal' },
      { k: 'alvo', rotulo: 'Até quando quer juntar (opcional)', tipo: 'date' },
      ...ids.flatMap(k => [
        { k: 'aporte' + k, rotulo: `Aporte mensal de ${n(k)} (R$)`, inputmode: 'decimal', req: true },
        { k: 'dia' + k, rotulo: `Dia do depósito de ${n(k)} (1 a 31)`, tipo: 'number', req: true, dica: 'Se cair no fim de semana, vale a segunda-feira. Em um mês diferente, ajuste a data na linha do mês (✏️).' }]),
      { k: 'inicio', rotulo: 'Mês em que começou a contar', tipo: 'month', req: true },
      { k: 'saldoInicial', rotulo: 'Quanto já tinha nesse mês, antes do aporte (R$)', inputmode: 'decimal', req: true },
      { k: 'pct', rotulo: 'Rende quantos % do CDI? (0 se não rende)', inputmode: 'decimal', req: true, dica: `CDI usado: ${String(Store.config.cdiAnual).replace('.', ',')}% ao ano (muda na aba Viagens › Alterar).` }
    ], vals, f => {
      const meta = f.meta.trim() ? U.parseValor(f.meta) : 0, aps = ids.map(k => U.parseValor(f['aporte' + k])), saldo = U.parseValor(f.saldoInicial);
      const pct = Number(String(f.pct).replace(',', '.'));
      if (![meta, ...aps, saldo].every(x => x >= 0) || !(pct >= 0) || !/^\d{4}-\d{2}$/.test(f.inicio)) { alert('Confira os valores.'); return false; }
      const dia = x => Math.min(31, Math.max(1, parseInt(x, 10) || 26)), porPessoa = {};
      ids.forEach((k, i) => { porPessoa['aporte' + k] = aps[i]; porPessoa['dia' + k] = dia(f['dia' + k]); });
      const o = { nome: f.nome.trim(), icone: f.icone, meta, alvo: f.alvo || '', ...porPessoa, inicio: f.inicio, saldoInicial: saldo, pct };
      if (novo) { const c = Store.cofres.add({ ...o, meses: {}, ancoraData: '', ancoraSaldo: 0, concluida: false }); location.hash = 'caixinhas/' + c.id; }
      else salvar(cx, o);
    });
  }

  function formMes(cx, m) {
    const a = aporteMes(cx, m), ids = U.ids(), vals = {};
    ids.forEach(k => { vals[k] = U.valorInput(a.v[k]); vals['data' + k] = a.d[k]; vals['sit' + k] = a.f[k] || a.d[k] < U.hoje() ? 'feito' : 'prog'; });
    App.form('Aporte de ' + U.mesNome(m), ids.flatMap(k => [
      { k, rotulo: `${n(k)} coloca (R$) — 0 se não colocar`, inputmode: 'decimal', req: true },
      { k: 'data' + k, rotulo: `Data do depósito de ${n(k)}`, tipo: 'date', req: true },
      { k: 'sit' + k, rotulo: `Situação do depósito de ${n(k)}`, tipo: 'select', opcoes: [['feito', 'Já caiu na caixinha'], ['prog', 'Ainda vai cair']] }
    ]), vals, f => {
      const o = {};
      for (const k of ids) { const v = U.parseValor(f[k]); if (!(v >= 0)) { alert('Valor inválido.'); return false; } o[k] = v; o['data' + k] = f['data' + k]; o['feito' + k] = f['sit' + k] === 'feito'; }
      salvar(cx, { meses: { ...(cx.meses || {}), [m]: o } });
    }, a.alterado ? { rotulo: '↩ Voltar ao padrão', fn: () => { const meses = { ...cx.meses }; delete meses[m]; salvar(cx, { meses }); } } : null);
  }

  // depósito avulso: um valor só, de uma pessoa, numa data (já colocado ou ainda por colocar, com aviso no dia)
  const faltaDe = (cx, k) => (cx.avulsos || []).filter(a => !a.feito && a.quem === k).reduce((s, a) => s + a.valor, 0);
  function formAvulso(cx, av) {
    App.form(av ? 'Editar depósito avulso' : 'Depósito avulso', [
      { k: 'quem', rotulo: 'Quem coloca', tipo: 'select', opcoes: U.ids().map(k => [k, n(k)]) },
      { k: 'valor', rotulo: 'Valor (R$)', inputmode: 'decimal', req: true },
      { k: 'data', rotulo: 'Data (em que colocou ou em que vai colocar)', tipo: 'date', req: true },
      { k: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: [['prog', 'Ainda vou colocar (avisar no dia)'], ['feito', 'Já coloquei']] }
    ], av ? { quem: av.quem, valor: U.valorInput(av.valor), data: av.data, situacao: av.feito ? 'feito' : 'prog' } : { quem: App.eu() || U.ids()[0], data: U.hoje(), situacao: 'prog' }, f => {
      const valor = U.parseValor(f.valor);
      if (!(valor > 0)) { alert('Valor inválido.'); return false; }
      const feito = f.situacao === 'feito';
      const o = { id: av ? av.id : U.id(), quem: f.quem, valor, data: f.data, feito, ...(feito ? { feitoEm: av && av.feito ? av.feitoEm : f.data } : {}) };
      salvar(cx, { avulsos: av ? cx.avulsos.map(x => x.id === av.id ? o : x) : [...(cx.avulsos || []), o] });
    });
  }

  function formSaldoReal(cx) {
    App.form('Atualizar com o saldo real', [
      { k: 'saldo', rotulo: 'Saldo que aparece no app do banco agora (R$)', inputmode: 'decimal', req: true, dica: 'Depois disso o site só soma os depósitos novos e o rendimento a partir daqui.' },
      { k: 'data', rotulo: 'Data desse saldo', tipo: 'date', req: true }
    ], { saldo: U.valorInput(cx.ancoraData ? num(cx.ancoraSaldo) : simular(cx, U.hoje()).saldo), data: U.hoje() }, f => {
      const saldo = U.parseValor(f.saldo);
      if (!(saldo >= 0)) { alert('Valor inválido.'); return false; }
      salvar(cx, { ancoraData: f.data, ancoraSaldo: saldo });
    }, cx.ancoraData ? { rotulo: '↩ Voltar à estimativa', fn: () => salvar(cx, { ancoraData: '', ancoraSaldo: 0 }) } : null, 'Atualizar');
  }

  // ---------- telas ----------
  const barra = (pct, cor = '#f4c53d') => `<div style="height:8px;border-radius:6px;background:var(--card2);overflow:hidden"><div style="height:100%;width:${Math.min(100, pct)}%;background:${cor}"></div></div>`;

  function lista(el) {
    const hoje = U.hoje(), cofres = Store.cofres.lista().slice().sort((a, b) => (a.concluida - b.concluida) || a.nome.localeCompare(b.nome));
    const calc = cofres.map(cx => ({ cx, s: simular(cx, hoje).saldo }));
    const viagem = typeof Viagens !== 'undefined' ? Viagens.saldoHoje() : 0;
    const total = calc.reduce((t, x) => t + x.s, 0) + viagem;
    el.innerHTML = `
      <div class="cards">
        <div class="card ok"><small>🐷 Guardado em tudo</small><strong>${U.brl(total)}</strong></div>
        <div class="card"><small>Caixinhas</small><strong>${cofres.length}</strong></div>
      </div>
      <div class="filtros"><button class="btn" id="c-novo">+ Nova caixinha</button></div>
      <div class="pend" id="c-viagem" role="button" tabindex="0"><div><b>🧳 Viagens</b><br><span class="sub">Caixinha e meta das viagens (aba própria)</span></div><div style="text-align:right"><b>${U.brl(viagem)}</b><br><span class="sub">abrir ›</span></div></div>
      ${cofres.length ? calc.map(({ cx, s }) => {
        const pct = cx.meta > 0 ? Math.round(s / cx.meta * 100) : 0;
        return `<div class="pend cofre" data-c="${cx.id}" role="button" tabindex="0" style="flex-direction:column;align-items:stretch;gap:8px;${cx.concluida ? 'opacity:.6' : ''}">
          <div style="display:flex;justify-content:space-between;gap:12px"><div><b>${U.esc(cx.icone || '🐷')} ${U.esc(cx.nome)}</b>${cx.concluida ? ' <span class="chip ok">concluída</span>' : ''}<br>
            <span class="sub">${cx.meta > 0 ? `Meta ${U.brl(cx.meta)}${cx.alvo ? ' · até ' + dm(cx.alvo) : ''}` : 'Sem meta de valor'}</span></div>
            <div style="text-align:right"><b>${U.brl(s)}</b>${cx.meta > 0 ? `<br><span class="sub">${pct}% da meta</span>` : ''}</div></div>
          ${cx.meta > 0 ? barra(pct) : ''}</div>`;
      }).join('') : '<div class="vazio">Crie uma caixinha para cada objetivo: celular, carro, formatura… 🐷</div>'}`;
    App.$('#c-novo').onclick = () => formCaixinha(null);
    App.$('#c-viagem').onclick = () => { location.hash = 'viagens'; };
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { location.hash = 'caixinhas/' + b.dataset.c; });
  }

  function detalhe(el, cx) {
    const hoje = U.hoje(), ag = simular(cx, hoje), meta = num(cx.meta), caixa = ag.saldo;
    const falta = Math.max(0, meta - caixa), pct = meta ? Math.min(100, Math.round(caixa / meta * 100)) : 0;
    let html = `
      <p><a href="#caixinhas" class="sub" id="c-voltar">‹ Todas as caixinhas</a></p>
      <div class="cards">
        <div class="card ok"><small>${U.esc(cx.icone || '🐷')} Na caixinha agora</small><strong>${U.brl(caixa)}</strong></div>
        <div class="card"><small>Colocado até hoje</small><strong>${U.brl(num(cx.saldoInicial) + ag.aportado)}</strong></div>
        <div class="card a"><small>Rendimento estimado</small><strong>${U.brl(ag.rendimento)}</strong></div>
        ${U.ids().map(k => faltaDe(cx, k) > 0 ? `<div class="card ${cls(k)}"><small>Falta colocar · ${U.esc(n(k))}</small><strong>${U.brl(faltaDe(cx, k))}</strong></div>` : '').join('')}
      </div>
      <p class="sub">Aporte padrão: ${U.ids().map(k => `<b>${U.esc(n(k))}</b> ${U.brl(num(cx['aporte' + k]))} (dia ${num(cx['dia' + k], 26)})`).join(' · ')}.
        ${num(cx.pct) > 0 ? `Rendendo ${String(cx.pct).replace('.', ',')}% do CDI (${(taxaAno(cx) * 100).toFixed(2).replace('.', ',')}% ao ano, bruto estimado).` : 'Sem rendimento.'}
        ${cx.ancoraData ? `Saldo ajustado pelo valor real de ${dm(cx.ancoraData)} (${U.brl(num(cx.ancoraSaldo))}).` : 'Valor estimado: confira com o app do banco e atualize.'}
        <button class="btn mini-b" id="c-real">Atualizar com o saldo real</button></p>`;

    if (meta > 0) {
      const bate = mesQueBate(cx);
      let porMes = '';
      if (cx.alvo && cx.alvo > hoje && falta > 0) {
        const [y1, m1] = U.mesAtual().split('-').map(Number), [y2, m2] = cx.alvo.slice(0, 7).split('-').map(Number), meses = Math.max(1, (y2 - y1) * 12 + (m2 - m1));
        const np = U.ids().length;
        porMes = `<div class="cards"><div class="card ok"><small>Colocar por mês (${np > 1 ? 'todos' : 'total'})</small><strong>${U.brl(Math.ceil(falta / meses))}</strong></div>${np > 1 ? `<div class="card a"><small>Por pessoa</small><strong>${U.brl(Math.ceil(falta / meses / np))}</strong></div>` : ''}<div class="card"><small>Meses até ${dm(cx.alvo)}</small><strong>${meses}</strong></div></div>`;
      }
      html += `
      <section class="bloco"><h2>🎯 Meta de ${U.brl(meta)}</h2>
        <div class="viagem-grade">
          <div class="viagem-graf">${rosca([{ v: Math.min(caixa, meta), cor: '#f4c53d' }, { v: falta, cor: '#e5533d' }])}<div class="viagem-pct"><b>${pct}%</b><span>da meta</span></div></div>
          <div>
            <div class="cmp-leg" style="flex-direction:column;align-items:flex-start;gap:6px;margin:0 0 10px">
              <span><i style="background:#f4c53d"></i>Já guardado: ${U.brl(Math.min(caixa, meta))}</span>
              <span><i style="background:#e5533d"></i>Falta juntar: <b>${U.brl(falta)}</b></span>
            </div>
          </div>
        </div>
        ${porMes}
        <div class="acerto">${falta === 0 ? 'Meta batida! 🎉' : bate ? `Mantendo os aportes, a meta é batida em ${U.mesNome(bate)}.${cx.alvo && bate > cx.alvo.slice(0, 7) ? ' Isso passa da data que vocês queriam.' : ''}` : 'Com os aportes de hoje a meta não é batida em 20 anos. Aumente o aporte.'}</div>
      </section>`;
    }

    const avs = (cx.avulsos || []).slice().sort((a, b) => a.data.localeCompare(b.data));
    html += `<section class="bloco"><h2>Depósitos avulsos</h2>
      <p class="sub">Para valores que não são o aporte mensal: o que já foi colocado ou o que ainda falta colocar. Os "a colocar" avisam no dia marcado.</p>
      <div class="filtros"><button class="btn" id="c-avulso">+ Depósito avulso</button></div>
      ${avs.length ? avs.map(a => `<div class="pend" style="cursor:default"><div><b>${U.esc(n(a.quem))} · ${U.brl(a.valor)}</b><br><span class="sub">${dm(a.data)}${a.feito ? '' : ' · avisa nesse dia'}</span></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">${a.feito ? '<span class="chip ok">✔ colocado</span>' : `<span class="chip ambos">⏳ a colocar</span><button class="btn mini-b" data-feito="${a.id}">Já coloquei</button>`}
        <button class="mini" data-ave="${a.id}" aria-label="Editar">✏️</button><button class="mini" data-avx="${a.id}" aria-label="Excluir">🗑</button></div></div>`).join('') : '<div class="vazio">Nenhum depósito avulso.</div>'}</section>`;

    const ultimo = U.mesSoma(U.mesAtual(), 3), linhas = [];
    for (let mm = cx.inicio || U.mesAtual(); mm <= ultimo; mm = U.mesSoma(mm, 1)) linhas.push(mm);
    html += `<section class="bloco"><h2>Aportes mês a mês</h2>
      <p class="sub">Por padrão entra o valor combinado no dia de cada um (fim de semana vira segunda-feira). Se alguém não conseguir colocar, ou depositar em outro dia, toque em ✏️ e ajuste o valor (0 = não colocou) e a data daquele mês.</p>
      <table><thead><tr><th>Mês</th>${U.ids().map(k => `<th class="v">${U.esc(n(k))}</th>`).join('')}<th class="v">Total</th><th></th></tr></thead><tbody>${linhas.map(mm => { const a = aporteMes(cx, mm); return `
        <tr><td>${U.mesNome(mm)}${a.alterado ? ' <span class="chip ambos">alterado</span>' : ''}</td>
        ${U.ids().map(k => `<td class="v">${U.brl(a.v[k])}<br><span class="sub">${dataCurta(a.d[k])}${a.v[k] > 0 && a.d[k] >= hoje && !a.f[k] ? ` · a cair <button class="btn mini-b" data-ok="${mm}|${k}">Já depositei</button>` : ''}</span></td>`).join('')}<td class="v">${U.brl(U.ids().reduce((s, k) => s + a.v[k], 0))}</td>
        <td><button class="mini" data-mes="${mm}" aria-label="Alterar aporte">✏️</button></td></tr>`; }).join('')}</tbody></table></section>
      <div class="filtros"><button class="btn sec" id="c-edit">Editar caixinha</button><button class="btn sec" id="c-fim">${cx.concluida ? 'Reabrir' : 'Marcar como concluída'}</button><button class="btn sec" id="c-del">Excluir</button></div>`;

    el.innerHTML = html;
    App.$('#c-real').onclick = () => formSaldoReal(cx);
    App.$('#c-edit').onclick = () => formCaixinha(cx);
    App.$('#c-fim').onclick = () => salvar(cx, { concluida: !cx.concluida });
    App.$('#c-del').onclick = () => { if (confirm(`Excluir a caixinha "${cx.nome}"?`)) { Store.cofres.del(cx.id); location.hash = 'caixinhas'; } };
    el.querySelectorAll('[data-mes]').forEach(b => b.onclick = () => formMes(cx, b.dataset.mes));
    el.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => {
      const [mm, k] = b.dataset.ok.split('|'), a = aporteMes(cx, mm), o = {};
      U.ids().forEach(i => { o[i] = a.v[i]; o['data' + i] = a.d[i]; o['feito' + i] = a.f[i]; });
      if (a.d[k] > hoje) o['data' + k] = hoje;
      o['feito' + k] = true;
      salvar(cx, { meses: { ...(cx.meses || {}), [mm]: o } });
    });
    App.$('#c-avulso').onclick = () => formAvulso(cx, null);
    el.querySelectorAll('[data-feito]').forEach(b => b.onclick = () => salvar(cx, { avulsos: cx.avulsos.map(a => a.id === b.dataset.feito ? { ...a, feito: true, feitoEm: U.hoje() } : a) }));
    el.querySelectorAll('[data-ave]').forEach(b => b.onclick = () => formAvulso(cx, cx.avulsos.find(a => a.id === b.dataset.ave)));
    el.querySelectorAll('[data-avx]').forEach(b => b.onclick = () => { if (confirm('Excluir este depósito?')) salvar(cx, { avulsos: cx.avulsos.filter(a => a.id !== b.dataset.avx) }); });
  }

  // usado pela aba Viagens (viagem paga com uma caixinha à parte)
  window.Caixinhas = {
    // lembrete no dia de cada depósito avulso ainda "a colocar", só para a pessoa que vai colocar
    avisosDoDia: (iso, quem) => !quem ? [] : Store.cofres.lista().flatMap(cx => (cx.avulsos || []).filter(a => !a.feito && a.quem === quem && a.data === iso).map(a => ({
      tipo: 'caixinha', urgente: false, titulo: `🐷 Hoje é dia de colocar na caixinha!`, texto: `${n(quem)}, coloque ${U.brl(a.valor)} na caixinha "${cx.nome}" hoje.` }))),
    // quanto ainda está marcado para colocar na caixinha (depósitos avulsos "a colocar"), por pessoa
    programado: id => {
      const c = Store.cofres.lista().find(x => x.id === id), r = { total: 0, data: {} };
      U.ids().forEach(k => { r[k] = 0; r.data[k] = ''; });
      (c && c.avulsos || []).forEach(a => { if (!a.feito && a.quem in r.data) { r[a.quem] += a.valor; r.total += a.valor; if (!r.data[a.quem] || a.data < r.data[a.quem]) r.data[a.quem] = a.data; } });
      return r;
    },
    ultimoDia: () => Store.cofres.lista().flatMap(cx => (cx.avulsos || []).filter(a => !a.feito).map(a => a.data)).reduce((u, d) => d > u ? d : u, ''),
    aporteTotal: id => { const c = Store.cofres.lista().find(x => x.id === id); return c ? U.ids().reduce((s, k) => s + num(c['aporte' + k]), 0) : 0; },
    nome: id => { const c = Store.cofres.lista().find(x => x.id === id); return c ? c.nome : null; },
    saldoEm: (id, fim) => { const c = Store.cofres.lista().find(x => x.id === id); return c ? simular(c, fim).saldo : 0; }
  };

  const subId = () => location.hash.slice(1).split('/')[1] || '';
  const atual = () => Store.cofres.lista().find(c => c.id === subId());

  App.registrar('caixinhas', el => { const cx = atual(); cx ? detalhe(el, cx) : lista(el); },
    () => { const cx = atual(); return cx ? { crumb: 'Planejamento › Caixinhas', titulo: `${cx.icone || '🐷'} ${cx.nome}`, sub: 'Quanto já tem, quanto falta e os aportes de cada mês.', cta: null }
      : { crumb: 'Planejamento › Caixinhas', titulo: 'Caixinhas', sub: 'Uma caixinha para cada objetivo: celular, carro, formatura…', cta: { rotulo: 'Nova caixinha', fn: () => formCaixinha(null) } }; });
})();
