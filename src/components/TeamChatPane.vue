<script setup>
import {
  computed,
  nextTick,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
} from "vue";
import UiIcon from "./UiIcon.vue";
import CodexMessageText from "./CodexMessageText.vue";
import CodexComposer from "./CodexComposer.vue";
import TeamChatAddMenu from "./TeamChatAddMenu.vue";
import { decisionStatus } from "@/utils/teamMessageStatus";
import TeamTaskPanel from "./TeamTaskPanel.vue";
import TeamTaskCover from "./TeamTaskCover.vue";
import TeamMessageMenu from "./TeamMessageMenu.vue";
import TeamChatMembers from "./TeamChatMembers.vue";
import TeamReplyQuote from "./TeamReplyQuote.vue";
import TeamChatDialog from "./TeamChatDialog.vue";
import { useChatDictation } from "@/composables/useChatDictation";
defineProps({ mobile: Boolean });
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
const chat = useTeamChatStore(),
  tab = computed({
    get: () => chat.tab,
    set: (value) => {
      chat.tab = value;
    },
  }),
  message = ref(""),
  files = ref([]),
  input = ref(null),
  composeArea = ref(null),
  mentionQuery = ref(null),
  mentionIndex = ref(0),
  mentionRange = ref(null),
  mentionedPeople = ref([]),
  replyDraft = ref(null),
  quoteView = ref(null),
  quoteError = ref(""),
  highlightedMessage = ref(null),
  swipe = ref({ id: null, x: 0 }),
  feed = ref(null),
  uploading = ref(false),
  olderLoading = ref(false),
  historyMore = ref(!!chat.state.hasMore),
  historyError = ref(""),
  localError = ref(""),
  creating = ref(false),
  older = ref([]),
  gaps = ref([]),
  loadingGap = ref(null);
const dictation = useChatDictation({
  getText: () => message.value,
  setText: (text) => {
    message.value = text;
  },
  onError: (error) => {
    localError.value = error;
  },
});
const { recording: dictating, supported: dictationSupported } = dictation;
const selectedMessageId = ref(null);
const suppressOpeningTouch = ref(false);
const selectedMessage = computed(() =>
  shownMessages.value.find((m) => m._id === selectedMessageId.value),
);
let holdTimer, holdStart, suppressedClick, gesture, highlightTimer;
function resetSwipe() {
  gesture = null;
  swipe.value = { id: null, x: 0 };
}
function cancelHold() {
  clearTimeout(holdTimer);
  holdTimer = null;
}
function openMessageMenu(row, touchHold = false) {
  if (row.kind === "task") return;
  cancelHold();
  resetSwipe();
  if (row._delivery || selectedMessageId.value === row._id) return;
  suppressOpeningTouch.value = touchHold;
  selectedMessageId.value = row._id;
}
function holdMessage(event, row) {
  if (row.kind === "task") return;
  if (
    event.button !== 0 ||
    selectedMessage.value ||
    event.target.closest("input,textarea,select,[contenteditable='true']")
  )
    return;
  cancelHold();
  suppressedClick = null;
  holdStart = { x: event.clientX, y: event.clientY };
  gesture =
    !row._delivery && row.kind !== "task" && !event.target.closest("button,a")
      ? {
          id: row._id,
          pointerId: event.pointerId,
          offset: event.currentTarget.offsetLeft,
          ...holdStart,
        }
      : null;
  if (gesture)
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer capture is optional for older browsers. */
    }
  holdTimer = setTimeout(() => {
    suppressedClick = row._id;
    openMessageMenu(row, event.pointerType === "touch");
  }, 450);
}
function moveMessage(event) {
  if (
    holdStart &&
    Math.hypot(event.clientX - holdStart.x, event.clientY - holdStart.y) > 10
  )
    cancelHold();
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const dx = event.clientX - gesture.x,
    dy = Math.abs(event.clientY - gesture.y);
  if (dy > 14 && dy > Math.abs(dx)) {
    resetSwipe();
    return;
  }
  if (dx > 12 && dx > dy * 1.4)
    swipe.value = {
      id: gesture.id,
      x: Math.min(80, dx),
      offset: gesture.offset,
    };
}
function finishMessagePointer(event, row) {
  cancelHold();
  const reply =
    gesture?.id === row._id && swipe.value.x >= 64 && !selectedMessage.value;
  resetSwipe();
  if (reply) {
    suppressedClick = row._id;
    void startReply(row);
  }
}
function pointerCancelled() {
  cancelHold();
  resetSwipe();
}
async function startReply(row) {
  if (row._delivery) return;
  replyDraft.value = {
    messageId: row._id,
    authorId: row.authorId,
    authorName: row.authorName,
    text: String(row.text || "").slice(0, 1000),
    fileName: row.attachments?.[0]?.name || "",
    fileCount: row.attachments?.length || 0,
    contentVersion: row.contentVersion || 0,
  };
  selectedMessageId.value = null;
  localError.value = "";
  composeArea.value?.querySelector("textarea")?.focus({ preventScroll: true });
  await nextTick();
  composeArea.value?.querySelector("textarea")?.focus({ preventScroll: true });
}
function displayQuote(quote) {
  return chat.state.deletedMessageIds?.includes(quote.messageId)
    ? { ...quote, deleted: true }
    : quote;
}
async function showOriginal(quote) {
  if (displayQuote(quote).deleted) return;
  const source = [
    ...(feed.value?.querySelectorAll("[data-message-id]") || []),
  ].find((e) => e.dataset.messageId === quote.messageId);
  if (source) {
    source.scrollIntoView({ block: "center", behavior: "smooth" });
    highlightedMessage.value = quote.messageId;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => (highlightedMessage.value = null), 2000);
    return;
  }
  const workspace = chat.me?.workspaceId;
  quoteError.value = "";
  quoteView.value = { loading: true };
  try {
    const { data } = await teamApi.get(`/messages/${quote.messageId}`);
    if (workspace === chat.me?.workspaceId) {
      quoteView.value = data.message;
      trackVisibleHistory();
      chat.schedule();
      void teamApi
        .post("/messages/read", { ids: [data.message._id] })
        .catch(() => {});
    }
  } catch (e) {
    if (workspace === chat.me?.workspaceId)
      quoteError.value =
        e.response?.status === 404 ? "Сообщение удалено" : teamError(e);
  }
}
function messageClick(event, row) {
  if (suppressedClick === row._id) {
    event.preventDefault();
    event.stopPropagation();
    suppressedClick = null;
  }
}
function messageKeys(event, row) {
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    event.preventDefault();
    openMessageMenu(row);
  }
}
function deletedMessage(id) {
  older.value = older.value.filter((m) => m._id !== id);
  if (replyDraft.value?.messageId === id)
    replyDraft.value = { ...replyDraft.value, deleted: true };
}
async function reactToMessage(row, reaction) {
  await run(() =>
    chat.action(`/messages/${row._id}/reaction`, {
      emoji: reaction.mine ? null : reaction.emoji,
    }),
  );
}
const messageStatus = (row) =>
  decisionStatus(row.approval?.history) ||
  (row.readCount ? "Просмотрено" : "Доставлено");
const mentionChoices = computed(() =>
  (chat.state.people || []).filter(
    (p) =>
      p._id !== chat.me?.actorId &&
      p.name
        .toLocaleLowerCase("ru")
        .includes((mentionQuery.value || "").toLocaleLowerCase("ru")),
  ),
);
function mentionInput(event) {
  if (!event.target.matches("textarea.codex-input")) return;
  const field = event.target,
    end = field.selectionStart,
    match = field.value.slice(0, end).match(/(?:^|\s)@([^\s@]*)$/);
  const query = match ? match[1] : null;
  if (query !== mentionQuery.value) mentionIndex.value = 0;
  mentionQuery.value = query;
  mentionRange.value = match ? { start: end - match[1].length - 1, end } : null;
}
async function selectMention(person) {
  const range = mentionRange.value;
  if (!range) return;
  const text = "@" + person.name + " ";
  message.value =
    message.value.slice(0, range.start) + text + message.value.slice(range.end);
  if (!mentionedPeople.value.some((p) => p._id === person._id))
    mentionedPeople.value.push(person);
  mentionQuery.value = null;
  mentionRange.value = null;
  await nextTick();
  const field = composeArea.value?.querySelector("textarea");
  field?.focus();
  field?.setSelectionRange(
    range.start + text.length,
    range.start + text.length,
  );
}
function mentionKeys(event) {
  if (mentionQuery.value === null) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    mentionQuery.value = null;
  }
  if (
    ["ArrowDown", "ArrowUp"].includes(event.key) &&
    mentionChoices.value.length
  ) {
    event.preventDefault();
    event.stopPropagation();
    mentionIndex.value =
      (mentionIndex.value +
        (event.key === "ArrowDown" ? 1 : mentionChoices.value.length - 1)) %
      mentionChoices.value.length;
  }
  if (event.key === "Enter" && mentionChoices.value.length) {
    event.preventDefault();
    event.stopPropagation();
    void selectMention(mentionChoices.value[mentionIndex.value]);
  }
}
watch(
  () => chat.state.messageUpdates,
  (updates) => {
    if (updates?.length)
      older.value = older.value.map(
        (row) => updates.find((m) => m._id === row._id) || row,
      );
  },
);
const scroll = ref(null);
let noticeTimer, revealFrame, readTimer;
const acknowledgedReads = new Set();
function revealField() {
  cancelAnimationFrame(revealFrame);
  revealFrame = requestAnimationFrame(() => {
    const field = document.activeElement;
    if (
      !scroll.value?.contains(field) ||
      !field.matches("input, textarea, select")
    )
      return;
    const box = field.getBoundingClientRect(),
      area = scroll.value.getBoundingClientRect();
    const bottom = area.bottom - (creating.value ? 56 : 12);
    if (box.bottom > bottom) scroll.value.scrollTop += box.bottom - bottom;
    else if (box.top < area.top + 12)
      scroll.value.scrollTop -= area.top - box.top + 12;
  });
}
function startTask() {
  creating.value = true;
  localError.value = "";
}
function openTask(id) {
  chat.requestedTaskMessageId = null;
  chat.requestedTaskId = id;
}
function openNotification(event) {
  const data = event.data;
  if (
    data?.type === "team:refresh" &&
    data.workspaceId === chat.me?.workspaceId &&
    /^[a-f\d-]{36}$/i.test(data.taskId || "")
  ) {
    chat.requestedTaskMessageId = /^[a-f\d-]{36}$/i.test(data.messageId || "")
      ? data.messageId
      : null;
    chat.requestedTaskId = data.taskId;
    chat.show();
  }
}

watch(
  () => chat.notice,
  (value) => {
    clearTimeout(noticeTimer);
    if (value)
      noticeTimer = setTimeout(() => {
        chat.notice = "";
      }, 3500);
  },
  { immediate: true },
);
onMounted(async () => {
  window.visualViewport?.addEventListener("resize", revealField);
  window.addEventListener("index12:chat-dialog-closed", scheduleReads);
  navigator.serviceWorker?.addEventListener("message", openNotification);
  const query = new URLSearchParams(location.search);
  if (/^[a-f\d-]{36}$/i.test(query.get("task") || ""))
    openNotification({
      data: {
        type: "team:refresh",
        workspaceId: chat.me?.workspaceId,
        taskId: query.get("task"),
        messageId: query.get("message"),
      },
    });
  await nextTick();
  if (feed.value) feed.value.scrollTop = feed.value.scrollHeight;
});
onBeforeUnmount(() => {
  navigator.serviceWorker?.removeEventListener("message", openNotification);
  clearTimeout(noticeTimer);
  clearTimeout(highlightTimer);
  clearTimeout(readTimer);
  clearTimeout(scrollTimer);
  cancelHold();
  cancelAnimationFrame(revealFrame);
  window.visualViewport?.removeEventListener("resize", revealField);
  window.removeEventListener("index12:chat-dialog-closed", scheduleReads);
  chat.notice = "";
});
watch(tab, (value) => {
  if (value !== "messages") dictation.stop();
  chat.schedule();
});
const shownMessages = computed(() =>
  [
    ...older.value.filter(
      (m) => !chat.state.messages.some((n) => n._id === m._id),
    ),
    ...chat.state.messages,
    ...chat.outbox.filter(
      (row) => !chat.state.messages.some((message) => message._id === row._id),
    ),
  ]
    .filter(
      (m) =>
        !m.deletedAt &&
        m.kind !== "request" &&
        (!m.taskId || m.kind === "task") &&
        !chat.state.deletedMessageIds?.includes(m._id),
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a._id.localeCompare(b._id),
    ),
);
watch(
  () => [chat.state.deletedMessageIds, chat.state.messageUpdates],
  () => {
    const id = quoteView.value?._id;
    if (!id) return;
    if (chat.state.deletedMessageIds?.includes(id)) {
      quoteError.value = "Сообщение удалено";
      quoteView.value = { loading: false };
    } else {
      const updated = chat.state.messageUpdates?.find((m) => m._id === id);
      if (updated) quoteView.value = updated;
    }
  },
);
watch(selectedMessage, (value) => {
  if (!value) selectedMessageId.value = null;
});
watch(
  () => chat.me?.workspaceId,
  () => {
    dictation.stop();
    older.value = [];
    replyDraft.value = null;
    quoteView.value = null;
    resetSwipe();
    acknowledgedReads.clear();
    mentionedPeople.value = [];
    mentionQuery.value = null;
    historyMore.value = false;
    gaps.value = [];
    loadingGap.value = null;
    olderLoading.value = false;
    historyError.value = "";
    files.value = [];
    message.value = "";
  },
);
watch(
  () => chat.state.messages,
  (rows, previous) => {
    if (!chat.historyReady) return;
    if (!older.value.length && !previous?.length)
      historyMore.value = !!chat.state.hasMore;
    // After a long disconnection the latest page can jump past messages we have never loaded.
    if (
      previous?.length &&
      rows.length &&
      !rows.some((m) => previous.some((p) => p._id === m._id))
    ) {
      const last = previous.at(-1),
        first = rows[0];
      if (
        first.createdAt > last.createdAt ||
        (first.createdAt === last.createdAt && first._id > last._id)
      ) {
        if (!gaps.value.some((gap) => gap.before === first._id))
          gaps.value.push({
            before: first._id,
            after: last._id,
            afterAt: last.createdAt,
          });
      }
    }
    const merged = new Map(older.value.map((row) => [row._id, row]));
    for (const row of previous || [])
      if (!rows.some((m) => m._id === row._id)) merged.set(row._id, row);
    older.value = [...merged.values()].filter(
      (row) => !chat.state.deletedMessageIds?.includes(row._id),
    );
    nextTick(trackVisibleHistory);
  },
);
watch(
  () => chat.state.messages.at(-1)?._id,
  async () => {
    const nearBottom =
      !feed.value ||
      feed.value.scrollHeight - feed.value.scrollTop - feed.value.clientHeight <
        100;
    await nextTick();
    if (nearBottom && feed.value)
      feed.value.scrollTop = feed.value.scrollHeight;
  },
);
async function run(fn) {
  localError.value = "";
  try {
    return await fn();
  } catch (e) {
    localError.value = teamError(e);
  }
}
async function send() {
  if (uploading.value || (!message.value.trim() && !files.value.length)) return;
  if (replyDraft.value && displayQuote(replyDraft.value).deleted) {
    localError.value =
      "Исходное сообщение удалено. Отмените ответ или выберите другое сообщение";
    return;
  }
  dictation.stop();
  const id = chat.send(message.value, files.value, {
    replyTo: replyDraft.value,
    mentionIds: mentionedPeople.value
      .filter((p) => message.value.includes("@" + p.name))
      .map((p) => p._id),
  });
  if (!id) return;
  message.value = "";
  replyDraft.value = null;
  mentionedPeople.value = [];
  mentionQuery.value = null;
  files.value = [];
  await nextTick();
  if (feed.value) feed.value.scrollTop = feed.value.scrollHeight;
}
async function attach(event) {
  uploading.value = true;
  await run(async () => {
    for (const file of event.target.files) {
      if (
        files.value.length >= 5 ||
        file.size > 10 * 1024 * 1024 ||
        files.value.reduce((s, f) => s + f.size, 0) + file.size >
          25 * 1024 * 1024
      )
        throw Error("До пяти файлов: один до 10 МБ, всего до 25 МБ");
      const { data } = await teamApi.post("/files", file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        timeout: 60000,
      });
      files.value.push(data.file);
    }
  });
  event.target.value = "";
  uploading.value = false;
}
async function download(file) {
  await run(async () => {
    const { data } = await teamApi.get(`/files/${file.fileId}`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(data),
      a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
function scheduleReads() {
  clearTimeout(readTimer);
  if (
    tab.value !== "messages" ||
    document.visibilityState !== "visible" ||
    !feed.value
  )
    return;
  readTimer = setTimeout(async () => {
    if (
      !feed.value ||
      document.visibilityState !== "visible" ||
      creating.value ||
      selectedMessage.value ||
      quoteView.value
    )
      return;
    const box = feed.value.getBoundingClientRect(),
      rows = [...feed.value.querySelectorAll("[data-message-id]")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.bottom > box.top && r.top < box.bottom;
        })
        .map((e) =>
          shownMessages.value.find((m) => m._id === e.dataset.messageId),
        )
        .filter(
          (m) =>
            m &&
            !m._delivery &&
            m.authorId !== chat.me?.actorId &&
            !acknowledgedReads.has(m._id + ":" + (m.contentVersion || 0)),
        )
        .slice(0, 100);
    if (!rows.length) return;
    const keys = rows.map((m) => m._id + ":" + (m.contentVersion || 0));
    keys.forEach((k) => acknowledgedReads.add(k));
    try {
      await teamApi.post("/messages/read", { ids: rows.map((m) => m._id) });
    } catch {
      keys.forEach((k) => acknowledgedReads.delete(k));
    }
  }, 200);
}
watch(
  [shownMessages, tab, creating, selectedMessageId, quoteView],
  async () => {
    await nextTick();
    scheduleReads();
  },
);
function trackVisibleHistory() {
  scheduleReads();
  if (!feed.value) return;
  const box = feed.value.getBoundingClientRect();
  const ids = [...feed.value.querySelectorAll("[data-message-id]")]
    .filter((element) => {
      const r = element.getBoundingClientRect();
      return r.bottom > box.top - 300 && r.top < box.bottom + 300;
    })
    .map((element) => element.dataset.messageId);
  chat.olderMessageIds = [
    ...new Set([
      ...(quoteView.value?._id ? [quoteView.value._id] : []),
      ...ids,
      ...older.value.slice(-40).map((m) => m._id),
    ]),
  ].slice(0, 120);
}
let scrollTimer;
function scrollFeed() {
  cancelHold();
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const previous = chat.olderMessageIds.join();
    trackVisibleHistory();
    if (previous !== chat.olderMessageIds.join()) chat.schedule();
    if (feed.value?.scrollTop < 100 && !historyError.value) void loadOlder();
    const box = feed.value?.getBoundingClientRect();
    const visibleGap = [
      ...(feed.value?.querySelectorAll("[data-gap-before]") || []),
    ].find((e) => {
      const r = e.getBoundingClientRect();
      return box && r.bottom > box.top && r.top < box.bottom;
    });
    if (visibleGap && !historyError.value)
      void loadGap(
        gaps.value.find((g) => g.before === visibleGap.dataset.gapBefore),
      );
  }, 80);
}
async function loadOlder() {
  if (olderLoading.value || !historyMore.value || !chat.historyReady) return;
  const first = shownMessages.value.find((m) => !m._delivery);
  if (!first) return;
  const workspaceId = chat.me?.workspaceId;
  olderLoading.value = true;
  historyError.value = "";
  try {
    const { data } = await teamApi.get("/messages", {
      params: { before: first._id },
    });
    if (workspaceId !== chat.me?.workspaceId) return;
    const height = feed.value?.scrollHeight || 0,
      top = feed.value?.scrollTop || 0;
    const merged = new Map(
      [...data.messages, ...older.value].map((m) => [m._id, m]),
    );
    older.value = [...merged.values()].sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a._id.localeCompare(b._id),
    );
    historyMore.value = !!data.hasMore;
    await nextTick();
    if (feed.value)
      feed.value.scrollTop = top + feed.value.scrollHeight - height;
    trackVisibleHistory();
  } catch (e) {
    if (workspaceId === chat.me?.workspaceId) historyError.value = teamError(e);
  } finally {
    if (workspaceId === chat.me?.workspaceId) olderLoading.value = false;
  }
}
async function loadGap(gap) {
  if (!gap || loadingGap.value) return;
  const workspaceId = chat.me?.workspaceId;
  loadingGap.value = gap.before;
  historyError.value = "";
  try {
    const { data } = await teamApi.get("/messages", {
      params: { before: gap.before },
    });
    if (workspaceId !== chat.me?.workspaceId) return;
    const box = feed.value?.getBoundingClientRect();
    const anchor = [
      ...(feed.value?.querySelectorAll("[data-message-id]") || []),
    ].find((e) => e.getBoundingClientRect().bottom > box.top);
    const offset = anchor?.getBoundingClientRect().top;
    older.value = [
      ...new Map(
        [...data.messages, ...older.value].map((m) => [m._id, m]),
      ).values(),
    ];
    const reached =
      !data.hasMore ||
      data.messages.some(
        (m) =>
          m._id === gap.after ||
          m.createdAt < gap.afterAt ||
          (m.createdAt === gap.afterAt && m._id < gap.after),
      );
    if (reached) gaps.value = gaps.value.filter((g) => g !== gap);
    else gap.before = data.messages[0]._id;
    await nextTick();
    if (anchor?.isConnected && feed.value)
      feed.value.scrollTop += anchor.getBoundingClientRect().top - offset;
    trackVisibleHistory();
  } catch (e) {
    if (workspaceId === chat.me?.workspaceId) historyError.value = teamError(e);
  } finally {
    if (workspaceId === chat.me?.workspaceId) loadingGap.value = null;
  }
}
</script>
<template>
  <div class="team-pane" style="position: relative">
    <TeamTaskPanel
      v-if="
        creating ||
        chat.requestedTaskId ||
        chat.taskNotifications ||
        tab === 'tasks'
      "
      :creating="creating"
      :task-id="chat.requestedTaskId"
      :notifications="chat.taskNotifications"
      @close="
        creating = false;
        chat.requestedTaskId = null;
        chat.requestedTaskMessageId = null;
        chat.taskNotifications = false;
      "
      @created="
        creating = false;
        tab = 'messages';
      "
      @new="startTask"
    />
    <TeamMessageMenu
      v-if="selectedMessage"
      :message="selectedMessage"
      :suppress-opening-touch="suppressOpeningTouch"
      @close="selectedMessageId = null"
      @deleted="deletedMessage"
      @reply="startReply"
    />
    <TeamChatDialog
      v-if="quoteView"
      title="Исходное сообщение"
      @close="quoteView = null"
      ><div class="team-original-message">
        <p v-if="quoteError" role="alert">{{ quoteError }}</p>
        <span v-else-if="quoteView.loading" role="status"
          >Загружаем сообщение…</span
        ><template v-else
          ><strong>{{ quoteView.authorName }}</strong
          ><CodexMessageText :text="quoteView.text" /><button
            v-for="file in quoteView.attachments"
            :key="file.fileId"
            type="button"
            class="team-file"
            @click="download(file)"
          >
            <UiIcon name="attach" />{{ file.name }}
          </button></template
        >
      </div></TeamChatDialog
    >
    <div v-if="chat.notice" class="team-notice" role="status">
      <span>{{ chat.notice }}</span
      ><button
        type="button"
        aria-label="Скрыть уведомление"
        @click="chat.notice = ''"
      >
        <UiIcon name="close" />
      </button>
    </div>
    <div v-if="localError || chat.error" class="team-error" role="alert">
      {{ localError || chat.error }}
    </div>
    <div v-if="!chat.me" class="team-empty">
      {{ chat.error || "Подключение к чату…" }}
    </div>
    <div v-else-if="chat.me.status === 'pending'" class="team-empty">
      Запрос отправлен владельцу. Ожидается одобрение
    </div>
    <template
      v-else-if="
        tab === 'messages' &&
        !creating &&
        !chat.requestedTaskId &&
        !chat.taskNotifications
      "
    >
      <div
        ref="feed"
        class="team-feed"
        id="team-panel"
        role="region"
        aria-label="Чат сотрудников"
        aria-live="polite"
        :aria-busy="chat.historyLoading || olderLoading"
        @scroll="scrollFeed"
      >
        <button
          v-if="historyMore && !chat.historyLoading"
          class="team-history"
          :disabled="olderLoading"
          @click="loadOlder"
        >
          {{ olderLoading ? "Загружаем сообщения…" : "Ранее" }}
        </button>
        <div
          v-if="chat.historyLoading"
          class="team-empty team-history-loading"
          role="status"
        >
          <span class="team-history-spinner" aria-hidden="true"></span>Загружаем
          историю сообщений…
        </div>
        <div v-else-if="historyError" class="team-empty" role="alert">
          {{ historyError }}<button @click="loadOlder">Повторить</button>
        </div>
        <div v-else-if="!chat.historyReady" class="team-empty">
          <button @click="chat.refresh">Загрузить историю</button>
        </div>
        <div v-else-if="!shownMessages.length" class="team-empty">
          Сообщения сотрудников появятся здесь
        </div>
        <template v-for="m in shownMessages" :key="m._id">
          <button
            v-if="gaps.some((gap) => gap.before === m._id)"
            class="team-history"
            :data-gap-before="m._id"
            :disabled="!!loadingGap"
            @click="loadGap(gaps.find((gap) => gap.before === m._id))"
          >
            {{
              loadingGap === m._id
                ? "Загружаем сообщения…"
                : "Загрузить пропущенные сообщения"
            }}
          </button>
          <article
            :data-message-id="m._id"
            class="team-message"
            :class="{
              'task-message': m.kind === 'task',
              self: m.authorId === chat.me.actorId,
              'reply-target': highlightedMessage === m._id,
              swiping: swipe.id === m._id,
            }"
          >
            <span
              v-if="swipe.id === m._id"
              class="team-swipe-reply"
              :style="{ left: `${(swipe.offset || 0) + 4}px` }"
              aria-hidden="true"
              ><UiIcon name="reply"
            /></span>
            <div
              class="team-bubble"
              :style="
                swipe.id === m._id
                  ? { transform: `translateX(${swipe.x}px)` }
                  : undefined
              "
              tabindex="0"
              :aria-label="`Сообщение ${m.authorName}`"
              @pointerdown.capture="holdMessage($event, m)"
              @pointermove.capture="moveMessage"
              @pointerup.capture="finishMessagePointer($event, m)"
              @pointercancel.capture="pointerCancelled"
              @dragstart.capture="pointerCancelled"
              @click.capture="messageClick($event, m)"
              @contextmenu.capture.prevent="openMessageMenu(m)"
              @keydown="messageKeys($event, m)"
            >
              <header v-if="m.kind !== 'task'">
                <strong>{{ m.authorName }}</strong
                ><time>{{
                  new Date(m.createdAt).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }}</time>
              </header>
              <TeamReplyQuote
                v-if="m.replyTo"
                :quote="displayQuote(m.replyTo)"
                @open="showOriginal"
              />
              <span v-if="m.forwardedFrom" class="team-forwarded"
                >Переслано · {{ m.forwardedFrom.authorName }}</span
              >
              <TeamTaskCover
                v-if="m.kind === 'task'"
                :task-id="m.taskId"
                @open="openTask(m.taskId)"
              />
              <CodexMessageText
                v-if="m.text && m.kind !== 'task'"
                :text="m.text"
                class="team-message-content"
              />
              <button
                v-for="file in m.attachments"
                :key="file.fileId"
                class="team-file"
                :disabled="!!m._delivery"
                @click="download(file)"
              >
                <UiIcon name="attach" />{{ file.name }}
              </button>
              <div
                v-if="m._delivery"
                class="team-delivery"
                :class="{ failed: m._delivery === 'failed' }"
                role="status"
              >
                <span :title="m._sendError">{{
                  m._delivery === "sending" ? "Отправляется…" : "Не отправлено"
                }}</span>
                <button
                  v-if="m._delivery === 'failed'"
                  type="button"
                  @pointerdown.stop
                  @click.stop="chat.retryMessage(m._id)"
                >
                  Повторить отправку
                </button>
              </div>
              <div v-if="m.reactions?.length" class="team-reactions">
                <button
                  v-for="reaction in m.reactions"
                  :key="reaction.emoji"
                  type="button"
                  :aria-label="`Реакция ${reaction.emoji}: ${reaction.count}`"
                  :aria-pressed="reaction.mine"
                  :disabled="chat.busy"
                  @pointerdown.stop
                  @click="reactToMessage(m, reaction)"
                >
                  {{ reaction.emoji }} <span>{{ reaction.count }}</span>
                </button>
              </div>
              <div
                v-if="!m._delivery && m.kind !== 'task'"
                class="team-message-meta"
              >
                <span v-if="m.editedAt">изменено</span
                ><span
                  v-if="m.approval || m.authorId === chat.me.actorId"
                  :class="{
                    'message-rejected': m.approval?.state === 'rejected',
                  }"
                  >{{ messageStatus(m) }}</span
                >
              </div>
              <p
                v-if="m.approval?.state === 'rejected'"
                class="team-rejection-reason"
              >
                {{ m.approval.history?.at(-1)?.note }}
              </p>
            </div>
          </article>
        </template>
      </div>
      <div
        ref="composeArea"
        class="team-compose-area"
        @input.capture="mentionInput"
        @keyup.capture="mentionInput"
        @keydown.capture="mentionKeys"
      >
        <div
          v-if="mentionQuery !== null && mentionChoices.length"
          class="team-mention-list"
          role="listbox"
          aria-label="Отметить сотрудника"
        >
          <button
            v-for="(person, index) in mentionChoices"
            :key="person._id"
            type="button"
            role="option"
            :aria-selected="index === mentionIndex"
            @pointerdown.prevent
            @click="selectMention(person)"
          >
            <span>{{ person.name }}</span
            ><small>{{ chat.me.roles[person.role] }}</small>
          </button>
        </div>
        <TeamReplyQuote
          v-if="replyDraft"
          :quote="displayQuote(replyDraft)"
          composing
          @cancel="replyDraft = null"
        />
        <input
          ref="input"
          type="file"
          hidden
          multiple
          @change="attach"
        /><CodexComposer
          v-model="message"
          :busy="uploading"
          :mobile="mobile"
          attachments-enabled
          :recording="dictating"
          :speech-supported="dictationSupported"
          @microphone="
            localError = '';
            dictation.toggle();
          "
          :has-attachments="!!files.length"
          placeholder="Сообщение сотрудникам"
          @send="send"
          ><template #attachments>
            <div v-if="files.length" class="team-staged">
              <span v-for="(f, i) in files" :key="f.fileId"
                >{{ f.name
                }}<button
                  type="button"
                  :aria-label="`Убрать файл ${f.name}`"
                  @click="files.splice(i, 1)"
                >
                  <UiIcon name="close" /></button
              ></span>
            </div> </template
          ><template #leading
            ><TeamChatAddMenu
              :disabled="uploading"
              @task="startTask"
              @file="input.click()" /></template></CodexComposer
        ><span v-if="uploading" role="status">Загрузка файла…</span>
      </div>
    </template>
    <div
      v-else-if="tab === 'members' && chat.isOwner"
      ref="scroll"
      class="team-scroll"
    >
      <TeamChatMembers />
    </div>
  </div>
</template>
<style scoped src="./teamChat.css"></style>
