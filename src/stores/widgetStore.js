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
    { key: 'companies', name: 'Владельцы счетов' },
    { key: 'contractors', name: 'Мои контрагенты' },
    { key: 'projects', name: 'Мои проекты' },
    { key: 'futureTotal', name: 'Всего на счетах\nс учетом будущих' },
    { key: 'individuals', name: 'Физлица' },
    { key: 'categories', name: 'Категории' },
  ]);

  // --- 2. Dashboard Layout (Расположение) ---
  // Restore the layout saved before the reverted widget redesign, once per browser.
  if (!localStorage.getItem('dashboardLayout:rollback-v2')) {
    const backup = localStorage.getItem('dashboardLayout:before-v2');
    const saved = localStorage.getItem('dashboardLayout');
    let restored = false;
    try {
      if (backup && Array.isArray(JSON.parse(backup))) {
        localStorage.setItem('dashboardLayout', backup);
        restored = true;
      }
    } catch { /* Ignore an invalid backup. */ }
    if (!restored && saved) {
      try {
        const layout = JSON.parse(saved);
        if (!Array.isArray(layout) || layout.some(key => ['money', 'upcomingPayments', 'cashflow', 'articles', 'credits'].includes(key))) {
          localStorage.removeItem('dashboardLayout');
        }
      } catch { localStorage.removeItem('dashboardLayout'); }
    }
    localStorage.setItem('dashboardLayout:rollback-v2', '1');
  }
  const removedKeys = new Set(['incomeList', 'expenseList', 'transfers', 'subcategories', 'currentTotal', 'futureTotal']);
  const defaultLayout = ['accounts', 'companies', 'contractors', 'projects', 'individuals', 'categories'];
  const cleanLayout = value => [...new Set((Array.isArray(value) ? value : defaultLayout).filter(key => typeof key === 'string' && !removedKeys.has(key)))];
  let savedLayout;
  try { savedLayout = JSON.parse(localStorage.getItem('dashboardLayout')); } catch { /* Use the default layout. */ }
  const dashboardLayout = ref(cleanLayout(savedLayout));
  localStorage.setItem('dashboardLayout', JSON.stringify(dashboardLayout.value));
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
    const clean = cleanLayout(n);
    if (JSON.stringify(clean) !== JSON.stringify(n)) { dashboardLayout.value = clean; return; }
    localStorage.setItem('dashboardLayout', JSON.stringify(n));
    saveLayoutToServer(n);
  }, { deep: true });

  function replaceWidget(i, key) {
    // Check if widget already exists
    if (removedKeys.has(key) || dashboardLayout.value.includes(key)) return;

    // Replace at index or push to end if index equals length
    if (i >= 0 && i <= dashboardLayout.value.length) {
      if (i === dashboardLayout.value.length) {
        dashboardLayout.value.push(key);
      } else {
        dashboardLayout.value[i] = key;
      }
    }
  }

  function updateDashboardLayout(newLayout) {
    dashboardLayout.value = cleanLayout(newLayout);
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
