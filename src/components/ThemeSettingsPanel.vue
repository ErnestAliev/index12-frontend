<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { CHIP_TYPES, CHIP_PARTS, CHIP_COLOR_FIELDS, APPEARANCE_SCOPE_LABELS, SCOPE_COLOR_FIELDS, SCOPE_METRIC_FIELDS, chipColorKey, resolveChipAppearance, COLOR_FIELDS, METRIC_FIELDS, QUICK_THEMES, cloneAppearance, contrastRatio } from '@/utils/appearance.js';

const props = defineProps({ open: Boolean });
const emit = defineEmits(['close']);
const store = useAppearanceStore();
const panel = ref(null);
const scope = ref('widgets');
const chipType = ref('income');
const selectedSaved = ref('');
const selectedRevision = ref(null);
let refreshTimer;
const saveName = ref('');
const feedback = ref('');
const error = ref('');
let openingSnapshot, returnFocus;
const scopes = APPEARANCE_SCOPE_LABELS;
const current = computed(() => store.resolved(scope.value));
const chip = computed(() => resolveChipAppearance(store.theme, scope.value, chipType.value));
const chipInherited = part => {
  const key = chipColorKey(chipType.value, part);
  return !Object.hasOwn(scope.value === 'global' ? store.theme.global.colors : store.theme.overrides[scope.value].colors, key);
};
const inherited = (group, key) => scope.value !== 'global' && !Object.hasOwn(store.theme.overrides[scope.value][group], key);
const colorFields = computed(() => (scope.value === 'global'
  ? Object.keys(COLOR_FIELDS).filter(key => !Object.hasOwn(CHIP_COLOR_FIELDS,key)) : SCOPE_COLOR_FIELDS[scope.value])
  .map(key => [key,key === 'surface' ? ({global:'Фон приложения',widgets:'Фон виджетов',separators:'Фон разделителей',table:'Фон таблицы',operations:'Базовый фон чипов',charts:'Фон под графиками',summaries:'Фон итогов дня'}[scope.value])
    : key === 'bg' ? ({table:'Полосы таблицы',charts:'Фон шкалы'}[scope.value] || 'Дополнительный фон') : COLOR_FIELDS[key]]));
const metricFields = computed(() => (scope.value === 'global' ? Object.keys(METRIC_FIELDS) : SCOPE_METRIC_FIELDS[scope.value])
  .filter(key => !['eventFill','chipOpacity'].includes(key) && !(key === 'radius' && scope.value === 'widgets'))
  .map(key => [key,METRIC_FIELDS[key]]));
const metricLabel = (key,spec) => ({
  radius:({widgets:'Скругление виджетов',operations:'Скругление чипов'}[scope.value] || 'Скругление'),
  summarySize:'Размер основного текста', summaryWeight:'Жирность основного текста',
}[key] || spec.label);
const ratio = computed(() => contrastRatio(current.value.colors.text, current.value.colors.surface).toFixed(1));
function change(group, key, value) {
  error.value = ''; feedback.value = '';
  if (group === 'colors' && !/^#[\da-f]{6}$/i.test(value)) { error.value = 'Введите цвет в формате #112233.'; return; }
  store.setField(scope.value, group, key, value);
}
function choosePreset(id) { store.choosePreset(id); selectedSaved.value = ''; saveName.value = ''; feedback.value = ''; }
function chooseSaved(event) {
  selectedSaved.value = event.target.value;
  const item = store.savedThemes.find(t => t.id === selectedSaved.value);
  if (item) { selectedRevision.value = item.revision; store.selectSaved(item.id); saveName.value = item.name; feedback.value = ''; error.value = ''; }
}
async function save(update = false) {
  const result = await store.saveTheme(saveName.value, update ? selectedSaved.value : null, selectedRevision.value);
  error.value = result.error || '';
  if (result.id) { selectedSaved.value = result.id; selectedRevision.value = result.revision; feedback.value = 'Тема сохранена'; openingSnapshot = cloneAppearance(store.preferences); }
}
async function remove() {
  if (await store.deleteSaved(selectedSaved.value, selectedRevision.value)) { selectedSaved.value = ''; saveName.value = ''; feedback.value = 'Тема удалена из списка'; }
}
function cancelEdits() { if (openingSnapshot) store.restore(openingSnapshot); feedback.value = 'Правки отменены'; error.value = ''; }
watch(() => store.savedThemes, items => {
  if (selectedSaved.value && selectedRevision.value == null) selectedRevision.value = items.find(t=>t.id===selectedSaved.value)?.revision || null;
});
watch(() => props.open, async open => {
  clearInterval(refreshTimer);
  if (open) {
    void store.refreshLibrary();
    refreshTimer = setInterval(() => void store.refreshLibrary(), 30000);
    returnFocus = document.activeElement;
    openingSnapshot = cloneAppearance(store.preferences);
    const matching = store.savedThemes.find(t => t.mode === store.mode && JSON.stringify(t.theme) === JSON.stringify(store.theme));
    selectedSaved.value = matching?.id || ''; selectedRevision.value = matching?.revision || null; saveName.value = matching?.name || '';
    feedback.value = ''; error.value = '';
    await nextTick(); panel.value?.focus({ preventScroll: true });
  } else returnFocus?.focus?.({ preventScroll: true });
});
onBeforeUnmount(() => { clearInterval(refreshTimer); returnFocus?.focus?.({ preventScroll: true }); });
</script>

<template>
  <section v-if="open" id="theme-settings-panel" ref="panel" class="theme-settings-panel" :class="{ dark: store.mode === 'dark' }"
    role="dialog" aria-modal="false" aria-label="Настройки оформления" tabindex="-1" @keydown.esc.stop="emit('close')" @click.stop>
    <header class="theme-panel-header"><strong>Оформление</strong><button type="button" class="theme-small-button" aria-label="Закрыть настройки оформления" title="Закрыть" @click="emit('close')">×</button></header>
    <div class="theme-panel-scroll">
      <div class="theme-mode" role="group" aria-label="Светлая или тёмная тема">
        <button v-for="(label, value) in { light: 'Светлая', dark: 'Тёмная' }" :key="value" type="button" :aria-pressed="store.mode === value" @click="store.setMode(value); selectedSaved = ''; feedback = ''">{{ label }}</button>
      </div>
      <h3>Быстрые темы</h3>
      <div class="theme-presets">
        <button v-for="preset in QUICK_THEMES" :key="preset.id" type="button" :aria-pressed="store.theme.preset === preset.id" @click="choosePreset(preset.id)">
          <span class="theme-preset-dots" aria-hidden="true"><i v-for="color in preset.colors" :key="color" :style="{ background: color }"></i></span>{{ preset.name }}
        </button>
      </div>
      <div class="theme-library-heading"><label class="theme-saved-label" for="personal-theme-list">Мои темы</label><button type="button" class="theme-link-button" :disabled="store.syncing || store.libraryBusy" aria-label="Обновить список тем" title="Загрузить темы аккаунта с других устройств" @click="store.refreshLibrary()">{{ store.syncing ? '…' : '↻' }}</button></div>
      <div class="theme-saved-row"><select id="personal-theme-list" :value="selectedSaved" @change="chooseSaved"><option value="">Выбрать тему</option><option v-for="item in store.savedThemes" :key="item.id" :value="item.id">{{ item.name }} · {{ item.mode === 'light' ? 'светлая' : 'тёмная' }}</option></select><button v-if="selectedSaved" type="button" class="theme-small-button" title="Удалить сохранённую тему" :disabled="store.libraryBusy || store.syncing" aria-label="Удалить сохранённую тему" @click="remove">×</button></div>
      <div class="theme-scope-tabs" role="group" aria-label="Настраиваемый блок">
        <button type="button" :aria-pressed="scope === 'global'" @click="scope = 'global'">Вся тема</button>
        <button v-for="([value,label],index) in Object.entries(scopes).filter(([key]) => key !== 'global')" :key="value" type="button" :aria-label="label" :aria-pressed="scope === value" @click="scope = value"><span class="theme-step" aria-hidden="true">{{ index + 1 }}</span>{{ label }}</button>
      </div>
      <div class="theme-scope-heading"><strong>{{ scopes[scope] }}</strong><button type="button" class="theme-link-button" :title="scope === 'global' ? 'Вернуть стандартную тему' : 'Наследовать все параметры общей темы'" @click="store.resetScope(scope)">{{ scope === 'global' ? 'Стандартная' : 'Наследовать всё' }}</button></div>
      <label v-if="scope === 'widgets'" class="theme-range-field">
        <span class="theme-range-caption"><span>Скругление виджетов</span><output>{{ current.metrics.radius }} px</output>
          <button type="button" class="theme-inherit" :disabled="inherited('metrics', 'radius')" aria-label="Наследовать: Скругление виджетов" title="Наследовать значение общей темы" @click.prevent="store.inheritField(scope, 'metrics', 'radius')">↶</button>
        </span>
        <input type="range" :min="METRIC_FIELDS.radius.min" :max="METRIC_FIELDS.radius.max" step="1" :value="current.metrics.radius" aria-label="Виджеты: Скругление виджетов" @input="change('metrics', 'radius', Number($event.target.value))">
      </label>
      <details class="theme-section" open>
        <summary>Цвета</summary>
        <div v-for="[key, label] in colorFields" :key="key" class="theme-color-field">
          <label :for="`appearance-color-${key}`">{{ label }}</label>
          <div class="theme-color-inputs">
            <input :id="`appearance-color-${key}`" type="color" :value="current.colors[key]" :aria-label="`${scopes[scope]}: ${label}`" @input="change('colors', key, $event.target.value)">
            <input type="text" class="theme-hex" :value="current.colors[key]" maxlength="7" spellcheck="false" :aria-label="`${scopes[scope]}: ${label} HEX`" @change="change('colors', key, $event.target.value)">
            <button v-if="scope !== 'global'" type="button" class="theme-inherit" :class="{ inherited: inherited('colors', key) }" :disabled="inherited('colors', key)" :aria-label="`Наследовать цвет: ${label}`" :title="inherited('colors', key) ? 'Из общей темы' : 'Вернуть цвет общей темы'" @click="store.inheritField(scope, 'colors', key)">↶</button>
          </div>
        </div>
        <div class="theme-contrast">Контраст текста <output>{{ ratio }}:1</output></div>
      </details>
      <details v-if="scope === 'operations'" class="theme-section" open>
        <summary>Чипы операций</summary>
        <label class="theme-chip-type">Тип операции
          <select v-model="chipType" aria-label="Тип чипа операции"><option v-for="(item, type) in CHIP_TYPES" :key="type" :value="type">{{ item.label }}</option></select>
        </label>
        <div v-for="(label, part) in CHIP_PARTS" :key="part" class="theme-color-field">
          <label :for="`appearance-chip-${part}`">{{ label }}</label>
          <div class="theme-color-inputs">
            <input :id="`appearance-chip-${part}`" type="color" :value="chip[part]" :aria-label="`${scopes[scope]}: ${CHIP_TYPES[chipType].label}: ${label}`" @input="change('colors', chipColorKey(chipType, part), $event.target.value)">
            <input type="text" class="theme-hex" :value="chip[part]" maxlength="7" spellcheck="false" :aria-label="`${scopes[scope]}: ${CHIP_TYPES[chipType].label}: ${label} HEX`" @change="change('colors', chipColorKey(chipType, part), $event.target.value)">
            <button type="button" class="theme-inherit" :class="{ inherited: chipInherited(part) }" :disabled="chipInherited(part)"
              :aria-label="`Сбросить цвет чипа: ${label}`" :title="scope === 'global' ? 'Вернуть автоматический цвет' : 'Наследовать цвет общей темы'"
              @click="store.inheritField(scope, 'colors', chipColorKey(chipType, part))">↶</button>
          </div>
        </div>
      </details>
      <details v-for="group in ['shape', 'type', 'shadow', 'detail'].filter(group => metricFields.some(([, spec]) => spec.group === group))" :key="group" class="theme-section" :open="group !== 'shadow'">
        <summary>{{ { type: 'Шрифты', shape: 'Границы и форма', shadow: 'Тень', detail: 'Заливки и размеры' }[group] }}</summary>
        <label v-for="[key, spec] in metricFields.filter(([, spec]) => spec.group === group)" :key="key" class="theme-range-field">
          <span class="theme-range-caption"><span>{{ metricLabel(key, spec) }}</span><output>{{ spec.options ? spec.options[current.metrics[key]].label : current.metrics[key] }}{{ spec.unit ? ` ${spec.unit}` : '' }}</output>
            <button v-if="scope !== 'global'" type="button" class="theme-inherit" :class="{ inherited: inherited('metrics', key) }" :disabled="inherited('metrics', key)" :aria-label="`Наследовать: ${spec.label}`" :title="inherited('metrics', key) ? 'Из общей темы' : 'Вернуть значение общей темы'" @click.prevent="store.inheritField(scope, 'metrics', key)">↶</button>
          </span>
          <select v-if="spec.options" :value="current.metrics[key]" :aria-label="`${scopes[scope]}: ${metricLabel(key,spec)}`" @change="change('metrics',key,$event.target.value)"><option v-for="(option,value) in spec.options" :key="value" :value="value">{{ option.label }}</option></select>
          <input v-else type="range" :min="spec.min" :max="spec.max" :step="spec.step" :value="current.metrics[key]" :aria-label="`${scopes[scope]}: ${metricLabel(key, spec)}`" @input="change('metrics', key, Number($event.target.value))">
        </label>
      </details>
    </div>
    <footer class="theme-panel-footer">
      <form @submit.prevent="save(false)">
        <input v-model="saveName" type="text" placeholder="Название темы" aria-label="Название темы" maxlength="48" required>
        <div class="theme-save-actions"><button type="submit" class="theme-save-button" :disabled="store.libraryBusy || store.syncing" title="Сохранить в библиотеке аккаунта">Сохранить как новую</button><button v-if="selectedSaved" type="button" :disabled="store.libraryBusy || store.syncing" title="Обновить сохранённую тему для всех устройств" @click="save(true)">Обновить</button></div>
      </form>
      <div class="theme-footer-row"><button type="button" class="theme-link-button" @click="cancelEdits">Отменить правки</button><span role="status">{{ feedback }}</span></div>
      <div v-if="error || store.storageError || store.syncError" role="alert" class="theme-error">{{ error || store.storageError || store.syncError }}</div>
    </footer>
  </section>
</template>

<style scoped>
.theme-settings-panel { --settings-bg:#fff; --settings-ink:#263631; --settings-muted:#5c6863; --settings-border:#d5ded8; --settings-soft:#f4f6f5; --settings-accent:#3b6763; position:fixed; z-index:1500; inset:0 0 0 auto; width:clamp(280px,30vw,350px); display:flex; flex-direction:column; min-height:0; background:var(--settings-bg); color:var(--settings-ink); border-left:1px solid var(--settings-border); box-shadow:-4px 0 18px #0000000a; font:13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
.theme-settings-panel.dark { --settings-bg:#222725; --settings-ink:#e7ece9; --settings-muted:#b0beb6; --settings-border:#435048; --settings-soft:#2d3531; --settings-accent:#85c1a8; color-scheme:dark; }
.theme-settings-panel * { box-sizing:border-box; }
.theme-settings-panel button,.theme-settings-panel input,.theme-settings-panel select { font:inherit; color:inherit; }
.theme-settings-panel input::placeholder { color:var(--settings-muted); opacity:1; }
.theme-settings-panel button { cursor:pointer; background:var(--settings-bg); border:1px solid var(--settings-border); border-radius:6px; padding:6px 9px; min-height:32px; }
.theme-settings-panel button:hover { background:var(--settings-soft); }
.theme-settings-panel :is(button,input,select):focus-visible { outline:2px solid var(--settings-accent); outline-offset:2px; }
.theme-settings-panel button[aria-pressed=true] { color:var(--settings-accent); border-color:var(--settings-accent); background:var(--settings-soft); }
.theme-panel-header { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 16px; border-bottom:1px solid var(--settings-border); flex-shrink:0; }
.theme-panel-header strong { font-size:15px; font-weight:600; }
.theme-settings-panel .theme-small-button { width:30px; padding:0; font-size:21px; }
.theme-panel-scroll { min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:14px 16px; scrollbar-width:thin; }
.theme-mode { display:flex; gap:6px; }.theme-mode button { flex:1; }
h3,.theme-saved-label { display:block; margin:16px 0 8px; font-size:12px; font-weight:600; }
.theme-presets { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
.theme-presets button { display:flex; align-items:center; gap:6px; text-align:left; font-size:12px; padding:6px; }
.theme-preset-dots { display:flex; flex:none; }.theme-preset-dots i { display:block; width:9px; height:9px; border-radius:50%; margin-right:-2px; border:1px solid #0002; }
.theme-library-heading { display:flex; align-items:center; justify-content:space-between; }.theme-settings-panel button:disabled { opacity:.45; cursor:default; }
.theme-saved-row { display:flex; align-items:center; gap:6px; }.theme-saved-row select { width:100%; min-width:0; height:34px; background:var(--settings-bg); border:1px solid var(--settings-border); border-radius:6px; padding:4px; }
.theme-scope-tabs { display:grid; grid-template-columns:1fr; gap:5px; margin-top:18px; }
.theme-scope-tabs button { display:flex; align-items:center; gap:8px; text-align:left; }.theme-step { display:inline-grid; place-items:center; width:20px; height:20px; border:1px solid var(--settings-border); border-radius:50%; font-size:11px; }
.theme-scope-heading { display:flex; align-items:center; justify-content:space-between; margin:16px 0 8px; }
.theme-settings-panel .theme-link-button { border:0; padding:2px 0; font-size:11px; min-height:26px; background:none; color:var(--settings-accent); }
.theme-section { border-top:1px solid var(--settings-border); padding:10px 0; }.theme-section summary { font-size:12px; font-weight:600; cursor:pointer; margin-bottom:10px; }
.theme-color-field { display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:8px; font-size:12px; }.theme-color-field>label { min-width:0; }
.theme-color-inputs { display:flex; align-items:center; gap:5px; flex:none; }.theme-color-inputs input[type=color] { width:29px; height:27px; padding:2px; background:var(--settings-bg); border:1px solid var(--settings-border); border-radius:4px; }
.theme-color-inputs .theme-hex { width:80px; padding:3px 2px; border:0; background:var(--settings-soft); border-radius:4px; font-size:11px; }
.theme-chip-type { display:block; margin-bottom:12px; font-size:12px; }
.theme-chip-type select { display:block; width:100%; height:34px; margin:6px 0 0; padding:4px 8px; background:var(--settings-bg); border:1px solid var(--settings-border); border-radius:6px; }
.theme-settings-panel .theme-inherit { flex:none; width:24px; min-height:24px; padding:0; border:0; color:var(--settings-accent); }.theme-inherit.inherited { opacity:.25; cursor:default; }
.theme-contrast { display:flex; justify-content:space-between; color:var(--settings-muted); font-size:11px; margin-top:10px; }
.theme-range-field { display:block; margin:12px 0 15px; }.theme-range-caption { display:flex; align-items:center; gap:5px; font-size:12px; }.theme-range-caption>span { margin-right:auto; }.theme-range-caption output { white-space:nowrap; color:var(--settings-muted); font-size:11px; font-variant-numeric:tabular-nums; }
.theme-range-field select { width:100%; height:34px; margin:8px 0 0; padding:4px 8px; background:var(--settings-bg); border:1px solid var(--settings-border); border-radius:6px; }
.theme-range-field input { display:block; width:100%; accent-color:var(--settings-accent); margin:8px 0 0; }
.theme-panel-footer { border-top:1px solid var(--settings-border); padding:12px 16px; flex:none; background:var(--settings-bg); }
.theme-panel-footer input { width:100%; min-width:0; padding:7px 9px; background:var(--settings-bg); border:1px solid var(--settings-border); border-radius:6px; }.theme-save-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:7px; }.theme-save-actions button { font-size:12px; }
.theme-settings-panel .theme-save-button { background:var(--settings-accent); color:var(--settings-bg); border-color:var(--settings-accent); }
.theme-footer-row { display:flex; align-items:center; justify-content:space-between; gap:5px; margin-top:5px; font-size:11px; color:var(--settings-muted); }.theme-error { color:#c8483e; font-size:12px; margin-top:6px; }
@media(max-width:699px) { .theme-settings-panel { inset:auto 0 0; width:100%; height:48dvh; border-top:1px solid var(--settings-border); border-left:0; }.theme-panel-header { padding:6px 12px; }.theme-panel-footer { padding:8px 12px; } }
@media(pointer:coarse) { .theme-settings-panel button { min-height:40px; }.theme-settings-panel input[type=range] { height:28px; }.theme-settings-panel input[type=text] { font-size:16px; } }
</style>
