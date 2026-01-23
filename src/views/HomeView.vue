<script setup>
import { onMounted, onBeforeUnmount, ref, computed, nextTick, watch } from 'vue';
import axios from 'axios';
import html2canvas from 'html2canvas';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';


// Компоненты
import IncomePopup from '@/components/IncomePopup.vue'; 
import ExpensePopup from '@/components/ExpensePopup.vue'; 
import TransferPopup from '@/components/TransferPopup.vue';

import TheHeader from '@/components/TheHeader.vue';
import CellContextMenu from '@/components/CellContextMenu.vue';
import DayColumn from '@/components/DayColumn.vue';
import TimelineSwitcher from '@/components/TimelineSwitcher.vue';
import GraphRenderer from '@/components/GraphRenderer.vue';
import YAxisPanel from '@/components/YAxisPanel.vue';
import ImportExportModal from '@/components/ImportExportModal.vue';
import GraphModal from '@/components/GraphModal.vue';
import AboutModal from '@/components/AboutModal.vue';

import RetailClosurePopup from '@/components/RetailClosurePopup.vue'; 
import RefundPopup from '@/components/RefundPopup.vue'; 

// 🟢 2. Импорт модала приглашения сотрудников
import InviteEmployeeModal from '@/components/InviteEmployeeModal.vue';
// 🟢 3. Импорт универсального модала редактирования
import UniversalEditModal from '@/components/UniversalEditModal.vue';
import WorkspaceDashboardModal from '@/components/WorkspaceDashboardModal.vue';
import PaymentReceiptModal from '@/components/PaymentReceiptModal.vue';

('--- HomeView.vue v52.1 (Delete Fix) Loaded ---'); 

const mainStore = useMainStore();

// --- CONSTANTS ---
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// ВАЖНО: в проде не должно падать на localhost.
// Если VITE_API_BASE_URL не задан — идем на тот же домен: https://<site>/api
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (isLocalhost ? 'http://localhost:3000/api' : `${window.location.origin}/api`);

const baseUrlCalculated = API_BASE_URL.replace(/\/api$/, '');
const googleAuthUrl = `${baseUrlCalculated}/auth/google`;
const devAuthUrl = `${baseUrlCalculated}/auth/dev-login`;

// Состояния модальных окон
const showImportModal = ref(false); 
const showGraphModal = ref(false);
const showUniversalEditModal = ref(false);
const showAboutModal = ref(false);

const showWorkspaceModal = ref(false); // 🟢 NEW: Unified workspace/project modal
const showReceiptModal = ref(false);   // 🟢 NEW: Payment receipt generator

// --- AI ассистент (Desktop MVP, read-only) ---
const isAiDrawerOpen = ref(false);
// Период управляется через перелистывание месяцев, без отдельного окна выбора
const selectedMonthStart = ref(null);

const monthTransitioning = ref(false);
const triggerMonthAnimation = () => {
  monthTransitioning.value = true;
  setTimeout(() => { monthTransitioning.value = false; }, 350);
};

const setMonthRange = async (baseDate) => {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  selectedMonthStart.value = start;
  mainStore.setPeriodFilter({
    mode: 'custom',
    customStart: start.toISOString(),
    customEnd: end.toISOString()
  });
  mainStore.setProjectionRange(start, end);
  await mainStore.fetchOperationsRange(start, end);
  scrollToMonthCenter(baseDate);
  triggerMonthAnimation();
};

const goPrevMonth = async () => {
  const base = selectedMonthStart.value || new Date();
  const prev = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  await setMonthRange(prev);
};

const goNextMonth = async () => {
  const base = selectedMonthStart.value || new Date();
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  await setMonthRange(next);
};

const prevMonthLabel = computed(() => {
  const base = selectedMonthStart.value || new Date();
  const prev = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  return prev.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
});

const nextMonthLabel = computed(() => {
  const base = selectedMonthStart.value || new Date();
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return next.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
});

// 🟢 Loading state for timeline and graphs
const isDataLoading = computed(() => {
  // Show loader if no visible days yet or auth is loading
  if (mainStore.isAuthLoading) return true;
  if (!visibleDays.value || visibleDays.value.length === 0) return true;
  return false;
});
const aiInput = ref('');
const aiMessages = ref([]); // { id, role: 'user'|'assistant', text, copied? }
const aiLoading = ref(false);
const aiPaywall = ref(false);
const aiPaywallReason = ref('AI ассистент доступен по подписке.');
const aiMessagesRef = ref(null);
const aiInputRef = ref(null);

// --- Theme management ---
const currentTheme = ref(localStorage.getItem('theme') || 'dark');

const toggleTheme = () => {
  currentTheme.value = currentTheme.value === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme.value);
  localStorage.setItem('theme', currentTheme.value);
};

// UI snapshot source (screen = truth)
const theHeaderRef = ref(null);

// --- Desktop UI snapshot builder (must NOT depend on collapsed/expanded DOM) ---
const _isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

const _pickName = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  return v?.name || v?.title || v?.label || v?.displayName || null;
};

// Resolve entity name: try populated object first, then lookup by ID in store
const _resolveEntityName = (idOrObj, storeList) => {
  // If it's already an object with a name, return it
  const directName = _pickName(idOrObj);
  if (directName && typeof idOrObj === 'object') return directName;
  
  // If it's a string ID, find in store
  if (!idOrObj || !storeList) return null;
  const idStr = typeof idOrObj === 'object' ? (idOrObj._id || idOrObj.id) : idOrObj;
  if (!idStr) return null;
  
  const found = storeList.find(e => e && (String(e._id) === String(idStr) || String(e.id) === String(idStr)));
  return found?.name || found?.title || null;
};

const _normalizeOp = (op) => {
  if (!op || typeof op !== 'object') return null;
  const amount = (typeof op.amount === 'number') ? op.amount : (typeof op.sum === 'number' ? op.sum : null);
  const date = op.date ? new Date(op.date) : null;
  const dateIso = (date && !isNaN(date.getTime())) ? date.toISOString().slice(0, 10) : null;

  return {
    id: op._id || op.id || null,
    type: op.type || (op.isTransfer ? 'transfer' : (op.isWithdrawal ? 'withdrawal' : null)),
    amount,
    currency: op.currency || 'KZT',
    dateKey: op.dateKey || null,
    date: dateIso,
    cellIndex: (op.cellIndex ?? null),
    account: _resolveEntityName(op.accountId, mainStore?.accounts) || _pickName(op.account) || _pickName(op.accountName) || null,
    project: _resolveEntityName(op.projectId, mainStore?.projects) || _pickName(op.project) || _pickName(op.projectName) || null,
    contractor: _resolveEntityName(op.contractorId, mainStore?.contractors) || _pickName(op.contractor) || _pickName(op.contractorName) || null,
    category: _resolveEntityName(op.categoryId, mainStore?.categories) || _pickName(op.category) || _pickName(op.categoryName) || null,
    company: _resolveEntityName(op.companyId, mainStore?.companies) || _pickName(op.company) || _pickName(op.companyName) || null,
    isTransfer: !!(op.isTransfer || op.type === 'transfer'),
    isWithdrawal: !!(op.isWithdrawal),
    isRefund: !!(op.isRefund),
    isPrepayment: !!(op.isPrepayment),
  };
};

const _getOpsForDateKeyBestEffort = (dateKey) => {
  if (!dateKey) return [];

  // ✅ PRIORITY 1: Use mainStore.getOperationsForDay which has proper filtering (!isDeleted)
  if (typeof mainStore?.getOperationsForDay === 'function') {
    try {
      const ops = mainStore.getOperationsForDay(dateKey);
      if (Array.isArray(ops) && ops.length > 0) return ops;
    } catch (e) {}
  }

  // ✅ PRIORITY 2: Direct access to displayCache with manual filtering
  const directCache = mainStore?.displayCache?.value?.[dateKey] || mainStore?.displayCache?.[dateKey];
  if (Array.isArray(directCache)) {
    // Apply same filters as getOperationsForDay
    return directCache.filter(op => op && !op.isDeleted);
  }

  // Legacy / alternative locations (older store versions) - also filter
  const candidates = [
    mainStore?.operationsByDateKey?.[dateKey],
    mainStore?.opsByDateKey?.[dateKey],
    mainStore?.operationsByDayKey?.[dateKey],
    mainStore?.dayOperations?.[dateKey],
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.filter(op => op && !op.isDeleted);
    }
    if (c && Array.isArray(c.operations)) {
      return c.operations.filter(op => op && !op.isDeleted);
    }
    if (c && Array.isArray(c.items)) {
      return c.items.filter(op => op && !op.isDeleted);
    }
  }

  // As a last resort, try a getter function if it exists.
  const getter = mainStore?.getOperationsForDateKey || mainStore?.getOpsForDateKey;
  if (typeof getter === 'function') {
    try {
      const res = getter.call(mainStore, dateKey);
      if (Array.isArray(res)) return res.filter(op => op && !op.isDeleted);
      if (res && Array.isArray(res.operations)) return res.operations.filter(op => op && !op.isDeleted);
    } catch (e) {}
  }

  return [];
};

const buildDesktopUiSnapshot = () => {
  // 1) Header snapshot (what user sees) — best effort
  const headerSnap = theHeaderRef.value?.getSnapshot?.() || null;

  // 2) Store widgets snapshot (MUST NOT override headerSnap.widgets used by quick buttons)
  const storeWidgets = Array.isArray(mainStore?.allWidgets)
    ? mainStore.allWidgets.map(w => ({
        key: w?.key || w?.id || w?.name || w?.title || null,
        title: w?.title || w?.name || null,
        fact: (typeof w?.fact === 'number') ? w.fact : (typeof w?.factValue === 'number' ? w.factValue : null),
        forecast: (typeof w?.forecast === 'number') ? w.forecast : (typeof w?.forecastValue === 'number' ? w.forecastValue : null),
      }))
    : null;

  // 3) Timeline snapshot
  // ВАЖНО: не зависим от DOM (свернут/развернут хедер). Берём операции из mainStore.displayCache.
  // Это даёт AI доступ к истории/будущему в рамках текущего диапазона проекции.

  // (a) Visible columns meta (what user is currently looking at)
  const daysVisible = Array.isArray(visibleDays.value)
    ? visibleDays.value
        .map(d => ({
          dateKey: d?.dateKey || null,
          date: (d?.date instanceof Date) ? d.date.toISOString().slice(0, 10) : null,
          isToday: !!d?.isToday,
        }))
        .filter(x => x.dateKey)
    : [];

  // (b) ALL operations from store (not just visible days)
  // 🔥 FIX: Use allKnownOperations instead of displayCache to ensure AI has complete data
  const allOps = Array.isArray(mainStore?.allKnownOperations)
    ? mainStore.allKnownOperations
    : [];

  // Safety cap: keep payload reasonable
  const MAX_OPS = 2000;
  const truncated = allOps.length > MAX_OPS;
  const opsToInclude = allOps.slice(0, MAX_OPS);
  
  // Group by date for timeline structure
  const opsByDay = {};
  for (const op of opsToInclude) {
    if (!op || op.isDeleted) continue;
    const normalized = _normalizeOp(op);
    if (!normalized) continue;

    const dateKey = op.dateKey || op.date || '';
    if (!dateKey) continue;

    if (!opsByDay[dateKey]) opsByDay[dateKey] = [];
    opsByDay[dateKey].push(normalized);
  }

  const cacheDateKeys = Object.keys(opsByDay);

  // Backward-compatible: keep `days` key name used elsewhere
  const days = daysVisible;

  const extra = {
    _source: 'desktop',
    headerExpanded: !!mainStore?.isHeaderExpanded,
    viewMode: viewMode.value,
    projection: {
      rangeStartDate: mainStore?.projection?.rangeStartDate || null,
      rangeEndDate: mainStore?.projection?.rangeEndDate || null,
    },
    storeWidgets,
    storeTimeline: {
      daysVisible: days,
      cachedDaysCount: cacheDateKeys.length,
      opsByDay,
      opsCount: opsToInclude.length,
      truncated,
      note: 'ops taken from mainStore.allKnownOperations (ALL operations), ensuring AI has complete data',
    },
  };

  // Keep backward compatibility: if header snapshot is a plain object, merge into it.
  if (_isPlainObject(headerSnap)) return { ...headerSnap, ...extra };
  return { header: headerSnap, ...extra };
};


// --- AI voice input (Browser SpeechRecognition MVP) ---
const aiSpeechSupported = ref(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
const isAiRecording = ref(false);
let aiRecognition = null;
let aiVoiceConfirmedText = ''; // Store confirmed voice text at module level

const _ensureAiRecognition = () => {
  if (aiRecognition) return aiRecognition;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  const r = new SR();
  r.lang = 'ru-RU';
  r.interimResults = true; // Enable interim results for real-time text display
  r.continuous = true; // Enable continuous mode to prevent 5-second timeout

  r.onresult = (event) => {
    // CRITICAL: Don't update input if we're not recording anymore (prevents race condition)
    if (!isAiRecording.value) return;
    
    let interimText = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const transcript = (res[0]?.transcript || '').trim();
      
      if (res.isFinal) {
        // Add confirmed text
        aiVoiceConfirmedText = (aiVoiceConfirmedText + ' ' + transcript).trim();
      } else {
        // Collect interim text
        interimText = transcript;
      }
    }
    
    // Show confirmed text + interim text in input
    aiInput.value = (aiVoiceConfirmedText + (interimText ? ' ' + interimText : '')).trim();
  };

  r.onend = () => {
    isAiRecording.value = false;
    aiVoiceConfirmedText = ''; // Reset for next recording
    // Focus input field so user can edit the recognized text
    nextTick(() => aiInputRef.value?.focus?.());
  };

  r.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    isAiRecording.value = false;
    aiVoiceConfirmedText = '';
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

// Auto-resize textarea based on content
watch(
  () => aiInput.value,
  async () => {
    await nextTick();
    const textarea = aiInputRef.value;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }
);

const closeAiDrawer = () => {
  isAiDrawerOpen.value = false;
};


const useQuickPrompt = (promptText) => {
  aiInput.value = promptText;
  nextTick(() => {
    sendAiMessage(); // Automatically send the message
  });
};

// Минимальный контекст для backend (read-only). Нужен, чтобы backend мог понимать период/режим и (опционально) баланс.
const buildAiContext = (store, { viewMode, today, ui } = {}) => {
  const safeIso = (d) => {
    if (!d) return null;
    try {
      if (d instanceof Date) return d.toISOString();
      if (typeof d === 'string') return d;
    } catch (e) {}
    return null;
  };

  const proj = store?.projection || {};
  const accounts = Array.isArray(store?.accounts) ? store.accounts : [];

  // Балансы — best-effort. Если в объекте счета нет balance/currentBalance, отправим null.
  const balances = accounts
    .map(a => ({
      id: a?._id || null,
      name: a?.name || a?.title || a?.bankName || a?.label || 'Счет',
      excluded: !!(a?.isExcluded ?? a?.excluded ?? a?.hidden ?? a?.isHidden),
      balance:
        (typeof a?.balance === 'number') ? a.balance :
        (typeof a?.currentBalance === 'number') ? a.currentBalance :
        null,
    }))
    .filter(x => x.id);

  return {
    meta: {
      viewMode: viewMode || null,
      today: safeIso(today) || null,
      projection: {
        rangeStartDate: proj?.rangeStartDate || null,
        rangeEndDate: proj?.rangeEndDate || null,
      },
    },
    ui: ui || null,
    balances: { accounts: balances },
  };
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

const handleAiInputKeydown = (event) => {
  // Shift+Enter: allow new line (default behavior)
  if (event.shiftKey) {
    return; // Let the default behavior add a new line
  }
  
  // Enter without Shift: send message
  event.preventDefault();
  sendAiMessage();
};

const sendAiMessage = async () => {
  stopAiRecordingIfNeeded();
  const text = (aiInput.value || '').trim();
  if (!text || aiLoading.value) return;

  aiMessages.value.push(_makeAiMsg('user', text));
  nextTick(scrollAiToBottom);
  aiInput.value = '';
  aiVoiceConfirmedText = ''; // Reset voice confirmed text
  aiLoading.value = true;

  try {
    // Контекст периода (read-only)
    // Контекст периода (read-only)
    // Важно: отправляем локальную дату/время пользователя (с offset), а не UTC.
    // Иначе около полуночи UTC может увести «сегодня» на вчера.
    const _localIsoNow = () => {
      const d = new Date();
      const pad2 = (n) => String(n).padStart(2, '0');
      const ms = String(d.getMilliseconds()).padStart(3, '0');
      const tzMin = -d.getTimezoneOffset(); // minutes east of UTC
      const sign = tzMin >= 0 ? '+' : '-';
      const hh = pad2(Math.floor(Math.abs(tzMin) / 60));
      const mm = pad2(Math.abs(tzMin) % 60);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${ms}${sign}${hh}:${mm}`;
    };

    const asOf = _localIsoNow();

    // Определяем, нужно ли включать скрытые счета по смыслу запроса.
    // (Чтобы пользователь не зависел от UI-тумблера и не гадал про «скрытые счета».)
    const wantsAccounts = /\b(сч[её]т|счета|касс[аы])\b/i.test(text);
    const wantsHidden = /\bскрыт(ые|ый|ая|ое|о|ых)?\b/i.test(text);
    const includeHidden = wantsAccounts || wantsHidden;

    // Если hidden не нужен — отправляем только видимые (не excluded/hidden) id.
    // Если нужен — отправляем null, чтобы билдер включил все.
    const visibleAccountIds = includeHidden
      ? null
      : (Array.isArray(mainStore?.accounts)
          ? mainStore.accounts
              .filter(a => {
                const excluded = !!(a?.isExcluded ?? a?.excluded ?? a?.hidden ?? a?.isHidden);
                return !excluded;
              })
              .map(a => a?._id)
              .filter(Boolean)
          : null);

    // 🔥 REMOVED: Frontend prefetch no longer needed!
    // Backend now queries MongoDB directly via dataProvider.buildDataPacket()
    // This gives AI access to full historical data without frontend limitations.

    // 🔥 SIMPLIFIED: No more uiSnapshot/aiContext - backend now queries database directly!
    // This reduces HTTP payload by ~90% and eliminates race conditions with displayCache.

    const res = await axios.post(
      `${API_BASE_URL}/ai/query`,
      {
        message: text,
        asOf,
        includeHidden,
        visibleAccountIds,
        debugAi: true, // временно включено для отладки
      },
      {
        // ВАЖНО: без withCredentials куки сессии (auth) могут не уйти на другой домен/поддомен.
        withCredentials: true,
        timeout: 20000,
      }
    );
    const rawAnswer = (res?.data?.text || '').trim() || 'Нет ответа.';

    // Нормализация вывода: иногда год «2026» разбивается как «2 026» из-за форматирования чисел.
    // Приводим даты к виду DD.MM.YY.
    const normalizeAiText = (s) => {
      if (!s) return s;
      let out = String(s);
      // Склеиваем разорванный год: "01.01.2 026" -> "01.01.2026"
      out = out.replace(/(\b\d{2}\.\d{2}\.)\s*(\d)\s+(\d{3}\b)/g, '$1$2$3');
      // Убираем пробел после точки перед годом: "01.01. 2026" -> "01.01.2026"
      out = out.replace(/(\b\d{2}\.\d{2}\.)\s*(\d{4}\b)/g, '$1$2');
      // Сокращаем год: "01.01.2026" -> "01.01.26"
      out = out.replace(/(\b\d{2}\.\d{2}\.)\s*(\d{4}\b)/g, (m, p1, y) => `${p1}${String(y).slice(2)}`);
      return out;
    };

    const answer = normalizeAiText(rawAnswer);
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

    console.error('AI Desktop error:', {
      message: err?.message,
      status: err?.response?.status,
      data: err?.response?.data,
    });

    const serverText = (err?.response?.data?.text || err?.response?.data?.message || '').toString().trim();
    const clientText = (err?.message || '').toString().trim();
    const statusLabel = err?.response?.status ? `HTTP ${err.response.status}` : '';
    const msg = serverText || clientText || 'Ошибка AI. Проверь backend / ключ / лимиты.';

    aiMessages.value.push(_makeAiMsg('assistant', `${statusLabel ? statusLabel + ': ' : ''}${msg}`));
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
const viewMode = ref('3m'); // 🔴 VISUALIZATION ONLY - does NOT affect calculations
const isScrollActive = computed(() => true); // 🔴 FIXED: скролл всегда активен
// 🔥 UNIFIED: totalDays comes from projection, NOT from viewMode
const totalDays = computed(() => mainStore.projection?.totalDays || 30);
watch(totalDays, async () => { await nextTick(); updateScrollbarMetrics(); });

// 🔥 SYNCHRONIZED WITH PROJECTION: globalTodayIndex is days from projection.rangeStartDate to today
const globalTodayIndex = computed(() => {
  const startDate = mainStore.projection?.rangeStartDate;
  if (!startDate) return 0;
  
  const start = new Date(startDate); // Convert string to Date
  start.setHours(0, 0, 0, 0);
  const tod = new Date(today.value);
  tod.setHours(0, 0, 0, 0);
  
  // Days from projection start to today
  const diffTime = tod.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, Math.min(diffDays, totalDays.value - 1));
});

const virtualStartIndex = ref(0);
const globalIndexFromLocal = (localIndex) => virtualStartIndex.value + localIndex;

// 🔥 SYNCHRONIZED WITH PROJECTION: build dates from projection.rangeStartDate
const dateFromGlobalIndex = (globalIndex) => {
  const startDate = mainStore.projection?.rangeStartDate;
  if (!startDate) {
    // Fallback if projection not loaded
    return new Date(today.value);
  }
  
  const d = new Date(startDate); // Convert string to Date
  d.setDate(d.getDate() + globalIndex);
  return d;
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
const yAxisLabels = ref([]); 
const resizerRef = ref(null);
const dividerWrapperRef = ref(null);
const customScrollbarTrackRef = ref(null);
const scrollbarThumbWidth = ref(0);
const scrollbarThumbX = ref(0);
const scrollbarVisible = ref(false); // 🔴 NEW: автоскрытие скролла
let scrollbarHideTimeout = null;
const graphAreaRef = ref(null);
const homeHeaderRef = ref(null);
const headerResizerRef = ref(null);

const TIMELINE_MIN = 100;
const GRAPH_MIN    = 115;
const DIVIDER_H    = 28;
const HEADER_MIN_H = 132; 
const HEADER_MAX_H_RATIO = 0.8; 
const headerHeightPx = ref(HEADER_MIN_H); 
const timelineHeightPx = ref(318);

// Charts expansion state
const isChartsExpanded = ref(true);

watch(() => mainStore.isHeaderExpanded, (isExpanded) => {
    if (isExpanded) {
        // Calculate rows needed: dashboardLayout + 2 fixed widgets (currentTotal, futureTotal)
        const totalWidgets = mainStore.dashboardLayout.length + 2;
        const rowSize = 6;
        const rows = Math.ceil(totalWidgets / rowSize);
        // Each row: 130px + padding between rows
        headerHeightPx.value = rows * 130 + 20; 
    } else {
        headerHeightPx.value = 132;
    }
    applyHeaderHeight(headerHeightPx.value);
    nextTick(() => { onWindowResize(); });
});

const openContextMenu = (day, event, cellIndex) => {
  event.stopPropagation();
  // 🟢 PERMISSION CHECK
  if (!mainStore.canEdit) return;
  
  // 🟢 ZONE CHECK: Only allow context menu in timeline area
  const clickTarget = event.target;
  const timelineGrid = timelineGridRef.value;
  if (!timelineGrid || !timelineGrid.contains(clickTarget)) {
    return; // Click is outside timeline area, don't show menu
  }

  selectedDay.value = day; 
  selectedCellIndex.value = cellIndex;
  
  const menuWidth = 260;
  const menuHeight = 150;
  const padding = 10;
  
  // Get the clicked cell's bounding rectangle
  const cellElement = clickTarget.closest('.hour-cell');
  let centerX, centerY;
  
  if (cellElement) {
    const cellRect = cellElement.getBoundingClientRect();
    centerX = cellRect.left + (cellRect.width / 2);
    centerY = cellRect.top + (cellRect.height / 2);
  } else {
    // Fallback to cursor position if cell not found
    centerX = event.clientX;
    centerY = event.clientY;
  }
  
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // Calculate menu edges from center position
  let finalX = centerX;
  let finalY = centerY;
  
  // Check horizontal boundaries (menu will be centered, so check half-width on each side)
  const leftEdge = finalX - (menuWidth / 2);
  const rightEdge = finalX + (menuWidth / 2);
  
  if (rightEdge > windowWidth - padding) {
    // Too close to right edge, shift left
    finalX = windowWidth - (menuWidth / 2) - padding;
  } else if (leftEdge < padding) {
    // Too close to left edge, shift right
    finalX = (menuWidth / 2) + padding;
  }
  
  // Check vertical boundaries (menu will be centered, so check half-height on each side)
  const topEdge = finalY - (menuHeight / 2);
  const bottomEdge = finalY + (menuHeight / 2);
  
  if (bottomEdge > windowHeight - padding) {
    // Too close to bottom edge, shift up
    finalY = windowHeight - (menuHeight / 2) - padding;
  } else if (topEdge < padding) {
    // Too close to top edge, shift down
    finalY = (menuHeight / 2) + padding;
  }
  
  const newPos = { 
    top: `${finalY}px`, 
    left: `${finalX}px`,
    transform: 'translate(-50%, -50%)',
    right: 'auto' 
  };
  
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
const rebuildVisibleDays = () => { const days = []; const tomorrow = new Date(today.value); tomorrow.setDate(tomorrow.getDate() + 1); for (let i = 0; i < VISIBLE_COLS; i++) { const gIdx = globalIndexFromLocal(i); const date = dateFromGlobalIndex(gIdx); days.push({ id: i, date, isToday: sameDay(date, today.value), isTomorrow: sameDay(date, tomorrow), dayOfYear: getDayOfYear(date), dateKey: _getDateKey(date) }); } visibleDays.value = days; debouncedFetchVisibleDays(); };

const clampVirtualStart = (targetDayIndex) => {
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  const startIdx = Math.max(0, Math.min(targetDayIndex - CENTER_INDEX, maxVirtual));
  virtualStartIndex.value = startIdx;
  rebuildVisibleDays();
  nextTick(() => updateScrollbarMetrics());
};

const scrollToMonthCenter = (baseDate) => {
  const startDate = mainStore.projection?.rangeStartDate;
  const total = totalDays.value || 0;
  if (!startDate || !total) {
    clampVirtualStart(0);
    return;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const todayDate = new Date(today.value);
  todayDate.setHours(0, 0, 0, 0);

  let targetDayIndex = Math.floor((total - 1) / 2);

  if (baseDate && baseDate.getFullYear() === todayDate.getFullYear() && baseDate.getMonth() === todayDate.getMonth()) {
    const diff = Math.round((todayDate.getTime() - start.getTime()) / msPerDay);
    targetDayIndex = Math.max(0, Math.min(diff, total - 1));
  }

  clampVirtualStart(targetDayIndex);
};
const generateVisibleDays = () => { rebuildVisibleDays(); };
const clampHeaderHeight = (rawPx) => { const maxHeight = window.innerHeight * HEADER_MAX_H_RATIO; return Math.min(Math.max(rawPx, HEADER_MIN_H), maxHeight); };
const applyHeaderHeight = (newPx) => { headerHeightPx.value = Math.round(newPx); if (homeHeaderRef.value) { homeHeaderRef.value.style.height = `${headerHeightPx.value}px`; } };
// Header resizer: track mouse/touch movement to distinguish click from drag
let headerResizeStartY = 0;
let headerResizeHasMoved = false;
const CLICK_THRESHOLD = 5; // pixels

const initHeaderResize = (e) => {
  e.preventDefault();
  headerResizeStartY = e.touches ? e.touches[0].clientY : e.clientY;
  headerResizeHasMoved = false;
  
  window.addEventListener('mousemove', doHeaderResize);
  window.addEventListener('touchmove', doHeaderResize, { passive: false });
  window.addEventListener('mouseup', stopHeaderResize);
  window.addEventListener('touchend', stopHeaderResize);
};

const doHeaderResize = (e) => {
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  const distance = Math.abs(y - headerResizeStartY);
  
  if (distance > CLICK_THRESHOLD) {
    headerResizeHasMoved = true;
    applyHeaderHeight(clampHeaderHeight(y));
  }
};

const stopHeaderResize = () => {
  window.removeEventListener('mousemove', doHeaderResize);
  window.removeEventListener('touchmove', doHeaderResize);
  window.removeEventListener('mouseup', stopHeaderResize);
  window.removeEventListener('touchend', stopHeaderResize);
  
  // If no movement detected, treat as click - toggle header expansion
  if (!headerResizeHasMoved) {
    mainStore.toggleHeaderExpansion();
  }
};
const clampTimelineHeight = (rawPx) => { const container = mainContentRef.value; if (!container) return timelineHeightPx.value; const headerTotalH = headerHeightPx.value + 15; const containerH = window.innerHeight - headerTotalH; const maxTop = Math.max(0, containerH - DIVIDER_H - GRAPH_MIN); const minTop = TIMELINE_MIN; return Math.min(Math.max(rawPx, minTop), maxTop); };
const applyHeights = (timelinePx) => { timelineHeightPx.value = Math.round(timelinePx); if (timelineGridRef.value) { timelineGridRef.value.style.height = `${timelineHeightPx.value}px`; } };

// Vertical resizer: track movement to distinguish click from drag
let verticalResizeStartY = 0;
let verticalResizeHasMoved = false;
let isDraggingResizer = false; // Flag to prevent ResizeObserver interference

  const initResize = (e) => {
    e.preventDefault();
    
    // Check if click is on vertical-resizer (ромб) - don't resize, let it handle its own click
    const target = e.target || e.srcElement;
    if (target && target.closest('.month-nav-btn')) {
      return; // Month navigation click, not resize
    }
    if (target && (target.closest('.vertical-resizer') || target.classList.contains('vertical-resizer'))) {
      return; // Let vertical-resizer handle its own clicks
    }
  
  // Don't resize if clicking on scrollbar THUMB (but allow on track) - let thumb drag
  if (target && (target.closest('.custom-scrollbar-thumb') || target.classList.contains('custom-scrollbar-thumb'))) {
    return; // Let scrollbar thumb handle its own drag
  }
  
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  verticalResizeStartY = y;
  verticalResizeHasMoved = false;
  isDraggingResizer = true; // Start dragging
  
  window.addEventListener('mousemove', doResize);
  window.addEventListener('touchmove', doResize, { passive: false });
  window.addEventListener('mouseup', stopResize);
  window.addEventListener('touchend', stopResize);
};

const doResize = (e) => {
  if (!mainContentRef.value) return;
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  const distance = Math.abs(y - verticalResizeStartY);
  
  if (distance > CLICK_THRESHOLD) {
    verticalResizeHasMoved = true;
    const mainTop = mainContentRef.value.getBoundingClientRect().top;
    applyHeights(clampTimelineHeight(y - mainTop));
  }
};

const stopResize = (e) => {
  window.removeEventListener('mousemove', doResize);
  window.removeEventListener('touchmove', doResize);
  window.removeEventListener('mouseup', stopResize);
  window.removeEventListener('touchend', stopResize);
  
  // No toggleChartsExpansion - just stop resize
  // If user wants to toggle, they can use TimelineSwitcher arrows
  
  // Reset drag flag after a short delay to allow applyHeights to finish
  setTimeout(() => {
    isDraggingResizer = false;
  }, 100);
};

const toggleChartsExpansion = () => {
  isChartsExpanded.value = !isChartsExpanded.value;
  
  if (!mainContentRef.value) return;
  
  const headerTotalH = headerHeightPx.value + 15;
  const containerH = window.innerHeight - headerTotalH;
  
  if (isChartsExpanded.value) {
    // Expand: timeline gets default height, charts get remaining
    applyHeights(318);
  } else {
    // Collapse charts: timeline gets most space, charts get minimum
    const maxTimelineH = containerH - DIVIDER_H - GRAPH_MIN;
    applyHeights(maxTimelineH);
  }
};

// NEW: Chart height control handlers for TimelineSwitcher
const expandChartsMax = () => {
  console.log('[DEBUG] expandChartsMax called - should maximize timeline (chart DOWN)');
  // Maximize timeline (push charts down) - Arrow DOWN (▼)
  if (!mainContentRef.value) return;
  const headerTotalH = headerHeightPx.value + 15;
  const containerH = window.innerHeight - headerTotalH;
  const maxTimelineH = containerH - DIVIDER_H - GRAPH_MIN;
  applyHeights(maxTimelineH);
  isChartsExpanded.value = false;
};

const collapseChartsMax = () => {
  console.log('[DEBUG] collapseChartsMax called - should minimize timeline (chart UP)');
  // Minimize timeline (pull charts up) - Arrow UP (▲)
  applyHeights(TIMELINE_MIN);
  isChartsExpanded.value = true;
};

const centerCharts = () => {
  console.log('[DEBUG] centerCharts called - should reset to 318px');
  // Reset to default center position
  applyHeights(318);
  isChartsExpanded.value = true;
};
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

// 🔴 NEW: Показать скролл и скрыть через 1.5с
const showScrollbar = () => {
  scrollbarVisible.value = true;
  if (scrollbarHideTimeout) clearTimeout(scrollbarHideTimeout);
  scrollbarHideTimeout = setTimeout(() => {
    scrollbarVisible.value = false;
  }, 1500);
};

const autoExpandTimeline = () => {
  return;
};



const onWheelScroll = (event) => { if (!isScrollActive.value) return; const isHorizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY); if (isHorizontal) { if (event.cancelable && !event.ctrlKey) event.preventDefault(); const delta = event.deltaX; const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS); if (Math.abs(delta) > 1) { const direction = delta > 0 ? 1 : -1; const speed = Math.abs(delta) > 50 ? 2 : 1; let nextVal = virtualStartIndex.value + (direction * speed); nextVal = Math.max(0, Math.min(nextVal, maxVirtual)); if (nextVal !== virtualStartIndex.value) { virtualStartIndex.value = nextVal; rebuildVisibleDays(); updateScrollbarMetrics(); showScrollbar(); autoExpandTimeline(); } } } };
const contentTouchState = { startX: 0, startIndex: 0, isDragging: false };
const onContentTouchStart = (e) => { if (!isScrollActive.value) return; contentTouchState.isDragging = true; contentTouchState.startX = e.touches[0].clientX; contentTouchState.startIndex = virtualStartIndex.value; };
const onContentTouchMove = (e) => { if (!contentTouchState.isDragging) return; const deltaPx = contentTouchState.startX - e.touches[0].clientX; const pxPerDay = 50; const deltaDays = Math.round(deltaPx / pxPerDay); const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS); let nextVal = contentTouchState.startIndex + deltaDays; nextVal = Math.max(0, Math.min(nextVal, maxVirtual)); if (e.cancelable) e.preventDefault(); if (nextVal !== virtualStartIndex.value) { virtualStartIndex.value = nextVal; rebuildVisibleDays(); updateScrollbarMetrics(); autoExpandTimeline(); } };
const onContentTouchEnd = () => { contentTouchState.isDragging = false; };
const centerToday = () => { scrollToMonthCenter(selectedMonthStart.value || new Date()); };
// OLD: onChangeView - controls both timeline AND forecast
const onChangeView = async (newView) => { const currentStartDate = visibleDays.value[0]?.date || new Date(today.value); viewMode.value = newView; await nextTick(); const msPerDay = 1000 * 60 * 60 * 24; const diffDays = Math.round((currentStartDate.getTime() - today.value.getTime()) / msPerDay); const newGlobalTodayIndex = (viewMode.value === '12d') ? CENTER_INDEX : Math.floor(totalDays.value / 2); let targetIndex = newGlobalTodayIndex + diffDays; const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS); targetIndex = Math.max(0, Math.min(targetIndex, maxVirtual)); virtualStartIndex.value = targetIndex; rebuildVisibleDays(); await nextTick(); setTimeout(() => { updateScrollbarMetrics(); recalcProjectionForCurrentView(); }, 50); };

// NEW: onChangeTimelineWidth - controls ONLY visual timeline width (no forecast recalc)
const onChangeTimelineWidth = async (newWidth) => {
  const currentStartDate = visibleDays.value[0]?.date || new Date(today.value);
  viewMode.value = newWidth;
  await nextTick();
  
  const msPerDay = 1000 * 60 * 60 * 24;
  const diffDays = Math.round((currentStartDate.getTime() - today.value.getTime()) / msPerDay);
  const newGlobalTodayIndex = (viewMode.value === '12d') ? CENTER_INDEX : Math.floor(totalDays.value / 2);
  let targetIndex = newGlobalTodayIndex + diffDays;
  const maxVirtual = Math.max(0, totalDays.value - VISIBLE_COLS);
  targetIndex = Math.max(0, Math.min(targetIndex, maxVirtual));
  
  virtualStartIndex.value = targetIndex;
  rebuildVisibleDays();
  await nextTick();
  
  // Only update scrollbar - DO NOT recalculate projections
  updateScrollbarMetrics();
};
const onWindowResize = () => { applyHeaderHeight(clampHeaderHeight(headerHeightPx.value)); applyHeights(clampTimelineHeight(timelineHeightPx.value)); updateScrollbarMetrics(); };
// Check for day change and re-center timeline on new today
const checkDayChange = () => {
  const currentToday = initializeToday();
  if (!sameDay(currentToday, today.value)) {
    today.value = currentToday;
    const todayDay = getDayOfYear(today.value);
    mainStore.setToday(todayDay);
    
    if (mainStore.user && !mainStore.isAuthLoading) {
      // 🔥 Center timeline on new today
      centerToday();
      console.log('[Desktop] Day changed - centered on new today');
      // DO NOT recalc projection - it stays the same until user changes it
    }
  }
};
let dayChangeCheckerInterval = null;
let resizeObserver = null;

// Global click handler to close context menu when clicking outside
const handleGlobalClick = (e) => {
  if (isContextMenuVisible.value) {
    const contextMenuEl = document.querySelector('.context-menu');
    if (contextMenuEl && !contextMenuEl.contains(e.target)) {
      isContextMenuVisible.value = false;
    }
  }
};

// Handler to close context menu when cursor leaves timeline area
const handleTimelineMouseLeave = (e) => {
  if (isContextMenuVisible.value) {
    // Check if cursor is moving into widgets or graphs area
    const relatedTarget = e.relatedTarget;
    if (!relatedTarget) {
      isContextMenuVisible.value = false;
      return;
    }
    
    // Don't close if moving to context menu itself
    const contextMenuEl = document.querySelector('.context-menu');
    if (contextMenuEl && contextMenuEl.contains(relatedTarget)) {
      return; // Moving to menu, keep it open
    }
    
    // Close if moving to header (widgets), graphs, or anywhere outside timeline
    const isMovingToTimeline = timelineGridRef.value?.contains(relatedTarget);
    if (!isMovingToTimeline) {
      isContextMenuVisible.value = false;
    }
  }
};
const captureBackgroundScreenshot = async () => {
    // Only capture if we are in a workspace context (simple check)
    // and if auth is valid.
    if (!mainStore.user) return;

    try {
        await nextTick();
        const homeLayout = document.querySelector('.home-layout');
        if (!homeLayout) return;

        // Capture logic
        const canvas = await html2canvas(homeLayout, {
             scale: 0.3, // Low res is fine for thumbnail
             useCORS: true,
             allowTaint: true,
             backgroundColor: '#1a1a1a', 
             ignoreElements: (element) => {
                 // Ignore modals if they happen to be open (though we run on mount mostly)
                 if (element.classList.contains('ai-modal-overlay')) return true;
                 if (element.classList.contains('create-dialog-overlay')) return true;
                 // Don't capture the workspace modal itself if it happens to be open
                 if (element.classList.contains('workspace-dashboard-modal')) return true;
                 return false;
             }
        });

        const thumbnail = canvas.toDataURL('image/jpeg', 0.6);
        const wsId = mainStore.user.currentWorkspaceId;
        
        if (wsId && thumbnail) {
             await axios.post(`${API_BASE_URL}/workspaces/${wsId}/thumbnail`, 
                { thumbnail }, 
                { withCredentials: true }
             );
             // console.log('Background thumbnail captured');
        }
    } catch (e) {
        console.error('Background thumbnail capture failed', e);
    }
};

onMounted(async () => { 
    // Initialize theme
    document.documentElement.setAttribute('data-theme', currentTheme.value);
    
    checkDayChange(); 
    dayChangeCheckerInterval = setInterval(checkDayChange, 60000); 
    await mainStore.checkAuth(); 
    if (mainStore.isAuthLoading || !mainStore.user) return; 
    
    // 🟢 Auto-accept pending invite after login
    const pendingInviteToken = sessionStorage.getItem('pendingInviteToken');
    if (pendingInviteToken) {
        try {
            console.log('🔗 Auto-accepting pending invite...');
            sessionStorage.removeItem('pendingInviteToken');
            
            // Accept the invite
            await axios.post(
                `${API_BASE_URL}/workspace-invite/${pendingInviteToken}/accept`,
                {},
                { withCredentials: true }
            );
            
            console.log('✅ Invite accepted, reloading to switch workspace...');
            // Reload to switch to the shared workspace
            window.location.reload();
            return; // Stop initialization, reload will handle it
        } catch (err) {
            console.error('Failed to auto-accept invite:', err);
            // Continue with normal initialization
        }
    }
    
    mainStore.startAutoRefresh(); 
    await nextTick(); 
    await mainStore.fetchAllEntities(); 
    await setMonthRange(new Date());
    const todayDay = getDayOfYear(today.value); 
    mainStore.setToday(todayDay); 
    generateVisibleDays(); 
    await nextTick(); 
    centerToday(); 
    await nextTick(); 
    applyHeaderHeight(clampHeaderHeight(headerHeightPx.value)); 
    const initialTop = (timelineGridRef.value && timelineGridRef.value.style.height) ? parseFloat(timelineGridRef.value.style.height) : timelineHeightPx.value; 
    applyHeights(clampTimelineHeight(initialTop)); 
    
    // Attach resize handlers to divider-wrapper (for top/bottom edge dragging)
    if (dividerWrapperRef.value) {
      dividerWrapperRef.value.addEventListener('mousedown', initResize);
      dividerWrapperRef.value.addEventListener('touchstart', initResize, { passive: false });
    } 
    if (headerResizerRef.value) { headerResizerRef.value.addEventListener('mousedown', initHeaderResize); headerResizerRef.value.addEventListener('touchstart', initHeaderResize, { passive: false }); } 
    if (timelineGridRef.value) { 
      timelineGridRef.value.addEventListener('wheel', onWheelScroll, { passive: false }); 
      timelineGridRef.value.addEventListener('touchstart', onContentTouchStart, { passive: true }); 
      timelineGridRef.value.addEventListener('touchmove', onContentTouchMove, { passive: false }); 
      timelineGridRef.value.addEventListener('touchend', onContentTouchEnd); 
      timelineGridRef.value.addEventListener('mouseleave', handleTimelineMouseLeave);
    } 
    
    // Add global click listener to close context menu when clicking outside
    document.addEventListener('click', handleGlobalClick);
    
    resizeObserver = new ResizeObserver(() => { 
      // Don't interfere while user is actively dragging
      if (!isDraggingResizer) {
        applyHeights(clampTimelineHeight(timelineHeightPx.value)); 
        updateScrollbarMetrics(); 
      }
    }); 
    if (mainContentRef.value) resizeObserver.observe(mainContentRef.value); 
    window.addEventListener('resize', onWindowResize); 
    updateScrollbarMetrics(); 
    
    // 🔥 UNIFIED DATE RANGE: Load to end of current month (single source of truth)
    console.log('[Desktop] Initializing with projection to end of current month');
    await mainStore.setProjectionToEndOfMonth();
    
    // Center timeline on today after loading projection
    centerToday();
    console.log('[Desktop] Timeline centered on today');

    // 🟢 Delay background snapshot significantly to let UI settle
    setTimeout(() => {
        captureBackgroundScreenshot();
    }, 2000);
});
onBeforeUnmount(() => { if (dayChangeCheckerInterval) { clearInterval(dayChangeCheckerInterval); dayChangeCheckerInterval = null; } mainStore.stopAutoRefresh(); if (dividerWrapperRef.value) { dividerWrapperRef.value.removeEventListener('mousedown', initResize); dividerWrapperRef.value.removeEventListener('touchstart', initResize); } if (resizerRef.value) { resizerRef.value.removeEventListener('mousedown', initResize); resizerRef.value.removeEventListener('touchstart', initResize); } if (headerResizerRef.value) { headerResizerRef.value.removeEventListener('mousedown', initHeaderResize); headerResizerRef.value.removeEventListener('touchstart', initHeaderResize); } if (timelineGridRef.value) { timelineGridRef.value.removeEventListener('wheel', onWheelScroll); timelineGridRef.value.removeEventListener('touchstart', onContentTouchStart); timelineGridRef.value.removeEventListener('touchmove', onContentTouchMove); timelineGridRef.value.removeEventListener('touchend', onContentTouchEnd); timelineGridRef.value.removeEventListener('mouseleave', handleTimelineMouseLeave); } window.removeEventListener('resize', onWindowResize); document.removeEventListener('click', handleGlobalClick); if (resizeObserver && mainContentRef.value) { resizeObserver.unobserve(mainContentRef.value); } resizeObserver = null; });

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
    <!-- 🟢 NEW: Hide header (widgets) for timeline-only users -->
    <header v-if="!mainStore.isTimelineOnly" class="home-header" ref="homeHeaderRef"><TheHeader ref="theHeaderRef" /></header>
    <div class="header-resizer" :class="{ 'collapsed': mainStore.isHeaderExpanded }" v-if="!mainStore.isTimelineOnly" ref="headerResizerRef"></div>
    <div class="home-body">
      <aside class="home-left-panel">
        <!-- nav-panel-wrapper kept as placeholder for future controls -->
        <div class="nav-panel-wrapper"></div>
        <div class="divider-placeholder"></div><YAxisPanel :yLabels="yAxisLabels" /></aside>
      <main class="home-main-content" ref="mainContentRef">
        <div class="timeline-grid-wrapper" :class="{ 'analyst-readonly': mainStore.workspaceRole === 'analyst' }" ref="timelineGridRef" @dragover="onContainerDragOver" @dragleave="onContainerDragLeave">
          <div v-if="isDataLoading" class="section-loading-overlay">
            <div class="spinner-small"></div>
          </div>
        <div class="timeline-grid-content" ref="timelineGridContentRef" :class="{ 'month-transition': monthTransitioning }"><DayColumn v-for="day in visibleDays" :key="day.id" :date="day.date" :isToday="day.isToday" :isTomorrow="day.isTomorrow" :dayOfYear="day.dayOfYear" :dateKey="day.dateKey" @add-operation="(event, cellIndex) => openContextMenu(day, event, cellIndex)" @edit-operation="handleEditOperation" @drop-operation="handleOperationDrop" /></div>
        </div>
        <!-- 🟢 UPDATED: vertical-resizer now contains TimelineSwitcher -->
        <div class="divider-wrapper" ref="dividerWrapperRef">
          <div class="month-nav">
            <button class="month-nav-btn left" @click="goPrevMonth" title="Предыдущий месяц">←</button>
            <div class="month-label">{{ prevMonthLabel }}</div>
          </div>

          <div v-if="isScrollActive" class="custom-scrollbar-track" ref="customScrollbarTrackRef" @mouseenter="showScrollbar" @mouseleave="() => { if (!scrollState.isDragging) showScrollbar(); }"><div class="custom-scrollbar-thumb" :class="{ 'visible': scrollbarVisible }" :style="{ width: scrollbarThumbWidth + 'px', transform: `translateX(${scrollbarThumbX}px)` }" @mousedown.stop="onScrollThumbMouseDown" @touchstart.stop="onScrollThumbTouchStart"></div></div>

          <div class="month-nav center">
            <div v-if="!mainStore.isTimelineOnly" class="vertical-resizer" :class="{ 'collapsed': !isChartsExpanded }" ref="resizerRef"><TimelineSwitcher @change-timeline-width="onChangeTimelineWidth" @expand-charts-max="expandChartsMax" @collapse-charts-max="collapseChartsMax" @center-charts="centerCharts" /></div>
          </div>

          <div class="month-nav">
            <div class="month-label">{{ nextMonthLabel }}</div>
            <button class="month-nav-btn right" @click="goNextMonth" title="Следующий месяц">→</button>
          </div>
        </div>
        <!-- 🟢 NEW: Hide graphs for timeline-only users -->
        <div v-if="!mainStore.isTimelineOnly" class="graph-area-wrapper" ref="graphAreaRef">
          <div v-if="isDataLoading" class="section-loading-overlay">
            <div class="spinner-small"></div>
          </div>
          <GraphRenderer v-if="visibleDays.length" :visibleDays="visibleDays" @update:yLabels="yAxisLabels = $event" class="graph-renderer-content" />
          <div class="summaries-container"></div>
        </div>
      </main>
      <aside class="home-right-panel">
        <!-- Top buttons group -->
        <div class="right-panel-top">
          <!-- 🟢 NEW: Hide expand button for timeline-only -->
          <button
            v-if="!mainStore.isTimelineOnly"
            class="icon-btn header-expand-btn"
            :class="{ 'active': mainStore.isHeaderExpanded }"
            @click="mainStore.toggleHeaderExpansion"
            :data-tooltip="mainStore.isHeaderExpanded ? 'Свернуть хедер' : 'Показать все виджеты'"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </button>

          <!-- 🟢 NEW: Hide import/export for timeline-only -->
          <button v-if="!mainStore.isTimelineOnly" class="icon-btn import-export-btn" @click="showImportModal = true" data-tooltip="Импорт / Экспорт">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </button>

          <!-- 🟢 NEW: Hide graph button for timeline-only -->
          <button v-if="!mainStore.isTimelineOnly" class="icon-btn graph-btn" @click="showGraphModal = true" data-tooltip="Графики">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
          </button>

          <!-- 🆕 NEW: Universal Edit Modal Button -->
          <button class="icon-btn edit-btn" @click="showUniversalEditModal = true" data-tooltip="Редактирование данных">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>

          <!-- 🟢 UPDATED: Hide AI button for timeline-only -->
          <button
            v-if="!mainStore.isTimelineOnly"
            class="icon-btn ai-btn"
            :class="{ 'active': isAiDrawerOpen }"
            @click.stop="openAiDrawer"
            data-tooltip="AI ассистент"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"></path>
                <path d="M5 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"></path>
              </svg>
          </button>

          <!-- 🟢 NEW: Unified Workspace/Project Dashboard Button (Admin only) -->
          <button
            v-if="mainStore.isAdmin"
            class="icon-btn workspace-dashboard-btn"
            @click="showWorkspaceModal = true"
            data-tooltip="Рабочие области"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>

          <!-- 🆕 NEW: Theme Toggle Button -->
          <button class="icon-btn theme-toggle-btn" @click="toggleTheme" :data-tooltip="currentTheme === 'dark' ? 'Светлая тема' : 'Темная тема'">
            <svg v-if="currentTheme === 'dark'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          </button>

          <!-- 🆕 NEW: Payment Receipt Generator Button -->
          <button 
            v-if="!mainStore.isTimelineOnly"
            class="icon-btn receipt-btn" 
            @click="showReceiptModal = true" 
            data-tooltip="Генератор квитанций"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </button>
        </div>

        <!-- Bottom buttons group -->
        <div class="right-panel-bottom">
          <button class="icon-btn about-btn" @click="showAboutModal = true" data-tooltip="О сервисе">
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
        </div>
      </aside>
      
      

    </div>
        <!-- AI ассистент (Desktop modal) -->
    <div v-if="isAiDrawerOpen" class="ai-modal-overlay" @click="closeAiDrawer">
      <div class="ai-modal" @click.stop>
        <div class="ai-modal-header">
          <div class="ai-modal-title">AI ассистент</div>
          <button class="ai-modal-close" @click="closeAiDrawer" title="Закрыть">
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
            <button class="ai-quick-btn" @click="useQuickPrompt('покажи счета')">Счета</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('покажи доходы')">Доходы</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('покажи расходы')">Расходы</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('покажи переводы')">Переводы</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('покажи компании')">Компании</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('покажи проекты')">Проекты</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('покажи контрагентов')">Контрагенты</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('покажи категории')">Категории</button>
            <button class="ai-quick-btn" @click="useQuickPrompt('покажи физлица')">Физлица</button>
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

          <!-- GPT-style input area -->
          <div class="ai-input-container">
            <div class="ai-input-wrapper">
              <!-- File attachment placeholder (left) -->
              <button class="ai-attach-btn" disabled title="Прикрепить файл (скоро)">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
              </button>

              <!-- Textarea (center, expands) -->
              <textarea
                ref="aiInputRef"
                v-model="aiInput"
                class="ai-input"
                placeholder="Спросите AI..."
                @keydown.enter="handleAiInputKeydown"
                rows="1"
              ></textarea>

              <!-- Buttons (right) -->
              <div class="ai-input-buttons">
                <button
                  class="ai-mic-btn"
                  :class="{ recording: isAiRecording }"
                  :disabled="aiLoading || !aiSpeechSupported"
                  @click="toggleAiRecording"
                  :title="aiSpeechSupported ? (isAiRecording ? 'Остановить запись' : 'Голосовой ввод') : 'Голосовой ввод не поддерживается'"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          </div>
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





    <TransferPopup v-if="isTransferPopupVisible" :date="selectedDay ? selectedDay.date : new Date()" :cellIndex="selectedDay ? selectedCellIndex : 0" :transferToEdit="operationToEdit" :min-allowed-date="minDateFromProjection" :max-allowed-date="maxDateFromProjection" @close="handleCloseTransferPopup" @save="handleTransferSave" />

    <RetailClosurePopup v-if="isRetailPopupVisible" :operation-to-edit="operationToEdit" @close="isRetailPopupVisible = false" @confirm="handleRetailClosure" @save="handleRetailSave" @delete="handleRetailDelete" />
    <RefundPopup v-if="isRefundPopupVisible" :operation-to-edit="operationToEdit" @close="isRefundPopupVisible = false" @save="handleRefundSave" @delete="handleRefundDelete" />

    <ImportExportModal v-if="showImportModal" @close="showImportModal = false" @import-complete="handleImportComplete" />
    <GraphModal v-if="showGraphModal" @close="showGraphModal = false" />
    <UniversalEditModal v-if="showUniversalEditModal" @close="showUniversalEditModal = false" />
    <AboutModal v-if="showAboutModal" @close="showAboutModal = false" />
    <!-- 🟢 Unified Workspace/Project Dashboard Modal -->
    <WorkspaceDashboardModal v-if="showWorkspaceModal" @close="showWorkspaceModal = false" />
    
    <!-- 🆕 NEW: Payment Receipt Generator -->
    <PaymentReceiptModal v-if="showReceiptModal" @close="showReceiptModal = false" />

  </div>
</template>

<style scoped>
/* (Стили без изменений) */
.loading-screen { width: 100vw; height: 100vh; height: 100dvh; display: flex; align-items: center; justify-content: center; flex-direction: column; background-color: var(--color-background); color: var(--color-text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.spinner { width: 40px; height: 40px; border: 4px solid var(--color-border); border-top-color: var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* 🟢 Loading overlays for timeline and graphs */
.section-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-background);
  backdrop-filter: blur(4px);
  z-index: 100;
  pointer-events: none;
}

.spinner-small {
  width: 28px;
  height: 28px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.login-screen { width: 100vw; height: 100vh; height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 1rem; box-sizing: border-box; background-color: var(--color-background); }
.login-box { width: 100%; max-width: 500px; padding: 2.5rem 2rem; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 12px; text-align: center; box-shadow: 0 10px 30px rgba(0, 0, 0, 0. 3); }
.login-box h1 { color: var(--color-heading); font-size: 1.75rem; font-weight: 600; line-height: 1.3; margin-bottom: 1rem; }
.login-box p { color: var(--color-text); font-size: 1rem; line-height: 1.5; opacity: 0.8; margin-bottom: 2.5rem; }
.google-login-button { display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; background-color: #ffffff; color: #333333; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; font-weight: 600; text-decoration: none; cursor: pointer; transition: background-color 0.2s, box-shadow 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05); width: 100%; box-sizing: border-box; }
.google-login-button:hover { background-color: #f9f9f9; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
.dev-login-button { display: inline-flex; align-items: center; justify-content: center; padding: 12px 24px; background-color: #333; color: #fff; border: 1px solid #555; border-radius: 8px; font-size: 1rem; font-weight: 600; text-decoration: none; cursor: pointer; transition: background-color 0.2s; margin-top: 10px; width: 100%; box-sizing: border-box; }
.dev-login-button:hover { background-color: #444; }

.user-profile-button { 
  display: flex; 
  align-items: center; 
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--color-background-soft); 
  border: 1px solid var(--color-border); 
  border-radius: 50%; 
  padding: 0;
  cursor: pointer; 
  transition: background-color 0.2s, border-color 0.2s; 
  flex-shrink: 0;
}
.user-profile-button:hover { background-color: var(--color-background-mute); border-color: var(--color-border-hover); }
.user-avatar { 
  width: 32px; 
  height: 32px; 
  border-radius: 50%; 
  object-fit: cover; 
}
.user-avatar-placeholder { 
  width: 32px; 
  height: 32px; 
  border-radius: 50%; 
  background-color: var(--color-primary); 
  color: #fff; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  font-weight: 600; 
  font-size: 14px; 
}
.user-name { display: none; /* Скрыт в узкой панели */ }
.user-menu { position: fixed; width: 180px; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); z-index: 2000; overflow: hidden; }
.user-menu-item { display: block; width: 100%; padding: 10px 12px; background: none; border: none; border-bottom: 1px solid var(--color-border); color: var(--color-text); cursor: pointer; text-align: left; font-size: 14px; }
.user-menu-item:last-child { border-bottom: none; }
.user-menu-item:hover { background-color: var(--color-background-mute); }
.user-menu-item:disabled { color: var(--color-text-mute); cursor: not-allowed; background: none; }
.home-layout { display: flex; flex-direction: column; height: 100vh; height: 100dvh; width: 100%; overflow: hidden; background-color: var(--color-background); }
.home-header { flex-shrink: 0; z-index: 100; background-color: var(--color-background); display: flex; height: 130px; transition: height 0.3s ease; }
.header-resizer { 
  flex-shrink: 0; 
  height: 15px; 
  background: var(--header-resizer-bg); 
  border-top: 1px solid var(--header-resizer-border); 
  border-bottom: 1px solid var(--header-resizer-border); 
  cursor: row-resize; 
  position: relative; 
  z-index: 50; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
}
.header-resizer:hover { border-top: 1px solid var(--header-resizer-border-hover); }
.header-resizer::before { 
  content: ''; 
  display: block; 
  width: 0; 
  height: 0; 
  border-left: 9px solid transparent; 
  border-right: 9px solid transparent; 
  border-top: 12px solid var(--header-resizer-dot-bg); 
  opacity: 0.6; 
  transition: opacity 0.2s, transform 0.2s; 
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); 
}
.header-resizer:hover::before { opacity: 1; }
/* Rotate triangle when expanded (header is expanded, so triangle points up to collapse) */
.header-resizer.collapsed::before { transform: rotate(180deg) scale(1.1); }
.home-body { display: flex; flex-grow: 1; overflow: hidden; min-height: 0; }
.home-left-panel { width: 60px; flex-shrink: 0; overflow: hidden; display: flex; flex-direction: column; }
.home-right-panel { 
  width: 60px; 
  flex-shrink: 0; 
  background-color: var(--right-panel-bg); 
  border-left: 1px solid var(--right-panel-border); 
  scrollbar-width: none; 
  -ms-overflow-style: none; 
  
  /* Flexbox layout */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px 0;
}
.home-right-panel::-webkit-scrollbar { display: none; }

/* Top buttons group */
.right-panel-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
}

/* Bottom buttons group */
.right-panel-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0 8px 8px 8px;
}

/* Base icon button styles */
.icon-btn { 
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
  transition: background-color 0.2s, border-color 0.2s, color 0.2s;
  flex-shrink: 0;
  position: relative;
}

.icon-btn:hover { 
  background: var(--color-background-mute); 
  border-color: var(--color-border-hover);
}

/* Custom tooltip - bright, instant, left-side */
.icon-btn[data-tooltip]::before {
  content: attr(data-tooltip);
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-right: 8px;
  padding: 6px 12px;
  background: var(--color-primary, #007AFF);
  color: white;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  border-radius: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 10000;
}

.icon-btn[data-tooltip]:hover::before {
  opacity: 1;
  transition: opacity 0ms;
}

/* 🟢 Green highlight when period filter is active */
.icon-btn.filter-active {
  background-color: rgba(52, 199, 89, 0.15);
  border-color: #34c759;
  color: #34c759;
}

.icon-btn.filter-active:hover {
  background-color: rgba(52, 199, 89, 0.25);
}

.icon-btn svg { 
  width: 18px; 
  height: 18px; 
  stroke: currentColor; 
}

/* Active state for expand and AI buttons */
.header-expand-btn.active,
.ai-btn.active { 
  color: var(--color-primary); 
  border-color: var(--color-primary); 
  background: rgba(52, 199, 89, 0.1); 
}

/* About button special styling */
.about-btn { 
  background: var(--color-primary); 
  border: 1px solid var(--color-primary); 
  color: #ffffff; 
  box-shadow: 0 4px 10px rgba(52, 199, 89, 0.4); 
}

.about-btn:hover { 
  background: #28a745; 
  border-color: #28a745; 
}

/* User profile widget */
.user-profile-widget { 
 
  padding: 0;
}
.home-main-content { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; }
.timeline-grid-wrapper { position: relative; height: 318px; flex-shrink: 0; overflow-x: hidden; overflow-y: auto; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); scrollbar-width: none; -ms-overflow-style: none; overscroll-behavior-x: none; touch-action: pan-y; transition: height 0.3s ease; }

/* 🟢 NEW: Full height timeline for timeline-only users */
.home-main-content:has(.graph-area-wrapper[style*="display: none"]) .timeline-grid-wrapper,
.home-main-content:not(:has(.graph-area-wrapper)) .timeline-grid-wrapper {
  height: 100%;
  flex: 1;
}
.timeline-grid-wrapper::-webkit-scrollbar { display: none; }

/* Analyst read-only mode: prevent all interactions on timeline */
.timeline-grid-wrapper.analyst-readonly {
  pointer-events: none;
  cursor: not-allowed;
  opacity: 0.9;
}
.timeline-grid-wrapper.analyst-readonly * {
  cursor: not-allowed !important;
}

.timeline-grid-content { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); width: 100%; min-height: 100%; transition: transform 0.3s ease, opacity 0.3s ease; }
.timeline-grid-content.month-transition { transform: translateY(-6px); opacity: 0.9; }
.divider-wrapper { flex-shrink: 0; height: 18px; width: 100%; background-color: var(--divider-wrapper-bg); border-bottom: 1px solid var(--divider-wrapper-border); position: relative; display: flex; align-items: center; gap: 12px; padding: 0 12px; box-sizing: border-box; cursor: row-resize; }
.divider-wrapper .month-label { flex: 0 0 auto; font-weight: 600; font-size: 11px; text-transform: capitalize; color: var(--color-text); line-height: 1; }
.month-nav { display: inline-flex; align-items: center; gap: 4px; width: 140px; justify-content: center; }
.month-nav.center { flex: 1; justify-content: center; }
.month-nav-btn { width: 18px; height: 18px; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-background-soft); color: var(--color-text); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s; font-size: 12px; padding: 0; }
.month-nav-btn:hover { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
.month-nav-btn:active { transform: scale(0.96); }
.custom-scrollbar-track { position: absolute; left: 50px; right: 50px; top: 0; height: 100%; background-color: transparent; cursor: default; z-index: 15; pointer-events: none; }
.custom-scrollbar-track:hover { pointer-events: all; }
.custom-scrollbar-thumb { position: absolute; top: 2px; bottom: 2px; background-color: var(--scrollbar-thumb-bg); border-radius: 6px; cursor: grab; z-index: 16; pointer-events: all; opacity: 0; transition: opacity 0.3s ease; }
.custom-scrollbar-thumb.visible { opacity: 1; }
.custom-scrollbar-thumb:active { background-color: var(--scrollbar-thumb-bg-active); cursor: grabbing; }
.vertical-resizer { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); width: 40px; height: 25px; cursor: pointer; z-index: 40; display: flex; align-items: center; justify-content: center; }
.vertical-resizer::before { 
  content: ''; 
  display: block; 
  width: 12px;
  height: 12px;
  background-color: var(--vertical-resizer-dot-bg);
  transform: rotate(45deg);
  opacity: 0.6; 
  transition: opacity 0.2s, transform 0.2s; 
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); 
}
.vertical-resizer:hover::before { opacity: 1; }
.vertical-resizer.collapsed::before { transform: rotate(225deg) scale(1.1); }
.graph-area-wrapper { position: relative; flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.graph-renderer-content { flex-grow: 1; }
.summaries-container { flex-shrink: 0; }
.nav-panel-wrapper { height: 318px; flex-shrink: 0; overflow: hidden; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); background-color: var(--ui-panel-bg);}
.divider-placeholder { flex-shrink: 0; height: 15px; background-color: var(--divider-wrapper-bg); border-bottom: 1px solid var(--divider-wrapper-border); }
/* --- AI Modal (Desktop) --- */
.ai-modal-overlay { 
  position: fixed; 
  inset: 0; 
  background: rgba(0, 0, 0, 0.6); 
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 2600; 
  display: flex; 
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.ai-modal { 
  width: 95vw; 
  min-width: 400px;
  max-width: 1280px;
  height: 90vh;
  max-height: calc(100vh - 40px);
  background: var(--color-background); 
  border: 1px solid var(--color-border); 
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  display: flex; 
  flex-direction: column;
  overflow: hidden;
}

.ai-modal-header { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  padding: 16px 20px; 
  border-bottom: 1px solid var(--color-border); 
  background: var(--color-background-soft);
  flex-shrink: 0;
}

.ai-modal-title { 
  font-weight: 700; 
  font-size: 16px; 
  color: var(--color-heading); 
}

.ai-modal-close {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, border-color 0.15s;
}
.ai-modal-close:hover { 
  background: var(--color-background-mute); 
  border-color: var(--color-border-hover); 
}

.ai-quick {
  padding: 12px 20px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--color-border);
  overflow: auto;
  flex-shrink: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-hover) transparent;
}

.ai-quick::-webkit-scrollbar { width: 6px; height: 6px; }
.ai-quick::-webkit-scrollbar-track { background: transparent; }
.ai-quick::-webkit-scrollbar-thumb { background-color: var(--color-border-hover); border-radius: 10px; }

.ai-quick-btn { 
  padding: 6px 10px; 
  border-radius: 8px; 
  border: 1px solid var(--color-border); 
  background: var(--color-background-soft); 
  color: var(--color-text); 
  cursor: pointer; 
  font-size: 12px; 
  transition: background 0.15s, border-color 0.15s;
}
.ai-quick-btn:hover { 
  background: var(--color-background-mute); 
  border-color: var(--color-border-hover); 
}

.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-hover) transparent;
}

.ai-messages::-webkit-scrollbar { width: 6px; }
.ai-messages::-webkit-scrollbar-track { background: transparent; }
.ai-messages::-webkit-scrollbar-thumb { background-color: var(--color-border-hover); border-radius: 10px; }

.ai-message { display: flex; }
.ai-message.user { justify-content: flex-end; }
.ai-message.assistant { justify-content: flex-start; }
.ai-bubble { 
  max-width: 85%; 
  border: 1px solid var(--color-border); 
  background: var(--color-background-soft); 
  border-radius: 16px; 
  padding: 12px 14px; 
}
.ai-message.user .ai-bubble { 
  background: rgba(52, 199, 89, 0.12); 
  border-color: rgba(52, 199, 89, 0.35); 
}
.ai-text { 
  white-space: pre-wrap; 
  font-size: 14px; 
  line-height: 1.45; 
  color: var(--color-text); 
}
.ai-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
.ai-copy-btn { 
  border: 1px solid var(--color-border); 
  background: var(--color-background); 
  color: var(--color-text); 
  border-radius: 8px; 
  padding: 5px 10px; 
  cursor: pointer; 
  font-size: 12px; 
  transition: background 0.15s;
}
.ai-copy-btn:hover { background: var(--color-background-mute); }

.ai-typing { color: var(--color-text-mute); font-size: 13px; padding: 4px 0; }

/* GPT-style input area */
.ai-input-container {
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-background-soft);
  flex-shrink: 0;
}

.ai-input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 8px 12px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.ai-input-wrapper:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(52, 199, 89, 0.15);
}

.ai-attach-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--color-text-mute);
  cursor: not-allowed;
  display: grid;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.5;
}

.ai-input { 
  flex: 1; 
  min-height: 24px; 
  max-height: 150px;
  border: none;
  background: transparent; 
  color: var(--color-text); 
  padding: 6px 0;
  outline: none;
  resize: none;
  overflow-y: auto;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
}

.ai-input::placeholder {
  color: var(--color-text-mute);
}

.ai-input-buttons {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  align-items: flex-end;
}

.ai-send-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--color-primary);
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s, transform 0.08s;
}
.ai-send-btn:hover {
  background: #28a745;
}
.ai-send-btn:active {
  transform: scale(0.96);
}
.ai-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--color-background-mute);
  color: var(--color-text-mute);
  transform: none;
}

.ai-mic-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s, transform 0.08s;
}
.ai-mic-btn:hover {
  background: var(--color-background-mute);
}
.ai-mic-btn:active {
  transform: scale(0.96);
}
.ai-mic-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ai-mic-btn.recording {
  color: #fff;
  background: var(--color-primary);
  animation: aiPulse 1.5s ease-in-out infinite, aiWave 2s ease-in-out infinite;
}
@keyframes aiPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
@keyframes aiWave {
  0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.6); }
  50% { box-shadow: 0 0 0 12px rgba(52, 199, 89, 0); }
  100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); }
}

.ai-send-btn svg,
.ai-mic-btn svg {
  width: 20px;
  height: 20px;
  display: block;
  flex: none;
}

.ai-paywall { padding: 14px 20px; }
.ai-paywall-title { font-weight: 800; font-size: 14px; color: var(--color-heading); margin-bottom: 6px; }
.ai-paywall-text { font-size: 13px; color: var(--color-text); opacity: 0.85; margin-bottom: 12px; }
.ai-paywall-btn { width: 100%; height: 40px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-background-mute); color: var(--color-text-mute); cursor: not-allowed; margin-bottom: 8px; }
.ai-paywall-link { width: 100%; height: 40px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-background-soft); color: var(--color-text); cursor: pointer; }
.ai-paywall-link:hover { background: var(--color-background-mute); border-color: var(--color-border-hover); }

</style>

<style>
/* Period Selector Overlay (unscoped, via Teleport) */
.period-selector-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.period-selector-wrapper {
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
