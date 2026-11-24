<script setup>
import { computed } from "vue";
import OperationText from "./OperationText.vue";
import UiIcon from "./UiIcon.vue";
import OperationAudit from './OperationAudit.vue';
const props = defineProps({ message: { type: Object, required: true } });
const emit = defineEmits(["open"]);
const share = computed(() => props.message.operationShare);
const amount = computed(
  () => share.value.rows.find((row) => row.label === "Сумма")?.value || "",
);
</script>
<template>
  <div class="operation-share">
    <button
      v-if="share.mode === 'button'"
      class="operation-share-button"
      type="button"
      @pointerdown.stop
      @click.stop="emit('open', message._id)"
    >
      <span>{{ share.title }}</span
      ><strong>{{ amount }}</strong
      ><UiIcon name="chevron-right" />
    </button>
    <template v-else>
      <strong class="operation-share-title">{{ share.title }}</strong>
      <table
        class="operation-share-table"
        aria-label="Поля операции"
        data-fragment-source
      >
        <tbody>
          <tr v-for="row in share.rows" :key="row.label" :data-field="row.label">
            <th scope="row">{{ row.label }}</th>
            <td><OperationText :text="row.value || '—'" :workspace-id="message.workspaceId" /></td>
          </tr>
        </tbody>
      </table>
    </template>
    <OperationAudit v-if="message._id" :operation-id="share.operationId" :message-id="message._id" />
  </div>
</template>
<style scoped>
.operation-share {
  min-width: 0;
  max-width: 100%;
  padding: 6px 0 2px;
  font-size: 13px;
}
.operation-share-button {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 8px;
  background: transparent;
  color: var(--codex-pane-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.operation-share-button strong {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  min-width: 0;
  overflow-wrap: anywhere;
}
.operation-share-button > .ui-icon {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--codex-pane-muted);
}
.operation-share-button:hover {
  background: var(--codex-pane-surface-soft);
}
.operation-share-button:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 2px;
}
.operation-share-title {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}
.operation-share-button, .operation-share-title, .operation-share-table tr[data-field="Сумма"] > * { color: var(--team-operation-color, var(--codex-pane-text)); }
.operation-share-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
  line-height: 1.45;
  user-select: text;
  -webkit-user-select: text;
}
.operation-share-table th,
.operation-share-table td {
  padding: 6px 8px;
  vertical-align: top;
  text-align: left;
  border-bottom: 1px solid var(--codex-pane-border);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  user-select: text;
  -webkit-user-select: text;
}
.operation-share-table th {
  width: 40%;
  font-weight: 400;
  color: var(--codex-pane-muted);
  padding-left: 0;
}
.operation-share-table td {
  padding-right: 0;
}
.operation-share-table tr:last-child > * {
  border-bottom: 0;
}
</style>
