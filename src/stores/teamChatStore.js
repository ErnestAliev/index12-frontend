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
  const messageDeletions = ref({});
  const failedMessageDeletions = computed(() =>
    Object.fromEntries(
      Object.entries(messageDeletions.value).filter(
        ([, entry]) => entry.status === "failed",
      ),
    ),
  );
  const deletionKey = () =>
    me.value
      ? `index12-chat-deletions:${me.value.workspaceId}:${me.value.actorId}`
      : null;
  function persistDeletions() {
    try {
      const key = deletionKey();
      if (key)
        localStorage.setItem(
          key,
          JSON.stringify(
            Object.values(messageDeletions.value).filter(
              (row) => row.status !== "done",
            ),
          ),
        );
    } catch {
      /* The in-memory queue still protects this session if storage is unavailable. */
    }
  }
  function resumeDeletions() {
    try {
      const saved = JSON.parse(localStorage.getItem(deletionKey()) || "[]");
      if (!Array.isArray(saved)) return;
      for (const row of saved) {
        if (
          !/^[a-f\d-]{36}$/i.test(row?._id || "") ||
          typeof row.authorId !== "string" ||
          !["pending", "failed"].includes(row.status)
        )
          continue;
        messageDeletions.value[row._id] = { ...row, status: "failed" };
        if (row.status === "pending") deleteMessage(row);
      }
    } catch {
      /* Storage is optional. */
    }
  }
  function restoreMessage(id) {
    if (messageDeletions.value[id]?.status === "failed")
      delete messageDeletions.value[id];
    persistDeletions();
  }
  function deleteMessage(row) {
    if (
      !me.value ||
      me.value.status !== "active" ||
      (!isOwner.value && row.authorId !== me.value.actorId)
    )
      return;
    const id = row._id;
    if (!id || ["pending", "done"].includes(messageDeletions.value[id]?.status))
      return;
    const g = generation;
    messageDeletions.value[id] = {
      _id: id,
      authorId: row.authorId,
      status: "pending",
      error: "",
    };
    persistDeletions();
    void teamApi
      .delete(`/messages/${id}`)
      .then(() => {
        if (g !== generation) return;
        ++ticket;
        messageDeletions.value[id].status = "done";
        persistDeletions();
        state.value.messages = state.value.messages.filter((m) => m._id !== id);
        for (const thread of Object.values(threads.value)) {
          thread.messages = thread.messages.filter((m) => m._id !== id);
          thread.deletedMessageIds = [
            ...new Set([...(thread.deletedMessageIds || []), id]),
          ];
        }
        schedule();
      })
      .catch((e) => {
        if (g !== generation) return;
        messageDeletions.value[id] = {
          _id: id,
          authorId: row.authorId,
          status: e.response?.status === 404 ? "done" : "failed",
          error: teamError(e),
        };
        persistDeletions();
      });
  }
  const threads = ref({});
  const threadTickets = new Map();
  const historyLoading = ref(false),
    historyReady = ref(false);
  const notice = ref(""),
    olderMessageIds = ref([]);
  const taskNotifications = ref(false);
  const creatingTask = ref(false);
  const requestedTaskMessageId = ref(null);
  const tab = ref("messages"),
    requestedTaskId = ref(null);
  const me = ref(null),
    state = ref({ messages: [], tasks: [], members: [], people: [] }),
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
      (state.value.tasks || []).filter(
        (task) => task.unreadCount || task.mentioned,
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
    state.value = { messages: [], tasks: [], members: [], people: [] };
    notice.value = "";
    olderMessageIds.value = [];
    open.value = false;
    tab.value = "messages";
    requestedTaskId.value = null;
    requestedTaskMessageId.value = null;
    taskNotifications.value = false;
    creatingTask.value = false;
    unread.value = 0;
    busy.value = false;
    error.value = "";
    loaded = false;
    historyLoading.value = false;
    historyReady.value = false;
    lastMessage = "";
    outbox.value = [];
    messageDeletions.value = {};
    threads.value = {};
    threadTickets.clear();
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
    state.value = data;
    const confirmed = new Set(data.messages.map((row) => row._id));
    outbox.value = outbox.value.filter((row) => !confirmed.has(row._id));
    if (data.identity) me.value = data.identity;
    error.value = "";
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
      acceptSnapshot(data);
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
            tasks: [],
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
      if (data.status === "active") resumeDeletions();
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
  async function refreshThread(id, messageIds = []) {
    const g = generation,
      t = (threadTickets.get(id) || 0) + 1;
    threadTickets.set(id, t);
    threads.value[id] ||= {
      messages: [],
      messageUpdates: [],
      deletedMessageIds: [],
      ready: false,
    };
    const snapshot = threads.value[id];
    snapshot.loading = true;
    try {
      const { data } = await teamApi.get("/messages", {
        params: {
          taskId: id,
          ...(messageIds.length
            ? { messageIds: messageIds.slice(0, 150).join(",") }
            : {}),
        },
      });
      if (g !== generation || threadTickets.get(id) !== t) return;
      threads.value[id] = { ...data, ready: true, loading: false };
      snapshot.error = "";
    } catch (e) {
      if (g === generation && threadTickets.get(id) === t) {
        snapshot.error = teamError(e);
        throw e;
      }
    } finally {
      if (g === generation && threads.value[id])
        threads.value[id].loading = false;
    }
  }
  function mergeMessage(message) {
    const target =
      message.taskId && message.kind !== "task"
        ? (threads.value[message.taskId] ||= { messages: [], ready: true })
        : state.value;
    if (message.taskId)
      threadTickets.set(
        message.taskId,
        (threadTickets.get(message.taskId) || 0) + 1,
      );
    target.messages = [
      ...target.messages.filter((m) => m._id !== message._id),
      message,
    ].sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a._id.localeCompare(b._id),
    );
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
      if (data.task) {
        const index = state.value.tasks.findIndex(
          (t) => t._id === data.task._id,
        );
        if (index < 0) state.value.tasks.unshift(data.task);
        else state.value.tasks[index] = data.task;
      }
      if (data.message) mergeMessage(data.message);
      if (data.deletedMessageId) {
        state.value.messages = state.value.messages.filter(
          (m) => m._id !== data.deletedMessageId,
        );
        for (const thread of Object.values(threads.value)) {
          thread.messages = thread.messages.filter(
            (m) => m._id !== data.deletedMessageId,
          );
          thread.deletedMessageIds = [
            ...new Set([
              ...(thread.deletedMessageIds || []),
              data.deletedMessageId,
            ]),
          ];
        }
      }
      if (data.deletedTaskId) {
        state.value.tasks = state.value.tasks.filter(
          (t) => t._id !== data.deletedTaskId,
        );
        state.value.messages = state.value.messages.filter(
          (m) => m.taskId !== data.deletedTaskId,
        );
        delete threads.value[data.deletedTaskId];
        outbox.value = outbox.value.filter(
          (m) => m.taskId !== data.deletedTaskId,
        );
        if (requestedTaskId.value === data.deletedTaskId) {
          requestedTaskId.value = null;
          requestedTaskMessageId.value = null;
        }
      }
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
        ...(row.taskId ? { taskId: row.taskId } : {}),
        fileIds: row.attachments.map((file) => file.fileId),
        ...(row.mentionIds?.length ? { mentionIds: row.mentionIds } : {}),
        ...(row.replyTo ? { replyToId: row.replyTo.messageId } : {}),
      });
      if (g !== generation) return;
      ++ticket;
      const existing = (
        row.taskId
          ? threads.value[row.taskId]?.messages || []
          : state.value.messages
      ).find((message) => message._id === id);
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
      mergeMessage(message);
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
      ...(options.taskId ? { taskId: options.taskId } : {}),
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
    messageDeletions,
    failedMessageDeletions,
    deleteMessage,
    restoreMessage,
    historyLoading,
    historyReady,
    outbox,
    threads,
    refreshThread,
    retryMessage,
    isOwner,
    notice,
    olderMessageIds,
    tab,
    requestedTaskId,
    requestedTaskMessageId,
    taskNotifications,
    creatingTask,
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
