import { computed, ref, watch } from 'vue';
import { AnnotationEditorType } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { useTeamChatStore } from '@/stores/teamChatStore';
import { pdfMarkGeometry, preparePdfMark } from '@/utils/pdfMarks';

export function usePdfMarks({ pages, getViewer, getPdf, editable, changed, failed }) {
  const chat = useTeamChatStore();
  const toolsOpen = ref(false), kind = ref('stamp'), widthMm = ref(40), busy = ref(false);
  const marks = ref([]), selectedId = ref(null), pendingAssetId = ref(null), undoCount = ref(0);
  const assets = new Map(), history = [], redoHistory = [];
  const locked = computed(() => !!selectedId.value), canUndo = computed(() => undoCount.value > 0);
  const selected = computed(() => marks.value.find(mark => mark.id === selectedId.value));
  const canPlace = computed(() => !!pendingAssetId.value || !!selected.value);
  let generation = 0, press;
  const profileKey = id => chat.me?.workspaceId && chat.me?.actorId ? `index12-pdf-mark-size:${chat.me.workspaceId}:${chat.me.actorId}:${id}` : null;
  function remembered(id, type) {
    const key = profileKey(id);
    try { const value = key && JSON.parse(localStorage.getItem(key) || '{}')[type]; if (Number.isFinite(value) && value >= 5 && value <= 150) return value; } catch { /* Optional preferences. */ }
    return type === 'stamp' ? 40 : 50;
  }
  function rememberSize() {
    const id = selected.value?.assetId || pendingAssetId.value, key = id && profileKey(id);
    if (!key) return;
    try { const sizes = JSON.parse(localStorage.getItem(key) || '{}'); sizes[kind.value] = widthMm.value; localStorage.setItem(key, JSON.stringify(sizes)); } catch { /* Images are never stored here. */ }
  }
  function record() { history.push(marks.value.map(mark => ({ ...mark }))); redoHistory.length = 0; undoCount.value = history.length; }
  function geometry(mark) { return pdfMarkGeometry(mark, assets.get(mark.assetId), getViewer().getPageView(mark.pageIndex).viewport); }
  function render() {
    const root = pages.value, viewer = getViewer();
    if (!root || !viewer) return;
    const live = new Set(marks.value.map(mark => mark.id));
    for (const button of root.querySelectorAll('.managed-pdf-mark')) if (!live.has(button.dataset.markId)) button.remove();
    for (const mark of marks.value) {
      const page = viewer.getPageView(mark.pageIndex), asset = assets.get(mark.assetId);
      if (!page?.div || !asset) continue;
      let button = root.querySelector(`[data-mark-id="${mark.id}"]`);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'managed-pdf-mark'; button.dataset.markId = mark.id;
        const image = document.createElement('img'); image.src = asset.url; image.alt = ''; image.draggable = false; button.append(image);
      }
      if (button.parentElement !== page.div) page.div.append(button);
      const box = geometry(mark);
      button.style.left = box.left * 100 + '%'; button.style.top = box.top * 100 + '%'; button.style.width = box.width * 100 + '%'; button.style.height = box.height * 100 + '%';
      button.classList.toggle('is-selected', selectedId.value === mark.id);
      button.setAttribute('aria-label', (mark.kind === 'stamp' ? 'Печать' : 'Подпись') + ': изменить положение или размер');
      button.setAttribute('aria-pressed', String(selectedId.value === mark.id));
      button.disabled = !editable() || busy.value;
    }
  }
  watch([marks, selectedId, toolsOpen, busy, () => editable()], render, { flush: 'post' });
  function finish() { selectedId.value = pendingAssetId.value = null; toolsOpen.value = false; press = null; }
  function open() {
    if (!editable() || busy.value) return;
    finish(); toolsOpen.value = true; widthMm.value = kind.value === 'stamp' ? 40 : 50;
    getViewer().annotationEditorMode = { mode: AnnotationEditorType.NONE };
  }
  function setKind(type) {
    if (!['stamp', 'signature'].includes(type) || !editable() || busy.value) return;
    kind.value = type;
    const id = selected.value?.assetId || pendingAssetId.value;
    widthMm.value = id ? remembered(id, type) : type === 'stamp' ? 40 : 50;
    if (selected.value) { record(); marks.value = marks.value.map(mark => mark.id === selectedId.value ? { ...mark, kind: type, widthMm: widthMm.value } : mark); changed(); }
  }
  async function choose(file) {
    if (!file || !editable() || busy.value) return;
    const current = generation, document = getPdf(); busy.value = true;
    try {
      const asset = await preparePdfMark(file);
      if (current !== generation || document !== getPdf()) return;
      if (!assets.has(asset.id)) assets.set(asset.id, { ...asset, url: URL.createObjectURL(asset.file) });
      selectedId.value = null; pendingAssetId.value = asset.id;
      widthMm.value = remembered(asset.id, kind.value); toolsOpen.value = true;
    } catch (error) { if (current === generation) failed(error.message || 'Не удалось подготовить изображение'); }
    finally { if (current === generation) busy.value = false; }
  }
  function select(id) {
    const mark = marks.value.find(item => item.id === id);
    if (!mark || !editable()) return;
    selectedId.value = id; pendingAssetId.value = null; kind.value = mark.kind; widthMm.value = mark.widthMm; toolsOpen.value = true;
    getViewer().annotationEditorMode = { mode: AnnotationEditorType.NONE };
  }
  function setWidth(value) {
    if (!editable() || busy.value) return;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 5 || number > 150) return;
    widthMm.value = Math.round(number * 10) / 10;
    if (selected.value) {
      const next = { ...selected.value, widthMm: widthMm.value };
      widthMm.value = next.widthMm = Math.round(geometry(next).widthMm * 10) / 10;
      record(); marks.value = marks.value.map(mark => mark.id === next.id ? next : mark); changed();
    }
    rememberSize();
  }
  function place(event) {
    const page = event.target.closest('.pdfViewer > .page');
    if (!page || !canPlace.value || busy.value || !editable()) return;
    const pageIndex = Number(page.dataset.pageNumber) - 1, rect = page.getBoundingClientRect();
    if (pageIndex < 0 || !Number.isInteger(pageIndex) || !rect.width || !rect.height) return;
    const next = { ...(selected.value || { id: crypto.randomUUID(), assetId: pendingAssetId.value, kind: kind.value }), pageIndex,
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)), widthMm: widthMm.value };
    next.widthMm = Math.round(geometry(next).widthMm * 10) / 10;
    record(); marks.value = selected.value ? marks.value.map(mark => mark.id === next.id ? next : mark) : [...marks.value, next];
    selectedId.value = next.id; pendingAssetId.value = null; widthMm.value = next.widthMm;
    rememberSize(); changed();
  }
  function pointerDown(event) {
    if (!editable() || busy.value || event.button !== 0) return;
    if (event.isPrimary === false) { if (press) press.moved = true; return; }
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    if (locked.value) event.stopPropagation();
  }
  function pointerMove(event) { if (press && (event.pointerId !== press.id || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8)) press.moved = true; }
  function pointerCancel() { if (press) press.moved = true; }
  function pointerUp(event) {
    if (!editable() || busy.value || (!toolsOpen.value && event.target.closest('.freeTextEditor, .editToolbar, input, a'))) return;
    const button = event.target.closest('.managed-pdf-mark');
    if (!button && !(toolsOpen.value && canPlace.value)) return;
    event.stopPropagation();
    if (!press || press.moved || event.pointerId !== press.id) { press = null; return; }
    if (button && !(pendingAssetId.value && !selectedId.value)) select(button.dataset.markId);
    else place(event);
    press = null;
  }
  function click(event) {
    const button = event.target.closest('.managed-pdf-mark');
    if (!button && !(toolsOpen.value && canPlace.value)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (button && event.detail === 0 && editable() && !busy.value) select(button.dataset.markId);
  }
  function remove() {
    if (!selected.value || !editable() || busy.value) return;
    record(); marks.value = marks.value.filter(mark => mark.id !== selectedId.value); finish(); changed();
  }
  function undo() {
    if (!history.length || !editable() || busy.value) return false;
    redoHistory.push(marks.value.map(mark => ({ ...mark })));
    marks.value = history.pop(); undoCount.value = history.length; finish(); changed(); return true;
  }
  function redo() {
    if (!redoHistory.length || !editable() || busy.value) return false;
    history.push(marks.value.map(mark => ({ ...mark })));
    marks.value = redoHistory.pop(); undoCount.value = history.length; finish(); changed(); return true;
  }
  async function save(write) {
    const document = getPdf(), current = generation, keys = [], bitmaps = [];
    const seen = new Set();
    try {
      for (const mark of marks.value) {
        const asset = assets.get(mark.assetId), box = geometry(mark), key = 'pdfjs_internal_editor_index12_' + mark.id;
        const annotation = { annotationType: AnnotationEditorType.STAMP, pageIndex: mark.pageIndex, rect: box.rect, rotation: box.rotation,
          bitmapId: 'index12_' + asset.id, isSvg: false, accessibilityData: { type: 'Figure', alt: mark.kind === 'stamp' ? 'Печать' : 'Подпись' } };
        if (!seen.has(asset.id)) {
          const bitmap = await createImageBitmap(asset.file); bitmaps.push(bitmap); annotation.bitmap = bitmap; seen.add(asset.id);
          if (current !== generation || document !== getPdf()) throw Error('Документ изменился. Откройте его ещё раз.');
        }
        document.annotationStorage.setValue(key, annotation); keys.push(key);
      }
      return await write();
    } finally {
      for (const key of keys) document.annotationStorage.remove(key);
      for (const bitmap of bitmaps) bitmap.close();
    }
  }
  function reset() {
    ++generation; finish(); busy.value = false; marks.value = []; history.length = redoHistory.length = 0; undoCount.value = 0;
    for (const asset of assets.values()) URL.revokeObjectURL(asset.url); assets.clear();
    for (const button of pages.value?.querySelectorAll('.managed-pdf-mark') || []) button.remove();
  }
  return { toolsOpen, kind, widthMm, busy, selectedId, pendingAssetId, locked, canPlace, canUndo,
    open, finish, choose, setKind, setWidth, render, pointerDown, pointerMove, pointerUp, pointerCancel, click, remove, undo, redo, save, reset };
}
