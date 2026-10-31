// The global palette is inherited; section overrides only contain edited fields.
export const APPEARANCE_VERSION = 1;
export const APPEARANCE_SCOPE_LABELS = { global:'Вся тема', widgets:'Виджеты', separators:'Разделители', table:'Таблица', operations:'Операции', charts:'Графики', summaries:'Итоги дня' };
export const FINANCIAL_COLORS={income:'Доходы',expense:'Расходы',transfer:'Переводы',purple:'Вывод средств'};
export const APPEARANCE_SCOPES = Object.keys(APPEARANCE_SCOPE_LABELS);
export const FONT_OPTIONS = {
  system: { label:'Системный', css:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  inter: { label:'Inter', css:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  arial: { label:'Arial', css:'Arial, Helvetica, sans-serif' },
  georgia: { label:'Georgia', css:'Georgia, "Times New Roman", serif' },
  mono: { label:'Моноширинный', css:'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
};
export const CHIP_TYPES = {
  income: { label: 'Поступление', role: 'income' },
  expense: { label: 'Расход', role: 'expense' },
  transfer: { label: 'Перевод', role: 'transfer' },
  withdrawal: { label: 'Вывод средств', role: 'purple' },
};
export const CHIP_PARTS = { bg: 'Фон', text: 'Текст', meta:'Вспомогательный текст', border: 'Обводка' };
export const chipColorKey = (type, part) => `chip_${type}_${part}`;
export const CHIP_COLOR_FIELDS = Object.fromEntries(Object.entries(CHIP_TYPES).flatMap(([type, { label }]) =>
  Object.entries(CHIP_PARTS).map(([part, name]) => [chipColorKey(type, part), `${label}: ${name}`])));
export const COLOR_FIELDS = {
  accent: 'Активные элементы', income: 'Поступления', expense: 'Расходы',
  transfer: 'Переводы', bg: 'Фон области', surface: 'Поверхности', text: 'Основной текст',
  balance: 'Остаток на графике', purple: 'Вывод средств',
  activeDay: 'Цвет активного дня', ...CHIP_COLOR_FIELDS,
  rowLabel:'Название в строке', rowValue:'Текущая сумма', rowForecast:'Прогноз', rowAux:'Валюта и разделитель', totalText:'Главная сумма', subtitle:'Подпись главной суммы',
  muted:'Вспомогательный текст', heading:'Заголовки', border:'Обводка', shadow:'Цвет тени',
};
export const METRIC_FIELDS = {
  fontFamily: { label:'Основной шрифт', options:FONT_OPTIONS, group:'type' },
  secondaryFontFamily: { label:'Вспомогательный шрифт', options:FONT_OPTIONS, group:'type' },
  fontSize: { label: 'Размер основного текста', min: 9, max: 20, step: .5, unit: 'px', group: 'type' },
  textWeight: { label: 'Жирность основного текста', min: 300, max: 800, step: 50, group: 'type' },
  secondarySize: { label:'Размер вспомогательного текста', min:9, max:20, step:.5, unit:'px', group:'type' },
  secondaryWeight: { label:'Жирность вспомогательного текста', min:300, max:800, step:50, group:'type' },
  labelSize: { label: 'Размер заголовков', min: 9, max: 22, step: .5, unit: 'px', group: 'type' },
  labelWeight: { label: 'Жирность заголовков', min: 300, max: 800, step: 50, group: 'type' },
  balanceSize: { label: 'Размер главных сумм', min: 18, max: 44, step: 1, unit: 'px', group: 'type' },
  balanceWeight: { label: 'Жирность главных сумм', min: 300, max: 900, step: 50, group: 'type' },
  summarySize: { label: 'Размер подписей под графиком', min: 9, max: 18, step: .5, unit: 'px', group: 'type' },
  summaryWeight: { label: 'Жирность подписей под графиком', min: 300, max: 800, step: 50, group: 'type' },
  axisSize: { label: 'Размер подписей шкалы', min: 9, max: 16, step: .5, unit: 'px', group: 'type' },
  axisWeight: { label: 'Жирность подписей шкалы', min: 300, max: 800, step: 50, group: 'type' },
  mutedContrast: { label: 'Контраст вторичного текста', min: 25, max: 100, step: 1, unit: '%', group: 'detail' },
  gridContrast: { label: 'Заметность разделителей', min: 0, max: 60, step: 1, unit: '%', group: 'detail' },
  lineWidth: { label: 'Толщина линий', min: 0, max: 4, step: .25, unit: 'px', group: 'detail' },
  borderWidth: { label:'Толщина обводки', min:0, max:4, step:.5, unit:'px', group:'shape' },
  opacity: { label:'Непрозрачность фона', min:0, max:100, step:1, unit:'%', group:'detail' },
  padding: { label:'Внутренние отступы', min:0, max:20, step:1, unit:'px', group:'shape' },
  stripeStrength: { label: 'Контраст полос таблицы', min: 0, max: 100, step: 1, unit: '%', group: 'detail' },
  eventFill: { label: 'Насыщенность заливки операций', min: 0, max: 45, step: 1, unit: '%', group: 'detail' },
  chipOpacity: { label: 'Непрозрачность фона чипов', min: 0, max: 100, step: 1, unit: '%', group: 'chips' },
  activeFill: { label: 'Непрозрачность активного дня', min: 0, max: 100, step: 1, unit: '%', group: 'detail' },
  chartFill: { label: 'Насыщенность столбцов остатка', min: 5, max: 100, step: 1, unit: '%', group: 'detail' },
  rowHeight: { label: 'Высота строки таблицы', min: 28, max: 52, step: 1, unit: 'px', group: 'detail' },
  radius: { label: 'Скругление', min: 0, max: 24, step: 1, unit: 'px', group: 'shape' },
  shadow: { label: 'Непрозрачность тени', min: 0, max: 40, step: 1, unit: '%', group: 'shadow' },
  shadowBlur: { label:'Размытие тени', min:0, max:32, step:1, unit:'px', group:'shadow' },
  shadowX: { label:'Смещение тени по горизонтали', min:-16, max:16, step:1, unit:'px', group:'shadow' },
  shadowY: { label:'Смещение тени по вертикали', min:-16, max:16, step:1, unit:'px', group:'shadow' },
};
for (const part of ['rowLabel','rowValue','rowForecast','rowAux']) {
  METRIC_FIELDS[part+'FontFamily']={label:'Шрифт',options:FONT_OPTIONS,group:'type'};
  METRIC_FIELDS[part+'Size']={label:'Размер',min:8,max:24,step:.5,unit:'px',group:'type'};
  METRIC_FIELDS[part+'Weight']={label:'Жирность',min:300,max:800,step:50,group:'type'};
}
METRIC_FIELDS.headingFontFamily={label:'Шрифт названия',options:FONT_OPTIONS,group:'type'};
METRIC_FIELDS.balanceFontFamily={label:'Шрифт главной суммы',options:FONT_OPTIONS,group:'type'};
METRIC_FIELDS.widgetRowHeight={label:'Высота строки',min:16,max:52,step:1,unit:'px',group:'shape'};
METRIC_FIELDS.widgetRowGap={label:'Между строками',min:0,max:12,step:1,unit:'px',group:'shape'};
export const WIDGET_PARTS={
  card:{label:'Карточка',colors:['surface','border','shadow'],metrics:['radius','borderWidth','padding','opacity','shadow','shadowBlur','shadowX','shadowY']},
  title:{label:'Название виджета',colors:['heading'],metrics:['headingFontFamily','labelSize','labelWeight']},
  rows:{label:'Строки',colors:[],metrics:['widgetRowHeight','widgetRowGap']},
  rowLabel:{label:'Название в строке',colors:['rowLabel'],metrics:['rowLabelFontFamily','rowLabelSize','rowLabelWeight']},
  rowValue:{label:'Текущая сумма',colors:['rowValue','expense'],metrics:['rowValueFontFamily','rowValueSize','rowValueWeight']},
  rowForecast:{label:'Прогноз',colors:['rowForecast','income','expense'],metrics:['rowForecastFontFamily','rowForecastSize','rowForecastWeight']},
  rowAux:{label:'Валюта и разделитель',colors:['rowAux'],metrics:['rowAuxFontFamily','rowAuxSize','rowAuxWeight']},
  total:{label:'Главная сумма',colors:['totalText','expense'],metrics:['balanceFontFamily','balanceSize','balanceWeight']},
  subtitle:{label:'Подпись главной суммы',colors:['subtitle','accent'],metrics:['secondaryFontFamily','secondarySize','secondaryWeight']},
};
const metrics = { fontFamily:'system', secondaryFontFamily:'system', secondarySize:11, secondaryWeight:400,
  fontSize: 13, textWeight: 400, labelSize: 13, labelWeight: 600,
  balanceSize: 32, balanceWeight: 700, summarySize: 11, summaryWeight: 400,
  axisSize: 11, axisWeight: 400, mutedContrast: 75, gridContrast: 15, lineWidth: 1,
  stripeStrength: 55, eventFill: 10, chipOpacity: 100, opacity:100, borderWidth:1, padding:8,
  activeFill: 6, chartFill: 25, rowHeight: 36, radius: 4, shadow: 0, shadowBlur:10, shadowX:0, shadowY:2 };
const light = { accent: '#3b6763', income: '#25734f', expense: '#a74439', transfer: '#4b6077',
  bg: '#f4f6f5', surface: '#ffffff', text: '#263631', balance: '#718a7f', purple: '#715181' };
const dark = { accent: '#34c759', income: '#34c759', expense: '#ff6b61', transfer: '#a7b8d5',
  bg: '#1a1a1a', surface: '#282828', text: '#eeeeee', balance: '#9caebe', purple: '#de8fff' };
export const cloneAppearance = value => JSON.parse(JSON.stringify(value));
export function defaultTheme(mode = 'light') {
  return { schema:2, enabled: false, preset: '', global: { colors: { ...(mode === 'dark' ? dark : light) }, metrics: { ...metrics } },
    overrides: Object.fromEntries(APPEARANCE_SCOPES.slice(1).map(scope=>[scope,{colors:{},metrics:{}}])) };
}
const fonts = ['fontFamily','fontSize','textWeight','secondaryFontFamily','secondarySize','secondaryWeight'];
const shape = ['borderWidth','radius','opacity'];
const shadows = ['shadow','shadowBlur','shadowX','shadowY'];
export const SCOPE_COLOR_FIELDS = {
  widgets:['surface','text','muted','heading','border','income','expense','accent','shadow'],
  separators:['surface','text','border','accent','shadow'],
  table:['surface','bg','text','border','activeDay','accent','shadow'],
  operations:['surface','income','expense','transfer','purple','border','shadow'],
  charts:['surface','bg','text','muted','heading','border','income','expense','balance','accent','shadow'],
  summaries:['surface','text','muted','heading','border','income','expense','shadow'],
};
export const SCOPE_METRIC_FIELDS = {
  widgets:[...shape,'padding',...fonts,'labelSize','labelWeight','balanceSize','balanceWeight',...shadows],
  separators:[...shape,'fontFamily','fontSize','textWeight',...shadows],
  table:[...shape,'fontFamily','fontSize','textWeight','rowHeight','stripeStrength','activeFill',...shadows],
  operations:[...shape,'padding','eventFill',...fonts,...shadows],
  charts:[...shape,'fontFamily','fontSize','textWeight','secondaryFontFamily','labelSize','labelWeight','axisSize','axisWeight','chartFill','lineWidth',...shadows],
  summaries:[...shape,'padding','fontFamily','summarySize','summaryWeight','secondaryFontFamily','secondarySize','secondaryWeight',...shadows],
};
export const QUICK_THEMES = [
  { id: 'calm', name: 'Спокойная', colors: ['#3b6763', '#25734f', '#f4f6f5'] },
  { id: 'crisp', name: 'Чёткая', colors: ['#315d9c', '#18794e', '#f0f3f7'] },
  { id: 'warm', name: 'Тёплая', colors: ['#897044', '#447751', '#f5f3ed'] },
  { id: 'mono', name: 'Нейтральная', colors: ['#707070', '#18794e', '#f0f0f0'] },
];
export function presetTheme(id, mode) {
  const t = defaultTheme(mode);
  t.enabled = true; t.preset = id;
  const changes = mode === 'dark' ? {
    crisp: { accent: '#82aef3', income: '#68c99a', expense: '#f38787', bg: '#161b24', surface: '#222b38', balance: '#708ba7' },
    warm: { accent: '#d6b579', income: '#9fc39a', expense: '#e88b76', bg: '#211f1a', surface: '#302c25', text: '#ede7dc', balance: '#a29979' },
    mono: { accent: '#b0b0b0', bg: '#191919', surface: '#282828', text: '#eeeeee', balance: '#9b9b9b' },
  } : {
    crisp: { accent: '#315d9c', income: '#18794e', expense: '#be3d3a', transfer: '#6c559f', bg: '#f0f3f7', text: '#202e3e', balance: '#7188a2' },
    warm: { accent: '#897044', income: '#447751', expense: '#bd543e', bg: '#f5f3ed', surface: '#fffefa', text: '#3b3831', balance: '#96937b' },
    mono: { accent: '#707070', income: '#18794e', expense: '#be3d3a', bg: '#f0f0f0', surface: '#ffffff', text: '#202020', balance: '#909090' },
  };
  Object.assign(t.global.colors, changes[id] || {});
  if (id === 'crisp') Object.assign(t.global.metrics, { gridContrast: 19, labelWeight: 650, radius: 3 });
  if (id === 'warm') Object.assign(t.global.metrics, { gridContrast: 13, radius: 7 });
  return t;
}
export function resolveAppearance(theme, scope = 'global') {
  const base = theme.global;
  const override = theme.overrides[scope];
  const colors = { ...base.colors, ...override?.colors };
  for (const key of Object.keys(FINANCIAL_COLORS)) colors[key]=base.colors[key];
  const resolvedMetrics = { ...base.metrics, ...override?.metrics };
  colors.activeDay ??= colors.accent;
  colors.muted ??= mixColor(colors.surface, colors.text, resolvedMetrics.mutedContrast);
  colors.border ??= mixColor(colors.surface, colors.text, resolvedMetrics.gridContrast);
  colors.heading ??= colors.muted;
  colors.shadow ??= '#000000';
  for (const [key,fallback] of Object.entries({rowLabel:colors.muted,rowValue:colors.text,rowForecast:colors.muted,rowAux:colors.muted,totalText:colors.text,subtitle:colors.muted})) colors[key] ??= fallback;
  for (const part of ['rowLabel','rowValue','rowForecast','rowAux']) {
    resolvedMetrics[part+'FontFamily'] ??= resolvedMetrics.fontFamily;
    resolvedMetrics[part+'Size'] ??= part==='rowAux'?Math.round(resolvedMetrics.fontSize*.85*2)/2:resolvedMetrics.fontSize;
    resolvedMetrics[part+'Weight'] ??= resolvedMetrics.textWeight;
  }
  resolvedMetrics.headingFontFamily ??= resolvedMetrics.fontFamily;
  resolvedMetrics.balanceFontFamily ??= resolvedMetrics.fontFamily;
  resolvedMetrics.widgetRowHeight ??= 18; resolvedMetrics.widgetRowGap ??= 2;
  return { colors, metrics:resolvedMetrics };
}
export function resolveChipAppearance(theme, scope, type) {
  const { colors, metrics } = resolveAppearance(theme, scope);
  const role = CHIP_TYPES[type]?.role || 'income';
  const tone = colors[role];
  return {bg:mixColor(colors.surface,tone,metrics.eventFill),text:tone,meta:tone,border:mixColor(colors.surface,tone,Math.min(100,metrics.eventFill+20))};
}
export function alphaColor(hex, opacity) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${rgb.join(', ')}, ${Math.max(0, Math.min(100, opacity)) / 100})`;
}
function cleanFields(input, sparse, mode) {
  const defaults = defaultTheme(mode).global;
  const out = sparse ? { colors: {}, metrics: {} } : cloneAppearance(defaults);
  for (const key of Object.keys(COLOR_FIELDS)) {
    if (/^#[\da-f]{6}$/i.test(input?.colors?.[key] || '')) out.colors[key] = input.colors[key].toLowerCase();
  }
  for (const [key, spec] of Object.entries(METRIC_FIELDS)) {
    const value = input?.metrics?.[key];
    if (spec.options) { if (Object.hasOwn(spec.options, value || '')) out.metrics[key] = value; continue; }
    if (typeof value === 'number' && Number.isFinite(value)) out.metrics[key] = Math.min(spec.max, Math.max(spec.min, value));
  }
  return out;
}
export function sanitizeTheme(input, mode) {
  const t = defaultTheme(mode);
  if (!input || typeof input !== 'object') return t;
  t.enabled = input.enabled === true;
  t.preset = QUICK_THEMES.some(p => p.id === input.preset) ? input.preset : '';
  t.global = cleanFields(input.global, false, mode);
  for (const scope of APPEARANCE_SCOPES.slice(1)) t.overrides[scope] = cleanFields(input.overrides?.[scope], true, mode);
  if (input.schema !== 2) {
    if (!input.overrides?.operations) {
      t.overrides.operations = cleanFields(input.overrides?.table, true, mode);
      if (typeof t.overrides.operations.metrics.chipOpacity === 'number') t.overrides.operations.metrics.opacity = t.overrides.operations.metrics.chipOpacity;
    }
    if (!input.overrides?.summaries) {
      t.overrides.summaries = cleanFields(input.overrides?.charts, true, mode);
      const previous = resolveAppearance(t,'charts');
      t.overrides.summaries.colors.surface = mixColor(previous.colors.surface,previous.colors.bg,65);
    }
    if (typeof t.global.metrics.chipOpacity === 'number' && input.global?.metrics?.chipOpacity != null && !input.overrides?.operations?.metrics?.opacity) t.overrides.operations.metrics.opacity ??= t.global.metrics.chipOpacity;
  }
  return t;
}
export function defaultPreferences() {
  return { version: APPEARANCE_VERSION, mode: 'dark', themes: { light: defaultTheme('light'), dark: defaultTheme('dark') }, saved: [] };
}
export function parsePreferences(raw) {
  const defaults = defaultPreferences();
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (data?.version !== APPEARANCE_VERSION) return defaults;
    defaults.mode = data.mode === 'light' ? 'light' : 'dark';
    for (const mode of ['light', 'dark']) defaults.themes[mode] = sanitizeTheme(data.themes?.[mode], mode);
    const ids = new Set();
    defaults.saved = (Array.isArray(data.saved) ? data.saved : []).filter(t => {
      if (!t || typeof t.id !== 'string' || !t.id || ids.has(t.id) || typeof t.name !== 'string' || !t.name.trim()) return false;
      ids.add(t.id); return true;
    }).slice(0, 40).map(t => ({ id: t.id.slice(0, 100), name: t.name.trim().slice(0, 48), mode: t.mode === 'dark' ? 'dark' : 'light', theme: sanitizeTheme(t.theme, t.mode), ...(Number.isSafeInteger(t.revision) && t.revision>0 ? {revision:t.revision} : {}) }));
  } catch { /* A damaged preference must never prevent login. */ }
  return defaults;
}
export const appearanceStorageKey = userId => `index12-appearance-v1:${encodeURIComponent(String(userId))}`;
export function mixColor(a, b, percent) {
  const p = Math.max(0, Math.min(100, percent)) / 100;
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const aa = rgb(a), bb = rgb(b);
  return '#' + aa.map((n, i) => Math.round(n + (bb[i] - n) * p).toString(16).padStart(2, '0')).join('');
}
export function contrastRatio(a, b) {
  const lum = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
// Bridge the existing component tokens. No component has to read or mutate a palette.
export function appearanceTokens(theme) {
  const vars = {};
  const put = (names, value) => names.split(' ').forEach(name => vars['--' + name] = String(value));
  function palette(scope) {
    const { colors: c, metrics: m } = resolveAppearance(theme, scope);
    return { c, m, muted:c.muted, border:c.border, surface:m.opacity===100?c.surface:alphaColor(c.surface,m.opacity),
      soft: mixColor(c.surface, c.accent, 10), panel: mixColor(c.surface, c.bg, 65) };
  }
  const g = palette('global');
  put('light-canvas color-background bg-main', g.c.bg);
  put('light-surface color-background-soft bg-soft', g.c.surface);
  put('light-text color-text color-heading text-main text-dark', g.c.text);
  put('light-secondary light-muted color-text-soft color-text-mute text-soft text-mute', g.muted);
  put('light-border color-border ui-panel-border', g.border);
  put('light-border-strong color-border-hover', mixColor(g.c.surface, g.c.text, 35));
  put('light-panel color-background-mute ui-panel-bg', g.panel);
  put('light-hover bg-hover', mixColor(g.c.surface, g.c.accent, 12));
  put('light-accent color-primary', g.c.accent); put('light-accent-soft', g.soft);
  put('light-accent-hover', mixColor(g.c.accent, g.c.text, 15));
  for (const [key, role, aliases] of [['income', 'income', 'color-success color-income'], ['expense', 'expense', 'color-danger color-expense'], ['warning', 'accent', 'color-warning'], ['info', 'transfer', 'color-info'], ['purple', 'purple', '']]) {
    put('light-' + key + (aliases ? ' ' + aliases : ''), g.c[role]);
    put('light-' + key + '-soft', mixColor(g.c.surface, g.c[role], g.m.eventFill));
  }
  put('btn-widget-color-active', contrastRatio(g.c.accent, '#ffffff') > contrastRatio(g.c.accent, '#111111') ? '#ffffff' : '#111111');
  put('btn-panel-bg filter-dropdown-bg tooltip-bg period-selector-bg', g.c.surface);
  put('btn-panel-color filter-dropdown-text-color tooltip-text-main', g.c.text);
  put('btn-panel-border tooltip-border filter-dropdown-border', g.border);
  put('btn-panel-bg-active filter-dropdown-item-active-bg', g.soft);
  put('btn-panel-border-active btn-panel-color-active filter-dropdown-item-active-color', g.c.accent);
  put('right-panel-bg header-resizer-bg divider-wrapper-bg nav-panel-bg scrollbar-track-bg', g.panel);
  put('right-panel-border header-resizer-border divider-wrapper-border nav-panel-border', g.border);
  put('header-resizer-dot-bg vertical-resizer-dot-bg scrollbar-thumb-bg-active btn-about-bg', g.c.accent);
  put('tooltip-text-label filter-dropdown-title-color filter-dropdown-symbol-color', g.muted);
  put('tooltip-text-value', g.c.income);
  const w = palette('widgets');
  put('widget-background', w.surface); put('widget-border widget-border-right widget-grid-color', w.border);
  put('widget-text-main', w.c.text); put('widget-title-color',w.c.heading); put('widget-text-soft widget-text-mute widget-neutral-color', w.muted);
  put('widget-income-color', w.c.income); put('widget-expense-color', w.c.expense);
  put('btn-widget-bg', w.panel); put('btn-widget-border', w.border); put('btn-widget-color', w.muted);
  put('btn-widget-bg-active', w.c.accent); put('btn-widget-border-active', w.c.accent);
  put('btn-widget-color-active', contrastRatio(w.c.accent, '#ffffff') > contrastRatio(w.c.accent, '#111111') ? '#ffffff' : '#111111');
  put('widget-bg-hover btn-widget-bg-hover', mixColor(w.c.surface, w.c.accent, 10));
  const sep = palette('separators');
  put('header-resizer-bg divider-wrapper-bg',sep.surface);
  put('header-resizer-border divider-wrapper-border header-resizer-border-hover',sep.border);
  put('header-resizer-dot-bg vertical-resizer-dot-bg',sep.c.accent);
  const t = palette('table');
  put('day-column-bg', t.surface); put('day-column-border cell-border', t.border);
  const stripe = mixColor(t.c.surface,t.c.bg,t.m.stripeStrength);
  put('cell-bg-odd',t.m.opacity===100?stripe:alphaColor(stripe,t.m.opacity));
  put('day-header-bg', t.panel); put('day-header-text', t.c.text);
  put('day-header-today-text day-today-border-color day-tomorrow-border-color cell-dragover-outline', t.c.accent);
  put('cell-bg-hover cell-bg-dragover', t.soft);
  put('appearance-table-active-overlay', alphaColor(t.c.activeDay, t.m.activeFill));
  const o = palette('operations');
  put('op-default-bg',o.surface);put('op-border op-default-border',o.border);put('op-default-color op-default-text',o.c.text);
  const types = { ...Object.fromEntries(Object.keys(CHIP_TYPES).map(type => [type, type])), prepay: 'income', closed: 'income', credit: 'income' };
  for (const [type, source] of Object.entries(types)) {
    const chip = resolveChipAppearance(theme, 'operations', source);
    put(`op-${type}-color`, chip.text);put(`op-${type}-meta`,chip.meta);
    put(`op-${type}-bg`, o.m.opacity === 100 ? chip.bg : alphaColor(chip.bg, o.m.opacity));
    put(`op-${type}-border`, chip.border);
  }
  const ch = palette('charts');
  put('graph-bg-main chart-wrapper-bg', ch.surface); put('graph-bg-soft y-axis-panel-bg', ch.panel);
  put('graph-grid-color y-axis-panel-border', ch.border);
  put('graph-axis-color y-axis-label-color', ch.muted);
  put('graph-balance-active', mixColor(ch.c.surface, ch.c.balance, Math.min(100, ch.m.chartFill + 8)));
  put('graph-balance-idle', mixColor(ch.c.surface, ch.c.balance, ch.m.chartFill));
  put('graph-line-balance graph-balance-edge', ch.c.balance);
  put('graph-line-income graph-bar-income', ch.c.income);
  put('graph-line-expense graph-bar-expense', ch.c.expense);
  const summary = palette('summaries');
  put('day-summary-bg',summary.surface);put('day-summary-border',summary.border);
  put('day-summary-date',summary.c.heading);put('day-summary-text',summary.muted);
  put('day-summary-income',summary.c.income);put('day-summary-expense',summary.c.expense);
  put('day-summary-balance day-summary-balance-value',summary.c.text);
  put('graph-line-projection', ch.c.balance);
  put('graph-point-stroke', ch.c.accent); put('graph-point-fill', ch.c.surface);
  put('appearance-summaries-height appearance-charts-summaryHeight',Math.max(64,Math.ceil(summary.m.summarySize*1.4*3+summary.m.secondarySize*1.4+summary.m.padding*2+10))+'px');
  for (const scope of APPEARANCE_SCOPES) {
    const { colors, metrics } = resolveAppearance(theme, scope);
    for (const [key, value] of Object.entries(colors)) put(`appearance-${scope}-${key}`, value);
    for (const [key, value] of Object.entries(metrics)) put(`appearance-${scope}-${key}`, METRIC_FIELDS[key].options?FONT_OPTIONS[value].css:value + (METRIC_FIELDS[key].unit === 'px' ? 'px' : ''));
    put(`appearance-${scope}-shadowValue`,`${metrics.shadowX}px ${metrics.shadowY}px ${metrics.shadowBlur}px ${alphaColor(colors.shadow,metrics.shadow)}`);
  }
  return vars;
}
