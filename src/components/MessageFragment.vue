<script setup>
import { computed, nextTick, ref, onMounted, onBeforeUnmount } from "vue";
import UiIcon from "./UiIcon.vue";
import {
  useMessageSelection,
  clearMessageSelection,
} from "@/composables/useMessageSelection";
import { useInputModality } from "@/composables/useInputModality";
const keyboard = useInputModality();
const props = defineProps({
  submit: { type: Function, required: true },
  disabled: Boolean,
  busy: Boolean,
  version: { type: Number, default: 0 },
});
const emit = defineEmits(["finished"]);
const touch = window.matchMedia("(pointer: coarse)").matches;
const body = ref(null),
  input = ref(null),
  excerpt = ref(""),
  quoteVersion = ref(0),
  occurrence = ref(0),
  comment = ref(""),
  pending = ref(false),
  error = ref("");
const { selection, readSelection } = useMessageSelection();
const selected = computed(() =>
  selection.value?.root === body.value ? selection.value : null,
);
const popupStyle = computed(() => {
  if (!selected.value) return {};
  const view = window.visualViewport,
    rootStyle = getComputedStyle(document.documentElement),
    theme = getComputedStyle(body.value);
  const inset = (edge) =>
    parseFloat(rootStyle.getPropertyValue("--safe-area-" + edge)) || 0;
  const left = (view?.offsetLeft || 0) + inset("left") + 8,
    right =
      (view?.offsetLeft || 0) +
      (view?.width || innerWidth) -
      inset("right") -
      8;
  const top = (view?.offsetTop || 0) + inset("top") + 8,
    bottom =
      (view?.offsetTop || 0) +
      (view?.height || innerHeight) -
      inset("bottom") -
      8;
  const width = Math.min(252, right - left),
    rect = selected.value.rect;
  const style = {
    width: width + "px",
    left: Math.max(left, Math.min(rect.left, right - width)) + "px",
    top:
      Math.max(
        top,
        Math.min(
          rect.top - 58 >= top ? rect.top - 58 : rect.bottom + 8,
          bottom - 54,
        ),
      ) + "px",
  };
  for (const key of [
    "bg",
    "text",
    "border",
    "surface",
    "hover",
    "muted",
    "accent",
    "focus",
    "danger",
  ])
    style["--codex-pane-" + key] = theme.getPropertyValue(
      "--codex-pane-" + key,
    );
  return style;
});
function context(event) {
  readSelection();
  if (selected.value) {
    event.preventDefault();
    event.stopPropagation();
  }
}
async function begin() {
  if (!selected.value || props.disabled || selected.value.text.length > 6000)
    return;
  excerpt.value = selected.value.text;
  occurrence.value = selected.value.occurrence || 0;
  quoteVersion.value = props.version;
  error.value = "";
  clearMessageSelection();
  await nextTick();
  input.value?.scrollIntoView({ block: "nearest" });
  input.value?.focus({ preventScroll: true });
}
async function copy() {
  if (!selected.value) return;
  const text = selected.value.text;
  try {
    await navigator.clipboard.writeText(text);
    if (selected.value?.text === text) clearMessageSelection();
  } catch {
    error.value = "Нажмите Ctrl+C или ⌘C, чтобы скопировать выделение.";
  }
}
async function send() {
  if (props.busy || pending.value || !comment.value.trim()) return;
  pending.value = true;
  error.value = "";
  try {
    if (
      (await props.submit({
        excerpt: excerpt.value,
        text: comment.value.trim(),
        contentVersion: quoteVersion.value,
        occurrence: occurrence.value,
      })) !== false
    ) {
      excerpt.value = "";
      comment.value = "";
      emit("finished");
    }
  } catch (e) {
    error.value = e.message || "Не удалось отправить комментарий";
  } finally {
    pending.value = false;
  }
}
function cancel() {
  if (!pending.value) {
    excerpt.value = "";
    comment.value = "";
    error.value = "";
    emit("finished");
  }
}
function keys(event) {
  if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void send();
  }
}
function prepareUpdate(event) {
  if (excerpt.value && comment.value.trim()) event.detail?.block?.('Отправьте или отмените комментарий перед обновлением.');
}
onMounted(() => window.addEventListener('index12:prepare-update', prepareUpdate));
onBeforeUnmount(() => window.removeEventListener('index12:prepare-update', prepareUpdate));
</script>
<template>
  <div class="message-fragment" :class="{ 'keyboard-navigation': keyboard }">
    <div
      ref="body"
      data-fragment-source
      class="fragment-source"
      @contextmenu="context"
      @pointerup="readSelection"
      @keyup="readSelection"
    >
      <slot />
    </div>
    <Teleport v-if="selected && !excerpt" to="body">
      <div
        class="fragment-selection-menu"
        :class="{ 'keyboard-navigation': keyboard }"
        :style="popupStyle"
        role="toolbar"
        aria-label="Выделенный текст"
        @pointerdown.prevent
        @keydown.esc.stop.prevent="clearMessageSelection"
      >
        <button
          type="button"
          :disabled="disabled || selected.text.length > 6000"
          :title="
            selected.text.length > 6000
              ? 'Выделите фрагмент до 6000 символов'
              : undefined
          "
          @click="begin"
        >
          <UiIcon name="reply" />{{ touch ? "Цитировать" : "Комментировать" }}
        </button>
        <button type="button" @click="copy">
          <UiIcon name="copy" />Копировать
        </button>
        <p v-if="error" role="alert">{{ error }}</p>
      </div>
    </Teleport>
    <form
      v-if="excerpt"
      class="fragment-editor"
      data-fragment-editor
      aria-label="Комментарий к фрагменту"
      @submit.prevent="send"
      @pointerdown.stop
      @contextmenu.stop
      @click.stop
      @keydown.stop
    >
      <div class="fragment-quote">
        <blockquote>{{ excerpt }}</blockquote>
        <button
          type="button"
          aria-label="Отменить комментарий"
          :disabled="pending"
          @click="cancel"
        >
          <UiIcon name="close" />
        </button>
      </div>
      <textarea
        ref="input"
        v-model="comment"
        aria-label="Текст комментария"
        placeholder="Комментарий"
        rows="2"
        maxlength="6000"
        :readonly="pending"
        @keydown="keys"
      />
      <div class="fragment-send">
        <p v-if="error" role="alert">{{ error }}</p>
        <button type="submit" :disabled="busy || pending || !comment.trim()">
          <UiIcon name="send" />Отправить
        </button>
      </div>
    </form>
  </div>
</template>
<style scoped>
.message-fragment {
  min-width: 0;
}
.fragment-source,
.fragment-source :deep(*) {
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
.fragment-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--codex-pane-border);
}
.fragment-quote {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.fragment-quote blockquote {
  flex: 1;
  min-width: 0;
  max-height: 110px;
  overflow: auto;
  margin: 0;
  padding: 2px 8px;
  border-left: 2px solid var(--codex-pane-accent);
  color: var(--codex-pane-muted);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.message-fragment .fragment-editor textarea {
  outline: none;
  box-shadow: none;
  box-sizing: border-box;
  width: 100%;
  min-height: 60px;
  max-height: 180px;
  resize: vertical;
  border: 1px solid var(--codex-pane-border);
  border-radius: 6px;
  padding: 8px;
  background: var(--codex-pane-bg);
  color: var(--codex-pane-text);
  font: inherit;
  font-size: 14px;
}
.message-fragment .fragment-editor button,
.fragment-selection-menu button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.fragment-quote > button {
  flex: none;
  width: 44px;
  padding: 0;
  color: var(--codex-pane-muted);
}
.fragment-send {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.fragment-send > button {
  color: var(--codex-pane-accent);
}
.fragment-editor p,
.fragment-selection-menu p {
  margin: 0;
  font-size: 12px;
  color: var(--codex-pane-danger);
}
.message-fragment .fragment-editor :is(button, textarea):focus {
  outline: none;
}
.message-fragment.keyboard-navigation .fragment-editor :is(button, textarea):focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 1px;
}
.fragment-editor button:disabled,
.fragment-selection-menu button:disabled {
  opacity: 0.5;
  cursor: default;
}
.fragment-selection-menu {
  box-sizing: border-box;
  position: fixed;
  z-index: 160000;
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  padding: 4px;
  border: 1px solid var(--codex-pane-border, #454545);
  border-radius: 8px;
  background: var(--codex-pane-bg, #191919);
  color: var(--codex-pane-text, #ededed);
  box-shadow: 0 4px 16px #0002;
}
.fragment-selection-menu button {
  flex: 1;
  white-space: nowrap;
  padding: 0 4px;
}
.fragment-selection-menu button:hover {
  background: var(--codex-pane-hover);
}
.fragment-selection-menu.keyboard-navigation button:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
}
.ui-icon {
  width: 16px;
  height: 16px;
  flex: none;
}
@media (pointer: coarse) { .message-fragment .fragment-editor textarea { font-size: 16px; } }
</style>
