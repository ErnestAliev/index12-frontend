/* No offline cache: a shared device must not retain another employee's history. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate")
    event.respondWith(fetch(event.request));
});
function chatUrl(value) {
  let url;
  try {
    url = new URL(value || "", self.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== self.location.origin || url.hash) return null;
  if (/^\/team\/[\w-]{20,100}$/.test(url.pathname) && !url.search) return url;
  if (url.pathname === "/" && /^\?teamChat=[a-f\d]{24}$/i.test(url.search))
    return url;
  return null;
}
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data;
      try {
        data = event.data.json();
      } catch {
        return;
      }
      const url = chatUrl(data.url);
      if (!url) return;
      await self.registration.showNotification(data.title || "Chat", {
        body: data.body || "Новое сообщение",
        icon: "/chat-192.png",
        badge: "/chat-badge.png",
        tag: data.tag,
        data: {
          url: url.href,
          workspaceId: data.workspaceId,
          taskId: data.taskId,
          messageId: data.messageId,
        },
      });
      if (data.testId) {
        const windows = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of windows)
          if (new URL(client.url).origin === url.origin)
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
      const target = chatUrl(event.notification.data?.url);
      if (!target) return;
      const url = target.href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find((client) => {
        const current = new URL(client.url);
        current.hash = "";
        current.searchParams.delete("task");
        current.searchParams.delete("message");
        return current.href === url;
      });
      if (existing) {
        await existing.focus();
        existing.postMessage({
          type: "team:refresh",
          workspaceId: event.notification.data?.workspaceId,
          taskId: event.notification.data?.taskId,
          messageId: event.notification.data?.messageId,
        });
      } else {
        const destination = new URL(url);
        if (/^[a-f\d-]{36}$/i.test(event.notification.data?.taskId || "")) {
          destination.searchParams.set("task", event.notification.data.taskId);
          if (/^[a-f\d-]{36}$/i.test(event.notification.data?.messageId || ""))
            destination.searchParams.set(
              "message",
              event.notification.data.messageId,
            );
        }
        await self.clients.openWindow(destination.href);
      }
    })(),
  );
});
