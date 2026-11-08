<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
import UiIcon from "./UiIcon.vue";
const props = defineProps({ message: Object, suppressOpeningTouch: Boolean });
const emit = defineEmits(["close", "deleted", "reply"]);
const chat = useTeamChatStore(),
  panel = ref(null),
  mode = ref("actions"),
  busy = ref(false),
  error = ref(""),
  text = ref(props.message.text || ""),
  editVersion = ref(props.message.version || 0),
  targets = ref([]);
const emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const own = computed(() => props.message.authorId === chat.me?.actorId);
const canDelete = computed(() => chat.isOwner || own.value);
const title = computed(
  () =>
    ({
      actions: "Сообщение",
      edit: "Редактировать",
      forward: "Переслать",
      delete: "Удалить сообщение?",
    })[mode.value],
);
const bounds = ref({});
let previousFocus;
let waitingForRelease = false;
function releaseOpeningTouch(event) {
  if (!waitingForRelease) return;
  if (event.type === "touchend") {
    event.preventDefault();
    event.stopPropagation();
  }
  waitingForRelease = false;
  document.removeEventListener("touchend", releaseOpeningTouch, true);
  document.removeEventListener("touchcancel", releaseOpeningTouch, true);
}
function clearMenuSelection() {
  if (
    document.activeElement?.matches('input,textarea,[contenteditable="true"]')
  )
    return;
  const selected = window.getSelection();
  if (
    selected?.rangeCount &&
    (panel.value?.contains(selected.anchorNode) ||
      panel.value?.contains(selected.focusNode))
  )
    selected.removeAllRanges();
}
function preventNativeSelection(event) {
  const target =
    event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
  if (target?.closest('input,textarea,[contenteditable="true"]')) return;
  event.preventDefault();
  clearMenuSelection();
}
function viewport() {
  const v = window.visualViewport;
  bounds.value = {
    left: (v?.offsetLeft || 0) + "px",
    top: (v?.offsetTop || 0) + "px",
    width: (v?.width || window.innerWidth) + "px",
    height: (v?.height || window.innerHeight) + "px",
  };
}
function close() {
  if (!busy.value) emit("close");
}
async function run(fn) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
    emit("close");
  } catch (e) {
    error.value = teamError(e);
  } finally {
    busy.value = false;
  }
}
function react(emoji) {
  const mine = props.message.reactions?.some(
    (r) => r.emoji === emoji && r.mine,
  );
  return run(() =>
    chat.action(`/messages/${props.message._id}/reaction`, {
      emoji: mine ? null : emoji,
    }),
  );
}
async function forward() {
  mode.value = "forward";
  error.value = "";
  try {
    targets.value = (await teamApi.get("/message-targets")).data.targets;
  } catch (e) {
    error.value = teamError(e);
  }
}
const forwardKeys = new Map();
function sendForward(target) {
  if (!forwardKeys.has(target._id))
    forwardKeys.set(target._id, crypto.randomUUID());
  return run(() =>
    chat.action(`/messages/${props.message._id}/forward`, {
      id: forwardKeys.get(target._id),
      targetWorkspaceId: target._id,
      expectedVersion: props.message.version || 0,
    }),
  );
}
function save() {
  return run(() =>
    chat.action(
      `/messages/${props.message._id}`,
      { text: text.value, expectedVersion: editVersion.value },
      "patch",
    ),
  );
}
function remove() {
  chat.deleteMessage(props.message);
  emit("close");
}
async function edit() {
  mode.value = "edit";
  editVersion.value = props.message.version || 0;
  text.value = props.message.text || "";
  await nextTick();
  panel.value.querySelector("textarea")?.focus();
}
function keys(event) {
  if (event.key === "Escape") {
    event.stopPropagation();
    event.preventDefault();
    close();
  }
  if (event.key !== "Tab") return;
  const items = [
      ...panel.value.querySelectorAll("button:not(:disabled),textarea"),
    ],
    first = items[0],
    last = items.at(-1);
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === panel.value)
  ) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
onMounted(async () => {
  window.getSelection()?.removeAllRanges();
  document.addEventListener("selectionchange", clearMenuSelection);
  waitingForRelease = props.suppressOpeningTouch;
  if (waitingForRelease) {
    document.addEventListener("touchend", releaseOpeningTouch, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchcancel", releaseOpeningTouch, true);
  }
  previousFocus = document.activeElement;
  if (previousFocus?.matches("input,textarea")) previousFocus.blur();
  viewport();
  window.visualViewport?.addEventListener("resize", viewport);
  window.visualViewport?.addEventListener("scroll", viewport);
  window.addEventListener("resize", viewport);
  await nextTick();
  panel.value.focus({ preventScroll: true });
});
onBeforeUnmount(() => {
  document.removeEventListener("selectionchange", clearMenuSelection);
  clearMenuSelection();
  document.removeEventListener("touchend", releaseOpeningTouch, true);
  document.removeEventListener("touchcancel", releaseOpeningTouch, true);
  window.visualViewport?.removeEventListener("resize", viewport);
  window.visualViewport?.removeEventListener("scroll", viewport);
  window.removeEventListener("resize", viewport);
  if (previousFocus?.isConnected && !previousFocus.matches("input,textarea"))
    previousFocus.focus({ preventScroll: true });
});
</script>
<template>
  <Teleport to="body">
    <div
      class="team-message-menu-backdrop"
      :style="bounds"
      @pointerdown.self="close"
      @keydown="keys"
      @selectstart="preventNativeSelection"
      @contextmenu="preventNativeSelection"
    >
      <section
        ref="panel"
        class="team-message-menu"
        :data-message-id="message._id"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
      >
        <header>
          <strong>{{ title }}</strong
          ><button
            type="button"
            class="menu-icon"
            aria-label="Закрыть меню сообщения"
            :disabled="busy"
            @click="close"
          >
            <UiIcon name="close" />
          </button>
        </header>
        <p v-if="error" class="menu-error" role="alert">{{ error }}</p>
        <template v-if="mode === 'actions'">
          <div class="message-reaction-picker">
            <button
              v-for="emoji in emojis"
              :key="emoji"
              type="button"
              :aria-label="`Реакция ${emoji}`"
              :aria-pressed="
                !!message.reactions?.some((r) => r.emoji === emoji && r.mine)
              "
              :disabled="busy"
              @click="react(emoji)"
            >
              {{ emoji }}
            </button>
          </div>
          <button
            type="button"
            class="menu-action"
            :disabled="busy"
            @click="
              emit('reply', message);
              emit('close');
            "
          >
            <UiIcon name="reply" />Ответить
          </button>
          <button
            v-if="own && message.kind !== 'request'"
            type="button"
            class="menu-action"
            :disabled="busy"
            @click="edit"
          >
            <UiIcon name="edit" />Редактировать
          </button>
          <button
            type="button"
            class="menu-action"
            :disabled="busy"
            @click="forward"
          >
            <UiIcon name="send" />Переслать
          </button>
          <button
            v-if="message.text"
            type="button"
            class="menu-action"
            :disabled="busy"
            @click="run(() => navigator.clipboard.writeText(message.text))"
          >
            <UiIcon name="copy" />Копировать
          </button>
          <button
            v-if="canDelete"
            type="button"
            class="menu-action menu-danger"
            :disabled="busy"
            @click="mode = 'delete'"
          >
            <UiIcon name="trash" />Удалить
          </button>
        </template>
        <form v-else-if="mode === 'edit'" @submit.prevent="save">
          <textarea
            v-model="text"
            aria-label="Текст сообщения"
            maxlength="10000"
            rows="4"
            :disabled="busy"
          /><button
            type="submit"
            class="menu-primary"
            :disabled="busy || (!text.trim() && !message.attachments?.length)"
          >
            Сохранить
          </button>
        </form>
        <template v-else-if="mode === 'forward'"
          ><button
            v-for="target in targets"
            :key="target._id"
            type="button"
            class="menu-action"
            :disabled="busy"
            @click="sendForward(target)"
          >
            <UiIcon name="chat" />{{ target.name }}
          </button></template
        >
        <template v-else-if="mode === 'delete'"
          ><button
            type="button"
            class="menu-action menu-danger"
            :disabled="busy"
            @click="remove"
          >
            Удалить для всех</button
          ><button
            type="button"
            class="menu-action"
            :disabled="busy"
            @click="mode = 'actions'"
          >
            Отмена
          </button></template
        >
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.team-message-menu-backdrop {
  --codex-pane-bg: #191919;
  --codex-pane-surface: #282828;
  --codex-pane-text: #e7e7e7;
  --codex-pane-muted: #aaa;
  --codex-pane-border: #444;
  --codex-pane-hover: #ffffff0d;
  --codex-pane-accent: #4fa986;
  --codex-pane-danger: #f17c73;
  --codex-pane-send-text: #fff;
  --codex-pane-focus: #40806b;
  position: fixed;
  z-index: 9000;
  background: #0005;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
  color: var(--codex-pane-text, #e7e7e7);
  font:
    14px/1.5 -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}
.team-message-menu {
  box-sizing: border-box;
  width: 360px;
  max-width: 100%;
  max-height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--codex-pane-surface, #252525);
  border: 1px solid var(--codex-pane-border, #444);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 8px 32px #0003;
  outline: none;
}
.team-message-menu header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 4px 8px 8px;
}
.team-message-menu strong {
  font-weight: 500;
}
.team-message-menu button {
  font: inherit;
  cursor: pointer;
  color: inherit;
}
.team-message-menu button:disabled {
  opacity: 0.5;
  cursor: default;
}
.team-message-menu button:focus-visible {
  outline: 2px solid var(--codex-pane-focus, #40806b);
  outline-offset: -2px;
}
.menu-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 8px;
}
.menu-action {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
}
.menu-action:hover,
.menu-icon:hover {
  background: var(--codex-pane-hover, #ffffff0d);
}
.menu-action.menu-danger,
.menu-error {
  color: var(--codex-pane-danger, #f17c73);
}
.menu-action.menu-approve {
  color: var(--codex-pane-accent, #57bf9b);
}
.message-reaction-picker {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  padding: 4px 0 8px;
  border-bottom: 1px solid var(--codex-pane-border, #444);
  margin-bottom: 4px;
}
.message-reaction-picker button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  font-size: 24px;
}
.message-reaction-picker button[aria-pressed="true"] {
  border-color: var(--codex-pane-accent, #57bf9b);
  background: var(--codex-pane-hover, #ffffff0d);
}
.team-message-menu textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 108px;
  max-height: 45dvh;
  padding: 12px;
  border: 1px solid var(--codex-pane-border, #444);
  border-radius: 8px;
  resize: vertical;
  font: inherit;
  font-size: 16px;
  color: inherit;
  background: var(--codex-pane-bg, #191919);
}
.menu-primary {
  width: 100%;
  min-height: 44px;
  border: 0;
  border-radius: 8px;
  background: var(--codex-pane-accent, #40806b);
  color: var(--codex-pane-send-text, #fff) !important;
  margin-top: 8px;
}
.menu-error {
  margin: 8px;
  font-size: 13px;
}
.message-approval-history {
  list-style: none;
  margin: 0;
  padding: 0 8px;
}
.message-approval-history li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 0;
  border-top: 1px solid var(--codex-pane-border, #444);
}
.message-approval-history span,
.message-approval-history time {
  font-size: 12px;
  color: var(--codex-pane-muted, #aaa);
}
@media (max-width: 600px) {
  .team-message-menu-backdrop {
    align-items: flex-end;
    padding-bottom: var(--safe-bottom-controls);
  }
  .team-message-menu {
    width: 100%;
  }
}

.team-message-menu,
.team-message-menu :deep(*) {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.team-message-menu textarea,
.team-message-menu input,
.team-message-menu [contenteditable="true"] {
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
</style>

<style scoped>
:global(html[data-theme="light"] .team-message-menu-backdrop) {
  --codex-pane-bg: var(--light-canvas, #f4f6f5);
  --codex-pane-surface: var(--light-surface, #fff);
  --codex-pane-text: var(--light-text, #263631);
  --codex-pane-muted: var(--light-muted, #5c6863);
  --codex-pane-border: var(--light-border, #d5ded8);
  --codex-pane-hover: var(--light-hover, #e6eeea);
  --codex-pane-accent: var(--light-accent, #3b6763);
  --codex-pane-danger: var(--light-expense, #a74439);
  --codex-pane-focus: var(--light-accent, #3b6763);
}

.team-message-menu,
.team-message-menu :deep(*) {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.team-message-menu textarea,
.team-message-menu input,
.team-message-menu [contenteditable="true"] {
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
</style>
