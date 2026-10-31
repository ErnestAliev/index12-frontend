import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHIP_TYPES, COLOR_FIELDS, resolveChipAppearance, appearanceStorageKey, appearanceTokens, defaultTheme, parsePreferences,
  presetTheme, resolveAppearance, sanitizeTheme } from '../src/utils/appearance.js';

test('financial colours remain synchronized even when an old section override exists', () => {
  const theme = presetTheme('calm', 'light');
  theme.overrides.widgets.colors.income = '#123456';
  theme.global.colors.income = '#654321';
  const vars = appearanceTokens(theme);
  assert.equal(vars['--widget-income-color'], '#654321');
  assert.equal(vars['--op-income-color'], '#654321');
  assert.equal(vars['--graph-bar-income'], '#654321');
  delete theme.overrides.widgets.colors.income;
  assert.equal(appearanceTokens(theme)['--widget-income-color'], '#654321');
});
test('chart footer typography is independent from widgets, operations and graph axes', () => {
  const theme = defaultTheme('light');
  theme.overrides.summaries.metrics.summarySize = 9;
  theme.overrides.summaries.metrics.summaryWeight = 300;
  assert.equal(resolveAppearance(theme, 'summaries').metrics.summarySize, 9);
  const vars = appearanceTokens(theme);
  assert.equal(vars['--appearance-summaries-summarySize'], '9px');
  assert.equal(vars['--appearance-summaries-summaryWeight'], '300');
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
test('chip parts share the operation colour and legacy independent hue overrides cannot diverge', () => {
  const theme=presetTheme('calm','light');
  theme.global.colors.income='#123456';
  theme.overrides.operations.colors.chip_income_text='#abcdef';
  theme.overrides.widgets.colors.income='#fedcba';
  theme.overrides.charts.colors.income='#654321';
  const vars=appearanceTokens(sanitizeTheme(theme,'light'));
  for(const key of ['--op-income-color','--op-income-meta','--widget-income-color','--graph-bar-income','--day-summary-income','--color-income'])assert.equal(vars[key],'#123456');
  assert.notEqual(vars['--op-income-bg'],'#123456');
  assert.equal(resolveChipAppearance(theme,'operations','income').text,'#123456');
});
test('chip and active-day opacity do not reduce text opacity or erase grid stripes',()=>{
  const t=presetTheme('calm','light');t.overrides.table.colors.activeDay='#ff0000';t.overrides.operations.metrics.opacity=25;t.overrides.table.metrics.activeFill=12;
  const vars=appearanceTokens(t);
  assert.ok(vars['--op-income-bg'].endsWith(', 0.25)'));
  assert.equal(vars['--appearance-table-active-overlay'],'rgba(255, 0, 0, 0.12)');
  assert.equal(vars['--op-income-color'],t.global.colors.income);
  assert.notEqual(vars['--cell-bg-odd'],vars['--day-column-bg']);
});
test('older saved themes keep working without retired settings and new input remains bounded', () => {
  const old = {enabled:true,global:{colors:{warning:'#abcdef',info:'#112233'},metrics:{eventFill:15}},overrides:{table:{colors:{chip_income_bg:'red;display:none'},metrics:{chipOpacity:999}}}};
  const theme = sanitizeTheme(old, 'light');
  assert.equal(COLOR_FIELDS.technical, undefined);
  assert.equal(theme.overrides.table.metrics.chipOpacity, 100);
  assert.equal(theme.global.metrics.chipOpacity, 100);
  assert.equal(theme.global.metrics.activeFill, 6);
  assert.deepEqual(theme.overrides.table.colors, {});
  assert.ok(!Object.values(COLOR_FIELDS).some(label=>/Предоплата|Кредит|Техническ|Акт выполн/.test(label)));
  assert.ok(!Object.keys(CHIP_TYPES).some(type=>/prepay|credit|workact|technical/.test(type)));
  assert.ok(Object.values(appearanceTokens(theme)).every(value=>!value.includes('NaN')&&!value.includes('undefined')));
});

test('legacy themes migrate chip settings and day totals into their independent sections', () => {
  const old = {enabled:true,global:{metrics:{summarySize:12}},overrides:{table:{colors:{chip_income_bg:'#abcdef'},metrics:{chipOpacity:25,radius:7}},charts:{colors:{income:'#aabbcc'},metrics:{summarySize:15}}}};
  const migrated = sanitizeTheme(old,'light');
  assert.equal(migrated.schema,2);
  assert.equal(migrated.overrides.operations.colors.chip_income_bg,'#abcdef');
  assert.equal(migrated.overrides.operations.metrics.opacity,25);
  assert.equal(migrated.overrides.summaries.metrics.summarySize,15);
  const before = appearanceTokens(migrated);
  migrated.overrides.table.colors.surface='#112233';
  migrated.overrides.charts.colors.income='#445566';
  const after = appearanceTokens(migrated);
  assert.equal(before['--op-income-bg'],after['--op-income-bg']);
  assert.equal(before['--day-summary-income'],after['--day-summary-income']);
  assert.notEqual(before['--day-column-bg'],after['--day-column-bg']);
});
test('font families are allowlisted and shared revisions survive the local cache', () => {
  const theme=sanitizeTheme({schema:2,global:{metrics:{fontFamily:'mono',secondaryFontFamily:'bad;display:none'}}},'light');
  assert.equal(theme.global.metrics.fontFamily,'mono');
  assert.equal(theme.global.metrics.secondaryFontFamily,'system');
  const stored=parsePreferences({version:1,saved:[{id:'pc',name:'ПК',mode:'light',revision:3,theme}]});
  assert.equal(stored.saved[0].revision,3);
});
