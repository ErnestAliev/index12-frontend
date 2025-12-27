<script setup>
import { onMounted, onBeforeUnmount, ref, computed, nextTick, watch } from 'vue';
import axios from 'axios';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

// Компоненты
import IncomePopup from '@/components/IncomePopup.vue'; 
import ExpensePopup from '@/components/ExpensePopup.vue'; 
import TransferPopup from '@/components/TransferPopup.vue';
import WithdrawalPopup from '@/components/WithdrawalPopup.vue'; 
import TheHeader from '@/components/TheHeader.vue';
import CellContextMenu from '@/components/CellContextMenu.vue';
import DayColumn from '@/components/DayColumn.vue';
import NavigationPanel from '@/components/NavigationPanel.vue';
import GraphRenderer from '@/components/GraphRenderer.vue';
import YAxisPanel from '@/components/YAxisPanel.vue';
import ImportExportModal from '@/components/ImportExportModal.vue';
import GraphModal from '@/components/GraphModal.vue';
import AboutModal from '@/components/AboutModal.vue';
import PrepaymentModal from '@/components/PrepaymentModal.vue';
import RetailClosurePopup from '@/components/RetailClosurePopup.vue'; 
import RefundPopup from '@/components/RefundPopup.vue'; 
import SmartDealPopup from '@/components/SmartDealPopup.vue'; 
// 🟢 1. Импорт нового попапа
import TaxPaymentDetailsPopup from '@/components/TaxPaymentDetailsPopup.vue';

('--- HomeView.vue v52.1 (Delete Fix) Loaded ---'); 

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const mainStore = useMainStore();

// --- CONSTANTS ---
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const baseUrlCalculated = API_BASE_URL.replace(/\/api$/, '');
const googleAuthUrl = `${baseUrlCalculated}/auth/google`;
const devAuthUrl = `${baseUrlCalculated}/auth/dev-login`;

// Состояния модальных окон
const showImportModal = ref(false); 
const showGraphModal = ref(false);
const showAboutModal = ref(false);

// --- AI ассистент (Desktop MVP, read-only) ---
const isAiDrawerOpen = ref(false);
const aiInput = ref('');
const aiMessages = ref([]); // { id, role: 'user'|'assistant', text, copied? }
const aiLoading = ref(false);
const aiPaywall = ref(false);
const aiPaywallReason = ref('AI ассистент доступен по подписке.');
const aiMessagesRef = ref(null);
const aiInputRef = ref(null);

// --- AI voice input (Browser SpeechRecognition MVP) ---
const aiSpeechSupported = ref(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
const isAiRecording = ref(false);
let aiRecognition = null;
let aiSpeechFinalBuffer = '';

const _ensureAiRecognition = () => {
  if (aiRecognition) return aiRecognition;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  const r = new SR();
  r.lang = 'ru-RU';
  r.interimResults = true;
  r.continuous = false;

  r.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const transcript = (res[0]?.transcript || '').trim();
      if (!transcript) continue;
      if (res.isFinal) {
        aiSpeechFinalBuffer = (aiSpeechFinalBuffer + ' ' + transcript).trim();
      } else {
        interim = transcript;
      }
    }
    aiInput.value = (aiSpeechFinalBuffer + (interim ? ' ' + interim : '')).trim();
  };

  r.onend = () => {
    isAiRecording.value = false;
  };

  r.onerror = () => {
    isAiRecording.value = false;
  };

  aiRecognition = r;
  return aiRecognition;
};

const toggleAiRecording = () => {
  if (!aiSpeechSupported.value) {
    alert('Голосовой ввод не поддерживается этим браузером.');
    return;
  }
  if (aiLoading.value) return;

  const r = _ensureAiRecognition();
  if (!r) {
    alert('Голосовой ввод не поддерживается этим браузером.');
    return;
  }

  if (isAiRecording.value) {
    try { r.stop(); } catch(e) {}
    isAiRecording.value = false;
    return;
  }

  aiSpeechFinalBuffer = '';
  isAiRecording.value = true;
  try { r.start(); } catch(e) { isAiRecording.value = false; }
};

const stopAiRecordingIfNeeded = () => {
  if (!isAiRecording.value) return;
  try { aiRecognition?.stop?.(); } catch(e) {}
  isAiRecording.value = false;
};

const _makeAiMsg = (role, text) => ({
  id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
  role,
  text,
  copied: false,
});

const scrollAiToBottom = () => {
  const el = aiMessagesRef.value;
  if (!el) return;
  // requestAnimationFrame помогает дождаться реального пересчета высоты после рендера
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
};

const openAiDrawer = () => {
  isAiDrawerOpen.value = true;
  aiPaywall.value = false;
  nextTick(() => {
    aiInputRef.value?.focus?.();
    scrollAiToBottom();
  });
};

// Автоскролл: всегда держим чат внизу при новых сообщениях
watch(
  () => aiMessages.value.length,
  async () => {
    await nextTick();
    scrollAiToBottom();
  }
);

const closeAiDrawer = () => {
  isAiDrawerOpen.value = false;
};

const useQuickPrompt = (promptText) => {
  aiInput.value = promptText;
  nextTick(() => aiInputRef.value?.focus?.());
};

const copyAiText = async (msg) => {
  try {
    await navigator.clipboard.writeText(msg.text || '');
    msg.copied = true;
    setTimeout(() => { msg.copied = false; }, 1000);
  } catch (e) {
    alert('Не удалось скопировать');
  }
};

const requestAiAccess = () => {
  alert('AI доступен по подписке. Пока платежи не подключены — напиши администратору.');
};

const sendAiMessage = async () => {
  stopAiRecordingIfNeeded();
  const text = (aiInput.value || '').trim();
  if (!text || aiLoading.value) return;

  aiMessages.value.push(_makeAiMsg('user', text));
  nextTick(scrollAiToBottom);
  aiInput.value = '';
  aiLoading.value = true;

  try {
    // Передаем контекст периода и флаг скрытых счетов (read-only)
    const asOf = mainStore?.projection?.rangeEndDate || null;
    const includeHidden = !!(
      mainStore?.showExcludedAccounts ??
      mainStore?.includeHiddenAccounts ??
      mainStore?.showHiddenAccounts ??
      mainStore?.showHidden
    );

    const res = await axios.post(`${API_BASE_URL}/ai/query`, {
      message: text,
      asOf,
      includeHidden,
    });
    const answer = (res?.data?.text || '').trim() || 'Нет ответа.';
    aiMessages.value.push(_makeAiMsg('assistant', answer));
  } catch (err) {
    const status = err?.response?.status;

    // Paywall временно отключен (MVP). Код оставляем на будущее.
    if (false && (status === 402 || status === 403)) {
      aiPaywall.value = true;
      aiPaywallReason.value = err?.response?.data?.message || 'AI ассистент доступен по подписке.';
      aiMessages.value.push(_makeAiMsg('assistant', 'AI доступен по подписке. Открой доступ и попробуй снова.'));
      return;
    }

    aiMessages.value.push(_makeAiMsg('assistant', 'Ошибка AI. Проверь backend / ключ / лимиты.'));
  } finally {
    aiLoading.value = false;
    nextTick(scrollAiToBottom);
  }
};

// Состояние для Prepayment Modal (Сценарий 1)
const isPrepaymentModalVisible = ref(false);
const prepaymentData = ref({});
const prepaymentDateKey = ref('');

// Состояния основных попапов
const isIncomePopupVisible = ref(false);
const isExpensePopupVisible = ref(false);
const isTransferPopupVisible = ref(false);
const isWithdrawalPopupVisible = ref(false);
const isRetailPopupVisible = ref(false);
const isRefundPopupVisible = ref(false);
// 🟢 2. Состояние для попапа деталей налога
const isTaxDetailsPopupVisible = ref(false);

// Состояния для Smart Deal (Сценарий 2 - Второй транш)
const isSmartDealPopupVisible = ref(false);
const smartDealPayload = ref(null); 
const smartDealStatus = ref({ "debt": 0, "totalDeal": 0, "paidTotal": 0 });

// Временное хранение данных для возврата (при отмене)
const tempIncomeData = ref(null);

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

// --- HANDLERS ---

// 1. ОБРАБОТЧИК: Переключение на окно предоплаты
const handleSwitchToPrepayment = (data) => {
    const rawDate = data.date || new Date();
    const d = new Date(rawDate);
    prepaymentDateKey.value = mainStore._getDateKey(d);
    
    prepaymentData.value = { 
      ...data,
      amount: Math.abs(data.amount || 0),
      contractorId: data.contractorId,
      counterpartyIndividualId: data.counterpartyIndividualId,
      operationToEdit: null 
    };
    
    isIncomePopupVisible.value = false;
    isPrepaymentModalVisible.value = true;
};

// 2. ОБРАБОТЧИК: Сохранение предоплаты
const handlePrepaymentSave = async (finalData) => {
    isPrepaymentModalVisible.value = false;
    try {
        if (!finalData.cellIndex && finalData.cellIndex !== 0) {
            finalData.cellIndex = await mainStore.getFirstFreeCellIndex(finalData.dateKey);
        }

        const prepayIds = mainStore.getPrepaymentCategoryIds;
        if (prepayIds.length > 0 && !finalData.prepaymentId) {
            finalData.prepaymentId = prepayIds[0];
        }

        finalData.description = `Предоплата`;

        await mainStore.createEvent(finalData);
        // 🟢 FIX: Убраны fetchAllEntities и loadCalculationData
    } catch (e) {
        console.error('Prepayment Save Error:', e);
        alert('Не удалось сохранить предоплату: ' + e.message);
    }
};

// 3. ОБРАБОТЧИК: Умная сделка
const handleSwitchToSmartDeal = async (payload) => {
    tempIncomeData.value = { ...payload };
    isIncomePopupVisible.value = false;
    smartDealPayload.value = payload;
    
    let status = payload.dealStatus;
    if (!status && payload.projectId) {
         try { status = mainStore.getProjectDealStatus(payload.projectId, payload.categoryId, payload.contractorId, payload.counterpartyIndividualId); } 
         catch(e) { console.error('Error fetching status:', e); }
    }
    smartDealStatus.value = status || { debt: 0, totalDeal: 0 };
    isSmartDealPopupVisible.value = true;
};

const handleSmartDealCancel = () => {
    isSmartDealPopupVisible.value = false;
};

const handleSmartDealConfirm = async ({ closePrevious, isFinal, nextTrancheNum }) => {
    isSmartDealPopupVisible.value = false;
    const data = smartDealPayload.value;
    if (!data) return;

    try {
        if (closePrevious === true && !isFinal) {
             await mainStore.closePreviousTranches(
                 data.projectId, 
                 data.categoryId, 
                 data.contractorId, 
                 data.counterpartyIndividualId
             );
        }

        const trancheNum = nextTrancheNum || 2;
        const formattedAmount = formatNumber(data.amount);
        const description = `${formattedAmount} ${trancheNum}-й транш`;

        const incomeData = {
            type: 'income',
            amount: data.amount,
            date: new Date(data.date),
            accountId: data.accountId,
            projectId: data.projectId,
            contractorId: data.contractorId,
            counterpartyIndividualId: data.counterpartyIndividualId,
            categoryId: data.categoryId,
            companyId: data.companyId,
            individualId: data.individualId,
            totalDealAmount: 0, 
            isDealTranche: true, 
            isClosed: isFinal,
            description: description,
            cellIndex: data.cellIndex 
        };
        
        if (incomeData.cellIndex === undefined) {
             const dateKey = mainStore._getDateKey(new Date(data.date));
             incomeData.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey);
        }

        const newOp = await mainStore.createEvent(incomeData);

        if (isFinal) {
             await mainStore.closePreviousTranches(
                 data.projectId, 
                 data.categoryId, 
                 data.contractorId, 
                 data.counterpartyIndividualId
             );
             
             await mainStore.createWorkAct(
                 data.projectId,
                 data.categoryId,
                 data.contractorId,
                 data.counterpartyIndividualId,
                 data.amount,
                 new Date(),
                 newOp._id, 
                 true, 
                 data.companyId,
                 data.individualId
             );
        }
        
        // 🟢 FIX: Убраны лишние перезагрузки данных
    } catch (e) {
        console.error('Smart Deal Error:', e);
        alert('Ошибка при проведении транша: ' + e.message);
    }
};

const handleOperationSave = async ({ mode, id, data, originalOperation }) => {
    if (data.type === 'income') isIncomePopupVisible.value = false;
    else isExpensePopupVisible.value = false;
    
    operationToEdit.value = null;

    try {
        if (mode === 'create') {
             if (data.cellIndex === undefined) {
                 const dateKey = data.dateKey || mainStore._getDateKey(new Date(data.date));
                 data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey);
             }
             await mainStore.createEvent(data);
        } else if (mode === 'edit') {
            await mainStore.updateOperation(id, data);
        }
        // 🟢 FIX: Убрана loadCalculationData, store сам обновляет проекцию
    } catch (error) {
        console.error('Save Error (Operation):', error);
        alert('Ошибка сохранения операции.');
    }
};

const initializeToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
const today = ref(initializeToday());
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;
const _parseDateKey = (dateKey) => {
    if (typeof dateKey !== 'string' || !dateKey.includes('-')) return new Date(); 
    const [year, doy] = dateKey.split('-').map(Number);
    if (isNaN(year) || isNaN(doy)) return new Date();
    const date = new Date(year, 0, 1); date.setDate(doy); return date;
};

const VISIBLE_COLS = 12;
const CENTER_INDEX = Math.floor((VISIBLE_COLS - 1) / 2);
const viewMode = ref('12d');
const isScrollActive = computed(() => viewMode.value !== '12d');
const totalDays = computed(() => mainStore.computeTotalDaysForMode(viewMode.value, today.value));
watch(totalDays, async () => { await nextTick(); updateScrollbarMetrics(); });
const globalTodayIndex = computed(() => (viewMode.value === '12d') ? CENTER_INDEX : Math.floor(totalDays.value / 2));
const virtualStartIndex = ref(0);
const globalIndexFromLocal = (localIndex) => virtualStartIndex.value + localIndex;
const dateFromGlobalIndex = (globalIndex) => {
  const delta = globalIndex - globalTodayIndex.value;
  const t = today.value;
  const d = new Date(t); d.setDate(t.getDate() + delta); return d;
};

const visibleDays = ref([]);
const isContextMenuVisible = ref(false);
const contextMenuPosition = ref({ top: '0px', left: '0px' });
const selectedDay = ref(null);
const selectedCellIndex = ref(0);
const operationToEdit = ref(null);

const minDateFromProjection = computed(() => mainStore.projection.rangeStartDate ? new Date(mainStore.projection.rangeStartDate) : null);
const maxDateFromProjection = computed(() => mainStore.projection.rangeEndDate ? new Date(mainStore.projection.rangeEndDate) : null);

const mainContentRef = ref(null);
const timelineGridRef = ref(null);
const timelineGridContentRef = ref(null);
const navPanelWrapperRef = ref(null);
const yAxisLabels = ref([]); 
const resizerRef = ref(null);
const customScrollbarTrackRef = ref(null);
const scrollbarThumbWidth = ref(0);
const scrollbarThumbX = ref(0);
const graphAreaRef = ref(null);
const homeHeaderRef = ref(null);
const headerResizerRef = ref(null);

const TIMELINE_MIN = 100;
const GRAPH_MIN    = 115;
const DIVIDER_H    = 15;
const HEADER_MIN_H = 132; 
const HEADER_MAX_H_RATIO = 0.8; 
const headerHeightPx = ref(HEADER_MIN_H); 
const timelineHeightPx = ref(318);

watch(() => mainStore.isHeaderExpanded, (isExpanded) => {
    if (isExpanded) {
        const totalWidgets = mainStore.allWidgets.length;
        const rows = Math.ceil(totalWidgets / 6);
        headerHeightPx.value = rows * 135 + 15; 
    } else {
        headerHeightPx.value = 135;
    }
    applyHeaderHeight(headerHeightPx.value);
    nextTick(() => { onWindowResize(); });
});

const openContextMenu = (day, event, cellIndex) => {
  event.stopPropagation();
  selectedDay.value = day; selectedCellIndex.value = cellIndex;
  const menuWidth = 260; 
  const clickX = event.clientX; const clickY = event.clientY;
  const windowWidth = window.innerWidth;
  const newPos = { top: `${clickY + 5}px`, left: 'auto', right: 'auto' };
  if (clickX + menuWidth > windowWidth) { newPos.right = `${windowWidth - clickX + 5}px`; } else { newPos.left = `${clickX + 5}px`; }
  contextMenuPosition.value = newPos;
  isContextMenuVisible.value = true;
};

const handleContextMenuSelect = (type) => {
  isContextMenuVisible.value = false;
  if (!selectedDay.value) return;
  operationToEdit.value = null;

  if (type === 'transfer') { 
      isTransferPopupVisible.value = true; 
  } else { 
      openPopup(type); 
  }
};

const openPopup = (type) => {
    if (type === 'income') {
        isIncomePopupVisible.value = true;
    } else if (type === 'expense') {
        isExpensePopupVisible.value = true;
    }
};

const handleEditOperation = (operation) => {
  operationToEdit.value = operation;
  const opDate = _parseDateKey(operation.dateKey); 
  selectedDay.value = { date: opDate, dayOfYear: operation.dayOfYear, dateKey: operation.dateKey };
  selectedCellIndex.value = operation.cellIndex;

  // 🟢 3. ПРОВЕРКА НА НАЛОГ
  if (mainStore._isTaxPayment(operation)) {
      isTaxDetailsPopupVisible.value = true;
      return;
  }

  if (mainStore._isRetailWriteOff(operation)) {
      isRetailPopupVisible.value = true;
      return;
  }
  const catId = operation.categoryId?._id || operation.categoryId;
  if (mainStore.refundCategoryId && catId === mainStore.refundCategoryId) {
      isRefundPopupVisible.value = true;
      return;
  }
  if (operation.type === 'transfer' || operation.isTransfer) {
    isTransferPopupVisible.value = true;
    return;
  } 
  if (operation.isWithdrawal) {
    isWithdrawalPopupVisible.value = true;
    return;
  }
  if (operation.type === 'income') {
    isIncomePopupVisible.value = true;
    return;
  }
  isExpensePopupVisible.value = true; 
};

const handleClosePopup = () => { 
    isIncomePopupVisible.value = false; 
    isExpensePopupVisible.value = false;
    operationToEdit.value = null; 
};
const handleCloseTransferPopup = () => { isTransferPopupVisible.value = false; operationToEdit.value = null; };
const handleCloseWithdrawalPopup = () => { isWithdrawalPopupVisible.value = false; operationToEdit.value = null; };

const debouncedFetchVisibleDays = debounce(() => { visibleDays.value.forEach(day => mainStore.fetchOperations(day.dateKey)); }, 300); 
const recalcProjectionForCurrentView = async () => { await mainStore.loadCalculationData(viewMode.value, today.value); };
const handleOperationDelete = async (operation) => { 
    if (!operation) return; 
    await mainStore.deleteOperation(operation); 
    // 🟢 FIX: Убрана явная перезагрузка проекции
    visibleDays.value = [...visibleDays.value]; 
    handleClosePopup(); 
    handleCloseTransferPopup();
    handleCloseWithdrawalPopup();
};

// 🟢 4. Хендлер удаления налога
const handleTaxDelete = async (operation) => {
    isTaxDetailsPopupVisible.value = false;
    if (!operation) return;
    try {
        await mainStore.deleteOperation(operation);
        // Принудительно обновим налоги, чтобы виджет обновился
        const res = await axios.get(`${API_BASE_URL}/taxes`);
        mainStore.taxes = res.data;
        // Перерисовываем дни
        visibleDays.value = [...visibleDays.value];
    } catch(e) {
        alert("Ошибка удаления налога: " + e.message);
    }
};

const scrollInterval = ref(null);
const isAutoScrolling = ref(false);
const stopAutoScroll = () => { if (scrollInterval.value) { clearInterval(scrollInterval.value); scrollInterval.value = null; } isAutoScrolling.value = false; };
const onContainerDragOver = (e) => {
  if (viewMode.value === '12d') return;
  if (!timelineGridRef.value) return;
  const rect = timelineGridRef.value.getBoundingClientRect();
  const mouseX = e.clientX;
  const threshold = 80;
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  let direction = 0; 
  if (mouseX < rect.left + threshold) direction = -1; else if (mouseX > rect.right - threshold) direction = 1;
  if (direction !== 0) { if (!isAutoScrolling.value) { isAutoScrolling.value = true; scrollInterval.value = setInterval(() => { const nextVal = virtualStartIndex.value + direction; if (nextVal >= 0 && nextVal <= maxVirtual) { virtualStartIndex.value = nextVal; rebuildVisibleDays(); updateScrollbarMetrics(); } else { stopAutoScroll(); } }, 100); } } else { stopAutoScroll(); }
};
const onContainerDragLeave = (e) => { stopAutoScroll(); };
const handleOperationDrop = async (dropData) => { stopAutoScroll(); const operation = dropData.operation; const oldDateKey = operation.dateKey; const newDateKey = dropData.toDateKey; const newCellIndex = dropData.toCellIndex; if (!oldDateKey || !newDateKey) return; if (oldDateKey === newDateKey && operation.cellIndex === newCellIndex) return; await mainStore.moveOperation(operation, oldDateKey, newDateKey, newCellIndex); };
const rebuildVisibleDays = () => { const days = []; for (let i = 0; i < VISIBLE_COLS; i++) { const gIdx = globalIndexFromLocal(i); const date = dateFromGlobalIndex(gIdx); days.push({ id: i, date, isToday: sameDay(date, today.value), dayOfYear: getDayOfYear(date), dateKey: _getDateKey(date) }); } visibleDays.value = days; debouncedFetchVisibleDays(); };
const generateVisibleDays = () => { rebuildVisibleDays(); };
const clampHeaderHeight = (rawPx) => { const maxHeight = window.innerHeight * HEADER_MAX_H_RATIO; return Math.min(Math.max(rawPx, HEADER_MIN_H), maxHeight); };
const applyHeaderHeight = (newPx) => { headerHeightPx.value = Math.round(newPx); if (homeHeaderRef.value) { homeHeaderRef.value.style.height = `${headerHeightPx.value}px`; } };
const initHeaderResize = (e) => { e.preventDefault(); window.addEventListener('mousemove', doHeaderResize); window.addEventListener('touchmove', doHeaderResize, { passive: false }); window.addEventListener('mouseup', stopHeaderResize); window.addEventListener('touchend', stopHeaderResize); };
const doHeaderResize = (e) => { const y = e.touches ? e.touches[0].clientY : e.clientY; applyHeaderHeight(clampHeaderHeight(y)); };
const stopHeaderResize = () => { window.removeEventListener('mousemove', doHeaderResize); window.removeEventListener('touchmove', doHeaderResize); window.removeEventListener('mouseup', stopHeaderResize); window.removeEventListener('touchend', stopHeaderResize); };
const clampTimelineHeight = (rawPx) => { const container = mainContentRef.value; if (!container) return timelineHeightPx.value; const headerTotalH = headerHeightPx.value + 15; const containerH = window.innerHeight - headerTotalH; const maxTop = Math.max(0, containerH - DIVIDER_H - GRAPH_MIN); const minTop = TIMELINE_MIN; return Math.min(Math.max(rawPx, minTop), maxTop); };
const applyHeights = (timelinePx) => { timelineHeightPx.value = Math.round(timelinePx); if (timelineGridRef.value) { timelineGridRef.value.style.height = `${timelineHeightPx.value}px`; } if (navPanelWrapperRef.value) { navPanelWrapperRef.value.style.height = `${timelineHeightPx.value}px`; } };
const initResize = (e) => { e.preventDefault(); window.addEventListener('mousemove', doResize); window.addEventListener('touchmove', doResize, { passive: false }); window.addEventListener('mouseup', stopResize); window.addEventListener('touchend', stopResize); };
const doResize = (e) => { if (!mainContentRef.value) return; const y = e.touches ? e.touches[0].clientY : e.clientY; const mainTop = mainContentRef.value.getBoundingClientRect().top; applyHeights(clampTimelineHeight(y - mainTop)); };
const stopResize = () => { window.removeEventListener('mousemove', doResize); window.removeEventListener('touchmove', doResize); window.removeEventListener('mouseup', stopResize); window.removeEventListener('touchend', stopResize); };
const updateScrollbarMetrics = () => { if (!customScrollbarTrackRef.value) return; const trackWidth = customScrollbarTrackRef.value.clientWidth || 0; const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS); if (maxVirtual <= 0) { scrollbarThumbWidth.value = trackWidth; scrollbarThumbX.value = 0; return; } const ratio = VISIBLE_COLS / Math.max(VISIBLE_COLS, totalDays.value); let tWidth = trackWidth * ratio; tWidth = Math.max(50, tWidth); scrollbarThumbWidth.value = tWidth; const availableSpace = trackWidth - tWidth; const progress = virtualStartIndex.value / maxVirtual; scrollbarThumbX.value = progress * availableSpace; };
const scrollState = { isDragging: false, startX: 0, startThumbX: 0 };
const onScrollThumbMouseDown = (e) => { startDrag(e.clientX); };
const onScrollThumbTouchStart = (e) => { startDrag(e.touches[0].clientX); };
const startDrag = (clientX) => { scrollState.isDragging = true; scrollState.startX = clientX; scrollState.startThumbX = scrollbarThumbX.value; window.addEventListener('mousemove', onScrollThumbMove); window.addEventListener('mouseup', onScrollThumbEnd); window.addEventListener('touchmove', onScrollThumbTouchMove, { passive: false }); window.addEventListener('touchend', onScrollThumbEnd); document.body.style.userSelect = 'none'; document.body.style.cursor = 'grabbing'; };
const calculateScrollFromDrag = (clientX) => { if (!customScrollbarTrackRef.value) return; const trackWidth = customScrollbarTrackRef.value.clientWidth; const availableSpace = trackWidth - scrollbarThumbWidth.value; if (availableSpace <= 0) return; const delta = clientX - scrollState.startX; let newThumbX = scrollState.startThumbX + delta; newThumbX = Math.max(0, Math.min(newThumbX, availableSpace)); scrollbarThumbX.value = newThumbX; const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS); const ratio = newThumbX / availableSpace; const newIndex = Math.round(ratio * maxVirtual); if (newIndex !== virtualStartIndex.value) { virtualStartIndex.value = newIndex; rebuildVisibleDays(); } };
const onScrollThumbMove = (e) => { if (!scrollState.isDragging) return; calculateScrollFromDrag(e.clientX); };
const onScrollThumbTouchMove = (e) => { if (!scrollState.isDragging) return; e.preventDefault(); calculateScrollFromDrag(e.touches[0].clientX); };
const onScrollThumbEnd = () => { scrollState.isDragging = false; window.removeEventListener('mousemove', onScrollThumbMove); window.removeEventListener('mouseup', onScrollThumbEnd); window.removeEventListener('touchmove', onScrollThumbTouchMove); window.removeEventListener('touchend', onScrollThumbEnd); document.body.style.userSelect = ''; document.body.style.cursor = ''; };
const onTrackClick = (e) => { if (e.target.classList.contains('custom-scrollbar-thumb')) return; const trackRect = customScrollbarTrackRef.value.getBoundingClientRect(); const clickX = e.clientX - trackRect.left; const targetThumbX = clickX - (scrollbarThumbWidth.value / 2); const trackWidth = trackRect.width; const availableSpace = trackWidth - scrollbarThumbWidth.value; let newThumbX = Math.max(0, Math.min(targetThumbX, availableSpace)); const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS); const ratio = newThumbX / availableSpace; virtualStartIndex.value = Math.round(ratio * maxVirtual); rebuildVisibleDays(); updateScrollbarMetrics(); };
const onWheelScroll = (event) => { if (!isScrollActive.value) return; const isHorizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY); if (isHorizontal) { if (event.cancelable && !event.ctrlKey) event.preventDefault(); const delta = event.deltaX; const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS); if (Math.abs(delta) > 1) { const direction = delta > 0 ? 1 : -1; const speed = Math.abs(delta) > 50 ? 2 : 1; let nextVal = virtualStartIndex.value + (direction * speed); nextVal = Math.max(0, Math.min(nextVal, maxVirtual)); if (nextVal !== virtualStartIndex.value) { virtualStartIndex.value = nextVal; rebuildVisibleDays(); updateScrollbarMetrics(); } } } };
const contentTouchState = { startX: 0, startIndex: 0, isDragging: false };
const onContentTouchStart = (e) => { if (!isScrollActive.value) return; contentTouchState.isDragging = true; contentTouchState.startX = e.touches[0].clientX; contentTouchState.startIndex = virtualStartIndex.value; };
const onContentTouchMove = (e) => { if (!contentTouchState.isDragging) return; const deltaPx = contentTouchState.startX - e.touches[0].clientX; const pxPerDay = 50; const deltaDays = Math.round(deltaPx / pxPerDay); const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS); let nextVal = contentTouchState.startIndex + deltaDays; nextVal = Math.max(0, Math.min(nextVal, maxVirtual)); if (e.cancelable) e.preventDefault(); if (nextVal !== virtualStartIndex.value) { virtualStartIndex.value = nextVal; rebuildVisibleDays(); updateScrollbarMetrics(); } };
const onContentTouchEnd = () => { contentTouchState.isDragging = false; };
const centerToday = () => { const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS); virtualStartIndex.value = Math.min(Math.max(0, globalTodayIndex.value - CENTER_INDEX), maxVirtual); rebuildVisibleDays(); updateScrollbarMetrics(); };
const onChangeView = async (newView) => { const currentStartDate = visibleDays.value[0]?.date || new Date(today.value); viewMode.value = newView; await nextTick(); const msPerDay = 1000 * 60 * 60 * 24; const diffDays = Math.round((currentStartDate.getTime() - today.value.getTime()) / msPerDay); const newGlobalTodayIndex = (viewMode.value === '12d') ? CENTER_INDEX : Math.floor(totalDays.value / 2); let targetIndex = newGlobalTodayIndex + diffDays; const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS); targetIndex = Math.max(0, Math.min(targetIndex, maxVirtual)); virtualStartIndex.value = targetIndex; rebuildVisibleDays(); await nextTick(); setTimeout(() => { updateScrollbarMetrics(); recalcProjectionForCurrentView(); }, 50); };
const onWindowResize = () => { applyHeaderHeight(clampHeaderHeight(headerHeightPx.value)); applyHeights(clampTimelineHeight(timelineHeightPx.value)); updateScrollbarMetrics(); };
const checkDayChange = () => { const currentToday = initializeToday(); if (!sameDay(currentToday, today.value)) { today.value = currentToday; const todayDay = getDayOfYear(today.value); mainStore.setToday(todayDay); if (mainStore.user && !mainStore.isAuthLoading) { centerToday(); recalcProjectionForCurrentView(); } } };
let dayChangeCheckerInterval = null;
let resizeObserver = null;
onMounted(async () => { checkDayChange(); dayChangeCheckerInterval = setInterval(checkDayChange, 60000); await mainStore.checkAuth(); if (mainStore.isAuthLoading || !mainStore.user) return; mainStore.startAutoRefresh(); await nextTick(); await mainStore.fetchAllEntities(); const todayDay = getDayOfYear(today.value); mainStore.setToday(todayDay); generateVisibleDays(); await nextTick(); centerToday(); await nextTick(); applyHeaderHeight(clampHeaderHeight(headerHeightPx.value)); const initialTop = (timelineGridRef.value && timelineGridRef.value.style.height) ? parseFloat(timelineGridRef.value.style.height) : timelineHeightPx.value; applyHeights(clampTimelineHeight(initialTop)); if (resizerRef.value) { resizerRef.value.addEventListener('mousedown', initResize); resizerRef.value.addEventListener('touchstart', initResize, { passive: false }); } if (headerResizerRef.value) { headerResizerRef.value.addEventListener('mousedown', initHeaderResize); headerResizerRef.value.addEventListener('touchstart', initHeaderResize, { passive: false }); } if (timelineGridRef.value) { timelineGridRef.value.addEventListener('wheel', onWheelScroll, { passive: false }); timelineGridRef.value.addEventListener('touchstart', onContentTouchStart, { passive: true }); timelineGridRef.value.addEventListener('touchmove', onContentTouchMove, { passive: false }); timelineGridRef.value.addEventListener('touchend', onContentTouchEnd); } resizeObserver = new ResizeObserver(() => { applyHeights(clampTimelineHeight(timelineHeightPx.value)); updateScrollbarMetrics(); }); if (mainContentRef.value) resizeObserver.observe(mainContentRef.value); window.addEventListener('resize', onWindowResize); updateScrollbarMetrics(); await recalcProjectionForCurrentView(); });
onBeforeUnmount(() => { if (dayChangeCheckerInterval) { clearInterval(dayChangeCheckerInterval); dayChangeCheckerInterval = null; } mainStore.stopAutoRefresh(); if (resizerRef.value) { resizerRef.value.removeEventListener('mousedown', initResize); resizerRef.value.removeEventListener('touchstart', initResize); } if (headerResizerRef.value) { headerResizerRef.value.removeEventListener('mousedown', initHeaderResize); headerResizerRef.value.removeEventListener('touchstart', initHeaderResize); } if (timelineGridRef.value) { timelineGridRef.value.removeEventListener('wheel', onWheelScroll); timelineGridRef.value.removeEventListener('touchstart', onContentTouchStart); timelineGridRef.value.removeEventListener('touchmove', onContentTouchMove); timelineGridRef.value.removeEventListener('touchend', onContentTouchEnd); } window.removeEventListener('resize', onWindowResize); if (resizeObserver && mainContentRef.value) { resizeObserver.unobserve(mainContentRef.value); } resizeObserver = null; });

// --- Transfer, Retail, Refund Handlers ---
const handleTransferSave = async ({ mode, id, data }) => { 
    handleCloseTransferPopup(); 
    try { 
        if (mode === 'create') { 
            if (data.cellIndex === undefined) { 
                const dateKey = mainStore._getDateKey(new Date(data.date)); 
                data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); 
            } 
            await mainStore.createTransfer(data); 
        } else if (mode === 'edit') { 
            await mainStore.updateTransfer(id, data); 
        } 
        // 🟢 FIX: Убрана перезагрузка loadCalculationData
    } catch (e) { alert('Ошибка сохранения перевода'); } 
};

const handleWithdrawalSave = async ({ mode, id, data }) => { 
    isWithdrawalPopupVisible.value = false; 
    try { 
        if (mode === 'create') { 
            if (data.cellIndex === undefined) { 
                const dateKey = mainStore._getDateKey(new Date(data.date)); 
                data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); 
            } 
            await mainStore.createEvent(data); 
        } else { 
            await mainStore.updateOperation(id, data); 
        } 
        // 🟢 FIX: Убрана перезагрузка loadCalculationData
    } catch (e) { alert('Ошибка сохранения вывода'); } 
};

const handleRetailSave = async ({ id, data }) => { 
    isRetailPopupVisible.value = false; 
    try { 
        const pId = data.projectId || (data.projectIds && data.projectIds.length > 0 ? data.projectIds[0] : null);
        await mainStore.updateOperation(id, { 
            amount: -Math.abs(data.amount), 
            projectId: pId,
            date: new Date(data.date) 
        }); 
        // 🟢 FIX: Убрана перезагрузка loadCalculationData
    } catch (e) { 
        alert('Ошибка сохранения списания: ' + e.message); 
    } 
};

const handleRetailClosure = async (payload) => {
    try {
        const pId = payload.projectId || (payload.projectIds && payload.projectIds.length > 0 ? payload.projectIds[0] : null);
        await mainStore.closeRetailDaily(payload.amount, new Date(payload.date), pId);
        // 🟢 FIX: Убрана перезагрузка loadCalculationData
    } catch (e) { alert('Ошибка: ' + e.message); }
};

const handleRetailDelete = async (op) => { 
    isRetailPopupVisible.value = false; 
    try { 
        await mainStore.deleteOperation(op); 
        // 🟢 FIX: Убрана перезагрузка loadCalculationData
    } catch (e) { alert('Ошибка удаления'); } 
};

const handleRefundSave = async ({ mode, id, data }) => { 
    isRefundPopupVisible.value = false; 
    try { 
        if (mode === 'create') await mainStore.createEvent(data); 
        else await mainStore.updateOperation(id, data); 
        // 🟢 FIX: Убрана перезагрузка loadCalculationData
    } catch (e) { alert('Ошибка сохранения возврата'); } 
};

const handleRefundDelete = async (op) => { 
    isRefundPopupVisible.value = false; 
    try { 
        await mainStore.deleteOperation(op); 
        // 🟢 FIX: Убрана перезагрузка loadCalculationData
    } catch (e) { alert('Ошибка удаления'); } 
};
</script>

<template>
  <div v-if="mainStore.isAuthLoading" class="loading-screen"><div class="spinner"></div><p>Проверка сессии...</p></div>
  <div v-else-if="!mainStore.user" class="login-screen"><div class="login-box"><h1>Управляйте финансами легко INDEX12.COM</h1><a :href="googleAuthUrl" class="google-login-button">Войти через Google</a><a v-if="isLocalhost" :href="devAuthUrl" class="dev-login-button">Тестовый вход (Localhost)</a></div></div>
  <div v-else class="home-layout" @click="closeAllMenus">
    <header class="home-header" ref="homeHeaderRef"><TheHeader /></header>
    <div class="header-resizer" ref="headerResizerRef"></div>
    <div class="home-body">
      <aside class="home-left-panel"><div class="nav-panel-wrapper" ref="navPanelWrapperRef"><NavigationPanel @change-view="onChangeView" /></div><div class="divider-placeholder"></div><YAxisPanel :yLabels="yAxisLabels" /></aside>
      <main class="home-main-content" ref="mainContentRef">
        <div class="timeline-grid-wrapper" ref="timelineGridRef" @dragover="onContainerDragOver" @dragleave="onContainerDragLeave"><div class="timeline-grid-content" ref="timelineGridContentRef"><DayColumn v-for="day in visibleDays" :key="day.id" :date="day.date" :isToday="day.isToday" :dayOfYear="day.dayOfYear" :dateKey="day.dateKey" @add-operation="(event, cellIndex) => openContextMenu(day, event, cellIndex)" @edit-operation="handleEditOperation" @drop-operation="handleOperationDrop" /></div></div>
        <div class="divider-wrapper"><div v-if="isScrollActive" class="custom-scrollbar-track" ref="customScrollbarTrackRef" @mousedown="onTrackClick"><div class="custom-scrollbar-thumb" :style="{ width: scrollbarThumbWidth + 'px', transform: `translateX(${scrollbarThumbX}px)` }" @mousedown.stop="onScrollThumbMouseDown" @touchstart.stop="onScrollThumbTouchStart"></div></div><div class="vertical-resizer" ref="resizerRef"></div></div>
        <div class="graph-area-wrapper" ref="graphAreaRef"><GraphRenderer v-if="visibleDays.length" :visibleDays="visibleDays" @update:yLabels="yAxisLabels = $event" class="graph-renderer-content" /><div class="summaries-container"></div></div>
      </main>
            <aside class="home-right-panel">
        <button
          class="icon-btn header-expand-btn"
          :class="{ 'active': mainStore.isHeaderExpanded }"
          @click="mainStore.toggleHeaderExpansion"
          :title="mainStore.isHeaderExpanded ? 'Свернуть хедер' : 'Показать все виджеты'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
        </button>

        <button class="icon-btn import-export-btn" @click="showImportModal = true" title="Импорт / Экспорт">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>

        <button class="icon-btn graph-btn" @click="showGraphModal = true" title="Графики">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
        </button>

        <button
          class="icon-btn ai-btn"
          :class="{ 'active': isAiDrawerOpen }"
          @click.stop="openAiDrawer"
          title="AI ассистент"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"></path>
              <path d="M5 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"></path>
            </svg>
        </button>

        <button class="icon-btn about-btn" @click="showAboutModal = true" title="О сервисе">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </button>

        <div class="user-profile-widget">
          <button class="user-profile-button" ref="userButtonRef" @click="toggleUserMenu">
            <img :src="mainStore.user.avatarUrl" alt="avatar" class="user-avatar" v-if="mainStore.user.avatarUrl" />
            <div class="user-avatar-placeholder" v-else>{{ mainStore.user.name ? mainStore.user.name[0].toUpperCase() : '?' }}</div>
            <span class="user-name">{{ mainStore.user.name }}</span>
          </button>
        </div>
      </aside>
    </div>
        <!-- AI ассистент (Desktop drawer) -->
    <div v-if="isAiDrawerOpen" class="ai-drawer-overlay" @click="closeAiDrawer">
      <div class="ai-drawer" @click.stop>
        <div class="ai-drawer-header">
          <div class="ai-drawer-title">AI ассистент</div>
          <button class="ai-drawer-close" @click="closeAiDrawer" title="Закрыть">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div v-if="false && aiPaywall" class="ai-paywall">
          <div class="ai-paywall-title">Функция платная</div>
          <div class="ai-paywall-text">{{ aiPaywallReason }}</div>
          <button class="ai-paywall-btn" disabled title="Скоро">Оплатить (скоро)</button>
          <button class="ai-paywall-link" @click="requestAiAccess">Запросить доступ</button>
        </div>

        <template v-else>
          <div class="ai-quick">
            <button class="ai-quick-btn" @click="useQuickPrompt('Что на счетах?')">Счета</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Счета включая скрытые')">Счета+скрытые</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Выведи список физлиц')">Список физлиц</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Выведи список контрагентов')">Список контрагентов</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Выведи список проектов')">Список проектов</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Выведи список категорий')">Список категорий</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Топ расходов за 30 дней')">Топ расход 30д</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Отчет за 30 дней')">Отчет 30д</button>

            <button class="ai-quick-btn" @click="useQuickPrompt('Проекты за 30 дней')">Проекты</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Контрагенты за 30 дней')">Контрагенты</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Категории за 30 дней')">Категории</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Налоги за 30 дней')">Налоги</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Переводы за 30 дней')">Переводы</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Выводы за 30 дней')">Выводы</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Физлица за 30 дней')">Физлица</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('Кредиты')">Кредиты</button>
          </div>

          <div class="ai-messages" ref="aiMessagesRef">
            <div v-for="msg in aiMessages" :key="msg.id" class="ai-message" :class="msg.role">
              <div class="ai-bubble">
                <div class="ai-text">{{ msg.text }}</div>
                <div class="ai-actions" v-if="msg.role === 'assistant'">
                  <button class="ai-copy-btn" @click="copyAiText(msg)">{{ msg.copied ? '✅' : 'Копировать' }}</button>
                </div>
              </div>
            </div>

            <div v-if="aiLoading" class="ai-typing">Думаю...</div>
          </div>

          <div class="ai-input-row">
            <input
              ref="aiInputRef"
              v-model="aiInput"
              class="ai-input"
              placeholder="Спроси: что на счетах? (Enter — отправить)"
              @keydown.enter.prevent="sendAiMessage"
            />

            <button
              class="ai-mic-btn"
              :class="{ recording: isAiRecording }"
              :disabled="aiLoading || !aiSpeechSupported"
              @click="toggleAiRecording"
              :title="aiSpeechSupported ? (isAiRecording ? 'Остановить запись' : 'Голосовой ввод') : 'Голосовой ввод не поддерживается'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
                <path d="M19 11a7 7 0 0 1-14 0" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>

            <button
              class="ai-send-btn"
              :disabled="aiLoading || !(aiInput || '').trim()"
              @click="sendAiMessage"
              title="Отправить"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>

          <div class="ai-hint">Только чтение данных. Ответ короткий, удобный для WhatsApp.</div>
        </template>
      </div>
    </div>

    <CellContextMenu v-if="isContextMenuVisible" :style="contextMenuPosition" @select="handleContextMenuSelect" />
    <div v-if="showUserMenu" class="user-menu" :style="userMenuPosition" @click.stop ><button class="user-menu-item" disabled title="В разработке">Настройки</button><button class="user-menu-item" @click="handleLogout">Выйти</button></div>
    
    <!-- 🟢 FIX: Передаем $event (объект операции) в обработчик удаления, так как переменная operationToEdit может быть уже очищена событием close -->
    <IncomePopup 
        v-if="isIncomePopupVisible" 
        :date="selectedDay ? selectedDay.date : new Date()" 
        :cellIndex="selectedDay ? selectedCellIndex : 0" 
        :operation-to-edit="operationToEdit" 
        :min-allowed-date="minDateFromProjection" 
        :max-allowed-date="maxDateFromProjection" 
        @close="handleClosePopup" 
        @save="handleOperationSave"
        @operation-deleted="handleOperationDelete($event)"
        @trigger-prepayment="handleSwitchToPrepayment"
        @trigger-smart-deal="handleSwitchToSmartDeal"
    />

    <ExpensePopup 
        v-if="isExpensePopupVisible" 
        :date="selectedDay ? selectedDay.date : new Date()" 
        :cellIndex="selectedDay ? selectedCellIndex : 0" 
        :operation-to-edit="operationToEdit" 
        :min-allowed-date="minDateFromProjection" 
        :max-allowed-date="maxDateFromProjection"
        @close="handleClosePopup" 
        @save="handleOperationSave"
        @operation-deleted="handleOperationDelete($event)"
    />

    <!-- 🟢 PREPAYMENT MODAL -->
    <PrepaymentModal 
       v-if="isPrepaymentModalVisible" 
       :initialData="prepaymentData" 
       :dateKey="prepaymentDateKey" 
       @close="isPrepaymentModalVisible = false" 
       @save="handlePrepaymentSave" 
    />

    <!-- 🟢 SMART DEAL CONFIRM -->
    <SmartDealPopup 
       v-if="isSmartDealPopupVisible"
       :deal-status="smartDealStatus"
       :current-amount="smartDealPayload?.amount || 0"
       :project-name="smartDealPayload?.projectName || 'Проект'"
       :contractor-name="smartDealPayload?.contractorName || 'Контрагент'"
       :category-name="smartDealPayload?.categoryName || 'Категория'"
       @close="handleSmartDealCancel"
       @confirm="handleSmartDealConfirm"
    />

    <!-- 🟢 TAX DETAILS POPUP -->
    <TaxPaymentDetailsPopup 
       v-if="isTaxDetailsPopupVisible"
       :operation-to-edit="operationToEdit"
       @close="isTaxDetailsPopupVisible = false"
       @delete="handleTaxDelete"
    />

    <TransferPopup v-if="isTransferPopupVisible" :date="selectedDay ? selectedDay.date : new Date()" :cellIndex="selectedDay ? selectedCellIndex : 0" :transferToEdit="operationToEdit" :min-allowed-date="minDateFromProjection" :max-allowed-date="maxDateFromProjection" @close="handleCloseTransferPopup" @save="handleTransferSave" />
    <WithdrawalPopup v-if="isWithdrawalPopupVisible" :initial-data="{ amount: 0 }" :operation-to-edit="operationToEdit" @close="handleCloseWithdrawalPopup" @save="handleWithdrawalSave" />
    <RetailClosurePopup v-if="isRetailPopupVisible" :operation-to-edit="operationToEdit" @close="isRetailPopupVisible = false" @confirm="handleRetailClosure" @save="handleRetailSave" @delete="handleRetailDelete" />
    <RefundPopup v-if="isRefundPopupVisible" :operation-to-edit="operationToEdit" @close="isRefundPopupVisible = false" @save="handleRefundSave" @delete="handleRefundDelete" />

    <ImportExportModal v-if="showImportModal" @close="showImportModal = false" @import-complete="handleImportComplete" />
    <GraphModal v-if="showGraphModal" @close="showGraphModal = false" />
    <AboutModal v-if="showAboutModal" @close="showAboutModal = false" />
  </div>
</template>

<style scoped>
/* (Стили без изменений) */
.loading-screen { width: 100vw; height: 100vh; height: 100dvh; display: flex; align-items: center; justify-content: center; flex-direction: column; background-color: var(--color-background); color: var(--color-text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.spinner { width: 40px; height: 40px; border: 4px solid var(--color-border); border-top-color: var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px; }
@keyframes spin { to { transform: rotate(360deg); } }
.login-screen { width: 100vw; height: 100vh; height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 1rem; box-sizing: border-box; background-color: var(--color-background); }
.login-box { width: 100%; max-width: 500px; padding: 2.5rem 2rem; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 12px; text-align: center; box-shadow: 0 10px 30px rgba(0, 0, 0, 0. 3); }
.login-box h1 { color: var(--color-heading); font-size: 1.75rem; font-weight: 600; line-height: 1.3; margin-bottom: 1rem; }
.login-box p { color: var(--color-text); font-size: 1rem; line-height: 1.5; opacity: 0.8; margin-bottom: 2.5rem; }
.google-login-button { display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; background-color: #ffffff; color: #333333; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; font-weight: 600; text-decoration: none; cursor: pointer; transition: background-color 0.2s, box-shadow 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05); width: 100%; box-sizing: border-box; }
.google-login-button:hover { background-color: #f9f9f9; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
.dev-login-button { display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; background-color: #333; color: #fff; border: 1px solid #555; border-radius: 8px; font-size: 1rem; font-weight: 600; text-decoration: none; cursor: pointer; transition: background-color 0.2s; margin-top: 10px; width: 100%; box-sizing: border-box; }
.dev-login-button:hover { background-color: #444; }
.user-profile-widget { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px; }
.user-profile-button { display: flex; align-items: center; width: 100%; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 8px; padding: 6px; cursor: pointer; transition: background-color 0.2s, border-color 0.2s; color: var(--color-text); text-align: left; }
.user-profile-button:hover { background-color: var(--color-background-mute); border-color: var(--color-border-hover); }
.user-avatar { width: 28px; height: 28px; border-radius: 50%; right: 0px; object-fit: cover; border: 1px solid var(--color-border); }
.user-avatar-placeholder { width: 28px; height: 28px; border-radius: 50%; margin-right: 8px; background-color: var(--color-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
.user-name { flex-grow: 1; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.user-menu { position: fixed; width: 180px; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); z-index: 2000; overflow: hidden; }
.user-menu-item { display: block; width: 100%; padding: 10px 12px; background: none; border: none; border-bottom: 1px solid var(--color-border); color: var(--color-text); cursor: pointer; text-align: left; font-size: 14px; }
.user-menu-item:last-child { border-bottom: none; }
.user-menu-item:hover { background-color: var(--color-background-mute); }
.user-menu-item:disabled { color: var(--color-text-mute); cursor: not-allowed; background: none; }
.home-layout { display: flex; flex-direction: column; height: 100vh; height: 100dvh; width: 100%; overflow: hidden; background-color: var(--color-background); }
.home-header { flex-shrink: 0; z-index: 100; background-color: var(--color-background); display: flex; height: 130px; transition: height 0.3s ease; }
.header-resizer { flex-shrink: 0; height: 15px; background: var(--color-background-soft); border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); cursor: row-resize; position: relative; z-index: 50; display: flex; align-items: center; justify-content: center; }
.header-resizer:hover { border-top: 1px solid #777; }
.header-resizer::before { content: ''; display: block; width: 10px; height: 10px; background-color: #ffffff; border-radius: 50%; border: 1px solid var(--color-border); opacity: 0.5; transition: opacity 0.2s, transform 0.2s; box-shadow: 0 0 5px rgba(0,0,0,0.3); }
.header-resizer:hover::before { opacity: 1; transform: scale(1.2); }
.home-body { display: flex; flex-grow: 1; overflow: hidden; min-height: 0; }
.home-left-panel { width: 60px; flex-shrink: 0; overflow: hidden; display: flex; flex-direction: column; }
.home-right-panel { width: 60px; flex-shrink: 0; overflow-y: auto; background-color: var(--color-background-soft); border-left: 1px solid var(--color-border); scrollbar-width: none; -ms-overflow-style: none; position: relative; }
.home-right-panel::-webkit-scrollbar { display: none; }

.header-expand-btn { position: absolute; top: 8px; right: 15px; z-index: 20; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-text); padding: 0; transition: background-color 0.2s, border-color 0.2s, color 0.2s; }
.header-expand-btn:hover { background: var(--color-background-mute); border-color: var(--color-border-hover); }
.header-expand-btn.active { color: var(--color-primary); border-color: var(--color-primary); background: rgba(52, 199, 89, 0.1); }
.header-expand-btn svg { width: 18px; height: 18px; stroke: currentColor; }

.import-export-btn { position: absolute; top: 48px; right: 15px; z-index: 20; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-text); padding: 0; transition: background-color 0.2s, border-color 0.2s; }
.import-export-btn:hover { background: var(--color-background-mute); border-color: var(--color-border-hover); }
.import-export-btn svg { width: 18px; height: 18px; stroke: currentColor; }

.graph-btn { position: absolute; top: 88px; right: 15px; z-index: 20; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-text); padding: 0; transition: background-color 0.2s, border-color 0.2s; }
.graph-btn:hover { background: var(--color-background-mute); border-color: var(--color-border-hover); }
.graph-btn svg { width: 18px; height: 18px; stroke: currentColor; }

.ai-btn { position: absolute; top: 128px; right: 15px; z-index: 20; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-text); padding: 0; transition: background-color 0.2s, border-color 0.2s, color 0.2s; }
.ai-btn:hover { background: var(--color-background-mute); border-color: var(--color-border-hover); }
.ai-btn.active { color: var(--color-primary); border-color: var(--color-primary); background: rgba(52, 199, 89, 0.1); }
.ai-btn svg { width: 18px; height: 18px; stroke: currentColor; }

.about-btn { position: absolute; bottom: 64px; right: 0px; transform: translateX(-50%); z-index: 20; background: var(--color-primary); border: 1px solid var(--color-primary); color: #ffffff; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.2s; box-shadow: 0 4px 10px rgba(52, 199, 89, 0.4); }
.about-btn:hover { background: #28a745; border-color: #28a745; transform: translateX(-50%) scale(1.1); }
.about-btn svg { width: 18px; height: 18px; stroke: currentColor; }
.home-main-content { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; }
.timeline-grid-wrapper { height: 318px; flex-shrink: 0; overflow-x: hidden; overflow-y: auto; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); scrollbar-width: none; -ms-overflow-style: none; overscroll-behavior-x: none; touch-action: pan-y; }
.timeline-grid-wrapper::-webkit-scrollbar { display: none; }
.timeline-grid-content { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); width: 100%; }
.divider-wrapper { flex-shrink: 0; height: 15px; width: 100%; background-color: var(--color-background-soft); border-bottom: 1px solid var(--color-border); position: relative; display: flex; align-items: center; }
.custom-scrollbar-track { position: absolute; left: 0; top: 0; width: 100%; height: 100%; background-color: #2a2a2a; cursor: pointer; z-index: 10; }
.custom-scrollbar-thumb { position: absolute; top: 2px; bottom: 2px; background-color: #555; border-radius: 6px; cursor: grab; }
.custom-scrollbar-thumb:active { background-color: #777; cursor: grabbing; }
.vertical-resizer { position: absolute; top: -5px; left: 50%; transform: translateX(-50%); width: 40px; height: 25px; cursor: row-resize; z-index: 20; display: flex; align-items: center; justify-content: center; }
.vertical-resizer::before { content: ''; display: block; width: 10px; height: 10px; background-color: #ffffff; border-radius: 50%; border: 1px solid var(--color-border); opacity: 0.5; transition: opacity 0.2s, transform 0.2s; box-shadow: 0 0 5px rgba(0,0,0,0.3); }
.vertical-resizer:hover::before { opacity: 1; transform: scale(1.2); }
.graph-area-wrapper { flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.graph-renderer-content { flex-grow: 1; }
.summaries-container { flex-shrink: 0; }
.nav-panel-wrapper { height: 318px; flex-shrink: 0; overflow: hidden; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
.divider-placeholder { flex-shrink: 0; height: 15px; background-color: var(--color-background-soft); border-bottom: 1px solid var(--color-border); }
/* --- AI Drawer (Desktop) --- */
.ai-drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.25); z-index: 2600; display: flex; justify-content: flex-end; }
.ai-drawer { width: 420px; max-width: calc(100vw - 20px); height: 100%; background: var(--color-background); border-left: 1px solid var(--color-border); box-shadow: -10px 0 30px rgba(0,0,0,0.25); display: flex; flex-direction: column; }
.ai-drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px; border-bottom: 1px solid var(--color-border); background: var(--color-background-soft); }
.ai-drawer-title { font-weight: 700; font-size: 14px; color: var(--color-heading); }
.ai-drawer-close { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-background-soft); color: var(--color-text); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background-color 0.2s, border-color 0.2s; }
.ai-drawer-close:hover { background: var(--color-background-mute); border-color: var(--color-border-hover); }

.ai-quick { padding: 10px 12px; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--color-border);  overflow: auto; }
.ai-quick-btn { padding: 6px 9px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-background-soft); color: var(--color-text); cursor: pointer; font-size: 12px; line-height: 1; }
.ai-quick-btn:hover { background: var(--color-background-mute); border-color: var(--color-border-hover); }

.ai-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.ai-message { display: flex; }
.ai-message.user { justify-content: flex-end; }
.ai-message.assistant { justify-content: flex-start; }
.ai-bubble { max-width: 90%; border: 1px solid var(--color-border); background: var(--color-background-soft); border-radius: 14px; padding: 10px 10px; }
.ai-message.user .ai-bubble { background: rgba(52, 199, 89, 0.10); border-color: rgba(52, 199, 89, 0.35); }
.ai-text { white-space: pre-wrap; font-size: 13px; line-height: 1.35; color: var(--color-text); }
.ai-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
.ai-copy-btn { border: 1px solid var(--color-border); background: var(--color-background); color: var(--color-text); border-radius: 10px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
.ai-copy-btn:hover { background: var(--color-background-mute); border-color: var(--color-border-hover); }

.ai-typing { color: var(--color-text-mute); font-size: 12px; padding: 4px 0 0 2px; }

.ai-input-row { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--color-border); background: var(--color-background-soft); }
.ai-input { flex: 1; height: 36px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-background); color: var(--color-text); padding: 0 10px; outline: none; }
.ai-input:focus { border-color: var(--color-border-hover); }
.ai-send-btn {
  width: 40px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #ffffff;
  cursor: pointer;
 
  place-items: center;
  transition: background-color 0.2s, border-color 0.2s, transform 0.08s;
}
.ai-send-btn:hover {
  background: #28a745;
  border-color: #28a745;
}
.ai-send-btn:active {
  transform: scale(0.98);
}
.ai-send-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: var(--color-background-mute);
  border-color: var(--color-border);
  color: var(--color-text-mute);
  transform: none;
}

.ai-mic-btn {
  width: 40px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  
  place-items: center;
  transition: background-color 0.2s, border-color 0.2s, transform 0.08s;
}
.ai-mic-btn:hover {
  background: var(--color-background-mute);
  border-color: var(--color-border-hover);
}
.ai-mic-btn:active {
  transform: scale(0.98);
}
.ai-mic-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ai-mic-btn.recording {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: rgba(52, 199, 89, 0.10);
  animation: aiPulse 1.1s ease-in-out infinite;
}
@keyframes aiPulse {
  0% { box-shadow: 0 0 0 rgba(52, 199, 89, 0.0); }
  50% { box-shadow: 0 0 14px rgba(52, 199, 89, 0.35); }
  100% { box-shadow: 0 0 0 rgba(52, 199, 89, 0.0); }
}

.ai-send-btn svg,
.ai-mic-btn svg {
  width: 18px;
  height: 18px;
  display: block;
  flex: none;
  min-width: 18px;
  min-height: 18px;
}

.ai-send-btn svg * ,
.ai-mic-btn svg * {
  vector-effect: non-scaling-stroke;
}

.ai-hint { padding: 0 12px 12px; font-size: 11px; color: var(--color-text-mute); background: var(--color-background-soft); }

.ai-paywall { padding: 14px 12px; }
.ai-paywall-title { font-weight: 800; font-size: 14px; color: var(--color-heading); margin-bottom: 6px; }
.ai-paywall-text { font-size: 12px; color: var(--color-text); opacity: 0.85; margin-bottom: 10px; }
.ai-paywall-btn { width: 100%; height: 38px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-background-mute); color: var(--color-text-mute); cursor: not-allowed; margin-bottom: 8px; }
.ai-paywall-link { width: 100%; height: 38px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-background-soft); color: var(--color-text); cursor: pointer; }
.ai-paywall-link:hover { background: var(--color-background-mute); border-color: var(--color-border-hover); }

</style>