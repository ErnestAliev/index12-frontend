<script setup>
import { ref } from "vue";
import UiIcon from "./UiIcon.vue";
import { useInputModality } from "@/composables/useInputModality";
defineProps({
  serverUrl: { type: String, required: true },
  pluginUrl: { type: String, default: "" },
});
const keyboard = useInputModality(),
  name = ref(null),
  server = ref(null),
  notice = ref(""),
  error = ref("");
async function copy(value, field) {
  notice.value = "";
  error.value = "";
  try {
    if (!navigator.clipboard?.writeText) throw Error("Clipboard unavailable");
    await navigator.clipboard.writeText(value);
    notice.value = "Скопировано";
  } catch {
    field?.focus({ preventScroll: true });
    field?.select();
    error.value = "Выделите значение и скопируйте его.";
  }
}
</script>
<template>
  <div class="mcp-setup" :class="{ 'keyboard-navigation': keyboard }">
    <a
      class="setup-open"
      :href="pluginUrl || 'https://chatgpt.com/plugins'"
      target="_blank"
      rel="noopener noreferrer"
      ><UiIcon name="external" />Открыть плагины ChatGPT</a
    >
    <template v-if="!pluginUrl">
      <label class="setup-field"
        ><span>Название</span>
        <div>
          <input
            ref="name"
            value="INDEX12"
            readonly
            aria-label="Название MCP коннектора"
            @focus="$event.target.select()"
          /><button
            type="button"
            aria-label="Скопировать название"
            title="Скопировать название"
            @click="copy('INDEX12', name)"
          >
            <UiIcon name="copy" />
          </button></div
      ></label>
      <label class="setup-field"
        ><span>URL-адрес сервера</span>
        <div>
          <input
            ref="server"
            :value="serverUrl"
            readonly
            aria-label="URL-адрес сервера MCP"
            @focus="$event.target.select()"
          /><button
            type="button"
            aria-label="Скопировать URL сервера"
            title="Скопировать URL сервера"
            @click="copy(serverUrl, server)"
          >
            <UiIcon name="copy" />
          </button></div
      ></label>
      <div class="setup-steps">
        <p>
          <strong>Нажмите «Добавить»</strong> — чёрная кнопка справа вверху.
        </p>
        <p>Выберите «Добавить пользовательский сервер MCP».</p>
        <p>Вставьте название и URL-адрес сервера. Описание — необязательно.</p>
      </div>
    </template>
    <p v-if="notice" role="status" class="setup-notice">{{ notice }}</p>
    <p v-if="error" role="alert" class="setup-error">{{ error }}</p>
  </div>
</template>
<style scoped>
.mcp-setup {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
}
p {
  margin: 0;
}
.ui-icon {
  width: 16px;
  height: 16px;
  flex: none;
}
.setup-open {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 6px;
  background: var(--codex-pane-accent);
  color: var(--codex-pane-send-text);
  font: inherit;
  text-decoration: none;
}
.setup-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.setup-field > span {
  color: var(--codex-pane-muted);
}
.setup-field > div {
  display: flex;
  gap: 8px;
  min-width: 0;
  align-items: center;
}
input {
  box-sizing: border-box;
  min-width: 0;
  flex: 1;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 6px;
  background: var(--codex-pane-surface);
  color: var(--codex-pane-text);
  font: inherit;
  user-select: text;
  -webkit-user-select: text;
}
button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 44px;
  min-height: 44px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: var(--codex-pane-accent);
  color: var(--codex-pane-send-text);
  cursor: pointer;
}
.setup-steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.setup-steps strong {
  font-weight: 600;
}
.setup-notice {
  font-size: 12px;
  color: var(--codex-pane-accent);
}
.setup-error {
  font-size: 12px;
  color: var(--codex-pane-danger);
}
input:focus,
button:focus {
  outline: none;
}
.keyboard-navigation :is(a, button, input):focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 2px;
}
</style>
