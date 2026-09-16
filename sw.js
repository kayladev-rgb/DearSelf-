/* DearSelf V46.1 service worker — persistent duplicate-safe Web Push handling. */
const CACHE_NAME = 'dearself-cache-v1';
const RECENT_PUSHES = new Map();
const DEDUP_MS = 15000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener('push', event => {
  event.waitUntil((async()=>{
    let data = {};
    try { data = event.data ? event.data.json() : {}; }
    catch (e) { data = { title: 'DearSelf', body: event.data ? event.data.text() : '' }; }

    const key = String(data.tag || data.key || (data.title + '|' + data.body));
    const now = Date.now();
    const previous = RECENT_PUSHES.get(key);
    if (previous && now - previous < DEDUP_MS) return;
    RECENT_PUSHES.set(key, now);
    for (const [k,t] of RECENT_PUSHES) if (now-t > DEDUP_MS) RECENT_PUSHES.delete(k);

    const existing = await self.registration.getNotifications({tag:key});
    if (existing && existing.length) return;

    const title = data.title || 'DearSelf';
    const options = {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-96.png',
      tag: key,
      renotify: false,
      data: { url: data.url || '/' }
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
