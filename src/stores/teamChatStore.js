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
  const outbox = ref([]);
  const historyLoading = ref(false),
    historyReady = ref(false);
  const notice = ref(""),
    olderMessageIds = ref([]);
  const tab = ref("messages"),
    requestedRequestId = ref(null);
  const me = ref(null),
    state = ref({ messages: [], requests: [], members: [], companies: [] }),
    error = ref(""),
    open = ref(false),
    busy = ref(false),
    unread = ref(0);
  const isOwner = computed(
    () =>
      me.value?.owner === true || me.value?.permissions?.manageMembers === true,
  );
  const pending = computed(() =>
    state.value.members.filter((m) => m.status === "pending"),
  );
  const actionable = computed(
    () =>
      state.value.requests.filter(
        (r) =>
          (r.state === "manager_review" &&
            (me.value?.owner || me.value?.role === "manager")) ||
          (r.state === "director_review" && me.value?.role === "director") ||
          (r.state === "ready" && me.value?.owner),
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
    messageQueue = Promise.resolve(),
    loaded = false,
    pendingSnapshot = null,
    dragFlush;
  function stop() {
    ++generation;
    ++ticket;
    clearInterval(timer);
    clearTimeout(debounce);
    clearTimeout(dragFlush);
    pendingSnapshot = null;
    if (document.body?.dataset)
      delete document.body.dataset.teamRequestDragging;
    document.removeEventListener("drop", finishDrag, { capture: true });
    document.removeEventListener("dragend", finishDrag, { capture: true });
    debounce = null;
    source?.close();
    source = null;
    me.value = null;
    state.value = { messages: [], requests: [], members: [], companies: [] };
    notice.value = "";
    olderMessageIds.value = [];
    open.value = false;
    tab.value = "messages";
    requestedRequestId.value = null;
    unread.value = 0;
    busy.value = false;
    error.value = "";
    loaded = false;
    historyLoading.value = false;
    historyReady.value = false;
    lastMessage = "";
    outbox.value = [];
    messageQueue = Promise.resolve();
    delete teamApi.defaults.headers.common["x-index12-workspace-id"];
    delete teamApi.defaults.headers.common["x-index12-chat-only"];
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", wake);
    running = false;
    again = false;
  }
  function acceptSnapshot(data) {
    const newest = data.messages.at(-1)?._id || "";
    if (loaded && !open.value && newest !== lastMessage) unread.value++;
    lastMessage = newest;
    loaded = true;
    historyReady.value = true;
    state.value = {
      ...data,
      ...(!Object.hasOwn(data, "financial")
        ? { financial: state.value.financial }
        : {}),
    };
    const confirmed = new Set(data.messages.map((row) => row._id));
    outbox.value = outbox.value.filter((row) => !confirmed.has(row._id));
    if (data.identity) me.value = data.identity;
    error.value = "";
  }
  function finishDrag() {
    if (!me.value) return;
    const g = generation;
    clearTimeout(dragFlush);
    dragFlush = setTimeout(() => {
      if (g !== generation) return;
      if (document.body?.dataset)
        delete document.body.dataset.teamRequestDragging;
      const p = pendingSnapshot;
      pendingSnapshot = null;
      if (p && p.g === generation && p.t === ticket) acceptSnapshot(p.data);
    }, 0);
  }
  async function refresh() {
    const g = generation,
      t = ++ticket;
    if (!historyReady.value) historyLoading.value = true;
    try {
      const watchedIds = [
        ...new Set([
          ...state.value.messages.map((m) => m._id),
          ...olderMessageIds.value,
        ]),
      ].slice(0, 150);
      const { data } = await teamApi.get("/state", {
        params: {
          section: tab.value,
          ...(watchedIds.length ? { messageIds: watchedIds.join(",") } : {}),
        },
      });
      if (g !== generation || t !== ticket) return;
      if (document.body?.dataset?.teamRequestDragging === "true")
        pendingSnapshot = { data, g, t };
      else acceptSnapshot(data);
    } catch (e) {
      if (g === generation && t === ticket) {
        error.value = teamError(e);
        if (e.response?.status === 401) {
          stop();
          error.value = teamError(e);
          return;
        }
        if (e.response?.status === 403) {
          source?.close();
          state.value = {
            messages: [],
            requests: [],
            members: [],
            companies: [],
          };
          outbox.value = [];
          if (me.value) me.value = { ...me.value, status: "revoked" };
        }
      }
    } finally {
      if (g === generation && t === ticket) historyLoading.value = false;
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
      if (g === generation) {
        if (e.response?.status === 401) stop();
        error.value = teamError(e);
      }
    }
  }
  async function wake() {
    if (document.visibilityState !== "hidden") {
      if (me.value && me.value.status !== "active") await checkPending();
      else schedule();
    }
  }
  async function start(id = "") {
    stop();
    workspace = id;
    const g = generation;
    if (id) teamApi.defaults.headers.common["x-index12-workspace-id"] = id;
    else teamApi.defaults.headers.common["x-index12-chat-only"] = "1";
    try {
      const { data } = await teamApi.get("/me");
      if (g !== generation) return;
      me.value = data;
      document.addEventListener("drop", finishDrag, { capture: true });
      document.addEventListener("dragend", finishDrag, { capture: true });
      window.addEventListener("focus", wake);
      document.addEventListener("visibilitychange", wake);
      timer = setInterval(() => {
        if (document.visibilityState !== "hidden") {
          if (me.value && me.value.status !== "active") void checkPending();
          else schedule();
        }
      }, 15000);
      if (data.status !== "active") return;
      await refresh();
      if (g !== generation) return;
      source = new EventSource(
        `${base}/team-chat/events?workspaceId=${encodeURIComponent(data.workspaceId)}${id ? "" : "&chatOnly=1"}`,
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
      const { data } = await teamApi.request({ url: path, method, data: body });
      if (g !== generation) return;
      if (data.identity) me.value = data.identity;
      // The mutation is already committed. A subsequent refresh failure must not turn it into a failed save.
      ++ticket;
      if (data.request) {
        if (state.value.activeRequestCosts) {
          const costs = state.value.activeRequestCosts.filter(
            (r) => r._id !== data.request._id,
          );
          state.value.activeRequestCosts = [...costs, data.request];
        }
        const index = state.value.requests.findIndex(
          (r) => r._id === data.request._id,
        );
        if (index < 0) state.value.requests.unshift(data.request);
        else state.value.requests[index] = data.request;
      }
      if (data.message)
        state.value.messages = [
          ...state.value.messages.filter((m) => m._id !== data.message._id),
          data.message,
        ].sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) ||
            a._id.localeCompare(b._id),
        );
      if (data.deletedRequestId) {
        state.value.requests = state.value.requests.filter(
          (r) => r._id !== data.deletedRequestId,
        );
        if (state.value.activeRequestCosts)
          state.value.activeRequestCosts =
            state.value.activeRequestCosts.filter(
              (r) => r._id !== data.deletedRequestId,
            );
      }
      if (data.deletedMessageId)
        state.value.messages = state.value.messages.filter(
          (m) => m._id !== data.deletedMessageId,
        );
      if (data.member) {
        const at = state.value.members.findIndex(
          (m) => m._id === data.member._id,
        );
        if (at >= 0) state.value.members[at] = data.member;
        else state.value.members.unshift(data.member);
      }
      if (data.deletedMemberId)
        state.value.members = state.value.members.filter(
          (m) => m._id !== data.deletedMemberId,
        );
      schedule();
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
  async function deliverMessage(id, g) {
    if (g !== generation) return;
    const row = outbox.value.find((row) => row._id === id);
    if (!row || row._delivery !== "sending") return;
    try {
      const { data } = await teamApi.post("/messages", {
        id: row._id,
        text: row.text,
        fileIds: row.attachments.map((file) => file.fileId),
        ...(row.mentionIds?.length ? { mentionIds: row.mentionIds } : {}),
        ...(row.replyTo ? { replyToId: row.replyTo.messageId } : {}),
      });
      if (g !== generation) return;
      ++ticket;
      const existing = state.value.messages.find(
        (message) => message._id === id,
      );
      const confirmed = {
        ...data.message,
        attachments: (data.message.attachments || []).map((file) => ({
          ...file,
          isPdf: /\.pdf$/i.test(file.name),
        })),
      };
      const message =
        existing &&
        (existing.deletedAt ||
          Number(existing.version || 0) >= Number(confirmed.version || 0))
          ? { ...confirmed, ...existing }
          : confirmed;
      state.value.messages = [
        ...state.value.messages.filter((message) => message._id !== id),
        message,
      ].sort(
        (a, b) =>
          new Date(a.createdAt) - new Date(b.createdAt) ||
          a._id.localeCompare(b._id),
      );
      outbox.value = outbox.value.filter((message) => message._id !== id);
      schedule();
    } catch (e) {
      if (g !== generation) return;
      const pending = outbox.value.find((message) => message._id === id);
      if (pending) {
        pending._delivery = "failed";
        pending._sendError = teamError(e);
      }
      if ([401, 403].includes(e.response?.status)) void refresh();
    }
  }
  function queueMessage(row) {
    const g = generation;
    messageQueue = messageQueue
      .catch(() => {})
      .then(() => deliverMessage(row._id, g));
  }
  function send(text, files = [], options = {}) {
    if (me.value?.status !== "active" || (!text.trim() && !files.length))
      return null;
    const row = {
      _id: crypto.randomUUID(),
      workspaceId: me.value.workspaceId,
      authorId: me.value.actorId,
      authorName: me.value.displayName,
      text: text.trim(),
      ...(options.replyTo ? { replyTo: { ...options.replyTo } } : {}),
      ...(options.mentionIds?.length ? { mentionIds: options.mentionIds } : {}),
      createdAt: new Date().toISOString(),
      attachments: files.map((file) =>
        typeof file === "string" ? { fileId: file } : { ...file },
      ),
      _delivery: "sending",
      _sendError: "",
    };
    outbox.value.push(row);
    queueMessage(row);
    return row._id;
  }
  function retryMessage(id) {
    const row = outbox.value.find((message) => message._id === id);
    if (!row || row._delivery !== "failed" || me.value?.status !== "active")
      return;
    row._delivery = "sending";
    row._sendError = "";
    queueMessage(row);
  }
  function show() {
    open.value = true;
    unread.value = 0;
    schedule();
  }
  return {
    me,
    historyLoading,
    historyReady,
    outbox,
    retryMessage,
    isOwner,
    notice,
    olderMessageIds,
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
