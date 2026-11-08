<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import TeamChatDialog from './TeamChatDialog.vue';
import TeamZoomableImage from './TeamZoomableImage.vue';
import UiIcon from './UiIcon.vue';
import { canShareDeviceFile, shareDeviceFile, saveDeviceFile } from '@/utils/deviceFiles';
const props = defineProps({ media: { type: Object, required: true } });
const emit = defineEmits(['close', 'retry']);
const sharing = ref(false), actionError = ref(''), actions = ref(null);
const shareAvailable = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
const shareSupported = computed(() => canShareDeviceFile(props.media.file));
let active = true;
onBeforeUnmount(() => { active = false; });
watch(() => props.media.file, () => { actionError.value = ''; });
function save() {
  if (!props.media.file || sharing.value) return;
  actionError.value = '';
  try { saveDeviceFile(props.media.file, actions.value); }
  catch { actionError.value = 'Не удалось начать скачивание. Попробуйте ещё раз.'; }
}
async function share() {
  if (!props.media.file || sharing.value) return;
  actionError.value = ''; sharing.value = true;
  try { await shareDeviceFile(props.media.file); }
  catch (e) { if (active && e.name !== 'AbortError') actionError.value = e.name === 'NotAllowedError' ? 'Не удалось открыть отправку файла. Нажмите «Поделиться» ещё раз или скачайте файл.' : e.message || 'Не удалось передать файл'; }
  finally { if (active) sharing.value = false; }
}
</script>
<template>
  <TeamChatDialog class="media-preview-dialog" :title="media.name" :busy="sharing" @close="emit('close')">
    <div v-if="!media.url" class="media-state" :role="media.error ? 'alert' : 'status'">
      <span>{{ media.error || 'Загрузка…' }}</span>
      <button v-if="media.error" type="button" @click="emit('retry')">Повторить</button>
    </div>
    <TeamZoomableImage v-if="media.url && media.mimeType.startsWith('image/')" :src="media.url" :alt="media.name" />
    <iframe v-else-if="media.url && media.mimeType === 'application/pdf'" :src="media.url" :title="media.name" class="media-pdf-preview" />
    <div v-else-if="media.url && media.mimeType.startsWith('video/')" class="media-player"><video :src="media.url" :aria-label="media.name" controls playsinline preload="metadata" /></div>
    <div v-else-if="media.url && media.mimeType.startsWith('audio/')" class="media-player"><audio :src="media.url" :aria-label="media.name" controls preload="metadata" /></div>
    <div v-else-if="media.url" class="media-state"><UiIcon name="attach" /><span>{{ media.name }}</span><small v-if="media.size">{{ Math.max(1, Math.ceil(media.size / 1024)) }} КБ</small></div>
    <p v-if="actionError" class="media-action-error" role="alert">{{ actionError }}</p>
    <footer ref="actions" class="media-actions">
      <button type="button" :disabled="!media.file || sharing" @click="save"><UiIcon name="download" />Скачать</button>
      <button v-if="shareAvailable" type="button" :disabled="!shareSupported || sharing" :title="media.file && !shareSupported ? 'Браузер не поддерживает передачу этого файла' : undefined" @click="share"><UiIcon name="share" />{{ sharing ? 'Отправка…' : 'Поделиться' }}</button>
    </footer>
  </TeamChatDialog>
</template>
<style scoped>
.media-preview-dialog { height: min(80dvh,760px); }
.media-state { display: flex; flex: 1; min-height: 0; gap: 12px; align-items: center; justify-content: center; flex-direction: column; padding: 16px; overflow: auto; text-align: center; overflow-wrap: anywhere; }
.media-state > .ui-icon { width: 32px; height: 32px; color: var(--codex-pane-muted,var(--color-text)); }
.media-state > small { color: var(--codex-pane-muted,var(--color-text)); }
.media-pdf-preview { display: block; width: 100%; height: 65dvh; min-height: 0; border: 0; flex: 1; }
.media-player { display: flex; align-items: center; justify-content: center; flex: 1; min-height: 0; padding: 12px; overflow: hidden; }
.media-player :is(video,audio) { width: 100%; max-height: 100%; min-width: 0; }
.media-actions { display: flex; align-items: center; justify-content: center; flex: none; gap: 8px; padding: 8px max(12px,var(--safe-area-right,0px)) 12px max(12px,var(--safe-area-left,0px)); border-top: 1px solid var(--codex-pane-border,var(--color-border)); }
.media-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: 1; min-height: 44px; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--codex-pane-text,var(--color-text)); font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; }
.media-actions button:disabled { opacity: .45; cursor: default; }
.media-actions button:focus-visible { outline: 2px solid var(--codex-pane-focus,var(--color-primary)); outline-offset: -2px; }
.media-action-error { flex: none; margin: 0; padding: 6px 12px; color: var(--codex-pane-danger,var(--color-danger)); font-size: 12px; line-height: 18px; }
.media-preview-dialog :deep(header > strong) { min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.media-preview-dialog :deep(header > button) { flex: none; }
</style>
