<script setup>
import { ref } from "vue";
import { teamError, useTeamChatStore } from "@/stores/teamChatStore";
import TeamChatDialog from "./TeamChatDialog.vue";
import UiIcon from "./UiIcon.vue";
const props = defineProps({
  operation: { type: Object, required: true },
  taskId: String,
});
const emit = defineEmits(["close"]);
const chat = useTeamChatStore(),
  busy = ref(false),
  error = ref("");
const id = crypto.randomUUID();
async function send(mode) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (
      !chat.me?.owner ||
      String(chat.me.workspaceId) !== props.operation.workspaceId
    )
      throw Error("Сеанс изменился. Перетащите операцию заново");
    await chat.action("/finance/shares", {
      id,
      operationId: props.operation.id,
      mode,
      ...(props.taskId ? { taskId: props.taskId } : {}),
    });
    emit("close");
  } catch (e) {
    error.value = teamError(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <TeamChatDialog
    title="Перенести операцию"
    :busy="busy"
    @close="emit('close')"
  >
    <div class="operation-drop-options">
      <button type="button" :disabled="busy" @click="send('button')">
        <UiIcon name="external" />Как кнопку</button
      ><button type="button" :disabled="busy" @click="send('table')">
        <UiIcon name="sheet" />Как таблицу
      </button>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </TeamChatDialog>
</template>
<style scoped>
.operation-drop-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 12px max(12px, var(--safe-bottom-controls, 12px));
}
.operation-drop-options button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--codex-pane-text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.operation-drop-options button:hover {
  background: var(--codex-pane-surface-soft);
}
.operation-drop-options .ui-icon {
  width: 18px;
  height: 18px;
}
.operation-drop-options p {
  margin: 8px 0;
  color: var(--codex-pane-danger);
  font-size: 13px;
}
.operation-drop-options button:disabled {
  opacity: 0.5;
}
</style>
