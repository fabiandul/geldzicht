// Service worker: maakt de app installeerbaar en offline bruikbaar.
// Verhoog VERSION na elke update zodat telefoons de nieuwe bestanden ophalen.
const VERSION = 'geldzicht-v1.7.1';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/config.js', 'js/store.js', 'js/parser.js', 'js/logic.js', 'js/categories.js', 'js/demo.js', 'js/invest.js', 'js/insights.js',
  'lib/chart.umd.min.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase-verkeer nooit cachen
  if (/googleapis\.com$|firebaseio\.com$|firebaseapp\.com$/.test(url.hostname) && !url.hostname.startsWith('fonts.')) return;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isLib = url.origin === location.origin && (url.pathname.includes('/lib/') || url.pathname.includes('/icons/'));
  if (isFont || isLib) {
    // eerst uit cache, anders ophalen en bewaren
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // app-bestanden: eerst netwerk (altijd de nieuwste versie), offline uit cache
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
});
