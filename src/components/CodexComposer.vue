<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import CodexGlyph from "./CodexGlyph.vue";
const props = defineProps({
  modelValue: { type: String, default: "" },
  busy: Boolean,
  recording: Boolean,
  speechSupported: Boolean,
  mobile: Boolean,
  focusOnTouch: Boolean,
  attachmentsEnabled: Boolean,
  hasAttachments: Boolean,
  hideMicrophone: Boolean,
  liveVoice: Boolean,
  voiceAvailable: Boolean,
  voiceSupported: Boolean,
  placeholder: { type: String, default: "Спросите Codex" },
});
const emit = defineEmits([
  "update:modelValue",
  "send",
  "microphone",
  "attach",
  "voice",
]);
const input = ref(null),
  focused = ref(false);
const media = window.matchMedia("(max-width: 1024px), (pointer: coarse)"),
  deviceCompact = ref(media.matches);
const touch = computed(() => props.mobile || deviceCompact.value);
const payload = computed(
  () => !!props.modelValue.trim() || props.hasAttachments,
);
const expanded = computed(
  () => touch.value && (focused.value || payload.value || props.recording),
);
let observer,
  pointerDown = false,
  pendingBlur = false,
  blurFrame;
function focusField() {
  cancelAnimationFrame(blurFrame);
  pendingBlur = false;
  focused.value = true;
}
function focusFromTouch(event) {
  if (!props.focusOnTouch || !touch.value || (event.pointerType && event.pointerType === 'mouse')) return;
  // Focus synchronously in the trusted tap, before reactive layout updates.
  input.value?.focus({ preventScroll: true });
}
function blurField() {
  // Keep the message/file under the pointer until its click is delivered.
  if (pointerDown) pendingBlur = true;
  else focused.value = false;
}
function beginPointer() {
  pointerDown = true;
}
function endPointer() {
  pointerDown = false;
  if (!pendingBlur) return;
  blurFrame = requestAnimationFrame(() => {
    if (pendingBlur) focused.value = false;
    pendingBlur = false;
  });
}
const resize = () =>
  nextTick(() => {
    const field = input.value;
    if (!field) return;
    const panelHeight =
      field.closest(".codex-chat-window")?.clientHeight || window.innerHeight;
    const min = touch.value ? 44 : 36,
      max = Math.max(
        min,
        Math.min(
          touch.value ? 120 : 180,
          panelHeight * (panelHeight < 420 ? 0.2 : 0.25),
        ),
      );
    field.style.height = "auto";
    const height = props.modelValue ? Math.max(min, field.scrollHeight) : min;
    field.style.height = `${Math.min(height, max)}px`;
    field.style.overflowY = height > max ? "auto" : "hidden";
  });
function changedDevice() {
  deviceCompact.value = media.matches;
  resize();
}
function keydown(event) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!props.busy && payload.value) emit("send");
}
watch(() => [props.modelValue, expanded.value, touch.value], resize);
onMounted(() => {
  resize();
  document.addEventListener("pointerdown", beginPointer, true);
  document.addEventListener("pointerup", endPointer, true);
  document.addEventListener("pointercancel", endPointer, true);
  window.addEventListener("blur", endPointer);
  media.addEventListener("change", changedDevice);
  const panel = input.value?.closest(".codex-chat-window");
  if (panel && typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(resize);
    observer.observe(panel);
  }
});
onBeforeUnmount(() => {
  cancelAnimationFrame(blurFrame);
  document.removeEventListener("pointerdown", beginPointer, true);
  document.removeEventListener("pointerup", endPointer, true);
  document.removeEventListener("pointercancel", endPointer, true);
  window.removeEventListener("blur", endPointer);
  observer?.disconnect();
  media.removeEventListener("change", changedDevice);
});
</script>
<template>
  <form
    class="codex-input-container"
    :class="{ touch, expanded, 'with-files': hasAttachments }"
    :aria-busy="busy"
    @submit.prevent="!busy && payload && emit('send')"
  >
    <div class="codex-input-wrapper">
      <div v-if="hasAttachments" class="codex-composer-media">
        <slot name="attachments" />
      </div>
      <div class="codex-input-leading">
        <slot name="leading"
          ><button
            type="button"
            class="codex-attach-btn"
            :disabled="busy || !attachmentsEnabled"
            :title="
              attachmentsEnabled
                ? 'Прикрепить файл'
                : 'Прикрепить файл (недоступно)'
            "
            aria-label="Прикрепить файл"
            @click="emit('attach')"
          >
            <CodexGlyph name="plus" /></button
        ></slot>
      </div>
      <textarea
        ref="input"
        :value="modelValue"
        class="codex-input"
        :placeholder="placeholder"
        :aria-label="placeholder"
        rows="1"
        maxlength="16000"
        @focus="focusField"
        @pointerup="focusFromTouch"
        @touchend="focusFromTouch"
        @blur="blurField"
        @input="emit('update:modelValue', $event.target.value)"
        @keydown="keydown"
      />
      <div class="codex-input-buttons">
        <button
          v-if="!hideMicrophone"
          type="button"
          class="codex-mic-btn"
          :class="{ recording }"
          :disabled="busy || !speechSupported"
          :title="
            speechSupported
              ? recording
                ? 'Остановить диктовку'
                : 'Голосовой ввод'
              : 'Голосовой ввод не поддерживается'
          "
          aria-label="Голосовой ввод"
          :aria-pressed="recording"
          @click="emit('microphone')"
        >
          <CodexGlyph name="microphone" />
        </button>
        <button
          v-if="liveVoice && !payload"
          type="button"
          class="codex-mic-btn codex-live-voice-btn"
          :disabled="busy || !voiceAvailable || !voiceSupported"
          :title="
            !voiceSupported
              ? 'Голосовой диалог не поддерживается в этом браузере'
              : !voiceAvailable
                ? 'Голосовой диалог пока недоступен'
                : 'Начать голосовой диалог'
          "
          aria-label="Начать голосовой диалог"
          @click="emit('voice')"
        >
          <CodexGlyph name="waveform" />
        </button>
        <button
          v-if="!liveVoice || payload"
          type="submit"
          class="codex-send-btn"
          :disabled="busy || !payload"
          title="Отправить (Enter)"
          aria-label="Отправить"
        >
          <CodexGlyph name="send" />
        </button>
      </div>
    </div>
  </form>
</template>
<style scoped src="./codexComposer.css"></style>
