<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';
const props = defineProps({
  modelValue: { type: String, default: '' }, busy: Boolean, recording: Boolean,
  speechSupported: Boolean, mobile: Boolean, attachmentsEnabled: Boolean, hasAttachments: Boolean,
  placeholder: { type: String, default: 'Спросите Codex' },
});
const emit = defineEmits(['update:modelValue', 'send', 'microphone', 'attach', 'input-ready']);
const input = ref(null);
const resize = () => nextTick(() => {
  if (!input.value) return;
  const max = props.mobile ? 100 : Math.max(96, (input.value.closest('.journal-ai-pane')?.clientHeight || window.innerHeight) * .3);
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
onMounted(() => { resize(); emit('input-ready', input.value); });
</script>

<template>
  <form class="ai-input-container" :class="{ mobile }" @submit.prevent="emit('send')">
    <div class="ai-input-wrapper">
      <button type="button" class="ai-attach-btn" :disabled="busy || !attachmentsEnabled"
        :title="attachmentsEnabled ? 'Прикрепить изображение' : 'Прикрепить файл (скоро)'" aria-label="Прикрепить файл" @click="emit('attach')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
      </button>
      <textarea ref="input" :value="modelValue" class="ai-input" :placeholder="placeholder" :aria-label="placeholder"
        rows="1" maxlength="16000" @input="emit('update:modelValue', $event.target.value)" @keydown="keydown" />
      <div class="ai-input-buttons">
        <button type="button" class="ai-mic-btn" :class="{ recording }" :disabled="busy || !speechSupported"
          :title="speechSupported ? (recording ? 'Остановить запись' : 'Голосовой ввод') : 'Голосовой ввод не поддерживается'"
          aria-label="Голосовой ввод" :aria-pressed="recording" @click="emit('microphone')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" /><path d="M19 11a7 7 0 0 1-14 0" /><path d="M12 19v4m-4 0h8" /></svg>
        </button>
        <button type="submit" class="ai-send-btn" :disabled="busy || !(modelValue.trim() || hasAttachments)" title="Отправить (Enter)" aria-label="Отправить">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-11 11" /><path d="m22 2-7 20-4-9-9-4 20-7Z" /></svg>
        </button>
      </div>
    </div>
  </form>
</template>

<style scoped src="./assistantComposer.css"></style>
