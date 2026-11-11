// Keep push destinations through owner login and mobile routing. Never store chat content.
import '../../shared/team-click-store.js';
const storageKey = 'index12-team-destination';
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
let pending;
let opened;
let restoredClickId;
const completedClickIds = new Set();
async function clickStore() {
  if (typeof indexedDB === 'undefined') return null;
  return globalThis.index12TeamClickStore;
}
function removeDurableClick(id) {
  if (id) void clickStore().then(store => store?.remove(id)).catch(() => {});
}
export function parseTeamDestination(value, origin = window.location.origin) {
  let url;
  try { url = new URL(value, origin); } catch { return null; }
  if (url.origin !== origin || url.hash) return null;
  const staff = /^\/team\/[\w-]{20,100}$/.test(url.pathname);
  const workspaceId = url.searchParams.get('teamChat');
  if (!staff && (!['/', '/mobile'].includes(url.pathname) || !/^[a-f\d]{24}$/i.test(workspaceId || ''))) return null;
  if ([...url.searchParams.keys()].some(key => !['teamChat', 'task', 'message'].includes(key))) return null;
  const taskId = url.searchParams.get('task'), messageId = url.searchParams.get('message');
  if ((taskId && !uuid.test(taskId)) || (messageId && !uuid.test(messageId))) return null;
  return { path: url.pathname + url.search, workspaceId, taskId, messageId, staff };
}
export function rememberTeamDestination(value, clickId) {
  const target = parseTeamDestination(value);
  if (!target) return null;
  const previous = pendingTeamDestination();
  const same = previous && previous.workspaceId === target.workspaceId && previous.taskId === target.taskId && previous.messageId === target.messageId && previous.staff === target.staff && (!target.staff || previous.path.split('?')[0] === target.path.split('?')[0]);
  if (previous?.clickId && !same && previous.clickId !== clickId) removeDurableClick(previous.clickId);
  pending = { ...target, savedAt: Date.now(), ...(clickId || (same && previous.clickId) ? { clickId: clickId || previous.clickId } : {}) };
  opened = null;
  try { sessionStorage.setItem(storageKey, JSON.stringify(pending)); } catch { /* Memory still covers warm navigation. */ }
  return target;
}
export async function restoreTeamClick({ preferLocation = false } = {}) {
  const store = await clickStore(), click = await store?.read();
  if (!click?.id || click.id === restoredClickId || !parseTeamDestination(click.url)) return false;
  const explicit = parseTeamDestination(window.location.href), target = parseTeamDestination(click.url);
  if (preferLocation && explicit && (explicit.taskId || explicit.messageId) &&
      (explicit.workspaceId !== target.workspaceId || explicit.taskId !== target.taskId || explicit.messageId !== target.messageId)) {
    await store.remove(click.id);
    return false;
  }
  // A staff invitation cannot consume an owner's click, or another invitation's.
  const currentPath = new URL(window.location.href).pathname;
  if (target.staff ? currentPath !== target.path.split('?')[0] : !['/', '/mobile'].includes(currentPath)) return false;
  restoredClickId = click.id;
  rememberTeamDestination(click.url, click.id);
  return true;
}
export function pendingTeamDestination() {
  if (!pending) {
    try { pending = JSON.parse(sessionStorage.getItem(storageKey)); } catch { /* Optional storage. */ }
  }
  if (!pending || Date.now() - pending.savedAt > 30 * 60 * 1000 || !parseTeamDestination(pending.path)) return null;
  return pending;
}
export function teamAuthUrl(base, path) {
  const target = (path && parseTeamDestination(path)) || pendingTeamDestination();
  const url = new URL(base, window.location.origin);
  if (target && !target.staff) url.searchParams.set('returnTo', new URL(target.path, window.location.origin).href);
  return url.href;
}
function eligibleDestination(identity, path) {
  const target = pendingTeamDestination();
  if (!target || identity?.status !== 'active') return null;
  if (target.staff ? path !== target.path.split('?')[0] : !identity.owner || target.workspaceId !== identity.workspaceId || path.startsWith('/team/')) return null;
  return target;
}
export function takeTeamDestination(identity, path) {
  const target = eligibleDestination(identity, path);
  if (!target) return null;
  discardTeamDestination();
  return target;
}
export function discardTeamDestination() {
  const clickId = pendingTeamDestination()?.clickId;
  if (clickId) completedClickIds.add(clickId);
  removeDurableClick(clickId);
  pending = null; opened = null;
  try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
}
export function openTeamDestination(chat, path) {
  const target = eligibleDestination(chat.me, path);
  if (!target) return false;
  if (opened === target && chat.open && chat.requestedTaskId === target.taskId &&
      (target.taskId ? chat.requestedTaskMessageId : chat.requestedMessageId) === target.messageId) return false;
  opened = target;
  chat.creatingTask = false;
  chat.taskNotifications = false;
  chat.tab = 'messages';
  chat.requestedTaskId = target.taskId;
  chat.requestedTaskMessageId = target.taskId ? target.messageId : null;
  chat.requestedMessageId = target.taskId ? null : target.messageId;
  chat.show();
  return true;
}
export function completeTeamDestination({workspaceId, taskId = null, messageId = null}) {
  const target = pendingTeamDestination();
  if (!target || (target.workspaceId && target.workspaceId !== workspaceId) || target.taskId !== taskId || target.messageId !== messageId) return false;
  discardTeamDestination();
  window.dispatchEvent(new Event('index12:team-destination-visible'));
  return true;
}
export function connectTeamDestinations(router) {
  rememberTeamDestination(window.location.href);
  let lastWorkerUpdate = 0;
  async function updateWorker() {
    if (document.visibilityState === 'hidden' || Date.now() - lastWorkerUpdate < 60000) return;
    lastWorkerUpdate = Date.now();
    try {
      const registration = await navigator.serviceWorker?.getRegistration('/team/');
      if (registration?.active?.scriptURL.endsWith('/team-sw.js')) await registration.update();
    } catch { /* An offline resume must still open the existing chat. */ }
  }
  void updateWorker();
  document.addEventListener('visibilitychange', updateWorker);
  // OAuth returns owners to /. Restore the destination before the mobile redirect.
  let initial = true;
  const removeGuard = router.beforeEach(to => {
    if (!initial) return;
    initial = false;
    const target = pendingTeamDestination();
    if (target && !target.staff && ['/', '/mobile'].includes(to.path) && !to.query.teamChat)
      return target.path;
  });
  const changed = () => window.dispatchEvent(new Event('index12:team-destination'));
  async function recoverClickedDestination() {
    if (document.visibilityState === 'hidden') return;
    if (await restoreTeamClick()) {
      const target = pendingTeamDestination();
      if (target) { try { await router.replace(target.path); changed(); } catch { /* Keep the durable click for the next startup. */ } }
    }
    // No controller is required: the owner's / page is outside the /team/ scope.
    try {
      const registration = await navigator.serviceWorker?.getRegistration('/team/');
      if (registration?.active?.scriptURL.endsWith('/team-sw.js'))
        registration.active.postMessage({ type: 'team:client-ready' });
    } catch { /* Storage and URL recovery remain available offline. */ }
  }
  document.addEventListener('visibilitychange', recoverClickedDestination);
  window.addEventListener('pageshow', recoverClickedDestination);
  window.addEventListener('focus', recoverClickedDestination);
  navigator.serviceWorker?.addEventListener('controllerchange', recoverClickedDestination);
  const removeAfter = router.afterEach((to, from, failure) => {
    if (!failure && to.fullPath !== from.fullPath && parseTeamDestination(to.fullPath)) {
      rememberTeamDestination(to.fullPath);
      changed();
    }
  });
  async function notification(event) {
    if (event.data?.type !== 'team:refresh') return;
    if (event.data.clickId && completedClickIds.has(event.data.clickId)) {
      event.ports?.[0]?.postMessage({ received: true });
      return;
    }
    const fallback = new URL(window.location.href);
    if (!fallback.pathname.startsWith('/team/') && /^[a-f\d]{24}$/i.test(event.data.workspaceId || ''))
      fallback.searchParams.set('teamChat', event.data.workspaceId);
    for (const [key, value] of [['task', event.data.taskId], ['message', event.data.messageId]]) {
      fallback.searchParams.delete(key);
      if (uuid.test(value || '')) fallback.searchParams.set(key, value);
    }
    const target = rememberTeamDestination(event.data.url || fallback.href, event.data.clickId);
    if (!target) return;
    try { await router.replace(target.path); } catch { return; }
    changed();
    event.ports?.[0]?.postMessage({ received: true });
  }
  navigator.serviceWorker?.addEventListener('message', notification);
  void router.isReady?.().then(recoverClickedDestination);
  return () => {
    removeGuard(); removeAfter();
    document.removeEventListener('visibilitychange', updateWorker);
    document.removeEventListener('visibilitychange', recoverClickedDestination);
    window.removeEventListener('pageshow', recoverClickedDestination);
    window.removeEventListener('focus', recoverClickedDestination);
    navigator.serviceWorker?.removeEventListener('controllerchange', recoverClickedDestination);
    navigator.serviceWorker?.removeEventListener('message', notification);
  };
}
