// Lê um corpo multipart/form-data "na mão". Plano B do recebimento de comprovantes:
// usado quando request.formData() não devolve nada mesmo com o corpo chegando.
// Retorna [{ campo, nome, tipo, bytes }] — "nome" só existe para arquivos.
function lerMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return [];
  const u = new Uint8Array(buffer);
  const limite = new TextEncoder().encode('--' + (m[1] || m[2]).trim());
  const achar = (de, padrao) => {
    fora: for (let i = de; i <= u.length - padrao.length; i++) {
      for (let j = 0; j < padrao.length; j++) if (u[i + j] !== padrao[j]) continue fora;
      return i;
    }
    return -1;
  };
  const partes = [];
  let pos = achar(0, limite);
  while (pos >= 0) {
    let ini = pos + limite.length;
    if (u[ini] === 45 && u[ini + 1] === 45) break; // "--" no fim
    ini += 2; // pula \r\n depois do limite
    const prox = achar(ini, limite);
    if (prox < 0) break;
    const fimCab = achar(ini, [13, 10, 13, 10]);
    if (fimCab >= 0 && fimCab < prox) {
      const cab = new TextDecoder('latin1').decode(u.subarray(ini, fimCab));
      const campo = (/name="([^"]*)"/i.exec(cab) || [])[1] || '';
      const nome = (/filename="([^"]*)"/i.exec(cab) || [])[1];
      const tipo = (/content-type:\s*([^\r\n]+)/i.exec(cab) || [])[1] || '';
      partes.push({ campo, nome, tipo: tipo.trim(), bytes: u.slice(fimCab + 4, prox - 2) });
    }
    pos = prox;
  }
  return partes;
}
