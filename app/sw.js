/* UM Connect+ service worker: app shell cached for fast start and offline launch.
   Firebase and Google requests always go to the network. */
const VERSION = 'umc-__VERSION__';
const SHELL = [
  './', 'index.html', 'offline.html', 'manifest.webmanifest', 'firestore.rules',
  'css/app.css?v=__VERSION__', 'js/main.js?v=__VERSION__',
  'js/backend.js', 'js/firebase-config.js', 'js/data.js', 'js/ui.js', 'js/icons.js', 'js/cafes.js', 'js/demo-seed.js',
  'js/views/auth.js', 'js/views/student.js', 'js/views/merchant.js', 'js/views/mpp.js',
  'js/fake/fakefb.js', 'js/fake/rules-engine.js',
  'vendor/firebase.js', 'vendor/qrcode.min.js', 'vendor/jsQR.js',
  'fonts/montserrat-latin-500-normal.woff2', 'fonts/montserrat-latin-600-normal.woff2',
  'fonts/montserrat-latin-700-normal.woff2', 'fonts/montserrat-latin-800-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-48.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('umc-') && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/__/')) return; // Firebase Hosting reserved URLs
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('index.html', copy)); return r; })
      .catch(async () => (await caches.match('index.html')) || caches.match('offline.html')));
    return;
  }
  // Network first so a new deploy is picked up immediately; the cache is only the offline fallback.
  e.respondWith(fetch(req).then((r) => {
    if (r.ok && !url.pathname.endsWith('exceljs.min.js')) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return r;
  }).catch(async () => (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true })) || Response.error()));
});
