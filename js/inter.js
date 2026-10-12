(() => {
  const DIV = () => [['meio', 'Meio a meio (50/50)'], ['A', `Só ${App.nome('A')}`], ['B', `Só ${App.nome('B')}`], ['custom', `Personalizada (parte de ${App.nome('A')})`]];
  const nomeDiv = l => ({ meio: '50/50', A: `Só ${App.nome('A')}`, B: `Só ${App.nome('B')}` }[l.divisao] || `${U.brl(U.partes(l)[0])} / ${U.brl(U.partes(l)[1])}`);

  function editar(l) {
    const campos = [
      { k: 'data', rotulo: 'Data da compra', tipo: 'date', req: true },
      { k: 'descricao', rotulo: 'Descrição', req: true },
      { k: 'valor', rotulo: 'Valor (R$)', inputmode: 'decimal', req: true },
      { k: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: Store.categorias.map(c => [c, c]) },
      { k: 'divisao', rotulo: 'Divisão', tipo: 'select', opcoes: DIV() },
      { k: 'parteA', rotulo: `Se personalizada: parte de ${App.nome('A')} (R$)`, inputmode: 'decimal' }
    ];
    const v = l ? { ...l, valor: U.valorInput(l.valor), parteA: l.divisao === 'custom' ? U.valorInput(l.parteA) : '' }
      : { data: U.hoje(), divisao: 'meio', categoria: Store.categorias[0] };
    App.form(l ? 'Editar lançamento' : 'Novo lançamento no Inter', campos, v, f => {
      const valor = U.parseValor(f.valor);
      if (!(valor > 0)) { alert('Valor inválido.'); return false; }
      let parteA = 0;
      if (f.divisao === 'custom') {
        parteA = U.parseValor(f.parteA);
        if (!(parteA >= 0 && parteA <= valor)) { alert('Parte inválida (entre 0 e o valor total).'); return false; }
      }
      // mes = fatura à qual a compra pertence, pela data e pelo dia de fechamento
      const o = { data: f.data, descricao: f.descricao, categoria: f.categoria, valor, divisao: f.divisao, parteA, mes: U.mesFatura(f.data) };
      l ? Store.inter.set(l.id, o) : Store.inter.add(o);
    });
  }

  function faturaForm() {
    const m = App.estado.mes, f = Store.fatura(m);
    App.form('Fatura de ' + U.mesNome(m), [
      { k: 'pagaPor', rotulo: 'Quem pagou a fatura', tipo: 'select', opcoes: [['A', App.nome('A')], ['B', App.nome('B')]] },
      { k: 'status', rotulo: 'Situação', tipo: 'select', opcoes: [['aberta', 'Aberta'], ['paga', 'Paga']] },
      { k: 'pagaEm', rotulo: 'Data do pagamento', tipo: 'date' }
    ], { ...f, pagaEm: f.pagaEm || U.hoje() }, v => { Store.setFatura(m, { pagaPor: v.pagaPor, status: v.status, pagaEm: v.status === 'paga' ? v.pagaEm : '' }); });
  }

  async function anexar(file) {
    try {
      const dataUrl = await U.anexo(file);
      Store.comprovantes.add({ mes: App.estado.mes, nome: file.name, tipo: dataUrl.startsWith('data:application/pdf') ? 'pdf' : 'img', dataUrl, enviadoEm: U.hoje() });
    } catch (e) { alert(e.message); }
  }

  function ver(c) {
    const dlg = App.$('#dlg');
    dlg.innerHTML = `<h3>${U.esc(c.nome)}</h3><form method="dialog" style="padding:10px">
      ${c.tipo === 'img' ? `<img class="grande" src="${c.dataUrl}">` : `<object data="${c.dataUrl}" type="application/pdf" style="width:100%;height:60vh"><a href="${c.dataUrl}" download="${U.esc(c.nome)}">Baixar PDF</a></object>`}
      <div class="acoes"><button type="button" class="btn sec" id="c-del">🗑 Excluir</button><button class="btn">Fechar</button></div></form>`;
    dlg.querySelector('#c-del').onclick = () => { if (confirm('Excluir comprovante?')) { dlg.close(); Store.comprovantes.del(c.id); } };
    dlg.showModal();
  }

  App.registrar('inter', el => {
    const m = App.estado.mes, ls = Store.lancInter(m).sort((a, b) => b.data.localeCompare(a.data));
    const fat = Store.fatura(m);
    const d = U.calcularDivisao(ls, fat, []), cs = Store.comprovantes.lista().filter(c => c.mes === m && !c.gastoId);
    const nome = App.nome;
    // quanto falta cada um pagar: só as partes ainda pendentes (as pagas com "Pagar minha parte" saem da conta)
    const P = U.pendencias(ls.filter(l => l.pag)), falta = k => P[k].total, semControle = ls.filter(l => !l.pag).length;
    const frase = !ls.length ? 'Sem lançamentos neste fechamento.' : (!falta('A') && !falta('B')) ? 'Tudo pago 💜'
      : ['A', 'B'].filter(k => falta(k) > 0).map(k => `${nome(k)} ainda falta pagar ${U.brl(falta(k))}`).join(' · ');
    el.innerHTML = `<div class="mes" id="nav"></div>
      <p class="sub" style="text-align:center;margin:-6px 0 14px">Fatura que fecha dia ${U.diaFecha()}: compras de <b>${U.periodoFatura(m)}</b></p>
      <div class="cards">
        <div class="card"><small>Total da fatura</small><strong>${U.brl(d.total)}</strong></div>
        <div class="card a"><small>Parte de ${U.esc(nome('A'))}</small><strong>${U.brl(d.devA)}</strong></div>
        <div class="card b"><small>Parte de ${U.esc(nome('B'))}</small><strong>${U.brl(d.devB)}</strong></div>
        <div class="card"><small>Fatura</small><span class="selo ${fat.status}">${fat.status === 'paga' ? 'PAGA' : 'ABERTA'}</span>
          <small style="margin-top:4px">${fat.pagaEm ? 'paga em ' + U.dataBR(fat.pagaEm) : ''}</small></div>
      </div>
      <div class="cards">
        <div class="card a"><small>Falta pagar · ${U.esc(nome('A'))}</small><strong>${U.brl(falta('A'))}</strong></div>
        <div class="card b"><small>Falta pagar · ${U.esc(nome('B'))}</small><strong>${U.brl(falta('B'))}</strong></div>
      </div>
      <div class="acerto">${U.esc(frase)}${semControle ? `<br><span class="sub" style="font-weight:500">${semControle} lançamento(s) antigo(s) não têm controle de pagamento e não entram nessa conta.</span>` : ''}</div>
      <div class="filtros"><button class="btn" id="b-novo">+ Lançamento</button><button class="btn sec" id="b-pend">Ver / pagar pendências</button><button class="btn sec" id="b-fat">Marcar fatura como paga</button></div>
      ${ls.length ? `<table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Divisão</th><th class="v">Valor</th><th></th></tr></thead><tbody>${ls.map(l => `
        <tr><td>${U.dataBR(l.data)}</td><td>${U.esc(l.descricao)}${l.origem ? ` <span title="Veio do Painel de Compras${l.fixo ? ' (gasto fixo)' : ''}">${l.fixo ? '🔁' : '🛍'}</span>` : ''}</td><td><span class="chip">${U.esc(l.categoria)}</span></td><td>${U.esc(nomeDiv(l))}</td>
        <td class="v">${U.brl(l.valor)}</td><td>${l.origem && l.pag && App.temComprovante(l) ? `<button class="mini" data-v="${l.id}" aria-label="Ver comprovante" title="Ver comprovante">👁</button>` : ''}<button class="mini" data-e="${l.id}" data-o="${l.origem || ''}" aria-label="Editar">✏️</button><button class="mini" data-x="${l.id}" data-o="${l.origem || ''}" aria-label="Excluir">🗑</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="vazio">Nenhum lançamento neste mês.</div>'}
      <section class="bloco"><h2>Comprovantes de pagamento</h2>
        <div class="comps">${cs.map(c => `<div class="comp" data-c="${c.id}">${c.tipo === 'img' ? `<img src="${c.dataUrl}" alt="">` : '<div class="pdf">📄</div>'}${U.esc(c.nome)}</div>`).join('') || '<span class="sub">Nenhum comprovante ainda.</span>'}</div>
        <p><label class="btn" style="display:inline-flex;align-items:center">📎 Anexar comprovante<input id="arq" type="file" accept="image/*,application/pdf" multiple hidden></label></p>
      </section>`;
    App.navMes(App.$('#nav'), () => App.mostrarAtual());
    App.$('#b-novo').onclick = () => App.novoGasto();
    App.$('#b-pend').onclick = () => App.pendencias();
    App.$('#b-fat').onclick = faturaForm;
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => b.dataset.o ? App.editarGasto(b.dataset.e) : editar(Store.inter.lista().find(l => l.id === b.dataset.e)));
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { if (confirm('Excluir lançamento?')) (b.dataset.o ? Store.gastos : Store.inter).del(b.dataset.x); });
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => App.verComprovantes(b.dataset.v));
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => ver(Store.comprovantes.lista().find(c => c.id === b.dataset.c)));
    App.$('#arq').onchange = async e => { for (const f of e.target.files) await anexar(f); };
  }, () => ({ crumb: 'Financeiro › Cartão Inter', titulo: 'Cartão Inter', sub: 'Fatura compartilhada, divisão entre vocês e comprovantes de pagamento.', cta: { rotulo: 'Novo lançamento', fn: () => App.novoGasto() } }));
})();
