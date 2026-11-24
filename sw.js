// God's Word service worker: opens instantly from the phone, and keeps what you read for offline use.
const SHELL = 'gw-shell-v8';
const DATA = 'gw-data-v2';
const FILES = ['./', 'index.html', 'app.js', 'data.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/favicon.png',
  'icons/apple-touch-icon.png', 'icons/shortcut-96.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.includes('/data/c/') || url.pathname.endsWith('/data/kjv.json')) { e.respondWith(cacheFirst(DATA, req)); return; }
  if (url.host.includes('fonts.g')) { e.respondWith(cacheFirst(SHELL, req)); return; }
  if (url.origin === location.origin) e.respondWith(staleWhileRevalidate(req));
});
