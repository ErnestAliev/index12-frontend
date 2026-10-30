<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DesktopAssistant from './DesktopAssistant.vue';
import CodexIcon from './CodexIcon.vue';
import CodexGlyph from './CodexGlyph.vue';

const props = defineProps({ open: Boolean, mobile: Boolean, apiBaseUrl: { type: String, required: true } });
const emit = defineEmits(['close']);
const panel = ref(null);
const size = ref({ width: 440, height: 650 });
const readViewport = () => ({ width: window.innerWidth, height: window.visualViewport?.height || window.innerHeight, top: window.visualViewport?.offsetTop || 0 });
const viewport = ref(readViewport());
const isCompact = computed(() => props.mobile || viewport.value.width < 600);
const limits = computed(() => ({ width: Math.max(280, viewport.value.width - 88), height: Math.max(280, viewport.value.height - 32) }));
const dimensions = computed(() => isCompact.value ? {
  top: `calc(${viewport.value.top}px + max(8px, env(safe-area-inset-top)))`,
  height: `calc(${viewport.value.height}px - max(8px, env(safe-area-inset-top)) - max(8px, env(safe-area-inset-bottom)))`,
} : {
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
function updateViewport() { viewport.value = readViewport(); }
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
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('scroll', updateViewport);
});
onBeforeUnmount(() => { endResize(); window.removeEventListener('resize', updateViewport); window.visualViewport?.removeEventListener('resize', updateViewport); window.visualViewport?.removeEventListener('scroll', updateViewport); });
</script>

<template>
  <Teleport to="body">
    <section v-if="open" id="codex-chat-window" ref="panel" class="codex-chat-window" :class="{ compact: isCompact }"
      :style="dimensions" role="dialog" aria-label="Чат Codex" :aria-modal="isCompact ? 'true' : 'false'" tabindex="-1" @keydown="escape">
      <header class="codex-window-header">
        <CodexIcon /><span>Codex</span>
        <button type="button" class="codex-close" title="Закрыть" aria-label="Закрыть чат Codex" @click="emit('close')"><CodexGlyph name="close" /></button>
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
  --codex-pane-bg: var(--bg-main, #1a1a1a); --codex-pane-surface: var(--bg-soft, #282828);
  --codex-pane-surface-soft: var(--bg-main, #1a1a1a); --codex-pane-border: var(--color-border, #444);
  --codex-pane-hover: var(--bg-hover, #ffffff0d); --codex-pane-text: #e7e7e7; --codex-pane-muted: #a5a5a5;
  --codex-pane-accent: #34c759; --codex-pane-accent-soft: #34c7591f; --codex-pane-send-text: #092a12;
  --codex-pane-focus: #73a9dd; --codex-pane-focus-soft: #73a9dd1a; --codex-pane-link: #91bef0;
  --codex-pane-danger: #ee817a; --codex-pane-danger-soft: #ee817a12;
  --codex-pane-user: #34c75912; --codex-pane-user-border: #34c75944;
  box-sizing: border-box; container: codex-window / size;
  position: fixed; right: 76px; bottom: 16px; z-index: 2900; display: flex; flex-direction: column;
  min-width: 0; min-height: 0; border: 1px solid var(--codex-pane-border); border-radius: 14px;
  background: var(--codex-pane-bg); color: var(--codex-pane-text); box-shadow: 0 16px 60px #0005; outline: none;
}
.codex-window-header { display: flex; align-items: center; gap: 9px; flex-shrink: 0; min-height: 44px; padding: 0 12px; border-bottom: 1px solid var(--codex-pane-border); font-size: 14px; font-weight: 600; }
.codex-close { margin-left: auto; width: 28px; height: 28px; padding: 0; display: grid; place-items: center; border: 1px solid var(--codex-pane-border); border-radius: 7px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.codex-close:focus-visible { outline: 2px solid var(--codex-pane-focus); outline-offset: 2px; }
.codex-close:hover { background: var(--codex-pane-hover); }
.codex-chat-window :deep(.desktop-assistant) { border-radius: 0 0 13px 13px; }
.resize-handle { position: absolute; touch-action: none; }
.resize-handle:focus-visible { outline: 2px solid var(--color-primary); }
.resize-width { left: -5px; top: 12px; bottom: 0; width: 10px; cursor: ew-resize; }
.resize-height { top: -5px; left: 12px; right: 0; height: 10px; cursor: ns-resize; }
.resize-corner { top: -5px; left: -5px; width: 17px; height: 17px; cursor: nwse-resize; }
.resize-corner::after { content: ''; position: absolute; left: 7px; top: 7px; width: 5px; height: 5px; border-left: 1px solid var(--codex-pane-muted); border-top: 1px solid var(--codex-pane-muted); }
.compact { left: 8px; right: 8px; bottom: auto; width: auto; z-index: 6000; }
:global(html[data-theme="light"] .codex-chat-window) { --codex-pane-text: #242424; --codex-pane-muted: #666; --codex-pane-accent: #168447; --codex-pane-send-text: #fff; --codex-pane-focus: #3474ad; --codex-pane-focus-soft: #3474ad14; --codex-pane-link: #2168a6; --codex-pane-danger: #b7433b; --codex-pane-user: #eaf7ee; --codex-pane-user-border: #c0ddca; color-scheme: light; }
:global(html[data-theme="dark"] .codex-chat-window) { color-scheme: dark; }
@media (pointer: coarse) { .codex-close { width: 36px; height: 36px; } }
@container codex-window (max-height: 420px) { .codex-window-header { min-height: 36px; } }
</style>
