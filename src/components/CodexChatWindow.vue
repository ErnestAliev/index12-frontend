<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DesktopAssistant from './DesktopAssistant.vue';
import CodexIcon from './CodexIcon.vue';

const props = defineProps({ open: Boolean, mobile: Boolean, apiBaseUrl: { type: String, required: true } });
const emit = defineEmits(['close']);
const panel = ref(null);
const size = ref({ width: 440, height: 650 });
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
const isCompact = computed(() => props.mobile || viewport.value.width < 600);
const limits = computed(() => ({ width: Math.max(280, viewport.value.width - 88), height: Math.max(280, viewport.value.height - 32) }));
const dimensions = computed(() => isCompact.value ? {} : {
  width: `${Math.min(size.value.width, limits.value.width)}px`,
  height: `${Math.min(size.value.height, limits.value.height)}px`,
});
let resize = null, returnFocus = null;
function saveSize() { try { localStorage.setItem('index12-codex-window-size', JSON.stringify(size.value)); } catch { /* Storage unavailable. */ } }
function endResize() {
  if (!resize) return;
  resize = null;
  window.removeEventListener('pointermove', moveResize);
  window.removeEventListener('pointerup', endResize);
  window.removeEventListener('pointercancel', endResize);
  saveSize();
}
function moveResize(event) {
  if (!resize) return;
  if (resize.axis !== 'height') size.value.width = Math.max(320, Math.min(limits.value.width, resize.width + resize.x - event.clientX));
  if (resize.axis !== 'width') size.value.height = Math.max(320, Math.min(limits.value.height, resize.height + resize.y - event.clientY));
}
function startResize(event, axis) {
  if (event.button !== 0 || isCompact.value) return;
  event.preventDefault();
  const rect = panel.value.getBoundingClientRect();
  resize = { axis, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
  window.addEventListener('pointermove', moveResize);
  window.addEventListener('pointerup', endResize);
  window.addEventListener('pointercancel', endResize);
}
function resizeWithKeys(event, axis) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  if (axis !== 'height' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) size.value.width = Math.max(320, Math.min(limits.value.width, size.value.width + (event.key === 'ArrowLeft' ? 20 : -20)));
  if (axis !== 'width' && ['ArrowUp', 'ArrowDown'].includes(event.key)) size.value.height = Math.max(320, Math.min(limits.value.height, size.value.height + (event.key === 'ArrowUp' ? 20 : -20)));
  saveSize();
}
function updateViewport() { viewport.value = { width: window.innerWidth, height: window.innerHeight }; }
function escape(event) { if (props.open && event.key === 'Escape') { event.stopPropagation(); emit('close'); } }
watch(() => props.open, async open => {
  if (open) { returnFocus = document.activeElement; await nextTick(); panel.value?.focus({ preventScroll: true }); }
  else { endResize(); returnFocus?.focus?.({ preventScroll: true }); }
});
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('index12-codex-window-size'));
    if (Number.isFinite(saved?.width) && Number.isFinite(saved?.height)) size.value = { width: Math.max(320, saved.width), height: Math.max(320, saved.height) };
  } catch { /* Use default size. */ }
  window.addEventListener('resize', updateViewport);
});
onBeforeUnmount(() => { endResize(); window.removeEventListener('resize', updateViewport); });
</script>

<template>
  <Teleport to="body">
    <section v-if="open" id="codex-chat-window" ref="panel" class="codex-chat-window" :class="{ compact: isCompact }"
      :style="dimensions" role="dialog" aria-label="Чат Codex" :aria-modal="isCompact ? 'true' : 'false'" tabindex="-1" @keydown="escape">
      <header class="codex-window-header">
        <CodexIcon /><span>Codex</span>
        <button type="button" class="codex-close" title="Закрыть" aria-label="Закрыть чат Codex" @click="emit('close')">×</button>
      </header>
      <DesktopAssistant :api-base-url="apiBaseUrl" :mobile="isCompact" />
      <template v-if="!isCompact">
        <div class="resize-handle resize-width" role="separator" aria-orientation="vertical" aria-label="Ширина чата Codex"
          :aria-valuenow="Math.round(size.width)" tabindex="0" @pointerdown="startResize($event, 'width')" @keydown="resizeWithKeys($event, 'width')" />
        <div class="resize-handle resize-height" role="separator" aria-orientation="horizontal" aria-label="Высота чата Codex"
          :aria-valuenow="Math.round(size.height)" tabindex="0" @pointerdown="startResize($event, 'height')" @keydown="resizeWithKeys($event, 'height')" />
        <div class="resize-handle resize-corner" role="button" aria-label="Размер окна Codex" tabindex="0"
          @pointerdown="startResize($event, 'both')" @keydown="resizeWithKeys($event, 'both')" />
      </template>
    </section>
  </Teleport>
</template>

<style scoped>
.codex-chat-window {
  --codex-pane-bg: var(--color-background, #fff); --codex-pane-surface: var(--color-background-soft, #f5f5f5);
  --codex-pane-surface-soft: var(--color-background, #fff); --codex-pane-border: var(--color-border, #ddd);
  --codex-pane-hover: var(--color-background-mute, #eee); --codex-pane-text: var(--color-text, #222); --codex-pane-muted: var(--text-mute, #777);
  position: fixed; right: 76px; bottom: 16px; z-index: 2900; display: flex; flex-direction: column;
  min-width: 0; min-height: 0; border: 1px solid var(--codex-pane-border); border-radius: 14px;
  background: var(--codex-pane-bg); color: var(--codex-pane-text); box-shadow: 0 16px 60px #0005; outline: none;
}
.codex-window-header { display: flex; align-items: center; gap: 9px; flex-shrink: 0; min-height: 44px; padding: 0 12px; border-bottom: 1px solid var(--codex-pane-border); font-size: 14px; font-weight: 600; }
.codex-close { margin-left: auto; width: 28px; height: 28px; padding: 0; display: grid; place-items: center; border: 1px solid var(--codex-pane-border); border-radius: 7px; background: transparent; color: inherit; font-size: 22px; cursor: pointer; }
.codex-close:hover { background: var(--codex-pane-hover); }
.codex-chat-window :deep(.desktop-assistant) { border-radius: 0 0 13px 13px; }
.resize-handle { position: absolute; touch-action: none; }
.resize-handle:focus-visible { outline: 2px solid var(--color-primary); }
.resize-width { left: -5px; top: 12px; bottom: 0; width: 10px; cursor: ew-resize; }
.resize-height { top: -5px; left: 12px; right: 0; height: 10px; cursor: ns-resize; }
.resize-corner { top: -5px; left: -5px; width: 17px; height: 17px; cursor: nwse-resize; }
.resize-corner::after { content: ''; position: absolute; left: 7px; top: 7px; width: 5px; height: 5px; border-left: 1px solid var(--codex-pane-muted); border-top: 1px solid var(--codex-pane-muted); }
.compact { inset: max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom)); height: auto; width: auto; z-index: 6000; }
</style>
