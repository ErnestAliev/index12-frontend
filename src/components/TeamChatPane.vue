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
import TeamContractorSelect from "./TeamContractorSelect.vue";
import TeamRequestCard from "./TeamRequestCard.vue";
import TeamExpenseTitle from "./TeamExpenseTitle.vue";
import TeamMessageMenu from "./TeamMessageMenu.vue";
import TeamChatMembers from "./TeamChatMembers.vue";
import { formatAmountInputEvent } from "@/utils/amountInput";
defineProps({ mobile: Boolean });
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
const chat = useTeamChatStore(),
  tab = ref(chat.tab || "messages"),
  message = ref(""),
  files = ref([]),
  input = ref(null),
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
const selectedMessageId = ref(null);
const selectedMessage = computed(() =>
  shownMessages.value.find((m) => m._id === selectedMessageId.value),
);
let holdTimer, holdStart, suppressedClick;
function cancelHold() {
  clearTimeout(holdTimer);
  holdTimer = null;
}
function openMessageMenu(row) {
  cancelHold();
  if (row._delivery || selectedMessageId.value === row._id) return;
  selectedMessageId.value = row._id;
}
function holdMessage(event, row) {
  if (
    event.button !== 0 ||
    selectedMessage.value ||
    event.target.closest("input,textarea")
  )
    return;
  cancelHold();
  suppressedClick = null;
  holdStart = { x: event.clientX, y: event.clientY };
  holdTimer = setTimeout(() => {
    suppressedClick = row._id;
    openMessageMenu(row);
  }, 450);
}
function moveMessage(event) {
  if (
    holdStart &&
    Math.hypot(event.clientX - holdStart.x, event.clientY - holdStart.y) > 10
  )
    cancelHold();
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
}
async function reactToMessage(row, reaction) {
  await run(() =>
    chat.action(`/messages/${row._id}/reaction`, {
      emoji: reaction.mine ? null : reaction.emoji,
    }),
  );
}
const messageStatus = (row) =>
  ({
    director_review: "У руководителя",
    approved: "Согласовано",
    rejected: "Отклонено",
  })[row.approval?.state] || "";
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
let noticeTimer, revealFrame;
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
async function startRequest() {
  creating.value = true;
  chat.notice = "";
  await nextTick();
  scroll.value.scrollTop = 0;
  scroll.value
    .querySelector('[aria-label="Что оплатить / купить"]')
    ?.focus({ preventScroll: true });
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
  await nextTick();
  if (feed.value) feed.value.scrollTop = feed.value.scrollHeight;
});
onBeforeUnmount(() => {
  clearTimeout(noticeTimer);
  clearTimeout(scrollTimer);
  cancelHold();
  cancelAnimationFrame(revealFrame);
  window.visualViewport?.removeEventListener("resize", revealField);
  chat.notice = "";
});
const draft = ref({
  title: "",
  categoryId: null,
  amount: "",
  contractorId: null,
  contractorName: "",
  comment: "",
  dueDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(
    new Date(),
  ),
  id: crypto.randomUUID(),
});
watch(tab, (value) => {
  chat.tab = value;
  chat.schedule();
});
watch(
  () => chat.requestedRequestId,
  (id) => {
    if (id) {
      focusedRequest.value = id;
      tab.value = "requests";
    }
  },
);
const processingPdf = ref(null),
  focusedRequest = ref(chat.requestedRequestId || null);
const money = (cents) =>
  new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 2,
  }).format(cents / 100);
const isReviewer = computed(
  () => chat.isOwner || ["manager", "director"].includes(chat.me?.role),
);
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
      (m) => !m.deletedAt && !chat.state.deletedMessageIds?.includes(m._id),
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a._id.localeCompare(b._id),
    ),
);
watch(selectedMessage, (value) => {
  if (!value) selectedMessageId.value = null;
});
watch(
  () => chat.me?.workspaceId,
  () => {
    older.value = [];
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
  const id = chat.send(message.value, files.value);
  if (!id) return;
  message.value = "";
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
function trackVisibleHistory() {
  if (!feed.value) return;
  const box = feed.value.getBoundingClientRect();
  const ids = [...feed.value.querySelectorAll("[data-message-id]")]
    .filter((element) => {
      const r = element.getBoundingClientRect();
      return r.bottom > box.top - 300 && r.top < box.bottom + 300;
    })
    .map((element) => element.dataset.messageId);
  chat.olderMessageIds = [
    ...new Set([...ids, ...older.value.slice(-40).map((m) => m._id)]),
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
async function createRequest() {
  const result = await run(() =>
    chat.action("/requests", {
      ...draft.value,
      amount: draft.value.amount.replace(/\s/g, ""),
    }),
  );
  if (result) {
    creating.value = false;
    focusedRequest.value = result.request._id;
    chat.requestedRequestId = result.request._id;
    draft.value = {
      ...draft.value,
      title: "",
      categoryId: null,
      amount: "",
      comment: "",
      id: crypto.randomUUID(),
    };
  }
}
async function decide(row, action) {
  await run(() =>
    chat.action(`/requests/${row._id}/decision`, {
      action,
      expectedVersion: row.version,
    }),
  );
}
function editRequest(row) {
  window.dispatchEvent(
    new CustomEvent("index12:edit-team-request", { detail: { id: row._id } }),
  );
}
async function convert(row) {
  const result = await run(() =>
    chat.action(`/requests/${row._id}/convert`, {
      expectedVersion: row.version,
    }),
  );
  if (result) window.dispatchEvent(new Event("index12:team-operation-created"));
}
async function recall(row) {
  await run(() =>
    chat.action(`/requests/${row._id}/recall`, {
      expectedVersion: row.version,
    }),
  );
}
async function processPdf(message, file) {
  processingPdf.value = file.fileId;
  await run(async () => {
    const { data } = await teamApi.post(
      `/messages/${message._id}/files/${file.fileId}/invoice`,
      {},
      { timeout: 200000 },
    );
    await chat.refresh();
    focusedRequest.value = data.request._id;
    tab.value = "requests";
  });
  processingPdf.value = null;
}
async function dismissPdf(message, file) {
  await run(() =>
    chat.action(`/messages/${message._id}/files/${file.fileId}/dismiss`, {}),
  );
}
async function removeRequest(row) {
  const question = row.operationId
    ? "Удалить карточку заявки? Записанный расход останется на таймлайне."
    : "Удалить заявку и её черновик с таймлайна?";
  if (!window.confirm(question)) return;
  const result = await run(() =>
    chat.action(
      `/requests/${row._id}`,
      { expectedVersion: row.version },
      "delete",
    ),
  );
  if (result) chat.notice = "";
}
async function copy(text) {
  await run(() => navigator.clipboard.writeText(text));
}
</script>
<template>
  <div class="team-pane">
    <TeamMessageMenu
      v-if="selectedMessage"
      :message="selectedMessage"
      @close="selectedMessageId = null"
      @deleted="deletedMessage"
    />
    <nav class="team-tabs" role="tablist" aria-label="Разделы чата">
      <button
        role="tab"
        :aria-selected="tab === 'messages'"
        :id="'team-tab-messages'"
        aria-controls="team-panel"
        @click="tab = 'messages'"
      >
        Сообщения</button
      ><button
        role="tab"
        :aria-selected="tab === 'requests'"
        :id="'team-tab-requests'"
        aria-controls="team-panel"
        @click="tab = 'requests'"
      >
        Заявки
        <small>{{
          chat.state.requests.filter(
            (r) => !["recorded", "rejected"].includes(r.state),
          ).length
        }}</small></button
      ><button
        v-if="chat.isOwner"
        role="tab"
        :aria-selected="tab === 'members'"
        :id="'team-tab-members'"
        aria-controls="team-panel"
        @click="tab = 'members'"
      >
        Участники
        <small v-if="chat.pending.length || chat.state.recoveryCount">{{
          chat.pending.length + (chat.state.recoveryCount || 0)
        }}</small>
      </button>
    </nav>
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
    <template v-else-if="tab === 'messages'">
      <div
        ref="feed"
        class="team-feed"
        id="team-panel"
        role="tabpanel"
        aria-labelledby="team-tab-messages"
        aria-label="Сообщения сотрудников"
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
            :class="{ self: m.authorId === chat.me.actorId }"
          >
            <div
              class="team-bubble"
              tabindex="0"
              :aria-label="`Сообщение ${m.authorName}`"
              @pointerdown="holdMessage($event, m)"
              @pointermove="moveMessage"
              @pointerup="cancelHold"
              @pointercancel="cancelHold"
              @click.capture="messageClick($event, m)"
              @contextmenu.prevent="openMessageMenu(m)"
              @keydown="messageKeys($event, m)"
            >
              <header>
                <strong>{{ m.authorName }}</strong
                ><time>{{
                  new Date(m.createdAt).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }}</time>
              </header>
              <span v-if="m.forwardedFrom" class="team-forwarded"
                >Переслано · {{ m.forwardedFrom.authorName }}</span
              >
              <CodexMessageText
                v-if="m.text"
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
              <template
                v-for="file in m.attachments.filter(
                  (f) =>
                    !m._delivery &&
                    f.isPdf &&
                    !f.invoiceRequestId &&
                    !f.invoiceDismissed &&
                    !chat.state.requests.some(
                      (r) => r.sourceFileId === f.fileId,
                    ),
                )"
                :key="'pdf-' + file.fileId"
                ><div
                  v-if="m.authorId === chat.me.actorId"
                  class="team-pdf-question"
                >
                  <span>Это счёт на оплату?</span>
                  <div>
                    <button
                      type="button"
                      :disabled="!!processingPdf"
                      @click="processPdf(m, file)"
                    >
                      {{
                        processingPdf === file.fileId
                          ? "Распознавание…"
                          : "Да, создать заявку"
                      }}</button
                    ><button
                      type="button"
                      :disabled="!!processingPdf"
                      @click="dismissPdf(m, file)"
                    >
                      Не обрабатывать
                    </button>
                  </div>
                </div></template
              >
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
              <div v-if="m.editedAt || m.approval" class="team-message-meta">
                <span v-if="m.editedAt">изменено</span
                ><span
                  v-if="m.approval"
                  :class="{
                    'message-rejected': m.approval.state === 'rejected',
                  }"
                  >{{ messageStatus(m) }}</span
                >
              </div>
            </div>
          </article>
        </template>
      </div>
      <div class="team-compose-area">
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
        </div>
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
          hide-microphone
          :has-attachments="!!files.length"
          placeholder="Сообщение сотрудникам"
          @send="send"
          @attach="input.click()"
        /><span v-if="uploading" role="status">Загрузка файла…</span>
      </div>
    </template>
    <div
      v-else
      ref="scroll"
      id="team-panel"
      role="tabpanel"
      :aria-labelledby="`team-tab-${tab}`"
      class="team-scroll"
      @focusin="revealField"
    >
      <template v-if="tab === 'requests'">
        <div v-if="!creating" class="team-request-toolbar">
          <button
            type="button"
            class="team-expense-primary team-request-new"
            aria-label="Заявка на расход"
            @click="startRequest"
          >
            <UiIcon name="plus" />Заявка
          </button>
        </div>
        <form
          v-if="creating"
          class="team-form team-expense-form"
          @submit.prevent="createRequest"
        >
          <div class="team-title-row">
            <TeamExpenseTitle
              v-model="draft.title"
              @category="draft.categoryId = $event?._id || null"
            />
            <button
              type="button"
              class="team-small-icon"
              title="Закрыть форму"
              aria-label="Закрыть форму заявки"
              @click="creating = false"
            >
              <UiIcon name="close" />
            </button>
          </div>
          <div class="team-fields">
            <div class="team-amount-field">
              <input
                :value="draft.amount"
                @input="draft.amount = formatAmountInputEvent($event)"
                aria-label="Сумма, ₸"
                placeholder="Сумма"
                inputmode="decimal"
                required
              /><span aria-hidden="true">₸</span>
            </div>
            <label class="team-payment-date" title="Дата оплаты"
              ><UiIcon name="month" /><span aria-hidden="true">{{
                draft.dueDate.split("-").reverse().join(".")
              }}</span
              ><input
                v-model="draft.dueDate"
                type="date"
                aria-label="Дата оплаты"
                required
            /></label>
          </div>
          <TeamContractorSelect
            v-model="draft.contractorId"
            :fallback-name="draft.contractorName"
            @selected="draft.contractorName = $event.name"
          /><textarea
            v-model="draft.comment"
            aria-label="Комментарий к заявке"
            placeholder="Комментарий"
            rows="2"
            maxlength="10000"
          ></textarea
          ><button
            class="team-expense-primary team-request-submit"
            :disabled="chat.busy || !draft.contractorId"
          >
            Отправить на согласование
          </button>
        </form>
        <template v-if="!creating">
          <div v-if="isReviewer && chat.state.financial" class="team-forecast">
            <div
              v-if="chat.state.financial.unallocatedCents"
              class="team-unallocated"
            >
              Без выбранной компании:
              {{ money(chat.state.financial.unallocatedCents) }}
            </div>
            <article
              v-for="c in chat.state.financial.companies.filter(
                (c) => c.requestedCents,
              )"
              :key="c.companyId"
            >
              <strong>{{
                chat.state.companies.find((x) => x._id === c.companyId)?.name ||
                "Общие счета"
              }}</strong>
              <dl>
                <div>
                  <dt>Сейчас на счетах</dt>
                  <dd>{{ money(c.currentCents) }}</dd>
                </div>
                <div>
                  <dt>Заявки к оплате</dt>
                  <dd>−{{ money(c.requestedCents) }}</dd>
                </div>
                <div>
                  <dt>Минимум по прогнозу</dt>
                  <dd :class="{ negative: c.minimumCents < 0 }">
                    {{ money(c.minimumCents) }}
                  </dd>
                </div>
              </dl>
              <p v-if="c.gapDate" class="negative">
                Кассовый разрыв с {{ c.gapDate }}
              </p>
            </article>
            <details>
              <summary>Остатки на счетах</summary>
              <details
                v-for="a in chat.state.financial.accounts"
                :key="a._id"
                class="team-account-forecast"
              >
                <summary>
                  <span
                    >{{ a.name
                    }}<small>{{
                      chat.state.companies.find((c) => c._id === a.companyId)
                        ?.name
                    }}</small></span
                  ><span>{{ money(a.balanceCents) }}</span>
                </summary>
                <dl>
                  <div>
                    <dt>На согласовании</dt>
                    <dd>−{{ money(a.pendingCents || 0) }}</dd>
                  </div>
                  <div>
                    <dt>Утверждено</dt>
                    <dd>−{{ money(a.approvedCents || 0) }}</dd>
                  </div>
                  <div>
                    <dt>После всех заявок</dt>
                    <dd :class="{ negative: a.afterRequestsCents < 0 }">
                      {{ money(a.afterRequestsCents ?? a.balanceCents) }}
                    </dd>
                  </div>
                </dl>
              </details>
            </details>
          </div>
          <p v-if="chat.state.requestsTruncated" class="team-error">
            Показаны последние 500 заявок. Прогноз учитывает все активные заявки
          </p>
          <div
            v-if="!chat.state.requests.length && !creating"
            class="team-empty"
          >
            Заявок пока нет
          </div>
          <TeamRequestCard
            v-for="r in chat.state.requests"
            :key="r._id"
            :request="r"
            :default-open="focusedRequest === r._id"
            @edit="editRequest"
            @decision="decide"
            @convert="convert"
            @recall="recall"
            @file="download"
            @copy="copy"
            @delete="removeRequest"
          />
        </template>
      </template>
      <template v-else-if="tab === 'members' && chat.isOwner"
        ><TeamChatMembers />
      </template>
    </div>
  </div>
</template>
<style scoped src="./teamChat.css"></style>
