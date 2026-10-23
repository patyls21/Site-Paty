// Regras do Lembrei!: quais avisos devem sair e quando.
// Horário de Brasília fixo em -03:00 (o Brasil não tem mais horário de verão).
export const OFFSET = '-03:00';

export const pad = n => String(n).padStart(2, '0');

export function hojeLocal(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
export function instante(data, hora) { return new Date(`${data}T${hora}:00${OFFSET}`); }

function utc(data) { const [a, m, d] = data.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); }
function fmt(dt) { return dt.toISOString().slice(0, 10); }

export function addDias(data, n) { const d = utc(data); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }
export function addMeses(data, n) {
  const d = utc(data), dia = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return fmt(d);
}
function passo(data, k, cada, unidade) {
  const n = k * cada;
  if (unidade === 'semanas') return addDias(data, n * 7);
  if (unidade === 'meses') return addMeses(data, n);
  if (unidade === 'anos') return addMeses(data, n * 12);
  return addDias(data, n);
}

export const diaDaSemana = data => utc(data).getUTCDay(); // 0 = domingo ... 6 = sábado
export const NOMES_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// Datas em que o lembrete "acontece", entre de e ate (inclusive).
// repete: { cada, unidade } (a cada N dias/semanas/meses/anos) ou { dias: [1, 3], cada: 1 } (nesses dias da semana, a cada N semanas).
export function ocorrencias(l, de, ate) {
  const fim = l.fim && l.fim < ate ? l.fim : ate;
  const r = l.repete;
  if (r && r.dias && r.dias.length) {
    const cada = Math.max(1, r.cada || 1), base = addDias(l.data, -diaDaSemana(l.data));
    const out = [];
    for (let d = l.data, n = 0; d <= fim && n < 20000; d = addDias(d, 1), n++) {
      const semana = Math.round((utc(d) - utc(base)) / (7 * 86400000));
      if (d >= de && r.dias.includes(diaDaSemana(d)) && semana % cada === 0) out.push(d);
    }
    return out;
  }
  if (!r || !r.cada || r.cada < 1) return l.data >= de && l.data <= fim ? [l.data] : [];
  const out = [];
  for (let k = 0; k < 20000; k++) {
    const d = passo(l.data, k, r.cada, r.unidade);
    if (d > fim) break;
    if (d >= de) out.push(d);
  }
  return out;
}

export function textoAviso(l, diasAntes, ocorr) {
  if (l.mensagem && l.mensagem.trim()) return l.mensagem.trim();
  const quando = diasAntes === 0 ? 'Hoje' : diasAntes === 1 ? 'Amanhã' : `Em ${diasAntes} dias (${ocorr.split('-').reverse().slice(0, 2).join('/')})`;
  return `${quando}: ${l.titulo}`;
}

export const chave = (id, ocorr, diasAntes, hora, nome) => `${id}|${ocorr}|${diasAntes}@${hora}|${nome}`;

// Todos os envios previstos entre duas datas, com o horário de cada um.
export function envios(lembretes, de, ate) {
  const out = [];
  for (const l of lembretes) {
    if (l.ativo === false || !l.titulo || !l.data) continue;
    const avisos = l.avisos && l.avisos.length ? l.avisos : [{ diasAntes: 0, hora: '08:00' }];
    const maxAntes = Math.max(...avisos.map(a => a.diasAntes || 0));
    for (const ocorr of ocorrencias(l, de, addDias(ate, maxAntes))) {
      for (const a of avisos) {
        const diasAntes = a.diasAntes || 0;
        const quando = instante(addDias(ocorr, -diasAntes), a.hora);
        out.push({ lembrete: l, ocorr, diasAntes, hora: a.hora, quando, texto: textoAviso(l, diasAntes, ocorr) });
      }
    }
  }
  return out.sort((a, b) => a.quando - b.quando);
}

