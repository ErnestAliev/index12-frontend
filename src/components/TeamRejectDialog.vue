<script setup>
import { ref } from "vue";
import TeamChatDialog from "./TeamChatDialog.vue";
defineProps({ busy: Boolean, error: String });
const emit = defineEmits(["close", "submit"]),
  reason = ref("");
</script>
<template>
  <TeamChatDialog title="Причина отклонения" :busy="busy" @close="emit('close')"
    ><form
      class="team-reject-form"
      @submit.prevent="emit('submit', reason.trim())"
    >
      <textarea
        v-model="reason"
        aria-label="Причина отклонения"
        placeholder="Почему отклонено"
        required
        maxlength="1000"
        rows="4"
        autofocus
      ></textarea>
      <p v-if="error" role="alert">{{ error }}</p>
      <button :disabled="busy || !reason.trim()">Отклонить</button>
    </form></TeamChatDialog
  >
</template>
<style scoped>
.team-reject-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow-y: auto;
  min-height: 0;
}
.team-reject-form textarea {
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-height: 88px;
  padding: 10px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 7px;
  background: var(--codex-pane-surface);
  color: var(--codex-pane-text);
  font:
    16px/1.4 system-ui,
    sans-serif;
  resize: vertical;
}
.team-reject-form button {
  min-height: 44px;
  border: 1px solid var(--color-danger, #c65048);
  border-radius: 7px;
  background: var(--color-danger, #c65048);
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.team-reject-form button:disabled {
  opacity: 0.5;
}
.team-reject-form p {
  color: var(--color-danger, #c65048);
  margin: 0;
  font-size: 12px;
}
</style>
