import { defineStore } from "pinia";
import { ref, computed } from "vue";
import axios from "axios";
const base =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window === "undefined"
    ? "http://localhost:3000/api"
    : `${window.location.origin}/api`);
export const teamApi = axios.create({
  baseURL: `${base}/team-chat`,
  withCredentials: true,
  timeout: 20000,
});
export const teamError = (e) =>
  e.response?.data?.message || e.message || "Не удалось связаться с чатом";
export const useTeamChatStore = defineStore("teamChat", () => {
  const tab = ref("messages"),
    requestedRequestId = ref(null);
  const me = ref(null),
    state = ref({ messages: [], requests: [], members: [], companies: [] }),
    error = ref(""),
    open = ref(false),
    busy = ref(false),
    unread = ref(0);
  const pending = computed(() =>
    state.value.members.filter((m) => m.status === "pending"),
  );
  const actionable = computed(
    () =>
      state.value.requests.filter(
        (r) =>
          (r.state === "manager_review" && me.value?.role === "manager") ||
          (r.state === "director_review" && me.value?.role === "director") ||
          (r.state === "ready" &&
            me.value?.owner &&
            me.value?.role === "manager"),
      ).length,
  );
  let generation = 0,
    ticket = 0,
    source,
    timer,
    debounce,
    running = false,
    again = false,
    workspace = "",
    lastMessage = "",
    sendId = null,
    sendKey = "",
    loaded = false;
  function stop() {
    ++generation;
    ++ticket;
    clearInterval(timer);
    clearTimeout(debounce);
    debounce = null;
    source?.close();
    source = null;
    me.value = null;
    state.value = { messages: [], requests: [], members: [], companies: [] };
    open.value = false;
    tab.value = "messages";
    requestedRequestId.value = null;
    unread.value = 0;
    busy.value = false;
    error.value = "";
    loaded = false;
    lastMessage = "";
    sendId = null;
    delete teamApi.defaults.headers.common["x-index12-workspace-id"];
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", wake);
    running = false;
    again = false;
  }
  async function refresh() {
    const g = generation,
      t = ++ticket;
    try {
      const { data } = await teamApi.get("/state");
      if (g !== generation || t !== ticket) return;
      const newest = data.messages.at(-1)?._id || "";
      if (loaded && !open.value && newest !== lastMessage) unread.value++;
      lastMessage = newest;
      loaded = true;
      state.value = data;
      error.value = "";
    } catch (e) {
      if (g === generation && t === ticket) {
        error.value = teamError(e);
        if ([401, 403].includes(e.response?.status)) {
          source?.close();
          state.value = {
            messages: [],
            requests: [],
            members: [],
            companies: [],
          };
          if (me.value) me.value = { ...me.value, status: "revoked" };
        }
      }
    }
  }
  function schedule() {
    if (
      !me.value ||
      me.value.status !== "active" ||
      document.visibilityState === "hidden"
    )
      return;
    again = true;
    if (debounce || running) return;
    const g = generation;
    debounce = setTimeout(async () => {
      debounce = null;
      if (g !== generation) return;
      again = false;
      running = true;
      try {
        await refresh();
      } finally {
        if (g === generation) {
          running = false;
          if (again) schedule();
        }
      }
    }, 80);
  }
  async function checkPending() {
    const g = generation;
    try {
      const { data } = await teamApi.get("/me");
      if (g !== generation) return;
      if (data.status === "active") await start(workspace);
      else me.value = data;
    } catch (e) {
      if (g === generation) error.value = teamError(e);
    }
  }
  async function wake() {
    if (document.visibilityState !== "hidden") {
      if (me.value?.status === "pending") await checkPending();
      else schedule();
    }
  }
  async function start(id = "") {
    stop();
    workspace = id;
    const g = generation;
    if (id) teamApi.defaults.headers.common["x-index12-workspace-id"] = id;
    try {
      const { data } = await teamApi.get("/me");
      if (g !== generation) return;
      me.value = data;
      window.addEventListener("focus", wake);
      document.addEventListener("visibilitychange", wake);
      timer = setInterval(() => {
        if (document.visibilityState !== "hidden") {
          if (me.value?.status === "pending") void checkPending();
          else schedule();
        }
      }, 15000);
      if (data.status !== "active") return;
      await refresh();
      if (g !== generation) return;
      source = new EventSource(
        `${base}/team-chat/events?workspaceId=${encodeURIComponent(data.workspaceId)}`,
        { withCredentials: true },
      );
      source.addEventListener("changed", schedule);
      source.onopen = schedule;
    } catch (e) {
      if (g === generation) error.value = teamError(e);
    }
  }
  async function action(path, body, method = "post") {
    const g = generation;
    busy.value = true;
    try {
      const { data } = await teamApi[method](path, body);
      if (g !== generation) return;
      const { data: identity } = await teamApi.get("/me");
      if (g !== generation) return;
      me.value = identity;
      await refresh();
      return data;
    } catch (e) {
      if (g === generation) {
        error.value = teamError(e);
        if (e.response?.status === 409) await refresh();
      }
      throw e;
    } finally {
      if (g === generation) busy.value = false;
    }
  }
  async function send(text, fileIds) {
    const key = JSON.stringify([text, fileIds]);
    if (!sendId || key !== sendKey) {
      sendId = crypto.randomUUID();
      sendKey = key;
    }
    const result = await action("/messages", { id: sendId, text, fileIds });
    if (result) sendId = null;
    return result;
  }
  function show() {
    open.value = true;
    unread.value = 0;
    schedule();
  }
  return {
    me,
    tab,
    requestedRequestId,
    state,
    error,
    open,
    busy,
    unread,
    pending,
    actionable,
    start,
    stop,
    refresh,
    schedule,
    action,
    send,
    show,
  };
});
