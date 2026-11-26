import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
import {
  bindChatPush,
  chatPushEndpoint,
  chatPushPreferenceKey,
  waitForChatPushBindings,
} from "@/utils/teamPush";
export function useTeamChatNotifications(token) {
  const chat = useTeamChatStore(),
    enabled = ref(false),
    busy = ref(false),
    error = ref("");
  let generation = 0, refreshing = null, recovery;
  function refresh() {
    if (!chat.me || busy.value || document.hidden) return;
    if (refreshing) return refreshing;
    const identity = chat.me, ticket = ++generation;
    // Renew the device binding when permission was already granted. No OS prompt
    // or test push: this also repairs records removed after an access/role change.
    const pending = bindChatPush(token(), false, identity).then(result => {
      if (ticket === generation) { enabled.value = result.state === 'enabled'; error.value = ''; }
    }).catch(e => {
      if (ticket === generation) { enabled.value = false; error.value = teamError(e); }
    }).finally(() => { if (refreshing === pending) refreshing = null; });
    refreshing = pending;
    return pending;
  }
  async function toggle() {
    if (busy.value || !chat.me) return;
    const identity = chat.me,
      ticket = ++generation;
    busy.value = true;
    error.value = "";
    let disabledPreference = null;
    try {
      if (enabled.value) {
        try {
          disabledPreference = chatPushPreferenceKey(identity);
          if (disabledPreference) localStorage.setItem(disabledPreference, '1');
        } catch { /* Storage can be unavailable. */ }
        // Finish in-flight renewals before deleting the binding, so a focus
        // refresh cannot turn notifications back on after the user's opt-out.
        await waitForChatPushBindings();
        if (ticket !== generation) return;
        const endpoint = await chatPushEndpoint();
        if (endpoint) await teamApi.delete('/push/subscriptions', { data: { endpoint } });
        if (ticket === generation) enabled.value = false;
      } else {
        const result = await bindChatPush(token(), true, identity);
        if (result.state !== "enabled")
          throw Error(
            {
              blocked: "Разрешите уведомления в настройках браузера",
              install: "Для уведомлений добавьте чат на главный экран",
              unsupported: "Этот браузер не поддерживает уведомления",
              unconfigured: "Уведомления чата пока не настроены на сервере",
              permission: "Разрешение на уведомления не предоставлено",
            }[result.state] || "Не удалось включить уведомления",
          );
        if (ticket === generation) enabled.value = true;
      }
    } catch (e) {
      if (disabledPreference) { try { localStorage.removeItem(disabledPreference); } catch { /* Storage unavailable. */ } }
      if (ticket === generation) error.value = teamError(e);
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  watch(
    [() => chat.me?.workspaceId, () => chat.me?.actorId],
    () => {
      generation++;
      refreshing = null;
      enabled.value = false;
      busy.value = false;
      error.value = "";
      void refresh();
    },
    { immediate: true },
  );
  onMounted(() => {
    for (const event of ['focus', 'pageshow', 'online']) window.addEventListener(event, refresh);
    document.addEventListener('visibilitychange', refresh);
    recovery = setInterval(refresh, 60000);
  });
  onBeforeUnmount(() => {
    generation++;
    clearInterval(recovery);
    for (const event of ['focus', 'pageshow', 'online']) window.removeEventListener(event, refresh);
    document.removeEventListener('visibilitychange', refresh);
  });
  return { enabled, busy, error, toggle, refresh };
}
