<script setup>
import { computed, nextTick, ref } from "vue";
import UiIcon from "./UiIcon.vue";
import { useInputModality } from "@/composables/useInputModality";
const props = defineProps({
  serverUrl: { type: String, required: true },
  pluginUrl: { type: String, default: "" },
});
const chatGptUrl = "https://chatgpt.com/plugins";
const keyboard = useInputModality(),
  pending = ref(false),
  notice = ref(""),
  error = ref(""),
  manual = ref(false),
  fallback = ref(null);
const shareAvailable = typeof navigator.share === "function";
const message = computed(() =>
  props.pluginUrl
    ? `Подключить INDEX12 к ChatGPT\n${props.pluginUrl}\nУстановите плагин и войдите под своим логином сотрудника INDEX12.`
    : `Подключить INDEX12 к ChatGPT\n1. На компьютере откройте ${chatGptUrl}\n2. Добавить → Добавить пользовательский сервер MCP.\nНазвание: INDEX12\nURL сервера: ${props.serverUrl}\nАутентификация: OAuth\n3. Создайте плагин и войдите под своим логином сотрудника INDEX12. Если появится кнопка установки — нажмите её.`,
);
async function copy() {
  try {
    if (!navigator.clipboard?.writeText) throw Error("Clipboard unavailable");
    await navigator.clipboard.writeText(message.value);
    manual.value = false;
    notice.value = "Сообщение скопировано";
  } catch {
    manual.value = true;
    error.value = "Выделите сообщение и скопируйте его.";
    await nextTick();
    fallback.value?.focus({ preventScroll: true });
    fallback.value?.select();
  }
}
async function transfer() {
  if (pending.value) return;
  pending.value = true;
  notice.value = "";
  error.value = "";
  manual.value = false;
  try {
    const data = { title: "Подключить INDEX12", text: message.value };
    if (shareAvailable && (!navigator.canShare || navigator.canShare(data))) {
      await navigator.share(data);
    } else await copy();
  } catch (exception) {
    if (exception.name !== "AbortError") await copy();
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <div class="mcp-setup" :class="{ 'keyboard-navigation': keyboard }">
    <p>Отправьте себе и откройте на компьютере.</p>
    <template v-if="!pluginUrl">
      <a :href="chatGptUrl" target="_blank" rel="noopener noreferrer"
        >Плагины ChatGPT<UiIcon name="external"
      /></a>
      <p class="setup-path">Добавить → Добавить пользовательский сервер MCP</p>
      <dl>
        <div>
          <dt>Название</dt>
          <dd>INDEX12</dd>
        </div>
        <div>
          <dt>URL сервера</dt>
          <dd class="setup-address">{{ serverUrl }}</dd>
        </div>
        <div>
          <dt>Аутентификация</dt>
          <dd>OAuth</dd>
        </div>
      </dl>
      <p>Создайте плагин и войдите под своим логином INDEX12.</p>
    </template>
    <a
      v-else
      class="mcp-install"
      :href="pluginUrl"
      target="_blank"
      rel="noopener noreferrer"
      >Подключить ChatGPT<UiIcon name="external"
    /></a>
    <button
      type="button"
      class="setup-transfer"
      :disabled="pending"
      @click="transfer"
    >
      <UiIcon :name="shareAvailable ? 'share' : 'copy'" />{{
        shareAvailable ? "Поделиться" : "Скопировать сообщение"
      }}
    </button>
    <textarea
      v-if="manual"
      ref="fallback"
      :value="message"
      readonly
      rows="9"
      aria-label="Сообщение для подключения"
      @focus="$event.target.select()"
    />
    <p v-if="notice" role="status" class="setup-notice">{{ notice }}</p>
    <p v-if="error" role="alert" class="setup-error">{{ error }}</p>
  </div>
</template>
<style scoped>
.mcp-setup {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
}
p,
dl,
dd {
  margin: 0;
}
.mcp-setup > p:first-child,
.setup-path,
dt {
  color: var(--codex-pane-muted);
}
a {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  min-height: 44px;
  color: inherit;
  text-underline-offset: 3px;
  overflow-wrap: anywhere;
}
.ui-icon {
  width: 16px;
  height: 16px;
  flex: none;
}
dl {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
dl > div {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
}
dd {
  min-width: 0;
  overflow-wrap: anywhere;
  user-select: text;
  -webkit-user-select: text;
}
.setup-address {
  grid-column: 1/-1;
  margin-top: -4px;
}
.setup-transfer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  width: 100%;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--codex-pane-accent);
  color: var(--codex-pane-send-text);
  font: inherit;
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
}
.setup-transfer:disabled {
  opacity: 0.5;
  cursor: default;
}
textarea {
  box-sizing: border-box;
  resize: vertical;
  min-height: 180px;
  width: 100%;
  border: 1px solid var(--codex-pane-border);
  border-radius: 6px;
  padding: 8px;
  background: var(--codex-pane-surface);
  color: var(--codex-pane-text);
  font: inherit;
  user-select: text;
  -webkit-user-select: text;
}
.setup-notice {
  color: var(--codex-pane-accent);
  font-size: 12px;
}
.setup-error {
  color: var(--codex-pane-danger);
  font-size: 12px;
}
button:focus,
textarea:focus {
  outline: none;
}
.keyboard-navigation button:focus-visible,
.keyboard-navigation a:focus-visible,
.keyboard-navigation textarea:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 2px;
}
</style>
