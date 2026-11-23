<script setup>
import { computed, ref, watch, onBeforeUnmount, defineAsyncComponent } from 'vue';
import TeamChatDialog from './TeamChatDialog.vue';
import TeamZoomableImage from './TeamZoomableImage.vue';
import UiIcon from './UiIcon.vue';
import { documentFormat } from '@/utils/documentFormats';
const TeamDocumentPreview=defineAsyncComponent(()=>import('./TeamDocumentPreview.vue'));
const TeamPdfPreview=defineAsyncComponent(()=>import('./TeamPdfPreview.vue'));
import { canShareDeviceFile, shareDeviceFile, saveDeviceFile } from '@/utils/deviceFiles';
const props = defineProps({
  media: { type: Object, required: true },
  allowPdfAttachment: Boolean,
  attachmentBusy: Boolean,
  attachmentError: String,
});
const emit = defineEmits(['close', 'retry', 'attach-pdf']);
const sharing = ref(false), actionError = ref(''), actions = ref(null), editedFile = ref(null);
const pdfView = ref(null), pdfState = ref({ ready: false, modified: false, saving: false, canUndo: false });
const exported = ref(false);
const exportFile = computed(() => editedFile.value || props.media.file);
const pendingPdf = computed(() => pdfState.value.modified || pdfState.value.saving);
const shareAvailable = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
const shareSupported = computed(() => canShareDeviceFile(exportFile.value));
let active = true;
onBeforeUnmount(() => { active = false; });
watch(() => props.media.file, () => { actionError.value = ''; editedFile.value = null; exported.value = false; });
function save() {
  if (!exportFile.value || sharing.value || pendingPdf.value || props.attachmentBusy) return;
  actionError.value = '';
  try { saveDeviceFile(exportFile.value, actions.value); if (editedFile.value) exported.value = true; }
  catch { actionError.value = 'Не удалось начать скачивание. Попробуйте ещё раз.'; }
}
async function share() {
  if (!exportFile.value || sharing.value || pendingPdf.value || props.attachmentBusy) return;
  actionError.value = ''; sharing.value = true;
  try { await shareDeviceFile(exportFile.value); if (editedFile.value) exported.value = true; }
  catch (e) { if (active && e.name !== 'AbortError') actionError.value = e.name === 'NotAllowedError' ? 'Не удалось открыть отправку файла. Нажмите «Поделиться» ещё раз или скачайте файл.' : e.message || 'Не удалось передать файл'; }
  finally { if (active) sharing.value = false; }
}
function close() {
  if (pendingPdf.value && !confirm('Закрыть PDF без сохранения изменений?')) return;
  if (!pendingPdf.value && editedFile.value && !exported.value && !confirm('Подписанный PDF ещё не отправлен. Закрыть просмотр?')) return;
  emit('close');
}
function prepared(file) { editedFile.value = file; exported.value = false; }
</script>
<template>
  <TeamChatDialog class="media-preview-dialog" :class="{'document-preview-dialog':!!documentFormat(media), 'pdf-preview-dialog':media.mimeType === 'application/pdf', 'editable-pdf':allowPdfAttachment && media.mimeType === 'application/pdf'}" :expanded="media.mimeType === 'application/pdf'" :title="media.name" :busy="sharing || pdfState.saving || attachmentBusy" @close="close">
    <template #header-actions>
      <template v-if="media.mimeType === 'application/pdf' && pdfState.ready">
        <button v-if="pdfState.canUndo" class="media-header-action" type="button" aria-label="Отменить действие в PDF" title="Отменить действие" :disabled="sharing || pdfState.saving || attachmentBusy" @click="pdfView.undo()"><UiIcon name="undo" /></button>
        <button class="media-header-action" type="button" aria-label="Вписать страницу целиком" title="Вписать страницу целиком" :disabled="sharing || pdfState.saving || attachmentBusy" @click="pdfView.fit()"><UiIcon name="maximize" /></button>
      </template>
    </template>
    <div v-if="!media.url" class="media-state" :role="media.error ? 'alert' : 'status'">
      <span>{{ media.error || 'Загрузка…' }}</span>
      <button v-if="media.error" type="button" @click="emit('retry')">Повторить</button>
    </div>
    <TeamZoomableImage v-if="media.url && media.mimeType.startsWith('image/')" :src="media.url" :alt="media.name" />
    <TeamPdfPreview v-else-if="media.url && media.file && media.mimeType === 'application/pdf'" ref="pdfView" :file="media.file" :editable="allowPdfAttachment && !attachmentBusy" :inert="attachmentBusy" @state="pdfState = $event" @saved="prepared" />
    <div v-else-if="media.url && media.mimeType.startsWith('video/')" class="media-player"><video :src="media.url" :aria-label="media.name" controls playsinline preload="metadata" /></div>
    <div v-else-if="media.url && media.mimeType.startsWith('audio/')" class="media-player"><audio :src="media.url" :aria-label="media.name" controls preload="metadata" /></div>
    <TeamDocumentPreview v-else-if="media.url && media.file && documentFormat(media)" :file="media.file" :name="media.name" class="expanded-document-preview"/>
    <div v-else-if="media.url" class="media-state"><UiIcon name="attach" /><span>{{ media.name }}</span><small v-if="media.size">{{ Math.max(1, Math.ceil(media.size / 1024)) }} КБ</small></div>
    <p v-if="actionError || attachmentError" class="media-action-error" role="alert">{{ actionError || attachmentError }}</p>
    <footer ref="actions" class="media-actions">
      <button type="button" :disabled="!exportFile || sharing || pendingPdf || attachmentBusy" :title="pendingPdf ? 'Нажмите «Готово», чтобы сохранить изменения PDF' : 'Скачать'" @click="save"><UiIcon name="download" /><span class="media-action-label">Скачать</span></button>
      <button v-if="shareAvailable" type="button" :disabled="!shareSupported || sharing || pendingPdf || attachmentBusy" :title="pendingPdf ? 'Нажмите «Готово», чтобы сохранить изменения PDF' : exportFile && !shareSupported ? 'Браузер не поддерживает передачу этого файла' : 'Поделиться'" @click="share"><UiIcon name="share" /><span class="media-action-label">{{ sharing ? 'Отправка…' : 'Поделиться' }}</span></button>
      <template v-if="allowPdfAttachment && media.mimeType === 'application/pdf'">
        <button type="button" title="Добавить изображение подписи или печати" :disabled="sharing || attachmentBusy || !pdfState.ready || pdfState.saving" @click="pdfView.chooseImage()"><UiIcon name="edit" /><span class="media-action-label">Подпись / печать</span></button>
        <button v-if="editedFile && !pdfState.modified" type="button" title="Прикрепить готовый PDF в чат" :disabled="sharing || attachmentBusy || pdfState.saving" @click="emit('attach-pdf', editedFile)"><UiIcon name="attach" /><span class="media-action-label">В чат</span></button>
        <button v-else type="button" :class="{ 'pdf-ready-action':pdfState.modified }" title="Сохранить изменения PDF" :disabled="!pdfState.modified || sharing || attachmentBusy || pdfState.saving" @click="pdfView.save()"><UiIcon :name="pdfState.saving ? 'clock' : 'check'" /><span class="media-action-label">{{ pdfState.saving ? 'Сохранение…' : 'Готово' }}</span></button>
      </template>
    </footer>
  </TeamChatDialog>
</template>
<style scoped>
.media-preview-dialog { height: min(80dvh,760px); }
.pdf-preview-dialog { height: auto; }
@media(max-width:600px){.pdf-preview-dialog{border-radius:0;border-inline:0}}
.document-preview-dialog{width:min(1100px,calc(100vw - var(--safe-area-left,0px) - var(--safe-area-right,0px) - 24px))!important}
.expanded-document-preview{flex:1;height:auto;min-height:0}
.media-state { display: flex; flex: 1; min-height: 0; gap: 12px; align-items: center; justify-content: center; flex-direction: column; padding: 16px; overflow: auto; text-align: center; overflow-wrap: anywhere; }
.media-state > .ui-icon { width: 32px; height: 32px; color: var(--codex-pane-muted,var(--color-text)); }
.media-state > small { color: var(--codex-pane-muted,var(--color-text)); }
.media-player { display: flex; align-items: center; justify-content: center; flex: 1; min-height: 0; padding: 12px; overflow: hidden; }
.media-player :is(video,audio) { width: 100%; max-height: 100%; min-width: 0; }
.media-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; flex: none; gap: 8px; padding: 8px max(12px,var(--safe-area-right,0px)) 12px max(12px,var(--safe-area-left,0px)); border-top: 1px solid var(--codex-pane-border,var(--color-border)); }
.media-preview-dialog .media-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: 1; min-height: 44px; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--codex-pane-text,var(--color-text)); font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; }
.editable-pdf .media-actions { flex-wrap: nowrap; }
.media-preview-dialog .pdf-ready-action { color: var(--codex-pane-accent, var(--color-primary)); }
@media(max-width:600px){.pdf-preview-dialog .media-action-label{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.pdf-preview-dialog .media-actions button{min-width:44px;padding-inline:6px}}
.media-actions button:disabled { opacity: .45; cursor: default; }
.media-actions button:focus-visible { outline: 2px solid var(--codex-pane-focus,var(--color-primary)); outline-offset: -2px; }
.media-action-error { flex: none; margin: 0; padding: 6px 12px; color: var(--codex-pane-danger,var(--color-danger)); font-size: 12px; line-height: 18px; }
.media-preview-dialog :deep(header > strong) { min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.media-preview-dialog :deep(header > button) { flex: none; }
.media-preview-dialog .media-header-action { display: grid; place-items: center; box-sizing: border-box; width: 44px; min-width: 44px; height: 44px; min-height: 44px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.media-header-action:focus-visible { outline: 2px solid var(--codex-pane-focus, var(--color-primary)); outline-offset: -4px; }
</style>
