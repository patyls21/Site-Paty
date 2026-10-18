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
  const aporteMes = (cx, m) => {
    const o = (cx.meses || {})[m];
    const dA = (o && o.dataA) || diaUtil(m, num(cx.diaA, 26)), dB = (o && o.dataB) || diaUtil(m, num(cx.diaB, 26));
    return o ? { A: o.A, B: o.B, dA, dB, alterado: true } : { A: num(cx.aporteA), B: num(cx.aporteB), dA, dB, alterado: false };
  };
  // saldo estimado em uma data: cada depósito entra na data dele e rende todo dia (bruto, antes do IR).
  // Com saldo real informado (ancora), recomeça dele e só conta os depósitos depois daquela data.
  function simular(cx, fim) {
    const td = taxaDia(cx), ini = cx.inicio || U.mesAtual(), saldoIni = num(cx.saldoInicial);
    const ancora = cx.ancoraData && cx.ancoraData <= fim ? cx.ancoraData : '';
    const dep = []; let aportado = 0;
    for (let m = ini; m + '-01' <= fim; m = U.mesSoma(m, 1)) {
      const a = aporteMes(cx, m);
      [[a.dA, a.A], [a.dB, a.B]].forEach(([d, v]) => { if (v > 0 && d <= fim) { aportado += v; dep.push({ d, v }); } });
    }
    // depósitos avulsos já feitos entram na data em que foram colocados (os "programados" só contam quando marcados como feitos)
    (cx.avulsos || []).forEach(a => { const d = a.feito ? (a.feitoEm || a.data) : ''; if (d && d <= fim) { aportado += a.valor; dep.push({ d, v: a.valor }); } });
    dep.sort((x, y) => x.d.localeCompare(y.d));
    let bal = ancora ? num(cx.ancoraSaldo) : saldoIni, ult = ancora || ini + '-01';
    const render = ate => { const k = U.diasEntre(ult, ate); if (k > 0) { bal *= Math.pow(1 + td, k); ult = ate; } };
    dep.forEach(x => { if (ancora && x.d <= ancora) return; render(x.d); bal += x.v; });
    render(fim);
    const saldo = Math.round(bal);
    return { saldo, aportado, rendimento: saldo - saldoIni - aportado };
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
    const novo = !cx;
    const v = novo ? { icone: '🐷', aporteA: 0, aporteB: 0, diaA: 26, diaB: 26, inicio: U.mesAtual(), saldoInicial: 0, pct: Store.config.pctCdi, meta: 0, alvo: '' } : cx;
    App.form(novo ? 'Nova caixinha' : 'Editar caixinha', [
      { k: 'nome', rotulo: 'Nome (ex.: Celular novo, Carro, Formatura)', req: true },
      { k: 'icone', rotulo: 'Ícone', tipo: 'select', opcoes: ICONES.map(([i, t]) => [i, `${i} ${t}`]) },
      { k: 'meta', rotulo: 'Meta de valor (R$) — vazio se não tiver', inputmode: 'decimal' },
      { k: 'alvo', rotulo: 'Até quando quer juntar (opcional)', tipo: 'date' },
      { k: 'aporteA', rotulo: `Aporte mensal de ${n('A')} (R$)`, inputmode: 'decimal', req: true },
      { k: 'diaA', rotulo: `Dia do depósito de ${n('A')} (1 a 31)`, tipo: 'number', req: true, dica: 'Se cair no fim de semana, vale a segunda-feira.' },
      { k: 'aporteB', rotulo: `Aporte mensal de ${n('B')} (R$)`, inputmode: 'decimal', req: true },
      { k: 'diaB', rotulo: `Dia do depósito de ${n('B')} (1 a 31)`, tipo: 'number', req: true, dica: 'Em um mês diferente, ajuste a data na linha do mês (✏️).' },
      { k: 'inicio', rotulo: 'Mês em que começou a contar', tipo: 'month', req: true },
      { k: 'saldoInicial', rotulo: 'Quanto já tinha nesse mês, antes do aporte (R$)', inputmode: 'decimal', req: true },
      { k: 'pct', rotulo: 'Rende quantos % do CDI? (0 se não rende)', inputmode: 'decimal', req: true, dica: `CDI usado: ${String(Store.config.cdiAnual).replace('.', ',')}% ao ano (muda na aba Viagens › Alterar).` }
    ], {
      ...v, meta: v.meta ? U.valorInput(v.meta) : '', aporteA: U.valorInput(num(v.aporteA)), aporteB: U.valorInput(num(v.aporteB)),
      diaA: String(num(v.diaA, 26)), diaB: String(num(v.diaB, 26)), saldoInicial: U.valorInput(num(v.saldoInicial)), pct: String(v.pct).replace('.', ',')
    }, f => {
      const meta = f.meta.trim() ? U.parseValor(f.meta) : 0, A = U.parseValor(f.aporteA), B = U.parseValor(f.aporteB), saldo = U.parseValor(f.saldoInicial);
      const pct = Number(String(f.pct).replace(',', '.'));
      if (![meta, A, B, saldo].every(x => x >= 0) || !(pct >= 0) || !/^\d{4}-\d{2}$/.test(f.inicio)) { alert('Confira os valores.'); return false; }
      const dia = x => Math.min(31, Math.max(1, parseInt(x, 10) || 26));
      const o = { nome: f.nome.trim(), icone: f.icone, meta, alvo: f.alvo || '', aporteA: A, aporteB: B, diaA: dia(f.diaA), diaB: dia(f.diaB), inicio: f.inicio, saldoInicial: saldo, pct };
      if (novo) { const c = Store.cofres.add({ ...o, meses: {}, ancoraData: '', ancoraSaldo: 0, concluida: false }); location.hash = 'caixinhas/' + c.id; }
      else salvar(cx, o);
    });
  }

  function formMes(cx, m) {
    const a = aporteMes(cx, m);
    App.form('Aporte de ' + U.mesNome(m), [
      { k: 'A', rotulo: `${n('A')} coloca (R$) — 0 se não colocar`, inputmode: 'decimal', req: true },
      { k: 'dataA', rotulo: `Data do depósito de ${n('A')}`, tipo: 'date', req: true },
      { k: 'B', rotulo: `${n('B')} coloca (R$) — 0 se não colocar`, inputmode: 'decimal', req: true },
      { k: 'dataB', rotulo: `Data do depósito de ${n('B')}`, tipo: 'date', req: true }
    ], { A: U.valorInput(a.A), B: U.valorInput(a.B), dataA: a.dA, dataB: a.dB }, f => {
      const A = U.parseValor(f.A), B = U.parseValor(f.B);
      if (!(A >= 0) || !(B >= 0)) { alert('Valor inválido.'); return false; }
      salvar(cx, { meses: { ...(cx.meses || {}), [m]: { A, B, dataA: f.dataA, dataB: f.dataB } } });
    }, a.alterado ? { rotulo: '↩ Voltar ao padrão', fn: () => { const meses = { ...cx.meses }; delete meses[m]; salvar(cx, { meses }); } } : null);
  }

  // depósito avulso: um valor só, de uma pessoa, numa data (já colocado ou ainda por colocar, com aviso no dia)
  const faltaDe = (cx, k) => (cx.avulsos || []).filter(a => !a.feito && a.quem === k).reduce((s, a) => s + a.valor, 0);
  function formAvulso(cx, av) {
    App.form(av ? 'Editar depósito avulso' : 'Depósito avulso', [
      { k: 'quem', rotulo: 'Quem coloca', tipo: 'select', opcoes: [['A', n('A')], ['B', n('B')]] },
      { k: 'valor', rotulo: 'Valor (R$)', inputmode: 'decimal', req: true },
      { k: 'data', rotulo: 'Data (em que colocou ou em que vai colocar)', tipo: 'date', req: true },
      { k: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: [['prog', 'Ainda vou colocar (avisar no dia)'], ['feito', 'Já coloquei']] }
    ], av ? { quem: av.quem, valor: U.valorInput(av.valor), data: av.data, situacao: av.feito ? 'feito' : 'prog' } : { quem: App.eu() || 'A', data: U.hoje(), situacao: 'prog' }, f => {
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
        ${['A', 'B'].map(k => faltaDe(cx, k) > 0 ? `<div class="card ${k === 'A' ? 'a' : 'b'}"><small>Falta colocar · ${U.esc(n(k))}</small><strong>${U.brl(faltaDe(cx, k))}</strong></div>` : '').join('')}
      </div>
      <p class="sub">Aporte padrão: <b>${U.esc(n('A'))}</b> ${U.brl(num(cx.aporteA))} (dia ${num(cx.diaA, 26)}) · <b>${U.esc(n('B'))}</b> ${U.brl(num(cx.aporteB))} (dia ${num(cx.diaB, 26)}).
        ${num(cx.pct) > 0 ? `Rendendo ${String(cx.pct).replace('.', ',')}% do CDI (${(taxaAno(cx) * 100).toFixed(2).replace('.', ',')}% ao ano, bruto estimado).` : 'Sem rendimento.'}
        ${cx.ancoraData ? `Saldo ajustado pelo valor real de ${dm(cx.ancoraData)} (${U.brl(num(cx.ancoraSaldo))}).` : 'Valor estimado: confira com o app do banco e atualize.'}
        <button class="btn mini-b" id="c-real">Atualizar com o saldo real</button></p>`;

    if (meta > 0) {
      const bate = mesQueBate(cx);
      let porMes = '';
      if (cx.alvo && cx.alvo > hoje && falta > 0) {
        const [y1, m1] = U.mesAtual().split('-').map(Number), [y2, m2] = cx.alvo.slice(0, 7).split('-').map(Number), meses = Math.max(1, (y2 - y1) * 12 + (m2 - m1));
        porMes = `<div class="cards"><div class="card ok"><small>Colocar por mês (casal)</small><strong>${U.brl(Math.ceil(falta / meses))}</strong></div><div class="card a"><small>Por pessoa</small><strong>${U.brl(Math.ceil(falta / meses / 2))}</strong></div><div class="card"><small>Meses até ${dm(cx.alvo)}</small><strong>${meses}</strong></div></div>`;
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
      <table><thead><tr><th>Mês</th><th class="v">${U.esc(n('A'))}</th><th class="v">${U.esc(n('B'))}</th><th class="v">Total</th><th></th></tr></thead><tbody>${linhas.map(mm => { const a = aporteMes(cx, mm); return `
        <tr><td>${U.mesNome(mm)}${a.alterado ? ' <span class="chip ambos">alterado</span>' : ''}</td>
        <td class="v">${U.brl(a.A)}<br><span class="sub">${dataCurta(a.dA)}${a.A > 0 && a.dA > hoje ? ' · a cair' : ''}</span></td>
        <td class="v">${U.brl(a.B)}<br><span class="sub">${dataCurta(a.dB)}${a.B > 0 && a.dB > hoje ? ' · a cair' : ''}</span></td><td class="v">${U.brl(a.A + a.B)}</td>
        <td><button class="mini" data-mes="${mm}" aria-label="Alterar aporte">✏️</button></td></tr>`; }).join('')}</tbody></table></section>
      <div class="filtros"><button class="btn sec" id="c-edit">Editar caixinha</button><button class="btn sec" id="c-fim">${cx.concluida ? 'Reabrir' : 'Marcar como concluída'}</button><button class="btn sec" id="c-del">Excluir</button></div>`;

    el.innerHTML = html;
    App.$('#c-real').onclick = () => formSaldoReal(cx);
    App.$('#c-edit').onclick = () => formCaixinha(cx);
    App.$('#c-fim').onclick = () => salvar(cx, { concluida: !cx.concluida });
    App.$('#c-del').onclick = () => { if (confirm(`Excluir a caixinha "${cx.nome}"?`)) { Store.cofres.del(cx.id); location.hash = 'caixinhas'; } };
    el.querySelectorAll('[data-mes]').forEach(b => b.onclick = () => formMes(cx, b.dataset.mes));
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
      const c = Store.cofres.lista().find(x => x.id === id), r = { A: 0, B: 0, total: 0, data: { A: '', B: '' } };
      (c && c.avulsos || []).forEach(a => { if (!a.feito) { r[a.quem] += a.valor; r.total += a.valor; if (!r.data[a.quem] || a.data < r.data[a.quem]) r.data[a.quem] = a.data; } });
      return r;
    },
    ultimoDia: () => Store.cofres.lista().flatMap(cx => (cx.avulsos || []).filter(a => !a.feito).map(a => a.data)).reduce((u, d) => d > u ? d : u, ''),
    nome: id => { const c = Store.cofres.lista().find(x => x.id === id); return c ? c.nome : null; },
    saldoEm: (id, fim) => { const c = Store.cofres.lista().find(x => x.id === id); return c ? simular(c, fim).saldo : 0; }
  };

  const subId = () => location.hash.slice(1).split('/')[1] || '';
  const atual = () => Store.cofres.lista().find(c => c.id === subId());

  App.registrar('caixinhas', el => { const cx = atual(); cx ? detalhe(el, cx) : lista(el); },
    () => { const cx = atual(); return cx ? { crumb: 'Planejamento › Caixinhas', titulo: `${cx.icone || '🐷'} ${cx.nome}`, sub: 'Quanto já tem, quanto falta e os aportes de cada mês.', cta: null }
      : { crumb: 'Planejamento › Caixinhas', titulo: 'Caixinhas', sub: 'Uma caixinha para cada objetivo: celular, carro, formatura…', cta: { rotulo: 'Nova caixinha', fn: () => formCaixinha(null) } }; });
})();
