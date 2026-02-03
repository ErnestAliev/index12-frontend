<script setup>
import { onMounted, onUnmounted, onBeforeUnmount, ref, nextTick, computed, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useUiStore } from '@/stores/uiStore';
import { formatNumber } from '@/utils/formatters.js';
import { useWidgetData } from '@/composables/useWidgetData.js';

// Компоненты UI (Мобильные)
import MobileHeaderTotals from '@/components/mobile/MobileHeaderTotals.vue';
import MobileWidgetGrid from '@/components/mobile/MobileWidgetGrid.vue';
import MobileTimeline from '@/components/mobile/MobileTimeline.vue';
import MobileChartSection from '@/components/mobile/MobileChartSection.vue';
import MobileActionPanel from '@/components/mobile/MobileActionPanel.vue';
import MobileProjectSwitcher from '@/components/mobile/MobileProjectSwitcher.vue';
import MobileUserMenu from '@/components/mobile/MobileUserMenu.vue';

// Попапы
import IncomePopup from '@/components/IncomePopup.vue';
import ExpensePopup from '@/components/ExpensePopup.vue';
import TransferPopup from '@/components/TransferPopup.vue';

import RetailClosurePopup from '@/components/RetailClosurePopup.vue';
import RefundPopup from '@/components/RefundPopup.vue';



import CellContextMenu from '@/components/CellContextMenu.vue';
import AboutModal from '@/components/AboutModal.vue';

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// IMPORTANT: API_BASE_URL must always point to the API prefix and MUST end with `/api`.
// In prod we must not fall back to localhost.
const _envApiBaseRaw = (import.meta.env.VITE_API_BASE_URL || '').trim();
const _envApiBase = _envApiBaseRaw.replace(/\/+$/, '');

const API_BASE_URL = _envApiBase
  ? (_envApiBase.endsWith('/api') ? _envApiBase : `${_envApiBase}/api`)
  : (isLocalhost ? 'http://localhost:3000/api' : `${window.location.origin.replace(/\/+$/, '')}/api`);

const baseUrlCalculated = API_BASE_URL.replace(/\/api\/?$/, '');
const googleAuthUrl = `${baseUrlCalculated}/auth/google`;

const mainStore = useMainStore();
const uiStore = useUiStore();
const { getWidgetItems } = useWidgetData();

const accountVisibilityMode = computed(() => mainStore.accountVisibilityMode);
const accountVisibilityLabel = computed(() => {
  if (accountVisibilityMode.value === 'hidden') return 'Показывать только скрытые счета';
  if (accountVisibilityMode.value === 'all') return 'Показывать открытые и скрытые счета';
  return 'Показывать только открытые счета';
});
const accountVisibilityIcon = computed(() => accountVisibilityMode.value === 'all' ? 'eye' : 'eye-off');

// --- Refs & State ---
const timelineRef = ref(null);
const chartRef = ref(null);
const layoutBodyRef = ref(null);
const widgetGridRef = ref(null);
const headerTotalsRef = ref(null);

const isWidgetsLoading = ref(true);
const isTimelineLoading = ref(true);
const selectedMonthStart = ref(null);

const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / 86400000);
};

const monthLabelFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const formatMonthLabel = (date) => monthLabelFormatter.format(date);

const setMonthRange = async (baseDate = new Date()) => {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  selectedMonthStart.value = start;

  const shouldShowLoader = !timelineRef.value;
  if (shouldShowLoader) {
    isTimelineLoading.value = true;
  }
  try {
    mainStore.setPeriodFilter({
      mode: 'custom',
      customStart: start.toISOString(),
      customEnd: end.toISOString()
    });

    // 🔥 SMART BUFFER: Calculate buffer based on today's position in month
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isCurrentMonth = today.getFullYear() === start.getFullYear() && today.getMonth() === start.getMonth();
    
    let projectionStart = new Date(start);
    let projectionEnd = new Date(end);
    
    if (isCurrentMonth) {
      // Mobile shows ~4 columns (25vw each), need 2 columns on each side for centering
      const halfCols = 2;
      
      // Days before today in current month
      const dayOfMonth = today.getDate();
      const daysBeforeInMonth = dayOfMonth - 1;
      
      // Days after today in current month
      const lastDayOfMonth = end.getDate();
      const daysAfterInMonth = lastDayOfMonth - dayOfMonth;
      
      // Calculate buffer needed
      const needBefore = Math.max(0, halfCols - daysBeforeInMonth);
      const needAfter = Math.max(0, halfCols - daysAfterInMonth);
      
      if (needBefore > 0) {
        projectionStart = new Date(start);
        projectionStart.setDate(start.getDate() - needBefore);
      }
      
      if (needAfter > 0) {
        projectionEnd = new Date(end);
        projectionEnd.setDate(end.getDate() + needAfter);
      }
    } else {
      // Not current month - small buffer forward
      projectionEnd = new Date(end);
      projectionEnd.setDate(end.getDate() + 3);
    }

    mainStore.setProjectionRange(projectionStart, projectionEnd);
    await mainStore.fetchOperationsRange(projectionStart, projectionEnd);

    // Use today and isCurrentMonth already calculated above
    const centerDate = isCurrentMonth ? today : new Date(start.getFullYear(), start.getMonth(), Math.min(15, end.getDate()));
    mainStore.setCurrentViewDate(centerDate);
  } catch (e) {
    console.error('Failed to set month range:', e);
  } finally {
    if (shouldShowLoader) {
      isTimelineLoading.value = false;
    }
  }
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

const currentMonthLabel = computed(() => {
  const base = selectedMonthStart.value || new Date();
  return formatMonthLabel(base);
});

const prevMonthLabel = computed(() => {
  const base = selectedMonthStart.value || new Date();
  const prev = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  return formatMonthLabel(prev);
});

const nextMonthLabel = computed(() => {
  const base = selectedMonthStart.value || new Date();
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return formatMonthLabel(next);
});

// Состояния попапов
const isIncomePopupVisible = ref(false);
const isExpensePopupVisible = ref(false);
const isTransferPopupVisible = ref(false);

const isRetailPopupVisible = ref(false);
const isRefundPopupVisible = ref(false);
const isTaxDetailsPopupVisible = ref(false);





const operationToEdit = ref(null);
const selectedDate = ref(new Date());
const selectedCellIndex = ref(0);

const showInfoModal = ref(false);
const infoModalTitle = ref('');
const infoModalMessage = ref('');

const isContextMenuVisible = ref(false);
const contextMenuPosition = ref({ top: '0px', left: '0px' });

// =================================================================
// 🟣 AI ассистент (Mobile MVP, read-only)
// =================================================================
const showAiModal = ref(false);
const aiInput = ref('');
const aiMessages = ref([]); // { id, role: 'user'|'assistant', text, copied? }
const aiLoading = ref(false);
const aiPaywall = ref(false);
const aiInputRef = ref(null);
const deepAiMode = ref(false); // Режим глубоких ответов

const aiMessagesBoxRef = ref(null);

const scrollAiToBottom = () => {
  const el = aiMessagesBoxRef.value;
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
};

// Voice input (best-effort; works mostly in Chrome)
const aiSpeechSupported = ref(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
const isAiRecording = ref(false);
let aiRecognition = null;

// Store confirmed voice text at module level so it can be reset on send
let aiVoiceConfirmedText = '';

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
    // Don't auto-focus on mobile to prevent keyboard from opening
  };

  r.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    isAiRecording.value = false;
    aiVoiceConfirmedText = '';
  };

  aiRecognition = r;
  return aiRecognition;
};

const stopAiRecordingIfNeeded = () => {
  if (!isAiRecording.value) return;
  try { aiRecognition?.stop?.(); } catch (_) {}
  isAiRecording.value = false;
  aiVoiceConfirmedText = ''; // Reset voice buffer
};

const toggleAiRecording = () => {
  if (!aiSpeechSupported.value) return;
  if (aiLoading.value) return;

  const r = _ensureAiRecognition();
  if (!r) return;

  if (isAiRecording.value) {
    try { r.stop(); } catch (_) {}
    isAiRecording.value = false;
    return;
  }

  isAiRecording.value = true;
  try { r.start(); } catch (_) { isAiRecording.value = false; }
};

const openAiModal = async () => {
  showAiModal.value = true;
  try { document.body.style.overflow = 'hidden'; } catch (_) {}
  await nextTick();
  // Don't auto-focus on mobile to prevent keyboard from opening
};

const closeAiModal = () => {
  stopAiRecordingIfNeeded();
  try { document.body.style.overflow = ''; } catch (_) {}
  showAiModal.value = false;
};

// Mobile modals
const showProjectsModal = ref(false);
const showUserMenuModal = ref(false);
const showAboutModal = ref(false);

const openProjectsModal = () => {
  showProjectsModal.value = true;
  try { document.body.style.overflow = 'hidden'; } catch (_) {}
};

const closeProjectsModal = () => {
  showProjectsModal.value = false;
  try { document.body.style.overflow = ''; } catch (_) {}
};

const openUserMenuModal = () => {
  showUserMenuModal.value = true;
  try { document.body.style.overflow = 'hidden'; } catch (_) {}
};

const closeUserMenuModal = () => {
  showUserMenuModal.value = false;
  if (!showAboutModal.value && !showProjectsModal.value) {
    try { document.body.style.overflow = ''; } catch (_) {}
  }
};

const openAboutModal = () => {
  showUserMenuModal.value = false; // Ensure menu is closed
  showAboutModal.value = true;
  try { document.body.style.overflow = 'hidden'; } catch (_) {}
};

const closeAboutModal = () => {
  showAboutModal.value = false;
  try { document.body.style.overflow = ''; } catch (_) {}
};

const pushAiMessage = (role, text) => {
  aiMessages.value.push({
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    role,
    text: (text || '').toString(),
    copied: false,
  });
  if (aiMessages.value.length > 50) aiMessages.value.splice(0, aiMessages.value.length - 50);
  nextTick(scrollAiToBottom);
};

const copyAiText = async (msg) => {
  try {
    await navigator.clipboard.writeText(msg.text || '');
    msg.copied = true;
    setTimeout(() => { msg.copied = false; }, 1000);
  } catch (_) {
    alert('Не удалось скопировать');
  }
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

const sendAiMessage = async (forcedMsg = null, opts = {}) => {
  // Vue passes the DOM event object into handlers like @click="sendAiMessage".
  // If we stringify it, we get "[object PointerEvent]" and send garbage to the backend.
  const _isDomEvent = (x) => {
    if (!x || typeof x !== 'object') return false;
    // Most common events we see here: PointerEvent / KeyboardEvent
    return Boolean(x?.type && x?.target);
  };

  const msg = _isDomEvent(forcedMsg)
    ? (aiInput.value || '')
    : (forcedMsg != null ? forcedMsg : (aiInput.value || ''));

  const q = String(msg).trim();
  const source = String(opts.source || 'chat');
  const quickKey = (opts.quickKey != null) ? String(opts.quickKey) : '';
  const mode = (opts.mode === 'deep' || opts.mode === 'freeform')
    ? opts.mode
    : (opts.deep || deepAiMode.value ? 'deep' : 'freeform');
  if (!q || aiLoading.value) return;

  // Guard: do not send AI snapshot while data is still loading (prevents zeros)
  if (isWidgetsLoading.value || isTimelineLoading.value) {
    pushAiMessage('assistant', 'Данные ещё загружаются — повтори запрос через пару секунд.');
    return;
  }

  stopAiRecordingIfNeeded();
  aiPaywall.value = false;

  pushAiMessage('user', q);
  aiInput.value = '';
  aiVoiceConfirmedText = ''; // Reset voice confirmed text
  aiLoading.value = true;

  // 🔥 REMOVED: Prefetch no longer needed - backend queries MongoDB directly!

  try {
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

    // 🔥 SIMPLIFIED: No more uiSnapshot building - backend queries MongoDB directly!
    // This removes 300+ lines of snapshot building code and eliminates race conditions.
    
    // includeHidden/visibleAccountIds теперь рассчитываются в aiClient.js
    const includeHidden = false;
    const visibleAccountIds = null;

    const snapshot = {
      accounts: Array.isArray(mainStore?.currentAccountBalances) ? mainStore.currentAccountBalances : [],
      companies: Array.isArray(mainStore?.companies) ? mainStore.companies : [],
    };

    const res = await fetch(`${API_BASE_URL}/ai/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        message: q, 
        source, 
        quickKey, 
        asOf,
        includeHidden, 
        visibleAccountIds,
        periodFilter: mainStore.periodFilter, // ✅ Pass period filter to backend
        mode,
        snapshot,
        // 🔥 REMOVED: uiSnapshot - backend uses dataProvider.buildDataPacket()
      }),
    });

    if (res.status === 402 || res.status === 403) {
      aiPaywall.value = true;
      pushAiMessage('assistant', 'AI не активирован.');
      return;
    }

    if (!res.ok) {
      const status = res.status;
      if (status === 401) {
        pushAiMessage('assistant', 'Не авторизован. Перезайди в аккаунт.');
      } else if (status === 403 || status === 402) {
        pushAiMessage('assistant', 'AI не активирован.');
      } else {
        // Try to show backend reason (helps debug 400 quickly)
        let detail = '';
        try {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('application/json')) {
            const j = await res.json();
            detail = j?.error || j?.message || (typeof j?.text === 'string' ? j.text : '');
          } else {
            detail = (await res.text()) || '';
          }
        } catch (_) {}

        if (detail) pushAiMessage('assistant', `Ошибка (${status}). ${detail}`);
        else pushAiMessage('assistant', `Ошибка (${status}). Повтори запрос.`);
      }
      return;
    }

    const data = await res.json();
    pushAiMessage('assistant', data?.text || 'Ок.');
  } catch (_) {
    pushAiMessage('assistant', 'Ошибка. Повтори запрос.');
  } finally {
    aiLoading.value = false;
    await nextTick();
    scrollAiToBottom();
  }
};

const runAiQuick = async (preset) => {
  // Быстрый запрос: не пишем в инпут, отправляем напрямую
  aiInput.value = '';
  await nextTick();
  await sendAiMessage(preset, { source: 'quick_button' });
};

// Автоскролл: держим чат внизу при новых сообщениях и при открытии окна
watch(
  () => aiMessages.value.length,
  async () => {
    await nextTick();
    scrollAiToBottom();
  }
);

watch(
  () => showAiModal.value,
  async (isOpen) => {
    if (!isOpen) return;
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

// --- Scroll Sync Logic ---
let isTimelineScrolling = false;
let isChartScrolling = false;
let syncTimeout = null;

const onTimelineScroll = (event) => {
  if (isChartScrolling) return;
  isTimelineScrolling = true;
  if (chartRef.value) { chartRef.value.setScroll(event.target.scrollLeft); }
  clearTimeout(syncTimeout); syncTimeout = setTimeout(() => { isTimelineScrolling = false; }, 150);
  
  // 🔴 NEW: Auto-expand timeline when scrolling near edges (mobile)
  autoExpandMobileTimeline(event.target);
};

const onChartScroll = (left) => {
  if (isTimelineScrolling) return;
  isChartScrolling = true;
  const el = timelineRef.value?.$el.querySelector('.timeline-scroll-area');
  if (el) { el.scrollLeft = left; }
  clearTimeout(syncTimeout); syncTimeout = setTimeout(() => { isChartScrolling = false; }, 150);
  
  // 🔴 NEW: Auto-expand timeline when scrolling near edges (mobile)
  autoExpandMobileTimeline(el);
};

// 🔥 DISABLED: Auto-expand is disabled — диапазон задает переключатель месяцев
// Это единственная точка правды по периоду и убирает "прыжки" баланса
let expandDebounce = null;
let lastScrollCenter = 0;
let expansionMode = 'neutral'; // Kept for potential future use
let justReset = false;
let lastEdge = null;

const autoExpandMobileTimeline = (scrollElement) => {
  // Disabled - диапазон меняется только через переключатель месяцев
  return;
};

let isExpanding = false;

const initScrollSync = () => {
    if (!timelineRef.value) return;
    const el = timelineRef.value.$el.querySelector('.timeline-scroll-area');
    if (el) {
        el.removeEventListener('scroll', onTimelineScroll);
        el.addEventListener('scroll', onTimelineScroll, { passive: true });
    }
};

// =================================================================
// 🟢 ЛОГИКА РЕСАЙЗА (ВЫСОТА ТАЙМЛАЙНА)
// =================================================================
const timelineHeight = ref(240); // Начальная высота таймлайна
const isResizing = ref(false);
const startY = ref(0);
const startHeight = ref(0);

// Computed: determine if charts are collapsed based on timeline height
const isMobileChartsCollapsed = computed(() => {
    if (!layoutBodyRef.value) return false;
    const bodyH = layoutBodyRef.value.clientHeight;
    const widgetsH = document.querySelector('.section-widgets')?.clientHeight || 0;
    const containerH = bodyH - widgetsH;
    // If timeline takes more than 70% of space, charts are collapsed
    return timelineHeight.value > containerH * 0.7;
});

const onResizerStart = (e) => {
    // If somehow we were left in resizing mode, reset first
    if (isResizing.value) {
        isResizing.value = false;
    }

    isResizing.value = true;
    document.body.classList.add('is-resizing');

    // TouchEvent vs Pointer/Mouse
    const y = (e && e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
    startY.value = y;
    startHeight.value = timelineHeight.value;

    // Prevent page gestures while drag starts (only when cancelable)
    if (e && e.cancelable) e.preventDefault();

    // IMPORTANT (iOS standalone): capture pointer so we always receive pointerup
    if (e && e.pointerId !== undefined && e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function') {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    }

    document.body.style.userSelect = 'none';
};

const onResizerMove = (e) => {
    if (!isResizing.value) return;

    // If touch ended/canceled but we missed the end event, unlock resizing
    if (e && e.touches && e.touches.length === 0) {
        onResizerEnd();
        return;
    }

    // Prevent scroll while resizing (only when cancelable)
    if (e && e.cancelable) e.preventDefault();

    const currentY = (e && e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
    if (typeof currentY !== 'number') return;

    const delta = currentY - startY.value;
    const distance = Math.abs(delta);
    
    // Only resize if moved more than threshold (5px)
    if (distance > 5) {
        const newHeight = startHeight.value + delta;

        const MIN_HEIGHT = 100;

        let MAX_HEIGHT = 500;
        if (layoutBodyRef.value) {
            const bodyH = layoutBodyRef.value.clientHeight;
            const widgetsH = document.querySelector('.section-widgets')?.clientHeight || 0;
            MAX_HEIGHT = bodyH - widgetsH - 150; // Leave 150px minimum for charts
        }

        if (newHeight >= MIN_HEIGHT && newHeight <= MAX_HEIGHT) {
            timelineHeight.value = newHeight;
        }
    }
};

const onResizerEnd = () => {
    if (isResizing.value) {
        // Check if this was a click (no significant movement)
        const delta = Math.abs(timelineHeight.value - startHeight.value);
        const wasClick = delta <= 5;
        
        isResizing.value = false;
        document.body.classList.remove('is-resizing');
        document.body.style.userSelect = '';
        
        // If it was a click, toggle charts expansion
        if (wasClick) {
            toggleMobileChartsExpansion();
        }
    }
};

const toggleMobileChartsExpansion = () => {
    if (!layoutBodyRef.value) return;
    
    const bodyH = layoutBodyRef.value.clientHeight;
    const widgetsH = document.querySelector('.section-widgets')?.clientHeight || 0;
    const containerH = bodyH - widgetsH;
    
    // Toggle between expanded (default ~250px) and collapsed (minimum 150px for charts visibility)
    const isCurrentlyExpanded = timelineHeight.value < containerH * 0.7;
    
    if (isCurrentlyExpanded) {
        // Collapse charts: maximize timeline, but keep charts at 150px minimum
        timelineHeight.value = containerH - 150;
    } else {
        // Expand charts: balance the space
        timelineHeight.value = 250;
    }
};

const forceEndResize = () => {
    if (isResizing.value) onResizerEnd();
};

const initializeMobileView = async () => {
    // 1. Проверка авторизации
    await mainStore.checkAuth();
    if (!mainStore.user) {
        return;
    }

    // 2. Устанавливаем текущий день и диапазон месяца
    const today = new Date();
    mainStore.setToday(getDayOfYear(today));

    isTimelineLoading.value = true;
    try {
        await setMonthRange(today);
    } catch (e) {
        console.error("Timeline Load Error:", e);
    } finally {
        isTimelineLoading.value = false;
        nextTick(() => {
            initScrollSync();
        });
    }
    
    // 4. Загрузка виджетов В ФОНЕ (после графика)
    console.log('[MOBILE INIT] Timeline ready. Loading widgets in background...');
    isWidgetsLoading.value = true;
    // Don't await - load in background
    setTimeout(async () => {
        try {
            if (typeof mainStore.fetchAllEntities === 'function') {
                await mainStore.fetchAllEntities();
                console.log('[MOBILE INIT] Widgets loaded successfully');
            } else {
                console.error("Critical: mainStore.fetchAllEntities is not a function. Check store initialization.");
            }
        } catch (e) {
            console.error("Widgets Load Error:", e);
        } finally {
            isWidgetsLoading.value = false;
        }
    }, 100); // Small delay to ensure graph renders first
};

onMounted(async () => {
  const meta = document.createElement('meta');
  meta.name = "format-detection";
  meta.content = "telephone=no, date=no, email=no, address=no";
  document.getElementsByTagName('head')[0].appendChild(meta);

  window.addEventListener('touchmove', onResizerMove, { passive: false });
  window.addEventListener('touchend', onResizerEnd);
  window.addEventListener('pointermove', onResizerMove, { passive: false });
  window.addEventListener('pointerup', onResizerEnd);
  window.addEventListener('pointercancel', onResizerEnd);
  // iOS standalone: force end resize on system interruptions
  window.addEventListener('touchcancel', onResizerEnd);
  window.addEventListener('blur', forceEndResize);
  document.addEventListener('visibilitychange', forceEndResize);

  await initializeMobileView();
  
  console.log('[MOBILE INIT] Fast load complete. Month navigation is active.');
  
  // Global click listener to close context menu when clicking outside (including graphs)
  const handleGlobalMobileClick = (e) => {
    if (isContextMenuVisible.value) {
      const contextMenuEl = document.querySelector('.context-menu');
      const clickedOnMenu = contextMenuEl && contextMenuEl.contains(e.target);
      const clickedOnChart = e.target.closest('.section-chart');
      
      // Close if clicked outside menu OR clicked on chart area
      if (!clickedOnMenu || clickedOnChart) {
        isContextMenuVisible.value = false;
      }
    }
  };
  document.addEventListener('click', handleGlobalMobileClick, true);
  
  // Scroll listener to close context menu on scroll
  const handleScrollClose = () => {
    if (isContextMenuVisible.value) {
      isContextMenuVisible.value = false;
    }
  };
  // Listen on window and specific scrollable areas
  window.addEventListener('scroll', handleScrollClose, true);
  document.addEventListener('scroll', handleScrollClose, true);
  
  // Store reference for cleanup
  onBeforeUnmount(() => {
    document.removeEventListener('click', handleGlobalMobileClick, true);
    window.removeEventListener('scroll', handleScrollClose, true);
    document.removeEventListener('scroll', handleScrollClose, true);
  });
});

onUnmounted(() => {
    const el = timelineRef.value?.$el.querySelector('.timeline-scroll-area');
    if (el) el.removeEventListener('scroll', onTimelineScroll);
    document.removeEventListener('click', handleFilterClickOutside, true);

    window.removeEventListener('touchmove', onResizerMove);
    window.removeEventListener('touchend', onResizerEnd);
    window.removeEventListener('pointermove', onResizerMove);
    window.removeEventListener('pointerup', onResizerEnd);
    window.removeEventListener('pointercancel', onResizerEnd);
    window.removeEventListener('touchcancel', onResizerEnd);
    window.removeEventListener('blur', forceEndResize);
    document.removeEventListener('visibilitychange', forceEndResize);
});

const activeWidgetKey = ref(null);
const isWidgetFullscreen = computed(() => !!activeWidgetKey.value);

watch(isWidgetFullscreen, (isOpen) => {
    if (isOpen) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; nextTick(() => { setTimeout(() => { initScrollSync(); }, 150); }); }
});

const activeWidgetTitle = computed(() => { if (!activeWidgetKey.value) return ''; const w = mainStore.allWidgets.find(x => x.key === activeWidgetKey.value); return w ? w.name : 'Виджет'; });
const isFilterOpen = ref(false); const filterBtnRef = ref(null); const filterDropdownRef = ref(null); const filterPos = ref({ top: '0px', right: '16px' });

// Use uiStore for persistent filter state (per widget)
const sortMode = computed(() => activeWidgetKey.value ? uiStore.getWidgetSortMode(activeWidgetKey.value) : 'default'); 
const filterMode = computed(() => activeWidgetKey.value ? uiStore.getWidgetFilterMode(activeWidgetKey.value) : 'all');
const isFilterActive = computed(() => sortMode.value !== 'default' || filterMode.value !== 'all');

const updateFilterPosition = () => { if (filterBtnRef.value) { const rect = filterBtnRef.value.getBoundingClientRect(); filterPos.value = { top: `${rect.bottom + 5}px`, left: `${Math.min(rect.left, window.innerWidth - 170)}px` }; } };
const toggleFilter = (event) => { if (isFilterOpen.value) { isFilterOpen.value = false; } else { if (event && event.currentTarget) { nextTick(() => updateFilterPosition()); } isFilterOpen.value = true; } };
const handleFilterClickOutside = (event) => { const insideTrigger = filterBtnRef.value && filterBtnRef.value.contains(event.target); const insideDropdown = filterDropdownRef.value && filterDropdownRef.value.contains(event.target); if (!insideTrigger && !insideDropdown) { isFilterOpen.value = false; } };
watch(isFilterOpen, (isOpen) => { if (isOpen) { nextTick(() => { updateFilterPosition(); document.addEventListener('click', handleFilterClickOutside, true); window.addEventListener('scroll', updateFilterPosition, true); }); } else { document.removeEventListener('click', handleFilterClickOutside, true); window.removeEventListener('scroll', updateFilterPosition, true); } });
const setSortMode = (mode) => { 
    if (activeWidgetKey.value) uiStore.setWidgetSortMode(activeWidgetKey.value, mode); 
    isFilterOpen.value = false; 
};
const setFilterMode = (mode) => { 
    if (activeWidgetKey.value) uiStore.setWidgetFilterMode(activeWidgetKey.value, mode); 
    isFilterOpen.value = false; 
};
const showFutureBalance = computed({ get: () => activeWidgetKey.value ? (mainStore.dashboardForecastState[activeWidgetKey.value] ?? false) : false, set: (val) => { if (activeWidgetKey.value) mainStore.setForecastState(activeWidgetKey.value, val); } });
const isListWidget = computed(() => { const k = activeWidgetKey.value; return ['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(k); });
const isWidgetDeltaMode = computed(() => { const k = activeWidgetKey.value; return ['contractors', 'projects', 'individuals', 'categories'].includes(k); });
const getValueClass = (val) => { const num = Number(val) || 0; if (num < 0) return 'red-text'; return 'white-text'; };
const getDeltaClass = (val) => { const num = Number(val) || 0; if (num === 0) return 'white-text'; return num > 0 ? 'green-text' : 'red-text'; };

// ===== Sticky footer totals for Contractors/Projects/Individuals/Categories (Mobile Fullscreen) =====
const isTotalsWidget = computed(() => {
  const k = activeWidgetKey.value;
  return ['contractors', 'projects', 'individuals', 'categories'].includes(k);
});

const _sumBySign = (list, getter, sign) => {
  if (!Array.isArray(list) || !list.length) return 0;
  let total = 0;
  for (const item of list) {
    const v = Number(getter(item)) || 0;
    if (sign === 'pos') {
      if (v > 0) total += v;
    } else {
      if (v < 0) total += Math.abs(v);
    }
  }
  return total;
};

const _getFactVal = (item) => {
  const v = (item && item.currentBalance !== undefined) ? item.currentBalance : (item?.balance);
  return Number(v) || 0;
};

const _getPlanVal = (item) => {
  // Prefer delta (futureChange). Fallback to (futureBalance - currentBalance) if available.
  if (item && item.futureChange !== undefined) return Number(item.futureChange) || 0;
  const fb = Number(item?.futureBalance);
  const cb = Number((item && item.currentBalance !== undefined) ? item.currentBalance : item?.balance);
  if (!Number.isNaN(fb) && !Number.isNaN(cb)) return fb - cb;
  return 0;
};

const widgetFooterTotals = computed(() => {
  if (!isTotalsWidget.value) return null;
  const list = activeWidgetItems.value || [];
  return {
    factExpense: _sumBySign(list, _getFactVal, 'neg'),
    factIncome: _sumBySign(list, _getFactVal, 'pos'),
    planExpense: _sumBySign(list, _getPlanVal, 'neg'),
    planIncome: _sumBySign(list, _getPlanVal, 'pos'),
  };
});

const formatSignedFooter = (amount, sign) => {
  const num = Math.abs(Number(amount) || 0);
  return `${sign} ${formatNumber(num)} ₸`;
};

const activeWidgetItems = computed(() => {
  const k = activeWidgetKey.value; if (!k) return [];
  if (!isListWidget.value) {
      const items = getWidgetItems(k, showFutureBalance.value);
      let filtered = [...items];
      const getFilterVal = (i) => { if (showFutureBalance.value && i.totalForecast !== undefined) return i.totalForecast; return i.balance !== undefined ? i.balance : i.currentBalance; };
      if (filterMode.value === 'positive') filtered = filtered.filter(i => getFilterVal(i) > 0);
      else if (filterMode.value === 'negative') filtered = filtered.filter(i => getFilterVal(i) < 0);
      else if (filterMode.value === 'nonZero') filtered = filtered.filter(i => getFilterVal(i) !== 0);
      if (k === 'companies') { filtered = filtered.map(i => ({ ...i, subName: i.linkTooltip ? i.linkTooltip.replace('Счета: ', '') : '' })); }
      const getSortVal = (i) => getFilterVal(i);
      if (sortMode.value === 'desc') filtered.sort((a, b) => getSortVal(b) - getSortVal(a));
      else if (sortMode.value === 'asc') filtered.sort((a, b) => getSortVal(a) - getSortVal(b));
      return filtered;
  } else {
      let list = []; if (k === 'incomeList') list = showFutureBalance.value ? mainStore.futureIncomes : mainStore.currentIncomes; else if (k === 'expenseList') list = showFutureBalance.value ? mainStore.futureExpenses : mainStore.currentExpenses; else if (k === 'withdrawalList') list = showFutureBalance.value ? mainStore.futureWithdrawals : mainStore.currentWithdrawals; else if (k === 'transfers') list = showFutureBalance.value ? mainStore.futureTransfers : mainStore.currentTransfers;
      const mappedList = list.map(op => { let name = op.categoryId?.name || 'Без категории'; let subName = ''; if (op.type === 'transfer' || op.isTransfer) { const fromAcc = mainStore.accounts.find(a => a._id === (op.fromAccountId?._id || op.fromAccountId)); const toAcc = mainStore.accounts.find(a => a._id === (op.toAccountId?._id || op.toAccountId)); name = 'Перевод'; subName = `${fromAcc?.name || '?'} -> ${toAcc?.name || '?'}`; } else if (op.isWithdrawal) { name = 'Вывод средств'; subName = op.destination || op.description || ''; } else { const contractor = op.contractorId?.name || op.counterpartyIndividualId?.name; const project = op.projectId?.name; const desc = op.description; if (contractor) subName = contractor; else if (project) subName = project; else if (desc) subName = desc; } return { _id: op._id, name: name, subName: subName, balance: op.amount, date: op.date, isList: true, isIncome: op.type === 'income', originalOp: op }; });
      mappedList.sort((a, b) => new Date(b.date) - new Date(a.date)); return mappedList;
  }
});
const handleWidgetBack = () => { activeWidgetKey.value = null; isFilterOpen.value = false; };
const onWidgetClick = (key) => { activeWidgetKey.value = key; };
const formatVal = (val) => { const num = Number(val) || 0; const formatted = formatNumber(Math.abs(num)); if (num === 0) return `${formatted} ₸`; if (num < 0) return `- ${formatted} ₸`; return `₸ ${formatted}`; };
const formatDelta = (val) => { const num = Number(val) || 0; if (num === 0) return '0 ₸'; const formatted = formatNumber(Math.abs(num)); if (num > 0) return `+ ${formatted} ₸`; return `- ${formatted} ₸`; };
const formatDateShort = (date) => { if (!date) return ''; const d = new Date(date); return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }); };

const handleShowMenu = (payload) => {
    if (payload.operation) {
        handleEditOperation(payload.operation);
    } else {
        selectedDate.value = payload.date || new Date();
        selectedCellIndex.value = payload.cellIndex || 0;

        // Position menu at center of clicked cell
        const event = payload.event;
        let topStyle = '50%';
        let leftStyle = '50%';
        
        if (event && event.target) {
            const cellRect = event.target.closest('.mobile-cell')?.getBoundingClientRect();
            if (cellRect) {
                // Position at center of cell
                let centerY = cellRect.top + (cellRect.height / 2);
                let centerX = cellRect.left + (cellRect.width / 2);
                
                // Menu approximate dimensions
                const menuWidth = 260;
                const menuHeight = 50;
                const padding = 10;
                
                // Check horizontal boundaries
                const rightEdge = centerX + (menuWidth / 2);
                const leftEdge = centerX - (menuWidth / 2);
                
                if (rightEdge > window.innerWidth - padding) {
                    // Too close to right edge, shift left
                    centerX = window.innerWidth - (menuWidth / 2) - padding;
                } else if (leftEdge < padding) {
                    // Too close to left edge, shift right
                    centerX = (menuWidth / 2) + padding;
                }
                
                // Check vertical boundaries
                const bottomEdge = centerY + (menuHeight / 2);
                const topEdge = centerY - (menuHeight / 2);
                
                if (bottomEdge > window.innerHeight - padding) {
                    // Too close to bottom, shift up
                    centerY = window.innerHeight - (menuHeight / 2) - padding;
                } else if (topEdge < padding) {
                    // Too close to top, shift down
                    centerY = (menuHeight / 2) + padding;
                }
                
                topStyle = `${centerY}px`;
                leftStyle = `${centerX}px`;
            }
        }
        
        contextMenuPosition.value = {
            top: topStyle,
            left: leftStyle,
            transform: 'translate(-50%, -50%)',
            position: 'fixed',
            zIndex: '9999'
        };
        isContextMenuVisible.value = true;
    }
};


const handleEditOperation = (operation) => {
  operationToEdit.value = operation;
  if (operation.dateKey) {
      selectedDate.value = mainStore._parseDateKey(operation.dateKey);
  }
  if (operation.cellIndex !== undefined) {
      selectedCellIndex.value = operation.cellIndex;
  }

  if (mainStore._isTaxPayment(operation)) {
      isTaxDetailsPopupVisible.value = true;
      return;
  }

  if (mainStore._isRetailWriteOff(operation)) {
      isRetailPopupVisible.value = true;
      return;
  }

  const catId = operation.categoryId?._id || operation.categoryId;
  if (mainStore.refundCategoryId && String(catId) === String(mainStore.refundCategoryId)) {
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

const handleContextMenuSelect = (type) => {
    isContextMenuVisible.value = false;
    operationToEdit.value = null;
    if (type === 'income') isIncomePopupVisible.value = true;
    else if (type === 'expense') isExpensePopupVisible.value = true;
    else if (type === 'transfer') isTransferPopupVisible.value = true;
};

const handleOperationDrop = async (dropData) => {
    const { operation, toDateKey, toCellIndex } = dropData;
    if (!operation || !toDateKey) return;
    const oldDateKey = operation.dateKey;
    if (oldDateKey === toDateKey && operation.cellIndex === toCellIndex) return;
    try { await mainStore.moveOperation(operation, oldDateKey, toDateKey, toCellIndex); } catch(e) { console.error("Drop Error:", e); }
};

const handleOperationSave = async ({ mode, id, data }) => { try { if (mode === 'create') { if (data.cellIndex === undefined) { const dateKey = data.dateKey || mainStore._getDateKey(new Date(data.date)); data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); } await mainStore.createEvent(data); } else { await mainStore.updateOperation(id, data); } isIncomePopupVisible.value = false; isExpensePopupVisible.value = false; operationToEdit.value = null; } catch (e) { console.error("Mobile Save Error", e); alert("Ошибка сохранения"); } };
const handleTransferSave = async ({ mode, id, data }) => { try { if (mode === 'create') { if (data.cellIndex === undefined) { const dateKey = mainStore._getDateKey(new Date(data.date)); data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey); } await mainStore.createTransfer(data); } else { await mainStore.updateTransfer(id, data); } isTransferPopupVisible.value = false; } catch (e) { console.error("Mobile Transfer Save Error", e); alert("Ошибка перевода"); } };


const handleItemClick = (item) => {
    if (item.isList && item.originalOp) {
        handleEditOperation(item.originalOp);
    } else if (!item.isList && item.isLinked && item.linkTooltip) {
        infoModalTitle.value = 'Связь'; infoModalMessage.value = item.linkTooltip; showInfoModal.value = true;
    }
};

const handleRetailClosure = async (payload) => { try { const pId = payload.projectId || (payload.projectIds && payload.projectIds.length > 0 ? payload.projectIds[0] : null); await mainStore.closeRetailDaily(payload.amount, new Date(payload.date), pId); isRetailPopupVisible.value = false; } catch (e) { alert('Ошибка: ' + e.message); } };
const handleRetailSave = async ({ id, data }) => { isRetailPopupVisible.value = false; try { const pId = data.projectId || (data.projectIds && data.projectIds.length > 0 ? data.projectIds[0] : null); await mainStore.updateOperation(id, { amount: -Math.abs(data.amount), projectId: pId, date: new Date(data.date) }); } catch (e) { alert('Ошибка сохранения списания: ' + e.message); } };
const handleRetailDelete = async (op) => { isRetailPopupVisible.value = false; try { await mainStore.deleteOperation(op); } catch (e) { alert('Ошибка удаления'); } };
const handleRefundSave = async ({ mode, id, data }) => { isRefundPopupVisible.value = false; try { if (mode === 'create') await mainStore.createEvent(data); else await mainStore.updateOperation(id, data); } catch (e) { alert('Ошибка сохранения возврата'); } };
const handleRefundDelete = async (op) => { isRefundPopupVisible.value = false; try { await mainStore.deleteOperation(op); } catch (e) { alert('Ошибка удаления'); } };
const handleClosePopup = () => { isIncomePopupVisible.value = false; isExpensePopupVisible.value = false; operationToEdit.value = null; };

const handleAction = () => {};
const handleOperationDelete = async (op) => {
    if (!op) return;
    try {
        await mainStore.deleteOperation(op);
        handleClosePopup();
    } catch(e) {
        alert("Ошибка удаления: " + e.message);
    }
}

</script>

<template>
  <div class="mobile-layout" @click="(e) => { if (isContextMenuVisible && !e.target.closest('.context-menu')) isContextMenuVisible = false; }">

    <div v-if="mainStore.isAuthLoading" class="loading-screen">
      <div class="spinner"></div>
      <p>Загрузка...</p>
    </div>

    <div v-else-if="!mainStore.user" class="login-screen">
      <div class="login-box">
          <h1>Управляйте финансами легко INDEX12.COM</h1>
          <a :href="googleAuthUrl" class="google-login-button">Войти через Google</a>
      </div>
    </div>

    <template v-else>
        <!-- Fullscreen Widget (Без изменений) -->
        <div v-if="isWidgetFullscreen" class="fullscreen-widget-overlay">
             <div class="fs-header">
                <div class="fs-title">{{ activeWidgetTitle }}</div>
                <div class="fs-controls">
                    <button v-if="activeWidgetKey === 'accounts' && (!mainStore.workspaceRole || mainStore.isWorkspaceOwner || mainStore.isWorkspaceAdmin)" class="action-square-btn" @click="mainStore.cycleAccountVisibilityMode()" :title="accountVisibilityLabel">
                        <svg v-if="accountVisibilityIcon === 'eye'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="2" y1="22" x2="22" y2="2"></line></svg>
                    </button>
                    <button v-if="!isListWidget" ref="filterBtnRef" class="action-square-btn" :class="{ active: isFilterActive }" @click.stop="toggleFilter" title="Фильтр"><svg width="14" height="14" viewBox="0 0 24 24" :fill="isFilterActive ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg></button>
                    <button class="action-square-btn" :class="{ active: showFutureBalance }" @click="showFutureBalance = !showFutureBalance" title="Прогноз"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg></button>
                </div>
            </div>
            <div class="fs-body">
                <div v-if="!activeWidgetItems.length" class="fs-empty">Пусто</div>
                <div class="fs-list">
                    <div v-for="item in activeWidgetItems" :key="item._id" class="fs-item" @click="handleItemClick(item)">
                       <template v-if="item.isList">
                           <div class="fs-item-left"><div class="fs-date">{{ formatDateShort(item.date) }}</div><div class="fs-info-col"><div class="fs-name-text">{{ item.name }}</div><div class="fs-sub-text" v-if="item.subName">{{ item.subName }}</div></div></div>
                           <div class="fs-val" :class="item.isIncome ? 'green-text' : 'red-text'">{{ item.isIncome ? '+' : '-' }} {{ formatNumber(Math.abs(item.balance)) }} ₸</div>
                       </template>
                       <template v-else>
                           <div class="fs-name-col"><div class="fs-name-row"><span v-if="item.linkMarkerColor" class="color-dot" :style="{ backgroundColor: item.linkMarkerColor }"></span><span class="fs-name">{{ item.name }}</span><span v-if="item.isLinked" class="link-icon" style="margin-left: 6px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></span>
                           <span v-if="item.isExcluded" class="excluded-icon" :class="{ 'included-now': mainStore.includeExcludedInTotal }" title="Исключен из общего баланса" style="margin-left: 6px;">
                                <svg v-if="mainStore.includeExcludedInTotal" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                           </span>
                           </div><div v-if="item.subName" class="fs-sub-text-small">{{ item.subName }}</div><div v-if="item.regime" class="fs-regime-badge" :class="item.regime === 'УПР' ? 'badge-upr' : 'badge-our'">{{ item.regime }} {{ item.percent }}%</div></div>
                           <div class="fs-val-block"><div v-if="!showFutureBalance" class="fs-val" :class="getValueClass(item.currentBalance, activeWidgetKey)">{{ formatVal(item.currentBalance) }}</div><div v-else class="fs-val-forecast"><span class="fs-curr" :class="getValueClass(item.currentBalance, activeWidgetKey)">{{ formatVal(item.currentBalance) }}</span><span class="fs-arrow">></span><span v-if="isWidgetDeltaMode" class="fs-fut" :class="getDeltaClass(item.futureChange, activeWidgetKey)">{{ formatDelta(item.futureChange) }}</span><span v-else class="fs-fut" :class="Number(item.futureBalance) < 0 ? 'red-text' : 'white-text'">{{ formatVal(item.futureBalance) }}</span></div></div>
                       </template>
                    </div>
                </div>
            </div>
            <div class="fs-footer">
              <div v-if="isTotalsWidget" class="fs-totals">
                <template v-if="activeWidgetKey === 'projects'">
                  <div class="fs-total-item">
                    <div class="fs-total-label">Прибыль по проектам</div>
                    <div class="fs-total-value green-text">{{ formatSignedFooter(widgetFooterTotals?.factIncome ?? 0, '+') }}</div>
                  </div>
                  <div class="fs-total-item">
                    <div class="fs-total-label">Расходы по проектам</div>
                    <div class="fs-total-value red-text">{{ formatSignedFooter(widgetFooterTotals?.factExpense ?? 0, '-') }}</div>
                  </div>
                  <div class="fs-total-item">
                    <div class="fs-total-label">Планируемая прибыль</div>
                    <div class="fs-total-value green-text">{{ formatSignedFooter(widgetFooterTotals?.planIncome ?? 0, '+') }}</div>
                  </div>
                  <div class="fs-total-item">
                    <div class="fs-total-label">Планируемый расход</div>
                    <div class="fs-total-value red-text">{{ formatSignedFooter(widgetFooterTotals?.planExpense ?? 0, '-') }}</div>
                  </div>
                </template>

                <template v-else>
                  <div class="fs-total-item">
                    <div class="fs-total-label">Фактические доходы</div>
                    <div class="fs-total-value green-text">{{ formatSignedFooter(widgetFooterTotals?.factIncome ?? 0, '+') }}</div>
                  </div>
                  <div class="fs-total-item">
                    <div class="fs-total-label">Фактические расходы</div>
                    <div class="fs-total-value red-text">{{ formatSignedFooter(widgetFooterTotals?.factExpense ?? 0, '-') }}</div>
                  </div>
                  <div class="fs-total-item">
                    <div class="fs-total-label">Планируемые доходы</div>
                    <div class="fs-total-value green-text">{{ formatSignedFooter(widgetFooterTotals?.planIncome ?? 0, '+') }}</div>
                  </div>
                  <div class="fs-total-item">
                    <div class="fs-total-label">Планируемые расходы</div>
                    <div class="fs-total-value red-text">{{ formatSignedFooter(widgetFooterTotals?.planExpense ?? 0, '-') }}</div>
                  </div>
                </template>
              </div>

              <button class="btn-back" @click="handleWidgetBack">Назад</button>
            </div>
            <Teleport to="body"><div v-if="isFilterOpen" class="filter-dropdown-fixed" :style="filterPos" ref="filterDropdownRef" @mousedown.stop @click.stop><div class="filter-group"><div class="filter-group-title">Сортировка</div><ul><li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')"><span>По убыванию</span></li><li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')"><span>По возрастанию</span></li></ul></div><div class="filter-group"><div class="filter-group-title">Фильтр</div><ul><li :class="{ active: filterMode === 'all' }" @click="setFilterMode('all')">Все</li><li :class="{ active: filterMode === 'nonZero' }" @click="setFilterMode('nonZero')">Скрыть 0</li><li :class="{ active: filterMode === 'positive' }" @click="setFilterMode('positive')">Только (+)</li><li :class="{ active: filterMode === 'negative' }" @click="setFilterMode('negative')">Только (-)</li></ul></div></div></Teleport>
        </div>

        <div class="main-content-view">
            <!-- Hide balance card for manager -->
            <MobileHeaderTotals v-if="mainStore.workspaceRole !== 'manager'" ref="headerTotalsRef" class="fixed-header" />

            <div class="layout-body" ref="layoutBodyRef">
              <MobileWidgetGrid ref="widgetGridRef" class="section-widgets" :class="{ 'expanded-widgets': mainStore.isHeaderExpanded }" @widget-click="onWidgetClick" />

              <!-- Timeline with role-based readonly for analyst, fullscreen for manager -->
              <div 
                class="section-timeline" 
                :class="{ 
                  'analyst-readonly': mainStore.workspaceRole === 'analyst',
                  'manager-fullscreen': mainStore.workspaceRole === 'manager'
                }"
                v-show="!mainStore.isHeaderExpanded" 
                :style="{ height: timelineHeight + 'px', flexShrink: 0 }"
              >
                <div v-if="isTimelineLoading" class="section-loading"><div class="spinner-small"></div></div>
                <MobileTimeline v-else ref="timelineRef" @show-menu="handleShowMenu" @drop-operation="handleOperationDrop" />
              </div>

              <!-- Hide resizer for manager (no charts to resize) -->
              <div 
                v-if="mainStore.workspaceRole !== 'manager'"
                class="timeline-resizer"
                :class="{ 'collapsed': isMobileChartsCollapsed }" 
                v-show="!mainStore.isHeaderExpanded" 
                @pointerdown.stop.prevent="onResizerStart" 
                @touchstart.stop.prevent="onResizerStart" 
                @touchcancel.stop="onResizerEnd"
              >
                  <div class="resizer-handle"></div>
              </div>

              <!-- Hide charts for manager -->
              <div v-if="mainStore.workspaceRole !== 'manager'" class="section-chart" v-show="!mainStore.isHeaderExpanded">
                <div v-if="isTimelineLoading" class="section-loading"><div class="spinner-small"></div></div>
                <MobileChartSection v-else ref="chartRef" @scroll="onChartScroll" />
              </div>
            </div>

            <div class="fixed-footer">
              <MobileActionPanel 
                @action="handleAction" 
                @open-ai="openAiModal"
                @open-projects="openProjectsModal"
                @open-user-menu="openUserMenuModal"
                @prev-month="goPrevMonth"
                @next-month="goNextMonth"
                :current-month-label="currentMonthLabel"
                :prev-month-label="prevMonthLabel"
                :next-month-label="nextMonthLabel"
              />
            </div>
        </div>
    </template>

    <CellContextMenu v-if="isContextMenuVisible" :style="contextMenuPosition" @select="handleContextMenuSelect" />

    <!-- Popups -->
    <InfoModal v-if="showInfoModal" :title="infoModalTitle" :message="infoModalMessage" @close="showInfoModal = false" />
    <IncomePopup v-if="isIncomePopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" :operation-to-edit="operationToEdit" @close="handleClosePopup" @save="handleOperationSave" @operation-deleted="handleOperationDelete" />
    <ExpensePopup v-if="isExpensePopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" :operation-to-edit="operationToEdit" @close="handleClosePopup" @save="handleOperationSave" @operation-deleted="handleOperationDelete" />


    <TransferPopup v-if="isTransferPopupVisible" :date="selectedDate" :cellIndex="selectedCellIndex" :transferToEdit="operationToEdit" @close="isTransferPopupVisible = false" @save="handleTransferSave" />

    <RetailClosurePopup v-if="isRetailPopupVisible" :operation-to-edit="operationToEdit" @close="isRetailPopupVisible = false" @confirm="handleRetailClosure" @save="handleRetailSave" @delete="handleRetailDelete" />
    <RefundPopup v-if="isRefundPopupVisible" :operation-to-edit="operationToEdit" @close="isRefundPopupVisible = false" @save="handleRefundSave" @delete="handleRefundDelete" />


    <!-- Mobile Modals -->
    <MobileProjectSwitcher v-if="showProjectsModal" @close="closeProjectsModal" />
    <MobileUserMenu v-if="showUserMenuModal" @close="closeUserMenuModal" @open-about="openAboutModal" />
    <AboutModal v-if="showAboutModal" @close="closeAboutModal" />

    <!-- 🟣 AI ассистент (Mobile Fullscreen Overlay) -->
    <Teleport to="body">
      <div v-if="showAiModal" class="ai-modal-overlay" @click.self="closeAiModal">
        <div class="ai-modal">
          <div class="ai-modal-header">
            <div class="ai-modal-title">AI ассистент</div>
            <button class="ai-modal-close" @click="closeAiModal" title="Закрыть">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="ai-modal-chips">
            <div class="ai-chip-left">
              <button class="ai-chip" @click="runAiQuick('покажи счета')">Счета</button>
              <button class="ai-chip" @click="runAiQuick('покажи доходы')">Доходы</button>
              <button class="ai-chip" @click="runAiQuick('покажи расходы')">Расходы</button>
              <button class="ai-chip" @click="runAiQuick('покажи переводы')">Переводы</button>
              <button class="ai-chip" @click="runAiQuick('покажи компании')">Компании</button>
              <button class="ai-chip" @click="runAiQuick('покажи проекты')">Проекты</button>
              <button class="ai-chip" @click="runAiQuick('покажи контрагентов')">Контрагенты</button>
              <button class="ai-chip" @click="runAiQuick('покажи категории')">Категории</button>
              <button class="ai-chip" @click="runAiQuick('покажи физлица')">Физлица</button>
            </div>
            <button class="ai-deep-btn" :class="{ active: deepAiMode }" @click="deepAiMode = !deepAiMode">
              Deep
            </button>
          </div>

          <div class="ai-modal-body">
            <div v-if="aiPaywall" class="ai-paywall">
              <div class="ai-paywall-title">AI — платная функция</div>
              <div class="ai-paywall-text">Оплата будет добавлена позже. Сейчас доступ включается вручную.</div>
            </div>

            <div v-else class="ai-modal-messages" ref="aiMessagesBoxRef">
              <div v-for="m in aiMessages" :key="m.id" class="ai-msg" :class="m.role">
                <div class="ai-bubble">{{ m.text }}</div>
                <button v-if="m.role === 'assistant'" class="ai-copy" @click="copyAiText(m)">
                  {{ m.copied ? '✅' : 'Копировать' }}
                </button>
              </div>
              <div v-if="aiLoading" class="ai-typing">Думаю…</div>
            </div>
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
                  :title="aiSpeechSupported ? (isAiRecording ? 'Стоп' : 'Голос') : 'Голос не поддерживается'"
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
                  @click="sendAiMessage()"
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
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
/* 🟢 FIX: Глобальный стиль для предотвращения зума на мобильных. */
/* Принудительный размер шрифта 16px для всех полей ввода. */
/* Это отключает авто-зум в Safari и других мобильных браузерах. */
@media (max-width: 768px) {
  input[type="text"],
  input[type="number"],
  input[type="email"],
  input[type="password"],
  input[type="search"],
  input[type="tel"],
  input[type="url"],
  select,
  textarea,
  .real-input,
  .form-input,
  .create-input {
    font-size: 16px !important;
  }
}
</style>

<style scoped>
.mobile-layout {
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  background-color: var(--color-background, #1a1a1a);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  /* 🟢 FIX: Запрещаем стандартные жесты браузера (зум, свайп назад) */
  touch-action: manipulation;
}
.loading-screen { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; }
.spinner { width: 40px; height: 40px; border: 3px solid #333; border-top-color: var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px; }
.section-loading { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.spinner-small { width: 20px; height: 20px; border: 2px solid #333; border-top-color: var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.login-screen { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #1a1a1a; padding: 20px; box-sizing: border-box; }
.login-box { width: 100%; max-width: 320px; text-align: center; }
.login-box h1 { color: #fff; font-size: 24px; margin-bottom: 10px; font-weight: 700; }
.google-login-button { display: block; width: 100%; padding: 12px; background: #fff; color: #333; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin-bottom: 10px; }
.dev-login-button { display: block; width: 100%; padding: 12px; background: #333; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; border: 1px solid #444; }

/* Fullscreen Styles */
.fullscreen-widget-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: var(--widget-background, #ffffff); z-index: 2000; display: flex; flex-direction: column; }
.fs-header { height: 60px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--widget-border, #e0e0e0); background-color: var(--widget-background, #ffffff); }
.fs-title { font-size: 18px; font-weight: 700; color: var(--color-text, #fff); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
.fs-controls { display: flex; gap: 8px; }
.action-square-btn { width: 32px; height: 32px; border: 1px solid var(--widget-border, #e0e0e0); border-radius: 6px; background-color: var(--widget-background, #ffffff); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; color: var(--text-mute, #888); transition: all 0.2s ease; }
.action-square-btn:hover { background-color: rgba(135,189,233,0.1); color: var(--color-text, #333); }
.action-square-btn.active { background-color: #34c759; color: #fff; border-color: transparent; }
.fs-body { flex-grow: 1; overflow-y: auto; padding: 16px; scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch; background-color: var(--color-background, #ffffff); }
.fs-body::-webkit-scrollbar { display: none; }
.fs-list { display: flex; flex-direction: column; gap: 8px; }
.fullscreen-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background-color: var(--widget-background, #ffffff); border-bottom: 1px solid var(--widget-border, #e0e0e0); flex-shrink: 0; }
.fs-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: var(--widget-background, #ffffff); border: 1px solid var(--widget-border, #e0e0e0); border-radius: 8px; min-height: 44px;}
.fs-name-row { display: flex; align-items: center; overflow: hidden; width: 100%; }
.fs-name-col { display: flex; flex-direction: column; overflow: hidden; flex: 1; justify-content: center; }
.fs-name { font-size: 14px; color: var(--color-text, #fff); font-weight: 600; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-val-block { display: flex; flex-direction: column; align-items: flex-end; margin-left: 10px; }
.fs-val { font-size: 14px; color: var(--color-text, #fff); font-weight: 700; white-space: nowrap; }
.fs-val-forecast { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.fs-curr { color: var(--text-mute, #ccc); font-weight: 500; }
.fs-arrow { color: #666; font-size: 12px; }
.fs-fut { font-weight: 700; color: var(--color-text, #fff); }
.fs-item-left { display: flex; align-items: center; gap: 12px; overflow: hidden; flex: 1; }
.fs-date { color: var(--text-mute, #666); font-size: 11px; min-width: 32px; flex-shrink: 0; text-align: center; line-height: 1.2; }
.fs-info-col { display: flex; flex-direction: column; overflow: hidden; }
.fs-name-text { font-size: 14px; font-weight: 600; color: var(--color-text, #fff); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fs-sub-text { font-size: 11px; color: var(--text-mute, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.fs-sub-text-small { font-size: 11px; color: var(--text-mute, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.color-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; margin-right: 8px; }
.link-icon { display: inline-flex; align-items: center; opacity: 0.8; color: #34c759; }
.excluded-icon { display: inline-flex; align-items: center; opacity: 0.8; color: var(--text-mute, #888); transition: all 0.2s; }
.excluded-icon.included-now { color: #34c759; opacity: 1; text-shadow: 0 0 5px rgba(52, 199, 89, 0.4); }

.red-text { color: #ff3b30 !important; }
.green-text { color: #34c759 !important; }
.white-text { color: var(--color-text, #fff) !important; }
.fs-empty { text-align: center; color: var(--text-mute, #666); margin-top: 50px; }
.fullscreen-body { flex-grow: 1; overflow-y: auto; padding: 12px; background-color: var(--color-background, #ffffff); }
.fs-footer {
  padding: 12px 16px;
  background-color: var(--widget-background, #ffffff);
  border-top: 1px solid var(--widget-border, #e0e0e0);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fs-totals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.fs-total-item {
  min-width: 0;
  padding: 0 10px;
}

/* left column (items 1 and 3) */
.fs-total-item:nth-child(2n+1) {
  padding-left: 0;
  border-right: 1px solid var(--color-border, #444);
}

/* right column (items 2 and 4) */
.fs-total-item:nth-child(2n) {
  padding-right: 0;
}

/* first row spacing */
.fs-total-item:nth-child(-n+2) {
  padding-bottom: 8px;
}

/* second row divider + spacing */
.fs-total-item:nth-child(n+3) {
  border-top: 1px solid var(--color-border, #444);
  padding-top: 8px;
}

.fs-total-label {
  font-size: 10px;
  color: var(--text-mute, #777);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.05;
}

.fs-total-value {
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
  line-height: 1.15;
  margin-top: 3px;
}

.btn-back {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--widget-border, #e0e0e0);
  background: var(--widget-background, #ffffff);
  color: var(--color-text, #fff);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.btn-back:active {
  transform: scale(0.98);
}
.main-content-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; width: 100%; height: 100%; }
.fixed-header, .fixed-footer { flex-shrink: 0; }
.layout-body { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; position: relative; }
.section-widgets { width: 100%; flex-shrink: 0; flex-basis: auto; max-height: 60vh; overflow-y: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
.section-widgets.expanded-widgets { flex: 1 1 0px; min-height: 0; height: auto; max-height: none; padding-bottom: 80px; }
:deep(.widgets-grid) { align-content: start !important; min-height: min-content; }
.section-widgets::-webkit-scrollbar { display: none; }

.section-timeline {
    flex-shrink: 0;
    border-top: 1px solid var(--widget-border, #e0e0e0);
    overflow: hidden;
}

/* Analyst role: readonly timeline */
.section-timeline.analyst-readonly {
  pointer-events: none;
  cursor: not-allowed;
  opacity: 0.9;
}

.section-timeline.analyst-readonly * {
  cursor: not-allowed !important;
}

/* Manager role: timeline takes full available space */
.section-timeline.manager-fullscreen {
  flex-grow: 1 !important;
  height: auto !important;
  min-height: 0 !important;
}

.section-chart {
    flex-grow: 1;
    min-height: 50px;
    border-top: 1px solid var(--widget-border, #e0e0e0);
    overflow: hidden;
}

.timeline-resizer {
  width: 100%;
  height: 30px;
  background-color: var(--widget-background, #ffffff);
  border-top: 1px solid var(--widget-border, #e0e0e0);
  border-bottom: 1px solid var(--widget-border, #e0e0e0);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
  touch-action: none;
  user-select: none;
  position: relative;
}

.timeline-resizer::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-top: 16px solid var(--ui-resizer-dot, #87bde9);
  opacity: 0.7;
  transition: opacity 0.2s, transform 0.2s;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}

.timeline-resizer:active::before {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1.1);
}

/* Rotate triangle when charts collapsed (charts are collapsed, so triangle points up to expand) */
.timeline-resizer.collapsed::before {
  transform: translate(-50%, -50%) rotate(180deg) scale(1.1);
}

.timeline-resizer:active::before {
    background: var(--color-primary, #34c759);
    height: 5px;
}

.fixed-footer {
  flex-shrink: 0;
  z-index: 200;
  background-color: var(--color-background, #1a1a1a);
  box-sizing: border-box;

}
.fs-regime-badge { font-size: 10px; padding: 1px 5px; border-radius: 4px; font-weight: 700; text-transform: uppercase; margin-top: 3px; display: inline-block; width: fit-content; }
.badge-upr { background-color: rgba(52, 199, 89, 0.15); color: #34c759; border: 1px solid rgba(52, 199, 89, 0.3); }
.badge-our { background-color: rgba(255, 157, 0, 0.15); color: #FF9D00; border: 1px solid rgba(255, 157, 0, 0.3); }
/* =====================
   🟣 AI modal (mobile)
   ===================== */
.ai-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 99999;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.ai-modal {
  width: 100%;
  height: 100dvh;
  background: var(--color-background, #1a1a1a);
  border-top-left-radius: 14px;
  border-top-right-radius: 14px;
  border: 1px solid var(--color-border, #444);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-modal-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  background: var(--color-background-soft, #282828);
  border-bottom: 1px solid var(--color-border, #444);
}

.ai-modal-title {
  color: var(--color-text, #fff);
  font-weight: 700;
  font-size: 18px;
}

.ai-modal-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--color-text, #fff);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.ai-modal-close svg { display: block; }

.ai-modal-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ai-chip-left {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.ai-chip {
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--widget-border, #444);
  background: var(--widget-background, #ffffff);
  color: var(--color-text, #fff);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.ai-deep-btn {
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border, #555);
  background: var(--color-background-soft, #1f1f1f);
  color: var(--color-text, #fff);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}
.ai-deep-btn:hover {
  border-color: var(--color-primary, #34c759);
  color: var(--color-primary, #34c759);
}
.ai-deep-btn.active {
  background: var(--color-primary, #34c759);
  border-color: var(--color-primary, #34c759);
  color: #fff;
  box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.18);
}

.ai-modal-body {
  flex: 1;
  min-height: 0;
  padding: 12px 14px;
  overflow: hidden;
  display: flex;
}

.ai-modal-messages {
  width: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 8px;
}

.ai-msg {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-msg.user {
  align-items: flex-end;
}

.ai-msg.user {
  justify-content: flex-end;
}

.ai-msg.assistant {
  align-items: flex-start;
}

.ai-bubble {
  max-width: 75%;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--widget-background, #2c2c2c);
  color: var(--color-text, #e0e0e0);
  font-size: 13px;
  line-height: 1.4;
  word-wrap: break-word;
  white-space: pre-wrap;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.ai-msg.user .ai-bubble {
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-text, #fff);
  border: 1px solid rgba(52, 199, 89, 0.3);
}

.ai-copy {
  margin-top: 4px;
  align-self: flex-start;
  padding: 4px 8px;
  font-size: 11px;
  background: var(--widget-background, #333);
  color: var(--text-mute, #888);
  border: 1px solid var(--widget-border, #444);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.ai-copy:active {
  background: rgba(135,189,233,0.1);
}

.ai-typing {
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  padding: 6px 2px;
}

.ai-paywall {
  width: 100%;
  border: 1px solid var(--color-border, #444);
  background: var(--color-background-soft, #282828);
  border-radius: 12px;
  padding: 14px;
  color: #fff;
}

.ai-paywall-title {
  font-weight: 900;
  font-size: 14px;
  margin-bottom: 6px;
}

.ai-paywall-text {
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  line-height: 1.25;
}

/* GPT-style input area */
.ai-input-container {
  padding: 12px 14px;
  background: var(--widget-background, #1e1e1e);
  border-top: 1px solid var(--widget-border, #333);
}

.ai-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--color-background, #2a2a2a);
  border: 1px solid var(--widget-border, #444);
  border-radius: 20px;
  transition: border-color 0.2s;
}

.ai-input-wrapper:focus-within {
  border-color: rgba(135,189,233,0.5);
}

.ai-attach-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--text-mute, rgba(255,255,255,0.5));
  cursor: not-allowed;
  display: grid;
  align-items: center;
  justify-content: center;
  place-items: center;
  flex-shrink: 0;
  opacity: 0.5;
  -webkit-tap-highlight-color: transparent;
}

.ai-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text, #fff);
  font-size: 14px;
  resize: none;
  max-height: 100px;
  font-family: inherit;
  line-height: 1.4;
}

.ai-input::placeholder {
  color: var(--text-mute, #666);
}

.ai-input-buttons {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  align-items: center;
}

.ai-mic-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: grid;
  align-items: center;
  justify-content: center;
  place-items: center;
  transition: background-color 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.fullscreen-close-btn { background: none; border: none; font-size: 28px; color: var(--color-text, #fff); cursor: pointer; padding: 0; line-height: 1; }

.ai-mic-btn:active {
  background: rgba(135,189,233,0.15);
}

.ai-mic-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-mic-btn.recording {
  color: #fff;
  background: var(--color-primary, #34c759);
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
.ai-mic-btn,
.ai-send-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--widget-background, #333);
  color: var(--color-text, rgba(255,255,255,0.8));
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background-color 0.15s;
  -webkit-tap-highlight-color: transparent;
  justify-content: center;
}

.ai-mic-btn:active {
  background: rgba(135,189,233,0.15);
}

.ai-send-btn {
  background: var(--color-primary, #34c759);
  color: #fff;
}

.ai-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-send-btn:not(:disabled):active {
  background: rgba(52, 199, 89, 0.85);
}

.ai-mic-btn.recording {
  background: var(--color-danger, #ff3b30);
  color: #fff;
  animation: pulse 1.5s ease-in-out infinite;
}

/* Ensure the modal is not constrained by any ancestor stacking/overflow */
.ai-modal-overlay, .ai-modal {
  pointer-events: auto;
}

.ai-modal {
  position: relative;
}

</style>
