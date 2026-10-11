const App = (() => {
  const abas = {}, metas = {};
  let atual = 'compras';
  const estado = { mes: U.mesAtual(), admin: false };
  const $ = s => document.querySelector(s);

  function nome(k) { return k === 'A' ? Store.config.nomeA : k === 'B' ? Store.config.nomeB : 'Ambos'; }

  // Modal de formulário genérico. campos: [{k,rotulo,tipo,opcoes,req}]
  function form(titulo, campos, valores, aoSalvar, extra, rotuloOk) {
    const dlg = $('#dlg');
    dlg.innerHTML = `<h3>${U.esc(titulo)}</h3><form method="dialog">${campos.map(c => `
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
      const fd = Object.fromEntries(new FormData(e.target));
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

  // Quem sou eu (A ou B): lembrado neste aparelho, por conta de login
  const chaveEu = () => 'nc-eu-' + (estado.uid || 'local');
  const eu = () => { try { return localStorage.getItem(chaveEu()); } catch { return null; } };
  function pedirEu() {
    return new Promise(ok => {
      if (eu()) return ok(eu());
      form('Quem é você?', [{ k: 'p', rotulo: 'Assim o site registra os gastos no seu nome neste aparelho', tipo: 'select', opcoes: [['A', nome('A')], ['B', nome('B')]] }],
        { p: 'A' }, f => { try { localStorage.setItem(chaveEu(), f.p); } catch {} ok(f.p); }, null, 'Continuar');
      $('#dlg').addEventListener('close', () => ok(eu()), { once: true });
    });
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

  function config() {
    form('Nomes e backup', [
      { k: 'nomeA', rotulo: 'Seu nome', req: true },
      { k: 'nomeB', rotulo: 'Nome do namorado', req: true },
      { k: 'cats', rotulo: 'Categorias (separadas por vírgula)' }
    ], { ...Store.config, cats: Store.categorias.join(', ') }, f => {
      Store.setConfig({ nomeA: f.nomeA.trim(), nomeB: f.nomeB.trim() });
      const l = f.cats.split(',').map(s => s.trim()).filter(Boolean);
      if (l.length) Store.setCategorias([...new Set(l)]);
    }, {
      rotulo: '⬇ Backup', fn: () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([Store.exportar()], { type: 'application/json' }));
        a.download = `backup-financeiro-${U.hoje()}.json`; a.click();
      }
    });
  }

  // login (Supabase Auth) + carga dos dados da nuvem
  async function entrarNaNuvem(sb) {
    const box = $('#login'), f = $('#login-form'), erro = $('#login-erro'), espera = $('#espera');
    const perfil = async () => (await sb.from('usuarios').select('*').maybeSingle()).data;
    let { data: { session } } = await sb.auth.getSession();
    if (!session) {
      box.hidden = false;
      let modo = 'entrar';
      f.querySelectorAll('.login-abas button').forEach(b => b.onclick = () => {
        modo = b.dataset.modo; erro.textContent = '';
        f.querySelectorAll('.login-abas button').forEach(x => x.classList.toggle('on', x === b));
        $('#l-nome').hidden = modo !== 'criar'; $('#login-ok').textContent = modo === 'criar' ? 'Pedir acesso' : 'Entrar';
        f.senha.autocomplete = modo === 'criar' ? 'new-password' : 'current-password';
      });
      await new Promise(ok => {
        f.onsubmit = async e => {
          e.preventDefault(); erro.textContent = '';
          const { email, senha, nome } = Object.fromEntries(new FormData(f));
          let r;
          if (modo === 'criar') {
            r = await sb.auth.signUp({ email: email.trim(), password: senha, options: { data: { nome: (nome || '').trim() } } });
            if (!r.error && !r.data.session) { erro.textContent = 'Conta criada! Confirme o e-mail que enviamos e entre.'; return; }
          } else r = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
          if (r.error) { erro.textContent = modo === 'criar' ? 'Não consegui criar: ' + r.error.message : 'E-mail ou senha incorretos.'; return; }
          session = r.data.session; box.hidden = true; ok();
        };
      });
    }
    // conta precisa estar liberada por um administrador
    let eu = await perfil();
    if (!eu || !eu.aprovado) {
      box.hidden = false; f.hidden = true; espera.hidden = false;
      await new Promise(ok => {
        $('#espera-sair').onclick = async () => { await sb.auth.signOut(); location.reload(); };
        $('#espera-ver').onclick = async () => {
          eu = await perfil();
          if (eu && eu.aprovado) { espera.hidden = true; box.hidden = true; ok(); }
          else $('#espera-erro').textContent = 'Ainda não foi liberado.';
        };
      });
    }
    estado.admin = !!eu.admin; estado.uid = session?.user?.id || eu.id;
    document.querySelectorAll('.adm').forEach(x => x.hidden = !estado.admin);
    const n = await Store.conectar(sb);
    const locais = n === 0 && Store.dadosLocais();
    if (locais && confirm('Encontrei dados salvos neste navegador. Enviar para a nuvem agora?')) await Store.subirLocais(locais);
  }

  return {
    estado, nome, form, navMes, $, mostrarAtual: () => mostrar(atual), eu, pedirEu, outro: k => k === 'A' ? 'B' : 'A',
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
    async iniciar() {
      const t = () => {
        $('#data').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const c = Store.config; $('#user').textContent = `${c.nomeA} & ${c.nomeB}`;
        $('#avatar').textContent = c.nomeA.trim().slice(0, 1).toUpperCase() + c.nomeB.trim().slice(0, 1).toUpperCase();
      };
      t();
      document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => { location.hash = b.dataset.aba; });
      document.querySelectorAll('.js-config').forEach(b => b.onclick = config);
      const raiz = document.documentElement, bts = document.querySelectorAll('.js-tema');
      const icone = () => bts.forEach(b => b.textContent = raiz.dataset.theme === 'dark' ? '☀️' : '🌙');
      icone();
      bts.forEach(b => b.onclick = () => {
        raiz.dataset.theme = raiz.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('nc-tema', raiz.dataset.theme); } catch {}
        icone();
      });
      Store.onChange(() => { t(); mostrar(atual); });
      const rota = () => { const a = location.hash.slice(1).split('/')[0]; mostrar(abas[a] ? a : 'lancar'); };
      window.addEventListener('hashchange', rota);
      const cfg = window.NC_SUPABASE;
      // ?local no endereço = ignora a nuvem (útil para testar o visual sem login)
      if (cfg && cfg.key && window.supabase && !location.search.includes('local')) {
        await entrarNaNuvem(window.supabase.createClient(cfg.url, cfg.key));
        document.querySelectorAll('.js-sair').forEach(b => { b.hidden = false; b.onclick = async () => { await Store.sair(); location.reload(); }; });
        $('#f-dados').textContent = 'Os dados ficam na nuvem (Supabase) e aparecem ao vivo nos dois celulares.';
        t();
      }
      rota();
      if (typeof Lancar !== 'undefined') Lancar.aoIniciar();
    }
  };
})();
