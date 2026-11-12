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
import { canSeeChatMessage } from "@/utils/teamMessageVisibility";
import TeamSearchText from "./TeamSearchText.vue";
import { filterTasks, hasTaskFilters } from '@/utils/teamTasks';
import { useTeamChatSearchStore } from "@/stores/teamChatSearchStore";
const search = useTeamChatSearchStore();
let searchScroll = 0;
import { chatDateKey, chatDateLabel } from "@/utils/teamChatDates";
const calendarNow = ref(new Date());
let calendarTimer;
function syncCalendarDay() {
  calendarNow.value = new Date();
  clearTimeout(calendarTimer);
  const midnight = new Date(calendarNow.value);
  midnight.setHours(24, 0, 0, 0);
  calendarTimer = setTimeout(
    syncCalendarDay,
    midnight.getTime() - Date.now() + 1000,
  );
}
import CodexMessageText from "./CodexMessageText.vue";
import CodexComposer from "./CodexComposer.vue";
import ChatFileDropOverlay from './ChatFileDropOverlay.vue';
import { useFileDrop } from '@/composables/useFileDrop';
import { useChatTransfer } from '@/composables/useChatTransfer';
import TeamChatAddMenu from "./TeamChatAddMenu.vue";
import TeamApprovalDialog from './TeamApprovalDialog.vue';
import TeamApprovalMessage from './TeamApprovalMessage.vue';
import TeamTaskCover from "./TeamTaskCover.vue";
import TeamMessageMenu from "./TeamMessageMenu.vue";
import TeamReplyQuote from "./TeamReplyQuote.vue";
import TeamChatDialog from "./TeamChatDialog.vue";
import TeamMediaPreview from "./TeamMediaPreview.vue";
import { useTeamMedia } from "@/composables/useTeamMedia";
import { useChatDictation } from "@/composables/useChatDictation";
const props = defineProps({
  mobile: Boolean,
  taskId: String,
  targetMessageId: String,
  active: { type: Boolean, default: true },
});
const emit = defineEmits(["new", "composer-focus", "composer-blur", "reading-scroll"]);
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
import { completeTeamDestination, pendingTeamDestination } from '@/utils/teamDestination';
import {useAppUpdateStore} from '@/stores/appUpdateStore';
import {draftKey,takeUpdateDraft} from '@/utils/updateDrafts';
import TeamAppUpdate from './TeamAppUpdate.vue';
const updates=useAppUpdateStore();
const chat = useTeamChatStore(),
  tab = computed(() => (props.taskId ? "messages" : chat.tab)),
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
  historyMore = ref(props.taskId ? false : !!chat.state.hasMore),
  historyError = ref(""),
  localError = ref(""),
  older = ref([]),
  gaps = ref([]),
  loadingGap = ref(null);
const emptyThread = {
  messages: [],
  messageUpdates: [],
  deletedMessageIds: [],
  ready: false,
};
const thread = computed(() =>
  props.taskId ? chat.threads[props.taskId] || emptyThread : chat.state,
);
const approvalOpen=ref(false);
watch(()=>props.taskId,()=>{approvalOpen.value=false;});
async function approvalAdded(){approvalOpen.value=false;await nextTick();if(feed.value)feed.value.scrollTop=feed.value.scrollHeight;}
const historyReady = computed(() =>
  props.taskId ? !!thread.value.ready : chat.historyReady,
);
const historyLoading = computed(() =>
  props.taskId
    ? !thread.value.ready && !!thread.value.loading
    : chat.historyLoading,
);
const watchedIds = ref([]);
let disposed = false;
const { preview, closePreview, download, retryPreview, cacheUpload, prefetch, readFile } = useTeamMedia();
const transfer = useChatTransfer('team');
async function refreshConversation() {
  try {
    if (props.taskId) await chat.refreshThread(props.taskId, watchedIds.value);
    else await chat.refresh();
  } catch (e) {
    if (!disposed) {
      localError.value = teamError(e);
      if (props.targetMessageId) window.dispatchEvent(new Event('index12:team-priority-settled'));
    }
  }
}
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
let holdTimer,
  holdStart,
  suppressedClick,
  gesture,
  highlightTimer,
  feedObserver;
let positioningThread = !!props.taskId;
let pinnedToBottom = !props.taskId;

function resetSwipe() {
  gesture = null;
  swipe.value = { id: null, x: 0 };
}
function cancelHold() {
  clearTimeout(holdTimer);
  holdTimer = null;
}
function openMessageMenu(row, touchHold = false) {
  if (["task", "task-files"].includes(row.kind)) return;
  window.getSelection()?.removeAllRanges();
  cancelHold();
  resetSwipe();
  if (row._delivery || selectedMessageId.value === row._id) return;
  suppressOpeningTouch.value = touchHold;
  selectedMessageId.value = row._id;
}
function holdMessage(event, row) {
  if(row.kind==='approval_request'&&event.target.closest('button'))return;
  if (["task", "task-files"].includes(row.kind)) return;
  if (
    event.button !== 0 ||
    selectedMessage.value ||
    event.target.closest("input,textarea,select,a,[contenteditable='true']")
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
  return chat.messageDeletions[quote.messageId] ||
    thread.value.deletedMessageIds?.includes(quote.messageId)
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
      await nextTick();
      scheduleOriginalRead();
    }
  } catch (e) {
    if (workspace === chat.me?.workspaceId)
      quoteError.value =
        e.response?.status === 404 ? "Сообщение удалено" : teamError(e);
  }
}
function messageClick(event, row) {
  if (event.target.closest('a')) return;
  if (suppressedClick === row._id) {
    event.preventDefault();
    event.stopPropagation();
    suppressedClick = null;
  }
}
function messageKeys(event, row) {
  if (event.target.closest('a')) return;
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    event.preventDefault();
    openMessageMenu(row);
  }
}
function messageContext(event, row) {
  if (event.target.closest('a')) return;
  event.preventDefault();
  openMessageMenu(row);
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
  row.readCount > 0 ? "Просмотрено" : "Отправлено";
const mentionChoices = computed(() =>
  (chat.state.people || []).filter(
    (p) => p.status !== "invited" &&
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
  () => thread.value.messageUpdates,
  (updates) => {
    if (updates?.length)
      older.value = older.value.map(
        (row) => updates.find((m) => m._id === row._id) || row,
      );
  },
);
let noticeTimer, readTimer, originalReadTimer;
function scheduleOriginalRead() {
  clearTimeout(originalReadTimer);
  const id = quoteView.value?._id;
  if (!id) return;
  originalReadTimer = setTimeout(() => {
    const element = document.querySelector(".team-original-message"),
      dialog = element?.closest("dialog");
    if (quoteView.value?._id === id && canSeeChatMessage(element, dialog))
      void teamApi
        .post("/messages/read", { ids: [id], visibilityConfirmed: true })
        .catch(() => {});
  }, 200);
}
function readVisibilityChanged() {
  clearTimeout(readTimer);
  clearTimeout(originalReadTimer);
  if (document.visibilityState === "visible" && document.hasFocus()) {
    if (props.targetMessageId && pendingTeamDestination()?.messageId === props.targetMessageId) void revealTarget();
    scheduleReads();
    scheduleOriginalRead();
  }
}
const acknowledgedReads = new Set();
function startTask() {
  emit("new", props.taskId || null);
}
function openTask(id) {
  chat.requestedTaskMessageId = null;
  chat.requestedTaskId = id;
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
  const restored=takeUpdateDraft(chat.me,props.taskId);
  if(restored){message.value=restored.text;replyDraft.value=restored.reply || null;mentionedPeople.value=Array.isArray(restored.mentions)?restored.mentions:[];}
  window.addEventListener('index12:prepare-update',prepareUpdate);
  syncCalendarDay();
  window.addEventListener("focus", readVisibilityChanged);
  window.addEventListener("blur", readVisibilityChanged);
  document.addEventListener("visibilitychange", readVisibilityChanged);
  window.addEventListener("focus", syncCalendarDay);
  document.addEventListener("visibilitychange", syncCalendarDay);
  await nextTick();
  if (feed.value && typeof ResizeObserver !== "undefined") {
    feedObserver = new ResizeObserver(() => {
      if (pinnedToBottom)
        requestAnimationFrame(() => {
          if (feed.value) feed.value.scrollTop = feed.value.scrollHeight;
        });
    });
    feedObserver.observe(feed.value);
  }
  window.addEventListener("index12:chat-dialog-closed", scheduleReads);
  if (props.taskId) await refreshConversation();
  await nextTick();
  if (feed.value) feed.value.scrollTop = props.taskId ? 0 : feed.value.scrollHeight;
  await revealTarget();
  positioningThread = false;
  scheduleReads();
});
onBeforeUnmount(() => {
  window.removeEventListener('index12:prepare-update',prepareUpdate);
  disposed = true;
  clearTimeout(originalReadTimer);
  window.removeEventListener("focus", readVisibilityChanged);
  window.removeEventListener("blur", readVisibilityChanged);
  document.removeEventListener("visibilitychange", readVisibilityChanged);
  clearTimeout(calendarTimer);
  window.removeEventListener("focus", syncCalendarDay);
  document.removeEventListener("visibilitychange", syncCalendarDay);
  feedObserver?.disconnect();
  mediaObserver?.disconnect();
  closePreview();
  clearTimeout(noticeTimer);
  clearTimeout(highlightTimer);
  clearTimeout(readTimer);
  clearTimeout(scrollTimer);
  cancelHold();
  window.removeEventListener("index12:chat-dialog-closed", scheduleReads);
  chat.notice = "";
});
watch(tab, (value) => {
  if (value !== "messages") dictation.stop();
  chat.schedule();
});
const normalMessages = computed(() =>
  [
    ...older.value.filter(
      (m) => !thread.value.messages.some((n) => n._id === m._id),
    ),
    ...thread.value.messages,
    ...chat.outbox.filter(
      (row) =>
        !thread.value.messages.some((message) => message._id === row._id),
    ),
  ]
    .filter(
      (m) =>
        !m.deletedAt &&
        !chat.messageDeletions[m._id] &&
        m.kind !== "request" &&
        (props.taskId
          ? m.taskId === props.taskId && m.kind !== "task"
          : !m.taskId || m.kind === "task") &&
        (m.kind !== "task" ||
          chat.state.tasks?.some((t) => t._id === m.taskId)) &&
        !thread.value.deletedMessageIds?.includes(m._id),
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a._id.localeCompare(b._id),
    ),
);
const shownMessages = computed(() => {
  let rows = normalMessages.value;
  if (search.open && search.hasQuery) {
    rows = (search.result?.taskId || null) === (props.taskId || null)
      ? search.result?.messages || []
      : [];
  }
  const visible = rows.filter((m) => !m.deletedAt && !chat.messageDeletions[m._id]);
  if (props.taskId || search.open || !hasTaskFilters(chat.taskFilters)) return visible;
  const tasks = filterTasks(chat.state.tasks || [], chat.taskFilters, chat.me.actorId), ids = new Set(tasks.map(task => task._id));
  const filtered = visible.filter(message => message.kind === 'task' ? ids.has(message.taskId) : !hasTaskFilters(chat.taskFilters, true) && message.authorId === chat.taskFilters.person);
  // Task summaries cover the whole chat, including cards older than the loaded message page.
  for (const task of tasks) if (!filtered.some(message => message.kind === 'task' && message.taskId === task._id)) filtered.push({ _id: task._id, taskId: task._id, kind: 'task', text: '', authorId: task.creatorId, authorName: task.creatorName, attachments: [], createdAt: task.createdAt || new Date(0).toISOString() });
  return filtered.sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a._id.localeCompare(b._id));
});
watch(
  () => search.open,
  async (open) => {
    if (open) searchScroll = feed.value?.scrollTop || 0;
    else {
      await nextTick();
      if (feed.value) feed.value.scrollTop = searchScroll;
    }
  },
);
watch(
  [() => search.result, () => props.active, shownMessages],
  async () => {
    if (
      !search.open ||
      !props.active ||
      (search.result?.taskId || null) !== (props.taskId || null)
    )
      return;
    await nextTick();
    const target = [
      ...(feed.value?.querySelectorAll("[data-message-id]") || []),
    ].find((el) => el.dataset.messageId === search.result?.messageId);
    if (target && feed.value) {
      const rect = target.getBoundingClientRect(),
        box = feed.value.getBoundingClientRect();
      feed.value.scrollTop +=
        rect.top - box.top - (box.height - rect.height) / 2;
    }
  },
  { flush: "post" },
);
const shownMediaFiles = computed(() =>
  shownMessages.value
    .filter((m) => !m._delivery)
    .flatMap((m) => m.attachments || []),
);
let mediaObserver;
watch(
  [shownMediaFiles, () => props.active, feed],
  async () => {
    await nextTick();
    mediaObserver?.disconnect();
    if (!feed.value || !props.active) return;
    mediaObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            const file = shownMediaFiles.value.find(
              (f) => f.fileId === entry.target.dataset.mediaFileId,
            );
            if (file) prefetch([file]);
            mediaObserver.unobserve(entry.target);
          }
      },
      { root: feed.value },
    );
    feed.value
      .querySelectorAll("[data-media-file-id]")
      .forEach((el) => mediaObserver.observe(el));
  },
  { flush: "post" },
);
watch(
  () => [thread.value.deletedMessageIds, thread.value.messageUpdates],
  () => {
    const id = quoteView.value?._id;
    if (!id) return;
    if (thread.value.deletedMessageIds?.includes(id)) {
      quoteError.value = "Сообщение удалено";
      quoteView.value = { loading: false };
    } else {
      const updated = thread.value.messageUpdates?.find((m) => m._id === id);
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
  () => thread.value.messages,
  (rows, previous) => {
    if (!historyReady.value) return;
    if (!older.value.length && !previous?.length)
      historyMore.value = !!thread.value.hasMore;
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
      (row) =>
        !thread.value.deletedMessageIds?.includes(row._id) &&
        (props.taskId
          ? row.taskId === props.taskId
          : !row.taskId || row.kind === "task"),
    );

    nextTick(trackVisibleHistory);
  },
);
watch(
  () => thread.value.messages.at(-1)?._id,
  async () => {
    const nearBottom = !positioningThread && (!props.taskId || pinnedToBottom) && (
      !feed.value ||
      feed.value.scrollHeight - feed.value.scrollTop - feed.value.clientHeight < 100
    );
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
  if (uploading.value || transfer.pending.value || (!message.value.trim() && !files.value.length)) return;
  if (replyDraft.value && displayQuote(replyDraft.value).deleted) {
    localError.value =
      "Исходное сообщение удалено. Отмените ответ или выберите другое сообщение";
    return;
  }
  dictation.stop();
  const id = chat.send(message.value, files.value, {
    taskId: props.taskId,
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
  pinnedToBottom = true;
  await nextTick();
  if (feed.value) feed.value.scrollTop = feed.value.scrollHeight;
}
function attach(event) {
  const selectedFiles = Array.from(event.target.files || []);
  event.target.value = '';
  return attachFiles(selectedFiles);
}
async function attachFiles(selectedFiles) {
  if (uploading.value || !selectedFiles.length) return;
  uploading.value = true;
  const workspace = chat.me?.workspaceId;
  await run(async () => {
    if (files.value.length + selectedFiles.length > 5 ||
        selectedFiles.some(file => file.size > 10 * 1024 * 1024) ||
        [...files.value, ...selectedFiles].reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024)
      throw Error('До пяти файлов: один до 10 МБ, всего до 25 МБ');
    for (const file of selectedFiles) {
      const { data } = await teamApi.post("/files", file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        timeout: 60000,
      });
      if (disposed || workspace !== chat.me?.workspaceId) return;
      cacheUpload(data.file, file);
      files.value.push(data.file);
    }
  });
  uploading.value = false;
}
const { dragging: draggingFiles, dropEvents: fileDropEvents } = useFileDrop({
  enabled: () => props.active && chat.me?.status === 'active' && tab.value === 'messages' && !search.open && !uploading.value && !transfer.pending.value && !preview.value && !quoteView.value && !selectedMessage.value,
  onFiles: attachFiles,
  onItem: async token => {
    const item = await transfer.accept(token);
    if (item?.file) await attachFiles([item.file]);
  },
  onError: message => { localError.value = message; },
});

function scheduleReads() {
  clearTimeout(readTimer);
  if (
    !props.active ||
    draggingFiles.value ||
    tab.value !== "messages" ||
    document.visibilityState !== "visible" ||
    !document.hasFocus() ||
    !feed.value
  )
    return;
  readTimer = setTimeout(async () => {
    if (
      !feed.value ||
      draggingFiles.value ||
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      !props.active ||
      selectedMessage.value ||
      quoteView.value ||
      preview.value
      || approvalOpen.value
    )
      return;
    const rows = [...feed.value.querySelectorAll("[data-message-id]")]
      .filter((e) => canSeeChatMessage(e, feed.value))
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
      await teamApi.post("/messages/read", {
        ids: rows.map((m) => m._id),
        visibilityConfirmed: true,
      });
    } catch {
      keys.forEach((k) => acknowledgedReads.delete(k));
    }
  }, 200);
}
watch([shownMessages, tab, selectedMessageId, quoteView, draggingFiles,approvalOpen], async () => {
  await nextTick();
  scheduleReads();
});
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
  watchedIds.value = [
    ...new Set([
      ...(quoteView.value?._id ? [quoteView.value._id] : []),
      ...ids,
      ...older.value.slice(-40).map((m) => m._id),
    ]),
  ].slice(0, 120);
  if (!props.taskId) chat.olderMessageIds = watchedIds.value;
}
let scrollTimer;
let readingTouch = null;
function readingScroll() {
  if (props.taskId && props.active && shownMessages.value.length && !selectedMessageId.value && !quoteView.value && !preview.value)
    emit('reading-scroll');
}
function readingWheel(event) {
  if (!event.ctrlKey && event.deltaY > 0 && event.deltaY > Math.abs(event.deltaX)) readingScroll();
}
function startReadingTouch(event) {
  const touch = event.touches.length === 1 ? event.touches[0] : null;
  readingTouch = touch ? { id: touch.identifier, x: touch.clientX, y: touch.clientY } : null;
}
function moveReadingTouch(event) {
  if (!readingTouch || event.touches.length !== 1) { readingTouch = null; return; }
  const touch = event.touches[0];
  if (touch.identifier !== readingTouch.id) return;
  const x = touch.clientX - readingTouch.x, y = touch.clientY - readingTouch.y;
  if (Math.abs(x) > 12 && Math.abs(x) >= Math.abs(y)) { readingTouch = null; return; }
  if (y < -12 && -y > Math.abs(x)) { readingTouch = null; readingScroll(); }
}
function scrollFeed() {
  if (feed.value && !positioningThread)
    pinnedToBottom =
      feed.value.scrollHeight - feed.value.scrollTop - feed.value.clientHeight <
      80;
  cancelHold();
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const previous = watchedIds.value.join();
    trackVisibleHistory();
    if (previous !== watchedIds.value.join()) {
      if (props.taskId) void refreshConversation();
      else chat.schedule();
    }
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
  if (search.open) return;
  if (olderLoading.value || !historyMore.value || !historyReady.value) return;
  const first = shownMessages.value.find((m) => !m._delivery);
  if (!first) return;
  const workspaceId = chat.me?.workspaceId;
  olderLoading.value = true;
  historyError.value = "";
  try {
    const { data } = await teamApi.get("/messages", {
      params: {
        before: first._id,
        ...(props.taskId ? { taskId: props.taskId } : {}),
      },
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
      params: {
        before: gap.before,
        ...(props.taskId ? { taskId: props.taskId } : {}),
      },
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
watch(
  () => chat.state.checkedAt,
  () => {
    if (props.taskId && props.active) void refreshConversation();
  },
);
watch(
  () => props.active,
  (value) => {
    if (!value) dictation.stop();
    else nextTick(scheduleReads);
  },
);
async function revealTarget() {
  const id = props.targetMessageId;
  if (!id || !historyReady.value) return;
  while (
    !disposed &&
    historyMore.value &&
    !shownMessages.value.some((m) => m._id === id)
  ) {
    const before = shownMessages.value[0]?._id;
    await loadOlder();
    if (historyError.value || shownMessages.value[0]?._id === before) break;
  }
  await nextTick();
  if (disposed) return;
  const el = [
    ...(feed.value?.querySelectorAll("[data-message-id]") || []),
  ].find((el) => el.dataset.messageId === id);
  el?.scrollIntoView({ block: "center" });
  if (el) {
    highlightedMessage.value = id;
    if (!props.taskId && chat.requestedMessageId === id) chat.requestedMessageId = null;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => (highlightedMessage.value = null), 2000);
  }
  requestAnimationFrame(() => {
    if (disposed || !props.active || !chat.open || document.visibilityState === 'hidden') return;
    const box = feed.value?.getBoundingClientRect();
    if (!box?.width || !box?.height) return;
    const rect = el?.getBoundingClientRect();
    if (rect?.width && rect.height && rect.top < box.bottom && rect.bottom > box.top)
      completeTeamDestination({ workspaceId: chat.me?.workspaceId, taskId: props.taskId || null, messageId: id });
    // A deleted or inaccessible message must not block the rest of the application.
    else window.dispatchEvent(new Event('index12:team-priority-settled'));
  });
  scheduleReads();
}
function prepareUpdate(event){
  if(files.value.length || uploading.value || dictating.value){event.detail.block('Завершите запись или отправку вложений перед обновлением.');return;}
  if(message.value || replyDraft.value)event.detail.save(draftKey(chat.me,props.taskId),{text:message.value,reply:replyDraft.value,mentions:mentionedPeople.value});
}
watch(
  [() => props.targetMessageId, historyReady],
  () => {
    void revealTarget();
  },
  { immediate: true },
);
</script>
<template>
  <div class="team-pane team-chat-conversation" style="position: relative" v-on="fileDropEvents">
    <ChatFileDropOverlay v-if="draggingFiles" />
    <TeamMediaPreview
      v-if="preview"
      :media="preview"
      @close="closePreview"
      @retry="retryPreview"
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
        <span v-else-if="quoteView.loading" class="team-history-loading" role="status"
          ><span class="team-history-spinner" aria-hidden="true"></span><span>Загружаем сообщение…</span></span
        ><template v-else
          ><strong>{{ quoteView.authorName }}</strong
          ><CodexMessageText :text="quoteView.text" /><button
            v-for="file in quoteView.attachments"
            :key="file.fileId"
            type="button"
            class="team-file"
            @click="download(file)"
          >
            <UiIcon name="attach" /><TeamSearchText
              :text="file.name"
              :query="search.open ? search.query.trim() : ''"
            /></button
        ></template></div
    ></TeamChatDialog>
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
    <div
      v-if="localError || thread.error || chat.error"
      class="team-error"
      role="alert"
    >
      {{ localError || thread.error || chat.error }}
    </div>
    <div v-if="!chat.me" class="team-empty team-history-loading" role="status">
      <span v-if="!chat.error" class="team-history-spinner" aria-hidden="true"></span>
      <span>{{ chat.error || "Подключение к чату…" }}</span>
    </div>
    <div v-else-if="chat.me.status === 'pending'" class="team-empty">
      Запрос отправлен владельцу. Ожидается одобрение
    </div>
    <template v-else>
      <div
        ref="feed"
        class="team-feed"
        :id="taskId ? 'team-thread-' + taskId : 'team-panel'"
        role="region"
        :aria-label="taskId ? 'Чат задачи' : 'Чат сотрудников'"
        aria-live="polite"
        :aria-busy="historyLoading || olderLoading"
        @scroll="scrollFeed"
        @wheel.passive="readingWheel"
        @touchstart.passive="startReadingTouch"
        @touchmove.passive="moveReadingTouch"
        @touchend.passive="readingTouch = null"
        @touchcancel.passive="readingTouch = null"
      >
        <button
          v-if="historyMore && !historyLoading && !search.open"
          class="team-history"
          :disabled="olderLoading"
          @click="loadOlder"
        >
          {{ olderLoading ? "Загружаем сообщения…" : "Ранее" }}
        </button>
        <div
          v-if="historyLoading"
          class="team-empty team-history-loading"
          role="status"
        >
          <span class="team-history-spinner" aria-hidden="true"></span><span>Загружаем
          историю сообщений…</span>
        </div>
        <div v-else-if="historyError" class="team-empty" role="alert">
          {{ historyError }}<button @click="loadOlder">Повторить</button>
        </div>
        <div v-else-if="!historyReady" class="team-empty">
          <button @click="refreshConversation">Загрузить историю</button>
        </div>
        <div v-else-if="!shownMessages.length && !taskId" class="team-empty">
          Сообщения сотрудников появятся здесь
        </div>
        <template v-for="(m, index) in shownMessages" :key="m._id">
          <div
            v-if="
              chatDateKey(m.createdAt) &&
              (index === 0 ||
                chatDateKey(m.createdAt) !==
                  chatDateKey(shownMessages[index - 1].createdAt))
            "
            class="team-day-separator"
          >
            <time :datetime="chatDateKey(m.createdAt)">{{
              chatDateLabel(m.createdAt, calendarNow)
            }}</time>
          </div>
          <button
            v-if="!search.open && gaps.some((gap) => gap.before === m._id)"
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
              'approval-message': m.kind === 'approval_request',
              'reply-target': highlightedMessage === m._id,
              'search-current':
                search.open && search.result?.messageId === m._id,
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
              @contextmenu.capture="messageContext($event, m)"
              @keydown="messageKeys($event, m)"
            >
              <header v-if="m.kind !== 'task'">
                <strong>{{ m.authorName }}</strong>
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
                :highlight="search.open ? search.query.trim() : ''"
                @open="openTask(m.taskId)"
              />
              <button
                v-if="search.open && search.result?.taskMatch?.taskId === m.taskId && m.kind === 'task'"
                type="button" class="team-search-inside" @click="openTask(m.taskId)"
              ><span>Найдено внутри: {{ search.result.taskMatch.count }}</span><TeamSearchText v-if="search.result.taskMatch.preview" :text="search.result.taskMatch.preview" :query="search.query.trim()" /></button>
              <CodexMessageText v-if="m.kind === 'approval_request' && m.text && m.text !== 'Согласование'" :text="m.text" class="team-message-content" />
              <TeamApprovalMessage v-if="m.kind === 'approval_request' && m.approvalRequest" :message="m" />
              <CodexMessageText
                v-else-if="m.text && m.kind !== 'task'"
                :text="m.text"
                :highlight="search.open ? search.query.trim() : ''"
                class="team-message-content"
              />
              <div v-for="file in m.attachments" :key="file.fileId" class="team-attachment-row">
              <button
                :data-media-file-id="file.fileId"
                :draggable="!!transfer.scope.value && !m._delivery"
                @dragstart.stop="pointerCancelled(); transfer.file($event, () => readFile(file))"
                class="team-file"
                :disabled="!!m._delivery"
                @click="download(file)"
              >
                <UiIcon name="attach" /><TeamSearchText
                  :text="file.name"
                  :query="search.open ? search.query.trim() : ''"
                />
              </button>
              <button type="button" class="team-attachment-library" :disabled="!!m._delivery" :aria-label="'В коллекции: '+file.name" title="Показать в коллекции файлов" @pointerdown.stop @click.stop="chat.openFiles(file.fileId)"><UiIcon name="folder"/></button>
              </div>
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
              <footer v-if="m.kind !== 'task'" class="team-message-meta">
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
                <span v-if="m.editedAt">изменено</span>
                <span class="team-message-stamp"
                  ><time :datetime="m.createdAt">{{
                    new Date(m.createdAt).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }}</time
                  ><span
                    v-if="m.authorId === chat.me.actorId && !m._delivery"
                    class="team-read-receipt"
                    :class="{ read: m.readCount > 0 }"
                    role="img"
                    :aria-label="messageStatus(m)"
                    :title="messageStatus(m)"
                    ><UiIcon
                      :name="m.readCount > 0 ? 'checks' : 'check'" /></span
                ></span>
              </footer>
            </div>
          </article>
        </template>
        <TeamAppUpdate v-if="updates.available && active" inline />
      </div>
      <div
        v-for="(entry, id) in chat.failedMessageDeletions"
        :key="id"
        class="team-delete-error"
        role="alert"
      >
        <span :title="entry.error">Не удалось удалить сообщение</span>
        <button type="button" @click="chat.deleteMessage(entry)">
          Повторить
        </button>
        <button type="button" @click="chat.restoreMessage(id)">Вернуть</button>
      </div>
      <div
        v-if="search.open && search.error"
        class="team-search-notice"
        role="alert"
      >
        {{ search.error
        }}<button type="button" @click="search.find()">Повторить</button>
      </div>
      <div
        v-else-if="
          search.open && search.hasQuery && !search.busy && !search.total
        "
        class="team-search-notice"
        role="status"
      >
        Ничего не найдено
      </div>
      <div
        v-show="!search.open"
        ref="composeArea"
        class="team-compose-area"
        @focusin="emit('composer-focus')"
        @focusout="emit('composer-blur')"
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
        <span v-if="uploading" class="team-upload-state" role="status"
          >Загрузка файла…</span
        >
        <input
          ref="input"
          type="file"
          hidden
          multiple
          @change="attach"
        /><CodexComposer
          v-model="message"
          :busy="uploading || transfer.pending.value"
          :mobile="mobile"
          :focus-on-touch="chat.isOwner"
          attachments-enabled
          :recording="dictating"
          :speech-supported="dictationSupported"
          @microphone="
            localError = '';
            dictation.toggle();
          "
          :has-attachments="!!files.length"
          :placeholder="taskId ? 'Сообщение' : 'Сообщение сотрудникам'"
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
              :subtask="!!taskId"
              :disabled="uploading"
              @task="startTask"
              @approval="approvalOpen = true"
              @file="input.click()" /></template
        ></CodexComposer>
      </div>
      <TeamApprovalDialog v-if="approvalOpen && taskId" :task-id="taskId" @close="approvalOpen = false" @added="approvalAdded" />
    </template>
  </div>
</template>
<style scoped src="./teamChat.css"></style>

<style scoped>
.team-attachment-row{display:flex;align-items:center;gap:4px;min-width:0}.team-attachment-row>.team-file{min-width:0;flex:1}.team-attachment-library{display:grid;place-items:center;flex:none;width:44px;min-height:44px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;opacity:.65}.team-attachment-library:hover{opacity:1}
</style>

<style scoped>
.team-search-inside { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; width: 100%; min-height: 44px; padding: 6px 0; border: 0; background: transparent; color: var(--codex-pane-accent); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.team-search-inside > :last-child:not(:first-child) { color: var(--codex-pane-muted); }
</style>
