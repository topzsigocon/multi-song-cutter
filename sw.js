const CACHE_NAME = 'multi-song-cutter-v5-offline';
const APP_SHELL = [
  './', './index.html', './app.js', './manifest.json',
  './icon-192.png', './icon-512.png', './screenshot-540x960.png'
];
const ENCODER_URL = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isEncoder = req.url === ENCODER_URL;
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin && !isEncoder) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const response = await fetch(req);
      // Cache the CDN encoder response too. It may be an opaque response because
      // the script is cross-origin; Cache.put supports opaque responses.
      if (response && (response.ok || response.type === 'opaque')) {
        await cache.put(req, response.clone());
      }
      return response;
    } catch (err) {
      if (isSameOrigin) {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
