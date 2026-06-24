const CACHE_NAME = 'wis-field-app-v1';
const APP_SHELL = [
  '/field/',
  '/field/index.html',
  '/field/field-app.js',
  '/field/field-store.js',
  '/field/manifest.webmanifest',
  '/assets/css/style.css',
  '/assets/img/favicon.svg',
  '/assets/img/wis-logo.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ success: false, offline: true, message: 'Offline. Use pending sync when connection is restored.' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  if (url.pathname.startsWith('/field/') || APP_SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    })));
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
