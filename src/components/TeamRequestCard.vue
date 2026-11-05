<script setup>
import { computed, ref, watch } from "vue";
import { useTeamChatStore } from "@/stores/teamChatStore";
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
  ]);
const chat = useTeamChatStore(),
  expanded = ref(props.defaultOpen),
  r = computed(() => props.request);
watch(
  () => props.defaultOpen,
  (value) => {
    if (value) expanded.value = true;
  },
);
const dateLabel = (value) => value?.split("-").reverse().join(".") || "—";
const financeDetails = computed(
  () => chat.me?.role !== "employee" || !!r.value.placement,
);
const labels = {
  manager_review: "У управляющего",
  director_review: "У руководителя",
  ready: "Согласовано руководителем",
  recorded: "Расход создан",
  rejected: "Отклонено",
};
const accountForecast = computed(() =>
  chat.state.financial?.accounts?.find(
    (a) => a._id === r.value.placement?.accountId,
  ),
);
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
    class="request-card"
    :data-state="r.state"
    :draggable="manager && r.state === 'manager_review'"
    @dragstart="drag"
    @dragend="dragEnd"
  >
    <button
      type="button"
      class="request-card-head"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="request-status">{{ labels[r.state] }}</span
      ><span class="request-title">{{ r.title }}</span
      ><span class="request-money">{{ money(r.amountCents) }}</span
      ><span class="request-meta"
        >{{ r.contractorName || "Контрагент не указан" }} ·
        {{ dateLabel(r.dueDate) }}</span
      >
    </button>
    <ol class="request-branch" aria-label="Этапы согласования">
      <li :class="{ complete: true }">Сотрудник</li>
      <li
        :class="{
          current: r.state === 'manager_review',
          complete: ['director_review', 'ready', 'recorded'].includes(r.state),
        }"
      >
        Управляющий
      </li>
      <li
        :class="{
          current: r.state === 'director_review',
          complete: ['ready', 'recorded'].includes(r.state),
        }"
      >
        Руководитель
      </li>
    </ol>
    <div v-if="expanded" class="request-details">
      <dl>
        <div>
          <dt>Автор</dt>
          <dd>{{ r.authorName }}</dd>
        </div>
        <div>
          <dt>Кому</dt>
          <dd>{{ r.contractorName || "—" }}</dd>
        </div>
        <div v-if="financeDetails || r.companyName">
          <dt>Компания</dt>
          <dd>{{ r.companyName || "Не выбрана" }}</dd>
        </div>
        <div v-if="financeDetails">
          <dt>Счёт</dt>
          <dd>{{ r.placement?.accountName || "Не выбран" }}</dd>
        </div>
        <div v-if="financeDetails || r.categoryNames?.length">
          <dt>Категории</dt>
          <dd>{{ r.categoryNames?.join(", ") || "Не выбраны" }}</dd>
        </div>
        <div v-if="r.subcategoryName">
          <dt>Подкатегория</dt>
          <dd>{{ r.subcategoryName }}</dd>
        </div>
        <div>
          <dt>Дата</dt>
          <dd>{{ dateLabel(r.dueDate) }}</dd>
        </div>
      </dl>
      <p
        v-if="r.placement?.description && r.placement.description !== r.title"
        class="request-comment"
      >
        {{ r.placement.description }}
      </p>
      <p
        v-if="r.authorComment && r.authorComment !== r.comment"
        class="request-comment"
      >
        <strong>Комментарий сотрудника:</strong> {{ r.authorComment }}
      </p>
      <dl
        v-if="accountForecast && !r.operationId"
        class="request-account-balances"
      >
        <div>
          <dt>Сейчас на счёте</dt>
          <dd>{{ money(accountForecast.balanceCents) }}</dd>
        </div>
        <div>
          <dt>После этой заявки</dt>
          <dd>{{ money(accountForecast.balanceCents - r.amountCents) }}</dd>
        </div>
        <div>
          <dt>С учётом всех заявок</dt>
          <dd>{{ money(accountForecast.afterRequestsCents) }}</dd>
        </div>
      </dl>
      <p v-if="r.comment" class="request-comment">{{ r.comment }}</p>
      <button
        v-if="r.sourceFileId"
        type="button"
        @click="emit('file', { fileId: r.sourceFileId, name: 'Счёт.pdf' })"
      >
        Открыть PDF-счёт
      </button>
      <div class="request-actions">
        <button
          v-if="canDelete"
          type="button"
          :disabled="chat.busy"
          class="request-delete"
          @click="emit('delete', r)"
        >
          Удалить заявку
        </button>
        <template v-if="manager && r.state === 'manager_review'"
          ><button type="button" @click="emit('edit', r)">
            {{
              r.placement ? "Изменить реквизиты" : "Разместить на таймлайне"
            }}</button
          ><button
            v-if="r.placement"
            type="button"
            class="request-send"
            :disabled="chat.busy"
            @click="emit('decision', r, 'approve')"
          >
            Согласовано мной → руководителю</button
          ><button
            type="button"
            :disabled="chat.busy"
            @click="emit('decision', r, 'reject')"
          >
            Отклонить
          </button></template
        ><template
          v-if="chat.me?.role === 'director' && r.state === 'director_review'"
          ><button
            type="button"
            class="request-send"
            :disabled="chat.busy"
            @click="emit('decision', r, 'approve')"
          >
            Согласовать</button
          ><button
            type="button"
            :disabled="chat.busy"
            @click="emit('decision', r, 'reject')"
          >
            Отклонить
          </button></template
        ><button
          v-if="manager && r.state === 'ready' && r.placement"
          type="button"
          class="request-send"
          :disabled="chat.busy"
          @click="emit('convert', r)"
        >
          Записать согласованный расход</button
        ><button
          v-if="
            manager &&
            ['director_review', 'ready', 'rejected'].includes(r.state) &&
            !r.operationId
          "
          type="button"
          :disabled="chat.busy"
          @click="emit('recall', r)"
        >
          Вернуть на доработку
        </button>
      </div>
      <ol class="request-history">
        <li v-for="(h, i) in r.history" :key="i">
          <strong>{{ h.name }}</strong
          ><span
            >{{ chat.me?.roles?.[h.role] }} ·
            {{
              {
                approve: "Согласовано",
                reject: "Отклонено",
                enrich: "Реквизиты заполнены",
                recall: "Возвращено управляющему",
              }[h.action] || h.action
            }}</span
          ><time>{{
            new Date(h.at).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })
          }}</time>
        </li>
      </ol>
    </div>
  </article>
</template>
<style scoped>
.request-card {
  border: 1px solid var(--codex-pane-border);
  border-left: 3px solid var(--codex-pane-danger);
  border-radius: 10px;
  margin-bottom: 12px;
  background: var(--codex-pane-surface);
  overflow: hidden;
}
.request-card[draggable="true"] {
  cursor: grab;
}
.request-card-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  padding: 16px !important;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.request-status,
.request-meta {
  color: var(--codex-pane-muted);
  font-size: 11px;
}
.request-title {
  font-size: 14px;
  line-height: 1.5;
}
.request-money {
  font-size: 20px;
  color: var(--codex-pane-danger);
  font-variant-numeric: tabular-nums;
}
.request-branch {
  display: flex;
  gap: 8px;
  padding: 0 16px 16px;
  margin: 0;
  list-style: none;
  font-size: 10px;
  color: var(--codex-pane-muted);
}
.request-branch li + li::before {
  content: "→";
  margin-right: 8px;
}
.request-branch .current {
  color: var(--codex-pane-text);
  text-decoration: underline;
  text-underline-offset: 4px;
}
.request-branch .complete {
  color: var(--codex-pane-accent);
}
.request-details {
  padding: 0 16px 16px;
  border-top: 1px solid var(--codex-pane-border);
  font-size: 12px;
}
.request-details dl div {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 12px;
  margin: 8px 0;
}
.request-details dt {
  color: var(--codex-pane-muted);
}
.request-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.request-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.request-actions button,
.request-details > button {
  font: inherit;
  color: inherit;
  background: var(--codex-pane-bg);
  border: 1px solid var(--codex-pane-border);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}
.request-actions .request-send {
  background: #b7433b;
  color: white;
  border: 0;
}
.request-comment {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.request-history {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  border-left: 1px solid var(--codex-pane-border);
}
.request-history li {
  padding: 0 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.request-history strong {
  font-weight: 500;
}
.request-history time,
.request-history span {
  font-size: 11px;
  color: var(--codex-pane-muted);
}
</style>
