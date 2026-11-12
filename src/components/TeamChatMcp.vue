<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { teamApi, teamError } from "@/stores/teamChatStore";
import { teamDeviceKind } from "@/utils/teamDevice";
import { useInputModality } from "@/composables/useInputModality";
import TeamMcpSetup from "./TeamMcpSetup.vue";
import UiIcon from "./UiIcon.vue";
const kind = teamDeviceKind(),
  mobile = kind === "mobile",
  keyboard = useInputModality();
const serverUrl = ref("https://api.index12.com/team-mcp"),
  pluginUrl = ref(""),
  chatUrl = ref(""),
  devices = ref([]),
  connections = ref([]);
const loading = ref(true),
  pending = ref(""),
  transferring = ref(false),
  error = ref(""),
  notice = ref(""),
  link = ref(null);
const deviceStates = computed(() =>
  ["mobile", "desktop"].map((type) => ({
    kind: type,
    label: type === "mobile" ? "Смартфон" : "Компьютер",
    connected: type === kind || devices.value.some((row) => row.kind === type),
  })),
);
let active = true,
  timer;
function currentChatUrl() {
  return /^\/team\/[\w-]{20,100}\/?$/.test(location.pathname)
    ? location.origin + location.pathname.replace(/\/$/, "")
    : "";
}
async function load() {
  try {
    const { data } = await teamApi.get("/mcp/connection");
    if (!active) return;
    if (
      !loading.value &&
      (data.connections || []).some(
        (row) =>
          !connections.value.some((previous) => previous._id === row._id),
      )
    )
      notice.value = "ChatGPT подключён";
    serverUrl.value = data.serverUrl || "https://api.index12.com/team-mcp";
    pluginUrl.value = data.pluginUrl || "";
    chatUrl.value = data.chatUrl || currentChatUrl();
    devices.value = data.devices || [];
    connections.value = data.connections || [];
    error.value = "";
  } catch (e) {
    if (active) error.value = teamError(e);
  } finally {
    if (active) loading.value = false;
  }
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
async function transfer() {
  if (transferring.value || !chatUrl.value) return;
  transferring.value = true;
  error.value = "";
  notice.value = "";
  try {
    const data = {
      title: "Чат INDEX12",
      text: "Откройте на компьютере и войдите в чат:\n" + chatUrl.value,
    };
    if (
      typeof navigator.share === "function" &&
      (!navigator.canShare || navigator.canShare(data))
    )
      await navigator.share(data);
    else await copyLink();
  } catch (e) {
    if (e?.name !== "AbortError") await copyLink();
  } finally {
    transferring.value = false;
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
    <h2>MCP-коннектор</h2>
    <p v-if="loading" role="status">Загружаем…</p>
    <template v-else>
      <button
        v-if="mobile"
        class="mcp-transfer"
        type="button"
        :disabled="transferring || !chatUrl"
        @click="transfer"
      >
        <UiIcon name="share" />Подключить на компьютер чат
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
      <TeamMcpSetup
        v-if="!mobile"
        :server-url="serverUrl"
        :plugin-url="pluginUrl"
      />
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
.mcp-transfer {
  width: 100%;
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
