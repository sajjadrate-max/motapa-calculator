const CACHE_NAME = 'motapa-calculator-v8';
const APP_SHELL = [
  '/',
  '/index.html',
  '/about.html',
  '/contact.html',
  '/terms.html',
  '/privacy.html',
  '/disclaimer.html',
  '/motapa-calculator.html',
  '/404.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/favicon-32x32.png',
  '/og-image.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Cache each shell file independently so one failed/missing file
      // (e.g. a slow first deploy) doesn't block the whole app from
      // becoming available offline.
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const isHTML = event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first for HTML: always try to fetch the latest page first
    // so updates appear immediately. Falls back to cache only if offline.
    // This never touches localStorage (diary, saved plans, weight log,
    // language) which is stored separately on the user's own device.
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (icons, etc.)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
