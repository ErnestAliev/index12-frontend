<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CodexGlyph from './CodexGlyph.vue';
const props = defineProps({
  modelValue: { type: String, default: '' }, busy: Boolean, recording: Boolean,
  speechSupported: Boolean, mobile: Boolean, attachmentsEnabled: Boolean, hasAttachments: Boolean,
  placeholder: { type: String, default: 'Спросите Codex' },
});
const emit = defineEmits(['update:modelValue', 'send', 'microphone', 'attach']);
const input = ref(null);
let observer;
const resize = () => nextTick(() => {
  if (!input.value) return;
  const panelHeight = input.value.closest('.codex-chat-window')?.clientHeight || window.innerHeight;
  const max = Math.max(56, Math.min(props.mobile ? 120 : 180, panelHeight * (panelHeight < 420 ? .16 : .2)));
  input.value.style.height = 'auto';
  const height = input.value.scrollHeight;
  input.value.style.height = `${Math.min(height, max)}px`;
  input.value.style.overflowY = height > max ? 'auto' : 'hidden';
});
function keydown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!props.busy && (props.modelValue.trim() || props.hasAttachments)) emit('send');
}
watch(() => props.modelValue, resize);
onMounted(() => {
  resize();
  const panel = input.value?.closest('.codex-chat-window');
  if (panel && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize);
    observer.observe(panel);
  }
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <form class="codex-input-container" :class="{ mobile }" @submit.prevent="emit('send')">
    <div class="codex-input-wrapper">
      <button type="button" class="codex-attach-btn" :disabled="busy || !attachmentsEnabled"
        :title="attachmentsEnabled ? 'Прикрепить файл' : 'Прикрепить файл (недоступно)'" aria-label="Прикрепить файл" @click="emit('attach')">
        <CodexGlyph name="attach" />
      </button>
      <textarea ref="input" :value="modelValue" class="codex-input" :placeholder="placeholder" :aria-label="placeholder"
        rows="1" maxlength="16000" @input="emit('update:modelValue', $event.target.value)" @keydown="keydown" />
      <div class="codex-input-buttons">
        <button type="button" class="codex-mic-btn" :class="{ recording }" :disabled="busy || !speechSupported"
          :title="speechSupported ? (recording ? 'Остановить запись' : 'Голосовой ввод') : 'Голосовой ввод не поддерживается'"
          aria-label="Голосовой ввод" :aria-pressed="recording" @click="emit('microphone')">
          <CodexGlyph name="microphone" />
        </button>
        <button type="submit" class="codex-send-btn" :disabled="busy || !(modelValue.trim() || hasAttachments)" title="Отправить (Enter)" aria-label="Отправить">
          <CodexGlyph name="send" />
        </button>
      </div>
    </div>
  </form>
</template>

<style scoped src="./codexComposer.css"></style>
