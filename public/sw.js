/* eslint-disable no-restricted-globals */

self.addEventListener("notificationclick", (event) => {
  event.notification?.close?.();
  const data = event.notification?.data as any;
  const targetUrl = new URL(data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const exact = clientsList.find((c) => c.url === targetUrl);
      if (exact) return exact.focus();

      const sameOrigin = clientsList.find(
        (c) => new URL(c.url).origin === self.location.origin
      );
      if (sameOrigin) {
        await sameOrigin.focus();
        sameOrigin.postMessage({ type: "NAVIGATE", url: targetUrl });
        return;
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

