import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHIP_TYPES, COLOR_FIELDS, chipColorKey, resolveChipAppearance, appearanceStorageKey, appearanceTokens, defaultTheme, parsePreferences,
  presetTheme, resolveAppearance, sanitizeTheme } from '../src/utils/appearance.js';

test('a local colour survives global edits while untouched blocks keep inheriting', () => {
  const theme = presetTheme('calm', 'light');
  theme.overrides.widgets.colors.income = '#123456';
  theme.global.colors.income = '#654321';
  const vars = appearanceTokens(theme);
  assert.equal(vars['--widget-income-color'], '#123456');
  assert.equal(vars['--op-income-color'], '#654321');
  assert.equal(vars['--graph-bar-income'], '#654321');
  delete theme.overrides.widgets.colors.income;
  assert.equal(appearanceTokens(theme)['--widget-income-color'], '#654321');
});
test('chart footer typography is independent from widgets, operations and graph axes', () => {
  const theme = defaultTheme('light');
  theme.overrides.charts.metrics.summarySize = 9;
  theme.overrides.charts.metrics.summaryWeight = 300;
  assert.equal(resolveAppearance(theme, 'charts').metrics.summarySize, 9);
  const vars = appearanceTokens(theme);
  assert.equal(vars['--appearance-charts-summarySize'], '9px');
  assert.equal(vars['--appearance-charts-summaryWeight'], '300');
  assert.equal(vars['--appearance-widgets-fontSize'], '13px');
  assert.equal(vars['--appearance-table-fontSize'], '13px');
  assert.equal(vars['--appearance-charts-axisSize'], '11px');
});
test('persisted colours cannot inject CSS and invalid metrics stay finite and bounded', () => {
  const t = sanitizeTheme({ enabled:true, global:{ colors:{ text:'red;display:none', income:'#aabbcc' }, metrics:{ fontSize:1000, rowHeight:-9, shadow:Infinity } }, overrides:{ table:{ colors:{ expense:'url(https://bad)' }, metrics:{ lineWidth:2 } } } }, 'light');
  assert.equal(t.global.colors.text, defaultTheme('light').global.colors.text);
  assert.equal(t.global.colors.income, '#aabbcc');
  assert.equal(t.global.metrics.fontSize, 20);
  assert.equal(t.global.metrics.rowHeight, 28);
  assert.equal(t.global.metrics.shadow, 0);
  assert.deepEqual(t.overrides.table.colors, {});
  assert.equal(t.overrides.table.metrics.lineWidth, 2);
});
test('corrupt or future storage falls back safely and user keys never share a workspace owner', () => {
  assert.equal(parsePreferences('not JSON').themes.light.enabled, false);
  assert.equal(parsePreferences({ version:99 }).themes.dark.enabled, false);
  assert.notEqual(appearanceStorageKey('owner'), appearanceStorageKey('employee'));
  const stored = parsePreferences({version:1, mode:'light', themes:{light:presetTheme('warm','light')}, saved:[{id:'warm',name:' Тёплая ',mode:'light',theme:presetTheme('warm','light')},{id:'warm',name:'Duplicate'}]});
  assert.equal(stored.saved.length, 1);
  assert.equal(stored.saved[0].name, 'Тёплая');
  assert.equal(stored.themes.dark.enabled, false);
  assert.equal(stored.themes.light.global.colors.bg, '#f5f3ed');
});
test('chip background, text and border are independent, inherited and persisted separately', () => {
  const t = presetTheme('calm', 'light');
  t.global.colors[chipColorKey('income', 'bg')] = '#ffeedd';
  t.overrides.table.colors[chipColorKey('income', 'text')] = '#123456';
  t.overrides.table.colors[chipColorKey('income', 'border')] = '#654321';
  const originalExpense = resolveChipAppearance(t, 'table', 'expense');
  const reloaded = sanitizeTheme(JSON.parse(JSON.stringify(t)), 'light');
  assert.deepEqual(resolveChipAppearance(reloaded, 'table', 'income'), {bg:'#ffeedd',text:'#123456',border:'#654321'});
  assert.deepEqual(resolveChipAppearance(reloaded, 'table', 'expense'), originalExpense);
  const vars = appearanceTokens(reloaded);
  assert.equal(vars['--op-income-bg'], '#ffeedd');
  assert.equal(vars['--op-income-color'], '#123456');
  assert.equal(vars['--op-income-border'], '#654321');
  assert.equal(vars['--widget-income-color'], t.global.colors.income);
  assert.equal(vars['--graph-bar-income'], t.global.colors.income);
  delete reloaded.overrides.table.colors[chipColorKey('income', 'text')];
  assert.equal(resolveChipAppearance(reloaded, 'table', 'income').text, t.global.colors.income);
});
test('chip and active-day opacity do not reduce the opacity of text, grid or unrelated chips', () => {
  const t = presetTheme('calm', 'light');
  t.overrides.table.colors.activeDay = '#ff0000';
  t.overrides.table.colors[chipColorKey('income', 'bg')] = '#ffffff';
  t.overrides.table.metrics.chipOpacity = 25;
  t.overrides.table.metrics.activeFill = 12;
  const vars = appearanceTokens(t);
  assert.equal(vars['--op-income-bg'], 'rgba(255, 255, 255, 0.25)');
  assert.equal(vars['--appearance-table-active-overlay'], 'rgba(255, 0, 0, 0.12)');
  assert.equal(vars['--op-income-color'], t.global.colors.income);
  assert.notEqual(vars['--cell-bg-odd'], vars['--day-column-bg']);
  t.overrides.table.metrics.activeFill = 0;
  assert.equal(appearanceTokens(t)['--appearance-table-active-overlay'], 'rgba(255, 0, 0, 0)');
});
test('older saved themes keep working without retired settings and new input remains bounded', () => {
  const old = {enabled:true,global:{colors:{warning:'#abcdef',info:'#112233'},metrics:{eventFill:15}},overrides:{table:{colors:{chip_income_bg:'red;display:none'},metrics:{chipOpacity:999}}}};
  const theme = sanitizeTheme(old, 'light');
  assert.equal(theme.global.colors.technical, '#abcdef');
  assert.equal(theme.overrides.table.metrics.chipOpacity, 100);
  assert.equal(theme.global.metrics.chipOpacity, 100);
  assert.equal(theme.global.metrics.activeFill, 6);
  assert.deepEqual(theme.overrides.table.colors, {});
  assert.ok(!Object.values(COLOR_FIELDS).some(label=>/Предоплата|Кредит/.test(label)));
  assert.ok(!Object.keys(CHIP_TYPES).some(type=>/prepay|credit/.test(type)));
  assert.ok(Object.values(appearanceTokens(theme)).every(value=>!value.includes('NaN')&&!value.includes('undefined')));
});
