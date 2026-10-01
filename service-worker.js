// Y2K Team Hub — service worker
// Strategy: stale-while-revalidate. The app opens instantly from whatever
// was cached last time (no black/white wait), while a fresh copy downloads
// quietly in the background and gets swapped in for the *next* open — that's
// still how parents get your edits automatically, no reinstall needed.
// If there's no cache yet (first install) or the network fails with nothing
// cached, it falls back to whatever it can get.

const CACHE_NAME = 'y2k-hub-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        // Serve the cached copy right away; the network response (if any)
        // just refreshes the cache for the next time the app opens.
        event.waitUntil(networkFetch);
        return cached;
      }

      // Nothing cached yet (first run on this device) — wait for the network,
      // and fall back to the cached shell if that also fails.
      return networkFetch.then((response) => response || caches.match('./index.html'));
    })
  );
});
