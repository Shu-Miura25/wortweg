// WortWeg v4 — スマホのホーム画面追加後はオフラインでも学習できます。
// 公開時はHTTPSが必要。更新時は CACHE のバージョンを上げてください。
const CACHE = 'wortweg-static-v4';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './data/words.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('wortweg-static-') && key !== CACHE)
        .map((key) => caches.delete(key))
    )),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // HTMLはネットワークを優先。公開した修正を取り込みやすくします。
  const isHTML = event.request.mode === 'navigate' || url.pathname.endsWith('.html');
  if (isHTML) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }))
    );
  }
});
