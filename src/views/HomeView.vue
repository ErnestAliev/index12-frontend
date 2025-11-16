<script setup>
import { onMounted, onBeforeUnmount, ref, computed, nextTick, watch } from 'vue';
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
 * * --- МЕТКА ВЕРСИИ: v6.8-HEADER-130 ---
 * * ВЕРСИЯ: 6.8 - Высота хедера 130px
 * ДАТА: 2025-11-16
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. HEADER_MIN_H установлено в 130.
 * 2. CSS .home-header height установлено в 130px.
 */

console.log('--- HomeView.vue v6.8-HEADER-130 ЗАГРУЖЕН ---'); 

const mainStore = useMainStore();
const showImportModal = ref(false); 

// --- Меню пользователя ---
const showUserMenu = ref(false);
const userButtonRef = ref(null);
const userMenuPosition = ref({ top: '0px', left: '0px' });

const handleLogout = () => {
  showUserMenu.value = false;
  mainStore.logout();
};

const toggleUserMenu = (event) => {
  event.stopPropagation();
  if (!userButtonRef.value) return;
  const menuWidth = 180;
  const menuMargin = 8;
  const menuHeight = 82; 
  const rect = userButtonRef.value.getBoundingClientRect();
  const left = rect.left - menuWidth - menuMargin;
  const top = rect.bottom - menuHeight;
  userMenuPosition.value = { top: `${top}px`, left: `${left}px` };
  showUserMenu.value = !showUserMenu.value;
};

const closeAllMenus = () => {
  if (isContextMenuVisible.value) isContextMenuVisible.value = false;
  if (showUserMenu.value) showUserMenu.value = false;
};

async function handleImportComplete() {
  showImportModal.value = false;
  try {
    await mainStore.forceRefreshAll();
    rebuildVisibleDays(); 
  } catch (error) {
    console.error(error);
  }
}

const debounce = (func, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
};

/* ===================== ДАТЫ / ВИРТУАЛКА ===================== */
const initializeToday = () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}
const today = ref(initializeToday());

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
  const doy = getDayOfYear(date);
  return `${year}-${doy}`;
};

const _parseDateKey = (dateKey) => {
    if (typeof dateKey !== 'string' || !dateKey.includes('-')) {
        return new Date(); 
    }
    const [year, doy] = dateKey.split('-').map(Number);
    const date = new Date(year, 0, 1);
    date.setDate(doy);
    return date;
};

const VISIBLE_COLS = 12;
const CENTER_INDEX = Math.floor((VISIBLE_COLS - 1) / 2);
const viewMode = ref('12d');

const isScrollActive = computed(() => {
  return viewMode.value !== '12d';
});

const totalDays = computed(() => {
  return mainStore.computeTotalDaysForMode(viewMode.value, today.value);
});

watch(totalDays, async () => {
  await nextTick();
  updateScrollbarMetrics();
});

const globalTodayIndex = computed(() => {
  if (viewMode.value === '12d') {
    return CENTER_INDEX;
  }
  return Math.floor(totalDays.value / 2);
});

const virtualStartIndex = ref(0);
const globalIndexFromLocal = (localIndex) => virtualStartIndex.value + localIndex;
const dateFromGlobalIndex = (globalIndex) => {
  const delta = globalIndex - globalTodayIndex.value;
  const t = today.value;
  const d = new Date(t);
  d.setDate(t.getDate() + delta);
  return d;
};

/* ===================== UI STATE ===================== */
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
const mainContentRef = ref(null);
const timelineGridRef = ref(null);
const timelineGridContentRef = ref(null);
const navPanelWrapperRef = ref(null);
const yAxisLabels = ref([]); 
const resizerRef = ref(null);

// --- REFS ДЛЯ КАСТОМНОГО СКРОЛЛА ---
const customScrollbarTrackRef = ref(null);
const scrollbarThumbWidth = ref(0);
const scrollbarThumbX = ref(0);

const graphAreaRef = ref(null);
const homeHeaderRef = ref(null);
const headerResizerRef = ref(null);

/* ===================== КОНСТАНТЫ ===================== */
const TIMELINE_MIN = 100;
const GRAPH_MIN    = 115;
const DIVIDER_H    = 15;
// 🔴 ИЗМЕНЕНО: Стартовая высота 130px
const HEADER_MIN_H = 130; 
const HEADER_MAX_H_RATIO = 0.5; 
const headerHeightPx = ref(HEADER_MIN_H); 
const timelineHeightPx = ref(318);

/* ===================== КОНТЕКСТНОЕ МЕНЮ / ПОПАПЫ ===================== */
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

/* ===================== ДАННЫЕ ===================== */
const debouncedFetchVisibleDays = debounce(() => {
  visibleDays.value.forEach(day => mainStore.fetchOperations(day.dateKey));
}, 300); 

const recalcProjectionForCurrentView = async () => {
  await mainStore.loadCalculationData(viewMode.value, today.value);
};

const handleTransferComplete = async (eventData) => {
  const dateKey = eventData?.dateKey;
  if (!dateKey) {
    await recalcProjectionForCurrentView(); 
    handleCloseTransferPopup();
    return;
  }
  await recalcProjectionForCurrentView();
  handleCloseTransferPopup();
};

const handleOperationAdded = async (newEvent) => {
  await mainStore.addOperation(newEvent); 
  await recalcProjectionForCurrentView();
  visibleDays.value = [...visibleDays.value];
  handleClosePopup();
};
const handleOperationDelete = async (operation) => {
  if (!operation) return;
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
  if (!oldDateKey || !newDateKey) return;
  if (oldDateKey === newDateKey && operation.cellIndex === newCellIndex) return;
  await mainStore.moveOperation(operation, oldDateKey, newDateKey, newCellIndex);
  await recalcProjectionForCurrentView();
};
const handleOperationMoved = async ({ operation, toDayOfYear, toCellIndex }) => {
  const oldDateKey = operation.dateKey;
  const baseDate = _parseDateKey(oldDateKey); 
  const newDate = new Date(baseDate.getFullYear(), 0, 1);
  newDate.setDate(toDayOfYear);
  const newDateKey = _getDateKey(newDate);
  if (!oldDateKey || !newDateKey) return;
  await mainStore.moveOperation(operation, oldDateKey, newDateKey, toCellIndex ?? (operation.cellIndex ?? 0));
  await recalcProjectionForCurrentView();
  handleClosePopup();
};

const handleOperationUpdated = async ({ dateKey, oldDateKey }) => {
  if (dateKey) await mainStore.refreshDay(dateKey);
  if (oldDateKey && oldDateKey !== dateKey) await mainStore.refreshDay(oldDateKey);
  await recalcProjectionForCurrentView();
  handleClosePopup();
};

const rebuildVisibleDays = () => {
  const days = [];
  for (let i = 0; i < VISIBLE_COLS; i++) {
    const gIdx = globalIndexFromLocal(i);
    const date = dateFromGlobalIndex(gIdx);
    days.push({
      id: i,
      date,
      isToday: sameDay(date, today.value),
      dayOfYear: getDayOfYear(date),
      dateKey: _getDateKey(date) 
    });
  }
  visibleDays.value = days;
  debouncedFetchVisibleDays(); 
};
const generateVisibleDays = () => {
  rebuildVisibleDays();
};

/* ===================== РЕСАЙЗЕР (ВЫСОТА) ===================== */
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
  window.addEventListener('touchmove', doHeaderResize, { passive: false });
  window.addEventListener('mouseup', stopHeaderResize);
  window.addEventListener('touchend', stopHeaderResize);
};
const doHeaderResize = (e) => {
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  applyHeaderHeight(clampHeaderHeight(y));
};
const stopHeaderResize = () => {
  window.removeEventListener('mousemove', doHeaderResize);
  window.removeEventListener('touchmove', doHeaderResize);
  window.removeEventListener('mouseup', stopHeaderResize);
  window.removeEventListener('touchend', stopHeaderResize);
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
};
const initResize = (e) => {
  e.preventDefault();
  window.addEventListener('mousemove', doResize);
  window.addEventListener('touchmove', doResize, { passive: false });
  window.addEventListener('mouseup', stopResize);
  window.addEventListener('touchend', stopResize);
};
const doResize = (e) => {
  if (!mainContentRef.value) return;
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  const mainTop = mainContentRef.value.getBoundingClientRect().top;
  applyHeights(clampTimelineHeight(y - mainTop));
};
const stopResize = () => {
  window.removeEventListener('mousemove', doResize);
  window.removeEventListener('touchmove', doResize);
  window.removeEventListener('mouseup', stopResize);
  window.removeEventListener('touchend', stopResize);
};

/* ==================================================================
   --- КАСТОМНЫЙ СКРОЛЛБАР (LOGIC) ---
   ================================================================== */

const updateScrollbarMetrics = () => {
  if (!customScrollbarTrackRef.value) return;

  const trackWidth = customScrollbarTrackRef.value.clientWidth || 0;
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  
  if (maxVirtual <= 0) {
    scrollbarThumbWidth.value = trackWidth;
    scrollbarThumbX.value = 0;
    return;
  }

  const ratio = VISIBLE_COLS / Math.max(VISIBLE_COLS, totalDays.value);
  let tWidth = trackWidth * ratio;
  tWidth = Math.max(50, tWidth); 
  scrollbarThumbWidth.value = tWidth;
  
  const availableSpace = trackWidth - tWidth;
  const progress = virtualStartIndex.value / maxVirtual;
  scrollbarThumbX.value = progress * availableSpace;
};

const scrollState = {
  isDragging: false,
  startX: 0,
  startThumbX: 0
};

const onScrollThumbMouseDown = (e) => {
  startDrag(e.clientX);
};
const onScrollThumbTouchStart = (e) => {
  startDrag(e.touches[0].clientX);
};

const startDrag = (clientX) => {
  scrollState.isDragging = true;
  scrollState.startX = clientX;
  scrollState.startThumbX = scrollbarThumbX.value;
  
  window.addEventListener('mousemove', onScrollThumbMove);
  window.addEventListener('mouseup', onScrollThumbEnd);
  window.addEventListener('touchmove', onScrollThumbTouchMove, { passive: false });
  window.addEventListener('touchend', onScrollThumbEnd);
  
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'grabbing';
};

const calculateScrollFromDrag = (clientX) => {
  if (!customScrollbarTrackRef.value) return;
  const trackWidth = customScrollbarTrackRef.value.clientWidth;
  const availableSpace = trackWidth - scrollbarThumbWidth.value;
  if (availableSpace <= 0) return;

  const delta = clientX - scrollState.startX;
  let newThumbX = scrollState.startThumbX + delta;
  newThumbX = Math.max(0, Math.min(newThumbX, availableSpace));
  
  scrollbarThumbX.value = newThumbX;
  
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  const ratio = newThumbX / availableSpace;
  const newIndex = Math.round(ratio * maxVirtual);
  
  if (newIndex !== virtualStartIndex.value) {
    virtualStartIndex.value = newIndex;
    rebuildVisibleDays();
  }
};

const onScrollThumbMove = (e) => {
  if (!scrollState.isDragging) return;
  calculateScrollFromDrag(e.clientX);
};
const onScrollThumbTouchMove = (e) => {
  if (!scrollState.isDragging) return;
  e.preventDefault(); 
  calculateScrollFromDrag(e.touches[0].clientX);
};

const onScrollThumbEnd = () => {
  scrollState.isDragging = false;
  window.removeEventListener('mousemove', onScrollThumbMove);
  window.removeEventListener('mouseup', onScrollThumbEnd);
  window.removeEventListener('touchmove', onScrollThumbTouchMove);
  window.removeEventListener('touchend', onScrollThumbEnd);
  
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
};

const onTrackClick = (e) => {
  if (e.target.classList.contains('custom-scrollbar-thumb')) return; 
  
  const trackRect = customScrollbarTrackRef.value.getBoundingClientRect();
  const clickX = e.clientX - trackRect.left;
  
  const targetThumbX = clickX - (scrollbarThumbWidth.value / 2);
  
  const trackWidth = trackRect.width;
  const availableSpace = trackWidth - scrollbarThumbWidth.value;
  let newThumbX = Math.max(0, Math.min(targetThumbX, availableSpace));
  
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  const ratio = newThumbX / availableSpace;
  virtualStartIndex.value = Math.round(ratio * maxVirtual);
  rebuildVisibleDays();
  updateScrollbarMetrics(); 
};


/* ===================== ЖЕСТЫ КОНТЕНТА ===================== */
const onWheelScroll = (event) => {
  if (!isScrollActive.value) return;

  const isHorizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);

  if (isHorizontal) {
    if (event.cancelable && !event.ctrlKey) event.preventDefault();
    
    const delta = event.deltaX;
    const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
    
    if (Math.abs(delta) > 1) {
        const direction = delta > 0 ? 1 : -1;
        const speed = Math.abs(delta) > 50 ? 2 : 1; 
        
        let nextVal = virtualStartIndex.value + (direction * speed);
        nextVal = Math.max(0, Math.min(nextVal, maxVirtual));
        
        if (nextVal !== virtualStartIndex.value) {
            virtualStartIndex.value = nextVal;
            rebuildVisibleDays();
            updateScrollbarMetrics(); 
        }
    }
  }
};

const contentTouchState = { startX: 0, startIndex: 0, isDragging: false };

const onContentTouchStart = (e) => {
  if (!isScrollActive.value) return;
  contentTouchState.isDragging = true;
  contentTouchState.startX = e.touches[0].clientX;
  contentTouchState.startIndex = virtualStartIndex.value;
};

const onContentTouchMove = (e) => {
  if (!contentTouchState.isDragging) return;
  const deltaPx = contentTouchState.startX - e.touches[0].clientX;
  const pxPerDay = 50; 
  const deltaDays = Math.round(deltaPx / pxPerDay);
  
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  let nextVal = contentTouchState.startIndex + deltaDays;
  nextVal = Math.max(0, Math.min(nextVal, maxVirtual));
  
  if (e.cancelable) e.preventDefault(); 
  
  if (nextVal !== virtualStartIndex.value) {
    virtualStartIndex.value = nextVal;
    rebuildVisibleDays();
    updateScrollbarMetrics();
  }
};

const onContentTouchEnd = () => {
  contentTouchState.isDragging = false;
};


const centerToday = () => {
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  virtualStartIndex.value = Math.min(Math.max(0, globalTodayIndex.value - CENTER_INDEX), maxVirtual);
  rebuildVisibleDays();
  updateScrollbarMetrics();
};

const onChangeView = async (newView) => {
  console.log(`[HomeView] onChangeView: ${newView}`);
  viewMode.value = newView;
  await nextTick();
  centerToday();
  await nextTick();
  setTimeout(() => {
    updateScrollbarMetrics();
    recalcProjectionForCurrentView();
  }, 50);
};

const onWindowResize = () => {
  applyHeaderHeight(clampHeaderHeight(headerHeightPx.value));
  applyHeights(clampTimelineHeight(timelineHeightPx.value));
  updateScrollbarMetrics();
};

/* ===================== ИНИЦИАЛИЗАЦИЯ ===================== */
const checkDayChange = () => {
  const currentToday = initializeToday();
  if (!sameDay(currentToday, today.value)) {
    today.value = currentToday;
    const todayDay = getDayOfYear(today.value);
    mainStore.setToday(todayDay);
    if (mainStore.user && !mainStore.isAuthLoading) {
        centerToday(); 
        recalcProjectionForCurrentView();
    }
  }
};

let dayChangeCheckerInterval = null;
let resizeObserver = null;

onMounted(async () => {
  checkDayChange();
  dayChangeCheckerInterval = setInterval(checkDayChange, 60000);

  await mainStore.checkAuth();

  if (mainStore.isAuthLoading || !mainStore.user) return;
  
  mainStore.startAutoRefresh();

  await nextTick();
  await mainStore.fetchAllEntities();
  
  const todayDay = getDayOfYear(today.value);
  mainStore.setToday(todayDay);

  generateVisibleDays();
  await nextTick();
  centerToday(); 
  await nextTick();

  // 🔴 ИСПРАВЛЕНИЕ: Стартовая высота 130px
  applyHeaderHeight(clampHeaderHeight(headerHeightPx.value));
  const initialTop = (timelineGridRef.value && timelineGridRef.value.style.height)
    ? parseFloat(timelineGridRef.value.style.height)
    : timelineHeightPx.value;
  applyHeights(clampTimelineHeight(initialTop));

  if (resizerRef.value) {
    resizerRef.value.addEventListener('mousedown', initResize);
    resizerRef.value.addEventListener('touchstart', initResize, { passive: false });
  }
  
  if (headerResizerRef.value) {
    headerResizerRef.value.addEventListener('mousedown', initHeaderResize);
    headerResizerRef.value.addEventListener('touchstart', initHeaderResize, { passive: false });
  }

  if (timelineGridRef.value) {
    timelineGridRef.value.addEventListener('wheel', onWheelScroll, { passive: false });
    timelineGridRef.value.addEventListener('touchstart', onContentTouchStart, { passive: true });
    timelineGridRef.value.addEventListener('touchmove', onContentTouchMove, { passive: false });
    timelineGridRef.value.addEventListener('touchend', onContentTouchEnd);
  }

  resizeObserver = new ResizeObserver(() => {
    applyHeights(clampTimelineHeight(timelineHeightPx.value));
    updateScrollbarMetrics();
  });
  if (mainContentRef.value) resizeObserver.observe(mainContentRef.value);

  window.addEventListener('resize', onWindowResize);
  
  updateScrollbarMetrics();

  await recalcProjectionForCurrentView();
});

onBeforeUnmount(() => {
  if (dayChangeCheckerInterval) {
    clearInterval(dayChangeCheckerInterval);
    dayChangeCheckerInterval = null;
  }
  mainStore.stopAutoRefresh();

  if (resizerRef.value) {
    resizerRef.value.removeEventListener('mousedown', initResize);
    resizerRef.value.removeEventListener('touchstart', initResize);
  }
  if (headerResizerRef.value) {
    headerResizerRef.value.removeEventListener('mousedown', initHeaderResize);
    headerResizerRef.value.removeEventListener('touchstart', initHeaderResize);
  }
  
  if (timelineGridRef.value) {
    timelineGridRef.value.removeEventListener('wheel', onWheelScroll);
    timelineGridRef.value.removeEventListener('touchstart', onContentTouchStart);
    timelineGridRef.value.removeEventListener('touchmove', onContentTouchMove);
    timelineGridRef.value.removeEventListener('touchend', onContentTouchEnd);
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
  
  <div v-else-if="!mainStore.user" class="welcome-screen">
    <div class="welcome-content">
      <h1 class="welcome-title">INDEX12</h1>
      <h2 class="welcome-subtitle">Система управления финансами и активами</h2>
      <p class="welcome-features">Счета, компании, проекты, контрагенты</p>
      <a href="https://api.index12.com/auth/google" class="welcome-button">
        Начать
      </a>
    </div>
    <div class="welcome-image-container">
      <img src="/Серсив.png" alt="INDEX12 Dashboard" class="welcome-image">
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

        <div class="divider-wrapper">
          <div 
            v-if="isScrollActive"
            class="custom-scrollbar-track" 
            ref="customScrollbarTrackRef"
            @mousedown="onTrackClick"
          >
             <div 
               class="custom-scrollbar-thumb"
               :style="{ width: scrollbarThumbWidth + 'px', transform: `translateX(${scrollbarThumbX}px)` }"
               @mousedown.stop="onScrollThumbMouseDown"
               @touchstart.stop="onScrollThumbTouchStart"
             ></div>
          </div>
          <div class="vertical-resizer" ref="resizerRef"></div>
        </div>

        <div class="graph-area-wrapper" ref="graphAreaRef">
          <GraphRenderer
            v-if="visibleDays.length"
            :visibleDays="visibleDays"
            @update:yLabels="yAxisLabels = $event"
            class="graph-renderer-content"
          />
          <div class="summaries-container"></div>
        </div>
      </main>

      <aside class="home-right-panel">
        <button class="icon-btn import-export-btn" @click="showImportModal = true" title="Импорт / Экспорт">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>
        
        <div class="user-profile-widget">
          <button class="user-profile-button" ref="userButtonRef" @click="toggleUserMenu">
            <img :src="mainStore.user.avatarUrl" alt="avatar" class="user-avatar" v-if="mainStore.user.avatarUrl" />
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
      <button class="user-menu-item" disabled title="В разработке">Настройки</button>
      <button class="user-menu-item" @click="handleLogout">Выйти</button>
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
/* --- Стили для загрузки и нового экрана входа --- */
.loading-screen {
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
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-primary); /* Используем зеленый акцент */
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.welcome-screen {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-background-soft); /* #282828 из base.css */
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  padding: 5vw;
  box-sizing: border-box;
  overflow: hidden;
}

.welcome-content {
  flex: 1;
 
  padding-right: 2rem;
  z-index: 10;
}

.welcome-title {
  font-size: 4rem; /* 64px */
  font-weight: 700;
  color: var(--color-heading);
  margin-bottom: 1rem;
}

.welcome-subtitle {
  font-size: 1.75rem; /* 28px */
  font-weight: 300;
  color: var(--color-heading);
  margin-bottom: 1.5rem;
  line-height: 1.4;
}

.welcome-features {
  font-size: 1.125rem; /* 18px */
  color: var(--color-text);
  opacity: 0.8;
  margin-bottom: 2.5rem;
}

.welcome-button {
  display: inline-block;
  padding: 14px 32px;
  font-size: 1.125rem; /* 18px */
  font-weight: 600;
  color: #fff;
  background-color: var(--color-primary); /* Зеленый из base.css */
  border: none;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
  text-align: center;
  transition: background-color 0.2s, transform 0.2s;
}
.welcome-button:hover {
  background-color: #28a745; /* Чуть темнее зеленый */
  transform: translateY(-2px);
}

.welcome-image-container {
  flex: 1.2;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1500px;
}

.welcome-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  
  /* Эффект из вашего скриншота */
  transform: rotateY(-10deg) rotateX(5deg) rotateZ(-3deg) scale(1.1);
  opacity: 0.9;
}

/* Адаптивность для нового экрана */
@media (max-width: 900px) {
  .welcome-screen {
    flex-direction: column;
    text-align: center;
    justify-content: center;
  }
  .welcome-content {
    padding-right: 0;
    max-width: 100%;
    margin-bottom: 3rem;
  }
  .welcome-image-container {
    display: none; /* Скрываем изображение на маленьких экранах */
  }
}


/* --- Стили остального приложения (для залогиненного пользователя) --- */
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
  background-color: var(--color-primary); /* Зеленый акцент */
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
.user-menu {
  position: fixed; 
  width: 180px;      
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.1); 
  z-index: 2000; 
  overflow: hidden;
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
.user-menu-item:last-child { border-bottom: none; }
.user-menu-item:hover { background-color: var(--color-background-mute); }
.user-menu-item:disabled { color: var(--color-text-mute); cursor: not-allowed; background: none; }

.home-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  width: 100%;
  overflow: hidden;
  background-color: var(--color-background);
}
.home-header {
  flex-shrink: 0; 
  z-index: 100;
  background-color: var(--color-background);
  display: flex; 
  /* 🔴 ИСПРАВЛЕНИЕ: Фиксированная стартовая высота 130px */
  height: 130px;
}
.header-resizer {
  flex-shrink: 0;
  height: 15px; 
  background: var(--color-background-soft);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  cursor: row-resize;
  position: relative;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
}
.header-resizer:hover { border-top: 1px solid #777; }
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
.header-resizer:hover::before { opacity: 1; transform: scale(1.2); }

.home-body {
  display: flex;
  flex-grow: 1;
  overflow: hidden;
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
  position: relative; 
}
.home-right-panel::-webkit-scrollbar { display: none; }
.import-export-btn {
  position: absolute;
  top: 8px; 
  right: 8px; 
  z-index: 20; 
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
.import-export-btn svg { width: 18px; height: 18px; stroke: currentColor; }

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
  
  /* Запрещаем навигацию "Назад" */
  overscroll-behavior-x: none;
  /* Разрешаем только вертикальный скролл */
  touch-action: pan-y;
}
.timeline-grid-wrapper::-webkit-scrollbar { display: none; }
.timeline-grid-content {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  width: 100%;
}

.divider-wrapper {
  flex-shrink: 0;
  height: 15px;
  width: 100%;
  background-color: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
  position: relative;
  display: flex;
  align-items: center;
}

.custom-scrollbar-track {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: #2a2a2a; 
  cursor: pointer;
  z-index: 10;
}

.custom-scrollbar-thumb {
  position: absolute;
  top: 2px; 
  bottom: 2px; 
  background-color: #555; 
  border-radius: 6px;
  cursor: grab;
}
.custom-scrollbar-thumb:active {
  background-color: #777;
  cursor: grabbing;
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


.graph-area-wrapper {
  flex-grow: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.graph-renderer-content { flex-grow: 1; }
.summaries-container { flex-shrink: 0; }

.nav-panel-wrapper {
  height: 318px; 
  flex-shrink: 0;
  overflow: hidden;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}
.divider-placeholder {
  flex-shrink: 0;
  height: 15px;
  background-color: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
}
</style>
