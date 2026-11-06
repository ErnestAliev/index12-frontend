<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useTeamChatStore, teamError } from "@/stores/teamChatStore";
import { useAppearanceStore } from "@/stores/appearanceStore";
import UiIcon from "./UiIcon.vue";
import TeamChatRoleSelect from "./TeamChatRoleSelect.vue";
defineProps({ modelValue: String, setupAvailable: Boolean });
const emit = defineEmits(["update:modelValue", "setup", "logout"]);
const chat = useTeamChatStore(),
  appearance = useAppearanceStore(),
  open = ref(false),
  root = ref(null),
  trigger = ref(null),
  savingRole = ref(false),
  error = ref("");
function outside(e) {
  if (!root.value?.contains(e.target)) open.value = false;
}
function close() {
  open.value = false;
  trigger.value?.focus();
}
async function roleChanged(event) {
  savingRole.value = true;
  error.value = "";
  try {
    await chat.action("/settings", { ownerRole: event.target.value }, "patch");
  } catch (e) {
    event.target.value = chat.me.role;
    error.value = teamError(e);
  } finally {
    savingRole.value = false;
  }
}
function theme() {
  appearance.setMode(appearance.mode === "light" ? "dark" : "light");
  try {
    localStorage.setItem("theme", appearance.mode);
    close();
  } catch {
    error.value = "Не удалось сохранить тему в этом браузере";
  }
}
onMounted(() => document.addEventListener("pointerdown", outside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
</script>
<template>
  <nav class="team-chat-navigation" aria-label="Навигация чата">
    <div class="team-navigation-identity"><slot /></div>
    <div class="team-navigation-section">
      <select
        :value="modelValue"
        aria-label="Раздел чата"
        aria-controls="team-panel"
        @change="emit('update:modelValue', $event.target.value)"
      >
        <option value="messages">Сообщения</option>
        <option value="requests">Заявки</option>
        <option value="tasks">Задачи</option>
        <option v-if="chat.isOwner" value="members">Участники</option></select
      ><UiIcon name="chevron-down" />
    </div>
    <div
      ref="root"
      class="team-navigation-account"
      @keydown.esc.stop.prevent="close"
    >
      <button
        ref="trigger"
        type="button"
        class="team-navigation-menu-trigger"
        aria-label="Меню чата"
        aria-haspopup="dialog"
        :aria-expanded="open"
        @click="open = !open"
      >
        <UiIcon name="menu" />
      </button>
      <section
        v-if="open"
        class="team-navigation-menu"
        role="dialog"
        aria-label="Меню чата"
      >
        <TeamChatRoleSelect
          v-if="chat.me?.owner"
          :value="chat.me.role"
          :roles="chat.me.roles"
          label="Моя роль в чате"
          :disabled="savingRole"
          @change="roleChanged"
        />
        <span v-else class="team-navigation-role">{{
          chat.me?.roles?.[chat.me.role]
        }}</span>
        <button
          v-if="setupAvailable"
          type="button"
          @click="
            open = false;
            emit('setup');
          "
        >
          <UiIcon name="bell" />Уведомления
        </button>
        <button type="button" @click="theme">
          <UiIcon :name="appearance.mode === 'light' ? 'moon' : 'sun'" />{{
            appearance.mode === "light" ? "Тёмная тема" : "Светлая тема"
          }}
        </button>
        <button
          v-if="chat.me && !chat.me.owner"
          type="button"
          @click="
            open = false;
            emit('logout');
          "
        >
          <UiIcon name="logout" />Выйти
        </button>
        <p v-if="error" role="alert">{{ error }}</p>
      </section>
    </div>
  </nav>
</template>
<style scoped>
.team-chat-navigation {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 170px) minmax(44px, 1fr);
  align-items: center;
  flex: 1;
  min-width: 0;
  min-height: 44px;
  box-sizing: border-box;
  color: var(--codex-pane-text);
}
.team-navigation-identity {
  min-width: 0;
  overflow: hidden;
}
.team-navigation-section {
  position: relative;
  justify-self: center;
  width: 100%;
  min-width: 0;
}
.team-navigation-section select {
  appearance: none !important;
  -webkit-appearance: none;
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  border: 0 !important;
  padding: 0 28px 0 12px !important;
  background: transparent !important;
  color: var(--codex-pane-text);
  font: inherit;
  font-size: 13px;
  text-align: center;
  cursor: pointer;
}
.team-navigation-section select option {
  color: var(--codex-pane-text);
  background: var(--codex-pane-surface);
}
.team-navigation-section > .ui-icon {
  position: absolute;
  right: 7px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  pointer-events: none;
}
.team-navigation-account {
  position: relative;
  justify-self: end;
}
.team-chat-navigation .team-navigation-menu-trigger {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.team-navigation-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 70;
  width: min(230px, calc(100vw - 48px));
  max-height: min(420px, calc(100dvh - 100px));
  box-sizing: border-box;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 10px;
  background: var(--codex-pane-surface);
  box-shadow: 0 8px 28px #0003;
}
.team-navigation-menu button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.team-navigation-menu button:hover {
  background: var(--codex-pane-surface-soft);
}
.team-navigation-role {
  display: block;
  padding: 10px;
  font-size: 12px;
  color: var(--codex-pane-muted);
}
.team-navigation-menu :deep(.team-role-select) {
  display: flex;
  max-width: none;
  width: 100%;
}
.team-navigation-menu p {
  margin: 6px;
  color: var(--color-danger, #c65048);
  font-size: 12px;
}
.team-chat-navigation button:focus-visible,
.team-chat-navigation select:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: -2px;
}
@container codex-window (max-width: 350px) {
  .team-chat-navigation {
    grid-template-columns: minmax(0, 1fr) 130px minmax(44px, 1fr);
  }
}
</style>
