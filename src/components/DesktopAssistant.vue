<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';

const props = defineProps({ apiBaseUrl: { type: String, required: true } });
const store = useMainStore();
const scopeKey = computed(() => `${store.user?._id || store.user?.id || ''}:${store.user?.currentWorkspaceId || ''}`);
const chats = ref([]), selectedId = ref(''), messages = ref([]), input = ref('');
const connected = ref(false), busy = ref(false), error = ref(''), threadId = ref(null), cursor = ref(null), box = ref(null);
let controller = new AbortController();
const storageKey = () => `index12-desktop-chat:${scopeKey.value}`;
const scrollBottom = () => nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight; });
const pause = ms => new Promise((resolve, reject) => {
  const signal = controller.signal;
  const stop = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, ms);
  signal.addEventListener('abort', stop, { once: true });
});
async function api(path, body) {
  const signal = controller.signal;
  const response = await fetch(`${props.apiBaseUrl.replace(/\/$/, '')}/ai/desktop${path}`, {
    credentials: 'include', signal,
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Не удалось связаться с Codex.');
  return data;
}
async function waitJob(job) {
  const deadline = Date.now() + 310000;
  while (['queued', 'running'].includes(job.status)) {
    if (Date.now() > deadline) throw new Error('Ответ ещё выполняется. Проверьте чат в desktop-приложении или обновите историю.');
    await pause(1000);
    job = (await api(`/jobs/${encodeURIComponent(job.id)}`)).job;
  }
  if (job.status !== 'completed') throw new Error(job.error || 'Запрос не завершён. Проверьте историю чата.');
  return job.result || {};
}
async function history(older = false) {
  if (!selectedId.value) return;
  const { job } = await api(`/chats/${selectedId.value}/jobs`, { kind: 'history', requestId: crypto.randomUUID(), cursor: older ? cursor.value : null });
  const result = await waitJob(job);
  const rows = (result.messages || []).map(m => ({ ...m, text: m.content }));
  messages.value = older ? [...rows, ...messages.value] : rows;
  cursor.value = result.nextCursor || null;
  if (!older) scrollBottom();
}
async function selectChat(id) {
  if (busy.value || !id) return;
  const session = controller;
  selectedId.value = id; localStorage.setItem(storageKey(), id);
  busy.value = true; error.value = ''; messages.value = []; cursor.value = null; threadId.value = null;
  try {
    const data = await api(`/chats/${id}`);
    threadId.value = data.chat.threadId;
    if (data.pendingJob) {
      const result = await waitJob(data.pendingJob);
      if (result.threadId) threadId.value = result.threadId;
    }
    await history();
  } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { if (session === controller) busy.value = false; }
}
async function newChat() {
  if (busy.value) return;
  const session = controller;
  busy.value = true;
  error.value = '';
  try {
    const data = await api('/chats', {});
    chats.value.unshift(data.chat); selectedId.value = data.chat.id; threadId.value = null;
    messages.value = []; input.value = ''; cursor.value = null; localStorage.setItem(storageKey(), selectedId.value);
  } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { if (session === controller) busy.value = false; }
}
async function send() {
  const session = controller;
  const text = input.value.trim();
  if (!text || busy.value || !connected.value) return;
  if (!selectedId.value) await newChat();
  if (!selectedId.value) return;
  busy.value = true; error.value = ''; input.value = '';
  messages.value.push({ id: crypto.randomUUID(), role: 'user', text }); scrollBottom();
  try {
    const { job } = await api(`/chats/${selectedId.value}/jobs`, { kind: 'send', message: text, requestId: crypto.randomUUID() });
    const result = await waitJob(job); threadId.value = result.threadId;
    messages.value.push({ id: crypto.randomUUID(), role: 'assistant', text: result.text });
    chats.value = (await api('/chats')).chats; scrollBottom();
  } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { if (session === controller) busy.value = false; }
}
async function loadOlder() {
  const session = controller;
  busy.value = true; error.value = '';
  try { await history(true); } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { if (session === controller) busy.value = false; }
}
async function refresh() {
  error.value = '';
  try {
    const status = await api('/status'); connected.value = status.connected;
    chats.value = (await api('/chats')).chats;
    const saved = localStorage.getItem(storageKey());
    const id = chats.value.find(c => c.id === saved)?.id || chats.value[0]?.id;
    if (id && connected.value) await selectChat(id);
  } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
}
watch(scopeKey, () => { controller.abort(); controller = new AbortController(); busy.value = false; selectedId.value = ''; messages.value = []; threadId.value = null; refresh(); });
onMounted(refresh);
onBeforeUnmount(() => controller.abort());
</script>

<template>
  <section class="desktop-assistant" aria-label="Помощник Codex">
    <div class="desktop-toolbar">
      <span class="desktop-status" :class="{ online: connected }">{{ connected ? 'Codex · подключён' : 'Codex · нет связи' }}</span>
      <button type="button" :disabled="busy" title="Обновить связь" aria-label="Обновить связь" @click="refresh">↻</button>
      <button type="button" :disabled="busy || !connected" @click="newChat">＋ Новый чат</button>
    </div>
    <div class="desktop-chat-picker">
      <select :value="selectedId" :disabled="busy" aria-label="Чаты Index12" @change="selectChat($event.target.value)">
        <option v-if="!chats.length" value="">Чаты Index12</option>
        <option v-for="chat in chats" :key="chat.id" :value="chat.id">{{ chat.title }}</option>
      </select>
      <a v-if="threadId" :href="`codex://threads/${threadId}`" title="Открыть в desktop-приложении" aria-label="Открыть чат в desktop-приложении">↗</a>
    </div>
    <div ref="box" class="desktop-messages" aria-live="polite">
      <button v-if="cursor" type="button" :disabled="busy" @click="loadOlder">Предыдущие сообщения</button>
      <article v-for="message in messages" :key="message.id" class="desktop-message" :class="message.role">
        <span class="desktop-message-role">{{ message.role === 'user' ? 'Вы' : 'Codex' }}</span>
        <div>{{ message.text }}</div>
      </article>
      <span v-if="busy" class="desktop-pending">Codex отвечает…</span>
    </div>
    <div v-if="error" class="desktop-error" role="alert">{{ error }}</div>
    <form class="desktop-composer" @submit.prevent="send">
      <textarea v-model="input" aria-label="Сообщение Codex" placeholder="Спросите Codex" rows="2" maxlength="16000" :disabled="busy" @keydown.enter.exact.prevent="send" />
      <button type="submit" :disabled="busy || !connected || !input.trim()">Отправить</button>
    </form>
  </section>
</template>

<style scoped>
.desktop-assistant { display:flex; flex-direction:column; gap:10px; min-height:0; height:100%; min-width:0; padding:12px; color:var(--text-main); background:var(--bg-main); }
.desktop-toolbar,.desktop-chat-picker { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.desktop-status { margin-right:auto; font-size:12px; color:var(--text-mute); }
.desktop-status.online { color:var(--color-primary); }
.desktop-assistant button,.desktop-assistant select,.desktop-assistant textarea { font:inherit; color:inherit; border:1px solid var(--border-color); border-radius:7px; background:var(--bg-soft); padding:8px; min-width:0; }
.desktop-assistant button { cursor:pointer; }
.desktop-assistant button:disabled { opacity:.5; cursor:default; }
.desktop-chat-picker select { flex:1; width:100%; }
.desktop-chat-picker a { color:var(--color-primary); padding:6px; }
.desktop-messages { flex:1; overflow:auto; min-height:120px; display:flex; flex-direction:column; gap:12px; }
.desktop-message { border-radius:9px; padding:10px; background:var(--bg-soft); overflow-wrap:anywhere; white-space:pre-wrap; font-size:13px; }
.desktop-message.user { border-left:2px solid var(--color-primary); }
.desktop-message-role { display:block; margin-bottom:4px; font-size:11px; color:var(--text-mute); }
.desktop-pending { color:var(--text-mute); font-size:12px; }
.desktop-error { color:var(--color-expense,#e45b52); font-size:12px; overflow-wrap:anywhere; }
.desktop-composer { display:flex; gap:8px; align-items:end; }
.desktop-composer textarea { resize:vertical; flex:1; width:100%; }
.desktop-composer button { color:var(--color-primary); }
@media(max-width:600px) { .desktop-assistant textarea,.desktop-assistant select { font-size:16px; } .desktop-composer { flex-wrap:wrap; } }
</style>
