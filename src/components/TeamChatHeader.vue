<script setup>
import { useTeamChatStore } from "@/stores/teamChatStore";
import UiIcon from "./UiIcon.vue";
const chat = useTeamChatStore();
const emit = defineEmits(["logout"]);
</script>
<template>
  <div class="team-heading">
    <UiIcon name="chat" />
    <span class="team-heading-name">{{ chat.me?.displayName || "Чат" }}</span>
    <span
      v-if="chat.me"
      class="team-heading-role"
      :title="`${chat.me.roles?.[chat.me.role] || ''}${chat.me.owner ? ' · Администратор' : ''}`"
      >{{
        chat.me.role === "director"
          ? "Руководитель"
          : chat.me.roles?.[chat.me.role]
      }}</span
    >
    <button
      v-if="chat.me && !chat.me.owner"
      type="button"
      class="team-heading-exit"
      title="Выйти из чата"
      @click="emit('logout')"
    >
      Выйти
    </button>
  </div>
</template>
<style scoped>
.team-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
}
.team-heading-name {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 500;
}
.team-heading-role {
  flex: none;
  color: var(--codex-pane-muted);
  font-size: 11px;
  white-space: nowrap;
}
.team-heading-exit {
  display: grid;
  place-items: center;
  flex: none;
  min-height: 32px;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--codex-pane-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.team-heading-exit:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 2px;
}
</style>
