<script setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useOperationStore } from '@/composables/useOperationStore';
import { operationHistoryKey } from '@/composables/operationHistoryContext';
import { teamApi, useTeamChatStore } from '@/stores/teamChatStore';
import { historyRequest } from '@/utils/preferenceHistory';
import { historyLines } from '@/utils/historyDisplay';
import UiIcon from './UiIcon.vue';

const props = defineProps({ operation: Object, operationId: String, messageId: String, audit: Object });
const context = inject(operationHistoryKey, null), store = useOperationStore(), chat = useTeamChatStore();
const id = computed(() => String(props.operationId || props.operation?._id || props.operation?.id || ''));
const messageId = computed(() => props.messageId || context?.messageId || '');
const identity = computed(() => JSON.stringify([id.value, messageId.value, messageId.value ? chat.me?.workspaceId : store.user?.currentWorkspaceId, messageId.value ? chat.me?.actorId : store.user?.id || store.user?._id, messageId.value ? chat.sessionEpoch : null]));
const panel = ref(null), opened = ref(false), loading = ref(false), error = ref(''), rows = ref([]), cursor = ref(null), creation = ref(null), bounds = ref({}), side = ref(false);
let generation = 0, anchor, returnFocus, originalTranslate;
const format = value => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : 'Время не сохранено';
const events = computed(() => {
  const result = [...rows.value];
  if (!cursor.value && !result.some(row => row.action === 'created')) {
    const fallback = creation.value || ((props.audit?.createdAt || props.operation?.createdAt) ? {
      id: 'creation:' + id.value, kind: 'operation', action: 'created', createdAt: props.audit?.createdAt || props.operation?.createdAt,
      actorName: props.audit?.createdByName || props.operation?.createdByName || (String(props.operation?.createdBy || '') === String(store.user?.id || store.user?._id || '') ? store.user?.name : null),
    } : null);
    if (fallback) result.push(fallback);
  }
  if (!cursor.value && props.audit?.editedAt && !result.some(row => ['updated', 'reverted'].includes(row.action) && new Date(row.createdAt).getTime() === new Date(props.audit.editedAt).getTime())) result.push({ id: 'edit:' + id.value, action: 'updated', createdAt: props.audit.editedAt, actorName: props.audit.editedByName, detailMissing: true });
  return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
});
const title = row => row.action === 'reverted' ? 'Изменение отменено' : row.action === 'created' ? 'Операция создана' : row.action === 'deleted' ? 'Операция удалена' : row.change?.field === 'date' && row.change.before.dateKey !== row.change.after.dateKey ? 'Операция перенесена' : row.change?.field === 'date' && row.change.before.cellIndex !== row.change.after.cellIndex ? 'Изменена ячейка' : 'Операция изменена';
const changes = row => !row.change || !['updated', 'reverted'].includes(row.action) ? [] : historyLines(row.action === 'reverted' ? { ...row, action: 'updated', change: { ...row.change, before: row.change.after, after: row.change.before } } : row);
function restoreAnchor() { if (anchor?.isConnected && originalTranslate !== undefined) anchor.style.translate = originalTranslate; }
function position() {
  if (!opened.value) return;
  restoreAnchor();
  const v = window.visualViewport, width = v?.width || innerWidth, height = v?.height || innerHeight, left = v?.offsetLeft || 0, top = v?.offsetTop || 0;
  const styles = getComputedStyle(document.documentElement), inset = edge => parseFloat(styles.getPropertyValue('--safe-area-' + edge)) || 0;
  const safeLeft = inset('left') + 12, safeRight = inset('right') + 12, safeTop = inset('top') + 12, safeBottom = innerHeight - height > 120 ? 12 : inset('bottom') + 12;
  const r = anchor?.getBoundingClientRect(), desktop = !matchMedia('(any-pointer: coarse)').matches && width >= 1100;
  side.value = !!(desktop && r && r.width * 2 + 12 <= width - safeLeft - safeRight);
  if (side.value) anchor.style.translate = `${-(r.width + 12) / 2}px 0`;
  const moved = side.value ? anchor.getBoundingClientRect() : null;
  bounds.value = {
    left: `${moved ? moved.right + 12 : left + safeLeft + (width - safeLeft - safeRight - Math.min(480, width - safeLeft - safeRight)) / 2}px`,
    top: `${moved ? Math.max(top + safeTop, moved.top) : top + safeTop}px`,
    width: `${moved ? moved.width : Math.min(480, width - safeLeft - safeRight)}px`,
    height: `${moved ? Math.min(moved.height, top + height - safeBottom - Math.max(top + safeTop, moved.top)) : height - safeTop - safeBottom}px`,
  };
}
async function load(more = false) {
  if (loading.value) return;
  const ticket = ++generation, current = identity.value;
  loading.value = true; error.value = '';
  try {
    let data;
    if (messageId.value) ({ data } = await teamApi.get(`/finance/messages/${messageId.value}/history`, { params: more && cursor.value ? { cursor: cursor.value } : {} }));
    else {
      const params = new URLSearchParams({ kind: 'operation', operationId: id.value, order: 'desc', limit: '50' });
      if (more && cursor.value) params.set('cursor', cursor.value);
      data = await historyRequest('?' + params);
    }
    if (!opened.value || ticket !== generation || current !== identity.value) return;
    rows.value = more ? [...rows.value, ...data.items] : data.items;
    cursor.value = data.nextCursor || null; creation.value = data.creation || null;
  } catch (e) { if (ticket === generation && current === identity.value) error.value = e.response?.data?.message || e.message || 'Не удалось загрузить историю'; }
  finally { if (ticket === generation) loading.value = false; }
}
async function open(event) {
  returnFocus = event.currentTarget;
  anchor = returnFocus.closest('.financial-operation-popup, .popup-content');
  originalTranslate = anchor?.style.translate;
  opened.value = true; rows.value = []; cursor.value = null; creation.value = null;
  position();
  await nextTick();
  panel.value?.showModal();
  window.addEventListener('resize', position); window.visualViewport?.addEventListener('resize', position); window.visualViewport?.addEventListener('scroll', position);
  void load();
}
function close() {
  ++generation; loading.value = false; panel.value?.close(); opened.value = false; restoreAnchor();
  window.removeEventListener('resize', position); window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position);
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}
watch(identity, () => { if (opened.value) close(); });
onBeforeUnmount(close);
</script>
<template>
  <button v-if="id" type="button" class="operation-history-trigger" :aria-expanded="opened" aria-haspopup="dialog" @pointerdown.stop @click.stop="open">История изменений</button>
  <dialog v-if="opened" ref="panel" class="operation-history-panel" :class="{ 'side-panel': side }" :style="bounds" aria-label="История изменений операции" @cancel.prevent="close" @keydown.stop @pointerdown.stop @click.stop>
    <header class="operation-history-header"><strong>История изменений</strong><button type="button" aria-label="Закрыть историю изменений" @click="close"><UiIcon name="close" /></button></header>
    <div class="operation-history-scroll">
      <p v-if="error" role="alert">{{ error }} <button type="button" @click="load(!!rows.length)">Повторить</button></p>
      <ol>
        <li v-for="row in events" :key="row.id">
          <strong>{{ title(row) }}</strong>
          <div class="operation-history-who">{{ row.actorName || 'Автор не сохранён' }} · <time :datetime="row.createdAt">{{ format(row.createdAt) }}</time></div>
          <p v-if="row.detailMissing" class="operation-history-who">Подробности изменения не сохранены</p>
          <div v-for="(line, index) in changes(row)" :key="index" class="operation-history-change">
            <span>{{ line.label }}</span><div><span>{{ line.before }}</span><span aria-label="изменено на"> → </span><span>{{ line.after }}</span></div>
          </div>
          <p v-if="row.undoneAt && row.action !== 'reverted'" class="operation-history-who">Изменение отменено</p>
        </li>
      </ol>
      <p v-if="loading" role="status">Загрузка…</p>
      <p v-else-if="!events.length && !error">История изменений не сохранена</p>
      <p v-if="audit?.editUnknown && !loading" class="operation-history-who">Сведения о некоторых ранних изменениях не сохранены</p>
      <button v-if="cursor && !error" type="button" class="operation-history-more" :disabled="loading" @click="load(true)">Показать ещё</button>
    </div>
  </dialog>
</template>
<style scoped>
.operation-history-trigger { display: inline-flex; align-items: center; min-height: 44px; padding: 0; border: 0; background: transparent; color: var(--codex-pane-muted, var(--color-text-soft)); font: inherit; font-size: 12px; font-weight: 400; cursor: pointer; }
.operation-history-panel { position: fixed; inset: auto; margin: 0; padding: 0; max-width: none; max-height: none; box-sizing: border-box; border: 1px solid var(--codex-pane-border, var(--color-border, #555)); border-radius: 12px; background: var(--codex-pane-surface, var(--color-background-soft, #242424)); color: var(--codex-pane-text, var(--color-text, #ededed)); overflow: hidden; font: 13px/1.5 system-ui, sans-serif; }
.operation-history-panel[open] { display: flex; flex-direction: column; animation: operation-history-in 160ms ease-out; }
.operation-history-panel::backdrop { background: #0005; }
.operation-history-panel.side-panel::backdrop { background: transparent; }
.operation-history-header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--codex-pane-border, var(--color-border)); }
.operation-history-header strong { font-size: 14px; font-weight: 500; }
.operation-history-header button { display: grid; place-items: center; width: 44px; min-height: 44px; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; }
.operation-history-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 16px 16px; }
.operation-history-scroll ol { margin: 0; padding: 0; list-style: none; }
.operation-history-scroll li { padding: 14px 0; border-bottom: 1px solid var(--codex-pane-border, var(--color-border)); overflow-wrap: anywhere; }
.operation-history-scroll li > strong { font-size: 13px; font-weight: 500; }
.operation-history-who { margin: 3px 0 8px; color: var(--codex-pane-muted, var(--color-text-soft)); font-size: 11px; }
.operation-history-change { margin-top: 6px; white-space: pre-wrap; user-select: text; -webkit-user-select: text; }
.operation-history-change > span { color: var(--codex-pane-muted, var(--color-text-soft)); font-size: 12px; }
.operation-history-more { min-height: 44px; width: 100%; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.operation-history-trigger:focus-visible, .operation-history-panel button:focus-visible { outline: 2px solid var(--codex-pane-focus, #73a9dd); outline-offset: 2px; }
@keyframes operation-history-in { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
@media (prefers-reduced-motion: reduce) { .operation-history-panel[open] { animation: none; } }
</style>
