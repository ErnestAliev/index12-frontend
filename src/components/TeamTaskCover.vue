<script setup>
import { computed, ref } from "vue";
import { useTeamChatStore } from "@/stores/teamChatStore";
import { useTaskHold } from "@/composables/useTaskHold";
import UiIcon from "./UiIcon.vue";
import './teamTaskStatus.css';
import TeamSearchText from "./TeamSearchText.vue";
import TeamTaskMenu from "./TeamTaskMenu.vue";
import { taskDate } from "@/utils/teamTasks";
const props = defineProps({
  taskId: String,
  highlight: { type: String, default: "" },
});
const emit = defineEmits(["open"]);
const chat = useTeamChatStore(),
  menu = ref(false),
  touch = ref(false);
const task = computed(() =>
  chat.state.tasks?.find((t) => t._id === props.taskId),
);
const canEdit = computed(
  () =>
    task.value &&
    (chat.me?.owner ||
      task.value.creatorId === chat.me?.actorId ||
      task.value.assigneeIds.includes(chat.me?.actorId)),
);
const hold = useTaskHold((_, fromTouch) => {
  touch.value = fromTouch;
  menu.value = true;
});
async function done() {
  if (!canEdit.value || chat.busy) return;
  try {
    await chat.action(
      `/tasks/${props.taskId}`,
      {
        expectedVersion: task.value.version,
        status: task.value.status === "done" ? "open" : "done",
      },
      "patch",
    );
  } catch {
    /* Store shows server errors. */
  }
}
</script>
<template>
  <div
    v-if="task"
    class="task-cover"
    :class="{ completed: task.status === 'done', unread: task.unreadCount }"
    :data-status="task.status"
    :data-task-status="task.status"
    @pointerdown="hold.down($event, task)"
    @pointermove="hold.move"
    @pointerup="hold.cancel"
    @pointercancel="hold.cancel"
    @click.capture="hold.click"
    @contextmenu="hold.context($event, task)"
    @keydown="hold.keys($event, task)"
  >
    <button
      class="cover-title"
      :class="{ 'has-preview': !!task.latest }"
      @click="emit('open')"
    >
      <span class="cover-title-text"
        >{{ task.status === "done" ? "Готово · " : ""
        }}<TeamSearchText :text="task.description" :query="highlight" /></span
      ><span
        v-if="task.latest && task.status !== 'done'"
        class="cover-inline-preview"
        >{{ task.latest.authorName }}:
        {{ task.latest.text || task.latest.attachments?.[0]?.name }}</span
      >
    </button>
    <div class="cover-footer">
      <span class="cover-details">
        <span class="cover-person">Кому: {{ task.assignees.map((p) => p.name).join(", ") }}</span>
        <span class="cover-due">/ Когда: {{ taskDate(task) }}</span>
      </span><span v-if="task.attachments.length" class="cover-files"
        ><UiIcon name="attach" />{{ task.attachments.length }}</span
      ><button
        class="cover-check"
        role="checkbox"
        :aria-checked="task.status === 'done'"
        :disabled="!canEdit || chat.busy"
        aria-label="Готово"
        @pointerdown.stop
        @click.stop="done"
      >
        <span>{{ task.status === "done" ? "✓" : "" }}</span></button
      ><span v-if="task.mentioned || task.unreadCount" class="cover-attention"
        ><span v-if="task.mentioned" class="mention-badge">@</span
        ><span
          v-if="task.unreadCount"
          class="unread-badge"
          :aria-label="`${task.unreadCount} непрочитанных сообщений`"
          >{{ task.unreadCount }}</span
        ></span
      >
    </div>
    <TeamTaskMenu
      v-if="menu"
      :task="task"
      :suppress-opening-touch="touch"
      @close="menu = false"
      @open="emit('open')"
    />
  </div>
</template>
<style scoped>
.task-cover {
  align-self: stretch;
  flex-shrink: 0;
  width: 100%;
  height: 90px;
  padding: 8px 12px;
  display: grid;
  grid-template-rows: 40px 28px;
  gap: 4px;
  box-sizing: border-box;
  border: 1px solid var(--codex-pane-border);
  border-left: 3px solid color-mix(in srgb, var(--codex-pane-accent, #3b6763) 70%, var(--codex-pane-border)); /* impeccable-disable-line side-tab -- user requests the existing prototype accent, slightly brighter */
  border-radius: 10px;
  background: var(--codex-pane-surface);
  color: var(--codex-pane-text);
  touch-action: pan-y;
  -webkit-touch-callout: none;
  user-select: none;
  min-width: 0;
}
.task-cover.unread {
  border-left-color: var(--codex-pane-accent, #3b6763);
  background: color-mix(
    in srgb,
    var(--codex-pane-accent, #3b6763) 9%,
    var(--codex-pane-surface)
  );
}
.task-cover.unread .cover-title-text,
.task-cover.unread .cover-inline-preview {
  font-weight: 500;
}
.task-cover .cover-title {
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 40px;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  margin: 0;
  text-align: left;
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: none;
  border-radius: 0;
}
.cover-title-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: normal;
}
.cover-title.has-preview .cover-title-text {
  -webkit-line-clamp: 1;
  height: 20px;
}
.cover-inline-preview {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--codex-pane-muted);
  font-size: 12px;
  line-height: 20px;
  height: 20px;
}
.cover-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
  font-size: 12px;
  color: var(--codex-pane-muted);
  line-height: 20px;
}
.cover-details {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.cover-person {
  flex: 0 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cover-due {
  white-space: nowrap;
  flex-shrink: 0;
}
.cover-files {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 12px;
  line-height: 20px;
}
.cover-files .ui-icon {
  width: 14px;
  height: 14px;
}
.task-cover .cover-check {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  min-height: 28px;
  width: 24px;
  padding: 0;
  margin: 0 0 0 1px;
  border: 0;
  background: transparent;
  color: var(--codex-pane-accent, #3b6763);
  cursor: pointer;
}
.cover-check span {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 50%;
  font-size: 13px;
  box-sizing: border-box;
}
.cover-attention {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 20px;
}
.unread-badge {
  display: inline-block;
  min-height: 22px;
  min-width: 22px;
  padding: 1px 5px;
  box-sizing: border-box;
  border-radius: 11px;
  background: var(--codex-pane-accent, #3b6763);
  color: #fff;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
}
.mention-badge {
  font-weight: 500;
  color: var(--codex-pane-accent, #3b6763);
}
.task-cover.completed {
  height: 44px;
  grid-template-rows: none;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  padding: 7px 10px;
  border-left-color: var(--codex-pane-border);
  background: color-mix(
    in srgb,
    var(--codex-pane-muted) 8%,
    var(--codex-pane-bg)
  );
  color: var(--codex-pane-muted);
}
.completed .cover-title {
  height: 24px;
  line-height: 24px;
  font-size: 12px;
}
.completed .cover-title-text {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.completed .cover-footer {
  width: auto;
}
.completed .cover-details,
.completed .cover-person,
.completed .cover-due,
.completed .cover-files {
  display: none;
}
.completed.unread {
  border-left-color: var(--codex-pane-accent, #3b6763);
}
.task-cover[data-status="delayed"] {
  border-left-color: var(--color-danger, #c65048);
}
</style>

<style scoped>
.task-cover[data-status] { border-left-color: var(--task-status-color); }
</style>
