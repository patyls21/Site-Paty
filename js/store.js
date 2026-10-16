// Camada de dados. Modo local (localStorage) ou nuvem (Supabase, tabela "registros").
// A interface é síncrona: a nuvem é carregada para a memória no login e cada alteração é enviada em seguida.
const Store = (() => {
  const KEY = 'nosso-controle-v1';
  const COLS = ['gastos', 'inter', 'acertos', 'comprovantes', 'fixos', 'futuros', 'pontos', 'viagens', 'pix'];
  const padrao = () => ({
    config: { nomeA: 'Patrícia', nomeB: 'Namorado', acrescimoFuturo: 0, reaisPorPonto: 2.5, conversao: 1, bonus: 100, diaFechamento: 16, diaVencimento: 22 },
    categorias: ['iFood', 'Streaming', 'Duo Gourmet', 'Render (guardado)', 'Mercado', 'Transporte', 'Lazer', 'Casa', 'Saúde', 'Compras', 'Contas', 'Outros'],
    gastos: [], inter: [], faturas: {}, acertos: [], comprovantes: [], fixos: [], futuros: [], pontos: [], viagens: [], pix: []
  });
  const normalizar = o => {
    const x = Object.assign(padrao(), o);
    x.config = Object.assign(padrao().config, x.config);
    return x;
  };
  let d, sb = null, canal = null;
  const ouvintes = [];
  const avisar = () => ouvintes.forEach(f => f());

  try {
    d = normalizar(JSON.parse(localStorage.getItem(KEY) || '{}'));
    if (!d.catsV2) { d.categorias = [...new Set([...padrao().categorias.slice(0, 4), ...d.categorias])]; d.catsV2 = true; }
  } catch { d = padrao(); }

  // ---- persistência ----
  function salvarLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(d)); }
    catch { alert('Sem espaço no navegador. Faça um backup (⚙) e remova comprovantes antigos.'); }
  }
  function falha(e) { console.error(e); alert('Não consegui salvar na nuvem: ' + (e.message || e) + '\nConfira a internet e tente de novo.'); }
  function enviar(colecao, id, dados) {
    if (!sb) return salvarLocal();
    sb.from('registros').upsert({ colecao, id, dados, atualizado: new Date().toISOString() }).then(({ error }) => error && falha(error));
  }
  function remover(colecao, id) {
    if (!sb) return salvarLocal();
    sb.from('registros').delete().eq('colecao', colecao).eq('id', id).then(({ error }) => error && falha(error));
  }
  const enviarConfig = () => enviar('config', 'config', { config: d.config, categorias: d.categorias });

  // ---- coleções ----
  const col = nome => ({
    lista: () => d[nome],
    add(o) { o.id = U.id(); d[nome].push(o); enviar(nome, o.id, o); avisar(); return o; },
    set(id, o) { const i = d[nome].findIndex(x => x.id === id); o = { ...o, id }; d[nome][i] = o; enviar(nome, id, o); avisar(); },
    del(id) { d[nome] = d[nome].filter(x => x.id !== id); remover(nome, id); avisar(); }
  });

  // aplica uma linha vinda da nuvem na memória
  function aplicar(colecao, id, dados, apagado) {
    if (colecao === 'config') { if (!apagado) { d.config = Object.assign(padrao().config, dados.config); d.categorias = dados.categorias || d.categorias; } }
    else if (colecao === 'faturas') { if (apagado) delete d.faturas[id]; else d.faturas[id] = dados; }
    else if (COLS.includes(colecao)) {
      const l = d[colecao].filter(x => x.id !== id);
      if (!apagado) l.push({ ...dados, id });
      d[colecao] = l;
    }
  }

  async function conectar(cliente) {
    sb = cliente;
    const { data, error } = await sb.from('registros').select('colecao,id,dados').range(0, 9999);
    if (error) throw error;
    d = padrao();
    data.forEach(r => aplicar(r.colecao, r.id, r.dados, false));
    if (canal) sb.removeChannel(canal);
    canal = sb.channel('registros-ao-vivo').on('postgres_changes', { event: '*', schema: 'public', table: 'registros' }, p => {
      if (p.eventType === 'DELETE') aplicar(p.old.colecao, p.old.id, null, true);
      else aplicar(p.new.colecao, p.new.id, p.new.dados, false);
      avisar();
    }).subscribe();
    return data.length;
  }

  async function enviarTudo(tudo) {
    const linhas = [{ colecao: 'config', id: 'config', dados: { config: tudo.config, categorias: tudo.categorias } }];
    COLS.forEach(c => (tudo[c] || []).forEach(o => linhas.push({ colecao: c, id: o.id, dados: o })));
    Object.entries(tudo.faturas || {}).forEach(([m, f]) => linhas.push({ colecao: 'faturas', id: m, dados: f }));
    for (let i = 0; i < linhas.length; i += 50) {
      const { error } = await sb.from('registros').upsert(linhas.slice(i, i + 50)); if (error) throw error;
    }
    return linhas.length;
  }

  return {
    get config() { return d.config; },
    get categorias() { return d.categorias; },
    get nuvem() { return !!sb; },
    get sb() { return sb; },
    setConfig(c) { d.config = { ...d.config, ...c }; sb ? enviarConfig() : salvarLocal(); avisar(); },
    setCategorias(l) { d.categorias = l; sb ? enviarConfig() : salvarLocal(); avisar(); },
    gastos: col('gastos'), inter: col('inter'), acertos: col('acertos'), comprovantes: col('comprovantes'),
    fixos: col('fixos'), futuros: col('futuros'), pontos: col('pontos'), viagens: col('viagens'), pix: col('pix'),
    // lançamentos da fatura do Inter: os criados na aba Inter + gastos do Painel de Compras pagos com "Cartão Inter"
    // a fatura é definida pela DATA da compra e pelo dia de fechamento (config.diaFechamento), não pelo mês do calendário
    lancInter(mes) {
      const doPainel = d.gastos.filter(g => g.forma === 'inter' && U.mesFatura(g.data) === mes).map(g => ({
        id: g.id, data: g.data, descricao: g.descricao, categoria: g.categoria, valor: g.valor,
        divisao: g.pessoa === 'ambos' ? 'meio' : g.pessoa, parteA: 0, mes, origem: 'compras', fixo: !!g.fixoId,
        pessoa: g.pessoa, forma: g.forma, adiantou: g.adiantou, pag: g.pag
      }));
      return d.inter.filter(l => U.mesFatura(l.data) === mes).map(l => ({ ...l, mes })).concat(doPainel);
    },
    fatura: mes => d.faturas[mes] || { mes, status: 'aberta', pagaPor: 'A' },
    setFatura(mes, f) { d.faturas[mes] = { ...Store.fatura(mes), ...f, mes }; enviar('faturas', mes, d.faturas[mes]); avisar(); },
    onChange: f => ouvintes.push(f),
    exportar: () => JSON.stringify(d),
    async importar(txt) {
      const novo = normalizar(JSON.parse(txt));
      if (sb) { await enviarTudo(novo); await conectar(sb); } else { d = novo; salvarLocal(); }
      avisar();
    },
    conectar,
    // dados que já existiam neste navegador (modo local) para subir à nuvem na primeira vez
    dadosLocais() {
      try { const o = normalizar(JSON.parse(localStorage.getItem(KEY) || '{}')); return COLS.some(c => o[c].length) ? o : null; } catch { return null; }
    },
    async subirLocais(o) { const n = await enviarTudo(o); await conectar(sb); avisar(); return n; },
    async sair() { if (sb) await sb.auth.signOut(); }
  };
})();
