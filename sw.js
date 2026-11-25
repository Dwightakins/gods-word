// God's Word service worker: opens instantly from the phone, and keeps what you read for offline use.
const SHELL = 'gw-shell-v14';
const DATA = 'gw-data-v2';
const VERS = 'gw-versions-v1';   // NIV / NKJV / AMP chapters, kept up to 30 days (API.Bible rule)
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const FILES = ['./', 'index.html', 'app.js', 'data.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/favicon.png',
  'icons/apple-touch-icon.png', 'icons/shortcut-96.png',
  'fonts/eb-garamond-latin-400-normal.woff2', 'fonts/eb-garamond-latin-400-italic.woff2', 'fonts/eb-garamond-latin-500-normal.woff2', 'fonts/eb-garamond-latin-600-normal.woff2', 'fonts/inter-latin-400-normal.woff2', 'fonts/inter-latin-500-normal.woff2', 'fonts/inter-latin-600-normal.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA && k !== VERS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Serve from the phone first, fetch over the network only when missing
function cacheFirst(cacheName, req) {
  return caches.open(cacheName).then(async c => {
    const hit = await c.match(req);
    if (hit) return hit;
    const r = await fetch(req);
    if (r.ok || r.type === 'opaque') c.put(req, r.clone());
    return r;
  });
}
// Show the saved copy straight away, and quietly update it for next time
function staleWhileRevalidate(req) {
  return caches.open(SHELL).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || c.match('index.html');
  });
}

// Online versions: use the saved copy if it is under 30 days old, otherwise fetch a fresh one.
// A copy older than 30 days is never shown, because API.Bible requires a refresh at least every 30 days.
function versionChapter(req) {
  return caches.open(VERS).then(async c => {
    const hit = await c.match(req);
    const savedAt = hit ? Number(hit.headers.get('x-saved-at') || 0) : 0;
    if (hit && Date.now() - savedAt < THIRTY_DAYS) return hit;
    try {
      const r = await fetch(req);
      if (r.ok) {
        const body = await r.clone().arrayBuffer();
        const headers = new Headers(r.headers); headers.set('x-saved-at', String(Date.now()));
        await c.put(req, new Response(body, { status: 200, headers }));
      }
      return r;
    } catch (e) {
      if (hit) await c.delete(req);
      const error = hit ? 'expired' : 'offline';
      return new Response(JSON.stringify({ error }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('/api/chapter')) { e.respondWith(versionChapter(req)); return; }
  if (url.pathname.includes('/api/')) return;   // always live
  if (url.pathname.includes('/data/c/') || url.pathname.endsWith('/data/kjv.json')) { e.respondWith(cacheFirst(DATA, req)); return; }
  if (url.pathname.includes('/fonts/')) { e.respondWith(cacheFirst(SHELL, req)); return; }
  if (url.origin === location.origin) e.respondWith(staleWhileRevalidate(req));
});
