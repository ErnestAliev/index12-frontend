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

  const sanitizeMode = (mode) => {
    if (mode === 'open' || mode === 'hidden' || mode === 'all') return mode;
    return 'all'; // default AND convert 'none' or invalid to 'all'
  };

  const initialMode = sanitizeMode(savedVisibilityMode);
  const accountVisibilityMode = ref(initialMode);

  // Sync storage to sanitized mode so дальнейшие загрузки не подхватывают 'none' или мусор
  localStorage.setItem('accountVisibilityMode', initialMode);
  localStorage.setItem('includeExcludedInTotal', String(initialMode === 'all' || initialMode === 'hidden'));

  const includeExcludedInTotal = computed(() => accountVisibilityMode.value !== 'open');

  function setAccountVisibilityMode(mode) {
    const allowed = ['open', 'hidden', 'all', 'none'];
    const next = allowed.includes(mode) ? mode : 'open';
    accountVisibilityMode.value = next;
    localStorage.setItem('accountVisibilityMode', next);
    localStorage.setItem('includeExcludedInTotal', String(next === 'all' || next === 'hidden'));
  }

  function _flagsToMode(showOpen, showHidden) {
    if (showOpen && showHidden) return 'all';
    if (showOpen) return 'open';
    if (showHidden) return 'hidden';
    return 'none'; // оба выключены
  }

  function _modeToFlags(mode) {
    switch (mode) {
      case 'all': return { showOpen: true, showHidden: true };
      case 'open': return { showOpen: true, showHidden: false };
      case 'hidden': return { showOpen: false, showHidden: true };
      case 'none': return { showOpen: false, showHidden: false };
      default: return { showOpen: true, showHidden: true };
    }
  }

  function cycleAccountVisibilityMode() {
    const order = ['all', 'open', 'hidden', 'none'];
    const idx = order.indexOf(accountVisibilityMode.value);
    const next = order[(idx + 1) % order.length];
    setAccountVisibilityMode(next);
  }

  function toggleOpenVisibility() {
    const { showOpen, showHidden } = _modeToFlags(accountVisibilityMode.value);
    const nextMode = _flagsToMode(!showOpen, showHidden);
    setAccountVisibilityMode(nextMode);
  }

  function toggleHiddenVisibility() {
    const { showOpen, showHidden } = _modeToFlags(accountVisibilityMode.value);
    const nextMode = _flagsToMode(showOpen, !showHidden);
    setAccountVisibilityMode(nextMode);
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
    toggleOpenVisibility,
    toggleHiddenVisibility,
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
