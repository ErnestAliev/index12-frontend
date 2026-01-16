import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// Утилита debounce
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

export const useWidgetStore = defineStore('widget', () => {


  // --- 1. Конфигурация Виджетов (Static Definitions) ---
  const staticWidgets = ref([
    { key: 'currentTotal', name: 'Всего на счетах\nна текущий момент' },
    { key: 'accounts', name: 'Счета/Кассы' },
    { key: 'companies', name: 'Мои компании' },
    { key: 'taxes', name: 'Мои налоги' },
    { key: 'credits', name: 'Мои кредиты' },
    { key: 'contractors', name: 'Мои контрагенты' },
    { key: 'projects', name: 'Мои проекты' },
    { key: 'futureTotal', name: 'Всего на счетах\nс учетом будущих' },
    { key: 'liabilities', name: 'Мои предоплаты' },
    { key: 'incomeList', name: 'Мои доходы' },
    { key: 'expenseList', name: 'Мои расходы' },
    { key: 'withdrawalList', name: 'Мои выводы' },
    { key: 'transfers', name: 'Мои переводы' },
    { key: 'individuals', name: 'Физлица' },
    { key: 'categories', name: 'Категории' },
  ]);

  // --- 2. Dashboard Layout (Расположение) ---
  const savedLayout = localStorage.getItem('dashboardLayout');
  const dashboardLayout = ref(savedLayout ? JSON.parse(savedLayout) : [
    'currentTotal', 'accounts', 'companies', 'taxes', 'credits', 'contractors',
    'projects', 'futureTotal', 'liabilities', 'incomeList', 'expenseList',
    'withdrawalList', 'transfers', 'individuals', 'categories'
  ]);
  const originalDashboardLayout = ref([]);

  // Сохранение на сервер
  const saveLayoutToServer = debounce(async (newLayout) => {
    try {
      await axios.put(`${API_BASE_URL}/user/layout`, { layout: newLayout });
      console.log('[widgetStore] Layout saved to server');
    } catch (e) {
      if (e.response && e.response.status !== 401) {
        console.error('[widgetStore] Failed to save layout:', e);
      }
    }
  }, 1000);

  watch(dashboardLayout, (n) => {
    localStorage.setItem('dashboardLayout', JSON.stringify(n));
    saveLayoutToServer(n);
  }, { deep: true });

  function replaceWidget(i, key) {
    if (i >= 0 && i < dashboardLayout.value.length) {
      if (!dashboardLayout.value.includes(key)) {
        dashboardLayout.value[i] = key;
      }
    }
  }

  function updateDashboardLayout(newLayout) {
    dashboardLayout.value = newLayout;
  }

  // --- 3. Настройки внутри виджетов (Сортировка/Фильтрация) ---
  const widgetSortMode = ref('default');
  const widgetFilterMode = ref('all');

  function setWidgetSortMode(mode) { widgetSortMode.value = mode; }
  function setWidgetFilterMode(mode) { widgetFilterMode.value = mode; }

  // --- 4. Состояние "Прогноз/Факт" (Глазик) ---
  const savedForecastState = localStorage.getItem('dashboardForecastState');
  const dashboardForecastState = ref(savedForecastState ? JSON.parse(savedForecastState) : {});

  watch(dashboardForecastState, (n) => {
    localStorage.setItem('dashboardForecastState', JSON.stringify(n));
  }, { deep: true });

  function setForecastState(widgetKey, value) {
    dashboardForecastState.value[widgetKey] = !!value;
  }

  function toggleForecastState(widgetKey) {
    if (widgetKey) {
      dashboardForecastState.value[widgetKey] = !dashboardForecastState.value[widgetKey];
    }
  }

  return {
    staticWidgets,
    dashboardLayout,
    originalDashboardLayout,
    widgetSortMode,
    widgetFilterMode,
    dashboardForecastState,

    replaceWidget,
    updateDashboardLayout,
    setWidgetSortMode,
    setWidgetFilterMode,
    setForecastState,
    toggleForecastState
  };
});