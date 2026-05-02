/* eslint-disable no-restricted-globals */

self.addEventListener("notificationclick", (event) => {
  event.notification?.close?.();
  const data = event.notification && event.notification.data;
  const urlFromData =
    data && typeof data === "object" && data !== null && "url" in data && typeof data.url === "string"
      ? data.url
      : "/";
  const targetUrl = new URL(urlFromData || "/", self.location.origin).href;

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

