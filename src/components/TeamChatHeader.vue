<script setup>
import { useTeamChatStore } from "@/stores/teamChatStore";
import TeamChatNavigation from "./TeamChatNavigation.vue";
const emit = defineEmits(["close"]);
const chat = useTeamChatStore();
</script>
<template>
  <TeamChatNavigation
    v-model="chat.tab"
    class="team-heading"
    @close="emit('close')"
  >
    <span class="team-heading-name" :title="chat.me?.displayName">{{
      chat.me?.displayName || "Чат"
    }}</span>
  </TeamChatNavigation>
</template>
<style scoped>
.team-heading-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 500;
}
</style>
