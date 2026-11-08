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
import TeamChatMembers from "./TeamChatMembers.vue";
defineProps({ mobile: Boolean });
const chat = useTeamChatStore();
const panelOpen = computed(
  () =>
    chat.creatingTask ||
    chat.requestedTaskId ||
    chat.taskNotifications ||
    chat.tab === "tasks",
);
function startTask() {
  chat.creatingTask = true;
  chat.requestedTaskId = null;
}
function closePanel() {
  chat.creatingTask = false;
  chat.requestedTaskId = null;
  chat.requestedTaskMessageId = null;
  chat.taskNotifications = false;
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
      @new="startTask"
    />
    <TeamTaskPanel
      v-if="panelOpen"
      :mobile="mobile"
      :creating="chat.creatingTask"
      :task-id="chat.requestedTaskId"
      :notifications="chat.taskNotifications"
      @close="closePanel"
      @created="
        chat.creatingTask = false;
        chat.tab = 'messages';
      "
      @new="startTask"
    />
    <div
      v-if="chat.tab === 'members' && chat.isOwner && !panelOpen"
      class="team-scroll"
    >
      <TeamChatMembers />
    </div>
    <TeamChatSearchBar ref="searchBar" />
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
