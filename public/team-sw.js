/* No offline cache: a shared device must not retain another employee's history. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate")
    event.respondWith(fetch(event.request));
});
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data;
      try {
        data = event.data.json();
      } catch {
        return;
      }
      const url = new URL(data.url || "", self.location.origin);
      if (
        url.origin !== self.location.origin ||
        !/^\/team\/[\w-]{20,100}$/.test(url.pathname)
      )
        return;
      await self.registration.showNotification(data.title || "Chat", {
        body: data.body || "Новое сообщение",
        icon: "/chat-192.png",
        badge: "/chat-badge.png",
        tag: data.tag,
        data: { url: url.href, workspaceId: data.workspaceId },
      });
      if (data.testId) {
        const windows = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of windows)
          if (client.url.startsWith(url.origin + "/team/"))
            client.postMessage({
              type: "team:push-received",
              testId: data.testId,
            });
      }
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = event.notification.data?.url;
      if (!url || !url.startsWith(self.location.origin + "/team/")) return;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (client) => client.url.split(/[?#]/)[0] === url,
      );
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: "team:refresh" });
      } else await self.clients.openWindow(url);
    })(),
  );
});
