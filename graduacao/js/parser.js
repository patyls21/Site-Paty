// Leitor do histórico escolar do SIGAA (UnB). Recebe as páginas já extraídas pelo pdf.js:
// pages = [[{ s: texto, x, y, h }, ...], ...] e devolve os dados do aluno, matérias e pendências.
(function (root) {
  const COD = /^([A-Z]{2,4}\d{3,4}|ENADE)$/;
  const SIT = ['APR', 'REP', 'REPF', 'REPMF', 'CUMP', 'TRANC', 'MATR', 'DISP', 'CANC', '--'];

  function linhas(page, tol) {
    const itens = page.filter(i => i.s.trim()).slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const out = [];
    for (const it of itens) {
      const l = out.find(o => Math.abs(o.y - it.y) <= (tol || 2));
      if (l) l.it.push(it); else out.push({ y: it.y, it: [it] });
    }
    return out.map(l => l.it.sort((a, b) => a.x - b.x).map(i => i.s.trim()).join(' ').replace(/\s+/g, ' '));
  }

  function lerMaterias(page) {
    const ancoras = page.filter(i => i.x > 80 && i.x < 125 && COD.test(i.s.trim()));
    if (!ancoras.length) return [];
    const col = (a, min, max) => page.filter(i => i.x >= min && i.x < max && Math.abs(i.y - a.y) < 4.5 && i.s.trim());
    const nomes = page.filter(i => i.x >= 125 && i.x < 405 && i.s.trim());
    const topo = Math.max(...ancoras.map(a => a.y)) + 10, base = Math.min(...ancoras.map(a => a.y)) - 12;
    const tabela = nomes.filter(i => i.y < topo && i.y > base).sort((p, q) => q.y - p.y);
    const hMax = Math.max(...tabela.filter(i => ancoras.some(a => Math.abs(a.y - i.y) < 5)).map(i => i.h));
    const ehNome = i => i.h >= hMax - 0.6 && !/^(Dr|Dra|MSc|Esp)\.\s/.test(i.s.trim());
    // cada célula começa numa linha de nome (fonte maior) e segue com as linhas dos professores
    const celulas = [];
    let anterior = null;
    for (const i of tabela) {
      if (ehNome(i)) {
        if (anterior && ehNome(anterior) && anterior.y - i.y < 9 && celulas.length) celulas[celulas.length - 1].nome.push(i.s.trim());
        else celulas.push({ nome: [i.s.trim()] });
      }
      anterior = i;
    }
    const ordem = ancoras.slice().sort((p, q) => q.y - p.y);
    const dono = new Map(ordem.map((a, k) => [a, celulas.length === ordem.length ? celulas[k].nome.join(' ') : '']));
    return ancoras.map(a => {
      const txt = (min, max) => (col(a, min, max)[0] || { s: '' }).s.trim();
      const nome = dono.get(a) || '';
      const chTxt = txt(400, 440);
      return {
        periodo: txt(30, 75), flag: txt(75, 88), codigo: a.s.trim(), nome,
        ch: parseInt(chTxt, 10) || 0, turma: txt(440, 470), freq: txt(470, 500),
        nota: txt(500, 530), situacao: txt(530, 600)
      };
    }).filter(m => SIT.includes(m.situacao));
  }

  function parseHistorico(pages) {
    const todas = pages.map(p => linhas(p));
    const texto = todas.flat();
    const achar = (re) => { for (const l of texto) { const m = l.match(re); if (m) return m; } return null; };
    const aluno = {
      nome: (achar(/^Nome:\s+(.+?)(?:\s+Matr[ií]cula:.*)?$/) || [])[1] || '',
      matricula: (achar(/Matr[ií]cula:\s*(\d{6,})/) || [])[1] || '',
      curso: (achar(/^Curso:\s+(.+)$/) || [])[1] || '',
      curriculo: (achar(/Curr[ií]culo:\s+(.+?)(?:\s{2,}|$)/) || [])[1] || '',
      ira: (achar(/IRA:\s*([\d.,]+)/) || [])[1] || '',
      emissao: (achar(/Emitido em:\s*(.+)$/) || [])[1] || ''
    };
    const prazo = achar(/Prazo para Conclus[aã]o.*?(\d{4}\.\d)\s*\/\s*(\d{4}\.\d)/);
    if (prazo) aluno.prazo = prazo[1] + ' / ' + prazo[2];

    const materias = [];
    for (const p of pages) materias.push(...lerMaterias(p));

    // totais de carga horária
    const nums = (re) => { const m = achar(re); return m ? m.slice(1).map(Number) : null; };
    const reTot = (nome) => new RegExp('^' + nome + '\\s+(\\d+) h\\s+(\\d+) h\\s+(\\d+) h\\s+(\\d+) h');
    const ex = nums(reTot('Exigido')), int = nums(reTot('Integralizado')), pen = nums(reTot('Pendente'));
    const carga = ex && int ? {
      exigido: { obrig: ex[0], optat: ex[1], compl: ex[2], total: ex[3] },
      integralizado: { obrig: int[0], optat: int[1], compl: int[2], total: int[3] },
      pendente: pen ? { obrig: pen[0], optat: pen[1], compl: pen[2], total: pen[3] } : null
    } : null;

    // obrigatórias pendentes
    const pendentes = [];
    let dentro = false;
    for (const l of texto) {
      if (/Obrigat[oó]rios Pendentes/i.test(l)) { dentro = true; continue; }
      if (!dentro) continue;
      if (/^Equival[eê]ncias|^Observa[cç][oõ]es/i.test(l)) break;
      const m = l.match(/^([A-Z]{3}\d{4}|ENADE)\s+(.+?)\s+(?:(Matriculado em Equivalente|Matriculado)\s+)?(\d+) h$/);
      if (m && !pendentes.some(p => p.codigo === m[1])) {
        pendentes.push({ codigo: m[1], nome: m[2], status: m[3] || '', ch: Number(m[4]) });
      }
    }
    return { aluno, materias, carga, pendentes };
  }

  const api = { parseHistorico, linhas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Parser = api;
})(typeof window !== 'undefined' ? window : globalThis);
