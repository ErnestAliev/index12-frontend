<script setup>
import { ref } from "vue";
import { useTeamChatStore, teamError } from "@/stores/teamChatStore";
import UiIcon from "./UiIcon.vue";
import TeamChatRoleSelect from "./TeamChatRoleSelect.vue";
const chat = useTeamChatStore();
const savingRole = ref(false),
  roleError = ref("");
async function changeRole(event) {
  if (!chat.me?.owner || savingRole.value) return;
  savingRole.value = true;
  roleError.value = "";
  try {
    await chat.action("/settings", { ownerRole: event.target.value }, "patch");
  } catch (error) {
    event.target.value = chat.me.role;
    roleError.value = teamError(error);
  } finally {
    savingRole.value = false;
  }
}
defineProps({ setupAvailable: Boolean });
const emit = defineEmits(["logout", "setup"]);
</script>
<template>
  <div class="team-heading">
    <UiIcon name="chat" />
    <span class="team-heading-name">{{ chat.me?.displayName || "Чат" }}</span>
    <TeamChatRoleSelect
      v-if="chat.me?.owner"
      :value="chat.me.role"
      :roles="chat.me.roles"
      label="Моя роль в чате"
      :disabled="savingRole"
      @change="changeRole"
    />
    <span
      v-else-if="chat.me"
      class="team-heading-role"
      :title="`${chat.me.roles?.[chat.me.role] || ''}${chat.me.owner ? ' · Администратор' : ''}`"
      >{{
        chat.me.role === "director"
          ? "Руководитель"
          : chat.me.roles?.[chat.me.role]
      }}</span
    >
    <button
      v-if="setupAvailable"
      type="button"
      class="team-heading-exit"
      aria-label="Установка и уведомления чата"
      title="Установка и уведомления чата"
      @click="emit('setup')"
    >
      <UiIcon name="bell" />
    </button>
    <span v-if="roleError" class="team-heading-error" role="alert">{{
      roleError
    }}</span>
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
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
}
.team-heading-error {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 2;
  max-width: 280px;
  padding: 8px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 6px;
  background: var(--codex-pane-surface);
  color: var(--color-danger, #c65048);
  font-size: 12px;
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
