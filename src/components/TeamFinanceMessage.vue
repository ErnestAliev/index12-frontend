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
const date = computed(() =>
  operation.value.date?.split("-").reverse().join("."),
);
</script>
<template>
  <div class="team-finance-message" :data-operation-type="operation.type">
    <button type="button" class="finance-open" :aria-label="`Открыть операцию: ${title}`" @pointerdown.stop @click.stop="emit('open', message._id)">
    <span class="finance-heading">
      <strong>{{ title }}</strong
      ><strong class="finance-amount">{{ money }}</strong>
      <UiIcon name="chevron-right" />
    </span>
    <span class="finance-account">{{ operation.accounts.join(" → ") }}</span>
    <span v-if="operation.partyName">{{ operation.partyName }}</span>
    <span v-if="operation.description">{{ operation.description }}</span>
    <span v-if="operation.comment">{{ operation.comment }}</span>
    <span class="finance-meta">
      {{
        [date, operation.projectNames?.join(", "), operation.categoryName]
          .filter(Boolean)
          .join(" · ")
      }}
    </span>
    <span v-if="operation.unavailable" class="finance-meta">Операция удалена или недоступна</span>
    </button>
    <OperationAudit :audit="operation.audit || { createdAt: message.createdAt, createdByName: message.authorName }" />
    <TeamApprovalMessage v-if="message.approvalRequest" :message="message" />
  </div>
</template>
<style scoped>
.team-finance-message {
  min-width: 0;
  width: 290px;
  max-width: 100%;
  padding: 7px 0 3px;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.finance-open { display: block; width: 100%; min-height: 44px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.finance-open > span:not(.finance-heading) { display: block; margin: 4px 0; line-height: 1.4; white-space: pre-wrap; }
.finance-open:focus-visible { outline: 2px solid var(--codex-pane-focus); outline-offset: 3px; }
.finance-heading > strong:first-child { flex: 1; }
.finance-heading > .ui-icon { color: var(--codex-pane-muted); }
.finance-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  font-size: 14px;
}
.finance-heading strong {
  font-weight: 500;
}
.finance-amount {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
p {
  margin: 4px 0;
  line-height: 1.4;
  white-space: pre-wrap;
}
.finance-account,
.finance-meta {
  color: var(--codex-pane-muted);
  font-size: 12px;
}
[data-operation-type="income"] .finance-amount {
  color: var(--codex-pane-accent);
}
</style>
