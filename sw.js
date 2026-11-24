// God's Word service worker: keeps the app and the chapters you read available offline.
const SHELL = 'gw-shell-v5';
const DATA = 'gw-bible-v1';
const FILES = ['./', 'index.html', 'app.js', 'data.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/favicon.png', 'icons/apple-touch-icon.png', 'icons/shortcut-96.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Bible text never changes: cache first
  if (url.pathname.includes('/data/bible/')) {
    e.respondWith(caches.open(DATA).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  // Fonts: cache first so the app looks right offline
  if (url.host.includes('fonts.g')) {
    e.respondWith(caches.open(SHELL).then(async c => (await c.match(req)) || fetch(req).then(r => { c.put(req, r.clone()); return r; })));
    return;
  }
  // App files: network first, fall back to cache when offline
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req).then(m => m || caches.match('index.html'))));
  }
});
