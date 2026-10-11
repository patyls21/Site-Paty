// Service worker mínimo: recebe comprovantes compartilhados de outros apps (Web Share Target) no formulário.
// Não guarda páginas em cache, então o site sempre abre na versão mais nova.
importScripts('js/multipart.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/formulario.html')) {
    e.respondWith((async () => {
      const tipo = e.request.headers.get('content-type') || '';
      const info = { campos: [], achou: false, erro: '', tipo, bytes: -1, plano: 'formData' };
      try {
        let bruto = null;
        try { bruto = await e.request.clone().arrayBuffer(); info.bytes = bruto.byteLength; } catch (_) {}
        let arquivo = null;
        try {
          const fd = await e.request.formData();
          for (const [campo, v] of fd.entries()) {
            const ehArquivo = typeof v !== 'string';
            info.campos.push(campo + ':' + (ehArquivo ? `arquivo(${v.type || '?'},${v.size})` : 'texto(' + String(v).slice(0, 60) + ')'));
            if (ehArquivo && v.size && !arquivo) arquivo = v; // primeiro arquivo, qualquer que seja o nome do campo
          }
        } catch (err) { info.erro = 'formData: ' + String(err && err.message || err); }
        // plano B: o corpo chegou, mas formData() não achou arquivo -> lê o multipart manualmente
        if (!arquivo && bruto && bruto.byteLength > 0) {
          const partes = lerMultipart(bruto, tipo);
          const p = partes.find(x => x.nome !== undefined && x.bytes.length);
          partes.forEach(x => { if (!info.campos.some(c => c.startsWith(x.campo + ':'))) info.campos.push(x.campo + ':' + (x.nome !== undefined ? `arquivo(${x.tipo || '?'},${x.bytes.length})` : 'texto')); });
          if (p) { arquivo = new File([p.bytes], p.nome || 'comprovante', { type: p.tipo || 'application/octet-stream' }); info.plano = 'manual'; }
        }
        const cache = await caches.open('nc-share');
        await cache.delete('arquivo');
        if (arquivo) {
          await cache.put('arquivo', new Response(arquivo, { headers: { 'Content-Type': arquivo.type || 'application/octet-stream', 'X-Nome': encodeURIComponent(arquivo.name || 'comprovante') } }));
          info.achou = true;
        }
        await cache.put('info', new Response(JSON.stringify(info)));
      } catch (err) {
        info.erro = String(err && err.message || err);
        try { const c = await caches.open('nc-share'); await c.put('info', new Response(JSON.stringify(info))); } catch (_) {}
      }
      return Response.redirect('./formulario.html?compartilhado=1', 303);
    })());
  }
});
