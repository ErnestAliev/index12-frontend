<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { DEVICE_LABELS } from '@/utils/appearanceTemplates.js';
import { FINANCIAL_COLORS, WIDGET_PARTS, APPEARANCE_SCOPE_LABELS, SCOPE_COLOR_FIELDS, SCOPE_METRIC_FIELDS, COLOR_FIELDS, METRIC_FIELDS, QUICK_THEMES, cloneAppearance, contrastRatio } from '@/utils/appearance.js';

const props = defineProps({ open: Boolean });
const emit = defineEmits(['close']);
const store = useAppearanceStore();
const panel = ref(null);
const block = ref('widgets');
const tablePart = ref('table');
const chartPart = ref('charts');
const scope = computed(() => block.value==='table'?tablePart.value:block.value==='charts'?chartPart.value:'widgets');
const selectedSaved = computed(() => store.selectedId || '');
const widgetPart = ref('card');
const controlPrefix = computed(() => scope.value==='widgets' ? `Виджеты: ${WIDGET_PARTS[widgetPart.value].label}` : scopes[scope.value]);
const saveName = ref('');
const feedback = ref('');
const error = ref('');
let openingSnapshot, returnFocus;
const scopes = APPEARANCE_SCOPE_LABELS;
const current = computed(() => store.resolved(scope.value));
const inherited = (group, key) => store.isFieldInherited(scope.value,group,key);
const colorFields = computed(() => (scope.value==='widgets'?WIDGET_PARTS[widgetPart.value].colors:SCOPE_COLOR_FIELDS[scope.value])
  .filter(key=>!Object.hasOwn(FINANCIAL_COLORS,key) && !(scope.value==='operations'&&key==='border'))
  .map(key=>[key,scope.value==='widgets'&&!['surface','border','shadow','accent'].includes(key)?'Цвет':key==='surface'?({widgets:'Фон виджетов',separators:'Фон разделителей',table:'Фон таблицы',operations:'Базовый фон чипов',charts:'Фон под графиками',summaries:'Фон итогов дня'}[scope.value]):key==='bg'?({table:'Полосы таблицы',charts:'Фон шкалы'}[scope.value]||'Дополнительный фон'):COLOR_FIELDS[key]]));
const metricFields = computed(() => (scope.value==='widgets'?WIDGET_PARTS[widgetPart.value].metrics:SCOPE_METRIC_FIELDS[scope.value])
  .filter(key=>key!=='chipOpacity')
  .map(key=>[key,METRIC_FIELDS[key]]));
const financial = computed(() => store.resolved('global').colors);
function changeFinancial(key,value) { if(/^#[\da-f]{6}$/i.test(value)) {store.setField('global','colors',key,value);error.value='';feedback.value='';}else error.value='Введите цвет в формате #112233.'; }
const metricLabel = (key,spec) => scope.value==='widgets' && /FontFamily$/.test(key) ? 'Шрифт' : scope.value==='widgets' && /Size$/.test(key)?'Размер':scope.value==='widgets' && /Weight$/.test(key)?'Жирность':({
  radius:({widgets:'Скругление виджетов',operations:'Скругление чипов'}[scope.value] || 'Скругление'),
  summarySize:'Размер основного текста', summaryWeight:'Жирность основного текста',
}[key] || spec.label);
const ratio = computed(() => {const color=scope.value==='widgets'?({title:'heading',rowLabel:'rowLabel',rowValue:'rowValue',rowForecast:'rowForecast',rowAux:'rowAux',total:'totalText',subtitle:'subtitle'}[widgetPart.value]||'text'):'text';return contrastRatio(current.value.colors[color],current.value.colors.surface).toFixed(1);});
function change(group, key, value) {
  error.value = ''; feedback.value = '';
  if (group === 'colors' && !/^#[\da-f]{6}$/i.test(value)) { error.value = 'Введите цвет в формате #112233.'; return; }
  store.setField(scope.value, group, key, value);
}
function choosePreset(id) { store.choosePreset(id); feedback.value = ''; }
async function chooseSaved(event) {
  if (await store.selectSaved(event.target.value || null)) { saveName.value=store.preferences.base?.name || ''; feedback.value=''; error.value=''; openingSnapshot=cloneAppearance(store.preferences); }
}
async function save(asNew = false) {
  feedback.value=''; error.value='';
  const result = await store.saveTheme(saveName.value,asNew);
  error.value = result.error || '';
  if (result.id) { feedback.value = `Сохранено: ${DEVICE_LABELS[store.editingDevice]}`; openingSnapshot = cloneAppearance(store.preferences); }
}
async function remove() {
  if (await store.deleteSaved(selectedSaved.value)) { saveName.value=''; feedback.value='Тема удалена'; error.value=''; openingSnapshot=cloneAppearance(store.preferences); }
}
async function resetDefault() {
  if (await store.selectSaved(null)) { saveName.value=''; feedback.value='По умолчанию'; error.value=''; openingSnapshot=cloneAppearance(store.preferences); }
}
function cancelEdits() { if (openingSnapshot) store.restore(openingSnapshot); feedback.value = 'Правки отменены'; error.value = ''; }
watch(() => store.selectedId, () => {saveName.value=store.preferences.base?.name || '';});
watch(() => props.open, async open => {
  if (open) {
    void store.refreshLibrary();
    returnFocus = document.activeElement;
    openingSnapshot = cloneAppearance(store.preferences);
    saveName.value = store.preferences.base?.name || '';
    feedback.value = ''; error.value = '';
    await nextTick(); panel.value?.focus({ preventScroll: true });
  } else returnFocus?.focus?.({ preventScroll: true });
});
onBeforeUnmount(() => returnFocus?.focus?.({ preventScroll: true }));
</script>

<template>
  <section v-if="open" id="theme-settings-panel" ref="panel" class="theme-settings-panel" :class="{ dark: store.mode === 'dark' }"
    role="dialog" aria-modal="false" aria-label="Настройки оформления" tabindex="-1" @keydown.esc.stop="emit('close')" @click.stop>
    <header class="theme-panel-header"><strong>Оформление</strong><button type="button" class="theme-small-button" aria-label="Закрыть настройки оформления" title="Закрыть" @click="emit('close')">×</button></header>
    <div class="theme-panel-scroll">
      <div class="theme-devices" role="group" aria-label="Вариант устройства"><button v-for="(label,key) in DEVICE_LABELS" :key="key" type="button" :aria-pressed="store.editingDevice===key" @click="store.setEditingDevice(key)">{{ label }}</button></div>
      <button v-if="store.editingDevice!=='desktop'" type="button" class="theme-link-button" :disabled="!store.deviceCustomized" title="Убрать корректировки этого устройства в светлом и тёмном вариантах" @click="store.inheritDesktop()">Наследовать десктоп</button>
      <div class="theme-mode" role="group" aria-label="Светлая или тёмная тема">
        <button v-for="(label, value) in { light: 'Светлая', dark: 'Тёмная' }" :key="value" type="button" :aria-pressed="store.mode === value" @click="store.setMode(value); feedback = ''">{{ label }}</button>
      </div>
      <h3>Быстрые темы</h3>
      <div class="theme-presets">
        <button v-for="preset in QUICK_THEMES" :key="preset.id" type="button" :aria-pressed="store.theme.preset === preset.id" @click="choosePreset(preset.id)">
          <span class="theme-preset-dots" aria-hidden="true"><i v-for="color in preset.colors" :key="color" :style="{ background: color }"></i></span>{{ preset.name }}
        </button>
      </div>
      <div class="theme-library-heading"><label class="theme-saved-label" for="personal-theme-list">Мои темы</label><button type="button" class="theme-link-button" :disabled="store.syncing || store.libraryBusy" aria-label="Обновить список тем" title="Загрузить темы аккаунта с других устройств" @click="store.refreshLibrary()">{{ store.syncing ? '…' : '↻' }}</button></div>
      <div class="theme-saved-row"><select id="personal-theme-list" :value="selectedSaved" :disabled="store.libraryBusy" @change="chooseSaved"><option value="">По умолчанию</option><option v-for="item in store.savedThemes" :key="item.id" :value="item.id">{{ item.name }}</option></select></div>
      <div class="theme-library-actions"><button type="button" class="theme-link-button" :disabled="store.libraryBusy || store.syncing" @click="resetDefault">По умолчанию</button><button v-if="selectedSaved" type="button" class="theme-link-button" :disabled="store.libraryBusy || store.syncing" title="Удалить шаблон вместе с вариантами всех устройств" @click="remove">Удалить тему</button></div>
      <details class="theme-section theme-financial" open><summary>Цвета операций</summary><div v-for="(label,key) in FINANCIAL_COLORS" :key="key" class="theme-color-field"><label :for="`financial-color-${key}`">{{ label }}</label><div class="theme-color-inputs"><input :id="`financial-color-${key}`" type="color" :value="financial[key]" :aria-label="`Цвета операций: ${label}`" @input="changeFinancial(key,$event.target.value)"><input type="text" class="theme-hex" :value="financial[key]" maxlength="7" :aria-label="`Цвета операций: ${label} HEX`" @change="changeFinancial(key,$event.target.value)"></div></div></details>
      <div class="theme-scope-tabs" role="group" aria-label="Настраиваемый блок"><button v-for="(label,key) in {widgets:'Виджеты',table:'Таблица',charts:'Графики'}" :key="key" type="button" :aria-pressed="block===key" @click="block=key">{{ label }}</button></div>
      <label v-if="block==='table'" class="theme-widget-part">Часть таблицы<select v-model="tablePart" aria-label="Часть таблицы"><option value="table">Ячейки и дни</option><option value="operations">Чипы операций</option><option value="separators">Разделители блоков</option></select></label>
      <label v-if="block==='charts'" class="theme-widget-part">Часть графиков<select v-model="chartPart" aria-label="Часть графиков"><option value="charts">Область графиков</option><option value="summaries">Итоги дня</option></select></label>
      <div class="theme-scope-heading"><strong>{{ scopes[scope] }}</strong><button type="button" class="theme-link-button" :title="store.editingDevice==='desktop'?'Вернуть параметры общей основы':'Наследовать параметры десктопа'" @click="store.resetScope(scope)">Наследовать всё</button></div>
      <label v-if="scope==='widgets'" class="theme-widget-part">Часть виджета<select v-model="widgetPart" aria-label="Часть виджета"><option v-for="(part,key) in WIDGET_PARTS" :key="key" :value="key">{{ part.label }}</option></select></label>
      <details v-if="colorFields.length" class="theme-section" open>
        <summary>Цвета</summary>
        <div v-for="[key, label] in colorFields" :key="key" class="theme-color-field">
          <label :for="`appearance-color-${key}`">{{ label }}</label>
          <div class="theme-color-inputs">
            <input :id="`appearance-color-${key}`" type="color" :value="current.colors[key]" :aria-label="`${controlPrefix}: ${label}`" @input="change('colors', key, $event.target.value)">
            <input type="text" class="theme-hex" :value="current.colors[key]" maxlength="7" spellcheck="false" :aria-label="`${controlPrefix}: ${label} HEX`" @change="change('colors', key, $event.target.value)">
            <button v-if="scope !== 'global'" type="button" class="theme-inherit" :class="{ inherited: inherited('colors', key) }" :disabled="inherited('colors', key)" :aria-label="`Наследовать цвет: ${label}`" :title="store.editingDevice!=='desktop'?'Наследовать цвет десктопа':inherited('colors', key)?'Из общей темы':'Вернуть цвет общей темы'" @click="store.inheritField(scope, 'colors', key)">↶</button>
          </div>
        </div>
        <div class="theme-contrast">Контраст текста <output>{{ ratio }}:1</output></div>
      </details>
      <details v-for="group in ['shape', 'type', 'shadow', 'detail'].filter(group => metricFields.some(([, spec]) => spec.group === group))" :key="group" class="theme-section" :open="group !== 'shadow'">
        <summary>{{ { type: 'Шрифты', shape: 'Границы и форма', shadow: 'Тень', detail: 'Заливки и размеры' }[group] }}</summary>
        <label v-for="[key, spec] in metricFields.filter(([, spec]) => spec.group === group)" :key="key" class="theme-range-field">
          <span class="theme-range-caption"><span>{{ metricLabel(key, spec) }}</span><output>{{ spec.options ? spec.options[current.metrics[key]].label : current.metrics[key] }}{{ spec.unit ? ` ${spec.unit}` : '' }}</output>
            <button v-if="scope !== 'global'" type="button" class="theme-inherit" :class="{ inherited: inherited('metrics', key) }" :disabled="inherited('metrics', key)" :aria-label="`Наследовать: ${spec.label}`" :title="store.editingDevice!=='desktop'?'Наследовать параметр десктопа':inherited('metrics', key)?'Из общей темы':'Вернуть значение общей темы'" @click.prevent="store.inheritField(scope, 'metrics', key)">↶</button>
          </span>
          <select v-if="spec.options" :value="current.metrics[key]" :aria-label="`${controlPrefix}: ${metricLabel(key,spec)}`" @change="change('metrics',key,$event.target.value)"><option v-for="(option,value) in spec.options" :key="value" :value="value">{{ option.label }}</option></select>
          <input v-else type="range" :min="spec.min" :max="spec.max" :step="spec.step" :value="current.metrics[key]" :aria-label="`${controlPrefix}: ${metricLabel(key, spec)}`" @input="change('metrics', key, Number($event.target.value))">
        </label>
      </details>
    </div>
    <footer class="theme-panel-footer">
      <form @submit.prevent="save(false)">
        <input v-model="saveName" type="text" placeholder="Название темы" aria-label="Название темы" maxlength="48" required>
        <div class="theme-save-actions"><button type="submit" class="theme-save-button" :disabled="store.libraryBusy || store.syncing" title="Сохранить светлый и тёмный варианты выбранного устройства">{{ selectedSaved ? `Сохранить: ${DEVICE_LABELS[store.editingDevice]}` : 'Сохранить тему' }}</button><button v-if="selectedSaved" type="button" :disabled="store.libraryBusy || store.syncing" title="Создать отдельный шаблон со всеми вариантами" @click="save(true)">Сохранить копию</button></div>
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
.theme-devices { display:flex; gap:4px; margin-bottom:8px; }.theme-devices button { flex:1; padding:6px 3px; font-size:12px; }
.theme-library-actions { display:flex; justify-content:space-between; gap:8px; margin-top:4px; }.theme-widget-part { display:block; margin:12px 0; font-size:12px; }.theme-widget-part select { width:100%; height:36px; background:var(--settings-bg); border:1px solid var(--settings-border); border-radius:6px; margin-top:6px; padding:4px; }
.theme-mode { display:flex; gap:6px; }.theme-mode button { flex:1; }
h3,.theme-saved-label { display:block; margin:16px 0 8px; font-size:12px; font-weight:600; }
.theme-presets { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
.theme-presets button { display:flex; align-items:center; gap:6px; text-align:left; font-size:12px; padding:6px; }
.theme-preset-dots { display:flex; flex:none; }.theme-preset-dots i { display:block; width:9px; height:9px; border-radius:50%; margin-right:-2px; border:1px solid #0002; }
.theme-library-heading { display:flex; align-items:center; justify-content:space-between; }.theme-settings-panel button:disabled { opacity:.45; cursor:default; }
.theme-saved-row { display:flex; align-items:center; gap:6px; }.theme-saved-row select { width:100%; min-width:0; height:34px; background:var(--settings-bg); border:1px solid var(--settings-border); border-radius:6px; padding:4px; }
.theme-scope-tabs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; margin-top:18px; }
.theme-scope-tabs button { padding:6px 3px; justify-content:center; display:flex; align-items:center; gap:8px; text-align:left; }.theme-step { display:inline-grid; place-items:center; width:20px; height:20px; border:1px solid var(--settings-border); border-radius:50%; font-size:11px; }
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
