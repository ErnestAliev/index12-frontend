<script setup>
import { computed } from "vue";
import { useTeamChatStore } from "@/stores/teamChatStore";
import UiIcon from "./UiIcon.vue";
import { taskDate } from "@/utils/teamTasks";
const props = defineProps({ taskId: String });
const emit = defineEmits(["open"]);
const chat = useTeamChatStore();
const task = computed(() =>
  chat.state.tasks?.find((t) => t._id === props.taskId),
);
async function done(event) {
  event.stopPropagation();
  if (
    !task.value ||
    chat.busy ||
    (!chat.me.owner &&
      task.value.creatorId !== chat.me.actorId &&
      !task.value.assigneeIds.includes(chat.me.actorId))
  )
    return;
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
    /* Store displays the server error. */
  }
}
</script>
<template>
  <button
    class="task-cover"
    :class="{ completed: task?.status === 'done', unread: task?.unreadCount }"
    :data-status="task?.status"
    @click="emit('open')"
  >
    <template v-if="task">
      <span class="task-cover-text" :class="{ preview: task.latest }">{{
        task.description
      }}</span>
      <span v-if="task.latest && task.status !== 'done'" class="task-preview"
        >{{ task.latest.authorName }}:
        {{ task.latest.text || task.latest.attachments?.[0]?.name }}</span
      >
      <span class="task-cover-footer">
        <span class="task-cover-person">{{
          task.assignees.map((p) => p.name).join(", ")
        }}</span>
        <span>{{ taskDate(task) }}</span>
        <span v-if="task.attachments.length" class="task-count"
          ><UiIcon name="attach" />{{ task.attachments.length }}</span
        >
        <span v-if="task.mentioned" class="task-mention">@</span>
        <span
          v-if="task.unreadCount"
          class="task-unread"
          :aria-label="`${task.unreadCount} непрочитанных сообщений`"
          >{{ task.unreadCount }}</span
        >
        <span
          role="checkbox"
          :aria-checked="task.status === 'done'"
          tabindex="0"
          class="task-check"
          aria-label="Готово"
          @click="done"
          @keydown.enter.prevent="done"
          @keydown.space.prevent="done"
          >{{ task.status === "done" ? "✓" : "" }}</span
        >
      </span>
    </template>
    <span v-else>Задача</span>
  </button>
</template>
<style scoped>
.task-cover {
  width: 100%;
  height: 92px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--codex-pane-border);
  border-left: 3px solid var(--color-primary, #3b6763);
  border-radius: 10px;
  background: var(--codex-pane-surface);
  color: var(--codex-pane-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.task-cover.unread {
  background: color-mix(
    in srgb,
    var(--color-primary, #3b6763) 9%,
    var(--codex-pane-surface)
  );
}
.task-cover-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 20px;
  height: 40px;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.task-cover-text.preview {
  height: 20px;
  -webkit-line-clamp: 1;
}
.task-preview {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  height: 20px;
  color: var(--codex-pane-muted);
}
.task-cover-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 11px;
  color: var(--codex-pane-muted);
  white-space: nowrap;
  margin-top: auto;
}
.task-cover-person {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: auto;
}
.task-count {
  display: flex;
  align-items: center;
  gap: 2px;
}
.task-count .ui-icon {
  width: 14px;
  height: 14px;
}
.task-unread {
  border-radius: 10px;
  background: var(--color-primary, #3b6763);
  color: #fff;
  min-width: 18px;
  text-align: center;
  font-size: 11px;
}
.task-mention {
  font-weight: 600;
  color: var(--color-primary, #3b6763);
}
.task-check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 50%;
  display: grid;
  place-items: center;
}
.task-check:focus-visible {
  outline: 2px solid currentColor;
}
.task-cover.completed {
  height: 44px;
  flex-direction: row;
  align-items: center;
  border-left-color: var(--codex-pane-border);
  opacity: 0.65;
  gap: 8px;
}
.completed .task-cover-text {
  height: auto;
  display: block;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
  font-size: 12px;
}
.completed .task-cover-footer {
  margin: 0;
}
.completed .task-cover-person,
.completed .task-cover-footer > span:nth-child(2),
.completed .task-count {
  display: none;
}
.task-cover[data-status="delayed"] {
  border-left-color: var(--color-danger, #c65048);
}
</style>
