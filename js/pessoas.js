// Aba "Pessoas": a titular cadastra os adicionais da conta (nome e e-mail). Quem cria o login com esse e-mail entra direto na conta.
(() => {
  const site = () => location.origin + location.pathname.replace(/[^/]*$/, '');
  // chama uma função do banco; depois recarrega as pessoas (a tela se redesenha sozinha)
  async function rpc(nome, args) {
    const r = await Store.sb.rpc(nome, args);
    if (r.error) { alert(r.error.message); return false; }
    await App.recarregarConta();
    return true;
  }

  function adicionar() {
    App.form('Novo adicional', [
      { k: 'nome', rotulo: 'Nome', req: true },
      { k: 'email', rotulo: 'E-mail de login (opcional)', tipo: 'email', dica: 'A pessoa cria o login com este e-mail e já entra na conta. Sem e-mail, ela só aparece na divisão dos gastos.' }
    ], {}, async f => {
      if (!await rpc('adicionar_membro', { p_conta: Store.contaId, p_nome: f.nome, p_email: f.email || null })) return false;
      if (f.email) alert(`${f.nome} cadastrado(a). Peça para criar o login em ${site()} usando o e-mail ${f.email.trim().toLowerCase()}.`);
    }, null, 'Cadastrar');
  }

  function editar(m) {
    App.form('Editar ' + m.nome, [
      { k: 'nome', rotulo: 'Nome', req: true },
      ...(m.user_id ? [] : [{ k: 'email', rotulo: 'E-mail de login', tipo: 'email' }])
    ], { nome: m.nome, email: m.email || '' }, async f => rpc('editar_membro', { p_id: m.id, p_nome: f.nome, p_email: m.user_id ? m.email : (f.email || null) }));
  }

  function remover(m) {
    if (!confirm(`Remover ${m.nome} da conta? Os gastos já lançados no nome dessa pessoa deixam de entrar nas contas de divisão.`)) return;
    rpc('remover_membro', { p_id: m.id });
  }

  const situacao = m => m.user_id ? '<span class="chip ok">Entrou</span>' : m.email ? '<span class="chip ambos">Aguardando criar o login</span>' : '<span class="chip">Sem login</span>';

  App.registrar('pessoas', el => {
    if (!Store.sb) { el.innerHTML = '<div class="vazio">As pessoas da conta ficam na nuvem. No modo local, os nomes mudam em ⚙.</div>'; return; }
    const est = App.estado, conta = est.conta || { nome: 'Conta', apelido: '' }, titular = est.papel === 'titular', ms = Store.membros();
    el.innerHTML = `
      <section class="bloco"><h2>👪 ${U.esc(conta.apelido || conta.nome)}</h2>
        <p class="sub">${titular ? 'Você é a <b>titular</b> desta conta: só você cadastra e remove adicionais.' : 'Você é <b>adicional</b> nesta conta: vê e lança os gastos junto com a titular.'}
          ${conta.apelido ? ` Nome da conta para todos: <b>${U.esc(conta.nome)}</b>.` : ''}</p>
        <div class="filtros">${titular ? '<button class="btn sec" id="p-ren">Renomear a conta (todos veem)</button>' : ''}<button class="btn sec" id="p-ap">Meu apelido para esta conta</button></div>
      </section>
      <section class="bloco"><h2>Pessoas</h2>
        <table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th></th></tr></thead><tbody>${ms.map(m => `
          <tr><td>${U.esc(m.nome)}${m.user_id === est.uid ? ' <span class="sub">(você)</span>' : ''}</td><td>${U.esc(m.email || '—')}</td>
          <td><span class="chip ${m.papel === 'titular' ? 'ambos' : ''}">${m.papel === 'titular' ? 'Titular' : 'Adicional'}</span></td><td>${situacao(m)}</td>
          <td>${titular ? `<button class="mini" data-e="${m.id}" aria-label="Editar">✏️</button>${m.papel === 'titular' ? '' : `<button class="mini" data-x="${m.id}" aria-label="Remover">🗑</button>`}` : ''}</td></tr>`).join('')}</tbody></table>
        ${titular ? '<div class="filtros" style="margin-top:8px"><button class="btn" id="p-add">+ Novo adicional</button></div>' : ''}
        <p class="sub" style="margin-top:10px">Cadastrando o e-mail de um adicional, ele cria o login em <b>${U.esc(site())}</b> com esse mesmo e-mail e já entra na conta, sem precisar de liberação.</p>
      </section>`;
    const add = App.$('#p-add'); if (add) add.onclick = adicionar;
    const ren = App.$('#p-ren'); if (ren) ren.onclick = () => App.form('Nome da conta', [{ k: 'nome', rotulo: 'Nome', req: true }], { nome: conta.nome }, f => rpc('renomear_conta', { p_conta: Store.contaId, p_nome: f.nome }));
    App.$('#p-ap').onclick = () => App.form('Meu apelido para esta conta', [{ k: 'ap', rotulo: 'Como você chama esta conta', dica: 'Só você vê. Ex.: "Conta 1", "Conta da mãe". Vazio volta ao nome original.' }],
      { ap: conta.apelido }, f => rpc('apelido_conta', { p_conta: Store.contaId, p_apelido: f.ap }));
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => editar(ms.find(m => m.id === b.dataset.e)));
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => remover(ms.find(m => m.id === b.dataset.x)));
  }, () => ({ crumb: 'Conta › Pessoas', titulo: 'Pessoas', sub: 'Quem faz parte desta conta: a titular e os adicionais.', cta: null }));
})();
