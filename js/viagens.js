// Aba Viagens: caixinha mensal (com rendimento em % do CDI) + meta da viagem com gastos previstos e já pagos.
(() => {
  const C = () => Store.config;
  const num = (v, pad = 0) => Number.isFinite(Number(v)) ? Number(v) : pad;
  const n = k => App.nome(k);
  const cls = k => U.ids().indexOf(k) === 0 ? 'a' : U.ids().indexOf(k) === 1 ? 'b' : '';
  // por pessoa: aporte e dia do depósito ficam em chaves viagemAporteA / viagemDiaA, viagemAporteB… (uma por id)
  const zerado = () => { const r = { total: 0, data: {} }; U.ids().forEach(k => { r[k] = 0; r.data[k] = ''; }); return r; };

  // ---------- caixinha ----------
  // mês em que começa a contar: o configurado, senão o primeiro mês com aporte editado, senão o atual
  const inicio = () => C().viagemInicio || Store.caixinha.lista().map(x => x.mes).sort()[0] || U.mesAtual();
  const isoDe = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // dia do depósito no mês; sábado/domingo passam para a segunda-feira (feriados não são considerados)
  const diaUtil = (m, dia) => {
    const [y, mo] = m.split('-').map(Number), d = new Date(y, mo - 1, Math.min(Math.max(1, dia), new Date(y, mo, 0).getDate()));
    if (d.getDay() === 6) d.setDate(d.getDate() + 2); else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return isoDe(d);
  };
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const dataCurta = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)} (${SEM[new Date(iso + 'T12:00:00').getDay()]})`;
  // aporte de cada um no mês: valor e data (padrão: o combinado; ou o que foi alterado naquele mês)
  // retorna { v: { A: valor, … }, d: { A: data, … }, alterado, id }
  const aporteMes = m => {
    const o = Store.caixinha.lista().find(x => x.mes === m), c = C(), v = {}, d = {};
    U.ids().forEach(k => {
      d[k] = (o && o['data' + k]) || diaUtil(m, num(c['viagemDia' + k], 26));
      v[k] = o ? num(o[k]) : num(c['viagemAporte' + k]);
    });
    return o ? { v, d, alterado: true, id: o.id } : { v, d, alterado: false };
  };
  // 120% do CDI: taxa anual efetiva a partir do CDI (252 dias úteis), depois rendimento por dia corrido
  const taxaAno = () => {
    const cdi = num(C().cdiAnual) / 100, p = num(C().pctCdi) / 100, d = Math.pow(1 + cdi, 1 / 252) - 1;
    return Math.pow(1 + p * d, 252) - 1;
  };
  const taxaDia = () => Math.pow(1 + taxaAno(), 1 / 365) - 1;

  // saldo estimado em uma data: cada depósito entra na data dele e rende todo dia (valores brutos, antes do IR).
  // Se foi informado o saldo real (ancora), o cálculo recomeça dele e só conta os depósitos depois daquela data.
  function simular(fim) {
    const ini = inicio(), td = taxaDia(), c = C(), saldoIni = num(c.viagemSaldoInicial);
    const ancora = c.viagemAncoraData && c.viagemAncoraData <= fim ? c.viagemAncoraData : '';
    const dep = []; let aportado = 0;
    for (let m = ini; m + '-01' <= fim; m = U.mesSoma(m, 1)) {
      const a = aporteMes(m);
      U.ids().forEach(k => { const d = a.d[k], v = a.v[k]; if (v > 0 && d <= fim) { aportado += v; dep.push({ d, v }); } });
    }
    dep.sort((x, y) => x.d.localeCompare(y.d));
    let bal = ancora ? num(c.viagemAncoraSaldo) : saldoIni, ult = ancora || ini + '-01';
    const render = ate => { const n = U.diasEntre(ult, ate); if (n > 0) { bal *= Math.pow(1 + td, n); ult = ate; } };
    dep.forEach(x => { if (ancora && x.d <= ancora) return; render(x.d); bal += x.v; });
    render(fim);
    const saldo = Math.round(bal);
    return { saldo, aportado, rendimento: saldo - saldoIni - aportado };
  }

  // ---------- viagem (meta) ----------
  const fim = m => m.fim || m.data; // viagens antigas sem check-out
  const noites = m => Math.max(0, U.diasEntre(m.data, fim(m)));
  const totalItem = i => Math.round(num(i.qtd, 1) * num(i.unit));
  const metaAtiva = () => {
    const ls = Store.metas.lista().slice().sort((a, b) => a.data.localeCompare(b.data));
    return ls.find(x => x.id === C().viagemMetaAtiva) || ls.find(x => x.data >= U.hoje()) || ls[0] || null;
  };
  // de onde sai o dinheiro da viagem: a caixinha mensal das viagens (padrão) ou uma caixinha da aba Caixinhas ("viagem por fora")
  const cofreDe = m => m.fonte && typeof Caixinhas !== 'undefined' ? Caixinhas.nome(m.fonte) : null;
  const saldoViagem = (m, iso) => m.fonte && typeof Caixinhas !== 'undefined' && Caixinhas.nome(m.fonte) !== null ? Caixinhas.saldoEm(m.fonte, iso) : simular(iso).saldo;
  // fração que sai da caixinha: o valor todo ou só a metade (cada um paga a sua parte)
  const fator = m => m.fracao === 'metade' ? 0.5 : 1;
  const progDe = m => m.fonte && cofreDe(m) !== null ? Caixinhas.programado(m.fonte) : zerado();
  // Meta total (opcional, definida por vocês): os gastos lançados ficam DENTRO dela. Se passarem, a meta sobe junto com os gastos.
  // Sem meta definida, a meta é simplesmente a soma dos gastos previstos.
  const totais = m => {
    const itens = m.itens || [], f = fator(m);
    const soma = itens.reduce((s, i) => s + totalItem(i), 0), metaDef = Math.max(0, num(m.metaTotal));
    const total = Math.round(Math.max(metaDef, soma) * f), pago = Math.round(itens.filter(i => i.pago).reduce((s, i) => s + totalItem(i), 0) * f);
    return { total, pago, faltaPagar: total - pago, soma: Math.round(soma * f), metaDef: Math.round(metaDef * f) };
  };
  const mesesAte = m => { const [y1, m1] = U.mesAtual().split('-').map(Number), [y2, m2] = m.data.slice(0, 7).split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };

  // ---------- formulários ----------
  function formCaixinha() {
    const c = C(), ids = U.ids();
    const vals = { ini: inicio(), saldo: U.valorInput(num(c.viagemSaldoInicial)), pct: String(c.pctCdi).replace('.', ','), cdi: String(c.cdiAnual).replace('.', ',') };
    ids.forEach(k => { vals['ap' + k] = U.valorInput(num(c['viagemAporte' + k])); vals['dia' + k] = String(num(c['viagemDia' + k], 26)); });
    App.form('Caixinha: aporte e rendimento', [
      ...ids.flatMap(k => [
        { k: 'ap' + k, rotulo: `Aporte mensal padrão de ${n(k)} (R$)`, inputmode: 'decimal', req: true },
        { k: 'dia' + k, rotulo: `Dia do depósito de ${n(k)} (1 a 31)`, tipo: 'number', req: true, dica: 'Se cair no fim de semana, vale a segunda-feira. Em um mês diferente, ajuste a data na linha do mês (✏️).' }]),
      { k: 'ini', rotulo: 'Mês em que começou a contar', tipo: 'month', req: true, dica: 'Os aportes padrão valem a partir desse mês.' },
      { k: 'saldo', rotulo: 'Quanto já tinha na caixinha nesse mês, antes do aporte (R$)', inputmode: 'decimal', req: true },
      { k: 'pct', rotulo: 'Rende quantos % do CDI?', inputmode: 'decimal', req: true },
      { k: 'cdi', rotulo: 'CDI atual (% ao ano)', inputmode: 'decimal', req: true, dica: 'Confira o valor no site do Banco Central e atualize de vez em quando.' }
    ], vals, f => {
      const saldo = U.parseValor(f.saldo), aps = ids.map(k => U.parseValor(f['ap' + k]));
      const pct = Number(String(f.pct).replace(',', '.')), cdi = Number(String(f.cdi).replace(',', '.'));
      if (![...aps, saldo].every(v => v >= 0) || !(pct >= 0) || !(cdi >= 0) || !/^\d{4}-\d{2}$/.test(f.ini)) { alert('Confira os valores.'); return false; }
      const dia = v => Math.min(31, Math.max(1, parseInt(v, 10) || 26)), novo = {};
      ids.forEach((k, i) => { novo['viagemAporte' + k] = aps[i]; novo['viagemDia' + k] = dia(f['dia' + k]); });
      Store.setConfig({ ...novo, viagemSaldoInicial: saldo, viagemInicio: f.ini, pctCdi: pct, cdiAnual: cdi });
    });
  }

  // saldo real mostrado no app do banco: o cálculo recomeça dele (corrige a diferença da estimativa)
  function formSaldoReal() {
    const c = C();
    App.form('Atualizar com o saldo real', [
      { k: 'saldo', rotulo: 'Saldo que aparece no app do banco agora (R$)', inputmode: 'decimal', req: true, dica: 'Depois disso o site só soma os depósitos novos e o rendimento a partir daqui.' },
      { k: 'data', rotulo: 'Data desse saldo', tipo: 'date', req: true }
    ], { saldo: c.viagemAncoraData ? U.valorInput(num(c.viagemAncoraSaldo)) : U.valorInput(simular(U.hoje()).saldo), data: U.hoje() }, f => {
      const saldo = U.parseValor(f.saldo);
      if (!(saldo >= 0)) { alert('Valor inválido.'); return false; }
      Store.setConfig({ viagemAncoraData: f.data, viagemAncoraSaldo: saldo });
    }, c.viagemAncoraData ? { rotulo: '↩ Voltar à estimativa', fn: () => Store.setConfig({ viagemAncoraData: '', viagemAncoraSaldo: 0 }) } : null, 'Atualizar');
  }

  function formMes(m) {
    const a = aporteMes(m), ids = U.ids(), vals = {};
    ids.forEach(k => { vals[k] = U.valorInput(a.v[k]); vals['data' + k] = a.d[k]; });
    App.form('Aporte de ' + U.mesNome(m), ids.flatMap(k => [
      { k, rotulo: `${n(k)} coloca (R$) — 0 se não colocar`, inputmode: 'decimal', req: true },
      { k: 'data' + k, rotulo: `Data do depósito de ${n(k)}`, tipo: 'date', req: true }
    ]), vals, f => {
      const o = { mes: m };
      for (const k of ids) { const v = U.parseValor(f[k]); if (!(v >= 0)) { alert('Valor inválido.'); return false; } o[k] = v; o['data' + k] = f['data' + k]; }
      a.id ? Store.caixinha.set(a.id, o) : Store.caixinha.add(o);
    }, a.alterado ? { rotulo: '↩ Voltar ao padrão', fn: () => Store.caixinha.del(a.id) } : null);
  }

  function formViagem(v) {
    App.form(v ? 'Editar viagem' : 'Nova viagem', [
      { k: 'nome', rotulo: 'Nome (ex.: Rio Quente + Laqua)', req: true },
      { k: 'data', rotulo: 'Check-in (ida)', tipo: 'date', req: true },
      { k: 'fim', rotulo: 'Check-out (volta)', tipo: 'date', req: true, dica: 'Os avisos de "falta pouco" vão de 1 mês antes até o check-out.' },
      { k: 'fonte', rotulo: 'Pago com qual caixinha?', tipo: 'select', opcoes: [['', 'A caixinha mensal das viagens'], ...Store.cofres.lista().map(c => [c.id, `${c.icone || '🐷'} ${c.nome} (caixinha à parte)`])],
        dica: 'Para uma viagem "por fora", crie a caixinha na aba Caixinhas e escolha ela aqui.' },
      { k: 'fracao', rotulo: 'Quanto desta viagem sai dessa caixinha?', tipo: 'select', opcoes: [['tudo', 'O valor todo'], ['metade', 'Só metade (cada um paga a sua parte)']] },
      { k: 'metaTotal', rotulo: 'Meta total da viagem (R$) — opcional', inputmode: 'decimal', dica: 'Os gastos que você lançar ficam dentro dessa meta. Se passarem dela, a meta sobe junto. Dá para mudar quando quiser.' }
    ], v ? { ...v, fim: fim(v), fonte: v.fonte || '', fracao: v.fracao || 'tudo', metaTotal: num(v.metaTotal) > 0 ? U.valorInput(num(v.metaTotal)) : '' } : { data: U.hoje(), fim: U.hoje(), fonte: '', fracao: 'tudo', metaTotal: '' }, f => {
      if (f.fim < f.data) { alert('O check-out não pode ser antes do check-in.'); return false; }
      const metaTotal = (f.metaTotal || '').trim() ? U.parseValor(f.metaTotal) : 0;
      if (!(metaTotal >= 0)) { alert('Meta inválida.'); return false; }
      const o = { nome: f.nome.trim(), data: f.data, fim: f.fim, fonte: f.fonte, fracao: f.fracao, metaTotal };
      if (v) Store.metas.set(v.id, { ...v, ...o });
      else { const n = Store.metas.add({ ...o, itens: [] }); Store.setConfig({ viagemMetaAtiva: n.id }); }
    });
  }

  // só a meta total, para mudar rápido (vazio = sem meta definida, vale a soma dos gastos)
  function formMeta(m) {
    const t = totais(m);
    App.form('Meta total da viagem', [
      { k: 'metaTotal', rotulo: 'Meta total (R$) — vazio se não tiver', inputmode: 'decimal', dica: `Gastos lançados até agora: ${U.brl(t.soma)}. Se eles passarem da meta, a meta sobe junto.` }
    ], { metaTotal: num(m.metaTotal) > 0 ? U.valorInput(num(m.metaTotal)) : '' }, f => {
      const metaTotal = (f.metaTotal || '').trim() ? U.parseValor(f.metaTotal) : 0;
      if (!(metaTotal >= 0)) { alert('Meta inválida.'); return false; }
      Store.metas.set(m.id, { ...m, metaTotal });
    }, null, 'Salvar meta');
  }

  function formItem(m, it) {
    App.form(it ? 'Editar gasto previsto' : 'Gasto previsto', [
      { k: 'desc', rotulo: 'O que é (ex.: Hospedagem, Combustível, Alimentação)', req: true },
      { k: 'qtd', rotulo: 'Quantidade (ex.: nº de diárias)', inputmode: 'decimal', req: true, dica: `Esta viagem tem ${noites(m)} noite(s).` },
      { k: 'unit', rotulo: 'Valor de cada (R$)', inputmode: 'decimal', req: true },
      { k: 'pago', rotulo: 'Já foi pago?', tipo: 'select', opcoes: [['nao', 'Ainda não'], ['sim', 'Sim, já paguei']] }
    ], it ? { desc: it.desc, qtd: String(it.qtd).replace('.', ','), unit: U.valorInput(it.unit), pago: it.pago ? 'sim' : 'nao' } : { qtd: '1', pago: 'nao' }, f => {
      const qtd = Number(String(f.qtd).replace(',', '.')), unit = U.parseValor(f.unit);
      if (!(qtd > 0) || !(unit >= 0)) { alert('Quantidade ou valor inválido.'); return false; }
      const o = { id: it ? it.id : U.id(), desc: f.desc.trim(), qtd, unit, pago: f.pago === 'sim' };
      const itens = it ? m.itens.map(x => x.id === it.id ? o : x) : [...(m.itens || []), o];
      Store.metas.set(m.id, { ...m, itens });
    });
  }

  // ---------- gráfico: pago / na caixinha / falta ----------
  function rosca(partes) {
    const R = 52, L = 2 * Math.PI * R, tot = partes.reduce((s, p) => s + p.v, 0) || 1;
    let off = 0;
    const arcos = partes.filter(p => p.v > 0).map(p => {
      const len = L * p.v / tot, s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${p.cor}" stroke-width="22" stroke-dasharray="${len} ${L - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
      off += len; return s;
    }).join('');
    return `<svg viewBox="0 0 140 140" width="170" height="170" role="img" aria-label="Quanto falta para a meta"><circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--card2)" stroke-width="22"/>${arcos}</svg>`;
  }

  const MESES_FUTUROS = 3;

  App.registrar('viagens', el => {
    const hoje = U.hoje(), c = C(), agora = simular(hoje), m = metaAtiva();
    const todas = Store.metas.lista().slice().sort((a, b) => a.data.localeCompare(b.data));
    let html = `
      <div class="cards">
        <div class="card ok"><small>🐷 Na caixinha agora</small><strong>${U.brl(agora.saldo)}</strong></div>
        <div class="card"><small>Colocado até hoje</small><strong>${U.brl(num(c.viagemSaldoInicial) + agora.aportado)}</strong></div>
        <div class="card a"><small>Rendimento estimado</small><strong>${U.brl(agora.rendimento)}</strong></div>
        <div class="card b"><small>Rende por mês (aprox.)</small><strong>${U.brl(Math.round(agora.saldo * (Math.pow(1 + taxaDia(), 30) - 1)))}</strong></div>
      </div>
      <p class="sub">Aporte padrão: ${U.ids().map(k => `<b>${U.esc(n(k))}</b> ${U.brl(num(c['viagemAporte' + k]))}`).join(' · ')} por mês. Rendendo ${String(c.pctCdi).replace('.', ',')}% do CDI (${(taxaAno() * 100).toFixed(2).replace('.', ',')}% ao ano, valor bruto estimado).
        ${c.viagemAncoraData ? `Saldo ajustado pelo valor real de ${U.dataBR(c.viagemAncoraData)} (${U.brl(num(c.viagemAncoraSaldo))}).` : 'Valor estimado: confira com o app do banco e atualize.'}
        <button class="btn sec mini-b" id="v-cfg">Alterar</button> <button class="btn mini-b" id="v-real">Atualizar com o saldo real</button></p>`;

    if (m) {
      // caixinha à parte: o que já está marcado para colocar (depósitos avulsos "a colocar") conta como coberto
      const t = totais(m), caixa = saldoViagem(m, hoje), prog = progDe(m), naCaixa = Math.min(caixa, t.faltaPagar);
      const marcado = Math.min(prog.total, Math.max(0, t.faltaPagar - naCaixa)), falta = Math.max(0, t.faltaPagar - caixa - prog.total);
      const meses = mesesAte(m), porMes = falta / Math.max(1, meses);
      // se só algumas pessoas já têm depósito marcado, o que sobra para juntar é de quem não tem (dividido entre elas, e a divisão por mês vale só para elas)
      const ids = U.ids(), resto = {}; ids.forEach(k => resto[k] = 0);
      if (falta > 0 && prog.total > 0) {
        const sem = ids.filter(k => !(prog[k] > 0));
        if (sem.length && sem.length < ids.length) sem.forEach(k => resto[k] = falta / sem.length);
      }
      const soUm = ids.some(k => resto[k] > 0);
      const proj = saldoViagem(m, m.data) + prog.total, sobra = proj - t.faltaPagar;
      const pct = t.total ? Math.round((t.pago + naCaixa) / t.total * 100) : 0;
      // acompanhamento: gastos lançados dentro da meta definida (se passar, a meta sobe junto)
      const acomp = !t.metaDef
        ? (t.soma ? `<p class="sub" style="margin:0 0 10px">Gastos lançados: <b>${U.brl(t.soma)}</b> (sem meta definida, a meta acompanha os gastos). Para ver quanto ainda cabe, toque em <b>Alterar meta</b>.</p>` : '')
        : t.soma <= t.metaDef
          ? App.barra('Gastos lançados × meta', [{ rotulo: 'Lançado', valor: t.soma, cor: '#f4c53d' }, { rotulo: 'Ainda cabe', valor: t.metaDef - t.soma, cor: '#6b5b88' }])
            + `<p class="sub" style="margin:6px 0 10px">Lançado <b>${U.brl(t.soma)}</b> de <b>${U.brl(t.metaDef)}</b> da meta · ainda cabe <b>${U.brl(t.metaDef - t.soma)}</b>.</p>`
          : App.barra('Gastos lançados × meta', [{ rotulo: 'Dentro da meta', valor: t.metaDef, cor: '#f4c53d' }, { rotulo: 'Acima da meta', valor: t.soma - t.metaDef, cor: '#e5533d' }])
            + `<p class="sub" style="margin:6px 0 10px"><b>Passou ${U.brl(t.soma - t.metaDef)}</b> da meta definida (${U.brl(t.metaDef)}). A meta subiu para <b>${U.brl(t.soma)}</b>.</p>`;
      html += `
      <section class="bloco"><h2>🧳 ${U.esc(m.nome)}</h2>
        <p class="sub" style="margin:-4px 0 12px">Check-in <b>${U.dataBR(m.data)}</b> · check-out <b>${U.dataBR(fim(m))}</b> · ${noites(m)} noite(s)<br>Paga com: <b>${cofreDe(m) !== null ? U.esc(cofreDe(m)) + ' (caixinha à parte)' : 'a caixinha mensal das viagens'}</b>${m.fracao === 'metade' ? ' · só a sua metade' : ''}</p>
        <div class="viagem-grade">
          <div class="viagem-graf">${rosca([{ v: t.pago, cor: '#2fb872' }, { v: naCaixa, cor: '#f4c53d' }, { v: marcado, cor: '#5b9bd5' }, { v: falta, cor: '#e5533d' }])}
            <div class="viagem-pct"><b>${pct}%</b><span>da meta</span></div></div>
          <div>
            <div class="cmp-leg" style="flex-direction:column;align-items:flex-start;gap:6px;margin:0 0 10px">
              <span><i style="background:#2fb872"></i>Já pago: ${U.brl(t.pago)}</span>
              <span><i style="background:#f4c53d"></i>Na caixinha (conta para a meta): ${U.brl(naCaixa)}</span>
              ${marcado > 0 ? `<span><i style="background:#5b9bd5"></i>Marcado para colocar: ${U.brl(marcado)}</span>` : ''}
              <span><i style="background:#e5533d"></i>Falta juntar: <b>${U.brl(falta)}</b></span>
            </div>
            <div class="cards" style="margin:0">
              <div class="card"><small>Meta total</small><strong>${U.brl(t.total)}</strong></div>
              <div class="card"><small>Gastos lançados</small><strong>${U.brl(t.soma)}</strong></div>
              <div class="card"><small>Falta pagar</small><strong>${U.brl(t.faltaPagar)}</strong></div>
              <div class="card"><small>Meses até a viagem</small><strong>${Math.max(0, meses)}</strong></div>
            </div>
          </div>
        </div>
        <div class="cards">
          ${soUm || (falta === 0 && prog.total > 0) ? '' : `<div class="card ok"><small>Colocar por mês (${ids.length > 1 ? 'todos' : 'total'})</small><strong>${U.brl(Math.ceil(porMes))}</strong></div>
          ${ids.length > 1 ? `<div class="card a"><small>Por pessoa</small><strong>${U.brl(Math.ceil(porMes / ids.length))}</strong></div>` : ''}`}
          ${ids.map(k => prog[k] + resto[k] > 0 ? `<div class="card ${cls(k)}"><small>Falta colocar · ${U.esc(n(k))}</small><strong>${U.brl(prog[k] + resto[k])}</strong>${prog[k] > 0 && prog.data[k] ? `<small style="margin-top:4px">${resto[k] > 0 ? U.brl(prog[k]) + ' ' : ''}até ${U.dataBR(prog.data[k]).slice(0, 5)}</small>` : ''}</div>` : '').join('')}
          ${ids.map(k => resto[k] > 0 ? `<div class="card ok"><small>Por mês · ${U.esc(n(k))}</small><strong>${U.brl(Math.ceil(resto[k] / Math.max(1, meses)))}</strong><small style="margin-top:4px">só a parte que falta</small></div>` : '').join('')}
        </div>
        ${acomp}
        <div class="acerto">${t.total === 0 ? 'Ainda não há meta. Toque em <b>Alterar meta</b> para definir o valor da viagem, ou adicione os gastos com <b>+ Gasto previsto</b> (hospedagem, combustível, alimentação…) 🧳' : falta === 0 ? (prog.total > 0 ? 'Tudo coberto 💜 Falta só colocar o que já está marcado na caixinha.' : 'Meta batida! 🎉 Já dá para pagar tudo que falta.') : `${m.fonte ? 'Com o que já está marcado na caixinha' : 'Mantendo o aporte padrão'}, na data da viagem a caixinha terá ${U.brl(proj)}: ${sobra >= 0 ? `sobra ${U.brl(sobra)} 💜` : `ainda faltam ${U.brl(-sobra)}.`}`}</div>
        <div class="filtros"><button class="btn" id="v-item">+ Gasto previsto</button><button class="btn sec" id="v-meta">Alterar meta</button><button class="btn sec" id="v-edit">Editar viagem</button><button class="btn sec" id="v-del">Excluir viagem</button></div>
        ${(m.itens || []).length ? `<table><thead><tr><th>Gasto</th><th class="v">Qtd</th><th class="v">Cada</th><th class="v">Total</th><th>Situação</th><th></th></tr></thead><tbody>${m.itens.map(i => `
          <tr><td>${U.esc(i.desc)}</td><td class="v">${String(i.qtd).replace('.', ',')}</td><td class="v">${U.brl(i.unit)}</td><td class="v">${U.brl(totalItem(i))}</td>
          <td><button class="chip ${i.pago ? 'ok' : 'ambos'}" data-p="${i.id}" style="border:0;cursor:pointer" title="Tocar para alternar">${i.pago ? '✔ pago' : '⏳ a pagar'}</button></td>
          <td><button class="mini" data-ie="${i.id}" aria-label="Editar">✏️</button><button class="mini" data-ix="${i.id}" aria-label="Excluir">🗑</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="vazio">Adicione os gastos previstos (hospedagem, combustível, alimentação…) para calcular a meta.</div>'}
      </section>`;
    } else {
      html += '<div class="vazio">Crie a primeira viagem e adicione os gastos previstos: o site calcula a meta e quanto falta. ✈</div>';
    }

    if (todas.length > 1) {
      html += `<section class="bloco"><h2>Minhas viagens</h2>${todas.map(v => { const t = totais(v); return `<div class="pend"><div><b>${U.esc(v.nome)}</b><br><span class="sub">${U.dataBR(v.data)} a ${U.dataBR(fim(v))} · meta ${U.brl(t.total)}</span></div>
        ${m && v.id === m.id ? '<span class="chip ok">meta atual</span>' : `<button class="btn sec mini-b" data-usar="${v.id}">Usar como meta</button>`}</div>`; }).join('')}</section>`;
    }

    // aportes mês a mês: do começo até alguns meses à frente (ou até a viagem)
    const mesViagem = m ? m.data.slice(0, 7) : '', mesLimite = U.mesSoma(U.mesAtual(), MESES_FUTUROS);
    const ultimo = mesViagem > mesLimite ? mesViagem : mesLimite;
    const linhas = [];
    for (let mm = inicio(); mm <= ultimo; mm = U.mesSoma(mm, 1)) linhas.push(mm);
    html += `<section class="bloco"><h2>Aportes mês a mês</h2>
      <p class="sub">Por padrão entra o valor combinado no dia de cada um (fim de semana vira segunda-feira). Se alguém não conseguir colocar, ou depositar em outro dia, toque em ✏️ e ajuste o valor (0 = não colocou) e a data daquele mês.</p>
      <table><thead><tr><th>Mês</th>${U.ids().map(k => `<th class="v">${U.esc(n(k))}</th>`).join('')}<th class="v">Total</th><th></th></tr></thead><tbody>${linhas.map(mm => { const a = aporteMes(mm); return `
        <tr><td>${U.mesNome(mm)}${a.alterado ? ' <span class="chip ambos">alterado</span>' : ''}</td>
        ${U.ids().map(k => `<td class="v">${U.brl(a.v[k])}<br><span class="sub">${dataCurta(a.d[k])}${a.v[k] > 0 && a.d[k] > hoje ? ' · a cair' : ''}</span></td>`).join('')}<td class="v">${U.brl(U.ids().reduce((s, k) => s + a.v[k], 0))}</td>
        <td><button class="mini" data-mes="${mm}" aria-label="Alterar aporte">✏️</button></td></tr>`; }).join('')}</tbody></table></section>`;

    el.innerHTML = html;
    App.$('#v-cfg').onclick = formCaixinha;
    App.$('#v-real').onclick = formSaldoReal;
    el.querySelectorAll('[data-mes]').forEach(b => b.onclick = () => formMes(b.dataset.mes));
    el.querySelectorAll('[data-usar]').forEach(b => b.onclick = () => Store.setConfig({ viagemMetaAtiva: b.dataset.usar }));
    if (m) {
      App.$('#v-item').onclick = () => formItem(m, null);
      App.$('#v-meta').onclick = () => formMeta(m);
      App.$('#v-edit').onclick = () => formViagem(m);
      App.$('#v-del').onclick = () => { if (confirm('Excluir esta viagem e os gastos previstos dela?')) Store.metas.del(m.id); };
      el.querySelectorAll('[data-ie]').forEach(b => b.onclick = () => formItem(m, m.itens.find(i => i.id === b.dataset.ie)));
      el.querySelectorAll('[data-ix]').forEach(b => b.onclick = () => { if (confirm('Excluir gasto?')) Store.metas.set(m.id, { ...m, itens: m.itens.filter(i => i.id !== b.dataset.ix) }); });
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => Store.metas.set(m.id, { ...m, itens: m.itens.map(i => i.id === b.dataset.p ? { ...i, pago: !i.pago } : i) }));
    }
  }, () => ({ crumb: 'Planejamento › Viagens', titulo: 'Viagens', sub: 'Caixinha mensal rendendo, meta da viagem e quanto falta juntar.', cta: { rotulo: 'Nova viagem', fn: () => formViagem(null) } }));

  // avisos de uma data: 1 mês, 15, 7 e 3 dias antes do check-in e depois todo dia até o check-out
  window.Viagens = {
    saldoHoje: () => simular(U.hoje()).saldo,
    avisosDoDia(iso) {
      const out = [];
      Store.metas.lista().forEach(m => {
        const dias = U.diasEntre(iso, m.data), t = totais(m), falta = Math.max(0, t.faltaPagar - saldoViagem(m, iso) - progDe(m).total);
        const meta = t.total ? ` Falta juntar ${U.brl(falta)} da meta.` : '';
        const base = { tipo: 'viagem', urgente: false };
        if (dias > 0 && (dias === 30 || dias === 15 || dias === 7 || dias <= 3)) {
          const quando = dias === 30 ? 'Falta 1 mês' : dias === 1 ? 'Falta 1 dia' : `Faltam ${dias} dias`;
          out.push({ ...base, titulo: `✈️ ${m.nome}: ${quando} para a viagem!`, texto: `Check-in dia ${U.dataBR(m.data).slice(0, 5)}.${meta}` });
        } else if (dias === 0) out.push({ ...base, titulo: `🎉 Hoje é o dia: ${m.nome}!`, texto: 'Boa viagem! Aproveitem muito 💜' });
        else if (dias < 0 && iso <= fim(m)) {
          const resta = U.diasEntre(iso, fim(m));
          out.push({ ...base, titulo: `🧳 ${m.nome}: dia ${-dias + 1} da viagem`, texto: resta ? `Check-out dia ${U.dataBR(fim(m)).slice(0, 5)} (em ${resta} dia${resta > 1 ? 's' : ''}). Curtam! 💜` : 'Hoje é o check-out. Boa volta! 💜' });
        }
      });
      return out;
    },
    // último dia em que ainda há aviso de viagem (para limitar o plano do app)
    ultimoDia: () => Store.metas.lista().reduce((u, m) => fim(m) > u ? fim(m) : u, '')
  };
})();
