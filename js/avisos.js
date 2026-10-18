// Avisos do app, de duas fontes:
// - fatura do Inter: do dia em que fecha até a véspera do vencimento, enquanto a pessoa ainda deve (dia anterior = urgente);
// - viagem: 1 mês, 15, 7 e 3 dias antes do check-in e depois todo dia até o check-out (vem de js/viagens.js).
// Cada aviso aparece numa faixa no topo e como notificação do sistema: no app Android (agendada no aparelho, todo dia às 9h)
// ou no navegador (uma vez por dia, ao abrir).
const Avisos = (() => {
  const nativo = () => window.NCAndroid && typeof window.NCAndroid.agendar === 'function';
  const chaveDia = e => 'nc-aviso-dia-' + (App.estado.uid || 'local') + '-' + e;
  const dm = iso => iso.split('-').reverse().slice(0, 2).join('/');
  const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---------- fatura ----------
  // o que a pessoa deve na fatura que já fechou (null se quite ou sem identificar quem é)
  function faturaInfo(hoje) {
    const e = App.eu(); if (!e) return null;
    const mes = U.mesFaturaFechada(hoje), { vence } = U.datasFatura(mes);
    const gr = U.pendencias(Store.gastos.lista())[e].grupos.INTER;
    const valor = gr ? gr.itens.filter(g => U.mesFatura(g.data) === mes).reduce((s, g) => s + U.parteDe(g, e), 0) : 0;
    return valor > 0 ? { e, mes, vence, valor } : null;
  }
  function avisoFatura(f, iso) {
    if (!f || iso >= f.vence) return null; // venceu (débito automático): para de avisar
    const { fecha } = U.datasFatura(f.mes); if (iso < fecha) return null;
    const dias = U.diasEntre(iso, f.vence), nome = App.nome(f.e), mes = U.mesNome(f.mes).split(' ')[0].toLowerCase(), v = U.brl(f.valor), quando = dm(f.vence);
    const fat = U.daFatura();
    if (dias <= 1) return { tipo: 'fatura', urgente: true, titulo: '⚠️ Fatura vence amanhã!', texto: `${nome}, a ${fat} vence amanhã (${quando}) e você ainda deve ${v}. Pague hoje, é urgente!` };
    return { tipo: 'fatura', urgente: false, titulo: (U.banco() ? `Fatura do ${U.banco()}` : 'Fatura do cartão') + ' fechou 💳', texto: `${nome}, a fatura de ${mes} fechou e você deve ${v}. Vence dia ${quando} (em ${dias} dias).` };
  }

  // ---------- tudo junto ----------
  function doDia(iso, f) {
    const l = [], a = avisoFatura(f, iso); if (a) l.push(a);
    if (typeof Viagens !== 'undefined') l.push(...Viagens.avisosDoDia(iso));
    if (typeof Caixinhas !== 'undefined') l.push(...Caixinhas.avisosDoDia(iso, App.eu()));
    return l;
  }
  // situação de hoje (para a faixa)
  function situacao(hoje = U.hoje()) { return doDia(hoje, faturaInfo(hoje)); }

  // um conjunto de avisos por dia, de hoje até o último dia com aviso, para o app Android agendar
  function plano(hoje = U.hoje()) {
    const f = faturaInfo(hoje), lista = [];
    const fimFat = f ? f.vence : '', fimViagem = typeof Viagens !== 'undefined' ? Viagens.ultimoDia() : '';
    const fimCaixinha = typeof Caixinhas !== 'undefined' ? Caixinhas.ultimoDia() : '';
    const ultimo = [fimFat, fimViagem, fimCaixinha, hoje].reduce((u, x) => x > u ? x : u, '');
    for (let iso = hoje, i = 0; iso <= ultimo && i < 800; iso = somaDias(iso, 1), i++) {
      doDia(iso, f).forEach(a => lista.push({ data: iso, titulo: a.titulo, texto: a.texto }));
    }
    return lista;
  }

  function faixa(avisos) {
    const el = document.getElementById('aviso-fatura'); if (!el) return;
    if (!avisos.length) { el.hidden = true; el.innerHTML = ''; return; }
    const pedir = !nativo() && 'Notification' in window && Notification.permission === 'default';
    el.hidden = false; el.className = '';
    el.innerHTML = avisos.map((a, i) => `<div class="aviso-fatura${a.urgente ? ' urgente' : ''}"><div><b>${U.esc(a.titulo)}</b><br><span>${U.esc(a.texto)}</span></div>
      <div class="aviso-acoes"><button type="button" class="btn mini-b" data-av="${a.tipo}">${{ fatura: 'Pagar agora', viagem: 'Ver viagem', caixinha: 'Ver caixinhas' }[a.tipo]}</button>${pedir && i === 0 ? '<button type="button" class="btn sec mini-b" id="av-ativar">🔔 Ativar avisos</button>' : ''}</div></div>`).join('');
    el.querySelectorAll('[data-av]').forEach(b => b.onclick = () => {
      if (b.dataset.av === 'fatura') return App.pendencias();
      const aba = b.dataset.av === 'caixinha' ? 'caixinhas' : 'viagens';
      document.body.classList.contains('solo') ? (location.href = 'index.html#' + aba) : (location.hash = aba);
    });
    const at = el.querySelector('#av-ativar');
    if (at) at.onclick = async () => { try { await Notification.requestPermission(); } catch {} atualizar(); };
  }

  // navegador/PWA: no máximo uma rodada de notificações por dia, quando o site é aberto
  async function notificarNavegador(avisos) {
    if (nativo() || !('Notification' in window) || Notification.permission !== 'granted') return;
    const hoje = U.hoje(), e = App.eu();
    try { if (localStorage.getItem(chaveDia(e)) === hoje) return; localStorage.setItem(chaveDia(e), hoje); } catch {}
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
    avisos.forEach(a => {
      const op = { body: a.texto, icon: 'icons/icon-192.png', tag: 'nc-' + a.tipo, renotify: true };
      try { if (reg) reg.showNotification(a.titulo, op); else new Notification(a.titulo, op); } catch (err) { console.warn('Notificação não exibida', err); }
    });
  }

  let ultimo = '';
  function atualizar() {
    let avisos = [], lista = [];
    try { avisos = situacao(); lista = plano(); } catch (err) { console.error(err); }
    faixa(avisos);
    if (nativo()) { // só reenvia ao app quando o plano muda
      const json = JSON.stringify(lista);
      if (json !== ultimo) { ultimo = json; try { lista.length ? window.NCAndroid.agendar(json) : window.NCAndroid.cancelar(); } catch (err) { console.warn(err); } }
    } else if (avisos.length) notificarNavegador(avisos);
  }

  return {
    situacao, plano, atualizar,
    aoIniciar() { atualizar(); Store.onChange(atualizar); }
  };
})();
