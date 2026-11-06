import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
import {
  bindChatPush,
  chatPushEndpoint,
  chatPushPreferenceKey,
} from "@/utils/teamPush";
export function useTeamChatNotifications(token) {
  const chat = useTeamChatStore(),
    enabled = ref(false),
    busy = ref(false),
    error = ref("");
  let generation = 0;
  async function refresh() {
    if (!chat.me || busy.value) return;
    const ticket = ++generation;
    try {
      const endpoint = await chatPushEndpoint();
      const active =
        endpoint &&
        (
          await teamApi.get("/push/subscriptions/status", {
            params: { endpoint },
          })
        ).data.enabled;
      if (ticket === generation) enabled.value = !!active;
    } catch {
      /* Keep the last confirmed state; the next interaction retries. */
    }
  }
  async function toggle() {
    if (busy.value || !chat.me) return;
    const identity = chat.me,
      ticket = ++generation;
    busy.value = true;
    error.value = "";
    try {
      if (enabled.value) {
        const endpoint = await chatPushEndpoint();
        if (endpoint)
          await teamApi.delete("/push/subscriptions", { data: { endpoint } });
        try {
          const key = chatPushPreferenceKey(identity);
          if (key) localStorage.setItem(key, "1");
        } catch {
          /* Server binding has already been removed. */
        }
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
      if (ticket === generation) error.value = teamError(e);
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  watch(
    [() => chat.me?.workspaceId, () => chat.me?.actorId],
    () => {
      generation++;
      enabled.value = false;
      busy.value = false;
      error.value = "";
      void refresh();
    },
    { immediate: true },
  );
  onMounted(() => window.addEventListener("focus", refresh));
  onBeforeUnmount(() => {
    generation++;
    window.removeEventListener("focus", refresh);
  });
  return { enabled, busy, error, toggle, refresh };
}
