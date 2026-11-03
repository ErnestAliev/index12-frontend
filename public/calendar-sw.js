self.addEventListener('push', event => {
  let data; try { data = event.data.json(); } catch { return; }
  if (!data?.taskId) return;
  event.waitUntil(self.registration.showNotification(data.title || 'INDEX12', { body: data.body || '', tag: data.tag, data: { taskId: data.taskId, workspaceId: data.workspaceId }, icon: '/favicon.ico' }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const tab of tabs) if (new URL(tab.url).origin === self.location.origin) { await tab.focus(); tab.postMessage({ type: 'index12:open-calendar', ...data }); return; }
    const url = new URL('/', self.location.origin); url.searchParams.set('calendarTask', data.taskId); url.searchParams.set('calendarWorkspace', data.workspaceId); await self.clients.openWindow(url.href);
  })());
});
