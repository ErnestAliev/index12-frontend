<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import CodexComposer from './CodexComposer.vue';
import CodexGlyph from './CodexGlyph.vue';
import CodexFileCard from './CodexFileCard.vue';
import CodexMessageText from './CodexMessageText.vue';

const props = defineProps({ apiBaseUrl: { type: String, required: true }, mobile: Boolean });
const store = useMainStore();
const scopeKey = computed(() => `${store.user?._id || store.user?.id || ''}:${store.user?.currentWorkspaceId || ''}`);
const chats = ref([]), selectedId = ref(''), messages = ref([]), input = ref(''), attachments = ref([]);
const connected = ref(false), busy = ref(false), error = ref(''), threadId = ref(null), cursor = ref(null), box = ref(null), files = ref(null);
const speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const recording = ref(false);
const downloadingFiles = ref(new Set());
let controller = new AbortController(), timer, refreshing = false, recognition, voiceBase = '';
let retry = null;
const codexBase = () => `${props.apiBaseUrl.replace(/\/$/, '')}/codex`;
const isImage = file => /^image\/(png|jpeg|webp|gif)$/.test(file.mimeType || '');
const fileUrl = file => file.url || `${codexBase()}/files/${encodeURIComponent(file.fileId)}`;
function clearAttachments() { for (const file of attachments.value) if (file.previewUrl) URL.revokeObjectURL(file.previewUrl); attachments.value = []; }
function removeAttachment(index) { const file = attachments.value[index]; if (file.previewUrl) URL.revokeObjectURL(file.previewUrl); attachments.value.splice(index, 1); }
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
  const response = await fetch(`${props.apiBaseUrl.replace(/\/$/, '')}/codex${path}`, {
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
  if (job.status !== 'completed') {
    const failure = new Error(job.error || 'Запрос не завершён. Проверьте историю чата.');
    failure.execution = job.result?.execution;
    throw failure;
  }
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
  let media;
  let accepted = false;
  try {
    const status = await api('/status', null, session); connected.value = status.connected;
    if (!status.connected) throw new Error(status.reason || 'Нет связи с Codex на Mac. Запустите связку Index12.');
    if (!selectedId.value) await createChat(session);
    media = [];
    for (const file of attachments.value) {
      if (!file.uploaded || file.chatId !== selectedId.value) {
        file.uploading = true;
        const response = await fetch(`${codexBase()}/chats/${encodeURIComponent(selectedId.value)}/files`, { method: 'POST', credentials: 'include', signal: session.signal, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), 'X-File-Type': file.mimeType || 'application/octet-stream' }, body: file.file });
        const result = await response.json(); current(session); file.uploading = false;
        if (!response.ok) throw new Error(result.error || 'Не удалось загрузить файл.');
        file.uploaded = result.file; file.chatId = selectedId.value;
      }
      media.push(file.uploaded);
    }
    const fingerprint = JSON.stringify([selectedId.value, text, media]);
    if (retry?.fingerprint !== fingerprint) retry = { fingerprint, requestId: crypto.randomUUID() };
    const { job } = await api(`/chats/${selectedId.value}/jobs`, { kind: 'send', message: text, attachments: media, requestId: retry.requestId }, session);
    accepted = true; retry = null; input.value = ''; clearAttachments();
    messages.value.push({ id: crypto.randomUUID(), role: 'user', text, attachments: media }); scrollBottom();
    const result = await waitJob(job, session); threadId.value = result.threadId;
    messages.value.push({ id: crypto.randomUUID(), role: 'assistant', text: result.text }); scrollBottom();
    chats.value = (await api('/chats', null, session)).chats;
    // Reload canonical history, including messages sent from desktop.
    await history(session);
  } catch (e) {
    if (e.name !== 'AbortError') {
      error.value = e.message;
      if (e.execution) { messages.value.push({ id: `${crypto.randomUUID()}-execution`, role: 'assistant', text: e.execution.text, execution: e.execution }); scrollBottom(); }
      if (e.status === 503) connected.value = false;
      if (accepted) retry = null;
    }
  } finally { if (session === controller) { busy.value = false; attachments.value.forEach(file => { file.uploading = false; }); } }
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
function addFiles(event) {
  error.value = '';
  try {
    const chosen = [...event.target.files];
    if (attachments.value.length + chosen.length > 5) throw new Error('Можно прикрепить до пяти файлов.');
    let total = attachments.value.reduce((sum, file) => sum + file.size, 0);
    for (const file of chosen) {
      if (!file.size) throw new Error(`Файл «${file.name}» пуст.`);
      if (file.size > 10 * 1024 * 1024) throw new Error('Размер файла должен быть не больше 10 МБ.');
      total += file.size;
    }
    if (total > 25 * 1024 * 1024) throw new Error('Общий размер файлов должен быть не больше 25 МБ.');
    attachments.value.push(...chosen.map(file => ({ name: file.name, mimeType: file.type, size: file.size, file, previewUrl: /^image\/(png|jpeg|webp|gif)$/.test(file.type) ? URL.createObjectURL(file) : null })));
  } catch (e) { error.value = e.message; }
  finally { event.target.value = ''; }
}
async function downloadFile(file) {
  if (downloadingFiles.value.has(file.fileId)) return;
  downloadingFiles.value.add(file.fileId);
  try {
    const session = controller;
    const response = await fetch(fileUrl(file), { credentials: 'include', signal: session.signal });
    if (!response.ok) throw new Error('Не удалось скачать файл.');
    const blob = await response.blob(); current(session);
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = file.name || 'Файл'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { downloadingFiles.value.delete(file.fileId); }
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
  input.value = ''; clearAttachments(); downloadingFiles.value.clear(); threadId.value = null; cursor.value = null; error.value = ''; retry = null;
  refresh();
});
onMounted(() => { refresh(); timer = setInterval(() => refresh(), 5000); });
onBeforeUnmount(() => { clearInterval(timer); controller.abort(); stopRecording(); clearAttachments(); });
</script>

<template>
  <section class="desktop-assistant" :class="{ mobile }" aria-label="Помощник Codex">
    <div class="desktop-toolbar">
      <span class="desktop-status" :class="{ online: connected }" :title="connected ? 'Общий сервер Codex доступен' : 'Запустите npm run desktop:bridge на Mac'">Codex · {{ connected ? 'подключён' : 'нет связи' }}</span>
      <button type="button" class="codex-action-btn" :disabled="busy" title="Обновить связь и историю" aria-label="Обновить связь и историю" @click="refresh(true)"><CodexGlyph name="refresh" /></button>
      <button type="button" class="codex-action-btn" :disabled="busy" @click="newChat"><CodexGlyph name="plus" /><span>Новый чат</span></button>
    </div>
    <div class="desktop-chat-picker">
      <div class="desktop-chat-select"><select :value="selectedId" :disabled="busy" aria-label="Чаты Index12" @change="selectChat($event.target.value)">
        <option v-if="!chats.length" value="">Новый чат</option>
        <option v-for="chat in chats" :key="chat.id" :value="chat.id">{{ chat.title || 'Новый чат' }}</option>
      </select><CodexGlyph name="chevron" /></div>
      <a v-if="threadId" :href="`codex://threads/${threadId}`" title="Открыть в desktop-приложении" aria-label="Открыть чат в desktop-приложении"><CodexGlyph name="external" /></a>
    </div>
    <div ref="box" class="codex-messages" aria-live="polite">
      <button v-if="cursor" type="button" class="codex-action-btn" :disabled="busy || !connected" @click="loadOlder">Предыдущие сообщения</button>
      <article v-for="message in messages" :key="message.id" class="codex-message" :class="message.role">
        <div class="codex-bubble">
          <CodexMessageText v-if="message.text" :text="message.text" :plain="message.role === 'user'" />
          <div v-for="(file, i) in message.attachments || []" :key="file.fileId || i" class="desktop-file-message">
            <img v-if="file.url || isImage(file)" class="desktop-image" :src="fileUrl(file)" :alt="file.name || 'Изображение'" />
            <CodexFileCard v-if="file.fileId" :file="file" :loading="downloadingFiles.has(file.fileId)" @download="downloadFile(file)" />
          </div>
          <div v-if="message.role === 'assistant'" class="codex-actions"><button type="button" class="codex-copy-btn" @click="copy(message)"><CodexGlyph :name="message.copied ? 'check' : 'copy'" /><span>{{ message.copied ? 'Скопировано' : 'Копировать' }}</span></button></div>
        </div>
      </article>
      <div v-if="busy" class="codex-typing" aria-label="Codex готовит ответ"><span class="codex-typing-word">Думаю</span><span class="codex-typing-dots" /></div>
    </div>
    <div v-if="error" class="desktop-error" role="alert"><CodexGlyph name="alert" /><span>{{ error }}</span></div>
    <div v-if="attachments.length" class="desktop-attachments" role="region" aria-label="Прикреплённые файлы" tabindex="0">
      <CodexFileCard v-for="(file, i) in attachments" :key="i" :file="file" removable :disabled="busy" :loading="file.uploading" @remove="removeAttachment(i)" />
    </div>
    <input ref="files" type="file" hidden multiple @change="addFiles" />
    <CodexComposer v-model="input" :mobile="mobile" :busy="busy" :recording="recording" :speech-supported="speechSupported"
      attachments-enabled :has-attachments="!!attachments.length" @send="send()" @microphone="toggleRecording" @attach="files.click()" />
  </section>
</template>

<style scoped src="./codexMessages.css"></style>
<style scoped src="./desktopAssistant.css"></style>
