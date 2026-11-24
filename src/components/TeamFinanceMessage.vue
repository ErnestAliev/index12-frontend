<script setup>
import { computed } from "vue";
import TeamApprovalMessage from "./TeamApprovalMessage.vue";
import OperationAudit from "./OperationAudit.vue";
import UiIcon from "./UiIcon.vue";
const props = defineProps({ message: { type: Object, required: true } });
const emit = defineEmits(['open']);
const operation = computed(() => props.message.financeOperation);
const title = computed(
  () =>
    ({ income: "Доход", expense: "Расход", transfer: "Перевод" })[
      operation.value.type
    ],
);
const money = computed(
  () =>
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
      Math.abs(operation.value.amount),
    ) + " ₸",
);
const rows = computed(() => {
  const op = operation.value;
  const values = new Map((op.rows || []).map(row => [row.label, row.value]));
  const value = (key, fallback = '') => values.has(key) ? values.get(key) : fallback;
  const result = [];
  const add = (key, label, fallback, section = false) => result.push({
    key, label, value: value(key, fallback) || '—', section,
  });
  if (op.type === 'transfer') {
    add('Счёт списания', 'Со счёта', op.accounts?.[0]);
    add('Владелец счёта списания', 'Отправитель');
    add('Счёт зачисления', op.isWithdrawal ? 'Кому' : 'На счёт', op.accounts?.[1]);
    if (!op.isWithdrawal) add('Владелец счёта зачисления', 'Получатель');
  } else {
    add('Счёт', op.type === 'income' ? 'На счёт' : 'Со счёта', op.accounts?.[0]);
    add('Владелец счёта', 'Владелец');
    const party = op.type === 'income' ? 'От кого' : 'Кому';
    add(party, party, op.partyName);
  }
  add('Проект', 'Проект', op.projectNames?.join(', ') || 'Без проекта', true);
  add('Категория', 'Категория', op.categoryName);
  add('Подкатегория', 'Подкатегория');
  add('Комментарий', 'Комментарий', op.comment, true);
  add('Описание', 'Описание', op.description);
  add('Дата', 'Дата', op.date?.slice(0, 10).split('-').reverse().join('.'), true);
  return result;
});
</script>
<template>
  <div class="team-finance-message" :data-operation-type="operation.type">
    <button type="button" class="finance-open" :aria-label="`Открыть операцию: ${title}`" @pointerdown.stop @click.stop="emit('open', message._id)">
    <span class="finance-heading">
      <strong>{{ operation.isWithdrawal ? 'Вывод из системы' : title }}</strong
      ><strong class="finance-amount">{{ money }}</strong>
      <UiIcon name="chevron-right" />
    </span>
    <span class="finance-fields">
      <span v-for="row in rows" :key="row.key" class="finance-row" :class="{ 'section-start': row.section }" :data-field="row.key">
        <span class="finance-label">{{ row.label }}</span>
        <span class="finance-value">{{ row.value }}</span>
      </span>
    </span>
    <span v-if="operation.unavailable" class="finance-meta">Операция удалена или недоступна</span>
    </button>
    <OperationAudit :operation-id="operation.operationId" :message-id="message._id" :audit="operation.audit || { createdAt: message.createdAt, createdByName: message.authorName }" />
    <TeamApprovalMessage v-if="message.approvalRequest" :message="message" />
  </div>
</template>
<style scoped>
.team-finance-message {
  min-width: 0;
  width: 320px;
  max-width: 100%;
  padding: 7px 0 3px;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.team-finance-message .finance-open { display: block; width: 100%; min-height: 44px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.finance-fields { display: grid; gap: 4px; line-height: 1.45; }
.finance-row { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 10px; align-items: baseline; min-width: 0; }
.finance-row.section-start { margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--codex-pane-border); }
.finance-label { color: var(--codex-pane-muted); font-size: 12px; }
.finance-value { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.finance-open:focus-visible { outline: 2px solid var(--codex-pane-focus); outline-offset: 3px; }
.finance-heading > .ui-icon { position: absolute; top: 2px; right: 0; color: var(--codex-pane-muted); }
.finance-heading {
  position: relative;
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
  padding-right: 22px;
  font-size: 14px;
}
.finance-heading strong {
  font-weight: 500;
}
.finance-amount {
  min-width: 0;
  text-align: left;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.finance-meta {
  display: block;
  margin: 6px 0;
  color: var(--codex-pane-muted);
  font-size: 12px;
}
[data-operation-type="income"] .finance-heading,
[data-operation-type="expense"] .finance-heading {
  color: var(--team-operation-color, var(--codex-pane-text));
}
</style>
