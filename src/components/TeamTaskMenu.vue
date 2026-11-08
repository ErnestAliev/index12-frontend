<script setup>
import { computed, ref } from "vue";
import { useTeamChatStore, teamError } from "@/stores/teamChatStore";
import TeamChatDialog from "./TeamChatDialog.vue";
import UiIcon from "./UiIcon.vue";
import { useOpeningGestureGuard } from "@/composables/useOpeningGestureGuard";
const props = defineProps({
  task: Object,
  confirmOnly: Boolean,
  suppressOpeningTouch: Boolean,
});
const openingGesture = useOpeningGestureGuard(props.suppressOpeningTouch);
const emit = defineEmits(["close", "open", "deleted"]);
const chat = useTeamChatStore(),
  confirm = computed(() => props.confirmOnly),
  busy = ref(false),
  error = ref("");
const canDelete = computed(
  () => chat.me?.owner || props.task?.creatorId === chat.me?.actorId,
);
async function remove() {
  if (busy.value || !canDelete.value) return;
  busy.value = true;
  error.value = "";
  try {
    await chat.action(
      `/tasks/${props.task._id}`,
      { expectedVersion: props.task.version },
      "delete",
    );
    emit("deleted", props.task._id);
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
    @pointerdown.capture="openingGesture.down"
    @pointermove.capture="openingGesture.move"
    @pointercancel.capture="openingGesture.cancel"
    @keydown.capture="openingGesture.keys"
    @click.capture="openingGesture.click"
    :title="confirm ? 'Удалить задачу?' : 'Задача'"
    :busy="busy"
    @close="emit('close')"
  >
    <div class="task-actions">
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="confirm"
        ><button :disabled="busy" @click="emit('close')">Отмена</button
        ><button class="danger" :disabled="busy" @click="remove">
          Удалить
        </button></template
      >
      <template v-else
        ><button
          @click="
            emit('open');
            emit('close');
          "
        >
          Открыть</button
        ><button v-if="canDelete" class="danger" :disabled="busy" @click="remove">
          <UiIcon name="trash" />Удалить
        </button></template
      >
    </div>
  </TeamChatDialog>
</template>
<style scoped>
.task-actions {
  display: flex;
  gap: 8px;
  padding: 12px;
}
.task-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 8px;
  background: var(--codex-pane-surface);
  color: var(--codex-pane-text);
  font: inherit;
  cursor: pointer;
}
.task-actions .danger,
.task-actions p {
  color: var(--color-danger, #c65048);
}
.task-actions:has(p) {
  flex-wrap: wrap;
}
.task-actions p {
  width: 100%;
  margin: 0;
  font-size: 12px;
}
</style>
