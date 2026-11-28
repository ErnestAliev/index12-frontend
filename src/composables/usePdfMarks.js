import { computed, ref, watch } from 'vue';
import { AnnotationEditorType } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { useTeamChatStore } from '@/stores/teamChatStore';
import { pdfMarkBitmap, pdfMarkGeometry, preparePdfMark } from '@/utils/pdfMarks';

export function usePdfMarks({ pages, getViewer, getPdf, editable, changed, failed }) {
  const chat = useTeamChatStore();
  const toolsOpen = ref(false), widthMm = ref(40), busy = ref(false);
  const marks = ref([]), selectedId = ref(null), undoCount = ref(0);
  const assets = new Map(), history = [], redoHistory = [];
  const locked = computed(() => !!selectedId.value), canUndo = computed(() => undoCount.value > 0);
  const selected = computed(() => marks.value.find(mark => mark.id === selectedId.value));
  let generation = 0, press, holdTimer, resizing = false, sizeRecorded = false;
  const profileKey = id => chat.me?.workspaceId && chat.me?.actorId ? `index12-pdf-mark-size:${chat.me.workspaceId}:${chat.me.actorId}:${id}` : null;
  function remembered(id) {
    const key = profileKey(id);
    try {
      const sizes = key && JSON.parse(localStorage.getItem(key) || '{}'), value = sizes?.width ?? sizes?.stamp ?? sizes?.signature;
      if (Number.isFinite(value) && value >= 5 && value <= 150) return value;
    } catch { /* Optional preferences. */ }
    return 40;
  }
  function rememberSize() {
    const key = selected.value && profileKey(selected.value.assetId);
    if (key) { try { localStorage.setItem(key, JSON.stringify({ width: widthMm.value })); } catch { /* Never store images. */ } }
  }
  function record() { history.push(marks.value.map(mark => ({ ...mark }))); redoHistory.length = 0; undoCount.value = history.length; }
  function geometry(mark) { return pdfMarkGeometry(mark, assets.get(mark.assetId), getViewer().getPageView(mark.pageIndex).viewport); }
  function constrain(mark) {
    const box = geometry(mark);
    return { ...mark, widthMm: box.widthMm, x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }
  function render() {
    const root = pages.value, viewer = getViewer();
    if (!root || !viewer) return;
    const live = new Set(marks.value.map(mark => mark.id));
    for (const button of root.querySelectorAll('.managed-pdf-mark')) if (!live.has(button.dataset.markId)) button.remove();
    for (const [index, mark] of marks.value.entries()) {
      const page = viewer.getPageView(mark.pageIndex), asset = assets.get(mark.assetId);
      if (!page?.div || !asset) continue;
      let button = root.querySelector(`[data-mark-id="${mark.id}"]`);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'managed-pdf-mark'; button.dataset.markId = mark.id;
        const image = document.createElement('img'); image.src = asset.url; image.alt = ''; image.draggable = false; button.append(image);
      }
      if (button.parentElement !== page.div) page.div.append(button);
      const box = geometry(mark), viewport = page.viewport, image = button.firstElementChild;
      button.style.left = (box.left + box.width / 2) * 100 + '%'; button.style.top = (box.top + box.height / 2) * 100 + '%';
      button.style.width = `max(44px, ${box.width * 100}%)`; button.style.height = `max(44px, ${box.height * 100}%)`;
      button.style.zIndex = selectedId.value === mark.id ? '100' : String(5 + index);
      image.style.width = box.imageWidth + 'px'; image.style.height = box.imageHeight + 'px';
      image.style.transform = `translate(-50%, -50%) scale(${mark.flipX ? -1 : 1}, ${mark.flipY ? -1 : 1}) rotate(${(mark.turn || 0) * 90}deg)`;
      button.classList.toggle('is-selected', selectedId.value === mark.id);
      button.setAttribute('aria-label', 'Изображение: переместить; удерживать для размера и поворота');
      button.setAttribute('aria-pressed', String(selectedId.value === mark.id));
      button.disabled = !editable() || busy.value;
    }
  }
  watch([marks, selectedId, toolsOpen, busy, () => editable()], render, { flush: 'post' });
  function endPress() {
    clearTimeout(holdTimer); holdTimer = null;
    const previous = press; press = null;
    if (previous?.element?.hasPointerCapture?.(previous.id)) previous.element.releasePointerCapture(previous.id);
  }
  function finish() {
    rememberSize(); endPress();
    const viewer = getViewer();
    if (locked.value && viewer?.pdfDocument && ![AnnotationEditorType.NONE, AnnotationEditorType.DISABLE].includes(viewer.annotationEditorMode)) viewer.annotationEditorMode = { mode: AnnotationEditorType.NONE };
    selectedId.value = null; toolsOpen.value = false; resizing = sizeRecorded = false;
  }
  async function choose(file, container) {
    if (!file || !editable() || busy.value) return;
    const current = generation, document = getPdf(), pageIndex = getViewer().currentPageNumber - 1;
    busy.value = true;
    try {
      const asset = await preparePdfMark(file);
      if (current !== generation || document !== getPdf()) return;
      if (!assets.has(asset.id)) assets.set(asset.id, { ...asset, url: URL.createObjectURL(asset.file) });
      const page = getViewer().getPageView(pageIndex), box = page.div.getBoundingClientRect(), stage = container.getBoundingClientRect();
      const x = (Math.max(box.left, stage.left) + Math.min(box.right, stage.right)) / 2;
      const y = (Math.max(box.top, stage.top) + Math.min(box.bottom, stage.bottom)) / 2;
      const mark = constrain({ id: crypto.randomUUID(), assetId: asset.id, pageIndex, x: (x - box.left) / box.width, y: (y - box.top) / box.height,
        widthMm: remembered(asset.id), turn: 0, flipX: false, flipY: false });
      getViewer().annotationEditorMode = { mode: AnnotationEditorType.NONE };
      record(); marks.value = [...marks.value, mark]; selectedId.value = mark.id; widthMm.value = mark.widthMm; toolsOpen.value = false;
      changed();
    } catch (error) { if (current === generation) failed(error.message || 'Не удалось добавить изображение'); }
    finally { if (current === generation) busy.value = false; }
  }
  function select(id, expand = false) {
    const mark = marks.value.find(item => item.id === id);
    if (!mark || !editable()) return;
    const fresh = selectedId.value !== id;
    if (fresh) { rememberSize(); selectedId.value = id; widthMm.value = mark.widthMm; toolsOpen.value = expand; }
    else if (expand) toolsOpen.value = true;
  }
  function setWidth(value) {
    if (!selected.value || !editable() || busy.value) return;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 5 || number > 150) return;
    if (!resizing || !sizeRecorded) { record(); sizeRecorded = true; }
    const next = constrain({ ...selected.value, widthMm: number });
    widthMm.value = next.widthMm;
    marks.value = marks.value.map(mark => mark.id === next.id ? next : mark); changed();
    if (!resizing) rememberSize();
  }
  function beginResize() { resizing = true; sizeRecorded = false; }
  function endResize() { resizing = sizeRecorded = false; rememberSize(); }
  function transform(patch) {
    if (!selected.value || !editable() || busy.value) return;
    record(); const next = constrain({ ...selected.value, ...patch });
    widthMm.value = next.widthMm;
    marks.value = marks.value.map(mark => mark.id === next.id ? next : mark); rememberSize(); changed();
  }
  function rotate(direction) { if (selected.value) transform({ turn: ((selected.value.turn || 0) + direction + 4) % 4 }); }
  function mirror(axis) { if (selected.value && ['flipX', 'flipY'].includes(axis)) transform({ [axis]: !selected.value[axis] }); }
  function bringToFront() {
    if (!selected.value || !editable() || busy.value || marks.value.at(-1).id === selectedId.value) return;
    record(); marks.value = [...marks.value.filter(mark => mark.id !== selectedId.value), selected.value]; changed();
  }
  function pointerDown(event) {
    if (!editable() || busy.value || event.button !== 0) return;
    if (event.isPrimary === false || press) { event.stopPropagation(); return; }
    const element = event.target.closest('.managed-pdf-mark');
    if (!element) { if (locked.value) event.stopPropagation(); return; }
    select(element.dataset.markId);
    const page = getViewer().getPageView(selected.value.pageIndex).div.getBoundingClientRect();
    press = { id: event.pointerId, element, x: event.clientX, y: event.clientY, page, mark: { ...selected.value }, moved: false };
    element.setPointerCapture(event.pointerId);
    holdTimer = setTimeout(() => { if (press && !press.moved) toolsOpen.value = true; }, 450);
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function pointerMove(event) {
    if (!press || event.pointerId !== press.id || !editable()) return;
    event.preventDefault(); event.stopPropagation();
    const dx = event.clientX - press.x, dy = event.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) < 5) return;
    if (!press.moved) { record(); press.moved = true; clearTimeout(holdTimer); }
    const next = constrain({ ...press.mark, x: press.mark.x + dx / press.page.width, y: press.mark.y + dy / press.page.height });
    marks.value = marks.value.map(mark => mark.id === next.id ? next : mark); changed();
  }
  function pointerUp(event) { if (press && event.pointerId === press.id) { event.preventDefault(); event.stopPropagation(); endPress(); } }
  function pointerCancel(event) { if (!event || event.pointerId === press?.id) endPress(); }
  function click(event) {
    const button = event.target.closest('.managed-pdf-mark');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.detail === 0 && editable() && !busy.value) select(button.dataset.markId);
  }
  function contextMenu(event) {
    const button = event.target.closest('.managed-pdf-mark');
    if (!button || !editable() || busy.value) return;
    event.preventDefault(); event.stopPropagation(); endPress(); select(button.dataset.markId, true);
  }
  function remove() { if (selected.value && editable() && !busy.value) { record(); marks.value = marks.value.filter(mark => mark.id !== selectedId.value); finish(); changed(); } }
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
    const document = getPdf(), current = generation, keys = [], bitmaps = [], seen = new Set();
    try {
      for (const mark of marks.value) {
        const asset = assets.get(mark.assetId), box = geometry(mark), key = 'pdfjs_internal_editor_index12_' + mark.id;
        const variant = `${asset.id}_${mark.turn || 0}_${+!!mark.flipX}_${+!!mark.flipY}`;
        const annotation = { annotationType: AnnotationEditorType.STAMP, pageIndex: mark.pageIndex, rect: box.rect, rotation: box.rotation,
          bitmapId: 'index12_' + variant, isSvg: false, accessibilityData: { type: 'Figure', alt: 'Изображение' } };
        if (!seen.has(variant)) {
          const bitmap = await pdfMarkBitmap(asset, mark); bitmaps.push(bitmap); annotation.bitmap = bitmap; seen.add(variant);
          if (current !== generation || document !== getPdf()) throw Error('Документ изменился. Откройте его ещё раз.');
        }
        document.annotationStorage.setValue(key, annotation); keys.push(key);
      }
      return await write();
    } finally { for (const key of keys) document.annotationStorage.remove(key); for (const bitmap of bitmaps) bitmap.close(); }
  }
  function reset() {
    ++generation; finish(); busy.value = false; marks.value = []; history.length = redoHistory.length = 0; undoCount.value = 0;
    for (const asset of assets.values()) URL.revokeObjectURL(asset.url); assets.clear();
    for (const button of pages.value?.querySelectorAll('.managed-pdf-mark') || []) button.remove();
  }
  return { toolsOpen, widthMm, busy, selectedId, locked, canUndo, finish, choose, setWidth, beginResize, endResize, rotate, mirror, bringToFront,
    render, pointerDown, pointerMove, pointerUp, pointerCancel, click, contextMenu, remove, undo, redo, save, reset };
}
