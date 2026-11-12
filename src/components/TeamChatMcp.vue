<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { teamApi, teamError } from "@/stores/teamChatStore";
import TeamMcpSetup from "./TeamMcpSetup.vue";
const serverUrl = ref("https://api.index12.com/team-mcp");
const pluginUrl = ref(""),
  connections = ref([]);
const loading = ref(true),
  pending = ref(""),
  error = ref(""),
  notice = ref("");
let active = true,
  timer;
async function load() {
  try {
    const { data } = await teamApi.get("/mcp/connection");
    if (!active) return;
    if (
      !loading.value &&
      data.connections.some(
        (row) =>
          !connections.value.some((previous) => previous._id === row._id),
      )
    ) {
      notice.value = "ChatGPT подключён";
    }
    pluginUrl.value = data.pluginUrl || "";
    connections.value = data.connections;
    serverUrl.value = data.serverUrl || "https://api.index12.com/team-mcp";
  } catch (e) {
    if (active) error.value = teamError(e);
  } finally {
    if (active) loading.value = false;
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
  <section class="chat-mcp" aria-label="MCP-коннектор">
    <h2>Подключить MCP коннектор</h2>
    <p v-if="loading" role="status">Загружаем…</p>
    <template v-else>
      <TeamMcpSetup :server-url="serverUrl" :plugin-url="pluginUrl" />
      <div v-for="row in connections" :key="row._id" class="mcp-connection">
        <span>{{ row.clientName }}<small>Подключён</small></span
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
  gap: 14px;
  min-width: 0;
  padding-inline: var(--safe-area-left, 0px) var(--safe-area-right, 0px);
  padding-bottom: var(--safe-bottom-controls, 12px);
  font-size: 13px;
  line-height: 1.5;
}
.chat-mcp p {
  margin: 0;
}
.chat-mcp h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;
}
.chat-mcp button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: var(--codex-pane-surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.chat-mcp button:focus-visible {
  outline: 2px solid var(--codex-pane-accent);
  outline-offset: 2px;
}
.chat-mcp button:disabled {
  opacity: 0.5;
  cursor: default;
}
.mcp-connection {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 48px;
  border-top: 1px solid var(--codex-pane-border);
}
.mcp-connection > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.mcp-connection small {
  display: block;
  color: var(--codex-pane-muted);
}
.chat-mcp [role="alert"] {
  color: var(--codex-pane-danger);
}
.chat-mcp [role="status"] {
  color: var(--codex-pane-accent);
}
</style>
