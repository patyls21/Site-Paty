// Aba "Usuários": só administradores. Libera, bloqueia e promove contas (tabela public.usuarios).
(() => {
  App.registrar('usuarios', async el => {
    if (!App.estado.admin || !Store.sb) { el.innerHTML = '<div class="vazio">Esta área é só para administradores.</div>'; return; }
    el.innerHTML = '<div class="vazio">Carregando…</div>';
    const { data, error } = await Store.sb.from('usuarios').select('*').order('criado_em');
    if (error) { el.innerHTML = `<div class="vazio">Erro: ${U.esc(error.message)}</div>`; return; }
    const meu = (await Store.sb.auth.getUser()).data.user?.id;
    const pend = data.filter(u => !u.aprovado).length;
    el.innerHTML = `${pend ? `<div class="acerto">${pend} pessoa(s) aguardando liberação</div>` : ''}
      <table><thead><tr><th>Nome</th><th>E-mail</th><th>Situação</th><th>Desde</th><th></th></tr></thead><tbody>${data.map(u => `
        <tr><td>${U.esc(u.nome || '—')}</td><td>${U.esc(u.email)}</td>
        <td><span class="chip ${u.aprovado ? 'ok' : 'ambos'}">${u.aprovado ? 'Liberado' : 'Aguardando'}</span>${u.admin ? ' <span class="chip">Admin</span>' : ''}</td>
        <td>${U.dataBR(u.criado_em.slice(0, 10))}</td>
        <td>${u.id === meu ? '<span class="sub">você</span>' : `
          <button class="btn ${u.aprovado ? 'sec' : ''}" data-ap="${u.id}" data-v="${!u.aprovado}">${u.aprovado ? 'Bloquear' : 'Liberar'}</button>
          ${u.aprovado ? `<button class="btn sec" data-ad="${u.id}" data-v="${!u.admin}">${u.admin ? 'Tirar admin' : 'Tornar admin'}</button>` : ''}
          <button class="mini" data-rm="${u.id}" aria-label="Excluir conta">🗑</button>`}</td></tr>`).join('')}</tbody></table>
      <p class="sub" style="margin-top:10px">Quem cria login pelo site e não foi cadastrado como adicional fica "Aguardando" até você liberar aqui. Liberada, a pessoa cria a própria conta e vira titular.</p>`;
    const mudar = async (id, campos) => {
      const r = await Store.sb.from('usuarios').update(campos).eq('id', id);
      if (r.error) alert('Erro: ' + r.error.message); App.mostrarAtual();
    };
    el.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => mudar(b.dataset.ap, { aprovado: b.dataset.v === 'true', ...(b.dataset.v === 'false' ? { admin: false } : {}) }));
    el.querySelectorAll('[data-ad]').forEach(b => b.onclick = () => mudar(b.dataset.ad, { admin: b.dataset.v === 'true' }));
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      if (!confirm('Remover este usuário da lista? (a conta de login continua existindo no Supabase)')) return;
      const r = await Store.sb.from('usuarios').delete().eq('id', b.dataset.rm);
      if (r.error) alert('Erro: ' + r.error.message); App.mostrarAtual();
    });
  }, () => ({ crumb: 'Administração › Liberar contas', titulo: 'Liberar contas', sub: 'Libere quem pode ter uma conta própria (ser titular). Adicionais não precisam de liberação: entram pelo cadastro da titular.', cta: null }));
})();
