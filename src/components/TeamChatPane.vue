<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import TeamChatSearchBar from "./TeamChatSearchBar.vue";
import { useTeamChatSearchStore } from "@/stores/teamChatSearchStore";
const search = useTeamChatSearchStore(),
  searchBar = ref(null);
let clearSearchFocus;
import { useTeamChatStore } from "@/stores/teamChatStore";
import TeamChatConversation from "./TeamChatConversation.vue";
import TeamTaskPanel from "./TeamTaskPanel.vue";
import TeamChatAccess from "./TeamChatAccess.vue";
import TeamChatMcp from './TeamChatMcp.vue';
defineProps({ mobile: Boolean });
const chat = useTeamChatStore();
const panelOpen = computed(
  () =>
    chat.creatingTask ||
    chat.requestedTaskId ||
    chat.taskNotifications ||
    chat.tab === "tasks",
);
function startTask(parentTaskId = null) {
  chat.creatingTaskParentId = parentTaskId;
  chat.creatingTask = true;
  chat.requestedTaskId = null;
}
function closePanel() {
  const parentTaskId = chat.creatingTask
    ? chat.creatingTaskParentId
    : chat.state.tasks.find(t => t._id === chat.requestedTaskId)?.parentTaskId;
  chat.creatingTask = false;
  chat.creatingTaskParentId = null;
  chat.requestedTaskId = parentTaskId || null;
  chat.requestedTaskMessageId = null;
  chat.taskNotifications = false;
}
function createdTask(task) {
  chat.creatingTask = false;
  chat.creatingTaskParentId = null;
  chat.requestedTaskMessageId = null;
  chat.requestedTaskId = task.parentTaskId || null;
  chat.tab = "messages";
}
function notification(event) {
  const data = event.data;
  if (
    data?.type === "team:refresh" &&
    data.workspaceId === chat.me?.workspaceId &&
    /^[a-f\d-]{36}$/i.test(data.taskId || "")
  ) {
    chat.requestedTaskMessageId = /^[a-f\d-]{36}$/i.test(data.messageId || "")
      ? data.messageId
      : null;
    chat.requestedTaskId = data.taskId;
    chat.show();
  }
}
onMounted(() => {
  clearSearchFocus = search.registerFocus(() => searchBar.value?.focus());
  navigator.serviceWorker?.addEventListener("message", notification);
  const query = new URLSearchParams(location.search);
  if (query.has("task"))
    notification({
      data: {
        type: "team:refresh",
        workspaceId: chat.me?.workspaceId,
        taskId: query.get("task"),
        messageId: query.get("message"),
      },
    });
});
onBeforeUnmount(() => {
  clearSearchFocus?.();
  navigator.serviceWorker?.removeEventListener("message", notification);
});
</script>
<template>
  <div
    class="team-pane team-workspace"
    :class="{ 'team-searching': search.open }"
    style="position: relative"
  >
    <TeamChatConversation
      v-if="chat.me?.status === 'active'"
      v-show="!panelOpen && chat.tab === 'messages'"
      :mobile="mobile"
      :active="!panelOpen && chat.tab === 'messages'"
      :target-message-id="chat.requestedMessageId"
      @new="startTask"
    />
    <TeamTaskPanel
      v-if="panelOpen"
      :mobile="mobile"
      :creating="chat.creatingTask"
      :parent-task-id="chat.creatingTaskParentId"
      :task-id="chat.requestedTaskId"
      :notifications="chat.taskNotifications"
      @close="closePanel"
      @created="createdTask"
      @new="startTask"
    />
    <div
      v-if="chat.tab === 'members' && chat.isOwner && !panelOpen"
      class="team-scroll"
    >
      <TeamChatAccess />
    </div>
    <TeamChatSearchBar ref="searchBar" />
    <div v-if="chat.tab === 'mcp' && !chat.isOwner && !panelOpen" class="team-scroll"><TeamChatMcp /></div>
  </div>
</template>
<style scoped src="./teamChat.css"></style>

<style scoped>
.team-searching :deep(.task-panel) {
  position: relative;
  inset: auto;
  flex: 1;
}
</style>
