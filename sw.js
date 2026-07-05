/* ExamCoach service worker.
 * Strategy:
 *   - App shell (own files): precache + cache-first, so the app opens offline.
 *   - Runtime same-origin GETs: stale-while-revalidate.
 *   - Cross-origin (api.anthropic.com etc.): never intercepted – always network.
 * Bump CACHE_VERSION whenever shell files change to force an update.
 */
const CACHE_VERSION = 'v2';
const CACHE_NAME = `examcoach-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/router.js',
  './js/util/dom.js',
  './js/data/db.js',
  './js/data/model.js',
  './js/data/scheduler.js',
  './js/data/progress.js',
  './js/api/pdf.js',
  './js/api/anthropic.js',
  './js/ui/appbar.js',
  './js/ui/scaffold.js',
  './js/ui/loading.js',
  './js/ui/charts.js',
  './js/ui/player.js',
  './js/views/modules.js',
  './js/views/module-new.js',
  './js/views/module-detail.js',
  './js/views/session.js',
  './js/views/exam.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // addAll is atomic; ignore individual misses to stay resilient.
      .then((cache) => Promise.allSettled(APP_SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch cross-origin requests (Anthropic API, pdf.js CDN, etc.).
  if (url.origin !== self.location.origin) return;

  // Navigations: serve cached index.html when offline (SPA shell).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Same-origin assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          if (resp && resp.ok && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
