import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {


  // --- 1. Глобальные переключатели UI ---

  // Хедер (свернут/развернут)
  const isHeaderExpanded = ref(false);
  function toggleHeaderExpansion() {
    isHeaderExpanded.value = !isHeaderExpanded.value;
  }

  // Мастер кредитов (показывать/скрывать)
  const showCreditWizard = ref(false);

  // Глобальная настройка: Учитывать ли исключенные счета в общих суммах
  // Используется в mainStore для расчетов
  const savedIncludeExcluded = localStorage.getItem('includeExcludedInTotal');
  const includeExcludedInTotal = ref(savedIncludeExcluded === 'true');

  function toggleExcludedInclusion() {
    includeExcludedInTotal.value = !includeExcludedInTotal.value;
    localStorage.setItem('includeExcludedInTotal', String(includeExcludedInTotal.value));
  }

  // Widget filters state (per widget key)
  const widgetFilters = ref({});

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

  return {
    // State
    isHeaderExpanded,
    showCreditWizard,
    includeExcludedInTotal,
    widgetFilters,

    // Actions
    toggleHeaderExpansion,
    toggleExcludedInclusion,
    setWidgetSortMode,
    setWidgetFilterMode,
    getWidgetSortMode,
    getWidgetFilterMode
  };
});