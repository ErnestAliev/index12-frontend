import { computed, ref } from 'vue';
import { CodexVoiceConnection } from '@/utils/codexVoice';

export function useCodexVoice({ api, stopRemote, scopeKey, onStatus, onEvent, onError }) {
  const active = ref(false), phase = ref('connecting'), muted = ref(false), playbackBlocked = ref(false);
  const userCaption = ref(''), assistantCaption = ref('');
  const supported = !!window.RTCPeerConnection && !!navigator.mediaDevices?.getUserMedia;
  let connection, sessionId, sessionStorageKey, pollTimer, sequence = 0, generation = 0;
  const status = computed(() => muted.value ? 'Микрофон выключен' : ({ connecting: 'Подключаюсь', listening: 'Слушаю', thinking: 'Думаю', speaking: 'Отвечаю', question: 'Нужен ваш ответ' }[phase.value] || 'Слушаю'));
  const key = chatId => `index12-live-voice:${scopeKey()}:${chatId}`;
  const reportError = error => {
    if (error.name === 'AbortError') return;
    const messages = { NotAllowedError: 'Разрешите доступ к микрофону в настройках браузера.', NotFoundError: 'Микрофон не найден.', NotReadableError: 'Не удалось включить микрофон. Проверьте, не занят ли он другим приложением.' };
    onError(messages[error.name] || error.message || 'Не удалось включить голосовой диалог.');
  };
  async function stop() {
    generation++; clearTimeout(pollTimer); active.value = false;
    const id = sessionId;
    connection?.stop(); connection = null; sessionId = null;
    muted.value = false; playbackBlocked.value = false; onStatus({ pendingRequests: [], jobId: null });
    if (sessionStorageKey && localStorage.getItem(sessionStorageKey) === id) localStorage.removeItem(sessionStorageKey);
    sessionStorageKey = null;
    if (id) await stopRemote(id).catch(() => {});
  }
  async function start(chatId) {
    if (active.value || !supported) return;
    const token = ++generation;
    active.value = true; phase.value = 'connecting'; userCaption.value = ''; assistantCaption.value = ''; sequence = 0;
    const previous = localStorage.getItem(key(chatId));
    if (previous) await stopRemote(previous).catch(() => {});
    if (token !== generation) return;
    sessionStorageKey = key(chatId); sessionId = crypto.randomUUID(); localStorage.setItem(sessionStorageKey, sessionId);
    const current = new CodexVoiceConnection({ api,
      onState: state => { if (token === generation) { phase.value = state; if (state === 'speaking') assistantCaption.value = ''; } },
      onCaption: (role, text) => { if (token !== generation) return; if (role === 'user') userCaption.value = text;
        else if (role === 'assistant-delta') assistantCaption.value += text; else assistantCaption.value = text; },
      onPlaybackBlocked: blocked => { if (token === generation) playbackBlocked.value = blocked; },
      onError: error => { if (token === generation) { reportError(error); stop(); } },
    });
    connection = current;
    try {
      await current.start(chatId, sessionId);
      if (token !== generation) return;
      const poll = async () => {
        if (token !== generation) return;
        try {
          const result = await api(`/voice/${sessionId}?after=${sequence}`);
          if (token !== generation) return;
          onStatus(result);
          if (result.pendingRequests?.length) phase.value = 'question';
          else if (result.state === 'thinking' && phase.value !== 'speaking') phase.value = 'thinking';
          for (const event of result.events || []) {
            sequence = Math.max(sequence, event.seq);
            if (event.type === 'transcript') { userCaption.value = event.text; assistantCaption.value = ''; }
            if (event.type === 'error') onError(event.message);
            onEvent(event);
          }
          if (result.state === 'closed') { await stop(); return; }
          pollTimer = setTimeout(poll, 650);
        } catch (error) { if (token === generation) { reportError(error); await stop(); } }
      };
      await poll();
    } catch (error) { if (token === generation) { reportError(error); await stop(); } }
  }
  const toggleMute = () => { muted.value = !muted.value; connection?.mute(muted.value); };
  return { active, phase, muted, supported, status, playbackBlocked, userCaption, assistantCaption, start, stop, toggleMute, play: () => connection?.play() };
}
