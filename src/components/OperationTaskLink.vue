<script setup>
import { computed } from "vue";
import { useTeamChatStore } from "@/stores/teamChatStore";
import { useOperationStore } from "@/composables/useOperationStore";
import { operationTaskUrl } from "@/utils/operationTasks";
import UiIcon from "./UiIcon.vue";
const props = defineProps({
  taskId: String,
  short: Boolean,
  workspaceId: String,
});
const emit = defineEmits(["navigate"]);
const chat = useTeamChatStore(),
  store = useOperationStore();
const workspaceId = computed(
  () =>
    props.workspaceId || chat.me?.workspaceId || store.user?.currentWorkspaceId,
);
const href = computed(() =>
  operationTaskUrl(props.taskId, workspaceId.value, window.location.pathname),
);
function open(event) {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    !chat.me ||
    chat.me.status !== "active" ||
    String(chat.me.workspaceId) !== String(workspaceId.value)
  )
    return;
  event.preventDefault();
  emit("navigate");
  chat.creatingTask = false;
  chat.taskNotifications = false;
  chat.tab = "messages";
  chat.requestedTaskMessageId = null;
  chat.requestedMessageId = null;
  chat.requestedTaskId = props.taskId;
  chat.show();
}
</script>
<template>
  <a
    v-if="href"
    class="operation-task-link"
    :href="href"
    title="Открыть исходную задачу"
    aria-label="Открыть исходную задачу"
    @pointerdown.stop
    @click.stop="open"
    >{{ short ? taskId.slice(0, 8) + "…" : "Задача"
    }}<UiIcon name="external" /></a
  ><span v-else>{{ short ? taskId : "Задача" }}</span>
</template>
<style scoped>
.operation-task-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  color: var(--codex-pane-accent, var(--color-income, #278f64));
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
  white-space: nowrap;
}
.operation-task-link .ui-icon {
  width: 13px;
  height: 13px;
  flex: none;
}
</style>
