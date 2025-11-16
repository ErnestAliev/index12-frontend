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
 * * --- МЕТКА ВЕРСИИ: v5.7-SCROLL-FIX ---
 * * ВЕРСИЯ: 5.7 - Исправление горизонтального скролла
 * ДАТА: 2025-11-16
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (КРИТИЧЕСКИЙ ФИКС) `ref="resizerRef"` перенесен с `.divider-wrapper`
 * на `.vertical-resizer`. Ранее `preventDefault()` в `initResize`
 * блокировал работу скроллбара, так как он находился внутри wrapper'а.
 * 2. Добавлен `watch` на `totalDays` для автоматического обновления
 * геометрии скроллбара при изменении режима просмотра.
 */

console.log('--- HomeView.vue v5.7-SCROLL-FIX ЗАГРУЖЕН ---'); 

const mainStore = useMainStore();
const showImportModal = ref(false); 

// --- Меню пользователя (Без изменений) ---
const showUserMenu = ref(false);
const userButtonRef = ref(null);
const userMenuPosition = ref({ top: '0px', left: '0px' });

const handleLogout = () => {
  console.log('[HomeView] handleLogout: 🔴 Пользователь выходит...');
  showUserMenu.value = false;
  mainStore.logout();
};

const toggleUserMenu = (event) => {
  console.log('[HomeView] toggleUserMenu: 🔳 Открытие/закрытие меню пользователя');
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
  console.log('[HomeView] handleImportComplete: 🏁 Импорт завершен...');
  showImportModal.value = false;
  try {
    await mainStore.forceRefreshAll();
    rebuildVisibleDays(); 
  } catch (error) {
    console.error('[HomeView] handleImportComplete: ❌ Ошибка:', error);
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
        console.error(`!!! HomeView._parseDateKey ОШИБКА:`, dateKey);
        return new Date(); 
    }
    const [year, doy] = dateKey.split('-').map(Number);
    const date = new Date(year, 0, 1);
    date.setDate(doy);
    return date;
};

const VISIBLE_COLS = 12;
const CENTER_INDEX = Math.floor((VISIBLE_COLS - 1) / 2); // 5
const viewMode = ref('12d');

const totalDays = computed(() => {
  return mainStore.computeTotalDaysForMode(viewMode.value, today.value);
});

// 🔴 НОВОЕ: Авто-обновление скроллбара при изменении количества дней
watch(totalDays, async (newVal) => {
  console.log(`[HomeView] watch(totalDays): Изменилось на ${newVal}. Обновляю скроллбар...`);
  await nextTick();
  updateScrollbarWidthAndPosition();
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
const masterScrollbarRef = ref(null);
const scrollbarContentRef = ref(null);
const graphAreaRef = ref(null);
const homeHeaderRef = ref(null);
const headerResizerRef = ref(null);

/* ===================== КОНСТАНТЫ ДЛЯ РЕСАЙЗА ===================== */
const TIMELINE_MIN = 100;
const GRAPH_MIN    = 115;
const DIVIDER_H    = 15;
const HEADER_MIN_H = 150; 
const HEADER_MAX_H_RATIO = 0.5; 
const headerHeightPx = ref(HEADER_MIN_H); 
const timelineHeightPx = ref(318);

/* ===================== КОНТЕКСТНОЕ МЕНЮ / ПОПАПЫ ===================== */
const openContextMenu = (day, event, cellIndex) => {
  console.log(`[HomeView] openContextMenu: 🖱️ ${day.dateKey}, ячейка ${cellIndex}`);
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

/* ===================== ДАННЫЕ ПО ВИДИМЫМ ДНЯМ ===================== */
const debouncedFetchVisibleDays = debounce(() => {
  console.log('[HomeView] (DEBOUNCED) fetchVisibleDays: Запрашиваю данные...');
  visibleDays.value.forEach(day => mainStore.fetchOperations(day.dateKey));
}, 300); 

const recalcProjectionForCurrentView = async () => {
  console.log(`[HomeView] recalcProjection: Вид ${viewMode.value}`);
  await mainStore.loadCalculationData(viewMode.value, today.value);
};

const handleTransferComplete = async (eventData) => {
  const dateKey = eventData?.dateKey;
  console.log(`[HomeView] TransferComplete: dateKey: ${dateKey}`);
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
  if (dateKey) {
    await mainStore.refreshDay(dateKey);
  }
  if (oldDateKey && oldDateKey !== dateKey) {
    await mainStore.refreshDay(oldDateKey);
  }
  await recalcProjectionForCurrentView();
  handleClosePopup();
};

/* ===================== ОКНО 12 ДНЕЙ ===================== */
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

/* ===================== РЕСАЙЗЕР ===================== */
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
  console.log('[HomeView] initResize: 🖱️ Начало ресайза (хватаем пипку)');
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

/* ===================== МАСТЕР-СКРОЛЛБАР ===================== */
const updateScrollbarWidthAndPosition = () => {
  if (!timelineGridRef.value || !scrollbarContentRef.value || !masterScrollbarRef.value) return;
  const viewportWidth = timelineGridRef.value.clientWidth || 1;
  
  // 🔴 Логируем расчеты
  // console.log(`[HomeView] updateScrollbar: totalDays=${totalDays.value}, viewport=${viewportWidth}`);
  
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
  rebuildVisibleDays(); 
};
const onWheelScroll = (event) => {
  if (!masterScrollbarRef.value) return;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    event.preventDefault();
    masterScrollbarRef.value.scrollLeft += event.deltaX;
  }
};

/* ===================== ЦЕНТРОВКА / СМЕНА МАСШТАБА ===================== */
const centerToday = () => {
  console.log('[HomeView] centerToday: 🎯 Центрирую на "сегодня"');
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  virtualStartIndex.value = Math.min(
    Math.max(0, globalTodayIndex.value - CENTER_INDEX),
    maxVirtual
  );
  rebuildVisibleDays();
  updateScrollbarWidthAndPosition();
};
const onChangeView = async (newView) => {
  console.log(`[HomeView] onChangeView: 🔄 Сменил вид на ${newView}.`);
  viewMode.value = newView;
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

/* ===================== ИНИЦИАЛИЗАЦИЯ / ОЧИСТКА ===================== */
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
  console.log('[HomeView] onMounted...');
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

  applyHeaderHeight(clampHeaderHeight(headerHeightPx.value));
  const initialTop = (timelineGridRef.value && timelineGridRef.value.style.height)
    ? parseFloat(timelineGridRef.value.style.height)
    : timelineHeightPx.value;
  applyHeights(clampTimelineHeight(initialTop));

  // 🔴 ИСПРАВЛЕНИЕ: (см. шаблон) ref теперь на самой пипке
  if (resizerRef.value) {
    resizerRef.value.addEventListener('mousedown', initResize);
    resizerRef.value.addEventListener('touchstart', initResize, { passive: false });
  }
  
  if (headerResizerRef.value) {
    headerResizerRef.value.addEventListener('mousedown', initHeaderResize);
    headerResizerRef.value.addEventListener('touchstart', initHeaderResize, { passive: false });
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
  console.log('[HomeView] onMounted: ✅ Инициализация завершена.');
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
  // ... (Остальные removeEventListener без изменений)
  if (headerResizerRef.value) {
    headerResizerRef.value.removeEventListener('mousedown', initHeaderResize);
    headerResizerRef.value.removeEventListener('touchstart', initHeaderResize);
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
        <!-- SVG icons omitted for brevity (same as original) -->
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

        <!-- 🔴 ИСПРАВЛЕНИЕ: ref="resizerRef" перенесен НА ПИПКУ -->
        <div class="divider-wrapper">
          <div class="horizontal-scrollbar-wrapper" ref="masterScrollbarRef">
            <div class="scrollbar-content" ref="scrollbarContentRef"></div>
          </div>
          <!-- Вот сюда перенесен ref: -->
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
/* (Стили из v5.5 - полностью идентичны) */
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
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}
@keyframes spin { to { transform: rotate(360deg); } }

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
  width: 100%;
  overflow: hidden;
  background-color: var(--color-background);
}
.home-header {
  flex-shrink: 0; 
  z-index: 100;
  background-color: var(--color-background);
  display: flex; 
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
  overscroll-behavior-x: contain;
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
  background-color: #ffffff;
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

.graph-area-wrapper {
  flex-grow: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
