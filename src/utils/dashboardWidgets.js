export const DASHBOARD_WIDGETS = [
  { key: 'money', name: 'Деньги', fixed: true },
  { key: 'upcomingPayments', name: 'Ближайшие платежи' },
  { key: 'accounts', name: 'Счета и кассы' },
  { key: 'projects', name: 'Проекты' },
  { key: 'cashflow', name: 'Движение денег' },
  { key: 'companies', name: 'Владельцы счетов' },
  { key: 'contractors', name: 'Движение по контрагентам' },
  { key: 'individuals', name: 'Операции с людьми' },
  { key: 'articles', name: 'Статьи' },
  { key: 'transfers', name: 'Переводы' },
  { key: 'credits', name: 'Кредиты' },
];
export const DEFAULT_DASHBOARD_LAYOUT = ['upcomingPayments', 'accounts', 'projects'];
export const OVERVIEW_WIDGET_KEYS = ['money', 'upcomingPayments', 'cashflow', 'projects', 'articles', 'transfers', 'credits'];
const validKeys = new Set(DASHBOARD_WIDGETS.filter(w => !w.fixed).map(w => w.key));
const legacyDefault = ['accounts', 'companies', 'contractors', 'projects', 'incomeList', 'expenseList', 'transfers', 'individuals', 'categories'];
export const migrateWidgetKey = key => {
  if (['incomeList', 'expenseList', 'withdrawalList'].includes(key)) return 'cashflow';
  if (['categories', 'subcategories'].includes(key) || (typeof key === 'string' && key.startsWith('cat_'))) return 'articles';
  return key;
};
export function normalizeDashboardLayout(value, migrateDefault = false) {
  if (!Array.isArray(value)) return [...DEFAULT_DASHBOARD_LAYOUT];
  const old = value.filter(key => key !== 'currentTotal' && key !== 'futureTotal');
  if (migrateDefault && (JSON.stringify(old) === JSON.stringify(legacyDefault) || JSON.stringify(old) === JSON.stringify([...legacyDefault, 'subcategories']))) return [...DEFAULT_DASHBOARD_LAYOUT];
  return [...new Set(old.map(migrateWidgetKey).filter(key => validKeys.has(key)))];
}
export function readStoredJson(value, fallback) {
  try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
}
export function migrateForecastState(value) {
  const next = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return next;
  for (const [key, enabled] of Object.entries(value)) {
    const mapped = migrateWidgetKey(key);
    if (validKeys.has(mapped)) next[mapped] = !!next[mapped] || enabled === true;
  }
  return next;
}
