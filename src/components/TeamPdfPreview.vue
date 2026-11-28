<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { AnnotationEditorType, AnnotationMode } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { EventBus, PDFViewer, PDFLinkService, LinkTarget } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs';
import 'pdfjs-dist/legacy/web/pdf_viewer.css';
import { loadPdf } from '@/utils/pdfPreview';
import UiIcon from './UiIcon.vue';
import { usePdfMarks } from '@/composables/usePdfMarks';

const props = defineProps({ file: { type: File, required: true }, editable: Boolean });
const emit = defineEmits(['state', 'saved']);
const container = ref(null), pages = ref(null), imageInput = ref(null);
const error = ref(''), loading = ref(true), password = ref(''), passwordRequired = ref(false);
const pageNumber = ref(1), pageCount = ref(0), modified = ref(false), saving = ref(false), ready = ref(false);
const pdfCanUndo = ref(false), markTools = ref(null), markToolsHeight = ref(0);
let viewer, eventBus, linkService, loadingTask, pdf, observer, controlsObserver, toolsObserver, session, ticket = 0, passwordCallback, pinch;
let lastEdited = 'pdf';
const marks = usePdfMarks({ pages, getViewer: () => viewer, getPdf: () => pdf,
  editable: () => ready.value && props.editable && !saving.value,
  changed: () => { modified.value = true; lastEdited = 'marks'; }, failed: message => { error.value = message; } });
const canUndo = computed(() => pdfCanUndo.value || marks.canUndo.value);
const publish = () => emit('state', { ready: ready.value, modified: modified.value, saving: saving.value, canUndo: canUndo.value, placing: marks.toolsOpen.value, imageBusy: marks.busy.value });
watch([ready, modified, saving, canUndo, marks.toolsOpen, marks.busy], publish, { immediate: true });

function fit() {
  if (!viewer?.pagesCount) return;
  viewer.currentScaleValue = 'page-fit';
  viewer.update();
}
function zoom(factor, origin, pan) {
  if (!ready.value || marks.locked.value) return;
  viewer.updateScale({ scaleFactor: factor, origin, pan, drawingDelay: 150 });
}
function pinchPoints(event) {
  const [a, b] = event.touches;
  return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}
function touchStart(event) {
  // Leave one-finger gestures entirely to the browser, including momentum scroll.
  if (event.touches.length !== 2 || !ready.value || saving.value || marks.locked.value || event.target.closest('.stampEditor,.freeTextEditor,button,input,select')) { pinch = null; return; }
  pinch = pinchPoints(event);
  if (event.cancelable) event.preventDefault();
}
function touchMove(event) {
  if (event.touches.length !== 2 || !ready.value || saving.value || marks.locked.value) { pinch = null; return; }
  if (!pinch) return;
  if (event.cancelable) event.preventDefault();
  const next = pinchPoints(event);
  if (pinch?.distance > 0 && next.distance > 0) {
    const box = container.value.getBoundingClientRect();
    const pan = [next.x - pinch.x, next.y - pinch.y];
    if (Math.abs(next.distance - pinch.distance) > .5)
      zoom(next.distance / pinch.distance, [pinch.x - box.left + container.value.offsetLeft, pinch.y - box.top + container.value.offsetTop], pan);
    else viewer.panBy(...pan);
  }
  pinch = next;
}
function touchEnd(event) { pinch = pinch && event.touches.length === 2 ? pinchPoints(event) : null; }
function touchCancel() { pinch = null; }
function goToPage(value) {
  if (!ready.value || saving.value) return;
  const number = Number(value);
  if (Number.isInteger(number)) viewer.currentPageNumber = Math.max(1, Math.min(pageCount.value, number));
}
function wheel(event) {
  if (marks.locked.value) { event.preventDefault(); return; }
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const box = container.value.getBoundingClientRect();
  zoom(Math.exp(Math.max(-1, Math.min(1, -event.deltaY * .01))), [event.clientX - box.left + container.value.offsetLeft, event.clientY - box.top + container.value.offsetTop]);
}
function doubleClick() {
  if (marks.toolsOpen.value) return;
  if (!ready.value) return;
  if (viewer.currentScaleValue !== 'page-fit') fit();
  else zoom(2);
}
function key(event) {
  if (event.target.closest('[contenteditable="true"],input,textarea')) return;
  if (props.editable && (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    if (event.key.toLowerCase() === 'y' || event.shiftKey) {
      if (lastEdited !== 'marks' || !marks.redo()) eventBus.dispatch('editingaction', { name: 'redo' });
    } else undo();
    return;
  }
  if (marks.toolsOpen.value && event.key === 'Escape') { event.preventDefault(); marks.finish(); return; }
  if (props.editable && ['Delete', 'Backspace'].includes(event.key) && event.target.closest('.managed-pdf-mark')) {
    event.preventDefault(); marks.remove(); return;
  }
  if (props.editable && ['Delete', 'Backspace'].includes(event.key) && event.target.closest('.stampEditor')) {
    event.preventDefault(); eventBus.dispatch('editingaction', { name: 'delete' }); return;
  }
  if (event.target !== container.value) return;
  if (['+', '=', '-', '_', '0', 'Home'].includes(event.key)) event.preventDefault();
  if (['+', '='].includes(event.key)) zoom(1.4);
  else if (['-', '_'].includes(event.key)) zoom(1 / 1.4);
  else if (['0', 'Home'].includes(event.key)) fit();
}
function undo() {
  if (!props.editable || !canUndo.value || saving.value || marks.busy.value) return;
  if (lastEdited === 'marks' && marks.undo()) return;
  if (pdfCanUndo.value) eventBus.dispatch('editingaction', { name: 'undo' });
  else marks.undo();
}
function chooseImage() { if (ready.value && props.editable && !saving.value) { error.value = ''; marks.open(); } }
function changeMarkWidth(event) { marks.setWidth(event.target.value); event.target.value = marks.widthMm.value; }
function markTextModified(event) {
  if (props.editable && event.target.closest('.freeTextEditor')) { modified.value = true; lastEdited = 'pdf'; }
}
async function addText() {
  marks.finish(); lastEdited = 'pdf';
  if (!ready.value || !props.editable || saving.value) return;
  error.value = '';
  const current = ticket;
  try {
    const layer = viewer.getPageView(viewer.currentPageNumber - 1)?.annotationEditorLayer?.annotationEditorLayer;
    if (!layer) throw Error('Страница ещё загружается. Попробуйте ещё раз.');
    await layer.pasteEditor({ mode: AnnotationEditorType.FREETEXT }, { fontSize: 14, color: '#111111' });
  } catch (e) { if (current === ticket) error.value = e.message || 'Не удалось добавить текст'; }
}
async function addImage(event) {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  error.value = ''; await marks.choose(file);
}
async function save() {
  if (!pdf || !modified.value || saving.value || !props.editable || marks.toolsOpen.value || marks.busy.value) return;
  const current = ticket;
  saving.value = true; error.value = '';
  try {
    container.value.focus({ preventScroll: true });
    const bytes = await marks.save(() => pdf.annotationStorage.size ? pdf.saveDocument() : pdf.getData());
    if (current !== ticket) return;
    modified.value = false;
    viewer.annotationEditorMode = { mode: AnnotationEditorType.NONE };
    const name = props.file.name.replace(/\.pdf$/i, '').replace(/(?: — подписан)+$/u, '') + ' — подписан.pdf';
    emit('saved', new File([bytes], name, { type: 'application/pdf' }));
  } catch { if (current === ticket) error.value = 'Не удалось сохранить PDF. Изменения остаются открытыми; попробуйте ещё раз.'; }
  finally { if (current === ticket) saving.value = false; }
}
function enterPassword() {
  if (!password.value || !passwordCallback) return;
  passwordRequired.value = false;
  passwordCallback(password.value);
  password.value = '';
}
function stop() {
  ++ticket;
  observer?.disconnect(); controlsObserver?.disconnect(); toolsObserver?.disconnect(); session?.abort(); pinch = null;
  marks.reset(); markToolsHeight.value = 0;
  viewer?.setDocument(null); linkService?.setDocument(null);
  loadingTask?.destroy().catch(() => {});
  viewer = loadingTask = pdf = null;
}
async function open() {
  stop();
  const current = ticket;
  error.value = ''; ready.value = modified.value = pdfCanUndo.value = saving.value = false; loading.value = true; lastEdited = 'pdf';
  passwordRequired.value = false; password.value = ''; pageNumber.value = 1; pageCount.value = 0;
  session = new AbortController();
  eventBus = new EventBus();
  linkService = new PDFLinkService({ eventBus, externalLinkTarget: LinkTarget.BLANK, externalLinkRel: 'noopener noreferrer', ignoreDestinationZoom: true });
  viewer = new PDFViewer({ container: container.value, viewer: pages.value, eventBus, linkService,
    annotationEditorMode: props.editable ? AnnotationEditorType.NONE : AnnotationEditorType.DISABLE,
    annotationMode: AnnotationMode.ENABLE, removePageBorders: true, enableAutoLinking: false,
    enableHighlightFloatingButton: false, enableUpdatedAddImage: false, maxCanvasPixels: 8 * 1024 * 1024,
    maxCanvasDim: 4096, abortSignal: session.signal,
  });
  linkService.setViewer(viewer);
  eventBus.on('pagesinit', () => { fit(); });
  eventBus.on('pagechanging', ({ pageNumber: number }) => { pageNumber.value = number; });
  eventBus.on('pagerendered', ({ error: renderError }) => {
    if (current !== ticket) return;
    loading.value = false;
    if (renderError) error.value = 'Не удалось отобразить страницу PDF';
    if (!props.editable) ready.value = !renderError;
    marks.render();
  });
  eventBus.on('annotationeditorlayerrendered', () => { if (current === ticket) ready.value = true; });
  eventBus.on('editingstateschanged', ({ details }) => { if (current === ticket && 'hasSomethingToUndo' in details) pdfCanUndo.value = details.hasSomethingToUndo; });
  eventBus.on('switchannotationeditormode', ({ mode }) => { viewer.annotationEditorMode = { mode }; });
  eventBus.on('scalechanging', () => marks.render());
  toolsObserver = new ResizeObserver(() => { markToolsHeight.value = markTools.value?.getBoundingClientRect().height || 0; });
  toolsObserver.observe(markTools.value);
  observer = new ResizeObserver(() => { if (viewer?.currentScaleValue === 'page-fit') fit(); });
  observer.observe(container.value);
  controlsObserver = new MutationObserver(() => {
    for (const button of container.value.querySelectorAll('.deleteButton:not([data-index12-localized])')) {
      button.dataset.index12Localized = 'true'; button.removeAttribute('data-l10n-id');
      const label = button.closest('.freeTextEditor') ? 'Удалить текст' : 'Удалить подпись или печать';
      button.setAttribute('aria-label', label); button.title = label;
    }
  });
  controlsObserver.observe(container.value, { childList: true, subtree: true });
  try {
    const bytes = new Uint8Array(await props.file.arrayBuffer());
    if (current !== ticket) return;
    loadingTask = loadPdf(bytes);
    loadingTask.onPassword = callback => { passwordCallback = callback; passwordRequired.value = true; loading.value = false; };
    pdf = await loadingTask.promise;
    if (current !== ticket) return;
    pageCount.value = pdf.numPages;
    pdf.annotationStorage.onSetModified = () => { modified.value = true; if (!saving.value) lastEdited = 'pdf'; };
    viewer.setDocument(pdf); linkService.setDocument(pdf);
  } catch (e) {
    if (current === ticket) { loading.value = false; error.value = e?.name === 'InvalidPDFException' ? 'PDF повреждён или имеет неподдерживаемый формат.' : 'Не удалось открыть PDF. Попробуйте ещё раз.'; }
  }
}
onMounted(open);
watch(() => props.file, () => { if (container.value) open(); });
onBeforeUnmount(stop);
defineExpose({ chooseImage, addText, save, fit, undo });
</script>
<template>
  <section class="team-pdf-preview" :class="{ 'has-pages': pageCount > 1, 'mark-editing': marks.locked.value, 'mark-placing': marks.toolsOpen.value && marks.canPlace.value }" aria-label="Просмотр PDF" :aria-busy="loading || saving">
    <div ref="markTools" v-show="marks.toolsOpen.value" class="pdf-mark-tools" aria-label="Размещение подписи или печати" @keydown.esc.stop.prevent="!marks.busy.value && marks.finish()">
      <div class="pdf-mark-type">
        <button type="button" :aria-pressed="marks.kind.value === 'stamp'" :disabled="marks.busy.value" @click="marks.setKind('stamp')">Печать</button>
        <button type="button" :aria-pressed="marks.kind.value === 'signature'" :disabled="marks.busy.value" @click="marks.setKind('signature')">Подпись</button>
        <button type="button" :disabled="marks.busy.value" @click="imageInput.click()"><UiIcon name="image" />{{ marks.busy.value ? 'Подготовка…' : 'Загрузить' }}</button>
      </div>
      <div class="pdf-mark-size">
        <button type="button" aria-label="Уменьшить подпись или печать" :disabled="!marks.canPlace.value || marks.busy.value || marks.widthMm.value <= 5" @click="marks.setWidth(marks.widthMm.value - 1)"><UiIcon name="minus" /></button>
        <label>Ширина, мм<input type="number" inputmode="decimal" min="5" max="150" step="1" :value="marks.widthMm.value" :disabled="!marks.canPlace.value || marks.busy.value" aria-label="Ширина подписи или печати в миллиметрах" @change="changeMarkWidth" @keydown.enter.prevent="$event.target.blur()" /></label>
        <button type="button" aria-label="Увеличить подпись или печать" :disabled="!marks.canPlace.value || marks.busy.value || marks.widthMm.value >= 150" @click="marks.setWidth(marks.widthMm.value + 1)"><UiIcon name="plus" /></button>
        <button v-if="marks.selectedId.value" type="button" aria-label="Удалить выбранную подпись или печать" :disabled="marks.busy.value" @click="marks.remove()"><UiIcon name="trash" /></button>
        <button type="button" class="pdf-mark-done" :disabled="marks.busy.value" @click="marks.finish()"><UiIcon name="check" />Готово</button>
      </div>
      <p v-if="marks.canPlace.value">Нажмите нужное место на странице</p>
    </div>
    <div ref="container" class="pdf-scroll" :style="{ top: (markToolsHeight + 10) + 'px' }" :inert="saving || marks.busy.value" tabindex="0" role="region" aria-label="Страницы PDF" @wheel="wheel" @dblclick="doubleClick" @keydown="key" @touchstart="touchStart" @touchmove="touchMove" @touchend="touchEnd" @touchcancel="touchCancel" @input="markTextModified" @pointerdown.capture="marks.pointerDown" @pointermove.capture="marks.pointerMove" @pointerup.capture="marks.pointerUp" @pointercancel.capture="marks.pointerCancel" @click.capture="marks.click">
      <div ref="pages" class="pdfViewer index12-pdf-pages" :class="{ 'single-page': pageCount === 1 }"></div>
    </div>
    <span v-if="loading" class="pdf-state" role="status">Загрузка PDF…</span>
    <form v-if="passwordRequired" class="pdf-password" @submit.prevent="enterPassword">
      <input v-model="password" type="password" placeholder="Пароль PDF" aria-label="Пароль PDF" autocomplete="off" />
      <button type="submit">Открыть</button>
    </form>
    <p v-if="error" class="pdf-error" role="alert">{{ error }}</p>
    <input ref="imageInput" class="pdf-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" hidden @change="addImage" />
    <nav v-if="pageCount > 1" class="pdf-page-navigation" aria-label="Страницы PDF">
      <button type="button" aria-label="Предыдущая страница PDF" :disabled="!ready || saving || pageNumber <= 1" @click="goToPage(pageNumber - 1)"><UiIcon name="chevron-left" /></button>
      <select class="pdf-page-number" aria-label="Перейти на страницу PDF" :value="pageNumber" :disabled="!ready || saving" @change="goToPage($event.target.value)">
        <option v-for="number in pageCount" :key="number" :value="number">{{ number }} / {{ pageCount }}</option>
      </select>
      <button type="button" aria-label="Следующая страница PDF" :disabled="!ready || saving || pageNumber >= pageCount" @click="goToPage(pageNumber + 1)"><UiIcon name="chevron-right" /></button>
    </nav>
  </section>
</template>
<style scoped>
.team-pdf-preview { position: relative; flex: 1 1 0; min-width: 0; min-height: 0; overflow: hidden; background: var(--codex-pane-surface, var(--color-background-soft)); }
.pdf-scroll { position: absolute; inset: 10px; overflow: auto; overscroll-behavior: contain; touch-action: pan-x pan-y; -webkit-overflow-scrolling: touch; outline: none; }
.has-pages .pdf-scroll { bottom: 48px; }
.pdf-scroll:focus-visible { outline: 2px solid var(--codex-pane-focus, var(--color-primary)); outline-offset: -2px; }
.mark-editing .pdf-scroll { overflow: hidden; touch-action: none; }
.mark-placing .pdf-scroll { cursor: crosshair; }
.index12-pdf-pages :deep(.managed-pdf-mark) { position: absolute; z-index: 5; display: block; box-sizing: border-box; min-width: 0; min-height: 0; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; outline: none; cursor: pointer; touch-action: pan-x pan-y; }
.index12-pdf-pages :deep(.managed-pdf-mark img) { display: block; width: 100%; height: 100%; object-fit: contain; pointer-events: none; user-select: none; -webkit-user-drag: none; }
.index12-pdf-pages :deep(.managed-pdf-mark.is-selected) { outline: 2px solid var(--codex-pane-accent, var(--color-primary)); outline-offset: 3px; }
.index12-pdf-pages :deep(.managed-pdf-mark:focus-visible) { outline: 2px solid var(--codex-pane-focus, var(--color-primary)); }
.pdf-mark-tools { position: absolute; inset: 0 0 auto; z-index: 10; padding: 6px 10px; box-sizing: border-box; background: var(--codex-pane-bg, var(--color-background)); border-bottom: 1px solid var(--codex-pane-border, var(--color-border)); font-size: 13px; }
.pdf-mark-type, .pdf-mark-size { display: flex; align-items: center; justify-content: center; gap: 4px; }
.pdf-mark-tools button { display: inline-flex; align-items: center; justify-content: center; flex: none; gap: 5px; min-width: 44px; min-height: 44px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.pdf-mark-type button[aria-pressed="true"] { background: var(--codex-pane-surface, var(--color-background-soft)); color: var(--codex-pane-accent, var(--color-primary)); }
.pdf-mark-size label { display: flex; flex-direction: column; align-items: center; flex: 0 1 76px; min-width: 60px; font-size: 11px; }
.pdf-mark-size input { box-sizing: border-box; width: 100%; height: 36px; min-height: 36px; margin: 0; padding: 0 4px; border: 1px solid var(--codex-pane-border, var(--color-border)); border-radius: 6px; background: var(--codex-pane-surface, var(--color-background-soft)); color: inherit; font: inherit; font-size: 16px; text-align: center; }
.pdf-mark-tools .pdf-mark-done { color: var(--codex-pane-accent, var(--color-primary)); }
.pdf-mark-tools :disabled { opacity: .45; cursor: default; }
.pdf-mark-tools p { margin: 3px 0; text-align: center; color: var(--codex-pane-muted, var(--color-text-soft)); font-size: 12px; }
.index12-pdf-pages { --page-bg-color: white; --page-margin: 0 auto 12px; --page-border: 0; display: block; height: auto; overflow: visible; }
.index12-pdf-pages.single-page { min-height: 100%; display: flex; flex-direction: column; justify-content: center; }
.index12-pdf-pages :deep(.page) { flex: none; margin: 0 auto 12px; }
.index12-pdf-pages.single-page :deep(.page) { margin-block: 0; }
.index12-pdf-pages :deep(.editToolbar .altText) { display: none; }
.index12-pdf-pages :deep(.editToolbar button) { min-width: 44px; min-height: 44px; }
.pdf-state, .pdf-password { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; background: var(--codex-pane-bg, var(--color-background)); }
.pdf-password { padding: 12px; }
.pdf-password input { width: 100%; min-width: 0; min-height: 44px; padding: 8px; font: inherit; }
.pdf-password button { min-height: 44px; font: inherit; }
.pdf-error { position: absolute; bottom: 0; left: 0; right: 0; margin: 0; padding: 10px 12px; background: var(--codex-pane-bg, var(--color-background)); color: var(--codex-pane-danger, var(--color-danger)); font-size: 13px; }
.pdf-page-navigation { position: absolute; inset: auto 0 0; display: flex; align-items: center; justify-content: center; gap: 4px; height: 44px; }
.pdf-page-navigation :is(button,select) { box-sizing: border-box; min-height: 44px; margin: 0; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.pdf-page-navigation button { display: grid; place-items: center; width: 44px; }
.pdf-page-navigation select { width: auto; max-width: 140px; font-size: 16px; font-variant-numeric: tabular-nums; }
.pdf-page-navigation :disabled { opacity: .45; cursor: default; }
</style>
