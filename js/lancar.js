// Fluxo de lançamento: novo gasto, pagar a minha parte (com comprovante), pendências e compartilhar do banco.
const Lancar = (() => {
  const FORMAS = [['pix', 'Pix'], ['inter', 'Cartão Inter'], ['dinheiro', 'Dinheiro'], ['debito', 'Débito'], ['credito', 'Crédito'], ['outro', 'Outro']];
  const ACEITA = 'image/*,application/pdf';
  const n = k => App.nome(k);
  const dlg = () => App.$('#dlg');
  const gastoPorId = id => Store.gastos.lista().find(g => g.id === id);
  const nomeForma = v => (FORMAS.find(f => f[0] === v) || [, v])[1];
  const rotuloDiv = g => g.pessoa === 'meio' || g.pessoa === 'ambos' ? 'meio a meio' : 'só ' + n(g.pessoa);

  // gastoIds (opcional): um mesmo comprovante que vale para vários gastos (um Pix só pagando tudo)
  async function anexar(arquivo, g, pessoa, gastoIds) {
    const file = arquivo instanceof File ? arquivo : new File([arquivo], arquivo.name || 'comprovante', { type: arquivo.type });
    const dataUrl = await U.anexo(file);
    return Store.comprovantes.add({
      mes: g.mes, nome: file.name || 'comprovante', tipo: dataUrl.startsWith('data:application/pdf') ? 'pdf' : 'img',
      dataUrl, enviadoEm: U.hoje(), gastoId: g.id, pessoa, ...(gastoIds && gastoIds.length > 1 ? { gastoIds } : {})
    }).id;
  }

  // ---------- novo gasto ----------
  async function novoGasto(op = {}) {
    const e = await App.pedirEu(); if (!e) return;
    const o = App.outro(e);
    App.form('Novo gasto', [
      { k: 'descricao', rotulo: 'O que foi', req: true },
      { k: 'valor', rotulo: 'Valor total (R$)', inputmode: 'decimal', req: true },
      { k: 'data', rotulo: 'Data', tipo: 'date', req: true },
      { k: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: Store.categorias.map(c => [c, c]) },
      { k: 'forma', rotulo: 'Foi pago em', tipo: 'select', opcoes: FORMAS },
      { k: 'pessoa', rotulo: 'Dividir entre', tipo: 'select', opcoes: [['meio', 'Meio a meio'], [e, 'Só eu'], [o, 'Só ' + n(o)]] },
      { k: 'situacao', rotulo: 'Quem pagou agora?', tipo: 'select', opcoes: [
        ['eu_tudo', `Eu paguei o valor todo (${n(o)} me deve a parte dele)`],
        ['eu_parte', 'Paguei só a minha parte (cada um paga a sua)'],
        ['outro_tudo', `${n(o)} pagou o valor todo (eu devo a minha parte)`],
        ['ninguem', 'Ainda ninguém pagou']] },
      { k: 'comp', rotulo: 'Comprovante de quem pagou (opcional)', tipo: 'file', accept: ACEITA, dica: op.arquivo ? `Comprovante recebido: ${op.arquivo.name}` : 'Imagem ou PDF. Dá para anexar depois também.' }
    ], { data: U.hoje(), forma: 'inter', pessoa: 'meio', situacao: 'eu_tudo', categoria: Store.categorias[0] }, async f => {
      const valor = U.parseValor(f.valor);
      if (!(valor > 0)) { alert('Valor inválido.'); return false; }
      const pag = { A: { pago: false }, B: { pago: false } };
      let adiantou = '', quem = e;
      if (f.situacao === 'eu_tudo') { adiantou = e; pag[e] = { pago: true, data: f.data }; }
      else if (f.situacao === 'eu_parte') pag[e] = { pago: true, data: f.data };
      else if (f.situacao === 'outro_tudo') { adiantou = o; quem = o; pag[o] = { pago: true, data: f.data }; }
      const g = Store.gastos.add({ data: f.data, descricao: f.descricao.trim(), valor, categoria: f.categoria, pessoa: f.pessoa, forma: f.forma, mes: U.mesDe(f.data), pag, adiantou, criadoPor: e });
      const arq = (f.comp && f.comp.size) ? f.comp : op.arquivo;
      if (arq && f.situacao !== 'ninguem') {
        try { pag[quem].comps = [await anexar(arq, g, quem)]; Store.gastos.set(g.id, g); }
        catch (err) { alert('Gasto salvo, mas o comprovante não foi anexado: ' + err.message); }
      }
      return true;
    }, null, 'Salvar gasto');
  }

  // ---------- pagar a parte de alguém ----------
  async function pagarParte(g, arquivo, quem) {
    const p = quem || await App.pedirEu(); if (!p) return;
    App.form(`Pagar parte de ${n(p)}: ${U.brl(U.parteDe(g, p))}`, [
      { k: 'data', rotulo: 'Data do pagamento', tipo: 'date', req: true },
      { k: 'comp', rotulo: 'Comprovante (imagem ou PDF)', tipo: 'file', accept: ACEITA, dica: arquivo ? `Comprovante recebido: ${arquivo.name}` : `${g.descricao} · ${U.dataBR(g.data)}` }
    ], { data: U.hoje() }, async f => {
      const gg = gastoPorId(g.id), pag = { ...gg.pag };
      pag[p] = { ...(pag[p] || {}), pago: true, data: f.data, comps: [...((pag[p] && pag[p].comps) || [])] };
      const arq = (f.comp && f.comp.size) ? f.comp : arquivo;
      if (arq) {
        try { pag[p].comps.push(await anexar(arq, gg, p)); }
        catch (err) { alert('Comprovante não anexado: ' + err.message); return false; }
      }
      Store.gastos.set(gg.id, { ...gg, pag });
      return true;
    }, null, 'Confirmar pagamento');
  }

  function marcarPendente(g, p) { // desfaz um pagamento marcado por engano
    const pag = { ...g.pag, [p]: { pago: false, comps: (g.pag[p] && g.pag[p].comps) || [] } };
    Store.gastos.set(g.id, { ...g, pag });
  }

  // ---------- janelas ----------
  function abrir(html, ligar) {
    const d = dlg(); d.innerHTML = html;
    d.querySelectorAll('[data-fechar]').forEach(b => b.onclick = () => d.close());
    ligar && ligar(d); d.showModal();
  }

  // todos os comprovantes ligados a um gasto (de qualquer pessoa)
  function compsDoGasto(g) {
    const ids = new Set();
    ['A', 'B'].forEach(p => ((g.pag && g.pag[p] && g.pag[p].comps) || []).forEach(i => ids.add(i)));
    Store.comprovantes.lista().forEach(c => { if (c.gastoId === g.id) ids.add(c.id); });
    return [...ids].map(i => Store.comprovantes.lista().find(c => c.id === i)).filter(Boolean);
  }

  // visualizador: imagem ou PDF, com anterior/próximo (se houver mais de um), baixar e excluir
  function verComps(lista, i, voltar, titulo) {
    const c = lista[i];
    abrir(`<h3>${U.esc(titulo)}${lista.length > 1 ? ` (${i + 1}/${lista.length})` : ''}</h3><form method="dialog" style="padding:12px;display:grid;gap:10px">
      <p class="sub" style="margin:0">${c.pessoa ? U.esc(n(c.pessoa)) + ' · ' : ''}${U.esc(c.nome)}${c.enviadoEm ? ' · ' + U.dataBR(c.enviadoEm) : ''}</p>
      ${c.tipo === 'img' ? `<img class="grande" src="${c.dataUrl}" alt="Comprovante">` : `<object data="${c.dataUrl}" type="application/pdf" style="width:100%;height:60vh"><p class="sub">Seu aparelho não mostra PDF aqui. Use o botão <b>Baixar</b>.</p></object>`}
      <div class="acoes">
        ${lista.length > 1 ? '<button type="button" class="btn sec mini-b" id="c-ant" aria-label="Anterior">‹</button><button type="button" class="btn sec mini-b" id="c-prox" aria-label="Próximo">›</button>' : ''}
        <a class="btn-a" href="${c.dataUrl}" download="${U.esc(c.nome)}">⬇ Baixar</a>
        <button type="button" class="btn sec mini-b" id="c-del" aria-label="Excluir">🗑</button>
        <button type="button" class="btn mini-b" id="c-volta">${voltar ? 'Voltar' : 'Fechar'}</button></div></form>`, d => {
      const ir = k => verComps(lista, (i + k + lista.length) % lista.length, voltar, titulo);
      const a = d.querySelector('#c-ant'); if (a) { a.onclick = () => ir(-1); d.querySelector('#c-prox').onclick = () => ir(1); }
      d.querySelector('#c-volta').onclick = () => voltar ? voltar() : d.close();
      d.querySelector('#c-del').onclick = () => {
        if (!confirm(c.gastoIds && c.gastoIds.length > 1 ? `Este comprovante vale para ${c.gastoIds.length} gastos. Excluir de todos?` : 'Excluir comprovante?')) return;
        Store.comprovantes.del(c.id);
        const resto = lista.filter(x => x.id !== c.id);
        if (resto.length) verComps(resto, Math.min(i, resto.length - 1), voltar, titulo); else if (voltar) voltar(); else d.close();
      };
    });
  }
  function verComp(c, voltar) {
    const g = gastoPorId(c.gastoId), lista = g ? compsDoGasto(g) : [c];
    verComps(lista, Math.max(0, lista.findIndex(x => x.id === c.id)), voltar, g ? g.descricao : c.nome);
  }
  // o olhinho 👁: abre direto os comprovantes do gasto
  function verComprovantes(id) {
    const g = gastoPorId(id), lista = g ? compsDoGasto(g) : [];
    if (lista.length) verComps(lista, 0, null, g.descricao);
  }

  // anexa (mais) um comprovante a uma parte que já está paga
  function anexarDepois(g, p) {
    App.form(`Anexar comprovante de ${n(p)}`, [
      { k: 'comp', rotulo: 'Imagem ou PDF', tipo: 'file', accept: ACEITA, dica: `${g.descricao} · ${U.dataBR(g.data)}` }
    ], {}, async f => {
      if (!(f.comp && f.comp.size)) { alert('Escolha um arquivo.'); return false; }
      const gg = gastoPorId(g.id), pag = { ...gg.pag };
      pag[p] = { ...(pag[p] || {}), comps: [...((pag[p] && pag[p].comps) || [])] };
      try { pag[p].comps.push(await anexar(f.comp, gg, p)); }
      catch (err) { alert('Comprovante não anexado: ' + err.message); return false; }
      Store.gastos.set(gg.id, { ...gg, pag });
      setTimeout(() => detalhe(g.id), 60); // reabre o detalhe já com o comprovante
      return true;
    }, null, 'Anexar');
  }

  async function detalhe(id) {
    const g = typeof id === 'string' ? gastoPorId(id) : id; if (!g) return;
    const e = await App.pedirEu();
    const comps = pessoa => ((g.pag && g.pag[pessoa] && g.pag[pessoa].comps) || []).map(i => Store.comprovantes.lista().find(c => c.id === i)).filter(Boolean);
    const linha = p => {
      const parte = U.parteDe(g, p), pago = g.pag[p] && g.pag[p].pago, pend = U.pendente(g, p);
      const cp = comps(p);
      const acoesPago = `${cp.length ? `<button type="button" class="olho" data-ver="${p}" aria-label="Ver comprovante" title="Ver comprovante">👁</button>` : ''}
        <button type="button" class="btn sec mini-b" data-anexar="${p}" title="Anexar comprovante">${cp.length ? '＋' : '📎 Anexar comprovante'}</button>
        <button type="button" class="mini" data-d="${p}" title="Desfazer">↩</button>`;
      return `<tr><td><b>${U.esc(n(p))}</b>${g.adiantou === p ? ' <span class="chip ambos">adiantou</span>' : ''}</td><td class="v">${U.brl(parte)}</td>
        <td>${parte === 0 ? '—' : pend ? '<span class="chip ambos">⏳ pendente</span>' : `<span class="chip ok">✔ pago${g.pag[p].data ? ' ' + U.dataBR(g.pag[p].data).slice(0, 5) : ''}</span>`}</td>
        <td>${pend ? `<button type="button" class="btn ${p === e ? '' : 'sec'} mini-b" data-p="${p}">${p === e ? 'Pagar minha parte' : 'Marcar como pago'}</button>` : pago && parte > 0 ? acoesPago : ''}</td></tr>`;
    };
    abrir(`<h3>${U.esc(g.descricao)}</h3><div style="padding:12px 16px 16px;display:grid;gap:10px">
      <p class="sub" style="margin:0">${U.dataBR(g.data)} · ${nomeForma(g.forma)} · ${U.esc(g.categoria)} · dividido ${rotuloDiv(g)}</p>
      <div class="cards" style="margin:0"><div class="card"><small>Total</small><strong>${U.brl(g.valor)}</strong></div></div>
      ${g.pag ? `<table><thead><tr><th>Quem</th><th class="v">Parte</th><th>Situação</th><th></th></tr></thead><tbody>${linha('A')}${linha('B')}</tbody></table>`
        : '<p class="sub">Este gasto foi lançado antes do controle de pagamento das partes.</p>'}
      <div class="acoes">${App.editarGasto ? '<button type="button" class="btn sec" id="d-edit">Editar</button>' : ''}<button type="button" class="btn" data-fechar>Fechar</button></div></div>`, d => {
      const ed = d.querySelector('#d-edit'); if (ed) ed.onclick = () => { d.close(); App.editarGasto(g.id); };
      d.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => verComps(comps(b.dataset.ver), 0, () => detalhe(g.id), g.descricao));
      d.querySelectorAll('[data-anexar]').forEach(b => b.onclick = () => { d.close(); anexarDepois(g, b.dataset.anexar); });
      d.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { d.close(); pagarParte(g, null, b.dataset.p); });
      d.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { marcarPendente(g, b.dataset.d); d.close(); detalhe(g.id); });
    });
  }

  // paga vários gastos de uma vez (ex.: um Pix só para a fatura): o mesmo comprovante fica em todos
  function pagarGrupo(itens, p, titulo, arquivo) {
    const total = itens.reduce((s, g) => s + U.parteDe(g, p), 0);
    App.form(`${titulo}: ${U.brl(total)}`, [
      { k: 'data', rotulo: 'Data do pagamento', tipo: 'date', req: true },
      { k: 'comp', rotulo: 'Comprovante (imagem ou PDF)', tipo: 'file', accept: ACEITA, dica: arquivo ? `Comprovante recebido: ${arquivo.name}` : `Um comprovante só, vale para os ${itens.length} itens.` }
    ], { data: U.hoje() }, async f => {
      const arq = (f.comp && f.comp.size) ? f.comp : arquivo;
      let compId = null;
      if (arq) {
        try { compId = await anexar(arq, itens[0], p, itens.map(g => g.id)); }
        catch (err) { alert('Comprovante não anexado: ' + err.message); return false; }
      }
      itens.forEach(g => {
        const gg = gastoPorId(g.id), pag = { ...gg.pag };
        pag[p] = { ...(pag[p] || {}), pago: true, data: f.data, comps: [...((pag[p] && pag[p].comps) || []), ...(compId ? [compId] : [])] };
        Store.gastos.set(gg.id, { ...gg, pag });
      });
      return true;
    }, null, 'Confirmar pagamento');
  }

  const rotuloCredor = c => c === 'INTER' ? '💳 Fatura do Inter' : (c === 'A' || c === 'B') ? `💸 Pix para ${n(c)}` : '📦 Outros (pagamento direto)';

  // pendências dos dois, com total, agrupadas por para quem se paga; usada também ao receber um comprovante compartilhado
  async function pendencias(arquivo) {
    const e = await App.pedirEu(); if (!e) return;
    const o = App.outro(e), P = U.pendencias(Store.gastos.lista());
    const ordem = ['INTER', 'A', 'B', 'OUTRO'];
    // grupos conhecidos na ordem certa; qualquer outro que apareça também é mostrado (nunca some dinheiro da lista)
    const credores = k => [...ordem.filter(c => P[k].grupos[c]), ...Object.keys(P[k].grupos).filter(c => !ordem.includes(c))];
    const bloco = k => credores(k).map(c => {
      const gr = P[k].grupos[c];
      const botao = k === e ? `<button type="button" class="btn mini-b" data-gp="${c}">Pagar tudo · ${U.brl(gr.total)}</button>`
        : c === e ? `<button type="button" class="btn sec mini-b" data-gr="${c}">${U.esc(n(k))} pagou tudo</button>` : '';
      return `<section class="grupo-pend"><div class="grupo-cab"><div><b>${rotuloCredor(c)}</b><br><span class="sub">${gr.itens.length} item(ns) · ${U.brl(gr.total)}</span></div>${botao}</div>
        ${gr.itens.slice().sort((a, b) => b.data.localeCompare(a.data)).map(g => `<div class="pend pend-lin"><div><b>${U.esc(g.descricao)}</b><br><span class="sub">${U.dataBR(g.data)} · parte ${U.brl(U.parteDe(g, k))}</span></div>
          ${k === e ? `<button type="button" class="btn sec mini-b" data-g="${g.id}">Pagar só este</button>` : ''}</div>`).join('')}</section>`;
    }).join('');
    abrir(`<h3>Pendências</h3><div style="padding:12px 16px 16px;display:grid;gap:6px">
      ${arquivo ? `<p class="sub" style="margin:0">Comprovante recebido: <b>${U.esc(arquivo.name)}</b>. Escolha o que ele paga.</p>` : ''}
      <div class="cards" style="margin:0 0 4px">
        <div class="card a"><small>Você deve</small><strong>${U.brl(P[e].total)}</strong></div>
        <div class="card b"><small>${U.esc(n(o))} deve</small><strong>${U.brl(P[o].total)}</strong></div>
      </div>
      ${P[e].total || P[o].total ? '' : '<div class="vazio">Ninguém deve nada 💜</div>'}
      ${P[e].total ? `<h4 class="sec-t">Você deve</h4>${bloco(e)}` : ''}
      ${P[o].total ? `<h4 class="sec-t">${U.esc(n(o))} deve</h4>${bloco(o)}` : ''}
      <div class="acoes">${arquivo ? '<button type="button" class="btn sec" id="p-novo">Criar novo gasto com este comprovante</button>' : ''}<button type="button" class="btn" data-fechar>Fechar</button></div></div>`, d => {
      d.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { d.close(); pagarParte(gastoPorId(b.dataset.g), arquivo, e); });
      d.querySelectorAll('[data-gp]').forEach(b => b.onclick = () => { d.close(); pagarGrupo(P[e].grupos[b.dataset.gp].itens, e, rotuloCredor(b.dataset.gp).replace(/^\S+\s/, ''), arquivo); });
      d.querySelectorAll('[data-gr]').forEach(b => b.onclick = () => { d.close(); pagarGrupo(P[o].grupos[b.dataset.gr].itens, o, `${n(o)} pagou`, null); });
      const pn = d.querySelector('#p-novo'); if (pn) pn.onclick = () => { d.close(); novoGasto({ arquivo }); };
    });
  }

  // ---------- compartilhar do app do banco (Android, app instalado) ----------
  async function receberCompartilhado() {
    if (!location.search.includes('compartilhado') || !window.caches) return;
    history.replaceState(null, '', location.pathname + location.hash);
    const cache = await caches.open('nc-share'), r = await cache.match('arquivo');
    if (!r) { // o app abriu pelo Compartilhar, mas o arquivo não chegou: mostra o que o celular enviou
      const ri = await cache.match('info'); let info = null; try { info = ri && await ri.json(); } catch {}
      abrir(`<h3>Não recebi o comprovante</h3><div style="padding:12px 16px 16px;display:grid;gap:10px">
        <p class="sub" style="margin:0">O app abriu pelo Compartilhar, mas nenhum arquivo chegou. Você pode anexar pelo botão <b>Novo gasto</b> ou <b>Pagar minha parte</b>, escolhendo a foto ou o PDF.</p>
        <p class="sub" style="margin:0;font-size:.75rem">Detalhe técnico: ${U.esc(info ? (info.erro ? 'erro: ' + info.erro : info.campos.length ? 'recebido: ' + info.campos.join(', ') : 'nada recebido') + (info.bytes >= 0 ? ` · corpo ${info.bytes} bytes` : '') + (info.tipo ? ` · ${info.tipo.split(';')[0]}` : '') : 'o compartilhamento não passou pelo app instalado (reinstale o app)')}</p>
        <div class="acoes"><button type="button" class="btn" data-fechar>Entendi</button></div></div>`);
      return;
    }
    const blob = await r.blob(); await cache.delete('arquivo');
    const nome = decodeURIComponent(r.headers.get('X-Nome') || 'comprovante');
    destinoComprovante(new File([blob], nome, { type: blob.type }));
  }

  // com o comprovante em mãos (compartilhado ou escolhido na galeria): pagar parte de um gasto ou criar um novo
  function destinoComprovante(arquivo) {
    const nome = arquivo.name || 'comprovante';
    abrir(`<h3>Comprovante recebido 📎</h3><div style="padding:12px 16px 16px;display:grid;gap:10px">
      <p class="sub" style="margin:0"><b>${U.esc(nome)}</b>. O que você quer fazer com ele?</p>
      <button type="button" class="btn" id="r-pagar">✅ Pagar minha parte de um gasto</button>
      <button type="button" class="btn sec" id="r-novo">➕ Criar novo gasto com este comprovante</button>
      <button type="button" class="btn sec" data-fechar>Agora não</button></div>`, d => {
      d.querySelector('#r-pagar').onclick = () => { d.close(); pendencias(arquivo); };
      d.querySelector('#r-novo').onclick = () => { d.close(); novoGasto({ arquivo }); };
    });
  }

  // ---------- aba "Lançar" ----------
  function acao(sub) { if (sub === 'novo') novoGasto(); else if (sub === 'pagar') pendencias(); }

  App.registrar('lancar', async el => {
    const e = App.eu(), gastos = Store.gastos.lista();
    const minhas = e ? gastos.filter(g => U.pendente(g, e)) : [];
    const totalMinhas = minhas.reduce((s, g) => s + U.parteDe(g, e), 0);
    const P = U.pendencias(gastos);
    const frase = (!P.A.total && !P.B.total) ? (gastos.some(g => g.pag) ? 'Tudo pago 💜' : '')
      : ['A', 'B'].filter(k => P[k].total > 0).map(k => `${n(k)} deve ${U.brl(P[k].total)}`).join(' · ');
    const recentes = gastos.slice().sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id)).slice(0, 6);
    el.innerHTML = `
      <div class="tiles">
        <button class="tile" id="t-novo"><i>➕</i><b>Novo gasto</b><span>O que foi, como foi pago e como dividir.</span></button>
        <button class="tile" id="t-pagar"><i>✅</i><b>Pagar minha parte</b><span>${e ? (minhas.length ? `${minhas.length} pendente(s) · ${U.brl(totalMinhas)}` : 'Nada pendente') : 'Escolha quem você é'}</span></button>
        <label class="tile tile-largo" id="t-comp"><i>📎</i><b>Tenho um comprovante</b><span>Escolha o print ou PDF na galeria e diga a que gasto ele pertence.</span>
          <input type="file" id="t-arq" accept="image/*,application/pdf" hidden></label>
      </div>
      ${frase ? `<div class="acerto">${U.esc(frase)}${P.A.total || P.B.total ? '<br><button class="btn sec" id="b-pend2" style="margin-top:6px">Ver / pagar pendências</button>' : ''}</div>` : ''}
      ${e ? `<p class="sub">Você está usando como <b>${U.esc(n(e))}</b>. <a href="#" id="trocar-eu">Não sou eu</a></p>` : ''}
      <h2 class="titulo-sec">Últimos lançamentos</h2>
      ${recentes.length ? recentes.map(g => `<div class="pend" data-g="${g.id}" role="button" tabindex="0">
        <div><b>${U.esc(g.descricao)}</b><br><span class="sub">${U.dataBR(g.data)} · ${nomeForma(g.forma)} · ${rotuloDiv(g)}</span></div>
        <div style="text-align:right"><b>${U.brl(g.valor)}</b>${compsDoGasto(g).length ? ` <button type="button" class="olho" data-v="${g.id}" aria-label="Ver comprovante" title="Ver comprovante">👁</button>` : ''}<br>${g.pag ? ['A', 'B'].filter(p => U.parteDe(g, p) > 0).map(p => `<span class="chip ${U.pendente(g, p) ? 'ambos' : 'ok'}">${U.pendente(g, p) ? '⏳' : '✔'} ${U.esc(n(p))}</span>`).join(' ') : ''}</div></div>`).join('')
        : '<div class="vazio">Nenhum gasto ainda. Toque em <b>Novo gasto</b> 💜</div>'}
      ${document.body.classList.contains('solo') ? '' : '<p class="sub" style="margin-top:14px">📱 No celular, use a <a href="formulario.html" style="color:var(--realce)">página só do formulário</a>: dá para instalar como app e receber comprovantes do banco.</p>'}`;
    App.$('#t-novo').onclick = () => novoGasto();
    App.$('#t-pagar').onclick = () => pendencias();
    const bp2 = App.$('#b-pend2'); if (bp2) bp2.onclick = () => pendencias();
    App.$('#t-arq').onchange = ev => { const f = ev.target.files[0]; if (f) destinoComprovante(f); ev.target.value = ''; };
    const t = App.$('#trocar-eu'); if (t) t.onclick = ev => { ev.preventDefault(); try { localStorage.removeItem('nc-eu-' + (App.estado.uid || 'local')); } catch {} App.pedirEu().then(() => App.mostrarAtual()); };
    el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => detalhe(b.dataset.g));
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = ev => { ev.stopPropagation(); verComprovantes(b.dataset.v); });
    const sub = location.hash.split('/')[1];
    if (sub) { history.replaceState(null, '', '#lancar'); setTimeout(() => acao(sub), 0); }
  }, () => ({ crumb: 'Financeiro › Lançar', titulo: 'Lançar', sub: 'Registre um gasto ou pague a sua parte e anexe o comprovante.', cta: null }));

  App.novoGasto = novoGasto; App.detalheGasto = detalhe; App.pendencias = pendencias;
  App.verComprovantes = verComprovantes; App.temComprovante = g => compsDoGasto(g).length > 0;

  // ---------- app Android próprio: entrega o comprovante compartilhado em pedaços (base64) ----------
  let pronto = false; const fila = [];
  function chegou(arquivo) { if (pronto) destinoComprovante(arquivo); else fila.push(arquivo); }
  window.NCNativo = (() => {
    let nome = '', tipo = '', partes = [];
    return {
      inicio(n, t) { nome = n || 'comprovante'; tipo = t || 'application/octet-stream'; partes = []; },
      parte(b64) { partes.push(b64); },
      fim() {
        try {
          const bin = atob(partes.join('')), u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          chegou(new File([u8], nome, { type: tipo }));
        } catch (err) { alert('Não consegui ler o comprovante compartilhado: ' + err.message); }
        partes = [];
      },
      erro(msg) { alert('Não consegui receber o comprovante: ' + msg); }
    };
  })();

  return {
    aoIniciar() {
      (async () => {
        await App.pedirEu(); App.mostrarAtual(); await receberCompartilhado();
        pronto = true; while (fila.length) destinoComprovante(fila.shift());
      })().catch(console.error);
    }
  };
})();
