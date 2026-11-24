<script setup>
import { computed, ref } from "vue";
import { useTeamChatStore, teamError } from "@/stores/teamChatStore";
import TeamChatDialog from "./TeamChatDialog.vue";
import UiIcon from "./UiIcon.vue";
import { useOpeningGestureGuard } from "@/composables/useOpeningGestureGuard";
import { teamTaskUrl } from '@/utils/teamDestination';
import { taskDate } from '@/utils/teamTasks';
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
  error = ref(""),
  notice = ref('');
const canDelete = computed(
  () => chat.me?.owner || props.task?.creatorId === chat.me?.actorId,
);
const link = computed(() => teamTaskUrl(chat.me.workspaceId, props.task._id));
const summary = computed(() => [
  `Задача: ${props.task.description}`,
  props.task.creatorName && `От: ${props.task.creatorName}`,
  props.task.assignees?.length && `Кому: ${props.task.assignees.map(person => person.name).join(', ')}`,
  `Когда: ${taskDate(props.task)}`,
].filter(Boolean).join('\n'));
async function writeClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  } catch { /* Older browsers may still support copying from a focused field. */ }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
  // Clipboard fallback must stay inside the modal's focus scope.
  const parent = document.querySelector('dialog[open] .task-actions');
  if (!parent) throw new Error('Не удалось скопировать');
  parent.append(field);
  try {
    field.focus({ preventScroll: true }); field.select(); field.setSelectionRange(0, field.value.length);
    if (!document.execCommand('copy')) throw new Error('Не удалось скопировать');
  } finally { field.remove(); }
}
async function copy(text, message) {
  if (busy.value) return;
  busy.value = true; error.value = notice.value = '';
  try { await writeClipboard(text); notice.value = message; }
  catch { error.value = 'Не удалось скопировать. Попробуйте ещё раз'; }
  finally { busy.value = false; }
}
async function share() {
  if (busy.value) return;
  if (!navigator.share) { await copy(`${summary.value}\n${link.value}`, 'Задача со ссылкой скопирована'); return; }
  error.value = notice.value = '';
  try {
    const sharing = navigator.share({ title: 'Задача', text: summary.value, url: link.value });
    busy.value = true;
    await sharing;
    emit('close');
  } catch (e) { if (e.name !== 'AbortError') error.value = 'Не удалось поделиться. Можно скопировать ссылку'; }
  finally { busy.value = false; }
}
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
    <div class="task-actions" :class="{ confirming: confirm }">
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" class="task-action-notice" role="status">{{ notice }}</p>
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
          Открыть</button>
        <button :disabled="busy" @click="share">Поделиться задачей</button>
        <button :disabled="busy" @click="copy(link, 'Ссылка скопирована')">Копировать ссылку</button>
        <button :disabled="busy" @click="copy(summary + '\n' + link, 'Задача со ссылкой скопирована')">Копировать текст задачи</button>
        <button v-if="canDelete" class="danger" :disabled="busy" @click="remove">
          <UiIcon name="trash" />Удалить
        </button></template
      >
    </div>
  </TeamChatDialog>
</template>
<style scoped>
.task-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}
.task-actions button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  flex: none;
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
.task-actions.confirming { flex-direction: row; flex-wrap: wrap; }
.task-actions.confirming button { flex: 1; justify-content: center; }
.task-actions .task-action-notice { color: var(--codex-pane-muted); }
.task-actions:has(p) {
  flex-wrap: wrap;
}
.task-actions p {
  width: 100%;
  margin: 0;
  font-size: 12px;
}
</style>
