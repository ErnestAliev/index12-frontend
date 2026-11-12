<script setup>
import { computed, nextTick, ref, watch } from "vue";
import UiIcon from "./UiIcon.vue";
import { useInputModality } from "@/composables/useInputModality";
const props = defineProps({
  step: { type: Number, default: 0 },
  mobile: Boolean,
  serverUrl: { type: String, required: true },
  chatUrl: String,
  busy: Boolean,
});
const emit = defineEmits(["next", "back", "check"]);
const keyboard = useInputModality(),
  heading = ref(null),
  field = ref(null),
  link = ref(null),
  pluginLink = ref(null),
  notice = ref(""),
  error = ref(""),
  sharing = ref(false);
const steps = [
  {
    title: "Откройте чат на компьютере",
    text: "Отправьте себе ссылку и войдите под своим логином INDEX12.",
  },
  {
    title: "Откройте плагины ChatGPT",
    text: "На компьютере войдите в свой аккаунт ChatGPT, если потребуется.",
  },
  {
    title: "Нажмите кнопку «Добавить»",
    text: "Чёрная кнопка в правом верхнем углу страницы ChatGPT.",
  },
  { title: "Выберите «Добавить пользовательский сервер MCP»" },
  {
    title: "Вставьте название",
    text: "Скопируйте значение в поле «Название» в ChatGPT.",
  },
  {
    title: "Вставьте URL-адрес сервера",
    text: "Скопируйте адрес в поле «Подключение» в ChatGPT.",
  },
  {
    title: "Создайте плагин",
    text: "Отметьте «Я понимаю и хочу продолжить» и нажмите «Создать в виде плагина».",
  },
  {
    title: "Войдите в INDEX12",
    text: "Введите свой логин и пароль сотрудника. Подтвердите доступ.",
  },
  {
    title: "Установите плагин",
    text: "Нажмите «Установить» или «+», если ChatGPT предлагает установку.",
  },
];
const current = computed(() =>
  props.step === 9
    ? {
        title: "Завершите подключение в ChatGPT",
        text: "Когда закончите на компьютере, нажмите «Проверить подключение».",
      }
    : props.step === 0 && !props.mobile
      ? {
          title: "Чат открыт на компьютере",
          text: "Нажмите «Готово», чтобы перейти к подключению ChatGPT.",
        }
      : steps[props.step],
);
const copyValue = computed(() =>
  props.step === 4 ? "INDEX12" : props.serverUrl,
);
async function copy(value, input) {
  notice.value = "";
  error.value = "";
  try {
    if (!navigator.clipboard?.writeText) throw Error("Clipboard unavailable");
    await navigator.clipboard.writeText(value);
    notice.value = "Скопировано";
  } catch {
    input?.focus({ preventScroll: true });
    input?.select();
    error.value = "Выделите значение и скопируйте его.";
  }
}
async function share(value, input) {
  if (sharing.value || !value) return;
  sharing.value = true;
  notice.value = "";
  error.value = "";
  try {
    const data = {
      title: "Подключить INDEX12",
      text: "Откройте на компьютере:\n" + value,
    };
    if (
      typeof navigator.share === "function" &&
      (!navigator.canShare || navigator.canShare(data))
    )
      await navigator.share(data);
    else await copy(value, input);
  } catch (e) {
    if (e?.name !== "AbortError") await copy(value, input);
  } finally {
    sharing.value = false;
  }
}
watch(
  () => props.step,
  async () => {
    notice.value = "";
    error.value = "";
    await nextTick();
    heading.value?.focus({ preventScroll: true });
  },
);
</script>
<template>
  <div
    class="mcp-setup"
    :class="{ 'keyboard-navigation': keyboard }"
    aria-label="Мастер подключения ChatGPT"
  >
    <div class="setup-screen" :key="step">
      <h2 ref="heading" tabindex="-1">{{ current.title }}</h2>
      <p v-if="current.text">{{ current.text }}</p>
      <template v-if="step === 0">
        <button
          v-if="mobile"
          class="setup-primary"
          type="button"
          :disabled="sharing || !chatUrl"
          @click="share(chatUrl, link)"
        >
          <UiIcon name="share" />Подключить на компьютер чат
        </button>
        <div class="setup-value">
          <input
            ref="link"
            :value="chatUrl"
            readonly
            aria-label="Ссылка на ваш чат"
            @focus="$event.target.select()"
          /><button
            class="setup-copy"
            type="button"
            :disabled="!chatUrl"
            aria-label="Скопировать ссылку на чат"
            title="Скопировать ссылку на чат"
            @click="copy(chatUrl, link)"
          >
            <UiIcon name="copy" />
          </button>
        </div>
      </template>
      <template v-else-if="step === 1 && mobile">
        <button
          class="setup-primary"
          type="button"
          :disabled="sharing"
          @click="share('https://chatgpt.com/plugins', pluginLink)"
        >
          <UiIcon name="share" />Отправить ссылку на плагины
        </button>
        <div class="setup-value">
          <input
            ref="pluginLink"
            value="https://chatgpt.com/plugins"
            readonly
            aria-label="Ссылка на плагины ChatGPT"
            @focus="$event.target.select()"
          /><button
            class="setup-copy"
            type="button"
            aria-label="Скопировать ссылку на плагины"
            @click="copy('https://chatgpt.com/plugins', pluginLink)"
          >
            <UiIcon name="copy" />
          </button>
        </div>
      </template>
      <a
        v-else-if="step === 1"
        class="setup-primary"
        href="https://chatgpt.com/plugins"
        target="_blank"
        rel="noopener noreferrer"
        ><UiIcon name="external" />Открыть плагины ChatGPT</a
      >
      <div v-else-if="step === 4 || step === 5" class="setup-value">
        <input
          ref="field"
          :value="copyValue"
          readonly
          :aria-label="
            step === 4 ? 'Название MCP коннектора' : 'URL-адрес сервера MCP'
          "
          @focus="$event.target.select()"
        /><button
          class="setup-copy"
          type="button"
          :aria-label="
            step === 4 ? 'Скопировать название' : 'Скопировать URL сервера'
          "
          :title="
            step === 4 ? 'Скопировать название' : 'Скопировать URL сервера'
          "
          @click="copy(copyValue, field)"
        >
          <UiIcon name="copy" />
        </button>
      </div>
      <p v-if="notice" role="status" class="setup-notice">{{ notice }}</p>
      <p v-if="error" role="alert" class="setup-error">{{ error }}</p>
    </div>
    <footer>
      <button
        v-if="step > 0"
        type="button"
        class="setup-back"
        @click="emit('back')"
      >
        <UiIcon name="back" />Назад
      </button>
      <span v-if="step < 9" class="setup-progress">{{ step + 1 }} / 9</span>
      <button
        class="setup-primary setup-next"
        type="button"
        :disabled="busy"
        @click="emit(step === 9 ? 'check' : 'next')"
      >
        {{
          step === 9
            ? busy
              ? "Проверяем…"
              : "Проверить подключение"
            : "Готово"
        }}
      </button>
    </footer>
  </div>
</template>
<style scoped>
.mcp-setup {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
}
.setup-screen {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
h2,
p {
  margin: 0;
}
h2 {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  outline: none;
}
.ui-icon {
  width: 16px;
  height: 16px;
  flex: none;
}
button,
a {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-decoration: none;
  cursor: pointer;
}
.setup-primary {
  background: var(--codex-pane-accent);
  color: var(--codex-pane-send-text);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.setup-value {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
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
.setup-copy {
  width: 44px;
  flex: none;
  padding: 0;
  background: var(--codex-pane-accent);
  color: var(--codex-pane-send-text);
}
footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.setup-next {
  margin-left: auto;
  min-width: 112px;
}
.setup-back {
  padding-inline: 0 8px;
}
.setup-progress {
  font-size: 12px;
  color: var(--codex-pane-muted);
  white-space: nowrap;
}
.setup-notice {
  color: var(--codex-pane-accent);
}
.setup-error {
  color: var(--codex-pane-danger);
}
.setup-notice,
.setup-error {
  font-size: 12px;
}
input:focus,
button:focus {
  outline: none;
}
.keyboard-navigation :is(a, button, input):focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 2px;
}
@media (max-width: 360px) {
  footer {
    gap: 4px;
  }
  .setup-next {
    min-width: 96px;
    padding-inline: 10px;
  }
}
</style>
