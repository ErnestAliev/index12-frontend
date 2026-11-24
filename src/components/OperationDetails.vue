<script setup>
import { computed } from 'vue';
import { useOperationStore } from '@/composables/useOperationStore';
import { operationTaskIds } from '@/utils/operationTasks';
import OperationTaskLink from './OperationTaskLink.vue';
import OperationHistory from './OperationHistory.vue';
const props = defineProps({ modelValue: { type: String, default: '' }, operation: Object, disabled: Boolean });
const emit = defineEmits(['update:modelValue', 'navigate']);
const store = useOperationStore();
const workspaceId = computed(() => String(props.operation?.workspaceId || store.user?.currentWorkspaceId || '') || undefined);
const tasks = computed(() => operationTaskIds({ ...props.operation, description: props.modelValue }));
</script>
<template>
  <div class="operation-details">
    <textarea :value="modelValue" :readonly="disabled" aria-label="Описание операции" placeholder="Описание" maxlength="10000" rows="2" @input="emit('update:modelValue', $event.target.value)" />
    <div v-if="operation?._id || operation?.id || tasks.length" class="operation-details-tools">
      <OperationHistory :operation="operation" />
      <div class="operation-details-tasks"><OperationTaskLink v-for="id in tasks" :key="id" :task-id="id" :workspace-id="workspaceId" @navigate="emit('navigate')" /></div>
    </div>
  </div>
</template>
<style scoped>
.operation-details { margin: 0 0 6px; min-width: 0; }
.operation-details textarea { display: block; box-sizing: border-box; width: 100%; min-height: 64px; max-height: 160px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-background-soft); color: var(--color-text); font: inherit; font-size: 13px; font-weight: 400; line-height: 1.45; resize: vertical; }
.operation-details textarea::placeholder { color: var(--color-text-soft); opacity: 1; }
.operation-details-tools { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.operation-details-tasks { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
</style>
