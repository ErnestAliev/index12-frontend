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
import { useTeamChatStore, teamError } from "@/stores/teamChatStore";
import { useAppearanceStore } from "@/stores/appearanceStore";
import UiIcon from "./UiIcon.vue";
import TeamChatRoleSelect from "./TeamChatRoleSelect.vue";
const props = defineProps({ modelValue: String, setupAvailable: Boolean });
const emit = defineEmits(["update:modelValue", "setup", "logout"]);
const chat = useTeamChatStore(),
  appearance = useAppearanceStore(),
  open = ref(false),
  screen = ref("main"),
  root = ref(null),
  trigger = ref(null),
  menu = ref(null),
  menuHeight = ref(420),
  savingRole = ref(false),
  error = ref("");
const menuId = useId();
const sections = [
  { value: "messages", label: "Сообщения" },
  { value: "tasks", label: "Задачи" },
  { value: "requests", label: "Заявки" },
];
const label = computed(
  () => sections.find((s) => s.value === props.modelValue)?.label || "Роли",
);
let observer;
function measure() {
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
  if (!root.value?.contains(e.target)) open.value = false;
}
function close(focus = true) {
  open.value = false;
  if (focus) trigger.value?.focus();
}
function toggle() {
  if (open.value) close();
  else {
    screen.value = "main";
    open.value = true;
  }
}
async function showSettings() {
  screen.value = "settings";
  await nextTick();
  menu.value?.querySelector("button")?.focus();
}
async function back() {
  screen.value = "main";
  await nextTick();
  menu.value?.querySelector("button")?.focus();
}
function select(value) {
  if (value === "members" && !chat.isOwner) return;
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
  if (
    !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
    event.target.closest("select,input")
  )
    return;
  if (!open.value) {
    if (!event.target.closest(".team-navigation-trigger")) return;
    screen.value = "main";
    open.value = true;
    await nextTick();
  }
  const nodes = [
    ...(menu.value?.querySelectorAll(
      "button:not(:disabled),select:not(:disabled)",
    ) || []),
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
async function roleChanged(event) {
  if (!chat.me?.owner || savingRole.value) return;
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
watch(open, async (value) => {
  if (value) {
    await nextTick();
    measure();
  }
});
watch(
  () => chat.isOwner,
  (owner) => {
    if (!owner && props.modelValue === "members") select("messages");
  },
);
onMounted(() => {
  document.addEventListener("pointerdown", outside);
  window.addEventListener("resize", measure);
  window.visualViewport?.addEventListener("resize", measure);
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(measure);
    const frame = root.value?.closest(".codex-chat-window");
    if (frame) observer.observe(frame);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  window.removeEventListener("resize", measure);
  window.visualViewport?.removeEventListener("resize", measure);
  observer?.disconnect();
});
</script>
<template>
  <nav
    ref="root"
    class="team-chat-navigation"
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
        <template v-if="screen === 'main'">
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
          <hr />
          <button
            v-if="chat.isOwner"
            type="button"
            :aria-pressed="modelValue === 'members'"
            @click="select('members')"
          >
            <UiIcon name="settings" />Роли и участники
          </button>
          <button type="button" @click="showSettings">
            <UiIcon name="settings" />Настройки чата
          </button>
          <button type="button" @click="theme">
            <UiIcon :name="appearance.mode === 'light' ? 'moon' : 'sun'" />{{
              appearance.mode === "light" ? "Тёмная тема" : "Светлая тема"
            }}
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            aria-label="Назад к разделам чата"
            @click="back"
          >
            <UiIcon name="chevron-left" />Настройки чата
          </button>
          <hr />
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
              close();
              emit('setup');
            "
          >
            <UiIcon name="bell" />Уведомления
          </button>
          <button
            v-if="chat.me && !chat.me.owner"
            type="button"
            @click="
              close();
              emit('logout');
            "
          >
            <UiIcon name="logout" />Выйти
          </button>
        </template>
        <p v-if="error" role="alert">{{ error }}</p>
      </section>
    </div>
  </nav>
</template>
<style scoped>
.team-chat-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: 1;
  min-width: 0;
  min-height: 44px;
  color: var(--codex-pane-text);
}
.team-navigation-identity {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.team-navigation-picker {
  position: relative;
  flex: none;
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
  right: 0;
  top: calc(100% + 6px);
  z-index: 70;
  width: min(230px, calc(100vw - 48px));
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
</style>
