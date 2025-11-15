<script setup>
import { onMounted, onBeforeUnmount, ref, computed, nextTick } from 'vue';
import OperationPopup from '@/components/OperationPopup.vue';
import TransferPopup from '@/components/TransferPopup.vue';
import TheHeader from '@/components/TheHeader.vue';
import CellContextMenu from '@/components/CellContextMenu.vue';
import DayColumn from '@/components/DayColumn.vue';
import NavigationPanel from '@/components/NavigationPanel.vue';
import GraphRenderer from '@/components/GraphRenderer.vue';
import YAxisPanel from '@/components/YAxisPanel.vue';
import { useMainStore } from '@/stores/mainStore';
import ImportExportModal from '@/components/ImportExportModal.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v5.2-AUTH-MENU-FIX ---
 * * ВЕРСIA: 5.2 - Исправлено позиционирование меню пользователя
 * ДАТА: 2025-11-14
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (FIX) HTML-блок `.user-menu` вынесен из `<aside>`
 * в корень `<template>`, как и `CellContextMenu`.
 * 2. (FIX) `.user-menu` теперь позиционируется через `:style="userMenuPosition"`.
 * 3. (FIX) `toggleUserMenu` теперь вычисляет `userMenuPosition`,
 * используя `userButtonRef` (добавлен ref на кнопку).
 */

console.log('--- HomeView.vue v5.2-AUTH-MENU-FIX ЗАГРУЖЕН ---'); 

const mainStore = useMainStore();
const showImportModal = ref(false); 

// --- !!! ИЗМЕНЕНИЯ (Шаг 4 v2) !!! ---
const showUserMenu = ref(false);
const userButtonRef = ref(null); // (у вас уже есть)
const userMenuPosition = ref({ top: '0px', left: '0px' }); // (у вас уже есть)

/**
 * !!! ИЗМЕНЕНИЕ (Шаг 4 v3): Обработчики меню пользователя !!!
 */
const handleLogout = () => {
  showUserMenu.value = false;
  mainStore.logout();
};

// !!! ЗАМЕНИТЕ ЭТУ ФУНКЦИЮ !!!
const toggleUserMenu = (event) => {
  event.stopPropagation();
  
  if (!userButtonRef.value) return;

  // Константы меню
  const menuWidth = 180;
  const menuMargin = 8; // Отступ от кнопки
  // Приблизительная высота меню (2 кнопки * ~41px)
  const menuHeight = 82; 

  // Получаем координаты кнопки (относительно ОКНА)
  const rect = userButtonRef.value.getBoundingClientRect();
  
  // 1. Горизонтально (влево)
  // (Левый край меню = Левый край кнопки - Ширина меню - Отступ)
  const left = rect.left - menuWidth - menuMargin;
  
  // 2. Вертикально (сверху)
  // (Верхний край меню = Нижний край кнопки - Высота меню)
  // Это прижмет НИЗ меню к НИЗУ кнопки.
  const top = rect.bottom - menuHeight;
  
  userMenuPosition.value = {
    top: `${top}px`,
    left: `${left}px`,
  };
  
  showUserMenu.value = !showUserMenu.value;
};
// --- КОНЕЦ ИЗМЕНЕНИЙ ---

// Закрывает оба меню
const closeAllMenus = () => {
  if (isContextMenuVisible.value) isContextMenuVisible.value = false;
  if (showUserMenu.value) showUserMenu.value = false; // <-- (Это уже было)
};


/**
 * !!! НОВЫЙ КОД: Обработчик завершения импорта !!!
 * (Код из вашего v5.0, без изменений)
 */
async function handleImportComplete() {
  showImportModal.value = false;
  console.log('Импорт завершен, принудительно обновляем все данные...');
  
  try {
    await mainStore.forceRefreshAll();
    rebuildVisibleDays(); 
    
  } catch (error) {
    console.error('Ошибка при обновлении данных после импорта:', error);
  }
}


// --- !!! НОВЫЙ КОД: Функция Debounce !!! ---
// (Код из вашего v5.0, без изменений)
const debounce = (func, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
};
// --- КОНЕЦ НОВОГО КОДА ---

/* ===================== ДАТЫ / ВИРТУАЛКА ===================== */
// (Весь этот блок без изменений)
const today = new Date();
today.setHours(0, 0, 0, 0);

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

const _getDateKey = (date) => {
  const year = date.getFullYear();
  const doy = getDayOfYear(date); // Используем существующий helper
  return `${year}-${doy}`;
};

const _getDayOfYear_v4_4 = (date) => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000);
    return Math.floor(diff / 86400000);
};
const _parseDateKey = (dateKey) => {
    if (typeof dateKey !== 'string' || !dateKey.includes('-')) {
        console.error(`!!! HomeView._parseDateKey ОШИБКА:`, dateKey);
        return new Date(); 
    }
    const [year, doy] = dateKey.split('-').map(Number);
    const date = new Date(year, 0, 1);
    date.setDate(doy);
    return date;
};
// --- КОНЕЦ БЛОКА ДАТ ---


const VISIBLE_COLS = 12;
const CENTER_INDEX = Math.floor((VISIBLE_COLS - 1) / 2); // 5
const viewMode = ref('12d');
const totalDays = computed(() => {
  return mainStore.computeTotalDaysForMode(viewMode.value, today);
});
const globalTodayIndex = computed(() => {
  if (viewMode.value === '12d') {
    return CENTER_INDEX; // 5
  }
  return Math.floor(totalDays.value / 2);
});
// (Вся виртуализация - без изменений)
const virtualStartIndex = ref(0);
const globalIndexFromLocal = (localIndex) => virtualStartIndex.value + localIndex;
const dateFromGlobalIndex = (globalIndex) => {
  const delta = globalIndex - globalTodayIndex.value;
  const d = new Date(today);
  d.setDate(today.getDate() + delta);
  return d;
};

/* ===================== UI STATE ===================== */
// (Без изменений, кроме `closeAllMenus` выше)
const visibleDays = ref([]);
const isPopupVisible = ref(false);
const isTransferPopupVisible = ref(false);
const operationType = ref('income');
const isContextMenuVisible = ref(false);
const contextMenuPosition = ref({ top: '0px', left: '0px' });
const selectedDay = ref(null);
const selectedCellIndex = ref(0);
const operationToEdit = ref(null);

/* ===================== REFS LAYOUT ===================== */
// (Без изменений)
const mainContentRef = ref(null);
const timelineGridRef = ref(null);
const timelineGridContentRef = ref(null);
const navPanelWrapperRef = ref(null);
const yAxisLabels = ref([]); 
const resizerRef = ref(null);
const masterScrollbarRef = ref(null);
const scrollbarContentRef = ref(null);
const graphAreaRef = ref(null);
const homeHeaderRef = ref(null);
const headerResizerRef = ref(null);
// (userButtonRef был добавлен выше)

/* ===================== КОНСТАНТЫ ДЛЯ РЕСАЙЗА ===================== */
// (Без изменений)
const TIMELINE_MIN = 100;
const GRAPH_MIN    = 115;
const DIVIDER_H    = 15;
const HEADER_MIN_H = 150; 
const HEADER_MAX_H_RATIO = 0.5; 
const headerHeightPx = ref(HEADER_MIN_H); 
const timelineHeightPx = ref(318);

/* ===================== КОНТЕКСТНОЕ МЕНЮ / ПОПАПЫ ===================== */
// (Весь этот блок без изменений)
const openContextMenu = (day, event, cellIndex) => {
  event.stopPropagation();
  selectedDay.value = day; 
  selectedCellIndex.value = cellIndex;
  const menuWidth = 260; 
  const clickX = event.clientX;
  const clickY = event.clientY;
  const windowWidth = window.innerWidth;
  const newPos = { top: `${clickY + 5}px`, left: 'auto', right: 'auto' };
  if (clickX + menuWidth > windowWidth) {
    newPos.right = `${windowWidth - clickX + 5}px`;
  } else {
    newPos.left = `${clickX + 5}px`;
  }
  contextMenuPosition.value = newPos;
  isContextMenuVisible.value = true;
};
const handleContextMenuSelect = (type) => {
  isContextMenuVisible.value = false;
  if (!selectedDay.value) return;
  if (type === 'transfer') {
    operationToEdit.value = null;
    isTransferPopupVisible.value = true;
  } else {
    operationToEdit.value = null;
    openPopup(type);
  }
};
const openPopup = (type) => {
  operationType.value = type;
  isPopupVisible.value = true;
};
const handleEditOperation = (operation) => {
  operationToEdit.value = operation;
  const opDate = _parseDateKey(operation.dateKey); 
  selectedDay.value = { date: opDate, dayOfYear: operation.dayOfYear, dateKey: operation.dateKey };
  selectedCellIndex.value = operation.cellIndex;
  if (operation.type === 'transfer' || operation.isTransfer) {
    isTransferPopupVisible.value = true;
  } else {
    openPopup(operation.type);
  }
};
const handleClosePopup = () => {
  isPopupVisible.value = false;
  operationToEdit.value = null;
};
const handleCloseTransferPopup = () => {
  isTransferPopupVisible.value = false;
  operationToEdit.value = null;
};
// --- КОНЕЦ БЛОКА КОНТЕКСТНОГО МЕНЮ ---

/* ===================== ДАННЫЕ ПО ВИДИМЫМ ДНЯМ ===================== */
// (Весь этот блок без изменений)
const debouncedFetchVisibleDays = debounce(() => {
  console.log('[ЖУРНАЛ] (DEBOUNCED) fetchVisibleDays: ⌛️ Скролл остановлен. ЗАПРАШИВАЮ ДАННЫЕ...');
  visibleDays.value.forEach(day => mainStore.fetchOperations(day.dateKey));
}, 300); 

const fetchVisibleDaysOperations = () => {
  console.log('[ЖУРНАЛ] fetchVisibleDays: 🏃‍♂️ Запрос на загрузку поставлен в очередь (debounced)...');
};

const recalcProjectionForCurrentView = async () => {
  await mainStore.loadCalculationData(viewMode.value, today);
};

const handleTransferComplete = async (eventData) => {
  const dateKey = eventData?.dateKey;
  console.log(`[ЖУРНАЛ] handleTransferComplete: 🤝 Перевод завершен, обновляю dateKey: ${dateKey}`);
  if (!dateKey) {
    console.error('!!! handleTransferComplete ОШИБКА: не получен dateKey, выполняю forceRefreshAll()');
    await mainStore.forceRefreshAll();
    handleCloseTransferPopup();
    return;
  }
  await mainStore.refreshDay(dateKey);
  await recalcProjectionForCurrentView();
  handleCloseTransferPopup();
};
// (handleOperationAdded, Delete, Drop, Moved, Updated - без изменений)
const handleOperationAdded = async (newEvent) => {
  console.log('[ЖУРНАЛ] handleOperationAdded: ➕ Вызываю mainStore.addOperation...');
  await mainStore.addOperation(newEvent); 
  await recalcProjectionForCurrentView();
  visibleDays.value = [...visibleDays.value];
  handleClosePopup();
};
const handleOperationDelete = async (operation) => {
  if (!operation) return;
  console.log('[ЖУРНАЛ] handleOperationDelete: ❌ Вызываю mainStore.deleteOperation...');
  await mainStore.deleteOperation(operation); 
  await recalcProjectionForCurrentView();
  visibleDays.value = [...visibleDays.value];
  handleClosePopup();
};
const handleOperationDrop = async (dropData) => {
  const operation = dropData.operation;
  const oldDateKey = operation.dateKey; 
  const newDateKey = dropData.toDateKey;
  const newCellIndex = dropData.toCellIndex;
  if (!oldDateKey || !newDateKey) {
    console.error('!!! handleOperationDrop ОШИБКА: D&D не передал dateKey!', dropData);
    return;
  }
  if (oldDateKey === newDateKey && operation.cellIndex === newCellIndex) return;
  console.log('[ЖУРНАЛ] handleOperationDrop: ➡️ Вызываю mainStore.moveOperation (drag-n-drop)...');
  await mainStore.moveOperation(operation, oldDateKey, newDateKey, newCellIndex);
  await recalcProjectionForCurrentView();
};
const handleOperationMoved = async ({ operation, toDayOfYear, toCellIndex }) => {
  const oldDateKey = operation.dateKey;
  const baseDate = _parseDateKey(oldDateKey);
  const newDate = new Date(baseDate.getFullYear(), 0, 1);
  newDate.setDate(toDayOfYear);
  const newDateKey = _getDateKey(newDate);
  console.log('[ЖУРНАЛ] handleOperationMoved: ➡️ Вызываю mainStore.moveOperation (из попапа)...');
  await mainStore.moveOperation(operation, oldDateKey, newDateKey, toCellIndex ?? (operation.cellIndex ?? 0));
  await recalcProjectionForCurrentView();
  handleClosePopup();
};
const handleOperationUpdated = async ({ dayOfYear }) => {
  console.log('[ЖУРНАЛ] handleOperationUpdated: 🔄 Обновление операции, обновляю день', dayOfYear);
  await mainStore.forceRefreshAll();
  await recalcProjectionForCurrentView();
  handleClosePopup();
};
// --- КОНЕЦ БЛОКА ДАННЫХ ---

/* ===================== ОКНО 12 ДНЕЙ ===================== */
// (Без изменений)
const rebuildVisibleDays = () => {
  const days = [];
  for (let i = 0; i < VISIBLE_COLS; i++) {
    const gIdx = globalIndexFromLocal(i);
    const date = dateFromGlobalIndex(gIdx);
    days.push({
      id: i,
      date,
      isToday: sameDay(date, today),
      dayOfYear: getDayOfYear(date),
      dateKey: _getDateKey(date) 
    });
  }
  visibleDays.value = days;
  console.log('[ЖУРНАЛ] rebuildVisibleDays: 🛠️ Перестроил дни. Вызываю debouncedFetchVisibleDays...');
  debouncedFetchVisibleDays(); 
};
const generateVisibleDays = () => {
  rebuildVisibleDays();
};
// --- КОНЕЦ БЛОКА ОКНА ---

/* ===================== РЕСАЙЗЕР ===================== */
// (Весь этот блок без изменений)
const clampHeaderHeight = (rawPx) => {
  const maxHeight = window.innerHeight * HEADER_MAX_H_RATIO;
  return Math.min(Math.max(rawPx, HEADER_MIN_H), maxHeight);
};
const applyHeaderHeight = (newPx) => {
  headerHeightPx.value = Math.round(newPx);
  if (homeHeaderRef.value) {
    homeHeaderRef.value.style.height = `${headerHeightPx.value}px`;
  }
};
const initHeaderResize = (e) => {
  e.preventDefault();
  window.addEventListener('mousemove', doHeaderResize);
  window.addEventListener('mouseup', stopHeaderResize);
};
const doHeaderResize = (e) => {
  const raw = e.clientY;
  const clamped = clampHeaderHeight(raw);
  applyHeaderHeight(clamped);
};
const stopHeaderResize = () => {
  window.removeEventListener('mousemove', doHeaderResize);
  window.removeEventListener('mouseup', stopHeaderResize);
};
const clampTimelineHeight = (rawPx) => {
  const container = mainContentRef.value;
  if (!container) return timelineHeightPx.value;
  const headerTotalH = headerHeightPx.value + 15; 
  const containerH = window.innerHeight - headerTotalH;
  const maxTop = Math.max(0, containerH - DIVIDER_H - GRAPH_MIN);
  const minTop = TIMELINE_MIN;
  return Math.min(Math.max(rawPx, minTop), maxTop);
};
const applyHeights = (timelinePx) => {
  timelineHeightPx.value = Math.round(timelinePx);
  if (timelineGridRef.value) {
    timelineGridRef.value.style.height = `${timelineHeightPx.value}px`;
  }
  if (navPanelWrapperRef.value) {
    navPanelWrapperRef.value.style.height = `${timelineHeightPx.value}px`;
  }
  const container = mainContentRef.value;
  if (container && graphAreaRef.value) {
    const headerTotalH = headerHeightPx.value + 15; 
    const containerH = window.innerHeight - headerTotalH;
    const graphH = Math.max(GRAPH_MIN, containerH - timelineHeightPx.value - DIVIDER_H);
    graphAreaRef.value.style.height = `${Math.round(graphH)}px`;
  }
};
const initResize = (e) => {
  e.preventDefault();
  window.addEventListener('mousemove', doResize);
  window.addEventListener('mouseup', stopResize);
};
const doResize = (e) => {
  if (!mainContentRef.value) return;
  const mainTop = mainContentRef.value.getBoundingClientRect().top;
  const raw = e.clientY - mainTop;
  const clamped = clampTimelineHeight(raw);
  applyHeights(clamped);
};
const stopResize = () => {
  window.removeEventListener('mousemove', doResize);
  window.removeEventListener('mouseup', stopResize);
};
// --- КОНЕЦ БЛОКА РЕСАЙЗА ---

/* ===================== МАСТЕР-СКРОЛЛБАР ===================== */
// (Весь этот блок без изменений)
const updateScrollbarWidthAndPosition = () => {
  if (!timelineGridRef.value || !scrollbarContentRef.value || !masterScrollbarRef.value) return;
  const viewportWidth = timelineGridRef.value.clientWidth || 1;
  const widthRatio = Math.max(1, totalDays.value / VISIBLE_COLS);
  scrollbarContentRef.value.style.width = `${viewportWidth * widthRatio}px`;
  const scroller = masterScrollbarRef.value;
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  if (maxVirtual === 0 || maxScroll === 0) {
    scroller.scrollLeft = 0;
    return;
  }
  scroller.scrollLeft = (virtualStartIndex.value / maxVirtual) * maxScroll;
};
const onMasterScroll = () => {
  if (!masterScrollbarRef.value) return;
  const scroller = masterScrollbarRef.value;
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  if (maxVirtual === 0 || maxScroll === 0) return;
  const ratio = scroller.scrollLeft / maxScroll;
  virtualStartIndex.value = Math.round(ratio * maxVirtual);
  console.log(`[ЖУРНАЛ] onMasterScroll: 🌀 Скролл! vStartIndex: ${virtualStartIndex.value}.`);
  rebuildVisibleDays(); 
};
const onWheelScroll = (event) => {
  if (!masterScrollbarRef.value) return;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    event.preventDefault();
    masterScrollbarRef.value.scrollLeft += event.deltaX;
  }
};
// --- КОНЕЦ БЛОКА СРКОЛЛА ---

/* ===================== ЦЕНТРОВКА / СМЕНА МАСШТАБА ===================== */
// (Без изменений)
const centerToday = () => {
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  virtualStartIndex.value = Math.min(
    Math.max(0, globalTodayIndex.value - CENTER_INDEX),
    maxVirtual
  );
  rebuildVisibleDays();
  updateScrollbarWidthAndPosition();
};
const onChangeView = async (newView) => {
  viewMode.value = newView;
  console.log(`[ЖУРНАЛ] onChangeView: 🔄 Сменил вид на ${newView}.`);
  await nextTick();
  centerToday();
  await nextTick();
  updateScrollbarWidthAndPosition();
  await recalcProjectionForCurrentView();
};
const onWindowResize = () => {
  applyHeaderHeight(clampHeaderHeight(headerHeightPx.value));
  applyHeights(clampTimelineHeight(timelineHeightPx.value));
  updateScrollbarWidthAndPosition();
};
// --- КОНЕЦ БЛОКА ---

/* ===================== ИНИЦИАЛИЗАЦИЯ / ОЧИСТКА ===================== */

// !!! (Логика onMounted из Шага 4) !!!
let resizeObserver = null;

onMounted(async () => {
  // 1. СНАЧАЛА проверяем сессию
  await mainStore.checkAuth();

  // 2. Если (пока грузим) ИЛИ (загрузили и юзера нет) -> ВЫХОД
  if (mainStore.isAuthLoading || !mainStore.user) {
    console.log("[HomeView] onMounted: Остановка (Либо загрузка, либо нет пользователя).");
    return; 
  }
  
  // 3. ЕСЛИ МЫ ДОШЛИ СЮДА = isAuthLoading: false, user: { ... }
  console.log(`[HomeView] onMounted: Пользователь ${mainStore.user.name} вошел. Загружаем приложение...`);
  await nextTick();

  // --- (Вся ваша старая логика onMounted из v5.0) ---
  await mainStore.fetchAllEntities();

  const todayDay = getDayOfYear(today);
  mainStore.setToday(todayDay);

  generateVisibleDays();
  await nextTick();
  centerToday(); 
  await nextTick();

  applyHeaderHeight(clampHeaderHeight(headerHeightPx.value));
  const initialTop = (timelineGridRef.value && timelineGridRef.value.style.height)
    ? parseFloat(timelineGridRef.value.style.height)
    : timelineHeightPx.value;
  applyHeights(clampTimelineHeight(initialTop));

  if (resizerRef.value) {
    resizerRef.value.addEventListener('mousedown', initResize);
  }
  
  if (headerResizerRef.value) {
    headerResizerRef.value.addEventListener('mousedown', initHeaderResize);
  }

  if (masterScrollbarRef.value) {
    masterScrollbarRef.value.addEventListener('scroll', onMasterScroll);
  }

  if (timelineGridRef.value) {
    timelineGridRef.value.addEventListener('wheel', onWheelScroll, { passive: false });
  }

  resizeObserver = new ResizeObserver(() => {
    applyHeaderHeight(clampHeaderHeight(headerHeightPx.value)); 
    applyHeights(clampTimelineHeight(timelineHeightPx.value));
    updateScrollbarWidthAndPosition();
  });
  if (mainContentRef.value) resizeObserver.observe(mainContentRef.value);

  window.addEventListener('resize', onWindowResize);

  updateScrollbarWidthAndPosition();

  await recalcProjectionForCurrentView();
  // --- (Конец вашей старой логики onMounted) ---
});

// onBeforeUnmount (Без изменений)
onBeforeUnmount(() => {
  if (resizerRef.value) {
    resizerRef.value.removeEventListener('mousedown', initResize);
  }
  
  if (headerResizerRef.value) {
    headerResizerRef.value.removeEventListener('mousedown', initHeaderResize);
  }

  if (masterScrollbarRef.value) {
    masterScrollbarRef.value.removeEventListener('scroll', onMasterScroll);
  }
  
  if (timelineGridRef.value) {
    timelineGridRef.value.removeEventListener('wheel', onWheelScroll);
  }

  window.removeEventListener('resize', onWindowResize);
  if (resizeObserver && mainContentRef.value) {
    resizeObserver.unobserve(mainContentRef.value);
  }
  resizeObserver = null;
});
</script>

<template>
  
  <div v-if="mainStore.isAuthLoading" class="loading-screen">
    <div class="spinner"></div>
    <p>Проверка сессии...</p>
  </div>
  
  <div v-else-if="!mainStore.user" class="login-screen">
    <div class="login-box">
      <h1>Добро пожаловать</h1>
      <p>Войдите, чтобы продолжить работу с вашим финансовым помощником.</p>
      <a href="https://api.index12.com/auth/google" class="google-login-button">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"></path><path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"></path><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.108-11.283-7.443l-6.57 4.818C9.656 39.663 16.318 44 24 44z"></path><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C39.712 36.091 44 30.638 44 24c0-1.341-.138-2.65-.389-3.917z"></path></svg>
        Войти через Google
      </a>
    </div>
  </div>
  
  <div v-else class="home-layout" @click="closeAllMenus">
    
    <header class="home-header" ref="homeHeaderRef">
      <TheHeader />
    </header>
    
    <div class="header-resizer" ref="headerResizerRef"></div>

    <div class="home-body">
      <aside class="home-left-panel">
        <div class="nav-panel-wrapper" ref="navPanelWrapperRef">
          <NavigationPanel @change-view="onChangeView" />
        </div>
        <div class="divider-placeholder"></div>
        
        <YAxisPanel :yLabels="yAxisLabels" />
      
      </aside>

      <main class="home-main-content" ref="mainContentRef">
        <div class="timeline-grid-wrapper" ref="timelineGridRef">
          <div class="timeline-grid-content" ref="timelineGridContentRef">
            
            <DayColumn
              v-for="day in visibleDays"
              :key="day.id"
              :date="day.date"
              :isToday="day.isToday"
              :dayOfYear="day.dayOfYear"
              :dateKey="day.dateKey" 
              @add-operation="(event, cellIndex) => openContextMenu(day, event, cellIndex)"
              @edit-operation="handleEditOperation"
              @drop-operation="handleOperationDrop"
            />
          </div>
        </div>

        <div class="divider-wrapper" ref="resizerRef">
          <div class="horizontal-scrollbar-wrapper" ref="masterScrollbarRef">
            <div class="scrollbar-content" ref="scrollbarContentRef"></div>
          </div>
          <div class="vertical-resizer"></div>
        </div>

        <div class="graph-area-wrapper" ref="graphAreaRef">
          <GraphRenderer
            v-if="visibleDays.length"
            :visibleDays="visibleDays"
            
            @update:yLabels="yAxisLabels = $event"
            
            class="graph-renderer-content"
          />
          <div class="summaries-container">
            </div>
        </div>
      </main>

      <aside class="home-right-panel">
        <button 
          class="icon-btn import-export-btn" 
          @click="showImportModal = true" 
          title="Импорт / Экспорт"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>
        
        <div class="user-profile-widget">
          <button 
            class="user-profile-button" 
            ref="userButtonRef" 
            @click="toggleUserMenu"
          >
            <img 
              :src="mainStore.user.avatarUrl" 
              alt="avatar" 
              class="user-avatar" 
              v-if="mainStore.user.avatarUrl"
            />
            <div class="user-avatar-placeholder" v-else>
              {{ mainStore.user.name ? mainStore.user.name[0].toUpperCase() : '?' }}
            </div>
            <span class="user-name">{{ mainStore.user.name }}</span>
          </button>
          
          </div>
        
      </aside>
    </div>

    <CellContextMenu
      v-if="isContextMenuVisible"
      :style="contextMenuPosition"
      @select="handleContextMenuSelect"
    />
    
    <div 
      v-if="showUserMenu" 
      class="user-menu" 
      :style="userMenuPosition"
      @click.stop >
      <button class="user-menu-item" disabled title="В разработке">
        Настройки
      </button>
      <button class="user-menu-item" @click="handleLogout">
        Выйти
      </button>
    </div>
    
    <OperationPopup
      v-if="isPopupVisible"
      :type="operationType"
      :date="selectedDay ? selectedDay.date : new Date()"
      :cellIndex="selectedDay ? selectedCellIndex : 0"
      :operation-to-edit="operationToEdit"
      @close="handleClosePopup"
      @operation-added="handleOperationAdded"
      @operation-deleted="handleOperationDelete(operationToEdit)"
      @operation-moved="handleOperationMoved"
      @operation-updated="handleOperationUpdated"
    />
    <TransferPopup
      v-if="isTransferPopupVisible"
      :date="selectedDay ? selectedDay.date : new Date()"
      :cellIndex="selectedDay ? selectedCellIndex : 0"
      :transferToEdit="operationToEdit"
      @close="handleCloseTransferPopup"
      @transfer-complete="handleTransferComplete"
    />
    <ImportExportModal 
      v-if="showImportModal"
      @close="showImportModal = false"
      @import-complete="handleImportComplete"
    />
    
  </div>
</template>

<style scoped>
/*
=================================================================
--- !!! НОВЫЕ СТИЛИ (Шаг 4): ЭКРАН ВХОДА И ЗАГРУЗКИ !!! ---
=================================================================
*/
.loading-screen, .login-screen {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.login-box {
  background: var(--color-background-soft);
  padding: 40px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  text-align: center;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}
.login-box h1 {
  margin: 0 0 10px 0;
  color: var(--color-heading-text);
}
.login-box p {
  margin-bottom: 30px;
  max-width: 300px;
  opacity: 0.8;
}
.google-login-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  background-color: #fff;
  color: #333;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.google-login-button:hover {
  background-color: #f9f9f9;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}
.google-login-button svg {
  margin-right: 12px;
}

/* Спиннер загрузки */
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}


/*
=================================================================
--- !!! ИЗМЕНЕННЫЕ СТИЛИ (Шаг 4 v2): ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ !!! ---
=================================================================
*/
.user-profile-widget {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px;
}
.user-profile-button {
  display: flex;
  align-items: center;
  width: 100%;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 6px;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
  color: var(--color-text);
  text-align: left;
}
.user-profile-button:hover {
  background-color: var(--color-background-mute);
  border-color: var(--color-border-hover);
}
.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  margin-right: 8px;
  object-fit: cover;
  border: 1px solid var(--color-border);
}
.user-avatar-placeholder {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  margin-right: 8px;
  background-color: var(--color-accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}
.user-name {
  flex-grow: 1;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* * !!! ИСПРАВЛЕННЫЙ .user-menu !!!
 * Теперь он использует position: fixed (относительно окна)
*/
.user-menu {
  position: fixed; /* <--- ГЛАВНОЕ ИСПРАВЛЕНИЕ: (был absolute) */
  width: 180px;      
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.1); 
  z-index: 2000; 
  overflow: hidden;
  /* top и left будут установлены через :style */
}
.user-menu-item {
  display: block;
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  font-size: 14px;
}
.user-menu-item:last-child {
  border-bottom: none;
}
.user-menu-item:hover {
  background-color: var(--color-background-mute);
}
.user-menu-item:disabled {
  color: var(--color-text-mute);
  cursor: not-allowed;
  background: none;
}


/*
=================================================================
--- (ВАШИ СТАРЫЕ СТИЛИ ИЗ v5.0 НАЧИНАЮТСЯ ЗДЕСЬ) ---
=================================================================
*/
.home-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background-color: var(--color-background);
}

/* 🔴 ИСПРАВЛЕНИЕ v4.4: Убрано `overflow: hidden` */
.home-header {
  flex-shrink: 0; 
  z-index: 100;
  background-color: var(--color-background);
  display: flex; 
  /* overflow: hidden; (УДАЛЕНО) */
}
/* 🔴 КОНЕЦ ИСПРАВЛЕНИЯ */

/* 🔴 ИСПРАВЛЕНИЕ v4.3: Стили для ресайзера хедера */
.header-resizer {
  flex-shrink: 0;
  height: 15px; 
  background: var(--color-background-soft);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  cursor: row-resize;
  position: relative;
  z-index: 50;
  
  /* Центрируем "точку" */
  display: flex;
  align-items: center;
  justify-content: center;
}
.header-resizer:hover {
  border-top: 1px solid #777;
}
/* "Точка" (скопирована с .vertical-resizer) */
.header-resizer::before {
  content: '';
  display: block;
  width: 10px; 
  height: 10px;
  background-color: #ffffff;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  opacity: 0.5;
  transition: opacity 0.2s, transform 0.2s;
  box-shadow: 0 0 5px rgba(0,0,0,0.3);
}
.header-resizer:hover::before { 
  opacity: 1; 
  transform: scale(1.2);
}
/* --- */

.home-body {
  display: flex;
  flex-grow: 1;
  overflow: hidden;
  
  /* 🔴 НОВОЕ: (v4.1) min-height: 0 нужен,
     чтобы flex-grow корректно работал */
  min-height: 0;
}
.home-left-panel {
  width: 60px;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.home-right-panel {
  width: 60px;
  flex-shrink: 0;
  overflow-y: auto;
  background-color: var(--color-background-soft);
  border-left: 1px solid var(--color-border);
  scrollbar-width: none;
  -ms-overflow-style: none;
  
  /* !!! ВОЗВРАЩЕНО: Для позиционирования кнопки !!! */
  position: relative; 
}
.home-right-panel::-webkit-scrollbar { display: none; }

/* !!! ВАШИ СТИЛИ ВОЗВРАЩЕНЫ !!!
  Стили для кнопки Импорт/Экспорт 
*/
.import-export-btn {
  position: absolute;
  top: 8px; /* Отступ сверху */
  right: 8px; /* Отступ справа */
  z-index: 20; 
  
  /* Общие стили для icon-btn (можно вынести, если есть другие) */
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-text);
  padding: 0;
  transition: background-color 0.2s, border-color 0.2s;
}
.import-export-btn:hover {
  background: var(--color-background-mute);
  border-color: var(--color-border-hover);
}
.import-export-btn svg {
  width: 18px; /* Чуть меньше для отступов */
  height: 18px;
  stroke: currentColor;
}
/* --- КОНЕЦ СТИЛЕЙ --- */


.home-main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.timeline-grid-wrapper {
  height: 318px;
  flex-shrink: 0;
  overflow-x: hidden;
  overflow-y: auto;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  scrollbar-width: none;
  -ms-overflow-style: none;
  
  /* --- 🔴 НОВОЕ: Блокировка свайпа "назад" в браузере --- */
  overscroll-behavior-x: contain;
}
.timeline-grid-wrapper::-webkit-scrollbar { display: none; }

/* === 🟢 НАЧАЛО ИЗМЕНЕНИЙ (ШИРИНА < 1920px) === */
.timeline-grid-content {
  display: grid;
  /* grid-template-columns: repeat(12, 1fr); (ЗАМЕНЕНО) */
  grid-template-columns: repeat(12, minmax(0, 1fr)); /* (ИСПРАВЛЕНИЕ) */
  width: 100%;
}
/* === 🟢 КОНЕЦ ИЗМЕНЕНИЙ === */


.divider-wrapper {
  flex-shrink: 0;
  height: 15px;
  width: 100%;
  background-color: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
  position: relative;
}
.vertical-resizer {
  position: absolute;
  top: -5px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 25px;
  cursor: row-resize;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vertical-resizer::before {
  content: '';
  display: block;
  width: 10px;
  height: 10px;
  background-color: #ffffff;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  opacity: 0.5;
  transition: opacity 0.2s, transform 0.2s;
  box-shadow: 0 0 5px rgba(0,0,0,0.3);
}
.vertical-resizer:hover::before { opacity: 1; transform: scale(1.2); }

.horizontal-scrollbar-wrapper {
  width: 100%;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}
.scrollbar-content { height: 1px; }
.horizontal-scrollbar-wrapper::-webkit-scrollbar { height: 10px; }
.horizontal-scrollbar-wrapper::-webkit-scrollbar-track {
  background: var(--color-background-soft);
  border-radius: 5px;
}
.horizontal-scrollbar-wrapper::-webkit-scrollbar-thumb {
  background-color: var(--color-border);
  border-radius: 5px;
}
.horizontal-scrollbar-wrapper::-webkit-scrollbar-thumb:hover { background-color: #555; }


/* === 🟢 НАЧАЛО ИЗМЕНЕНИЙ (ВЫСОТА ПЛАНШЕТА) === */
.graph-area-wrapper {
  overflow-x: hidden;
  overflow-y: hidden; /* Оставляем, чтобы сам контейнер не скроллился */
  scrollbar-width: none;
  -ms-overflow-style: none;
  min-height: 115px;
  flex-grow: 1;
  
  /* Новые стили для вертикального макета */
  display: flex;
  flex-direction: column;
}
.graph-area-wrapper::-webkit-scrollbar { display: none; }

:deep(.graph-renderer-content) {
  /* height: 100%; (УДАЛЕНО) */
  flex-grow: 1; /* График занимает все свободное место */
  min-height: 0; /* Важно для flex-grow */
  width: 100%;
}

/* Новые стили для Блока 4 (Итоги дня) */
.summaries-container {
  flex-shrink: 0; /* Не сжиматься */
  height: 120px; /* Высота для итогов (можно настроить) */
  background: var(--color-background);
  border-top: 1px solid var(--color-border);
  overflow-y: auto; /* Позволяем итогам скроллиться, если их много */
  padding: 1rem;
  box-sizing: border-box;
}
/* === 🟢 КОНЕЦ ИЗМЕНЕНИЙ === */


.nav-panel-wrapper {
  height: 318px;
  flex-shrink: 0;
  overflow: hidden;
}
.divider-placeholder {
  height: 15px;
  flex-shrink: 0;
  background-color: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
}
.home-left-panel > :deep(.y-axis-panel) {
  flex-grow: 1;
  overflow: hidden;
}
</style>
