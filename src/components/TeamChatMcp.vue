<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { teamApi, teamError } from '@/stores/teamChatStore';
import UiIcon from './UiIcon.vue';
const serverUrl = ref(''), code = ref(''), expiresAt = ref(''), fullData = ref(false), connections = ref([]);
const loading = ref(true), creating = ref(false), pending = ref(''), error = ref(''), notice = ref('');
let active = true, timer;
async function load() {
  try {
    const { data } = await teamApi.get('/mcp/connection');
    if (!active) return;
    if (code.value && data.connections.some(row => !connections.value.some(previous => previous._id === row._id))) {
      code.value = ''; expiresAt.value = ''; notice.value = 'ChatGPT подключён';
    }
    serverUrl.value = data.serverUrl; fullData.value = data.fullData; connections.value = data.connections;
  } catch (e) { if (active) error.value = teamError(e); }
  finally { if (active) loading.value = false; }
}
async function copy(value, label) {
  error.value = ''; notice.value = '';
  try { await navigator.clipboard.writeText(value); if (active) notice.value = label + ' скопирован'; }
  catch { if (active) error.value = 'Выделите и скопируйте значение из поля'; }
}
async function createCode() {
  if (creating.value) return;
  creating.value = true; error.value = ''; notice.value = '';
  const request = teamApi.post('/mcp/connection-code');
  let copied;
  if (navigator.clipboard?.write && window.ClipboardItem) {
    try { copied = navigator.clipboard.write([new ClipboardItem({ 'text/plain': request.then(({ data }) => new Blob([data.code], { type: 'text/plain' })) })]).then(() => true, () => false); }
    catch { copied = null; }
  }
  try {
    const { data } = await request;
    if (!active) return;
    code.value = data.code; expiresAt.value = data.expiresAt; serverUrl.value = data.serverUrl;
    const ok = copied ? await copied : false;
    if (active) notice.value = ok ? 'Код скопирован' : 'Код готов';
  } catch (e) { if (active) error.value = teamError(e); }
  finally { if (active) creating.value = false; }
}
async function disconnect(id) {
  if (pending.value) return;
  pending.value = id; error.value = '';
  try { await teamApi.delete('/mcp/connections/' + id); if (active) { connections.value = connections.value.filter(row => row._id !== id); notice.value = 'Подключение отключено'; } }
  catch (e) { if (active) error.value = teamError(e); }
  finally { if (active) pending.value = ''; }
}
onMounted(() => { void load(); timer = setInterval(() => {
  if (code.value && Date.now() >= Date.parse(expiresAt.value)) { code.value = ''; notice.value = 'Код истёк. Получите новый'; }
  if (!document.hidden) void load();
}, 15000); });
onBeforeUnmount(() => { active = false; code.value = ''; clearInterval(timer); });
</script>
<template>
  <section class="chat-mcp" aria-label="MCP-коннектор">
    <p v-if="loading" role="status">Загружаем…</p>
    <template v-else>
      <p>{{ fullData ? 'У вас полный доступ к данным системы: чату, задачам, финансам и контрагентам.' : 'Вам доступны общий чат и ваши задачи.' }}</p>
      <p>История вопросов остаётся в вашем ChatGPT и не отображается владельцу в INDEX12. Сообщения и действия, отправленные в рабочий чат, видны участникам.</p>
      <label>Адрес MCP-сервера<span class="mcp-field"><input :value="serverUrl" readonly aria-label="Адрес MCP-сервера" @focus="$event.target.select()" /><button type="button" title="Скопировать адрес" aria-label="Скопировать адрес MCP-сервера" @click="copy(serverUrl, 'Адрес')"><UiIcon name="copy" /></button></span></label>
      <button type="button" :disabled="creating" @click="createCode"><UiIcon name="key" />{{ creating ? 'Создаём код…' : code ? 'Получить новый код' : 'Получить код подключения' }}</button>
      <label v-if="code">Одноразовый код<span class="mcp-field"><input :value="code" readonly aria-label="Одноразовый код подключения" @focus="$event.target.select()" /><button type="button" title="Скопировать код" aria-label="Скопировать код подключения" @click="copy(code, 'Код')"><UiIcon name="copy" /></button></span></label>
      <details><summary>Как подключить ChatGPT</summary><ol><li>В настройках ChatGPT откройте добавление своего MCP-сервера.</li><li>Вставьте адрес выше и выберите OAuth.</li><li>При подключении вставьте одноразовый код и подтвердите свои права. Код действует 15 минут.</li></ol></details>
      <a class="mcp-open" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer"><UiIcon name="external" />Открыть ChatGPT</a>
      <div v-for="row in connections" :key="row._id" class="mcp-connection"><span>{{ row.clientName }}<small>{{ fullData && !row.financeAllowed ? 'Переподключите для доступа к полным данным' : row.scopes.includes('index12:write') ? 'Чтение и действия в чате' : 'Только чтение' }}</small></span><button type="button" :disabled="!!pending" :aria-label="`Отключить ${row.clientName}`" @click="disconnect(row._id)">Отключить</button></div>
    </template>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
<style scoped>
.chat-mcp { display: flex; flex-direction: column; gap: 14px; min-width: 0; padding-bottom: var(--safe-bottom-controls,12px); font-size: 13px; line-height: 1.5; }
.chat-mcp p { margin: 0; }
.chat-mcp label { display: flex; flex-direction: column; gap: 4px; }
.mcp-field { display: flex; align-items: center; gap: 4px; }
.mcp-field input { box-sizing: border-box; min-width: 0; width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid var(--codex-pane-border); border-radius: 8px; background: var(--codex-pane-surface); color: inherit; font: inherit; font-size: 16px; }
.chat-mcp button,.mcp-open { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 8px 10px; border: 0; border-radius: 8px; background: var(--codex-pane-surface); color: inherit; font: inherit; cursor: pointer; text-decoration: none; }
.mcp-field > button { width: 44px; flex: none; padding: 0; }
.chat-mcp button:disabled { opacity: .5; cursor: default; }
.chat-mcp summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; color: var(--codex-pane-muted); }
.chat-mcp ol { margin: 0; padding-left: 20px; }
.chat-mcp li + li { margin-top: 8px; }
.mcp-connection { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 48px; border-top: 1px solid var(--codex-pane-border); }
.mcp-connection > span { min-width: 0; overflow-wrap: anywhere; }
.mcp-connection small { display: block; color: var(--codex-pane-muted); }
.chat-mcp [role=alert] { color: var(--codex-pane-danger); }
.chat-mcp [role=status] { color: var(--codex-pane-accent); }
</style>
