import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  console.log('--- uiStore.js v2.1 (CLEANUP STAGE 2 - WIDGETS REMOVED) LOADED ---');

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

  return {
    // State
    isHeaderExpanded,
    showCreditWizard,
    includeExcludedInTotal,

    // Actions
    toggleHeaderExpansion,
    toggleExcludedInclusion
  };
});