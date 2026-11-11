/* No offline cache: a shared device must not retain another employee's history. */
importScripts('/team-click-store.js');
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
function clickedUrl(data) {
  const target = chatUrl(data?.url);
  if (!target) return null;
  const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
  if (uuid.test(data.taskId || '')) target.searchParams.set('task', data.taskId);
  if (uuid.test(data.messageId || '')) target.searchParams.set('message', data.messageId);
  return target;
}
let pendingClickWrite = Promise.resolve();
// An iOS launch may create the page before its document can receive postMessage.
// The page asks again after its listener is installed, including when outside /team/.
self.addEventListener('message', event => {
  if (event.data?.type !== 'team:client-ready' || !event.source?.url) return;
  event.waitUntil((async () => {
    await pendingClickWrite;
    const click = await self.index12TeamClickStore.read();
    if (!click) return;
    const source = new URL(event.source.url), target = new URL(click.url);
    if (source.origin !== self.location.origin || target.origin !== self.location.origin) return;
    if (target.pathname.startsWith('/team/') ? source.pathname !== target.pathname : !['/', '/mobile'].includes(source.pathname)) return;
    event.source.postMessage({ type: 'team:refresh', ...click, clickId: click.id });
  })());
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
  const destination = clickedUrl(event.notification.data);
  if (!destination) return;
  const click = {
    id: self.crypto.randomUUID(), savedAt: Date.now(), url: destination.href,
    workspaceId: event.notification.data?.workspaceId,
    taskId: event.notification.data?.taskId, messageId: event.notification.data?.messageId,
  };
  // Commit before focus/openWindow. A cold iOS launch can discard the supplied URL.
  pendingClickWrite = Promise.resolve().then(() => self.index12TeamClickStore.write(click)).catch(() => null);
  event.notification.close();
  event.waitUntil(
    (async () => {
      await pendingClickWrite;
      const target = chatUrl(event.notification.data?.url);
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find((client) => {
        const current = new URL(client.url);
        if (current.pathname === '/mobile') current.pathname = '/';
        current.hash = "";
        current.searchParams.delete("task");
        current.searchParams.delete("message");
        return current.href === target.href;
      });
      if (existing) {
        await existing.focus().catch(() => null);
        const received = await new Promise(resolve => {
          const channel = new MessageChannel();
          const timeout = setTimeout(() => { channel.port1.close(); resolve(false); }, 1500);
          channel.port1.onmessage = event => {
            if (event.data?.received !== true) return;
            clearTimeout(timeout); channel.port1.close(); resolve(true);
          };
          try {
            existing.postMessage({
              type: 'team:refresh', url: destination.href,
              clickId: click.id,
              workspaceId: event.notification.data?.workspaceId,
              taskId: event.notification.data?.taskId,
              messageId: event.notification.data?.messageId,
            }, [channel.port2]);
          } catch {
            clearTimeout(timeout); channel.port1.close(); resolve(false);
          }
        });
        // A suspended or older PWA may focus successfully without handling a message.
        if (!received) {
          const navigated = await existing.navigate(destination.href).catch(() => null);
          if (!navigated) await self.clients.openWindow(destination.href);
        }
      } else {
        const opened = await self.clients.openWindow(destination.href);
        try { opened?.postMessage({ type: 'team:refresh', ...click, clickId: click.id }); } catch { /* The page recovers the committed click when ready. */ }
      }
    })(),
  );
});
