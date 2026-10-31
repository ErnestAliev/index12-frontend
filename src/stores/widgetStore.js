import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import axios from 'axios';
import { DASHBOARD_WIDGETS, normalizeDashboardLayout, readStoredJson, migrateForecastState } from '@/utils/dashboardWidgets.js';

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


  const staticWidgets = ref(DASHBOARD_WIDGETS);
  const savedLayout = localStorage.getItem('dashboardLayout');
  const initialLayout = normalizeDashboardLayout(readStoredJson(savedLayout, null), true);
  if (savedLayout && !localStorage.getItem('dashboardLayout:before-v2')) {
    localStorage.setItem('dashboardLayout:before-v2', savedLayout);
  }
  localStorage.setItem('dashboardLayout', JSON.stringify(initialLayout));
  const dashboardLayout = ref(initialLayout);
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
    const clean = normalizeDashboardLayout(n);
    if (JSON.stringify(clean) !== JSON.stringify(n)) { dashboardLayout.value = clean; return; }
    localStorage.setItem('dashboardLayout', JSON.stringify(clean));
    saveLayoutToServer(n);
  }, { deep: true });

  function replaceWidget(i, key) {
    // Check if widget already exists
    if (dashboardLayout.value.includes(key)) return;

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
    dashboardLayout.value = normalizeDashboardLayout(newLayout);
  }

  // --- 3. Настройки внутри виджетов (Сортировка/Фильтрация) ---
  const widgetSortMode = ref('default');
  const widgetFilterMode = ref('all');

  function setWidgetSortMode(mode) { widgetSortMode.value = mode; }
  function setWidgetFilterMode(mode) { widgetFilterMode.value = mode; }

  // --- 4. Состояние "Прогноз/Факт" (Глазик) ---
  const savedForecastState = localStorage.getItem('dashboardForecastState');
  const dashboardForecastState = ref(migrateForecastState(readStoredJson(savedForecastState, {})));

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