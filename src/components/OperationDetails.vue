<script setup>
import { computed, ref } from "vue";
import { useOperationStore } from "@/composables/useOperationStore";
import { operationTaskIds } from "@/utils/operationTasks";
import OperationTaskLink from "./OperationTaskLink.vue";
import OperationText from "./OperationText.vue";
import UiIcon from "./UiIcon.vue";
const props = defineProps({
  modelValue: { type: String, default: "" },
  operation: Object,
  disabled: Boolean,
});
const emit = defineEmits(["update:modelValue", "navigate"]);
const store = useOperationStore();
const workspaceId = computed(
  () =>
    String(
      props.operation?.workspaceId || store.user?.currentWorkspaceId || "",
    ) || undefined,
);
const expanded = ref(false),
  editing = ref(false);
const tasks = computed(() =>
  operationTaskIds({ ...props.operation, description: props.modelValue }),
);
</script>
<template>
  <div class="operation-details">
    <div class="operation-details-tools">
      <button
        type="button"
        class="operation-details-toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <UiIcon :name="expanded ? 'chevron-up' : 'chevron-down'" />Описание
      </button>
      <div class="operation-details-tasks">
        <OperationTaskLink
          v-for="id in tasks"
          :key="id"
          :task-id="id"
          :workspace-id="workspaceId"
          @navigate="emit('navigate')"
        />
      </div>
    </div>
    <div v-if="expanded" class="operation-details-body">
      <template v-if="!editing"
        ><p>
          <OperationText
            :text="modelValue || '—'"
            :workspace-id="workspaceId"
            @navigate="emit('navigate')"
          />
        </p>
        <button
          v-if="!disabled"
          type="button"
          class="operation-description-edit"
          aria-label="Изменить описание"
          title="Изменить описание"
          @click="editing = true"
        >
          <UiIcon name="edit" /></button
      ></template>
      <textarea
        v-else
        :value="modelValue"
        aria-label="Описание операции"
        placeholder="Описание"
        maxlength="10000"
        rows="3"
        @input="emit('update:modelValue', $event.target.value)"
      />
    </div>
  </div>
</template>
<style scoped>
.operation-details {
  margin: 0 0 6px;
  min-width: 0;
}
.operation-details-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
}
.operation-details-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 36px;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--color-text-soft);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.operation-details-toggle .ui-icon {
  width: 14px;
  height: 14px;
}
.operation-details-tasks {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.operation-details-body {
  position: relative;
  display: flex;
  gap: 8px;
  min-width: 0;
  padding: 6px 0 10px;
}
.operation-details-body p {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  max-height: 144px;
  overflow-y: auto;
  overscroll-behavior: contain;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--color-text);
}
.operation-description-edit {
  display: grid;
  place-items: center;
  align-self: flex-start;
  flex: none;
  width: 32px;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-soft);
  cursor: pointer;
}
.operation-description-edit .ui-icon {
  width: 15px;
  height: 15px;
}
.operation-details-body textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  max-height: 160px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
  resize: vertical;
}
</style>
