<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
import { teamDeviceKind } from "@/utils/teamDevice";
import { useInputModality } from "@/composables/useInputModality";
import TeamMcpSetup from "./TeamMcpSetup.vue";
import UiIcon from "./UiIcon.vue";
const chat = useTeamChatStore(),
  kind = teamDeviceKind(),
  mobile = kind === "mobile",
  keyboard = useInputModality();
const serverUrl = ref("https://api.index12.com/team-mcp"),
  chatUrl = ref(""),
  devices = ref([]),
  connections = ref([]);
const loading = ref(true),
  pending = ref(""),
  error = ref(""),
  notice = ref(""),
  link = ref(null),
  step = ref(mobile ? 0 : 1),
  complete = ref(false),
  checking = ref(false);
const progressKey = computed(
  () =>
    `index12-mcp-wizard:${chat.me?.workspaceId}:${chat.me?.actorId}:${kind}`,
);
const deviceStates = computed(() =>
  ["mobile", "desktop"].map((type) => ({
    kind: type,
    label: type === "mobile" ? "Смартфон" : "Компьютер",
    connected: type === kind || devices.value.some((row) => row.kind === type),
  })),
);
let active = true,
  timer,
  initialized = false;
function restore() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(progressKey.value));
  } catch {
    /* Progress is optional. */
  }
  if (
    saved &&
    Number.isInteger(saved.step) &&
    saved.step >= 0 &&
    saved.step <= 9
  ) {
    step.value =
      saved.complete && !connections.value.length
        ? mobile
          ? 0
          : 1
        : saved.step;
    complete.value = saved.complete === true && !!connections.value.length;
  } else complete.value = connections.value.length > 0;
  initialized = true;
}
function persist() {
  if (!initialized) return;
  try {
    localStorage.setItem(
      progressKey.value,
      JSON.stringify({ step: step.value, complete: complete.value }),
    );
  } catch {
    /* Keep the current screen in memory. */
  }
}
watch([step, complete], persist);
function currentChatUrl() {
  return /^\/team\/[\w-]{20,100}\/?$/.test(location.pathname)
    ? location.origin + location.pathname.replace(/\/$/, "")
    : "";
}
async function load() {
  try {
    const { data } = await teamApi.get("/mcp/connection");
    if (!active) return;
    serverUrl.value = data.serverUrl || "https://api.index12.com/team-mcp";
    chatUrl.value = data.chatUrl || currentChatUrl();
    devices.value = data.devices || [];
    connections.value = data.connections || [];
    error.value = "";
    if (!initialized) restore();
    if (step.value === 9 && connections.value.length) complete.value = true;
  } catch (e) {
    if (active) error.value = teamError(e);
  } finally {
    if (active) loading.value = false;
  }
}
async function check() {
  if (checking.value) return;
  checking.value = true;
  try {
    await load();
  } finally {
    checking.value = false;
  }
}
async function next() {
  notice.value = "";
  error.value = "";
  if (step.value === 8) {
    step.value = 9;
    await check();
  } else step.value++;
}
function back() {
  notice.value = "";
  error.value = "";
  step.value = step.value === 9 ? 8 : Math.max(0, step.value - 1);
}
function restart() {
  complete.value = false;
  step.value = mobile ? 0 : 1;
  notice.value = "";
  error.value = "";
}
async function copyLink() {
  error.value = "";
  notice.value = "";
  try {
    if (!navigator.clipboard?.writeText) throw Error("Clipboard unavailable");
    await navigator.clipboard.writeText(chatUrl.value);
    notice.value = "Ссылка скопирована";
  } catch {
    link.value?.focus({ preventScroll: true });
    link.value?.select();
    error.value = "Выделите ссылку и скопируйте её.";
  }
}
async function disconnect(id) {
  if (pending.value) return;
  pending.value = id;
  error.value = "";
  try {
    await teamApi.delete("/mcp/connections/" + id);
    if (active) {
      connections.value = connections.value.filter((row) => row._id !== id);
      notice.value = "Подключение отключено";
    }
  } catch (e) {
    if (active) error.value = teamError(e);
  } finally {
    if (active) pending.value = "";
  }
}
onMounted(() => {
  void load();
  timer = setInterval(() => {
    if (!document.hidden) void load();
  }, 15000);
});
onBeforeUnmount(() => {
  active = false;
  clearInterval(timer);
});
</script>
<template>
  <section
    class="chat-mcp"
    :class="{ 'keyboard-navigation': keyboard }"
    aria-label="MCP-коннектор"
  >
    <p v-if="loading" role="status">Загружаем…</p>
    <TeamMcpSetup
      v-else-if="!complete"
      :step="step"
      :mobile="mobile"
      :chat-url="chatUrl"
      :server-url="serverUrl"
      :busy="checking"
      @next="next"
      @back="back"
      @check="check"
    />
    <template v-else>
      <h2>Подключения</h2>
      <div class="mcp-devices" role="list" aria-label="Устройства чата">
        <span
          v-for="device in deviceStates"
          :key="device.kind"
          role="listitem"
          :class="{ 'is-connected': device.connected }"
          ><UiIcon v-if="device.connected" name="check" />{{ device.label }}
          {{ device.connected ? "подключён" : "не подключён" }}</span
        >
      </div>
      <div v-for="row in connections" :key="row._id" class="mcp-connection">
        <span>{{ row.clientName }}</span
        ><button
          type="button"
          :disabled="!!pending"
          :aria-label="`Отключить ${row.clientName}`"
          @click="disconnect(row._id)"
        >
          Отключить
        </button>
      </div>
      <p v-if="!connections.length">Нет подключений ChatGPT.</p>
      <button type="button" class="mcp-primary" @click="restart">
        Добавить подключение
      </button>
      <label class="mcp-chat-link"
        ><span>Ссылка на ваш чат</span>
        <div>
          <input
            ref="link"
            :value="chatUrl"
            readonly
            aria-label="Ссылка на ваш чат"
            @focus="$event.target.select()"
          /><button
            type="button"
            :disabled="!chatUrl"
            aria-label="Скопировать ссылку на чат"
            title="Скопировать ссылку на чат"
            @click="copyLink"
          >
            <UiIcon name="copy" />
          </button></div
      ></label>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
<style scoped>
.chat-mcp {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding-inline: var(--safe-area-left, 0px) var(--safe-area-right, 0px);
  padding-bottom: var(--safe-bottom-controls, 12px);
  font-size: 13px;
  line-height: 1.5;
}
h2,
p {
  margin: 0;
}
h2 {
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;
}
.ui-icon {
  width: 16px;
  height: 16px;
  flex: none;
}
button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--codex-pane-surface);
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.mcp-primary {
  background: var(--codex-pane-accent);
  color: var(--codex-pane-send-text);
}
.mcp-chat-link {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.mcp-chat-link > span {
  color: var(--codex-pane-muted);
}
.mcp-chat-link > div {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.mcp-chat-link button {
  width: 44px;
  flex: none;
  padding: 0;
}
input {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  flex: 1;
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
.mcp-devices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  color: var(--codex-pane-muted);
  font-size: 12px;
}
.mcp-devices > span {
  display: flex;
  align-items: center;
  gap: 4px;
}
.mcp-devices .is-connected {
  color: var(--codex-pane-accent);
}
.mcp-devices .ui-icon {
  width: 14px;
  height: 14px;
}
.mcp-connection {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--codex-pane-border);
}
.mcp-connection > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
[role="alert"] {
  color: var(--codex-pane-danger);
  font-size: 12px;
}
[role="status"] {
  color: var(--codex-pane-accent);
  font-size: 12px;
}
input:focus,
button:focus {
  outline: none;
}
.keyboard-navigation :is(button, input):focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 2px;
}
</style>
