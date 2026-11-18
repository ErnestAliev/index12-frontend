<script setup>
import { computed } from "vue";
import { operationTaskIds } from "@/utils/operationTasks";
import OperationTaskLink from "./OperationTaskLink.vue";
const emit = defineEmits(["navigate"]);
const props = defineProps({ text: String, workspaceId: String });
const parts = computed(() => {
  const text = props.text || "",
    ids = new Set(operationTaskIds({ description: text })),
    parts = [];
  let from = 0;
  for (const match of text.matchAll(
    /[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/gi,
  )) {
    if (!ids.has(match[0])) continue;
    if (match.index > from) parts.push({ text: text.slice(from, match.index) });
    parts.push({ id: match[0] });
    from = match.index + match[0].length;
  }
  if (from < text.length || !parts.length)
    parts.push({ text: text.slice(from) });
  return parts;
});
</script>
<template>
  <template v-for="(part, index) in parts" :key="index"
    ><OperationTaskLink
      v-if="part.id"
      :task-id="part.id"
      :workspace-id="workspaceId"
      short
      @navigate="emit('navigate')"
    /><template v-else>{{ part.text }}</template></template
  >
</template>
