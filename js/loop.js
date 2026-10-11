(() => {
  const fmt = n => Math.round(n).toLocaleString('pt-BR');
  // pontos automáticos de um mês = total da fatura do Inter / reais por ponto (arredondado para baixo)
  const totalFatura = m => Store.lancInter(m).reduce((s, l) => s + l.valor, 0);
  const autoPontos = m => { const r = Store.config.reaisPorPonto || 2.5; return Math.floor(totalFatura(m) / 100 / r); };
  // mês "fechado" = anterior ao atual ou fatura marcada como paga; o atual aberto fica como "a cair"
  const fechado = m => m < U.mesAtual() || Store.fatura(m).status === 'paga';

  function mesesComDados() {
    const s = new Set([U.mesAtual()]);
    Store.gastos.lista().forEach(g => g.forma === 'inter' && s.add(g.mes));
    Store.inter.lista().forEach(l => s.add(l.mes));
    Store.pontos.lista().forEach(p => s.add(p.mes));
    return [...s].filter(m => m <= U.mesAtual() || totalFatura(m) > 0).sort().reverse();
  }

  function editarPonto(p) {
    App.form(p ? 'Editar ajuste' : 'Pontos extras / resgate', [
      { k: 'mes', rotulo: 'Mês', tipo: 'month', req: true },
      { k: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: [['ganho', 'Pontos extras (caíram a mais, bônus…)'], ['resgate', 'Resgate / conversão em milhas']] },
      { k: 'pontos', rotulo: 'Pontos', tipo: 'number', req: true },
      { k: 'obs', rotulo: 'Observação' }
    ], p || { mes: App.estado.mes, tipo: 'ganho' }, f => {
      const pontos = Math.round(Number(f.pontos));
      if (!(pontos > 0)) { alert('Quantidade inválida.'); return false; }
      const o = { mes: f.mes, tipo: f.tipo, pontos, obs: f.obs || '' };
      p ? Store.pontos.set(p.id, o) : Store.pontos.add(o);
    });
  }

  function editarViagem(v) {
    App.form(v ? 'Editar viagem' : 'Nova viagem', [
      { k: 'nome', rotulo: 'Destino / viagem', req: true },
      { k: 'milhas', rotulo: 'Milhas necessárias (total do casal)', tipo: 'number', req: true }
    ], v || {}, f => {
      const milhas = Math.round(Number(f.milhas));
      if (!(milhas > 0)) { alert('Quantidade inválida.'); return false; }
      const o = { nome: f.nome, milhas };
      v ? Store.viagens.set(v.id, o) : Store.viagens.add(o);
    });
  }

  App.registrar('loop', el => {
    const c = Store.config, hoje = U.mesAtual();
    const manuais = Store.pontos.lista().slice().sort((a, b) => b.mes.localeCompare(a.mes));
    const extra = (m, tipo) => manuais.filter(p => p.mes === m && p.tipo === tipo).reduce((s, p) => s + p.pontos, 0);
    const linhas = mesesComDados().map(m => {
      const auto = autoPontos(m), ext = extra(m, 'ganho'), fech = fechado(m);
      return { m, gasto: totalFatura(m), auto, ext, res: extra(m, 'resgate'), fech };
    });
    // saldo confirmado: meses fechados (automáticos) + extras e resgates lançados
    const confirmado = linhas.reduce((s, l) => s + (l.fech ? l.auto : 0) + l.ext - l.res, 0)
      + manuais.filter(p => !linhas.some(l => l.m === p.mes)).reduce((s, p) => s + (p.tipo === 'ganho' ? p.pontos : -p.pontos), 0);
    const aCair = linhas.reduce((s, l) => s + (l.fech ? 0 : l.auto), 0);
    // média mensal: últimos 3 meses fechados com ganho (senão, o mês atual)
    const base = linhas.filter(l => l.fech && l.auto + l.ext > 0).slice(0, 3);
    const media = base.length ? base.reduce((s, l) => s + l.auto + l.ext, 0) / base.length
      : (linhas.find(l => l.m === hoje)?.auto || 0);
    const mult = (c.conversao || 1) * (1 + (c.bonus || 0) / 100); // milhas por ponto
    const vs = Store.viagens.lista();
    el.innerHTML = `
      <div class="cards">
        <div class="card"><small>Saldo de pontos Loop</small><strong>${fmt(confirmado)}</strong></div>
        <div class="card a"><small>A cair neste mês</small><strong>+${fmt(aCair)}</strong></div>
        <div class="card b"><small>Média mensal (${base.length ? 'últimos ' + base.length + ' meses' : 'mês atual'})</small><strong>${fmt(media)}</strong></div>
        <div class="card ok"><small>Saldo em milhas (com promo)</small><strong>${fmt(confirmado * mult)}</strong></div>
      </div>
      <section class="bloco"><h2>⚙ Regras</h2>
        <div class="filtros">
          <label class="sub">Reais gastos por ponto<input id="c-rpp" type="number" step="0.1" value="${c.reaisPorPonto}"></label>
          <label class="sub">Milhas por ponto<input id="c-conv" type="number" step="0.1" value="${c.conversao}"></label>
          <label class="sub">Bônus da promoção (%)<input id="c-bonus" type="number" step="5" value="${c.bonus}"></label>
        </div>
        <p class="sub">Os pontos saem sozinhos da fatura do Inter: <b>1 ponto a cada R$ ${Number(c.reaisPorPonto).toFixed(2).replace('.', ',')}</b>. Com a promoção, <b>1 ponto = ${mult.toFixed(2).replace('.', ',')} milha(s)</b>.</p>
      </section>
      <section class="bloco"><h2>Pontos por mês (automático)</h2>
        <table><thead><tr><th>Mês</th><th class="v">Fatura</th><th class="v">Pontos</th><th class="v">Extras</th><th>Situação</th></tr></thead><tbody>${linhas.map(l => `
          <tr><td>${U.mesNome(l.m)}</td><td class="v">${U.brl(l.gasto)}</td><td class="v">+${fmt(l.auto)}</td><td class="v">${l.ext ? '+' + fmt(l.ext) : '—'}</td>
          <td><span class="chip ${l.fech ? 'ok' : 'ambos'}">${l.fech ? 'Creditado' : 'A cair'}</span></td></tr>`).join('')}</tbody></table>
        <p class="sub" style="margin-top:8px">O mês vira "Creditado" quando passa, ou quando você marca a fatura como paga na aba Inter. Arredondado para baixo, por fatura.</p>
      </section>
      <section class="bloco"><h2>✈ Metas de viagem</h2>
        ${vs.length ? `<table><thead><tr><th>Viagem</th><th class="v">Milhas</th><th class="v">Pontos necessários</th><th class="v">Faltam</th><th>Previsão</th><th></th></tr></thead><tbody>${vs.map(v => {
          const nec = v.milhas / mult, falta = Math.max(0, nec - confirmado), mm = media > 0 ? Math.ceil(falta / media) : null;
          return `<tr><td>${U.esc(v.nome)}</td><td class="v">${fmt(v.milhas)}</td><td class="v">${fmt(nec)}</td><td class="v">${fmt(falta)}</td>
            <td>${falta === 0 ? '🎉 Já dá!' : mm ? `~${mm} mes(es) · ${U.mesNome(U.mesSoma(hoje, mm))}` : 'Sem gastos no Inter p/ prever'}</td>
            <td><button class="mini" data-ve="${v.id}" aria-label="Editar">✏️</button><button class="mini" data-vx="${v.id}" aria-label="Excluir">🗑</button></td></tr>`; }).join('')}</tbody></table>`
          : '<p class="sub">Cadastre uma meta (ex.: Lisboa, 120.000 milhas ida e volta para 2).</p>'}
        <div class="filtros" style="margin-top:8px"><button class="btn sec" id="b-viagem">+ Nova viagem</button></div>
      </section>
      <section class="bloco"><h2>Extras e resgates (manual)</h2>
        ${manuais.length ? `<table><thead><tr><th>Mês</th><th>Tipo</th><th class="v">Pontos</th><th>Obs.</th><th></th></tr></thead><tbody>${manuais.map(p => `
          <tr><td>${U.mesNome(p.mes)}</td><td><span class="chip ${p.tipo === 'ganho' ? 'ok' : 'b'}">${p.tipo === 'ganho' ? 'Extra' : 'Resgate'}</span></td><td class="v">${p.tipo === 'ganho' ? '+' : '−'}${fmt(p.pontos)}</td><td>${U.esc(p.obs)}</td>
          <td><button class="mini" data-pe="${p.id}" aria-label="Editar">✏️</button><button class="mini" data-px="${p.id}" aria-label="Excluir">🗑</button></td></tr>`).join('')}</tbody></table>` : '<p class="sub">Nada por aqui. Só lance se caírem pontos a mais (bônus) ou quando converter pontos em milhas.</p>'}
        <div class="filtros" style="margin-top:8px"><button class="btn" id="b-ponto">+ Extra / resgate</button></div>
      </section>`;
    const cfg = (id, k) => App.$(id).onchange = e => Store.setConfig({ [k]: Number(e.target.value) || 0 });
    cfg('#c-rpp', 'reaisPorPonto'); cfg('#c-conv', 'conversao'); cfg('#c-bonus', 'bonus');
    App.$('#c-rpp').onchange = e => Store.setConfig({ reaisPorPonto: Number(e.target.value) > 0 ? Number(e.target.value) : 2.5 });
    App.$('#b-ponto').onclick = () => editarPonto(null);
    App.$('#b-viagem').onclick = () => editarViagem(null);
    el.querySelectorAll('[data-pe]').forEach(b => b.onclick = () => editarPonto(Store.pontos.lista().find(p => p.id === b.dataset.pe)));
    el.querySelectorAll('[data-px]').forEach(b => b.onclick = () => { if (confirm('Excluir registro?')) Store.pontos.del(b.dataset.px); });
    el.querySelectorAll('[data-ve]').forEach(b => b.onclick = () => editarViagem(Store.viagens.lista().find(v => v.id === b.dataset.ve)));
    el.querySelectorAll('[data-vx]').forEach(b => b.onclick = () => { if (confirm('Excluir viagem?')) Store.viagens.del(b.dataset.vx); });
  }, () => ({ crumb: 'Planejamento › Pontos Loop', titulo: 'Pontos Loop', sub: 'Pontos calculados sozinhos pela fatura do Inter e quanto falta para a próxima viagem.', cta: { rotulo: 'Extra / resgate', fn: () => editarPonto(null) } }));
})();
