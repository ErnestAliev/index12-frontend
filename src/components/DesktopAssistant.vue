<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import AssistantComposer from './AssistantComposer.vue';

const props = defineProps({ apiBaseUrl: { type: String, required: true }, mobile: Boolean });
const store = useMainStore();
const scopeKey = computed(() => `${store.user?._id || store.user?.id || ''}:${store.user?.currentWorkspaceId || ''}`);
const chats = ref([]), selectedId = ref(''), messages = ref([]), input = ref(''), attachments = ref([]);
const connected = ref(false), busy = ref(false), error = ref(''), threadId = ref(null), cursor = ref(null), box = ref(null), files = ref(null);
const speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const recording = ref(false);
const quickPrompts = ['Анализ', 'Прогноз', 'Счета', 'Доходы', 'Расходы', 'Переводы', 'Компании', 'Проекты', 'Контрагенты', 'Категории', 'Физлица'];
let controller = new AbortController(), timer, refreshing = false, recognition, voiceBase = '';
let retry = null;
const storageKey = () => `index12-desktop-chat:${scopeKey.value}`;
const scrollBottom = () => nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight; });
const aborted = () => new DOMException('Aborted', 'AbortError');
const current = session => { if (session !== controller || session.signal.aborted) throw aborted(); };
const pause = (ms, session) => new Promise((resolve, reject) => {
  if (session.signal.aborted) { reject(aborted()); return; }
  const stop = () => { clearTimeout(timeout); reject(aborted()); };
  const timeout = setTimeout(() => { session.signal.removeEventListener('abort', stop); resolve(); }, ms);
  session.signal.addEventListener('abort', stop, { once: true });
});
async function api(path, body, session = controller) {
  current(session);
  const response = await fetch(`${props.apiBaseUrl.replace(/\/$/, '')}/ai/desktop${path}`, {
    credentials: 'include', signal: session.signal,
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  });
  const data = await response.json(); current(session);
  if (!response.ok) { const e = new Error(typeof data.error === 'string' ? data.error : data.message || 'Не удалось связаться с Codex.'); e.status = response.status; throw e; }
  return data;
}
async function waitJob(job, session) {
  const deadline = Date.now() + 310000;
  while (['queued', 'running'].includes(job.status)) {
    if (Date.now() > deadline) throw new Error('Ответ ещё выполняется. Обновите историю перед повторной отправкой.');
    await pause(1000, session);
    job = (await api(`/jobs/${encodeURIComponent(job.id)}`, null, session)).job;
  }
  if (job.status !== 'completed') throw new Error(job.error || 'Запрос не завершён. Проверьте историю чата.');
  return job.result || {};
}
function showHistory(result, older = false) {
  const rows = (result.messages || []).map(m => ({ ...m, text: m.content }));
  const unique = new Map((older ? [...rows, ...messages.value] : rows).map(m => [m.id, m]));
  messages.value = [...unique.values()]; cursor.value = result.nextCursor || null;
  if (!older) scrollBottom();
}
async function history(session, older = false) {
  const { job } = await api(`/chats/${selectedId.value}/jobs`, { kind: 'history', requestId: crypto.randomUUID(), cursor: older ? cursor.value : null }, session);
  showHistory(await waitJob(job, session), older);
}
async function selectChat(id) {
  if (busy.value || !id) return;
  const session = controller;
  selectedId.value = id; localStorage.setItem(storageKey(), id); retry = null;
  busy.value = true; error.value = ''; messages.value = []; cursor.value = null; threadId.value = null;
  try {
    const data = await api(`/chats/${encodeURIComponent(id)}`, null, session);
    threadId.value = data.chat.threadId;
    if (data.cachedHistory) showHistory(data.cachedHistory);
    if (connected.value) {
      if (data.pendingJob) await waitJob(data.pendingJob, session);
      await history(session);
    } else if (!data.cachedHistory && threadId.value) error.value = 'Нет связи с Codex на Mac. История загрузится после подключения.';
  } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { if (session === controller) busy.value = false; }
}
async function createChat(session) {
  const data = await api('/chats', {}, session);
  chats.value.unshift(data.chat); selectedId.value = data.chat.id; threadId.value = null;
  messages.value = []; cursor.value = null; retry = null;
  localStorage.setItem(storageKey(), selectedId.value);
}
async function newChat() {
  if (busy.value) return;
  const session = controller; busy.value = true; error.value = '';
  try { await createChat(session); } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { if (session === controller) busy.value = false; }
}
function stopRecording() { recording.value = false; try { recognition?.stop(); } catch { /* Already stopped. */ } }
async function send(forced) {
  const text = (typeof forced === 'string' ? forced : input.value).trim();
  if ((!text && !attachments.value.length) || busy.value) return;
  const session = controller; busy.value = true; error.value = ''; stopRecording();
  const media = attachments.value.map(({ name, url }) => ({ name, url }));
  let accepted = false;
  try {
    const status = await api('/status', null, session); connected.value = status.connected;
    if (!status.connected) throw new Error(status.reason || 'Нет связи с Codex на Mac. Запустите связку Index12.');
    if (!selectedId.value) await createChat(session);
    const fingerprint = JSON.stringify([selectedId.value, text, media]);
    if (retry?.fingerprint !== fingerprint) retry = { fingerprint, requestId: crypto.randomUUID() };
    const { job } = await api(`/chats/${selectedId.value}/jobs`, { kind: 'send', message: text, attachments: media, requestId: retry.requestId }, session);
    accepted = true; retry = null; input.value = ''; attachments.value = [];
    messages.value.push({ id: crypto.randomUUID(), role: 'user', text, attachments: media }); scrollBottom();
    const result = await waitJob(job, session); threadId.value = result.threadId;
    messages.value.push({ id: crypto.randomUUID(), role: 'assistant', text: result.text }); scrollBottom();
    chats.value = (await api('/chats', null, session)).chats;
    // Reload canonical history, including messages sent from desktop.
    await history(session);
  } catch (e) {
    if (e.name !== 'AbortError') {
      error.value = e.message;
      if (e.status === 503) connected.value = false;
      if (accepted) retry = null;
    }
  } finally { if (session === controller) busy.value = false; }
}
async function loadOlder() {
  if (busy.value) return;
  const session = controller; busy.value = true; error.value = '';
  try { await history(session, true); } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { if (session === controller) busy.value = false; }
}
async function refresh(manual = false) {
  if (refreshing || busy.value) return;
  const session = controller; refreshing = true;
  try {
    const status = await api('/status', null, session);
    const wasConnected = connected.value; connected.value = status.connected;
    chats.value = (await api('/chats', null, session)).chats;
    const saved = localStorage.getItem(storageKey());
    const id = chats.value.find(c => c.id === (selectedId.value || saved))?.id || chats.value[0]?.id;
    if (id && (!selectedId.value || manual || (!wasConnected && connected.value))) await selectChat(id);
  } catch (e) { if (e.name !== 'AbortError') { connected.value = false; error.value = e.message; } }
  finally { if (session === controller) refreshing = false; }
}
async function addFiles(event) {
  const session = controller;
  error.value = '';
  try {
    const chosen = [...event.target.files];
    if (attachments.value.length + chosen.length > 3) throw new Error('Можно прикрепить до трёх изображений.');
    const rows = [];
    let total = attachments.value.reduce((sum, file) => sum + Math.floor(file.url.split(',')[1].length * .75), 0);
    for (const file of chosen) {
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Выберите PNG, JPEG, WebP или GIF размером до 2 МБ.');
      total += file.size;
      if (total > 2 * 1024 * 1024) throw new Error('Общий размер изображений должен быть не больше 2 МБ.');
      const url = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('Не удалось прочитать файл.')); r.readAsDataURL(file); });
      current(session); rows.push({ name: file.name, url });
    }
    attachments.value.push(...rows);
  } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { event.target.value = ''; }
}
function toggleRecording() {
  if (recording.value) { stopRecording(); return; }
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech || busy.value) return;
  recognition ||= new Speech(); recognition.lang = 'ru-RU'; recognition.continuous = true; recognition.interimResults = true;
  voiceBase = input.value;
  recognition.onresult = event => {
    if (!recording.value) return;
    const words = Array.from(event.results).map(row => row[0].transcript).join(' ');
    input.value = `${voiceBase} ${words}`.trim();
  };
  recognition.onend = () => { recording.value = false; };
  recognition.onerror = () => { recording.value = false; error.value = 'Не удалось включить голосовой ввод. Проверьте доступ к микрофону.'; };
  recording.value = true;
  try { recognition.start(); } catch { recording.value = false; }
}
async function copy(message) {
  try { await navigator.clipboard.writeText(message.text); message.copied = true; } catch { error.value = 'Не удалось скопировать сообщение.'; }
}
watch(scopeKey, () => {
  controller.abort(); controller = new AbortController(); stopRecording();
  refreshing = false; busy.value = false; connected.value = false; chats.value = []; selectedId.value = ''; messages.value = [];
  input.value = ''; attachments.value = []; threadId.value = null; cursor.value = null; error.value = ''; retry = null;
  refresh();
});
onMounted(() => { refresh(); timer = setInterval(() => refresh(), 5000); });
onBeforeUnmount(() => { clearInterval(timer); controller.abort(); stopRecording(); });
</script>

<template>
  <section class="desktop-assistant" :class="{ mobile }" aria-label="Помощник Codex">
    <div class="desktop-toolbar">
      <span class="desktop-status" :class="{ online: connected }" :title="connected ? 'Общий сервер Codex доступен' : 'Запустите npm run desktop:bridge на Mac'">Codex · {{ connected ? 'подключён' : 'нет связи' }}</span>
      <button type="button" class="ai-quick-btn" :disabled="busy" title="Обновить связь и историю" aria-label="Обновить связь и историю" @click="refresh(true)">↻</button>
      <button type="button" class="ai-quick-btn" :disabled="busy" @click="newChat">＋ Новый чат</button>
    </div>
    <div class="desktop-chat-picker">
      <select :value="selectedId" :disabled="busy" aria-label="Чаты Index12" @change="selectChat($event.target.value)">
        <option v-if="!chats.length" value="">Новый чат</option>
        <option v-for="chat in chats" :key="chat.id" :value="chat.id">{{ chat.title || 'Новый чат' }}</option>
      </select>
      <a v-if="threadId" :href="`codex://threads/${threadId}`" title="Открыть в desktop-приложении" aria-label="Открыть чат в desktop-приложении">↗</a>
    </div>
    <div class="journal-ai-quick-row">
      <button v-for="prompt in quickPrompts" :key="prompt" type="button" class="ai-quick-btn" :disabled="busy" @click="send(prompt)">{{ prompt }}</button>
    </div>
    <div ref="box" class="journal-ai-messages" aria-live="polite">
      <button v-if="cursor" type="button" class="ai-quick-btn" :disabled="busy || !connected" @click="loadOlder">Предыдущие сообщения</button>
      <article v-for="message in messages" :key="message.id" class="journal-ai-message" :class="message.role">
        <div class="journal-ai-bubble">
          <div class="journal-ai-text">{{ message.text }}</div>
          <img v-for="(file, i) in message.attachments || []" :key="i" class="desktop-image" :src="file.url" :alt="file.name || 'Изображение'" />
          <div v-if="message.role === 'assistant'" class="journal-ai-actions"><button type="button" class="journal-ai-copy-btn" @click="copy(message)">{{ message.copied ? '✅' : 'Копировать' }}</button></div>
        </div>
      </article>
      <div v-if="busy" class="journal-ai-typing" aria-label="Codex готовит ответ"><span class="journal-ai-typing-word">Думаю</span><span class="journal-ai-typing-dots" /></div>
    </div>
    <div v-if="error" class="desktop-error" role="alert">{{ error }}</div>
    <div v-if="attachments.length" class="desktop-attachments">
      <div v-for="(file, i) in attachments" :key="i"><img :src="file.url" :alt="file.name" /><button type="button" :disabled="busy" :aria-label="`Убрать ${file.name}`" @click="attachments.splice(i, 1)">×</button></div>
    </div>
    <input ref="files" type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif" @change="addFiles" />
    <AssistantComposer v-model="input" :mobile="mobile" :busy="busy" :recording="recording" :speech-supported="speechSupported"
      attachments-enabled :has-attachments="!!attachments.length" @send="send()" @microphone="toggleRecording" @attach="files.click()" />
  </section>
</template>

<style scoped>
@import './assistantMessages.css';
.desktop-assistant { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; overflow: hidden; color: var(--ai-pane-text); background: var(--ai-pane-bg); }
.desktop-assistant.mobile { --ai-pane-bg: var(--widget-background); --ai-pane-surface: var(--color-background); --ai-pane-surface-soft: var(--widget-background); --ai-pane-border: var(--widget-border); --ai-pane-text: var(--color-text); --ai-pane-muted: var(--text-mute); --ai-pane-hover: var(--color-background-soft); }
.desktop-toolbar { display: flex; align-items: center; gap: 6px; padding: 8px 10px; flex-shrink: 0; }
.desktop-status { margin-right: auto; color: var(--ai-pane-muted); font-size: 11px; }
.desktop-status.online { color: var(--color-primary); }
.desktop-chat-picker { display: flex; gap: 8px; align-items: center; padding: 0 10px 8px; }
.desktop-chat-picker select { flex: 1; width: 0; min-width: 0; height: 30px; padding: 0 8px; border: 1px solid var(--ai-pane-border); border-radius: 6px; background: var(--ai-pane-surface-soft); color: var(--ai-pane-text); font: inherit; font-size: 12px; }
.desktop-chat-picker a { color: var(--color-primary); text-decoration: none; }
.desktop-error { padding: 8px 10px; color: var(--color-expense, #e45b52); font-size: 12px; overflow-wrap: anywhere; }
.journal-ai-text { overflow-wrap: anywhere; }
.desktop-image { display: block; max-width: 100%; max-height: 240px; border-radius: 6px; margin-top: 6px; }
.desktop-attachments { display: flex; gap: 8px; padding: 8px 10px; }
.desktop-attachments > div { position: relative; }
.desktop-attachments img { width: 64px; height: 64px; object-fit: cover; border-radius: 6px; }
.desktop-attachments button { position: absolute; top: 0; right: 0; color: var(--ai-pane-text); background: var(--ai-pane-surface); border: 1px solid var(--ai-pane-border); border-radius: 50%; cursor: pointer; }
:global(html[data-theme="dark"]) .journal-ai-bubble { background: #232323; border-color: #2f2f2f; }
</style>
