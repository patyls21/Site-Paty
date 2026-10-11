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
  // Divisão do cartão: valores em centavos
  partes(l) {
    const v = l.valor;
    if (l.divisao === 'A') return [v, 0];
    if (l.divisao === 'B') return [0, v];
    if (l.divisao === 'custom') return [l.parteA, v - l.parteA];
    const a = Math.floor(v / 2); return [a, v - a];
  },
  // ---- gastos do Painel: parte de cada um e situação de pagamento ----
  partesGasto(g) { return U.partes({ valor: g.valor, divisao: g.pessoa === 'ambos' ? 'meio' : g.pessoa }); },
  parteDe: (g, p) => U.partesGasto(g)[p === 'A' ? 0 : 1],
  // g.pag = { A: {pago, data, comps:[ids]}, B: {...} }; gastos antigos (sem pag) não têm controle
  pendente: (g, p) => !!g.pag && U.parteDe(g, p) > 0 && !(g.pag[p] && g.pag[p].pago),
  // quanto cada um deve ao outro (só gastos em que alguém adiantou o valor)
  saldoAcertos(gastos) {
    const deve = { A: 0, B: 0 };
    gastos.forEach(g => {
      if (!g.pag || !g.adiantou) return;
      ['A', 'B'].forEach(p => { if (p !== g.adiantou && U.pendente(g, p)) deve[p] += U.parteDe(g, p); });
    });
    return deve;
  },
  calcularDivisao(lancs, fatura, acertos) {
    let devA = 0, devB = 0, total = 0;
    lancs.forEach(l => { const [a, b] = U.partes(l); devA += a; devB += b; total += l.valor; });
    const pagou = fatura?.pagaPor || 'A';
    const devedor = pagou === 'A' ? 'B' : 'A';
    const deve = devedor === 'A' ? devA : devB;
    const acertado = acertos.filter(x => x.de === devedor).reduce((s, x) => s + x.valor, 0);
    return { total, devA, devB, pagou, devedor, restante: Math.max(0, deve - acertado), acertado };
  }
};
