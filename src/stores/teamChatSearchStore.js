import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { teamApi, teamError, useTeamChatStore } from "./teamChatStore";
export const useTeamChatSearchStore = defineStore("teamChatSearch", () => {
  const chat = useTeamChatStore();
  const open = ref(false),
    query = ref(""),
    result = ref(null),
    busy = ref(false),
    error = ref(""),
    scopeTaskId = ref(null);
  let generation = 0,
    controller,
    timer,
    origin,
    focusHandler;
  function registerFocus(handler) {
    focusHandler = handler;
    return () => {
      if (focusHandler === handler) focusHandler = null;
    };
  }
  function focusField() {
    focusHandler?.();
  }
  const hasQuery = computed(() => !!query.value.trim());
  const total = computed(() => result.value?.total || 0);
  const index = computed(() => result.value?.index ?? -1);
  function cancel() {
    ++generation;
    clearTimeout(timer);
    controller?.abort();
    busy.value = false;
  }
  function start() {
    if (open.value) return;
    origin = { tab: chat.tab, taskId: chat.requestedTaskId };
    query.value = "";
    result.value = null;
    error.value = "";
    chat.creatingTask = false;
    chat.creatingTaskParentId = null;
    chat.taskNotifications = false;
    scopeTaskId.value = chat.requestedTaskId || null;
    chat.tab = "messages";
    open.value = true;
  }
  function close(restore = true) {
    cancel();
    open.value = false;
    result.value = null;
    query.value = "";
    error.value = "";
    if (restore && origin && (chat.requestedTaskId || null) === (origin.taskId || null)) {
      chat.tab = origin.tab;
      chat.requestedTaskId = origin.taskId;
    }
  }
  async function find(nextIndex) {
    cancel();
    const q = query.value.trim(),
      g = generation,
      identity = chat.me?.actorId,
      workspace = chat.me?.workspaceId;
    if (!open.value || !q || !workspace) {
      result.value = null;
      return;
    }
    controller = new AbortController();
    busy.value = true;
    error.value = "";
    try {
      const { data } = await teamApi.get("/search", {
        params: { q, ...(scopeTaskId.value ? { taskId: scopeTaskId.value } : {}), ...(nextIndex !== undefined ? { index: nextIndex } : {}) },
        signal: controller.signal,
      });
      if (
        g !== generation ||
        !open.value ||
        identity !== chat.me?.actorId ||
        workspace !== chat.me?.workspaceId
      )
        return;
      result.value = data;
      if (data.task) {
        const i = chat.state.tasks.findIndex((t) => t._id === data.task._id);
        if (i < 0) chat.state.tasks.push(data.task);
        else chat.state.tasks[i] = data.task;
      }

    } catch (e) {
      if (g === generation && e.code !== "ERR_CANCELED")
        error.value = teamError(e);
    } finally {
      if (g === generation) busy.value = false;
    }
  }
  function move(direction) {
    if (busy.value || !total.value) return;
    const i = index.value + direction;
    if (i >= 0 && i < total.value) void find(i);
  }
  watch(() => chat.requestedTaskId, (id) => {
    if (!open.value) return;
    scopeTaskId.value = id || null;
    cancel();
    result.value = null;
    if (hasQuery.value) void find();
  });
  watch(query, () => {
    cancel();
    result.value = null;
    error.value = "";
    if (open.value && query.value.trim()) {
      busy.value = true;
      timer = setTimeout(() => void find(), 250);
    }
  });
  watch(
    [() => chat.me?.workspaceId, () => chat.me?.actorId, () => chat.me?.status],
    () => close(false),
  );
  return {
    open,
    query,
    result,
    busy,
    error,
    hasQuery,
    scopeTaskId,
    total,
    index,
    start,
    registerFocus,
    focusField,
    close,
    find,
    move,
  };
});
