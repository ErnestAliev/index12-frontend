<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import TeamAppUpdate from './TeamAppUpdate.vue';

const target = ref('body'), notice = ref(null), bounds = ref({});
let observer, disposed = false;
function hide() {
  if (notice.value?.isConnected && notice.value.hidePopover) {
    try { notice.value.hidePopover(); } catch { /* The browser may already have closed a detached modal's popover. */ }
  }
}
function position() {
  const viewport = window.visualViewport, width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
  const styles = getComputedStyle(document.documentElement), inset = edge => parseFloat(styles.getPropertyValue('--safe-area-' + edge)) || 0;
  const keyboard = innerHeight - height > 120;
  bounds.value = {
    right: `${Math.max(0, innerWidth - (viewport?.offsetLeft || 0) - width) + inset('right') + 12}px`,
    bottom: `${Math.max(0, innerHeight - (viewport?.offsetTop || 0) - height) + (keyboard ? 0 : inset('bottom')) + 12}px`,
    width: `${Math.min(360, width - inset('left') - inset('right') - 24)}px`,
    maxHeight: `${Math.max(100, height - inset('top') - (keyboard ? 0 : inset('bottom')) - 24)}px`,
  };
}
async function layer() {
  // A z-index cannot rise above a native dialog. Keep the notice in the
  // active modal's focus scope and use a non-modal popover in the top layer.
  const modal = [...document.querySelectorAll('dialog[open]')].at(-1);
  const next = modal || 'body';
  if (target.value !== next) {
    hide();
    target.value = next;
  }
  await nextTick();
  if (disposed || !notice.value?.isConnected) return;
  position();
  if (notice.value.showPopover && !notice.value.matches(':popover-open')) {
    try { notice.value.showPopover(); } catch { /* Fixed positioning remains available while the modal is being replaced. */ }
  }
}
onMounted(() => {
  observer = new MutationObserver(() => { void layer(); });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  void layer();
});
onBeforeUnmount(() => {
  disposed = true; observer?.disconnect(); hide();
  window.removeEventListener('resize', position);
  window.visualViewport?.removeEventListener('resize', position);
  window.visualViewport?.removeEventListener('scroll', position);
});
</script>
<template>
  <Teleport :to="target"><div ref="notice" class="app-update-notice" popover="manual" :style="bounds"><TeamAppUpdate inline /></div></Teleport>
</template>
<style scoped>
.app-update-notice { position: fixed; inset: auto; z-index: 2147483647; margin: 0; padding: 0; border: 0; box-sizing: border-box; background: transparent; overflow: auto; overscroll-behavior: contain; }
.app-update-notice::backdrop { display: none; }
.app-update-notice :deep(.app-update.is-inline) { margin: 0; width: 100%; }
.app-update-notice :deep(.update-actions) { position: sticky; bottom: 0; padding-top: 4px; background: var(--codex-pane-surface, var(--color-background-soft)); }
</style>
