/**
 * * --- МЕТКА ВЕРСИИ: v5.3-SYNC-FIXES ---
 * * ВЕРСИЯ: 5.3 - Исправления синхронизации и позиционирования переводов
 * ДАТА: 2025-11-16
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (FIX 2) `createTransfer`/`updateTransfer` принимают `cellIndex` от клиента.
 * 2. (FIX 3) Добавлена функция `refreshRange` для принудительного обновления кеша.
 * 3. (FIX 3) `startAutoRefresh` переписан для использования `refreshRange` (с оптимизацией).
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import axios from 'axios';

// --- !!! НОВЫЙ КОД (Шаг 3): Глобальная настройка Axios !!! ---
axios.defaults.withCredentials = true; 
// --- КОНЕЦ НОВОГО КОДА ---

// Адрес "Кухни". Он возьмет VITE_API_BASE_URL из Vercel,
// а если его нет (на localhost), то использует localhost.
// НОВЫЙ КОД (Читает VITE_API_BASE_URL из Vercel):
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// =================================================================
// --- (Без изменений) ---
// =================================================================
const VIEW_MODE_DAYS = {
  '12d': { total: 12 },
  '1m':  { total: 30 },
  '3m':  { total: 90 },
  '6m':  { total: 180 },
  '1y':  { total: 360 }
};

function getViewModeInfo(mode) {
  return VIEW_MODE_DAYS[mode] || VIEW_MODE_DAYS['12d'];
}

export const useMainStore = defineStore('mainStore', () => {
  console.log('--- mainStore.js v5.3-SYNC-FIXES ЗАГРУЖЕН ---'); // !!! НОВАЯ ВЕРСИЯ !!!
  
  // ---------- STATE ----------
  
  // --- !!! НОВЫЙ КОД (Шаг 3): Состояние аутентификации !!! ---
  const user = ref(null); 
  const isAuthLoading = ref(true); 
  // --- КОНЕЦ НОВОГО КОДА ---
  
  const displayCache = ref({});
  const calculationCache = ref({});
  const accounts    = ref([]);
  const companies   = ref([]);
  const contractors = ref([]);
  const projects    = ref([]);
  const categories  = ref([]);
  const todayDayOfYear = ref(0);
  const currentYear = ref(new Date().getFullYear());

  const staticWidgets = ref([
    { key: 'currentTotal', name: 'Всего (на тек. момент)' },
    { key: 'accounts',     name: 'Мои счета' },
    { key: 'companies',    name: 'Мои компании' },
    { key: 'contractors',  name: 'Мои контрагенты' },
    { key: 'projects',     name: 'Мои проекты' },
    { key: 'futureTotal',  name: 'Всего (с уч. будущих)' },
  ]);

  // --- (Состояния, layout, watch - без изменений) ---
  const allWidgets = computed(() => {
    const cats = categories.value.map(c => ({ key: `cat_${c._id}`, name: c.name }));
    return [...staticWidgets.value, ...cats];
  });
  const savedLayout = localStorage.getItem('dashboardLayout');
  const dashboardLayout = ref(savedLayout ? JSON.parse(savedLayout) : ['currentTotal','accounts','companies','contractors','projects','futureTotal']);
  watch(dashboardLayout, (newLayout) => {
    localStorage.setItem('dashboardLayout', JSON.stringify(newLayout));
  }, { deep: true });
  const savedForecastState = localStorage.getItem('dashboardForecastState');
  const dashboardForecastState = ref(savedForecastState ? JSON.parse(savedForecastState) : {});
  watch(dashboardForecastState, (newState) => {
    localStorage.setItem('dashboardForecastState', JSON.stringify(newState));
  }, { deep: true });
  function replaceWidget(i, key){ 
    if (!dashboardLayout.value.includes(key)) dashboardLayout.value[i]=key; 
  }
  function setForecastState(widgetKey, value) {
    dashboardForecastState.value[widgetKey] = !!value;
  }
  function setToday(d){ 
    todayDayOfYear.value = d; 
    localStorage.setItem('todayDayOfYear', d.toString());
  }
  const savedToday = localStorage.getItem('todayDayOfYear');
  if (savedToday) {
    todayDayOfYear.value = parseInt(savedToday);
  }
  
  // ---------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ДАТАМИ ----------
  // ( ... без изменений ... )
  const _getDayOfYear = (date) => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000);
    return Math.floor(diff / 86400000);
  };
  const _getDateKey = (date) => {
    const year = date.getFullYear();
    const doy = _getDayOfYear(date);
    return `${year}-${doy}`;
  };
  const _parseDateKey = (dateKey) => {
    if (typeof dateKey !== 'string' || !dateKey.includes('-')) {
        console.error(`!!! mainStore._parseDateKey ОШИБКА: Получен неверный dateKey:`, dateKey);
        return new Date(); 
    }
    const [year, doy] = dateKey.split('-').map(Number);
    const date = new Date(year, 0, 1);
    date.setDate(doy);
    return date;
  };
  const _calculateDateRangeWithYear = (view, baseDate) => {
    const startDate = new Date(baseDate);
    const endDate = new Date(baseDate);
    switch (view) {
      case '12d': startDate.setDate(startDate.getDate() - 5); endDate.setDate(endDate.getDate() + 6); break;
      case '1m':  startDate.setDate(startDate.getDate() - 15); endDate.setDate(endDate.getDate() + 14); break;
      case '3m':  startDate.setDate(startDate.getDate() - 45); endDate.setDate(endDate.getDate() + 44); break;
      case '6m':  startDate.setDate(startDate.getDate() - 90); endDate.setDate(endDate.getDate() + 89); break;
      case '1y':  startDate.setDate(startDate.getDate() - 180); endDate.setDate(endDate.getDate() + 179); break;
      default:    startDate.setDate(startDate.getDate() - 5); endDate.setDate(endDate.getDate() + 6);
    }
    return { startDate, endDate };
  };
  const _formatDate = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };
  const _addDays = (base, n) => { 
    const d = new Date(base); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; 
  };
  // ( ... конец вспомогательных функций ... )

  // --- (Computed: allOperationsFlat, displayOperationsFlat, isTransfer, currentOps - без изменений) ---
  // ... (Весь блок Computed без изменений)

  // ---------- ПРОЕКЦИЯ И РАСЧЕТЫ (без изменений) ----------
  // ... (Весь блок Проекции без изменений)

  // ---------- ОСНОВНЫЕ ФУНКЦИИ ЗАГРУЗКИ ДАННЫХ ----------

  // =================================================================
  // --- 🔴 НОВОЕ: refreshRange (Решение 3) ---
  // =================================================================
  /**
   * Принудительно обновляет displayCache и calculationCache для диапазона дат с сервера.
   * Игнорирует локальный кеш.
   */
  async function refreshRange(startDate, endDate) {
    console.log(`[ЖУРНАЛ] refreshRange: 🔄 Принудительно обновляю оба кеша для ${_formatDate(startDate)} - ${_formatDate(endDate)}`);
    try {
        const promises = [];
        const dateKeysToFetch = [];
        // Убедимся, что работаем с копиями дат
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Проверка на случай, если startDate > endDate
        if (start > end) {
            return;
        }

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateKey = _getDateKey(d);
            dateKeysToFetch.push(dateKey);
            // Принудительно запрашиваем данные с сервера
            promises.push(axios.get(`${API_BASE_URL}/events?dateKey=${dateKey}`));
        }

        if (promises.length > 0) {
            const responses = await Promise.all(promises);
            const tempDisplayCache = {};
            const tempCalculationCache = {};

            for (let i = 0; i < responses.length; i++) {
                const dateKey = dateKeysToFetch[i];
                const raw = Array.isArray(responses[i].data) ? responses[i].data.slice() : [];
                const processedOps = _mergeTransfers(raw).map(op => ({
                    ...op,
                    dateKey: dateKey,
                    date: op.date || _parseDateKey(dateKey)
                }));

                tempDisplayCache[dateKey] = processedOps;
                // Создаем копии объектов для calculationCache
                tempCalculationCache[dateKey] = processedOps.map(op => ({...op}));
            }

            // Атомарно обновляем реактивные состояния. Это вызовет обновление UI.
            displayCache.value = { ...displayCache.value, ...tempDisplayCache };
            calculationCache.value = { ...calculationCache.value, ...tempCalculationCache };
        }

    } catch (error) {
        console.error('Ошибка при принудительном обновлении диапазона (refreshRange):', error);
        if (error.response && error.response.status === 401) {
            user.value = null;
        }
    }
  }
  // =================================================================
  
  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: loadCalculationData (v4.4) ---
  // =================================================================
  async function loadCalculationData(mode, baseDate = new Date()) {
    // ... (без изменений)
  }
  // =================================================================

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: fetchCalculationRange (API v4.3) ---
  // =================================================================
  async function fetchCalculationRange(startDate, endDate) {
    // ... (без изменений)
  }

  // (updateProjectionFromCalculationData - без изменений)
  async function updateProjectionFromCalculationData(mode, today = new Date()) {
    // ... (без изменений)
  }

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: fetchOperationsRange (API v4.3) ---
  // =================================================================
  async function fetchOperationsRange(startDate, endDate) {
    // ... (без изменений)
  }

  // --- (Старые/вспомогательные функции проекции - без изменений) ---
  // ... (без изменений)

  // ---------- HELPERS ----------
  // ... (без изменений)

  // ---------- API ----------
  // (fetchAllEntities - без изменений)
  async function fetchAllEntities(){
    // ... (без изменений)
  }

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: fetchOperations (API v4.3) ---
  // =================================================================
  async function fetchOperations(dateKey, force = false) {
    // ... (без изменений)
  }

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: refreshDay (API v4.3) ---
  // =================================================================
  async function refreshDay(dateKey) {
    // ... (без изменений)
  }

  // =================================================================
  // --- 🔴 ВОССТАНОВЛЕННЫЕ ФУНКЦИИ (Шаг 3 v2) 🔴 ---
  // =================================================================

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: deleteOperation (dateKey) ---
  // =================================================================
  async function deleteOperation(operation){
    // ... (без изменений)
  }

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: addOperation (dateKey) ---
  // =================================================================
  async function addOperation(op){
    // ... (без изменений)
  }

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: getFirstFreeCellIndex (dateKey) ---
  // =================================================================
  async function getFirstFreeCellIndex(dateKey, startIndex=0){
    if (typeof dateKey !== 'string' || !dateKey.includes('-')) {
        console.error(`!!! getFirstFreeCellIndex ОШИБКА:`, dateKey);
        return 0;
    }
    
    if (!displayCache.value[dateKey]) {
      await fetchOperations(dateKey); 
    }
    const arr = displayCache.value[dateKey] || [];
    const used = new Set(arr.map(o => Number.isInteger(o?.cellIndex)? o.cellIndex : -1));
    let idx = Math.max(0, startIndex|0);
    while (used.has(idx)) idx++;
    return idx;
  }

  // (_compactIndices - без изменений)
  function _compactIndices(arr, excludeId=null){
    // ... (без изменений)
  }

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: _reorderWithinDayLocal (dateKey) ---
  // =================================================================
  function _reorderWithinDayLocal(dateKey, opId, fromIndex, toIndex){
    // ... (без изменений)
  }

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: moveOperation (dateKey) ---
  // =================================================================
  async function moveOperation(operation, oldDateKey, newDateKey, desiredCellIndex){
    // ... (без изменений)
  }

  // ---------- TRANSFERS ----------
  function _generateTransferGroupId(){ return `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: createTransfer (Решение 2) ---
  // =================================================================
  async function createTransfer(transferData) {
    try {
      const finalDate = new Date(transferData.date);
      const dateKey = _getDateKey(finalDate);
      // const cellIndex = 0; // УДАЛЕНО

      // !!! ИСПРАВЛЕНИЕ (Решение 2): Используем cellIndex, переданный клиентом (TransferPopup) !!!
      const cellIndex = transferData.cellIndex !== undefined ? transferData.cellIndex : 0;

      const transferCategory = await _getOrCreateTransferCategory();
      
      console.log(`[ЖУРНАЛ] createTransfer: ➡️ Отправляю POST /api/transfers... dateKey: ${dateKey}, cellIndex: ${cellIndex}`);
      
      const response = await axios.post(`${API_BASE_URL}/transfers`, {
        ...transferData,
        // Убедимся, что отправляем объект Date
        date: finalDate,
        dateKey: dateKey, 
        cellIndex: cellIndex, // Отправляем индекс, рассчитанный на клиенте
        categoryId: transferData.categoryId || transferCategory
      });
      
      // await refreshDay(dateKey); // (v4.7: УДАЛЕНО)
      
      return response.data;
    } catch (error) {
      console.error('Ошибка создания перевода:', error);
      throw error;
    }
  }

  // =================================================================
  // --- 🔴 ИСПРАВЛЕНИЕ: updateTransfer (Решение 2) ---
  // =================================================================
  async function updateTransfer(transferId, transferData) {
    try {
      const finalDate = new Date(transferData.date);
      const dateKey = _getDateKey(finalDate);
      
      // !!! ИСПРАВЛЕНИЕ (Решение 2): Используем cellIndex, переданный клиентом !!!
      const cellIndex = transferData.cellIndex !== undefined ? transferData.cellIndex : 0;

      const response = await axios.put(`${API_BASE_URL}/events/${transferId}`, {
        ...transferData,
        dateKey: dateKey, 
        cellIndex: cellIndex, // Передаем индекс
        type: 'transfer',
        isTransfer: true
      });
      
      // await refreshDay(dateKey); // (v4.7: УДАЛЕНО)
      
      return response.data;
    } catch (error) {
      console.error('Ошибка обновления перевода:', error);
      throw error;
    }
  }

  // ---------- ENTITIES (Без изменений) ----------
  // ... (Весь блок без изменений)

  // =================================================================
  // ---------- АВТООБНОВЛЕНИЕ (ИСПРАВЛЕНО - Решение 3) ----------
  // =================================================================
  let autoRefreshInterval = null;
  function startAutoRefresh(intervalMs = 30000) {
    stopAutoRefresh();
    console.log(`[ЖУРНАЛ] startAutoRefresh: ⏱️ Запуск автообновления каждые ${intervalMs}ms`);
    autoRefreshInterval = setInterval(async () => {
      console.log('[ЖУРНАЛ] AutoRefresh: 🔄 Выполняю автообновление...');
      try {
        // 1. Обновляем сущности (Счета, Компании и т.д.)
        await fetchAllEntities();

        // !!! ИСПРАВЛЕНИЕ (Решение 3): Принудительно обновляем кеши операций !!!
        if (projection.value.mode) {
            const todayDate = new Date(currentYear.value, 0, todayDayOfYear.value || _getDayOfYear(new Date()));

            // 2. Определяем диапазон для вида
            const { startDate: viewStartDate, endDate: viewEndDate } = _calculateDateRangeWithYear(projection.value.mode, todayDate);

            // 3. Определяем диапазон "прошлого" (для корректных балансов)
            const yearStartDate = new Date(currentYear.value, 0, 1);

            // 4. Принудительно обновляем ОБА диапазона с помощью refreshRange (оптимизировано)
            console.log(`[ЖУРНАЛ] AutoRefresh: Обновляю прошлое...`);
            await refreshRange(yearStartDate, todayDate);

            console.log(`[ЖУРНАЛ] AutoRefresh: Обновляю диапазон вида (будущее)...`);
            // Оптимизация: Запрашиваем только ту часть вида, которая находится в будущем.
            if (viewEndDate > todayDate) {
                const tomorrow = new Date(todayDate);
                tomorrow.setDate(tomorrow.getDate() + 1);
                // Начало будущего диапазона - это максимум из (завтра, начало вида)
                const futureStart = viewStartDate > tomorrow ? viewStartDate : tomorrow;
                await refreshRange(futureStart, viewEndDate);
            }
            
            // 5. Пересчитываем проекцию (для обновления дашборда и графика)
            await updateProjectionFromCalculationData(
                projection.value.mode,
                todayDate
            );
        }

        console.log('[ЖУРНАЛ] AutoRefresh: ✅ Данные успешно обновлены (Timeline + Расчеты)');
      } catch (error) {
        console.error('Ошибка при автообновлении:', error);
      }
    }, intervalMs);
  }
  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      console.log('[ЖУРНАЛ] stopAutoRefresh: 🛑 Остановка автообновления.');
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }
  async function forceRefreshAll() {
    // ... (без изменений)
  }
  // =================================================================


  // --- (Импорт и Аутентификация без изменений)

  return {
    // state
    accounts, companies, contractors, projects, categories,
    operationsCache: displayCache,
    displayCache, calculationCache,
    allWidgets, dashboardLayout,
    projection,
    dashboardForecastState,

    // --- !!! НОВЫЙ КОД (Шаг 3): Экспорт состояния пользователя !!! ---
    user,
    isAuthLoading,
    // --- КОНЕЦ НОВОГО КОДА ---

    // computed
    // ... (computed экспорты)

    // getters
    getOperationsForDay, // 🔴 (Теперь принимает dateKey)

    // actions
    setToday, replaceWidget,
    setForecastState,
    fetchAllEntities, fetchOperations, refreshDay, // 🔴 (Теперь принимают dateKey)
    
    // --- !!! ВОССТАНОВЛЕННЫЕ ACTIONS (Шаг 3 v2) !!! ---
    addOperation, deleteOperation, moveOperation,
    getFirstFreeCellIndex, // 🔴 (Теперь принимает dateKey)

    // Старые (v3.0) actions
    updateFutureProjection, updateFutureProjectionByMode, setProjectionRange,
    
    // Новые (v4.0) actions
    loadCalculationData,
    fetchCalculationRange,
    updateProjectionFromCalculationData,
    refreshRange, // 🔴 (v5.3) Экспортируем новую функцию

    // transfers
    createTransfer, updateTransfer,

    // entities
    addAccount, addCompany, addContractor, addProject, addCategory,
    batchUpdateEntities,

    // auto-refresh
    startAutoRefresh, stopAutoRefresh, forceRefreshAll,

    // import
    importOperations,

    // auth
    checkAuth, logout,
    
    // helpers
    _parseDateKey,
    _getDateKey,   // Убедимся, что экспортируется
    _getDayOfYear, // Убедимся, что экспортируется
  };
});
