<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import UiIcon from "./UiIcon.vue";
import { useInputModality } from "@/composables/useInputModality";
const keyboardNavigation = useInputModality();
defineProps({ title: String, busy: Boolean });
const emit = defineEmits(["close"]),
  dialog = ref(null),
  bounds = ref({});
let previous;
function resize() {
  const v = window.visualViewport;
  const style = getComputedStyle(document.documentElement),
    inset = (edge) =>
      parseFloat(style.getPropertyValue(`--safe-area-${edge}`)) || 0,
    width = v?.width || innerWidth,
    height = v?.height || innerHeight,
    top = inset("top"),
    bottom = innerHeight - height > 120 ? 0 : inset("bottom"),
    left = inset("left"),
    right = inset("right");
  bounds.value = {
    left: `${(v?.offsetLeft || 0) + left + (width - left - right) / 2}px`,
    top: `${(v?.offsetTop || 0) + top + (height - top - bottom) / 2}px`,
    maxHeight: `${Math.max(160, height - top - bottom - 24)}px`,
    width: `${Math.min(440, width - left - right - 24)}px`,
  };
  nextTick(() => {
    if (dialog.value?.contains(document.activeElement))
      document.activeElement.scrollIntoView({ block: "nearest" });
  });
}
onMounted(() => {
  previous = document.activeElement;
  resize();
  dialog.value.showModal();
  window.visualViewport?.addEventListener("resize", resize);
  window.addEventListener("resize", resize);
});
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener("resize", resize);
  window.removeEventListener("resize", resize);
  dialog.value?.close();
  window.dispatchEvent(new Event("index12:chat-dialog-closed"));
  previous?.isConnected && previous.focus({ preventScroll: true });
});
</script>
<template>
  <dialog
    ref="dialog"
    class="team-create-dialog"
    :class="{ 'keyboard-navigation': keyboardNavigation }"
    :style="bounds"
    :aria-label="title"
    @keydown.stop
    @cancel.prevent="!busy && emit('close')"
  >
    <header>
      <strong>{{ title }}</strong
      ><button
        type="button"
        :disabled="busy"
        :aria-label="`Закрыть ${title.toLowerCase()}`"
        @click="emit('close')"
      >
        <UiIcon name="close" />
      </button>
    </header>
    <slot />
  </dialog>
</template>
<style scoped>
.team-create-dialog {
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 0;
  transform: translate(-50%, -50%);
  max-width: none;
  box-sizing: border-box;
  border: 1px solid var(--codex-pane-border);
  border-radius: 12px;
  background: var(--codex-pane-bg);
  color: var(--codex-pane-text);
  font:
    14px/1.4 system-ui,
    sans-serif;
  box-shadow: 0 16px 60px #0004;
  overflow: hidden;
}
.team-create-dialog[open] {
  display: flex;
  flex-direction: column;
}
.team-create-dialog::backdrop {
  background: #0006;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  min-height: 44px;
  padding: 0 12px;
  border-bottom: 1px solid var(--codex-pane-border);
}
strong {
  font-size: 14px;
  font-weight: 500;
}
header button {
  display: grid !important;
  place-items: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  color: inherit;
  cursor: pointer;
}
.team-create-dialog:not(.keyboard-navigation) :deep(button:focus-visible),
.team-create-dialog:not(.keyboard-navigation)
  :deep(.zoom-image-stage:focus-visible) {
  outline: none !important;
  box-shadow: none !important;
}
header button:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: -4px;
}
</style>
