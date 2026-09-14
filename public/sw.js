const CACHE = 'dearself-v43-6-beta';
const CORE = ['./', './index.html', './version.json', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith('dearself-') && key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Always prefer the network for the app shell and version file.
  if (
    url.origin === location.origin &&
    (url.pathname.endsWith('/index.html') ||
     url.pathname.endsWith('/version.json') ||
     url.pathname.endsWith('/sw.js'))
  ) {
    event.respondWith(
      fetch(event.request, {cache: 'no-store'})
        .then(response => {
          if (response && response.ok && !url.pathname.endsWith('/sw.js')) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache same-origin assets after the first successful network request.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok && url.origin === location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
