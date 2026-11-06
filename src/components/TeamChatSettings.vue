<script setup>
import { ref } from "vue";
import { useTeamChatStore } from "@/stores/teamChatStore";
import { useAppearanceStore } from "@/stores/appearanceStore";
import UiIcon from "./UiIcon.vue";
import TeamChatSetup from "./TeamChatSetup.vue";
defineProps({ inviteToken: String });
const emit = defineEmits(["logout"]);
const chat = useTeamChatStore(),
  appearance = useAppearanceStore(),
  error = ref("");
function theme() {
  appearance.setMode(appearance.mode === "light" ? "dark" : "light");
  try {
    localStorage.setItem("theme", appearance.mode);
  } catch {
    error.value = "Не удалось сохранить тему в этом браузере";
  }
}
</script>
<template>
  <div class="team-chat-settings">
    <button type="button" class="chat-setting-action" @click="theme">
      <UiIcon :name="appearance.mode === 'light' ? 'moon' : 'sun'" />{{
        appearance.mode === "light" ? "Тёмная тема" : "Светлая тема"
      }}
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
    <TeamChatSetup
      v-if="inviteToken"
      inline
      :token="inviteToken"
      :workspace-id="chat.me?.workspaceId"
      :identity="chat.me"
    />
    <button
      v-if="chat.me && !chat.me.owner && inviteToken"
      type="button"
      class="chat-setting-action"
      @click="emit('logout')"
    >
      <UiIcon name="logout" />Выйти
    </button>
  </div>
</template>
<style scoped>
.team-chat-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 440px;
  margin: 0 auto;
}
.team-chat-settings > button.chat-setting-action {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px 12px;
  text-align: left;
  background: var(--codex-pane-surface);
  border: 1px solid var(--codex-pane-border);
  color: var(--codex-pane-text);
}
.team-chat-settings > p {
  color: var(--color-danger, #c65048);
}
</style>
