<script setup>
import {
  computed,
  nextTick,
  ref,
  useId,
  watch,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { useTeamChatStore } from "@/stores/teamChatStore";
import { useAppearanceStore } from "@/stores/appearanceStore";
import UiIcon from "./UiIcon.vue";
import TeamTaskFilters from "./TeamTaskFilters.vue";
import { useTeamChatSearchStore } from "@/stores/teamChatSearchStore";
const search = useTeamChatSearchStore();
function openSearch() {
  open.value = false;
  search.start();
  search.focusField();
}
import { useTeamChatNotifications } from "@/composables/useTeamChatNotifications";
const props = defineProps({ modelValue: String, inviteToken: String });
const emit = defineEmits(["update:modelValue", "close", "logout"]);
const {
  enabled: notificationsEnabled,
  busy: notificationsBusy,
  error: notificationsError,
  toggle: toggleNotifications,
  refresh: refreshNotifications,
} = useTeamChatNotifications(() => props.inviteToken);
const chat = useTeamChatStore(),
  appearance = useAppearanceStore(),
  open = ref(false),
  keyboard = ref(true),
  root = ref(null),
  trigger = ref(null),
  menu = ref(null),
  menuHeight = ref(420),
  menuOffset = ref(null),
  error = ref("");
const menuId = useId();
const sections = computed(() => [
  { value: "messages", label: "Чат" },
  { value: "tasks", label: "Задачи" },
  { value: 'files', label: 'Файлы' },
  ...(chat.isOwner ? [{ value: "members", label: "Доступы и роли" }] : []),
  ...(!chat.isOwner ? [{ value: 'mcp', label: 'MCP-коннектор' }] : []),
]);
const label = computed(
  () =>
    ({ members: "Доступы и роли" })[props.modelValue] ||
    sections.value.find((s) => s.value === props.modelValue)?.label ||
    "Чат",
);
let observer;
function measure() {
  if (root.value) {
    const box = root.value.getBoundingClientRect(), header = root.value.closest('.codex-window-header')?.getBoundingClientRect();
    menuOffset.value = header ? header.left + header.width / 2 - (box.left + box.width / 2) + 'px' : null;
  }
  if (!open.value || !trigger.value) return;
  const viewport = window.visualViewport;
  const bottom =
    (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
  const frame = root.value
    ?.closest(".codex-chat-window")
    ?.getBoundingClientRect();
  menuHeight.value = Math.max(
    72,
    Math.min(bottom, frame?.bottom || bottom) -
      trigger.value.getBoundingClientRect().bottom -
      12,
  );
}
function outside(e) {
  keyboard.value = false;
  if (!root.value?.contains(e.target)) open.value = false;
}
function keyboardInput(event) {
  if (["Tab", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
    keyboard.value = true;
}
function close(focus = true) {
  open.value = false;
  if (focus) trigger.value?.focus();
}
function toggle() {
  if (open.value) close();
  else open.value = true;
}
function select(value) {
  if (value === 'files') { chat.openFiles(); close(); return; }
  if (search.open) search.close(false);
  if (value === "members" && !chat.isOwner) return;
  if (value === 'mcp') {
    chat.requestedTaskId = null; chat.requestedTaskMessageId = null;
    chat.creatingTask = false; chat.creatingTaskParentId = null; chat.taskNotifications = false;
  }
  emit("update:modelValue", value);
  close();
}
async function keys(event) {
  if (event.key === "Escape" && open.value) {
    event.stopPropagation();
    event.preventDefault();
    close();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  if (!open.value) {
    if (!event.target.closest(".team-navigation-trigger")) return;
    open.value = true;
    await nextTick();
  }
  const nodes = [
    ...(menu.value?.querySelectorAll("button:not(:disabled)") || []),
  ];
  if (!nodes.length) return;
  event.preventDefault();
  const i = nodes.indexOf(document.activeElement);
  const target =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? nodes.length - 1
        : i < 0
          ? event.key === "ArrowUp"
            ? nodes.length - 1
            : 0
          : (i + (event.key === "ArrowUp" ? -1 : 1) + nodes.length) %
            nodes.length;
  nodes[target].focus();
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
watch(open, async (value) => {
  if (value) {
    await nextTick();
    measure();
    void refreshNotifications();
  }
});
watch(
  () => chat.isOwner,
  (owner) => {
    if (!owner && props.modelValue === "members") select("messages");
  },
);
onMounted(() => {
  measure();
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", keyboardInput, true);
  window.addEventListener("resize", measure);
  window.visualViewport?.addEventListener("resize", measure);
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(measure);
    const frame = root.value?.closest(".codex-chat-window");
    if (frame) observer.observe(frame);
    if (root.value) observer.observe(root.value);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("keydown", keyboardInput, true);
  window.removeEventListener("resize", measure);
  window.visualViewport?.removeEventListener("resize", measure);
  observer?.disconnect();
});
</script>
<template>
  <nav
    ref="root"
    class="team-chat-navigation"
    :data-keyboard="keyboard"
    :style="{ '--chat-menu-offset': menuOffset }"
    aria-label="Навигация чата"
    @keydown="keys"
    @focusout="
      $event.relatedTarget &&
      !root?.contains($event.relatedTarget) &&
      close(false)
    "
  >
    <div class="team-navigation-identity"><slot /></div>
    <div class="team-navigation-picker">
      <button
        ref="trigger"
        type="button"
        class="team-navigation-trigger"
        aria-label="Меню чата"
        aria-haspopup="dialog"
        :aria-controls="menuId"
        :aria-expanded="open"
        :data-section="modelValue"
        @click="toggle"
      >
        <span>{{ label }}</span
        ><UiIcon name="chevron-down" />
      </button>
      <section
        v-if="open"
        :id="menuId"
        ref="menu"
        class="team-navigation-menu"
        role="dialog"
        aria-label="Меню чата"
        :style="{ maxHeight: `${menuHeight}px` }"
      >
        <button
          v-for="s in sections"
          :key="s.value"
          type="button"
          :aria-pressed="modelValue === s.value"
          aria-controls="team-panel"
          @click="select(s.value)"
        >
          <UiIcon
            name="check"
            :class="{ 'team-navigation-unchecked': modelValue !== s.value }"
          />{{ s.label }}
        </button>
        <button type="button" @click="openSearch">
          <UiIcon name="search" />Поиск
        </button>
        <hr />
        <button type="button" @click="theme">
          <UiIcon :name="appearance.mode === 'light' ? 'moon' : 'sun'" />{{
            appearance.mode === "light" ? "Тёмная тема" : "Светлая тема"
          }}
        </button>
        <p v-if="error" role="alert">{{ error }}</p>
        <button
          type="button"
          :disabled="notificationsBusy"
          :aria-pressed="notificationsEnabled"
          @click="toggleNotifications"
        >
          <UiIcon :name="notificationsBusy ? 'refresh' : 'bell'" />{{
            notificationsEnabled
              ? "Выключить уведомления"
              : "Включить уведомления"
          }}
        </button>
        <p v-if="notificationsError" role="alert">{{ notificationsError }}</p>
      </section>
    </div>
    <div class="team-navigation-actions" @click.capture="close(false)"><TeamTaskFilters v-if="chat.me?.status === 'active' && modelValue === 'messages' && !chat.creatingTask && !chat.requestedTaskId && !chat.taskNotifications && !search.open" label="Фильтры чата" /></div>
  </nav>
</template>
<style scoped>
.team-chat-navigation {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  min-height: 44px;
  color: var(--codex-pane-text);
}
.team-navigation-actions { grid-column: 3; justify-self: center; display: flex; align-items: center; min-width: 0; }
.team-navigation-identity {
  min-width: 0;
  overflow: hidden;
}
.team-navigation-picker {
  position: relative;
  z-index: 90;
  transform: translateX(var(--chat-menu-offset,0px));
  min-width: 0;
}
.team-chat-navigation .team-navigation-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: auto;
  max-width: 138px;
  min-height: 44px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.team-navigation-trigger span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.team-navigation-trigger > .ui-icon {
  width: 14px;
  height: 14px;
}
.team-navigation-trigger:hover {
  background: var(--codex-pane-hover);
}
.team-navigation-menu {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% + 6px);
  z-index: 70;
  width: min(230px, calc(100vw - 48px));
  box-sizing: border-box;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 10px;
  background: var(--codex-pane-surface);
  box-shadow: 0 8px 24px #0002;
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
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.team-navigation-menu button:hover {
  background: var(--codex-pane-hover);
}
.team-navigation-menu button[aria-pressed="true"] {
  font-weight: 500;
}
.team-navigation-unchecked {
  visibility: hidden;
}
.team-navigation-menu hr {
  margin: 4px 6px;
  border: 0;
  border-top: 1px solid var(--codex-pane-border);
}
.team-navigation-menu p {
  margin: 6px;
  color: var(--color-danger, #c65048);
  font-size: 12px;
}
.team-chat-navigation button:focus {
  outline: none !important;
  box-shadow: none;
}
.team-chat-navigation[data-keyboard="true"] button:focus-visible {
  box-shadow: inset 0 0 0 1px var(--codex-pane-focus);
}
</style>
