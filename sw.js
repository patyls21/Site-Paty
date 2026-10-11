// Service worker mínimo: recebe comprovantes compartilhados de outros apps (Web Share Target) no formulário.
// Não guarda páginas em cache, então o site sempre abre na versão mais nova.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/formulario.html')) {
    e.respondWith((async () => {
      const info = { campos: [], achou: false, erro: '' };
      try {
        const fd = await e.request.formData();
        let arquivo = null;
        for (const [campo, v] of fd.entries()) {
          const ehArquivo = typeof v !== 'string';
          info.campos.push(campo + ':' + (ehArquivo ? `arquivo(${v.type || '?'},${v.size})` : 'texto'));
          if (ehArquivo && v.size && !arquivo) arquivo = v; // pega o primeiro arquivo, qualquer que seja o nome do campo
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
