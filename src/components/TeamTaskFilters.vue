<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useTeamChatStore } from '@/stores/teamChatStore';
import { defaultTaskFilters, hasTaskFilters, taskDisplayStatuses } from '@/utils/teamTasks';
import UiIcon from './UiIcon.vue';
import { useInputModality } from '@/composables/useInputModality';
defineProps({ label: { type: String, default: 'Фильтры' } });
const chat = useTeamChatStore(), open = ref(false), root = ref(null), bounds = ref({});
const keyboard = useInputModality();
let observer;
const filters = computed(() => chat.taskFilters), active = computed(() => hasTaskFilters(filters.value));
function measure() {
  if (!open.value || !root.value) return;
  const box = root.value.getBoundingClientRect(), viewport = window.visualViewport;
  const top = viewport?.offsetTop || 0, left = viewport?.offsetLeft || 0, width = viewport?.width || innerWidth, bottom = top + (viewport?.height || innerHeight);
  const style = getComputedStyle(document.documentElement), inset = side => parseFloat(style.getPropertyValue('--safe-area-' + side)) || 0;
  const frame = root.value.closest('.task-panel,.team-workspace,.codex-chat-window')?.getBoundingClientRect();
  const start = Math.max(left + 12 + inset('left'), (frame?.left || left) + 8), end = Math.min(left + width - 12 - inset('right'), frame?.right || left + width);
  const panelWidth = Math.min(300, end - start - 8);
  const centeredLeft = Math.max(start, Math.min((frame ? frame.left + frame.width / 2 : left + width / 2) - panelWidth / 2, end - panelWidth));
  bounds.value = { left: centeredLeft - box.left + 'px', right: 'auto', width: panelWidth + 'px', maxHeight: Math.max(80, Math.min(bottom - inset('bottom'), frame?.bottom || bottom) - box.bottom - 16) + 'px' };
}
onMounted(() => { observer = new ResizeObserver(measure); observer.observe(root.value); const frame = root.value.closest('.task-panel,.team-workspace,.codex-chat-window'); if (frame) observer.observe(frame); });
async function toggle() { open.value = !open.value; if (open.value) { void chat.loadTaskOptions(); await nextTick(); measure(); } }
function outside(event) { if (open.value && !root.value?.contains(event.target)) open.value = false; }
function keys(event) { if (open.value && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); open.value = false; root.value?.querySelector('button')?.focus({ preventScroll: true }); } }
document.addEventListener('pointerdown', outside);
document.addEventListener('keydown', keys, true);
window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure);
onBeforeUnmount(() => { observer?.disconnect(); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keys, true); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); });
</script>
<template>
  <div ref="root" class="task-filter-control">
    <button type="button" class="task-filter-toggle" :class="{ 'filters-active': active }" :aria-label="label" :aria-expanded="open" @click="toggle"><UiIcon name="filter" /><i v-if="active" aria-hidden="true" /></button>
    <section v-if="open" class="shared-task-filters" :data-keyboard="keyboard" :style="bounds" role="region" aria-label="Фильтры задач">
      <label v-for="(name, key) in taskDisplayStatuses" :key="key" class="filter-check"><input v-model="filters.statuses" type="checkbox" :value="key" /><span>{{ name }}</span></label>
      <select v-model="filters.party" aria-label="Фильтр по контрагенту" class="ui-select"><option value="">Все контрагенты</option><option v-for="party in chat.taskOptions.parties" :key="party.kind + ':' + party.id" :value="party.kind + ':' + party.id">{{ party.name }}</option></select>
      <select v-model="filters.person" aria-label="Фильтр по сотруднику" class="ui-select"><option value="">Все сотрудники</option><option v-for="person in chat.state.people" :key="person._id" :value="person._id">{{ person.name }}</option></select>
      <select v-model="filters.projectId" aria-label="Фильтр по проекту" class="ui-select"><option value="">Все проекты</option><option v-for="project in chat.taskOptions.projects" :key="project._id" :value="project._id">{{ project.name }}</option><option value="__none__">Без проекта</option></select>
      <label class="filter-check"><input v-model="filters.mine" type="checkbox" />Поставлены мной</label>
      <select v-model="filters.period" aria-label="Срок" class="ui-select" @change="filters.from = ''; filters.to = ''"><option value="">Любой срок</option><option value="today">Сегодня</option><option value="none">Без срока</option><option value="range">Период</option></select>
      <div v-if="filters.period === 'range'" class="filter-dates"><input v-model="filters.from" type="date" aria-label="Срок с" /><input v-model="filters.to" type="date" aria-label="Срок по" /></div>
      <span v-if="chat.taskOptionsLoading" role="status">Загрузка…</span>
      <span v-if="chat.taskOptionsError" role="alert">{{ chat.taskOptionsError }}</span>
      <button type="button" class="reset-filters" @click="chat.taskFilters = defaultTaskFilters(); open = false">Сбросить</button>
    </section>
  </div>
</template>
<style scoped>
.task-filter-control { display: inline-flex; flex: none; position: relative; }
.task-filter-toggle { position: relative; display: grid; place-items: center; width: 36px; height: 36px; padding: 6px; border: 0; border-radius: 6px; color: var(--codex-pane-muted,var(--color-text)); background: transparent; cursor: pointer; }
.task-filter-toggle .ui-icon { width: 18px; height: 18px; }
.filters-active { color: var(--codex-pane-accent,var(--color-primary)); }
.filters-active i { position: absolute; top: 4px; right: 4px; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.shared-task-filters { position: absolute; top: calc(100% + 4px); right: 0; z-index: 80; box-sizing: border-box; display: grid; gap: 8px; overflow-y: auto; padding: 12px; border: 1px solid var(--codex-pane-border,var(--color-border)); border-radius: 8px; background: var(--codex-pane-surface,var(--color-background)); color: var(--codex-pane-text,var(--color-text)); box-shadow: 0 8px 26px #0003; font-size: 13px; }
:global(html[data-theme="dark"]) .shared-task-filters { color-scheme: dark; }
.shared-task-filters select,.shared-task-filters input[type=date] { width: 100%; min-width: 0; min-height: 36px; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--codex-pane-border,var(--color-border)); border-radius: 5px; background: var(--codex-pane-bg,var(--color-background)); color: inherit; font: inherit; }
.filter-check { display: flex; align-items: center; gap: 8px; min-height: 30px; }
.filter-check input { flex: none; margin: 0; }
.filter-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.reset-filters { min-height: 36px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.shared-task-filters :is(select,input):focus:not(:focus-visible) { outline: none; box-shadow: none; }
.shared-task-filters :is(select,input,button):focus-visible { outline: 2px solid var(--codex-pane-accent,var(--color-primary)); outline-offset: 2px; }
.shared-task-filters:not([data-keyboard=true]) :is(select,input):focus { outline: none !important; box-shadow: none !important; }
@media (pointer:coarse) { .task-filter-toggle { width: 44px; height: 44px; } .filter-check { min-height: 36px; } .shared-task-filters select { min-height: 40px; } }
</style>
