// Avisos da fatura do Inter: do dia em que ela fecha até o dia anterior ao vencimento, enquanto a pessoa ainda deve.
// - faixa no topo da página (sempre);
// - notificação do sistema: no app Android (agendada no aparelho, todo dia às 9h) ou no navegador (uma vez por dia, ao abrir).
// No dia anterior ao vencimento (débito automático) a mensagem vira urgente. No dia do vencimento não avisa mais.
const Avisos = (() => {
  const nativo = () => window.NCAndroid && typeof window.NCAndroid.agendar === 'function';
  const chaveDia = e => 'nc-aviso-dia-' + (App.estado.uid || 'local') + '-' + e;
  const dm = iso => iso.split('-').reverse().slice(0, 2).join('/');

  function mensagem(nome, mesNome, valor, venceISO, dias) {
    const mes = mesNome.split(' ')[0].toLowerCase(), v = U.brl(valor), quando = dm(venceISO);
    if (dias <= 1) return { urgente: true, titulo: '⚠️ Fatura vence amanhã!', texto: `${nome}, a fatura do Inter vence amanhã (${quando}) e você ainda deve ${v}. Pague hoje, é urgente!` };
    return { urgente: false, titulo: 'Fatura do Inter fechou 💳', texto: `${nome}, a fatura de ${mes} fechou e você deve ${v}. Vence dia ${quando} (em ${dias} dias).` };
  }

  // o que a pessoa deve na fatura que fechou; null se não há o que avisar hoje
  function situacao(hoje = U.hoje()) {
    const e = App.eu(); if (!e) return null;
    const mes = U.mesFaturaFechada(hoje), { vence } = U.datasFatura(mes);
    if (hoje >= vence) return null; // venceu (débito automático): para de avisar
    const gr = U.pendencias(Store.gastos.lista())[e].grupos.INTER;
    const valor = gr ? gr.itens.filter(g => U.mesFatura(g.data) === mes).reduce((s, g) => s + U.parteDe(g, e), 0) : 0;
    if (!(valor > 0)) return null; // quite
    return { e, mes, vence, valor, dias: U.diasEntre(hoje, vence), ...mensagem(App.nome(e), U.mesNome(mes), valor, vence, U.diasEntre(hoje, vence)) };
  }

  // um aviso por dia, de hoje até o dia anterior ao vencimento, para o app Android agendar
  function plano(s) {
    const lista = [];
    for (let i = 0; ; i++) {
      const dia = new Date(s.vence + 'T12:00:00'); dia.setDate(dia.getDate() - s.dias + i);
      const iso = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
      if (iso >= s.vence) break;
      const m = mensagem(App.nome(s.e), U.mesNome(s.mes), s.valor, s.vence, U.diasEntre(iso, s.vence));
      lista.push({ data: iso, titulo: m.titulo, texto: m.texto });
    }
    return lista;
  }

  function faixa(s) {
    const el = document.getElementById('aviso-fatura'); if (!el) return;
    if (!s) { el.hidden = true; el.innerHTML = ''; return; }
    const pedir = !nativo() && 'Notification' in window && Notification.permission === 'default';
    el.hidden = false; el.className = 'aviso-fatura' + (s.urgente ? ' urgente' : '');
    el.innerHTML = `<div><b>${U.esc(s.titulo)}</b><br><span>${U.esc(s.texto)}</span></div>
      <div class="aviso-acoes"><button type="button" class="btn mini-b" id="av-pagar">Pagar agora</button>${pedir ? '<button type="button" class="btn sec mini-b" id="av-ativar">🔔 Ativar avisos</button>' : ''}</div>`;
    el.querySelector('#av-pagar').onclick = () => App.pendencias();
    const at = el.querySelector('#av-ativar');
    if (at) at.onclick = async () => { try { await Notification.requestPermission(); } catch {} atualizar(); };
  }

  // navegador/PWA: no máximo uma notificação por dia, quando o site é aberto
  async function notificarNavegador(s) {
    if (nativo() || !('Notification' in window) || Notification.permission !== 'granted') return;
    const hoje = U.hoje();
    try { if (localStorage.getItem(chaveDia(s.e)) === hoje) return; localStorage.setItem(chaveDia(s.e), hoje); } catch {}
    const op = { body: s.texto, icon: 'icons/icon-192.png', tag: 'fatura-inter', renotify: true };
    try {
      const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      if (reg) reg.showNotification(s.titulo, op); else new Notification(s.titulo, op);
    } catch (err) { console.warn('Notificação não exibida', err); }
  }

  let ultimo = '';
  function atualizar() {
    let s = null;
    try { s = situacao(); } catch (err) { console.error(err); }
    faixa(s);
    if (nativo()) { // só reenvia quando o plano muda
      const json = JSON.stringify(s ? plano(s) : []);
      if (json !== ultimo) { ultimo = json; try { s ? window.NCAndroid.agendar(json) : window.NCAndroid.cancelar(); } catch (err) { console.warn(err); } }
    } else if (s) notificarNavegador(s);
  }

  return {
    situacao, plano, atualizar,
    aoIniciar() { atualizar(); Store.onChange(atualizar); }
  };
})();
