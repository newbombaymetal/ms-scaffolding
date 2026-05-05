/* NBM — service worker for offline cache. */
const APP_VERSION = '55';
const CACHE = `nbm-v${APP_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=55',
  './app.js?v=55',
  './manifest.json?v=55',
  './version.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() =>
      self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(client => client.postMessage({ type: 'APP_UPDATED', version: APP_VERSION }))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(hit =>
        hit || fetch(e.request).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
      )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit => {
      const fresh = fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => null);
      return hit || fresh.then(res => res || caches.match('./index.html'));
    })
  );
});
