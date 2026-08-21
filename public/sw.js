// Minimal Web Push service worker — no bundler/PWA plugin, plain static
// file. Only handles push display + click-through; no caching/offline
// behavior (out of scope for this milestone).

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "CompassFinance";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/favicon.ico",
      data: { href: data.href || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.endsWith(href) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(href);
    })
  );
});
