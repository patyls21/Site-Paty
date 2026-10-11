(() => {
  const previsto = x => x.previsto > 0 ? x.previsto : Math.round(x.atual * (1 + (Store.config.acrescimoFuturo || 0) / 100));

  function editar(x) {
    const v = x ? { ...x, atual: U.valorInput(x.atual), previsto: x.previsto ? U.valorInput(x.previsto) : '' } : { categoria: 'Moradia' };
    App.form(x ? 'Editar item' : 'Novo gasto futuro', [
      { k: 'descricao', rotulo: 'Gasto (ex.: Energia, Internet, Condomínio)', req: true },
      { k: 'atual', rotulo: `Quanto ${App.nome('B')} paga hoje (R$)`, inputmode: 'decimal', req: true },
      { k: 'previsto', rotulo: 'Previsão morando juntos (R$) — deixe vazio para usar o acréscimo geral', inputmode: 'decimal' },
      { k: 'obs', rotulo: 'Observação' }
    ], v, f => {
      const atual = U.parseValor(f.atual), prev = f.previsto.trim() ? U.parseValor(f.previsto) : 0;
      if (!(atual >= 0) || Number.isNaN(prev)) { alert('Valor inválido.'); return false; }
      const o = { descricao: f.descricao, atual, previsto: prev, obs: f.obs || '' };
      x ? Store.futuros.set(x.id, o) : Store.futuros.add(o);
    });
  }

  App.registrar('futuro', el => {
    const ls = Store.futuros.lista(), c = Store.config;
    const tAtual = ls.reduce((s, x) => s + x.atual, 0), tPrev = ls.reduce((s, x) => s + previsto(x), 0);
    const metade = Math.ceil(tPrev / 2);
    el.innerHTML = `
      <div class="cards">
        <div class="card"><small>Hoje (${U.esc(App.nome('B'))} paga)</small><strong>${U.brl(tAtual)}</strong></div>
        <div class="card a"><small>Previsto morando juntos</small><strong>${U.brl(tPrev)}</strong></div>
        <div class="card b"><small>Diferença</small><strong>${tPrev - tAtual >= 0 ? '+' : '−'}${U.brl(Math.abs(tPrev - tAtual))}</strong></div>
        <div class="card ok"><small>Metade para cada um</small><strong>${U.brl(metade)}</strong></div>
      </div>
      <div class="filtros"><label class="sub" style="display:flex;align-items:center;gap:8px;flex:1">Acréscimo geral (%) nos itens sem previsão:
        <input id="acr" type="number" step="1" value="${c.acrescimoFuturo}" style="width:90px"></label>
        <button class="btn" id="b-novo">+ Gasto</button></div>
      ${ls.length ? `<table><thead><tr><th>Gasto</th><th class="v">Hoje</th><th class="v">Previsto</th><th>Obs.</th><th></th></tr></thead><tbody>${ls.map(x => `
        <tr><td>${U.esc(x.descricao)}</td><td class="v">${U.brl(x.atual)}</td><td class="v">${U.brl(previsto(x))}${x.previsto ? '' : ' <span class="chip">auto</span>'}</td><td>${U.esc(x.obs)}</td>
        <td><button class="mini" data-e="${x.id}" aria-label="Editar">✏️</button><button class="mini" data-x="${x.id}" aria-label="Excluir">🗑</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="vazio">Adicione os gastos do apartamento dele (energia, internet…) para simular a vida a dois 🏠</div>'}`;
    App.$('#acr').onchange = e => Store.setConfig({ acrescimoFuturo: Number(e.target.value) || 0 });
    App.$('#b-novo').onclick = () => editar(null);
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => editar(Store.futuros.lista().find(x => x.id === b.dataset.e)));
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { if (confirm('Excluir item?')) Store.futuros.del(b.dataset.x); });
  }, () => ({ crumb: 'Planejamento › Gastos Futuros', titulo: 'Gastos Futuros', sub: 'Simule quanto vocês gastariam morando juntos.', cta: { rotulo: 'Novo gasto', fn: () => editar(null) } }));
})();
