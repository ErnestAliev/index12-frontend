import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useUiStore = defineStore('ui', () => {


  // --- 1. Глобальные переключатели UI ---

  // Хедер (свернут/развернут)
  const isHeaderExpanded = ref(false);
  function toggleHeaderExpansion() {
    isHeaderExpanded.value = !isHeaderExpanded.value;
  }

  // Мастер кредитов (показывать/скрывать)
  const showCreditWizard = ref(false);

  // Глобальная настройка видимости счетов (три состояния)
  const savedIncludeExcluded = localStorage.getItem('includeExcludedInTotal');
  const savedVisibilityMode = localStorage.getItem('accountVisibilityMode');
  const accountVisibilityMode = ref(
    savedVisibilityMode === 'hidden' || savedVisibilityMode === 'all'
      ? savedVisibilityMode
      : (savedIncludeExcluded === 'true' ? 'all' : 'open') // миграция со старого флага
  );

  const includeExcludedInTotal = computed(() => accountVisibilityMode.value !== 'open');

  function setAccountVisibilityMode(mode) {
    const allowed = ['open', 'hidden', 'all'];
    const next = allowed.includes(mode) ? mode : 'open';
    accountVisibilityMode.value = next;
    localStorage.setItem('accountVisibilityMode', next);
    localStorage.setItem('includeExcludedInTotal', String(next !== 'open'));
  }

  function cycleAccountVisibilityMode() {
    const order = ['open', 'hidden', 'all'];
    const idx = order.indexOf(accountVisibilityMode.value);
    const next = order[(idx + 1) % order.length];
    setAccountVisibilityMode(next);
  }

  // Backward compatibility: old toggle flips between open/all
  function toggleExcludedInclusion() {
    setAccountVisibilityMode(accountVisibilityMode.value === 'open' ? 'all' : 'open');
  }

  // Widget filters state (per widget key)
  const widgetFilters = ref({});

  // Widget period filters state (per widget key)
  const widgetPeriodFilters = ref({});

  function setWidgetSortMode(widgetKey, mode) {
    if (!widgetFilters.value[widgetKey]) {
      widgetFilters.value[widgetKey] = { sortMode: 'default', filterMode: 'all' };
    }
    widgetFilters.value[widgetKey].sortMode = mode;
  }

  function setWidgetFilterMode(widgetKey, mode) {
    if (!widgetFilters.value[widgetKey]) {
      widgetFilters.value[widgetKey] = { sortMode: 'default', filterMode: 'all' };
    }
    widgetFilters.value[widgetKey].filterMode = mode;
  }

  function getWidgetSortMode(widgetKey) {
    return widgetFilters.value[widgetKey]?.sortMode || 'default';
  }

  function getWidgetFilterMode(widgetKey) {
    return widgetFilters.value[widgetKey]?.filterMode || 'all';
  }

  function setWidgetPeriod(widgetKey, periodConfig) {
    widgetPeriodFilters.value[widgetKey] = periodConfig;
  }

  function getWidgetPeriod(widgetKey) {
    return widgetPeriodFilters.value[widgetKey] || { mode: 'all', customStart: null, customEnd: null };
  }

  return {
    // State
    isHeaderExpanded,
    showCreditWizard,
    accountVisibilityMode,
    includeExcludedInTotal,
    widgetFilters,
    widgetPeriodFilters,

    // Actions
    toggleHeaderExpansion,
    toggleExcludedInclusion,
    setAccountVisibilityMode,
    cycleAccountVisibilityMode,
    setWidgetSortMode,
    setWidgetFilterMode,
    getWidgetSortMode,
    getWidgetFilterMode,
    setWidgetPeriod,
    getWidgetPeriod
  };
});
