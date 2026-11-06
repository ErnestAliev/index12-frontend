<script setup>
import { useTeamChatStore } from "@/stores/teamChatStore";
import TeamChatNavigation from "./TeamChatNavigation.vue";
defineProps({ setupAvailable: Boolean });
const emit = defineEmits(["logout", "setup"]);
const chat = useTeamChatStore();
</script>
<template>
  <TeamChatNavigation
    v-model="chat.tab"
    class="team-heading"
    :setup-available="setupAvailable"
    @setup="emit('setup')"
    @logout="emit('logout')"
  >
    <span class="team-heading-identity">
      <span class="team-heading-name" :title="chat.me?.displayName">{{
        chat.me?.displayName || "Чат"
      }}</span>
    </span>
  </TeamChatNavigation>
</template>
<style scoped>
:global(#team-chat-public .codex-close),
:global(#team-chat-window .codex-close) {
  flex: none;
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
}
.team-heading-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
}
.team-heading-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 500;
}
</style>
