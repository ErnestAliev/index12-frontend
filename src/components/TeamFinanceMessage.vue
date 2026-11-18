<script setup>
import { computed } from "vue";
import TeamApprovalMessage from "./TeamApprovalMessage.vue";
const props = defineProps({ message: { type: Object, required: true } });
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
    <div class="finance-heading">
      <strong>{{ title }}</strong
      ><strong class="finance-amount">{{ money }}</strong>
    </div>
    <p class="finance-account">{{ operation.accounts.join(" → ") }}</p>
    <p v-if="operation.partyName">{{ operation.partyName }}</p>
    <p v-if="operation.description">{{ operation.description }}</p>
    <p v-if="operation.comment">{{ operation.comment }}</p>
    <p class="finance-meta">
      {{
        [date, operation.projectNames?.join(", "), operation.categoryName]
          .filter(Boolean)
          .join(" · ")
      }}
    </p>
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
