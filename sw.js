/* DearSelf Service Worker — V44.3 */

const CACHE_NAME = "dearself-cache-v44.3";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  // Keep network-first behavior; fall back to the cache when available.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "DearSelf",
      body: event.data ? event.data.text() : ""
    };
  }

  const title = data.title || "DearSelf";
  const options = {
    body: data.body || "",
    icon: data.icon || "./icons/icon-192.png",
    badge: data.badge || "./icons/icon-96.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    requireInteraction: false,
    data: {
      url: data.url || "./"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const target = event.notification?.data?.url || "./";

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clients => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      return self.clients.openWindow
        ? self.clients.openWindow(target)
        : undefined;
    })
  );
});
