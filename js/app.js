const App = (() => {
  const abas = {}, metas = {};
  let atual = 'compras';
  const estado = { mes: U.mesAtual(), admin: false, eu: null, papel: '', contas: [] };
  const $ = s => document.querySelector(s);
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const ler = k => { try { return localStorage.getItem(k); } catch { return null; } };

  const pessoa = k => Store.pessoas().find(p => p.id === k);
  function nome(k) { return k === 'ambos' || k === 'meio' ? 'Todos' : (pessoa(k) || { nome: k }).nome; }
  // "Todos", "Só Maria", "Maria + João": quem participa de uma divisão
  function rotuloDiv(div) {
    const q = U.quem(div), n = U.ids().length;
    if (!q.length) return '—';
    if (q.length === n && n > 1) return 'Todos';
    return q.length === 1 ? 'Só ' + nome(q[0]) : q.map(nome).join(' + ');
  }

  // Modal de formulário genérico. campos: [{k,rotulo,tipo,opcoes,req}]
  // tipo 'checks': várias caixinhas (opcoes: [[valor, texto]]); o valor do campo vira "A,C" (vazio/'meio' = todas marcadas)
  function form(titulo, campos, valores, aoSalvar, extra, rotuloOk) {
    const dlg = $('#dlg');
    const marcados = c => { const v = valores[c.k]; return !v || v === 'meio' || v === 'ambos' ? c.opcoes.map(o => o[0]) : String(v).split(','); };
    dlg.innerHTML = `<h3>${U.esc(titulo)}</h3><form method="dialog">${campos.map(c => c.tipo === 'checks' ? `
      <fieldset class="checks"><legend>${U.esc(c.rotulo)}</legend>${c.opcoes.map(([v, t]) => `<label class="chk"><input type="checkbox" name="${c.k}" value="${U.esc(v)}" ${marcados(c).includes(v) ? 'checked' : ''}> ${U.esc(t)}</label>`).join('')}
        ${c.dica ? `<span class="dica">${U.esc(c.dica)}</span>` : ''}</fieldset>` : `
      <label>${U.esc(c.rotulo)}${c.tipo === 'select'
        ? `<select name="${c.k}">${c.opcoes.map(([v, t]) => `<option value="${U.esc(v)}" ${valores[c.k] === v ? 'selected' : ''}>${U.esc(t)}</option>`).join('')}</select>`
        : c.tipo === 'file'
          ? `<input name="${c.k}" type="file" accept="${c.accept || ''}">`
          : `<input name="${c.k}" type="${c.tipo || 'text'}" value="${U.esc(valores[c.k] ?? '')}" ${c.req ? 'required' : ''} ${c.inputmode ? `inputmode="${c.inputmode}"` : ''}>`}
        ${c.dica ? `<span class="dica">${U.esc(c.dica)}</span>` : ''}
      </label>`).join('')}
      <div class="acoes">${extra ? '<button type="button" class="btn sec" id="f-extra">' + extra.rotulo + '</button>' : ''}
      <button type="button" class="btn sec" id="f-cancel">Cancelar</button><button class="btn" id="f-ok">${U.esc(rotuloOk || 'Salvar')}</button></div></form>`;
    dlg.querySelector('#f-cancel').onclick = () => dlg.close();
    if (extra) dlg.querySelector('#f-extra').onclick = () => { dlg.close(); extra.fn(); };
    dlg.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const dados = new FormData(e.target), fd = Object.fromEntries(dados);
      campos.filter(c => c.tipo === 'checks').forEach(c => { fd[c.k] = dados.getAll(c.k).join(','); });
      const r = aoSalvar(fd);
      if (r && r.then) { // salvamento assíncrono (ex.: anexar comprovante)
        const ok = dlg.querySelector('#f-ok'); ok.disabled = true;
        r.then(v => { if (v === false) ok.disabled = false; else dlg.close(); }).catch(err => { ok.disabled = false; alert(err.message || err); });
      } else if (r !== false) dlg.close();
    };
    dlg.showModal();
  }

  function navMes(el, aoMudar) {
    el.innerHTML = `<button data-d="-1" aria-label="Mês anterior">‹</button><b>${U.mesNome(estado.mes)}</b><button data-d="1" aria-label="Próximo mês">›</button>`;
    el.querySelectorAll('button').forEach(b => b.onclick = () => { estado.mes = U.mesSoma(estado.mes, +b.dataset.d); aoMudar(); });
  }

  // Quem sou eu: na nuvem, a pessoa ligada ao meu login nesta conta; no modo local, o que foi escolhido neste aparelho
  const chaveEu = () => 'nc-eu-' + (estado.uid || 'local');
  const eu = () => estado.eu || (Store.nuvem ? null : ler(chaveEu()));
  function pedirEu() {
    return new Promise(ok => {
      if (eu()) return ok(eu());
      form('Quem é você?', [{ k: 'p', rotulo: 'Assim o site registra os gastos no seu nome neste aparelho', tipo: 'select', opcoes: Store.pessoas().map(p => [p.id, p.nome]) }],
        { p: Store.pessoas()[0].id }, f => { guardar(chaveEu(), f.p); ok(f.p); }, null, 'Continuar');
      $('#dlg').addEventListener('close', () => ok(eu()), { once: true });
    });
  }
  // "Não sou eu" (só no modo local): esquece a escolha e pergunta de novo
  function trocarEu() {
    try { localStorage.removeItem(chaveEu()); } catch {}
    return pedirEu();
  }

  // ---- abas: cada conta liga ou desliga algumas ----
  const LIGAVEIS = [['inter', () => U.cartao()], ['viagens', () => 'Viagens'], ['caixinhas', () => 'Caixinhas'], ['loop', () => (typeof Programas !== 'undefined' ? Programas.nome() : 'Pontos')]];
  function abaLigada(a) {
    const c = Store.config;
    if (a === 'usuarios') return estado.admin;
    if (a === 'pessoas') return Store.nuvem;
    if (a === 'loop' && (!c.programa || c.programa === 'nenhum')) return false;
    return !(c.abasOff || []).includes(a);
  }
  function atualizarNav() {
    document.querySelectorAll('nav.tabs button').forEach(b => {
      const a = b.dataset.aba; b.hidden = !abaLigada(a);
      const s = b.querySelector('span');
      if (a === 'inter') s.textContent = U.cartao(); else if (a === 'loop') s.textContent = LIGAVEIS[3][1]();
    });
    document.querySelectorAll('.grupo.adm').forEach(x => x.hidden = !estado.admin);
  }

  function mostrar(aba) {
    atual = aba;
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.aba === aba));
    const m = metas[aba]();
    $('#crumb').textContent = m.crumb; $('#h-titulo').textContent = m.titulo; $('#h-sub').textContent = m.sub;
    const cta = $('#cta'); cta.hidden = !m.cta;
    if (m.cta) { cta.textContent = '＋ ' + m.cta.rotulo; cta.onclick = m.cta.fn; }
    document.title = m.titulo + ' · Nosso Controle';
    abas[aba]($('#main'));
  }

  const camposGerais = valores => {
    const prog = typeof Programas !== 'undefined' ? Programas.lista() : [];
    return [
      { k: 'banco', rotulo: 'Banco do cartão de crédito', dica: 'Ex.: Inter, Nubank, Itaú. Aparece no nome da aba do cartão e nos avisos.' },
      { k: 'diaFechamento', rotulo: 'Dia em que a fatura fecha (1 a 28)', tipo: 'number' },
      { k: 'diaVencimento', rotulo: 'Dia do vencimento / débito automático da fatura (1 a 28)', tipo: 'number' },
      ...(prog.length ? [
        { k: 'programa', rotulo: 'Programa de pontos do cartão', tipo: 'select', opcoes: prog.map(p => [p.id, p.nome]), dica: 'Os pontos são calculados sozinhos pela fatura.' },
        { k: 'programaNome', rotulo: 'Nome do programa (só se escolheu "Outro")' }] : []),
      { k: 'abas', rotulo: 'Abas que esta conta usa', tipo: 'checks', opcoes: LIGAVEIS.map(([id, t]) => [id, t()]) },
      { k: 'cats', rotulo: 'Categorias (separadas por vírgula)' }
    ];
  };
  // grava o que veio do formulário de configuração (usado também pelo assistente inicial)
  function salvarGerais(f) {
    const prog = typeof Programas !== 'undefined' ? f.programa : Store.config.programa;
    const mudou = prog !== Store.config.programa;
    const ligadas = (f.abas || '').split(',');
    Store.setConfig({
      banco: (f.banco || '').trim(), programa: prog, programaNome: (f.programaNome || '').trim(), configurado: true,
      abasOff: LIGAVEIS.map(x => x[0]).filter(a => !ligadas.includes(a)),
      diaFechamento: Math.min(28, Math.max(1, parseInt(f.diaFechamento, 10) || 16)), diaVencimento: Math.min(28, Math.max(1, parseInt(f.diaVencimento, 10) || 22)),
      ...(mudou && typeof Programas !== 'undefined' ? Programas.regras(prog) : {})
    });
    const l = (f.cats || '').split(',').map(s => s.trim()).filter(Boolean);
    if (l.length) Store.setCategorias([...new Set(l)]);
  }
  const valoresGerais = () => ({ ...Store.config, cats: Store.categorias.join(', '), abas: LIGAVEIS.map(x => x[0]).filter(a => !(Store.config.abasOff || []).includes(a)).join(',') });

  function config() {
    const local = !Store.nuvem;
    form(local ? 'Nomes e backup' : 'Configurações da conta', [
      ...(local ? [{ k: 'nomeA', rotulo: 'Nome da pessoa 1', req: true }, { k: 'nomeB', rotulo: 'Nome da pessoa 2', req: true }] : []),
      ...camposGerais()
    ], valoresGerais(), f => {
      if (local) Store.setConfig({ nomeA: f.nomeA.trim(), nomeB: f.nomeB.trim() });
      salvarGerais(f);
    }, {
      rotulo: '⬇ Backup', fn: () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([Store.exportar()], { type: 'application/json' }));
        a.download = `backup-financeiro-${U.hoje()}.json`; a.click();
      }
    });
  }

  // primeira vez que a titular abre uma conta nova: pergunta o essencial
  function assistente() {
    form('Vamos configurar a conta 💜', camposGerais(), valoresGerais(), f => { salvarGerais(f); }, null, 'Começar');
  }

  // ---- nuvem: login, contas e pessoas ----
  async function carregarMembros(sb) {
    const r = await sb.from('membros').select('*').eq('conta_id', estado.contaId).order('pessoa');
    if (r.error) throw r.error;
    return r.data;
  }
  async function carregarContas(sb) {
    const r = await sb.from('membros').select('conta_id, pessoa, papel, apelido, contas(id, nome)').eq('user_id', estado.uid);
    if (r.error) throw r.error;
    estado.contas = r.data.map(m => ({ id: m.conta_id, pessoa: m.pessoa, papel: m.papel, apelido: m.apelido || '', nome: m.contas ? m.contas.nome : 'Conta' }));
    const c = estado.contas.find(x => x.id === estado.contaId); if (c) estado.conta = c;
  }
  const rotuloConta = c => (c.apelido || c.nome) + (c.papel === 'titular' ? ' (titular)' : ' (adicional)');
  // barra "Conta: [Conta 1 ▾]" só aparece para quem está em mais de uma conta
  function barraConta() {
    let el = $('#conta-barra');
    if (!el) { el = document.createElement('div'); el.id = 'conta-barra'; const ref = $('#aviso-fatura'); ref.parentNode.insertBefore(el, ref); }
    el.hidden = estado.contas.length < 2;
    el.innerHTML = `<label>Conta <select id="sel-conta">${estado.contas.map(c => `<option value="${c.id}" ${c.id === estado.contaId ? 'selected' : ''}>${U.esc(rotuloConta(c))}</option>`).join('')}</select></label>`;
    $('#sel-conta').onchange = e => { guardar('nc-conta-' + estado.uid, e.target.value); location.reload(); };
  }
  async function recarregarConta() {
    const sb = Store.sb; if (!sb) return;
    await carregarContas(sb);
    Store.setMembros(await carregarMembros(sb));
    barraConta();
  }

  async function entrarNaNuvem(sb) {
    const box = $('#login'), f = $('#login-form'), erro = $('#login-erro'), espera = $('#espera'), nova = $('#nova-conta');
    let { data: { session } } = await sb.auth.getSession();
    if (!session) {
      box.hidden = false;
      let modo = 'entrar';
      f.querySelectorAll('.login-abas button').forEach(b => b.onclick = () => {
        modo = b.dataset.modo; erro.textContent = '';
        f.querySelectorAll('.login-abas button').forEach(x => x.classList.toggle('on', x === b));
        $('#l-nome').hidden = modo !== 'criar'; $('#login-ok').textContent = modo === 'criar' ? 'Criar login' : 'Entrar';
        f.senha.autocomplete = modo === 'criar' ? 'new-password' : 'current-password';
      });
      await new Promise(ok => {
        f.onsubmit = async e => {
          e.preventDefault(); erro.textContent = '';
          const { email, senha, nome } = Object.fromEntries(new FormData(f));
          let r;
          if (modo === 'criar') {
            r = await sb.auth.signUp({ email: email.trim(), password: senha, options: { data: { nome: (nome || '').trim() } } });
            if (!r.error && !r.data.session) { erro.textContent = 'Login criado! Confirme o e-mail que enviamos e depois entre.'; return; }
          } else r = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
          if (r.error) { erro.textContent = modo === 'criar' ? 'Não consegui criar: ' + r.error.message : 'E-mail ou senha incorretos.'; return; }
          session = r.data.session; box.hidden = true; ok();
        };
      });
    }
    estado.uid = session.user.id; estado.email = session.user.email || '';
    // liga este login às contas em que alguém cadastrou o e-mail; depois lê o perfil e as contas
    let diag = '';
    const carregar = async () => {
      await sb.rpc('reivindicar_convites');
      const [p, m] = await Promise.all([
        sb.from('usuarios').select('*').eq('id', estado.uid).maybeSingle(),
        sb.from('membros').select('conta_id, pessoa, papel, apelido, contas(id, nome)').eq('user_id', estado.uid)]);
      diag = `conta ${estado.email}: ` + (p.error ? 'erro ao ler: ' + p.error.message : p.data ? (p.data.aprovado ? 'liberada' : 'ainda NÃO liberada') : 'não existe na lista de usuários (entre de novo com a conta certa)');
      return { perfil: p.data, ms: m.data || [] };
    };
    let r = await carregar();
    while (!r.ms.length) {
      box.hidden = false; f.hidden = true;
      if (r.perfil && r.perfil.aprovado) { // liberada e sem conta ainda: cria a conta, e ela vira titular
        nova.hidden = false;
        await new Promise(ok => {
          const nf = $('#nova-conta-form');
          nf.onsubmit = async e => {
            e.preventDefault(); $('#nova-conta-erro').textContent = '';
            const x = await sb.rpc('criar_conta', { p_nome: new FormData(nf).get('nome') });
            if (x.error) { $('#nova-conta-erro').textContent = 'Não consegui criar: ' + x.error.message; return; }
            ok();
          };
        });
        nova.hidden = true;
      } else {
        espera.hidden = false; $('#espera-erro').textContent = diag;
        await new Promise(ok => {
          $('#espera-sair').onclick = async () => { await sb.auth.signOut(); location.reload(); };
          $('#espera-ver').onclick = async () => {
            r = await carregar();
            if (r.ms.length || (r.perfil && r.perfil.aprovado)) { espera.hidden = true; ok(); }
            else $('#espera-erro').textContent = 'Ainda não foi liberado. ' + diag;
          };
        });
        espera.hidden = true;
      }
      r = await carregar();
    }
    box.hidden = true;
    const escolhida = r.ms.find(m => m.conta_id === ler('nc-conta-' + estado.uid)) || r.ms[0];
    estado.contaId = escolhida.conta_id; estado.eu = escolhida.pessoa; estado.papel = escolhida.papel;
    estado.admin = !!(r.perfil && r.perfil.aprovado && r.perfil.admin);
    await carregarContas(sb);
    guardar('nc-conta-' + estado.uid, estado.contaId);
    const n = await Store.conectar(sb, { id: estado.contaId, membros: await carregarMembros(sb) });
    barraConta();
    // dados guardados neste navegador (modo local): oferece subir, uma vez, para a conta de quem é titular
    const locais = n === 0 && estado.papel === 'titular' && !ler('nc-local-visto') && Store.dadosLocais();
    if (locais) { guardar('nc-local-visto', '1'); if (confirm('Encontrei dados salvos neste navegador. Enviar para a nuvem agora?')) await Store.subirLocais(locais); }
  }

  return {
    estado, nome, form, navMes, $, mostrarAtual: () => mostrar(atual), eu, pedirEu, trocarEu, rotuloDiv, recarregarConta,
    outros: k => U.ids().filter(i => i !== k),
    // meta: () => ({ crumb, titulo, sub, cta: { rotulo, fn } })
    registrar: (k, f, meta) => { abas[k] = f; metas[k] = meta; },
    // barra comparativa horizontal; segs: [{ rotulo, valor, cor }]
    barra(titulo, segs) {
      const tot = segs.reduce((s, x) => s + x.valor, 0);
      if (!tot) return `<div class="cmp"><div class="cmp-t">${U.esc(titulo)}</div><div class="sub">Sem dados neste mês.</div></div>`;
      return `<div class="cmp"><div class="cmp-t">${U.esc(titulo)}</div>
        <div class="cmp-bar">${segs.filter(x => x.valor > 0).map(x => `<div class="seg" style="flex:${x.valor};background:${x.cor}">${U.esc(x.rotulo)}</div>`).join('')}</div>
        <div class="cmp-leg">${segs.map(x => `<span><i style="background:${x.cor}"></i>${U.esc(x.rotulo)}: ${U.brl(x.valor)}</span>`).join('')}</div></div>`;
    },
    // cor de cada pessoa nos gráficos
    cor: k => ['#9b5de5', '#f4c53d', '#5aaaff', '#3fbf8a', '#f5a623', '#d96ba0'][Math.max(0, U.ids().indexOf(k)) % 6],
    async iniciar() {
      const t = () => {
        $('#data').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const ps = Store.pessoas(); $('#user').textContent = ps.map(p => p.nome).join(' & ');
        $('#avatar').textContent = ps.slice(0, 2).map(p => (p.nome || '?').trim().slice(0, 1).toUpperCase()).join('');
        atualizarNav();
      };
      t();
      document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => { location.hash = b.dataset.aba; });
      document.querySelectorAll('.js-config').forEach(b => b.onclick = config);
      const raiz = document.documentElement, bts = document.querySelectorAll('.js-tema');
      const icone = () => bts.forEach(b => b.textContent = raiz.dataset.theme === 'dark' ? '☀️' : '🌙');
      icone();
      bts.forEach(b => b.onclick = () => {
        raiz.dataset.theme = raiz.dataset.theme === 'dark' ? 'light' : 'dark';
        guardar('nc-tema', raiz.dataset.theme);
        icone();
      });
      Store.onChange(() => { t(); if (!abaLigada(atual) && abas.lancar) { location.hash = 'lancar'; return; } mostrar(atual); });
      const rota = () => { const a = location.hash.slice(1).split('/')[0]; mostrar(abas[a] && abaLigada(a) ? a : 'lancar'); };
      window.addEventListener('hashchange', rota);
      const cfg = window.NC_SUPABASE;
      // ?local no endereço = ignora a nuvem (útil para testar o visual sem login)
      if (cfg && cfg.key && window.supabase && !location.search.includes('local')) {
        await entrarNaNuvem(window.supabase.createClient(cfg.url, cfg.key));
        document.querySelectorAll('.js-sair').forEach(b => { b.hidden = false; b.onclick = async () => { await Store.sair(); location.reload(); }; });
        $('#f-dados').textContent = 'Os dados ficam na nuvem (Supabase) e aparecem ao vivo nos celulares de todos da conta.';
        t();
      }
      rota();
      if (typeof Lancar !== 'undefined') Lancar.aoIniciar();
      if (Store.nuvem && estado.papel === 'titular' && !Store.config.configurado && document.querySelector('nav.tabs')) assistente();
    }
  };
})();
