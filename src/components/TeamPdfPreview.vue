<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { AnnotationEditorType, AnnotationMode } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { EventBus, PDFViewer, PDFLinkService, LinkTarget } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs';
import 'pdfjs-dist/legacy/web/pdf_viewer.css';
import { loadPdf } from '@/utils/pdfPreview';
import UiIcon from './UiIcon.vue';

const props = defineProps({ file: { type: File, required: true }, editable: Boolean });
const emit = defineEmits(['state', 'saved']);
const container = ref(null), pages = ref(null), imageInput = ref(null);
const error = ref(''), loading = ref(true), password = ref(''), passwordRequired = ref(false);
const pageNumber = ref(1), pageCount = ref(0), modified = ref(false), saving = ref(false), ready = ref(false);
const canUndo = ref(false);
let viewer, eventBus, linkService, loadingTask, pdf, observer, controlsObserver, session, ticket = 0, passwordCallback, pinch;
const publish = () => emit('state', { ready: ready.value, modified: modified.value, saving: saving.value, canUndo: canUndo.value });
watch([ready, modified, saving, canUndo], publish, { immediate: true });

function fit() {
  if (!viewer?.pagesCount) return;
  viewer.currentScaleValue = 'page-fit';
  viewer.update();
}
function zoom(factor, origin, pan) {
  if (!ready.value) return;
  viewer.updateScale({ scaleFactor: factor, origin, pan, drawingDelay: 150 });
}
function pinchPoints(event) {
  const [a, b] = event.touches;
  return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}
function touchStart(event) {
  // Leave one-finger gestures entirely to the browser, including momentum scroll.
  if (event.touches.length !== 2 || !ready.value || saving.value || event.target.closest('.stampEditor,.freeTextEditor,button,input,select')) { pinch = null; return; }
  pinch = pinchPoints(event);
  if (event.cancelable) event.preventDefault();
}
function touchMove(event) {
  if (event.touches.length !== 2 || !ready.value || saving.value) { pinch = null; return; }
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
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const box = container.value.getBoundingClientRect();
  zoom(Math.exp(Math.max(-1, Math.min(1, -event.deltaY * .01))), [event.clientX - box.left + container.value.offsetLeft, event.clientY - box.top + container.value.offsetTop]);
}
function doubleClick() {
  if (!ready.value) return;
  if (viewer.currentScaleValue !== 'page-fit') fit();
  else zoom(2);
}
function key(event) {
  if (event.target.closest('[contenteditable="true"],input,textarea')) return;
  if (props.editable && (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    eventBus.dispatch('editingaction', { name: event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo' });
    return;
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
function undo() { if (props.editable && canUndo.value && !saving.value) eventBus.dispatch('editingaction', { name: 'undo' }); }
function chooseImage() { if (ready.value && props.editable && !saving.value) imageInput.value.click(); }
function markTextModified(event) {
  if (props.editable && event.target.closest('.freeTextEditor')) modified.value = true;
}
async function addText() {
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
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !props.editable || saving.value) return;
  error.value = '';
  if (file.size > 10 * 1024 * 1024) { error.value = 'Выберите изображение до 10 МБ.'; return; }
  if (!/^image\/(png|jpeg|webp|heic|heif)$/i.test(file.type) && !/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)) {
    error.value = 'Выберите изображение подписи или печати в PNG, JPEG или WebP.';
    return;
  }
  const current = ticket;
  try {
    const imageUrl = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = imageUrl;
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 20 * 1024 * 1024) throw Error('Выберите изображение меньшего размера: до 20 мегапикселей.');
    } catch (e) { throw Error(e.message?.includes('мегапикселей') ? e.message : 'Не удалось прочитать изображение. Выберите PNG, JPEG или WebP.'); }
    finally { URL.revokeObjectURL(imageUrl); }
    if (current !== ticket) return;
    const layer = viewer.getPageView(viewer.currentPageNumber - 1)?.annotationEditorLayer?.annotationEditorLayer;
    if (!layer) throw Error('Страница ещё загружается. Попробуйте ещё раз.');
    // The pinned PDF.js editor handles image placement, rotation, touch resizing and removal.
    await layer.pasteEditor({ mode: AnnotationEditorType.STAMP }, { bitmapFile: file });
    if (current !== ticket) return;
  } catch (e) { if (current === ticket) error.value = e.message || 'Не удалось добавить изображение'; }
}
async function save() {
  if (!pdf || !modified.value || saving.value || !props.editable) return;
  const current = ticket;
  saving.value = true; error.value = '';
  try {
    container.value.focus({ preventScroll: true });
    const bytes = await pdf.saveDocument();
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
  observer?.disconnect(); controlsObserver?.disconnect(); session?.abort(); pinch = null;
  viewer?.setDocument(null); linkService?.setDocument(null);
  loadingTask?.destroy().catch(() => {});
  viewer = loadingTask = pdf = null;
}
async function open() {
  stop();
  const current = ticket;
  error.value = ''; ready.value = modified.value = canUndo.value = false; loading.value = true;
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
  });
  eventBus.on('annotationeditorlayerrendered', () => { if (current === ticket) ready.value = true; });
  eventBus.on('editingstateschanged', ({ details }) => { if (current === ticket && 'hasSomethingToUndo' in details) canUndo.value = details.hasSomethingToUndo; });
  eventBus.on('switchannotationeditormode', ({ mode }) => { viewer.annotationEditorMode = { mode }; });
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
    pdf.annotationStorage.onSetModified = () => { modified.value = true; };
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
  <section class="team-pdf-preview" :class="{ 'has-pages': pageCount > 1 }" aria-label="Просмотр PDF" :aria-busy="loading || saving">
    <div ref="container" class="pdf-scroll" :inert="saving" tabindex="0" role="region" aria-label="Страницы PDF" @wheel="wheel" @dblclick="doubleClick" @keydown="key" @touchstart="touchStart" @touchmove="touchMove" @touchend="touchEnd" @touchcancel="touchCancel" @input="markTextModified">
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
