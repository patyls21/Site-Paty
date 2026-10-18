(() => {
  const GUARDAR = 'Render (guardado)'; // não conta como gasto, aparece como "guardado"
  const filtro = { pessoa: '', cat: '', q: '' };
  const FORMAS = () => [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['debito', 'Débito'], ['credito', 'Crédito'], ['inter', U.cartao()], ['outro', 'Outro']];
  const nomeForma = v => (FORMAS().find(f => f[0] === v) || [, v])[1];
  const pessoas = () => Store.pessoas().map(p => [p.id, p.nome]);
  const partes = g => U.partesGasto(g);

  function campos() {
    return [
      { k: 'data', rotulo: 'Data', tipo: 'date', req: true },
      { k: 'descricao', rotulo: 'Descrição', req: true },
      { k: 'valor', rotulo: 'Valor (R$)', inputmode: 'decimal', req: true },
      { k: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: Store.categorias.map(c => [c, c]) },
      { k: 'pessoa', rotulo: 'Dividir entre', tipo: 'checks', opcoes: pessoas(), dica: 'Marque quem participa do gasto: o valor é dividido igualmente entre os marcados.' },
      { k: 'forma', rotulo: 'Pagamento', tipo: 'select', opcoes: FORMAS() }
    ];
  }

  function editar(g) {
    const v = g ? { ...g, valor: U.valorInput(g.valor) } : { data: U.hoje(), pessoa: App.eu() || U.ids()[0], forma: 'pix', categoria: Store.categorias[0] };
    App.form(g ? 'Editar gasto' : 'Novo gasto', campos(), v, f => {
      const valor = U.parseValor(f.valor);
      if (!(valor > 0)) { alert('Valor inválido.'); return false; }
      if (!f.pessoa) { alert('Marque pelo menos uma pessoa em "Dividir entre".'); return false; }
      const o = { ...(g || {}), ...f, valor, mes: U.mesDe(f.data) };
      g ? Store.gastos.set(g.id, o) : Store.gastos.add(o);
    });
  }

  App.editarGasto = id => editar(Store.gastos.lista().find(g => g.id === id));

  function editarFixo(x) {
    const c = campos().filter(c => c.k !== 'data');
    c.splice(1, 0, { k: 'dia', rotulo: 'Dia do mês', tipo: 'number', req: true });
    const v = x ? { ...x, valor: U.valorInput(x.valor) } : { dia: 1, pessoa: 'meio', forma: 'inter', categoria: Store.categorias.includes('Streaming') ? 'Streaming' : Store.categorias[0] };
    App.form(x ? 'Editar gasto fixo' : 'Novo gasto fixo mensal', c, v, f => {
      const valor = U.parseValor(f.valor), dia = Math.min(28, Math.max(1, parseInt(f.dia, 10) || 1));
      if (!(valor > 0)) { alert('Valor inválido.'); return false; }
      if (!f.pessoa) { alert('Marque pelo menos uma pessoa em "Dividir entre".'); return false; }
      const o = { ...f, valor, dia };
      x ? Store.fixos.set(x.id, o) : Store.fixos.add(o);
    });
  }

  function lancarFixos() {
    const m = App.estado.mes; let n = 0;
    Store.fixos.lista().forEach(x => {
      if (Store.gastos.lista().some(g => g.fixoId === x.id && g.mes === m)) return;
      Store.gastos.add({ data: `${m}-${String(x.dia).padStart(2, '0')}`, descricao: x.descricao, valor: x.valor, categoria: x.categoria, pessoa: x.pessoa, forma: x.forma, mes: m, fixoId: x.id }); n++;
    });
    alert(n ? `${n} gasto(s) fixo(s) lançado(s) em ${U.mesNome(m)}.` : 'Os fixos já estavam lançados neste mês.');
  }

  function lista() {
    const m = App.estado.mes;
    const todos = Store.gastos.lista().filter(g => g.mes === m);
    const ids = U.ids();
    const vis = todos.filter(g => (!filtro.pessoa || U.quem(g.pessoa).includes(filtro.pessoa)) && (!filtro.cat || g.categoria === filtro.cat) &&
      (!filtro.q || g.descricao.toLowerCase().includes(filtro.q.toLowerCase()))).sort((a, b) => b.data.localeCompare(a.data));
    const gastos = todos.filter(g => g.categoria !== GUARDAR);
    const parteDe = (arr, k) => arr.reduce((s, g) => s + (partes(g)[k] || 0), 0);
    const guardado = todos.filter(g => g.categoria === GUARDAR).reduce((s, g) => s + g.valor, 0);
    const inter = Store.lancInter(m).reduce((s, l) => s + l.valor, 0);
    const porCat = {}; gastos.forEach(g => porCat[g.categoria] = (porCat[g.categoria] || 0) + g.valor);
    const top = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
    const classe = k => ids.indexOf(k) === 0 ? 'a' : ids.indexOf(k) === 1 ? 'b' : '';
    App.$('#cards').innerHTML = `
      <div class="card"><small>Gastos do mês</small><strong>${U.brl(gastos.reduce((s, g) => s + g.valor, 0))}</strong></div>
      ${ids.map(k => `<div class="card ${classe(k)}"><small>Parte de ${U.esc(App.nome(k))}</small><strong>${U.brl(parteDe(gastos, k))}</strong></div>`).join('')}
      ${guardado ? `<div class="card ok"><small>Guardado p/ render</small><strong>${U.brl(guardado)}</strong></div>` : ''}
      <div class="card"><small>Fatura ${U.esc(U.banco() || 'do cartão')} · ${U.periodoFatura(m)}</small><strong>${U.brl(inter)}</strong></div>`;
    const cores = ['#9b5de5', '#f4c53d', '#5aaaff', '#3fbf8a', '#f5a623', '#d96ba0'];
    const outras = top.slice(5).reduce((s, x) => s + x[1], 0);
    const segsCat = top.slice(0, 5).map(([c, v], i) => ({ rotulo: c, valor: v, cor: cores[i] }));
    if (outras) segsCat.push({ rotulo: 'Outras', valor: outras, cor: cores[5] });
    App.$('#cmp').innerHTML = `<div class="cmp-grid">${App.barra('Parte de cada pessoa', ids.map(k => ({ rotulo: App.nome(k), valor: parteDe(gastos, k), cor: App.cor(k) })))}
      ${App.barra('Por categoria', segsCat)}</div>`;
    App.$('#cats').innerHTML = '';
    const PP = U.pendencias(Store.gastos.lista()), nPend = ids.reduce((s, k) => s + PP[k].total, 0);
    App.$('#acerto').hidden = !nPend;
    App.$('#acerto').innerHTML = nPend ? `${ids.filter(k => PP[k].total > 0).map(k => `${U.esc(App.nome(k))} deve ${U.brl(PP[k].total)}`).join(' · ')}
      <br><button class="btn sec" id="b-pend" style="margin-top:6px">Ver / pagar pendências</button>` : '';
    const bp = App.$('#b-pend'); if (bp) bp.onclick = () => App.pendencias();
    const partesChips = g => g.pag ? ids.filter(p => U.parteDe(g, p) > 0).map(p => `<span class="chip ${U.pendente(g, p) ? 'ambos' : 'ok'}" title="${U.pendente(g, p) ? 'pendente' : 'pago'}">${U.pendente(g, p) ? '⏳' : '✔'} ${U.esc(App.nome(p))}</span>`).join(' ') : '';
    App.$('#lista').innerHTML = vis.length ? `<table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Dividido</th><th>Pagamento</th><th>Partes</th><th class="v">Valor</th><th></th></tr></thead><tbody>${vis.map(g => `
      <tr><td>${U.dataBR(g.data)}</td><td>${U.esc(g.descricao)}${g.fixoId ? ' 🔁' : ''}</td><td><span class="chip">${U.esc(g.categoria)}</span></td>
      <td><span class="chip ${U.quem(g.pessoa).length > 1 ? 'ambos' : ''}">${U.esc(App.rotuloDiv(g.pessoa))}</span></td><td>${nomeForma(g.forma)}</td><td>${partesChips(g)}</td>
      <td class="v">${U.brl(g.valor)}</td><td>${App.temComprovante(g) ? `<button class="mini" data-v="${g.id}" aria-label="Ver comprovante" title="Ver comprovante">👁</button>` : ''}<button class="mini" data-d="${g.id}" aria-label="Detalhes e pagamento" title="Detalhes e pagamento">🔎</button><button class="mini" data-e="${g.id}" aria-label="Editar">✏️</button><button class="mini" data-x="${g.id}" aria-label="Excluir">🗑</button></td></tr>`).join('')}</tbody></table>`
      : `<div class="vazio">Nenhum gasto neste mês. Use o botão amarelo ou a aba <b>Lançar</b> 💜</div>`;
    App.$('#lista').querySelectorAll('[data-d]').forEach(b => b.onclick = () => App.detalheGasto(b.dataset.d));
    App.$('#lista').querySelectorAll('[data-v]').forEach(b => b.onclick = () => App.verComprovantes(b.dataset.v));
    App.$('#lista').querySelectorAll('[data-e]').forEach(b => b.onclick = () => editar(Store.gastos.lista().find(g => g.id === b.dataset.e)));
    App.$('#lista').querySelectorAll('[data-x]').forEach(b => b.onclick = () => { if (confirm('Excluir este gasto?')) Store.gastos.del(b.dataset.x); });
  }

  App.registrar('compras', el => {
    const fx = Store.fixos.lista();
    el.innerHTML = `<div class="mes" id="nav"></div><div class="cards" id="cards"></div><div id="cats" class="legenda" style="margin:0 0 10px"></div>
      <div class="acerto" id="acerto" hidden></div>
      <div class="filtros">
        <input id="q" type="search" placeholder="Buscar…" value="${U.esc(filtro.q)}">
        <select id="fp"><option value="">Todos</option>${pessoas().map(([v, t]) => `<option value="${v}">${U.esc(t)}</option>`).join('')}</select>
        <select id="fc"><option value="">Categorias</option>${Store.categorias.map(c => `<option>${U.esc(c)}</option>`).join('')}</select>
      </div><div id="lista"></div>
      <h2 class="titulo-sec">Comparativos</h2><div id="cmp"></div>
      <section class="bloco"><h2>🔁 Gastos fixos mensais (streams, Duo Gourmet, render…)</h2>
        ${fx.length ? fx.map(x => `<p class="sub">${U.esc(x.descricao)} — <b>${U.brl(x.valor)}</b> · dia ${x.dia} · ${U.esc(x.categoria)} · ${U.esc(App.rotuloDiv(x.pessoa))}
          <button class="mini" data-fe="${x.id}" aria-label="Editar">✏️</button><button class="mini" data-fx="${x.id}" aria-label="Excluir">🗑</button></p>`).join('') : '<p class="sub">Cadastre uma vez e lance todo mês com um toque.</p>'}
        <div class="filtros"><button class="btn sec" id="b-fixo">+ Novo fixo</button>${fx.length ? '<button class="btn ver" id="b-lancar">Lançar fixos deste mês</button>' : ''}</div>
      </section>`;
    function render() { App.navMes(App.$('#nav'), render); lista(); }
    render();
    App.$('#fp').value = filtro.pessoa; App.$('#fc').value = filtro.cat;
    App.$('#q').oninput = e => { filtro.q = e.target.value; lista(); };
    App.$('#fp').onchange = e => { filtro.pessoa = e.target.value; lista(); };
    App.$('#fc').onchange = e => { filtro.cat = e.target.value; lista(); };
    App.$('#b-fixo').onclick = () => editarFixo(null);
    const bl = App.$('#b-lancar'); if (bl) bl.onclick = lancarFixos;
    el.querySelectorAll('[data-fe]').forEach(b => b.onclick = () => editarFixo(Store.fixos.lista().find(x => x.id === b.dataset.fe)));
    el.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => { if (confirm('Excluir fixo? (gastos já lançados ficam)')) Store.fixos.del(b.dataset.fx); });
  }, () => ({ crumb: 'Financeiro › Painel de Compras', titulo: 'Painel de Compras', sub: 'Todos os gastos do mês, quem paga e quanto cada um deve.', cta: { rotulo: 'Novo gasto', fn: () => App.novoGasto() } }));
})();
