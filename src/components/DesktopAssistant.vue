<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useCodexDeliveryStore } from '@/stores/codexDeliveryStore';
import CodexComposer from './CodexComposer.vue';
import CodexGlyph from './CodexGlyph.vue';
import CodexFileCard from './CodexFileCard.vue';
import TeamMediaPreview from './TeamMediaPreview.vue';
import { useTeamMedia } from '@/composables/useTeamMedia';
import CodexMessageText from './CodexMessageText.vue';
import CodexRequestCard from './CodexRequestCard.vue';
import CodexVoicePanel from './CodexVoicePanel.vue';
import { useCodexVoice } from '@/composables/useCodexVoice';
import { useChatDictation } from '@/composables/useChatDictation';
import { useFileDrop } from '@/composables/useFileDrop';
import { useChatTransfer } from '@/composables/useChatTransfer';
import { taskReferenceText } from '@/utils/chatTransfer';
import ChatFileDropOverlay from './ChatFileDropOverlay.vue';

const props = defineProps({ apiBaseUrl: { type: String, required: true }, mobile: Boolean });
const store = useMainStore();
const delivery = useCodexDeliveryStore();
const scopeKey = computed(() => `${store.user?._id || store.user?.id || ''}:${store.user?.currentWorkspaceId || ''}`);
const chats = ref([]), selectedId = ref(''), messages = ref([]), input = ref(''), attachments = ref([]);
const taskRefs = ref([]), transfer = useChatTransfer('codex');
const connected = ref(false), busy = ref(false), error = ref(''), threadId = ref(null), cursor = ref(null), box = ref(null), files = ref(null);
const provider = ref('desktop');
const dictation = useChatDictation({ getText: () => input.value, setText: text => { input.value = text; }, onError: message => { error.value = message; } });
const { recording, supported: speechSupported, stop: stopRecording } = dictation;
const voiceAvailable = ref(false);
const downloadingFiles = ref(new Set());
const pendingRequests = ref([]), activeJobId = ref(null), submittingAnswers = ref(new Set()), answerErrors = ref({});
let controller = new AbortController(), timer, refreshing = false;
const visibleMessages = computed(() => [...messages.value, ...delivery.rows.filter(row => (!row.chatId || row.chatId === selectedId.value) && !messages.value.some(message => message.id === row.id))]);
const codexBase = () => `${props.apiBaseUrl.replace(/\/$/, '')}/codex`;
const isImage = file => /^image\/(png|jpeg|webp|gif)$/.test(file.mimeType || '');
const fileUrl = file => file.previewUrl || file.url || `${codexBase()}/files/${encodeURIComponent(file.fileId)}`;
const deviceSharing = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
const media = useTeamMedia({
  getScope: () => (store.user?._id || store.user?.id) && store.user?.currentWorkspaceId ? JSON.stringify(['assistant', scopeKey.value]) : '',
  fetchFile: async (file, signal) => {
    const response = await fetch(file.fileId ? `${codexBase()}/files/${encodeURIComponent(file.fileId)}` : fileUrl(file), { credentials: 'include', signal });
    if (!response.ok) throw Error('Не удалось загрузить файл');
    return response.blob();
  },
});
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
const voice = useCodexVoice({ api, scopeKey: () => scopeKey.value,
  stopRemote: id => fetch(`${codexBase()}/voice/${encodeURIComponent(id)}/stop`, { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  onStatus: state => { pendingRequests.value = state.pendingRequests || []; activeJobId.value = state.jobId || null; },
  onError: message => { error.value = message; },
  onEvent: event => {
    if (event.type === 'transcript') { messages.value.push({ id: `voice-user-${event.itemId}`, role: 'user', text: event.text }); scrollBottom(); }
    if (event.type === 'result') {
      messages.value.push({ id: `voice-answer-${event.itemId}`, role: 'assistant', text: event.text });
      if (event.threadId) threadId.value = event.threadId;
      scrollBottom();
    }
  },
});
const { active: voiceActive, phase: voicePhase, muted: voiceMuted, status: voiceStatus, playbackBlocked: voicePlaybackBlocked, userCaption, assistantCaption } = voice;
async function startVoice() {
  if (busy.value || voiceActive.value || !voiceAvailable.value) return;
  error.value = ''; stopRecording();
  if (!selectedId.value) {
    busy.value = true;
    try { await createChat(controller); } catch (e) { error.value = e.message; return; }
    finally { busy.value = false; }
  }
  await voice.start(selectedId.value);
}
async function stopVoice() {
  await voice.stop();
  if (selectedId.value && connected.value) await selectChat(selectedId.value);
}
async function waitJob(job, session) {
  // The cloud worker has a ten-minute job budget; keep polling through its final receipt.
  const waitBudget = 650000;
  let deadline = Date.now() + waitBudget;
  const showRequests = () => { activeJobId.value = job.id; pendingRequests.value = job.pendingRequests || []; if (pendingRequests.value.length) deadline = Date.now() + waitBudget; };
  showRequests();
  while (['queued', 'running'].includes(job.status)) {
    if (Date.now() > deadline) throw new Error('Ответ ещё выполняется. Обновите историю перед повторной отправкой.');
    await pause(1000, session);
    try { job = (await api(`/jobs/${encodeURIComponent(job.id)}`, null, session)).job; }
    catch (error) { if (session === controller) { pendingRequests.value = []; activeJobId.value = null; } throw error; }
    showRequests();
  }
  pendingRequests.value = []; activeJobId.value = null;
  if (job.status !== 'completed') {
    const failure = new Error(job.error || 'Запрос не завершён. Проверьте историю чата.');
    failure.execution = job.result?.execution;
    throw failure;
  }
  return job.result || {};
}
async function answerCodex(request, answer) {
  const session = controller, jobId = activeJobId.value;
  if (!jobId || submittingAnswers.value.has(request.id)) return;
  submittingAnswers.value.add(request.id); answerErrors.value[request.id] = '';
  try {
    await api(`/jobs/${encodeURIComponent(jobId)}/requests/${encodeURIComponent(request.id)}/answer`, answer, session);
    pendingRequests.value = pendingRequests.value.filter(row => row.id !== request.id);
  } catch (error) { if (error.name !== 'AbortError') answerErrors.value[request.id] = error.message; }
  finally { submittingAnswers.value.delete(request.id); }
}
watch(() => pendingRequests.value.map(request => request.id).join(','), () => { if (pendingRequests.value.length) scrollBottom(); });
function showHistory(result, older = false, allowTextMatch = true) {
  const rows = (result.messages || []).map(m => ({ ...m, text: m.content }));
  if (!older) delivery.reconcile(selectedId.value, rows, allowTextMatch);
  const unique = new Map((older ? [...rows, ...messages.value] : rows).map(m => [m.id, m]));
  messages.value = [...unique.values()]; cursor.value = result.nextCursor || null;
  if (!older) scrollBottom();
}
async function history(session, older = false) {
  const { job } = await api(`/chats/${selectedId.value}/jobs`, { kind: 'history', requestId: crypto.randomUUID(), cursor: older ? cursor.value : null }, session);
  showHistory(await waitJob(job, session), older);
}
async function selectChat(id) {
  if (busy.value || voiceActive.value || !id) return;
  const session = controller;
  selectedId.value = id; localStorage.setItem(storageKey(), id);
  busy.value = true; error.value = ''; messages.value = []; cursor.value = null; threadId.value = null;
  try {
    const data = await api(`/chats/${encodeURIComponent(id)}`, null, session);
    threadId.value = data.chat.threadId;
    if (data.cachedHistory) showHistory(data.cachedHistory, false, !data.pendingJob);
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
  messages.value = []; cursor.value = null;
  localStorage.setItem(storageKey(), selectedId.value);
}
async function newChat() {
  if (busy.value || voiceActive.value) return;
  const session = controller; busy.value = true; error.value = '';
  try { await createChat(session); } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { if (session === controller) busy.value = false; }
}
async function send(forced, existing = null) {
  const draft = (typeof forced === 'string' ? forced : input.value).trim();
  const text = existing ? existing.text : draft + taskReferenceText(taskRefs.value);
  if ((!text && !(existing?.sourceFiles || attachments.value).length) || busy.value || transfer.pending.value || voiceActive.value) return;
  if (text.length > 16000) { error.value = 'Сообщение со ссылками должно быть не длиннее 16 000 символов.'; return; }
  const session = controller;
  delivery.setScope(scopeKey.value);
  const attempt = existing || delivery.add({ id: 'local:'+crypto.randomUUID(), requestId:crypto.randomUUID(), role:'user', text, chatId:selectedId.value, attachments:[...attachments.value], sourceFiles:[...attachments.value], knownIds:messages.value.filter(row=>row.role==='user').map(row=>row.id), delivery:'sending', sendError:'', accepted:false });
  if (!existing) {
    if (typeof forced !== 'string' || input.value.trim() === draft) input.value = '';
    attachments.value = [];
    taskRefs.value = [];
  }
  attempt.delivery = 'sending'; attempt.sendError = '';
  busy.value = true; error.value = ''; stopRecording(); scrollBottom();
  try {
    const status = await api('/status', null, session); connected.value = status.connected; provider.value = status.provider || 'desktop';
    if (!status.connected) throw new Error(status.reason || 'Нет связи с Codex на Mac. Запустите связку Index12.');
    if (!attempt.chatId) { await createChat(session); attempt.chatId = selectedId.value; }
    const media = [];
    for (const file of attempt.sourceFiles) {
      if (!file.uploaded || file.chatId !== attempt.chatId) {
        file.uploading = true;
        const response = await fetch(`${codexBase()}/chats/${encodeURIComponent(attempt.chatId)}/files`, { method:'POST', credentials:'include', signal:session.signal, headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-File-Type':file.mimeType || 'application/octet-stream'}, body:file.file });
        const result = await response.json(); current(session); file.uploading = false;
        if (!response.ok) throw new Error(result.error || 'Не удалось загрузить файл.');
        file.uploaded = result.file; file.chatId = attempt.chatId;
      }
      media.push(file.uploaded);
    }
    const { job } = await api(`/chats/${encodeURIComponent(attempt.chatId)}/jobs`, { kind:'send', message:text, attachments:media, requestId:attempt.requestId }, session);
    attempt.accepted = true; attempt.delivery = 'processing'; attempt.attachments = media;
    const result = await waitJob(job, session); current(session); threadId.value = result.threadId;
    messages.value.push({ id:attempt.id, role:'user', text, attachments:media });
    delivery.remove(attempt.id);
    messages.value.push({ id:crypto.randomUUID(), role:'assistant', text:result.text }); scrollBottom();
    chats.value = (await api('/chats', null, session)).chats;
    await history(session);
  } catch (e) {
    if (e.name !== 'AbortError') {
      error.value = e.message;
      if (delivery.rows.some(row=>row.id===attempt.id)) { attempt.delivery = attempt.accepted ? 'sent' : 'failed'; attempt.sendError = e.message; }
      if (e.execution && attempt.accepted) { messages.value.push({ id:attempt.id,role:'user',text:attempt.text,attachments:attempt.attachments }); delivery.remove(attempt.id); }
      if (e.execution) { messages.value.push({ id:`${crypto.randomUUID()}-execution`,role:'assistant',text:e.execution.text,execution:e.execution }); scrollBottom(); }
      if (e.status === 503) connected.value = false;
    }
  } finally { if (session === controller) { busy.value = false; attempt.sourceFiles.forEach(file=>{file.uploading=false;}); } }
}
async function loadOlder() {
  if (busy.value || voiceActive.value) return;
  const session = controller; busy.value = true; error.value = '';
  try { await history(session, true); } catch (e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { if (session === controller) busy.value = false; }
}
async function refresh(manual = false) {
  if (refreshing || busy.value || voiceActive.value) return;
  const session = controller; refreshing = true;
  try {
    const status = await api('/status', null, session);
    const wasConnected = connected.value; connected.value = status.connected;
    provider.value = status.provider || 'desktop';
    voiceAvailable.value = status.voiceAvailable === true;
    chats.value = (await api('/chats', null, session)).chats;
    const saved = localStorage.getItem(storageKey());
    const id = chats.value.find(c => c.id === (selectedId.value || saved))?.id || chats.value[0]?.id;
    if (id && (!selectedId.value || manual || (!wasConnected && connected.value))) await selectChat(id);
  } catch (e) { if (e.name !== 'AbortError') { connected.value = false; error.value = e.message; } }
  finally { if (session === controller) refreshing = false; }
}
function addFiles(event) {
  addSelectedFiles(Array.from(event.target.files || []));
  event.target.value = '';
}
function addSelectedFiles(chosen) {
  if (busy.value || voiceActive.value || !chosen.length) return;
  error.value = '';
  try {
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
}
const { dragging: draggingFiles, dropEvents: fileDropEvents } = useFileDrop({
  enabled: () => !busy.value && !transfer.pending.value && !voiceActive.value && !media.preview.value,
  onFiles: addSelectedFiles,
  onItem: async token => {
    const item = await transfer.accept(token);
    if (item?.file) addSelectedFiles([item.file]);
    if (item?.task && !taskRefs.value.some(ref => ref.id === item.task.id)) {
      if (taskRefs.value.length >= 5) throw Error('Можно добавить до пяти задач.');
      taskRefs.value.push(item.task);
    }
  },
  onError: message => { error.value = message; },
});
async function downloadFile(file) {
  if (!file.fileId || downloadingFiles.value.has(file.fileId)) return;
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
function toggleRecording() { if (!busy.value) { error.value = ''; dictation.toggle(); } }

async function copy(message) {
  try { await navigator.clipboard.writeText(message.text); message.copied = true; } catch { error.value = 'Не удалось скопировать сообщение.'; }
}
watch(scopeKey, () => {
  voice.stop(); voiceAvailable.value = false;
  controller.abort(); controller = new AbortController(); stopRecording();
  refreshing = false; busy.value = false; connected.value = false; chats.value = []; selectedId.value = ''; messages.value = [];
  input.value = ''; taskRefs.value = []; clearAttachments(); downloadingFiles.value.clear(); threadId.value = null; cursor.value = null; error.value = ''; delivery.setScope(scopeKey.value);
  pendingRequests.value = []; activeJobId.value = null; answerErrors.value = {}; submittingAnswers.value.clear();
  refresh();
});
onMounted(() => { delivery.setScope(scopeKey.value); refresh(); timer = setInterval(() => refresh(), 5000); });
onBeforeUnmount(() => { delivery.interrupt(); voice.stop(); clearInterval(timer); controller.abort(); stopRecording(); clearAttachments(); });
</script>

<template>
  <section class="desktop-assistant" :class="{ mobile }" aria-label="Помощник Codex" v-on="fileDropEvents">
    <ChatFileDropOverlay v-if="draggingFiles" />
    <TeamMediaPreview v-if="media.preview.value" :media="media.preview.value" @close="media.closePreview" @retry="media.retryPreview" />
    <div class="desktop-toolbar">
      <span class="desktop-status" :class="{ online: connected }" :title="connected ? (provider === 'cloud' ? 'Работает на сервере INDEX12 независимо от Mac' : 'Подключён Codex на Mac') : 'Помощник недоступен'">Codex · {{ connected ? (provider === 'cloud' ? 'сервер' : 'подключён') : 'нет связи' }}</span>
      <button type="button" class="codex-action-btn" :disabled="busy || voiceActive" title="Обновить связь и историю" aria-label="Обновить связь и историю" @click="refresh(true)"><CodexGlyph name="refresh" /></button>
      <button type="button" class="codex-action-btn" :disabled="busy || voiceActive" @click="newChat"><CodexGlyph name="plus" /><span>Новый чат</span></button>
    </div>
    <div class="desktop-chat-picker">
      <div class="desktop-chat-select"><select :value="selectedId" :disabled="busy || voiceActive" aria-label="Чаты Index12" @change="selectChat($event.target.value)">
        <option v-if="!chats.length" value="">Новый чат</option>
        <option v-for="chat in chats" :key="chat.id" :value="chat.id">{{ chat.title || 'Новый чат' }}</option>
      </select><CodexGlyph name="chevron" /></div>
      <a v-if="threadId" :href="`codex://threads/${threadId}`" title="Открыть в desktop-приложении" aria-label="Открыть чат в desktop-приложении"><CodexGlyph name="external" /></a>
    </div>
    <div ref="box" class="codex-messages" aria-live="polite">
      <button v-if="cursor" type="button" class="codex-action-btn" :disabled="busy || !connected" @click="loadOlder">Предыдущие сообщения</button>
      <article v-for="message in visibleMessages" :key="message.id" class="codex-message" :class="message.role">
        <div class="codex-bubble">
          <CodexMessageText v-if="message.text" :text="message.text" :plain="message.role === 'user'" />
          <div v-for="(file, i) in message.attachments || []" :key="file.fileId || i" class="desktop-file-message">
            <img v-if="file.previewUrl || file.url || isImage(file)" class="desktop-image" :src="fileUrl(file)" :alt="file.name || 'Изображение'" :draggable="!!file.fileId && !!transfer.scope.value" @dragstart="transfer.file($event, () => media.readFile(file))" />
            <CodexFileCard v-if="file.fileId || file.name" :file="file" :disabled="!file.fileId" :draggable="!!file.fileId && !!transfer.scope.value" @dragstart="transfer.file($event, () => media.readFile(file))" :uploading="!!file.uploading" :loading="file.uploading || downloadingFiles.has(file.fileId)" :shareable="deviceSharing" @download="downloadFile(file)" @share="media.download(file)" />
          </div>
          <div v-if="message.delivery" class="codex-delivery" :class="{failed:message.delivery==='failed'}" role="status"><span :title="message.sendError">{{ message.delivery==='sending'?'Отправляется…':message.delivery==='failed'?'Не отправлено':message.delivery==='processing'?'Обрабатывается…':'Отправлено' }}</span><button v-if="message.delivery==='failed'" type="button" class="codex-action-btn" :disabled="busy || voiceActive" @click="send(undefined,message)">Повторить отправку</button></div>
          <div v-if="message.role === 'assistant'" class="codex-actions"><button type="button" class="codex-copy-btn" @click="copy(message)"><CodexGlyph :name="message.copied ? 'check' : 'copy'" /><span>{{ message.copied ? 'Скопировано' : 'Копировать' }}</span></button></div>
        </div>
      </article>
      <CodexRequestCard v-for="request in pendingRequests" :key="request.id" :request="request" :submitting="submittingAnswers.has(request.id)" :error="answerErrors[request.id]" @answer="answerCodex(request, $event)" />
      <div v-if="busy && !pendingRequests.length && !delivery.rows.some(row => row.delivery === 'sending')" class="codex-typing" aria-label="Codex готовит ответ"><span class="codex-typing-word">Думаю</span><span class="codex-typing-dots" /></div>
    </div>
    <div v-if="error" class="desktop-error" role="alert"><CodexGlyph name="alert" /><span>{{ error }}</span></div>
    <input ref="files" type="file" hidden multiple @change="addFiles" />
    <CodexVoicePanel v-if="voiceActive" :status="voiceStatus" :phase="voicePhase" :muted="voiceMuted" :caption="assistantCaption || userCaption" :playback-blocked="voicePlaybackBlocked"
      @stop="stopVoice" @mute="voice.toggleMute" @play="voice.play" />
    <CodexComposer v-else v-model="input" :mobile="mobile" :busy="busy || transfer.pending.value" :recording="recording" :speech-supported="speechSupported"
      live-voice :voice-available="voiceAvailable" :voice-supported="voice.supported" attachments-enabled :has-attachments="!!attachments.length || !!taskRefs.length"
      @voice="startVoice" @send="send()" @microphone="toggleRecording" @attach="files.click()">
      <template #attachments>
        <div v-if="attachments.length || taskRefs.length" class="desktop-attachments" role="region" aria-label="Прикреплённые файлы и задачи" tabindex="0">
          <div v-for="(task, i) in taskRefs" :key="task.id" class="desktop-task-reference">
            <CodexGlyph name="file" /><a :href="task.url" target="_blank" rel="noopener">{{ task.title }}</a>
            <button type="button" :disabled="busy" :aria-label="`Убрать задачу ${task.title}`" @click="taskRefs.splice(i, 1)"><CodexGlyph name="close" /></button>
          </div>
          <CodexFileCard v-for="(file, i) in attachments" :key="i" :file="file" removable :disabled="busy" :loading="file.uploading" @remove="removeAttachment(i)" />
        </div>
      </template>
    </CodexComposer>
  </section>
</template>

<style scoped src="./codexMessages.css"></style>
<style scoped src="./desktopAssistant.css"></style>
