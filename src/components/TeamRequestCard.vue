<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import UiIcon from "./UiIcon.vue";
import { useTeamChatStore, teamApi } from "@/stores/teamChatStore";
import { decisionStatus, reviewerLabel } from "@/utils/teamRequestStatus";
import {
  accountLabel,
  accountRequestForecast,
  liveRequestCosts,
} from "@/utils/teamCashForecast";
const props = defineProps({
    request: { type: Object, required: true },
    defaultOpen: Boolean,
  }),
  emit = defineEmits([
    "edit",
    "decision",
    "convert",
    "recall",
    "file",
    "delete",
    "copy",
  ]);
const chat = useTeamChatStore(),
  element = ref(null),
  expanded = ref(props.defaultOpen),
  metaOpen = ref(false),
  r = computed(() => props.request);
watch(
  () => props.defaultOpen,
  (value) => {
    if (value) expanded.value = true;
  },
);
const dateLabel = (value) => value?.split("-").reverse().join(".") || "—";
const status = computed(() =>
  r.value.state === "recorded"
    ? "Расход создан"
    : decisionStatus(r.value.history) ||
      (r.value.viewedAt ? "Просмотрено" : "Доставлено"),
);
const assignee = computed(() =>
  ["manager_review", "director_review"].includes(r.value.state)
    ? reviewerLabel(
        r.value.state === "director_review" ? "director" : "manager",
        chat.state.people,
      )
    : "",
);
const rejection = computed(
  () =>
    r.value.rejectionReason ||
    [...(r.value.history || [])].reverse().find((h) => h.action === "reject")
      ?.note,
);
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(
    new Date(),
  );
let observer,
  visible = false,
  reading = false,
  acknowledged = false;
async function markRead() {
  if (
    !visible ||
    reading ||
    acknowledged ||
    r.value.authorId === chat.me?.actorId ||
    r.value.viewedAt ||
    document.visibilityState !== "visible" ||
    document.querySelector("dialog[open]")
  )
    return;
  reading = true;
  try {
    await teamApi.post(`/requests/${r.value._id}/read`, {});
    acknowledged = true;
  } catch {
    /* Retry on focus or another visibility change. */
  } finally {
    reading = false;
  }
}
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      if (visible) void markRead();
    },
    { threshold: 0.25 },
  );
  observer.observe(element.value);
  window.addEventListener("focus", markRead);
  window.addEventListener("index12:chat-dialog-closed", markRead);
  document.addEventListener("visibilitychange", markRead);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener("focus", markRead);
  window.removeEventListener("index12:chat-dialog-closed", markRead);
  document.removeEventListener("visibilitychange", markRead);
});
const accountForecast = computed(() => {
  const account = chat.state.financial?.accounts?.find(
    (a) => a._id === r.value.placement?.accountId,
  );
  return account
    ? accountRequestForecast(
        account,
        liveRequestCosts(chat.state.activeRequestCosts, chat.state.requests),
        chat.state.financial.asOf,
      )
    : null;
});
const canDelete = computed(
  () =>
    chat.me?.owner ||
    ["manager", "director"].includes(chat.me?.role) ||
    (r.value.authorId === chat.me?.actorId && !r.value.operationId),
);
const manager = computed(() => chat.me?.owner);
const money = (value) =>
  new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT" }).format(
    value / 100,
  );
function dragEnd() {
  delete document.body.dataset.teamRequestDragging;
}
function drag(event) {
  if (!manager.value || r.value.state !== "manager_review") {
    event.preventDefault();
    return;
  }
  event.dataTransfer.setData("application/x-index12-request", r.value._id);
  event.dataTransfer.setData(
    "application/json",
    JSON.stringify({
      _id: "team-request:" + r.value._id,
      isTeamRequest: true,
      requestId: r.value._id,
    }),
  );
  event.dataTransfer.effectAllowed = "move";
  document.body.dataset.teamRequestDragging = "true";
}
</script>
<template>
  <article
    ref="element"
    class="request-card"
    :data-state="r.state"
    :draggable="manager && r.state === 'manager_review'"
    @dragstart="drag"
    @dragend="dragEnd"
  >
    <div class="request-card-top">
      <button
        type="button"
        class="request-card-head"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <span class="request-title">{{ r.title }}</span
        ><span class="request-money">{{ money(r.amountCents) }}</span>
        <span class="request-status">{{ status }}</span>
        <span v-if="assignee" class="request-assignee">{{ assignee }}</span>
        <span v-if="r.authorName" class="request-author"
          >{{ chat.me?.roles?.[r.authorRole || "employee"] || "Сотрудник" }} ({{
            r.authorName
          }})</span
        >
        <span v-if="r.dueDate > today()" class="request-planned"
          >План · {{ dateLabel(r.dueDate) }}</span
        >
      </button>
    </div>
    <p v-if="r.state === 'rejected' && rejection" class="request-rejection">
      {{ rejection }}
    </p>
    <div v-if="expanded" class="request-details">
      <p
        v-if="r.projectNames?.length || r.categoryNames?.length"
        class="request-classification"
      >
        {{
          [
            ...(r.projectNames || []),
            ...(r.categoryNames || []),
            r.subcategoryName,
          ]
            .filter(Boolean)
            .join(" · ")
        }}
      </p>
      <p
        v-if="r.placement?.description && r.placement.description !== r.title"
        class="request-comment"
      >
        {{ r.placement.description }}
      </p>
      <p v-if="r.comment" class="request-comment">{{ r.comment }}</p>
      <dl
        v-if="
          accountForecast &&
          !r.operationId &&
          ['manager_review', 'director_review', 'ready'].includes(r.state)
        "
        class="request-account-balances"
      >
        <div>
          <dt :title="accountLabel(accountForecast, chat.state.companies)">
            {{ accountLabel(accountForecast, chat.state.companies) }}
          </dt>
          <dd>{{ money(accountForecast.balanceCents) }}</dd>
        </div>
        <div>
          <dt>После этой заявки</dt>
          <dd>{{ money(accountForecast.balanceCents - r.amountCents) }}</dd>
        </div>
        <div>
          <dt>Все заявки на сегодня</dt>
          <dd :class="{ negative: accountForecast.afterDueRequestsCents < 0 }">
            {{ money(accountForecast.afterDueRequestsCents) }}
          </dd>
        </div>
      </dl>
      <div class="request-actions">
        <button
          v-if="canDelete"
          type="button"
          class="request-icon request-delete"
          aria-label="Удалить заявку"
          title="Удалить заявку"
          :disabled="chat.busy"
          @click="emit('delete', r)"
        >
          <UiIcon name="trash" />
        </button>

        <template v-if="manager && r.state === 'manager_review'">
          <button
            type="button"
            class="request-icon"
            :aria-label="
              r.placement ? 'Изменить реквизиты' : 'Разместить на таймлайне'
            "
            :title="
              r.placement ? 'Изменить реквизиты' : 'Разместить на таймлайне'
            "
            @click="emit('edit', r)"
          >
            <UiIcon :name="r.placement ? 'edit' : 'month'" />
          </button>
          <button
            v-if="r.placement"
            type="button"
            class="request-send"
            :disabled="chat.busy"
            aria-label="Согласовано мной → руководителю"
            title="Согласовано мной → руководителю"
            @click="emit('decision', r, 'approve')"
          >
            <UiIcon name="send" />Руководителю
          </button>
          <button
            type="button"
            class="request-icon"
            :disabled="chat.busy"
            aria-label="Отклонить"
            title="Отклонить"
            @click="emit('decision', r, 'reject')"
          >
            <UiIcon name="close" />
          </button>
        </template>
        <template
          v-if="chat.me?.role === 'director' && r.state === 'director_review'"
        >
          <button
            type="button"
            class="request-send"
            :disabled="chat.busy"
            @click="emit('decision', r, 'approve')"
          >
            <UiIcon name="check" />Согласовать
          </button>
          <button
            type="button"
            class="request-icon"
            :disabled="chat.busy"
            aria-label="Отклонить"
            title="Отклонить"
            @click="emit('decision', r, 'reject')"
          >
            <UiIcon name="close" />
          </button>
        </template>
        <button
          v-if="manager && r.state === 'ready' && r.placement"
          type="button"
          class="request-send"
          :disabled="chat.busy"
          aria-label="Записать согласованный расход"
          title="Записать согласованный расход"
          @click="emit('convert', r)"
        >
          <UiIcon name="check" />В расход
        </button>
        <button
          v-if="
            manager &&
            ['director_review', 'ready', 'rejected'].includes(r.state) &&
            !r.operationId
          "
          type="button"
          class="request-icon"
          :disabled="chat.busy"
          aria-label="Вернуть на доработку"
          title="Вернуть на доработку"
          @click="emit('recall', r)"
        >
          <UiIcon name="undo" />
        </button>
        <button
          v-if="r.sourceFileId"
          type="button"
          class="request-icon"
          aria-label="Открыть PDF-счёт"
          title="Открыть PDF-счёт"
          @click="emit('file', { fileId: r.sourceFileId, name: 'Счёт.pdf' })"
        >
          <UiIcon name="attach" />
        </button>
        <button
          type="button"
          class="request-icon"
          aria-label="Копировать заявку"
          title="Копировать заявку"
          @click="
            emit(
              'copy',
              [
                r.title,
                money(r.amountCents),
                dateLabel(r.dueDate),
                r.contractorName,
                r.comment,
              ]
                .filter(Boolean)
                .join(' · '),
            )
          "
        >
          <UiIcon name="copy" />
        </button>
        <button
          type="button"
          :aria-expanded="metaOpen"
          @click="metaOpen = !metaOpen"
          class="request-icon"
          aria-label="Реквизиты и история заявки"
          title="Реквизиты и история заявки"
        >
          <UiIcon name="info" />
        </button>
        <div v-if="metaOpen" class="request-meta-content">
          <dl>
            <div>
              <dt>Автор</dt>
              <dd>{{ r.authorName }}</dd>
            </div>
            <div>
              <dt>Кому</dt>
              <dd>{{ r.contractorName || "—" }}</dd>
            </div>
            <div>
              <dt>Дата</dt>
              <dd>{{ dateLabel(r.dueDate) }}</dd>
            </div>
            <div v-if="r.companyName">
              <dt>Компания</dt>
              <dd>{{ r.companyName }}</dd>
            </div>
            <div v-if="r.placement?.accountName">
              <dt>Счёт</dt>
              <dd>{{ accountLabel(accountForecast, chat.state.companies) }}</dd>
            </div>
            <div v-if="r.categoryNames?.length">
              <dt>Категория</dt>
              <dd>{{ r.categoryNames.join(", ") }}</dd>
            </div>
            <div v-if="r.subcategoryName">
              <dt>Подкатегория</dt>
              <dd>{{ r.subcategoryName }}</dd>
            </div>
          </dl>
          <p
            v-if="r.authorComment && r.authorComment !== r.comment"
            class="request-comment"
          >
            {{ r.authorName }}: {{ r.authorComment }}
          </p>
          <ol v-if="r.history.length" class="request-history">
            <li v-for="(h, i) in r.history" :key="i">
              <strong>{{ h.name }}</strong
              ><span>{{
                {
                  approve: "Согласовано",
                  reject: "Отклонено",
                  enrich: "Реквизиты заполнены",
                  recall: "Возвращено управляющему",
                }[h.action] || h.action
              }}</span
              ><time>{{
                new Date(h.at).toLocaleString("ru-RU", {
                  timeZone: "Asia/Almaty",
                })
              }}</time>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </article>
</template>
<style scoped>
.request-card {
  border: 1px solid var(--codex-pane-border);
  border-left: 3px solid var(--codex-pane-danger);
  border-radius: 8px;
  margin-bottom: 8px;
  background: var(--codex-pane-surface);
  overflow: hidden;
}
.request-card[draggable="true"] {
  cursor: grab;
}
.request-card-top {
  display: flex;
  align-items: center;
  padding-right: 8px;
  gap: 4px;
}
.request-card-head {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 4px 12px;
  text-align: left;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  padding: 12px !important;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.request-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.request-money {
  font-size: 15px;
  color: var(--codex-pane-danger);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.request-status {
  grid-column: 1 / -1;
  color: var(--codex-pane-muted);
  font-size: 11px;
  line-height: 16px;
}
.request-tools {
  display: flex;
  gap: 4px;
  flex: none;
}
.request-tools .request-icon {
  width: 28px;
  height: 32px;
}
.request-card .request-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0 !important;
  background: transparent !important;
  color: var(--codex-pane-muted);
  border: 0 !important;
  border-radius: 6px;
  cursor: pointer;
  list-style: none;
}
.request-card .request-icon:hover {
  color: var(--codex-pane-text);
  background: var(--codex-pane-hover) !important;
}
.request-card .request-delete:hover {
  color: var(--codex-pane-danger);
}
.request-details {
  padding: 0 12px 12px;
  font-size: 12px;
}
.request-details dl {
  margin: 8px 0;
}
.request-details dl div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin: 8px 0;
  line-height: 1.5;
}
.request-details dt {
  color: var(--codex-pane-muted);
  min-width: 0;
}
.request-details dd {
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
  min-width: 0;
}
.request-account-balances dd {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.request-account-balances {
  padding-top: 4px;
  border-top: 1px solid var(--codex-pane-border);
}
.request-comment {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
  margin: 8px 0 12px;
}
.request-actions {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 4px;
}
.request-actions .request-send {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 12px;
  border: 0;
  border-radius: 6px;
  background: #b7433b;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.request-meta-content {
  flex-basis: 100%;
  width: 100%;
  padding-top: 8px;
  border-top: 1px solid var(--codex-pane-border);
}
.request-history {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  border-top: 1px solid var(--codex-pane-border);
}
.request-history li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  padding: 8px 0;
  color: var(--codex-pane-muted);
  font-size: 11px;
  line-height: 1.5;
}
.request-history strong {
  font-weight: 500;
  color: var(--codex-pane-text);
}
.request-history time {
  width: 100%;
}
@media (max-width: 420px) {
  .request-tools .request-icon {
    width: 40px;
    height: 40px;
  }
  .request-card-head {
    gap: 4px 8px;
  }
  .request-actions .request-icon {
    width: 40px;
    height: 40px;
  }
}

.request-assignee,
.request-author,
.request-planned {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: var(--codex-pane-muted);
}
.request-assignee,
.request-author,
.request-planned {
  grid-column: 1 / -1;
}
.request-planned {
  color: var(--codex-pane-accent);
}
.request-rejection {
  margin: 8px 0 0;
  padding: 8px;
  border-left: 2px solid var(--color-danger, #c65048);
  font-size: 13px;
  white-space: pre-wrap;
}
.request-classification {
  font-size: 12px;
  color: var(--codex-pane-muted);
  margin: 0 0 8px;
}
.request-account-balances > div:first-child dt {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
}
.negative {
  color: var(--codex-pane-danger);
}
</style>
