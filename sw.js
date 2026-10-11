// Service worker mínimo: recebe comprovantes compartilhados de outros apps (Web Share Target) no formulário.
// Não guarda páginas em cache, então o site sempre abre na versão mais nova.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/formulario.html')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const f = fd.get('comprovante');
        const cache = await caches.open('nc-share');
        await cache.delete('arquivo');
        if (f && f.size) {
          await cache.put('arquivo', new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Nome': encodeURIComponent(f.name || 'comprovante') } }));
        }
      } catch (err) { /* segue para o formulário mesmo se falhar */ }
      return Response.redirect('./formulario.html?compartilhado=1', 303);
    })());
  }
});
