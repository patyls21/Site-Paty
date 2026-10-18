const U = {
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  brl: c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  // "12,50" | "1.234,56" | "12.5" -> centavos inteiros
  parseValor(t) {
    let s = String(t).trim().replace(/[R$\s]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  },
  valorInput: c => (c / 100).toFixed(2).replace('.', ','),
  id: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
  hoje() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  mesDe: iso => iso.slice(0, 7),
  mesAtual() { return U.hoje().slice(0, 7); },
  mesSoma(m, n) { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; },
  // ---- fatura do Inter: fecha todo dia X (padrão 16); compras a partir do dia X caem na fatura do mês seguinte ----
  diaFecha: () => Math.min(28, Math.max(1, Math.round(Number(Store.config.diaFechamento)) || 16)),
  mesFatura(dataISO) {
    const mes = dataISO.slice(0, 7);
    return Number(dataISO.slice(8, 10)) >= U.diaFecha() ? U.mesSoma(mes, 1) : mes;
  },
  // vencimento (e débito automático) da fatura: padrão dia 22
  diaVence: () => Math.min(28, Math.max(1, Math.round(Number(Store.config.diaVencimento)) || 22)),
  // fatura "de um mês" M fecha no dia X de M. A última que já fechou é a de M se hoje >= X, senão a do mês anterior
  mesFaturaFechada(hojeISO = U.hoje()) {
    const mes = hojeISO.slice(0, 7);
    return Number(hojeISO.slice(8, 10)) >= U.diaFecha() ? mes : U.mesSoma(mes, -1);
  },
  // datas (ISO) de fechamento e vencimento da fatura do mês M; se o vencimento é <= dia do fechamento, cai no mês seguinte
  datasFatura(mes) {
    const [y, m] = mes.split('-').map(Number), f = U.diaFecha(), v = U.diaVence();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { fecha: iso(new Date(y, m - 1, f)), vence: iso(new Date(y, m - 1 + (v > f ? 0 : 1), v)) };
  },
  diasEntre: (aISO, bISO) => Math.round((new Date(bISO + 'T12:00:00') - new Date(aISO + 'T12:00:00')) / 864e5),
  // período coberto pela fatura "de um mês" (ex.: "16/09 a 15/10")
  periodoFatura(mes) {
    const [y, m] = mes.split('-').map(Number), d = U.diaFecha();
    const f = dt => String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0');
    return `${f(new Date(y, m - 2, d))} a ${f(new Date(y, m - 1, d - 1))}`;
  },
  mesNome(m) { const [y, mo] = m.split('-').map(Number); const t = new Date(y, mo - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); },
  dataBR: iso => iso.split('-').reverse().join('/'),
  // reduz imagem no navegador (máx 1280px, JPEG 0.7); PDF fica como está (limite 700 KB)
  anexo(file) {
    return new Promise((ok, erro) => {
      if (file.type === 'application/pdf') {
        if (file.size > 700 * 1024) return erro(new Error('PDF acima de 700 KB.'));
        const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => erro(r.error); return r.readAsDataURL(file);
      }
      if (!file.type.startsWith('image/')) return erro(new Error('Envie imagem ou PDF.'));
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => erro(new Error('Imagem inválida.'));
      img.src = url;
    });
  },
  // ---- pessoas da conta (a titular e os adicionais): ids "A", "B", "C"… ----
  ids: () => Store.pessoas().map(p => p.id),
  // nome do cartão/banco da conta ("Inter", "Nubank"…) e como aparece nos textos
  banco: () => (Store.config.banco || '').trim(),
  cartao: () => U.banco() ? 'Cartão ' + U.banco() : 'Cartão de crédito',
  daFatura: () => U.banco() ? 'fatura do ' + U.banco() : 'fatura do cartão',
  // quem participa de uma divisão: 'meio'/'ambos'/vazio = todos; 'A' = só A; 'A,C' = A e C (ids que não existem mais saem)
  quem(div) {
    const ids = U.ids();
    if (!div || div === 'meio' || div === 'ambos' || div === 'todos') return ids;
    return String(div).split(',').filter(i => ids.includes(i));
  },
  // Divisão do cartão: valores em centavos, por pessoa { A: 1000, B: 500, … }. Sobra de centavos vai para o último da divisão.
  partes(l) {
    const ids = U.ids(), v = l.valor, r = {}; ids.forEach(i => r[i] = 0);
    if (l.divisao === 'custom') {
      const c = l.partesCustom || { A: l.parteA || 0, B: v - (l.parteA || 0) };
      ids.forEach(i => r[i] = Math.round(Number(c[i]) || 0));
      return r;
    }
    const q = U.quem(l.divisao); if (!q.length) return r;
    const base = Math.floor(v / q.length); q.forEach(i => r[i] = base); r[q[q.length - 1]] += v - base * q.length;
    return r;
  },
  // total e parte de cada pessoa em uma lista de lançamentos
  totaisPorPessoa(lancs) {
    const por = {}; U.ids().forEach(i => por[i] = 0); let total = 0;
    lancs.forEach(l => { const p = U.partes(l); U.ids().forEach(i => por[i] += p[i]); total += l.valor; });
    return { total, por };
  },
  // ---- gastos do Painel: parte de cada um e situação de pagamento ----
  partesGasto(g) { return U.partes({ valor: g.valor, divisao: g.pessoa }); },
  parteDe: (g, p) => U.partesGasto(g)[p] || 0,
  // g.pag = { A: {pago, data, comps:[ids]}, B: {...} }; gastos antigos (sem pag) não têm controle
  pendente: (g, p) => !!g.pag && U.parteDe(g, p) > 0 && !(g.pag[p] && g.pag[p].pago),
  // para quem se deve uma parte pendente: um id de pessoa = quem adiantou o valor, 'INTER' = fatura do cartão, 'OUTRO' = pagamento direto
  // (qualquer valor estranho em "adiantou" é ignorado, para a parte nunca ficar sem grupo)
  credorDe: g => U.ids().includes(g.adiantou) ? g.adiantou : (g.forma === 'inter' ? 'INTER' : 'OUTRO'),
  // tudo o que cada um ainda falta pagar, agrupado por credor: { A: { total, grupos: { credor: { total, itens } } }, B: {...} }
  pendencias(gastos) {
    const ids = U.ids(), r = {}; ids.forEach(p => r[p] = { total: 0, grupos: {} });
    gastos.forEach(g => ids.forEach(p => {
      const c = U.credorDe(g);
      if (!U.pendente(g, p) || c === p) return;
      const v = U.parteDe(g, p), gr = r[p].grupos[c] || (r[p].grupos[c] = { total: 0, itens: [] });
      gr.total += v; gr.itens.push(g); r[p].total += v;
    }));
    return r;
  }
};
