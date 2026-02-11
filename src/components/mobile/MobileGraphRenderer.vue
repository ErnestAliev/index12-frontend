<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS } from 'chart.js/auto';
import { 
  downloadTextFile, 
  copyToClipboard, 
  escapeHtml,
  ICON_COPY,
  ICON_EXPORT,
  ICON_CHECK
} from '@/composables/useGraphTooltip.js';

// Unique tooltip element ids per component instance (GraphModal + main chart must not collide)
const TOOLTIP_EL_ID = `chartjs-custom-tooltip-${Math.random().toString(36).slice(2)}`;
const TOOLTIP_STYLE_ID = `${TOOLTIP_EL_ID}-style`;

let tooltipAutoUnpinTimer = null;
const TOOLTIP_PIN_AUTORELEASE_MS = 1800;

const _clearTooltipAutoUnpinTimer = () => {
  if (tooltipAutoUnpinTimer) {
    clearTimeout(tooltipAutoUnpinTimer);
    tooltipAutoUnpinTimer = null;
  }
};

// Mobile-specific tooltip state
let tooltipPinned = false;
let tooltipPinnedKey = '';
let tooltipForceUpdate = false;
let lastTooltipExportText = '';
let lastTooltipExportFilename = 'chart-tooltip.txt';
let tooltipCopyFeedbackTimer = null;

// Tooltip state
let tooltipIsHovering = false;
let lastActiveKey = '';

// Mobile tap detection
let isTouching = false;
let pendingTooltipData = null;

const props = defineProps({
  visibleDays: { type: Array, required: true, default: () => [] },
  animate: { type: Boolean, default: false },
  showSummaries: { type: Boolean, default: true }
});
const emit = defineEmits(['update:yLabels']);

// Normalize visibleDays once so ALL calculations (labels, summaries, segments) use the same indexing.
// This fixes “разрывы/асинхрон” when the range changes (1м/3м) and when some days come in as placeholders.
const normalizedVisibleDays = computed(() => {
  const src = Array.isArray(props.visibleDays) ? props.visibleDays : [];
  return src
    .map((d) => {
      if (!d || !d.date) return null;
      const dt = d.date instanceof Date ? d.date : new Date(d.date);
      if (Number.isNaN(dt.getTime())) return null;
      return { ...d, date: dt };
    })
    .filter(Boolean);
});

const mainStore = useMainStore();
const visibilityMode = computed(() => mainStore.accountVisibilityMode);
const historyLoadTick = ref(0);

const isPersonalTransferWithdrawal = (op) => !!op &&
  op.transferPurpose === 'personal' &&
  op.transferReason === 'personal_use' &&
  (op.isWithdrawal === true || op.isTransfer === true || op.type === 'transfer');

// Начальный баланс (сумма initialBalance по счетам), с учетом флага includeExcludedInTotal
const initialTotalBalance = computed(() => {
  const accs = Array.isArray(mainStore.accounts) ? mainStore.accounts : [];
  let sum = 0;
  for (const a of accs) {
    if (!a) continue;
    if (!mainStore.includeExcludedInTotal && a.isExcluded) continue;
    sum += Number(a.initialBalance || 0);
  }
  return Math.max(0, sum);
});

// Храним детализацию операций по дням для Tooltips (вне chartData, чтобы callbacks могли читать)
const tooltipDetails = ref({
  income: [],
  credit: [],
  prepayment: [],
  expense: [],
  withdrawal: []
});

const resolveAccountById = (accountLike) => {
  if (!accountLike) return null;
  if (typeof accountLike === 'object' && accountLike._id) return accountLike;
  const id = typeof accountLike === 'object' ? accountLike._id : accountLike;
  if (!id) return null;
  const accounts = Array.isArray(mainStore.accounts) ? mainStore.accounts : [];
  return accounts.find((a) => a && String(a._id) === String(id)) || null;
};

const isAccountVisibleInCurrentMode = (accountLike) => {
  const mode = visibilityMode.value;
  if (mode === 'none') return false;
  if (mode === 'all') return true;
  const acc = resolveAccountById(accountLike);
  if (!acc) return true;
  if (mode === 'open') return !acc.isExcluded;
  if (mode === 'hidden') return !!acc.isExcluded;
  return true;
};

// Touch tracking for scroll detection
let touchStartY = 0;
let touchStartX = 0;
let touchMoveDistance = 0;
let isScrolling = false;
let scrollEndTimer = null;

// Block tooltips during range updates
let isRangeUpdating = false;
let rangeUpdateTimer = null;

// Block tooltips during resize
let isResizing = false;
let resizeTimer = null;

// 🟢 1. Хелпер для проверки видимости операции (SAFE)
const isOpVisible = (op) => {
  if (!op) return false;
  // Управленческие родительские сплиты не считаем.
  // Исключенные из итогов скрываем, кроме взаимозачетных расходов (offsetIncomeId),
  // чтобы они попадали в графики и тултипы.
  if (op.excludeFromTotals && !op.offsetIncomeId) return false;
  if (op.isSplitParent) return false;

  // Store-level visibility rules first (delete/legacy/workspace constraints).
  if (typeof mainStore._isOpVisible === 'function' && !mainStore._isOpVisible(op)) return false;

  // Enforce UI account visibility mode strictly for chart and tooltip data.
  const mode = visibilityMode.value;
  if (mode === 'none') return false;
  if (mode === 'all') return true;

  const linked = [op.accountId, op.fromAccountId, op.toAccountId].filter(Boolean);
  if (!linked.length) return true;
  return linked.some((accountLike) => isAccountVisibleInCurrentMode(accountLike));
};

// 🟢 2. Операции для дня из расчетного кэша (fallback — таймлайн)
const getOpsForDateKey = (dateKey) => {
  const calc = mainStore?.calculationCache?.value || mainStore?.calculationCache;
  const fromCalc = calc?.[dateKey];
  if (Array.isArray(fromCalc)) return fromCalc;

  if (typeof mainStore?.getOperationsForDay === 'function') {
    const fromTimeline = mainStore.getOperationsForDay(dateKey);
    if (Array.isArray(fromTimeline)) return fromTimeline;
  }
  return [];
};

// --- Ensure SummaryDay (summaries) does NOT depend on the visible range.
// We must have all historical operations loaded; otherwise the first render (e.g. 12 days) will miss past ops.
// This preloads operations once (shared across GraphModal + main chart instances).
const __OPS_PRELOAD_STATE_KEY = '__index12_ops_preload_state_v1';
const _getOpsPreloadState = () => {
  const g = globalThis;
  if (!g[__OPS_PRELOAD_STATE_KEY]) {
    g[__OPS_PRELOAD_STATE_KEY] = { pending: null, start: null, end: null, loadedAt: 0 };
  }
  return g[__OPS_PRELOAD_STATE_KEY];
};

const _coerceDate = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const _getUserMinEventDate = () => {
  // mainStore.user may contain minEventDate (preferred) or createdAt (fallback)
  const u = mainStore.user;
  const d = _coerceDate(u?.minEventDate || u?.createdAt);
  return d;
};

const _getHistoryEndDate = () => {
  // Итоги/балансы считаем до текущего дня, а не до границы видимого окна (иначе при переключателе 12д -> 1м будут “скачки”)
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

const ensureOpsHistoryForSummaries = async () => {
  try {
    const start = _getUserMinEventDate();
    if (!start) return;

    // Use today + 6 months as the end bound to include future operations
    const end = new Date();
    end.setMonth(end.getMonth() + 6);
    end.setHours(23, 59, 59, 999);

    const st = _getOpsPreloadState();

    // Already loaded enough
    if (st.start && st.end) {
      const loadedStart = _coerceDate(st.start);
      const loadedEnd = _coerceDate(st.end);
      if (loadedStart && loadedEnd && loadedStart.getTime() <= start.getTime() && loadedEnd.getTime() >= end.getTime()) {
        return;
      }
    }

    if (st.pending) {
      try { await st.pending; } catch (e) {}
      return;
    }

    st.pending = (async () => {
      try {
        // Preload full history (past + future 6 months). Use sparse mode to avoid filling thousands of empty days.
        await mainStore.fetchOperationsRange(start, end, { sparse: true });
        st.start = start;
        st.end = end;
        st.loadedAt = (Number(st.loadedAt) || 0) + 1;
      } finally {
        st.pending = null;
      }
    })();

    try { await st.pending; } catch (e) {}

    // Force recompute in this component instance even if mainStore.cacheVersion wasn't bumped.
    historyLoadTick.value = Number(st.loadedAt) || 0;
  } catch (e) {
    // Prevent any uncaught errors from crashing the app
    console.warn('[MobileGraphRenderer] ensureOpsHistoryForSummaries error:', e);
  }
};

onMounted(() => {
  // preload ASAP so the very first 12-day render has correct running balances
  ensureOpsHistoryForSummaries();
  
  // Watch for modal overlays and fullscreen widgets appearing and hide tooltip
  const observer = new MutationObserver(() => {
    const modalOverlay = document.querySelector('.modal-overlay');
    const fullscreenOverlay = document.querySelector('.fullscreen-widget-overlay');
    
    if (modalOverlay || fullscreenOverlay) {
      // Modal or fullscreen widget opened - force hide tooltip
      const tooltipEl = document.getElementById(TOOLTIP_EL_ID);
      if (tooltipEl) {
        tooltipEl.style.opacity = 0;
        tooltipEl.style.pointerEvents = 'none';
      }
      const backdrop = document.getElementById(`${TOOLTIP_EL_ID}-backdrop`);
      if (backdrop) backdrop.classList.remove('visible');
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Also add global click listener to hide tooltip when clicking on modals
  const globalClickHandler = (e) => {
    const tooltipEl = document.getElementById(TOOLTIP_EL_ID);
    if (!tooltipEl) return;
    
    // If clicking on modal overlay or modal content, hide tooltip
    const isModalClick = e.target.classList.contains('modal-overlay') || 
                        e.target.closest('.modal-content') ||
                        e.target.closest('.modal-overlay');
    
    if (isModalClick) {
      tooltipEl.style.opacity = 0;
      tooltipEl.style.pointerEvents = 'none';
      const backdrop = document.getElementById(`${TOOLTIP_EL_ID}-backdrop`);
      if (backdrop) backdrop.classList.remove('visible');
    }
  };
  
  document.addEventListener('click', globalClickHandler, true);
  
  // Add resize listener to block tooltips during resize
  const resizeHandler = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    isResizing = true;
    // Hide tooltip immediately
    const tooltipEl = document.getElementById(TOOLTIP_EL_ID);
    if (tooltipEl) {
      tooltipEl.style.opacity = 0;
      tooltipEl.style.pointerEvents = 'none';
    }
    const backdrop = document.getElementById(`${TOOLTIP_EL_ID}-backdrop`);
    if (backdrop) backdrop.classList.remove('visible');
    
    // Block tooltips for 500ms after resize ends
    resizeTimer = setTimeout(() => {
      isResizing = false;
    }, 500);
  };
  
  window.addEventListener('resize', resizeHandler);
  
  // Watch for theme changes to recreate tooltip with new colors
  const themeObserver = new MutationObserver(() => {
    // Remove existing tooltip and style to force recreation with new theme colors
    const tooltipEl = document.getElementById(TOOLTIP_EL_ID);
    const styleEl = document.getElementById(TOOLTIP_STYLE_ID);
    const backdropEl = document.getElementById(`${TOOLTIP_EL_ID}-backdrop`);
    if (tooltipEl) tooltipEl.remove();
    if (styleEl) styleEl.remove();
    if (backdropEl) backdropEl.remove();
  });
  
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme']
  });
  
  // Cleanup observer and listener on unmount
  onUnmounted(() => {
    observer.disconnect();
    themeObserver.disconnect();
    document.removeEventListener('click', globalClickHandler, true);
    window.removeEventListener('resize', resizeHandler);
  });
});

watch(
  [normalizedVisibleDays, () => mainStore.user?.minEventDate, () => mainStore.user?.createdAt],
  () => {
    ensureOpsHistoryForSummaries();
  },
  { immediate: true }
);

// Watch for range changes to block tooltips temporarily
watch(
  () => props.visibleDays?.length,
  () => {
    if (rangeUpdateTimer) clearTimeout(rangeUpdateTimer);
    isRangeUpdating = true;
    rangeUpdateTimer = setTimeout(() => {
      isRangeUpdating = false;
    }, 800); // Block tooltips for 800ms after range change
  }
);

// ... (externalTooltipHandler logic) ...
const externalTooltipHandler = (context) => {
  let tooltipEl = document.getElementById(TOOLTIP_EL_ID);
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = TOOLTIP_EL_ID;

    // One-time CSS for tooltip buttons (hover + copy feedback)
    let styleEl = document.getElementById(TOOLTIP_STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = TOOLTIP_STYLE_ID;
      styleEl.textContent = `
        #${TOOLTIP_EL_ID} .tt-btn{transition:background .12s ease,border-color .12s ease,transform .04s ease;color:var(--tooltip-text-main);}
        #${TOOLTIP_EL_ID} .tt-btn:hover{border-color:rgba(135,189,233,.9)!important;background:rgba(135,189,233,.25)!important;}
        #${TOOLTIP_EL_ID} .tt-btn:active{transform:translateY(1px);}

        #${TOOLTIP_EL_ID} .tt-ico{display:flex;align-items:center;justify-content:center;}
        #${TOOLTIP_EL_ID} .tt-ico-check{display:none;}

        /* When copy succeeded: show checkmark for a moment */
        #${TOOLTIP_EL_ID}[data-copied="1"][data-copy-status="ok"] .tt-ico-copy{display:none;}
        #${TOOLTIP_EL_ID}[data-copied="1"][data-copy-status="ok"] .tt-ico-check{display:flex;}
        #${TOOLTIP_EL_ID}[data-copied="1"][data-copy-status="ok"] .tt-btn--copy{border-color:rgba(52,199,89,1)!important;background:rgba(52,199,89,.25)!important;}

        /* When copy failed */
        #${TOOLTIP_EL_ID}[data-copied="1"][data-copy-status="fail"] .tt-btn--copy{border-color:rgba(255,59,48,1)!important;background:rgba(255,59,48,.14)!important;}

        /* Mobile overlay mode */
        @media (max-width: 768px) {
          #${TOOLTIP_EL_ID} {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: calc(100vw - 32px) !important;
            max-width: 400px !important;
            max-height: 70vh !important;
            overflow-y: auto !important;
            font-size: 11px !important;
            padding: 16px !important;
            padding-bottom: 60px !important;
            line-height: 1.35 !important;
            border-radius: 12px !important;
            z-index: 10001 !important;
          }
          #${TOOLTIP_EL_ID} .tt-btn {
            width: 28px !important;
            height: 28px !important;
          }
          /* Mobile back button */
          #${TOOLTIP_EL_ID} .tt-mobile-back {
            position: absolute;
            bottom: 12px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(60, 60, 60, 0.9);
            border: 1px solid #555;
            border-radius: 8px;
            color: #fff;
            padding: 10px 32px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s;
          }
          #${TOOLTIP_EL_ID} .tt-mobile-back:active {
            background: rgba(80, 80, 80, 1);
          }
        }
        /* Mobile backdrop */
        #${TOOLTIP_EL_ID}-backdrop {
          display: none;
        }
        @media (max-width: 768px) {
          #${TOOLTIP_EL_ID}-backdrop {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            z-index: 10000;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.15s ease;
          }
          #${TOOLTIP_EL_ID}-backdrop.visible {
            opacity: 1;
            pointer-events: auto;
          }
        }
      `;
      document.head.appendChild(styleEl);
    }

    Object.assign(tooltipEl.style, {
      background: getComputedStyle(document.documentElement).getPropertyValue('--tooltip-bg').trim() || 'rgba(255, 255, 255, 0.98)',
      border: 'none',
      borderRadius: '8px',
      color: getComputedStyle(document.documentElement).getPropertyValue('--tooltip-text-main').trim() || '#1a1a1a',
      opacity: 0,
      pointerEvents: 'auto',
      position: 'absolute',
      zIndex: 1999,
      fontSize: '12px',
      padding: '12px',
      lineHeight: '1.4',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: getComputedStyle(document.documentElement).getPropertyValue('--tooltip-shadow').trim() || '0 6px 20px rgba(0, 0, 0, 0.3)',
      transition: 'opacity .15s ease',
      width: 'max-content',
      maxWidth: 'calc(100% - 20px)',
      boxSizing: 'border-box'
    });
    
    // Create backdrop for mobile overlay
    let backdropEl = document.getElementById(`${TOOLTIP_EL_ID}-backdrop`);
    if (!backdropEl) {
      backdropEl = document.createElement('div');
      backdropEl.id = `${TOOLTIP_EL_ID}-backdrop`;
      document.body.appendChild(backdropEl);
      
      // Click on backdrop dismisses tooltip
      backdropEl.addEventListener('click', () => {
        tooltipPinned = false;
        tooltipPinnedKey = '';
        tooltipForceUpdate = false;
        tooltipEl.style.opacity = 0;
        tooltipEl.style.pointerEvents = 'none';
        backdropEl.classList.remove('visible');
      });
    }
    
    // On mobile, mount tooltip to body for fixed positioning
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      document.body.appendChild(tooltipEl);
    } else {
      // Монтируем tooltip внутрь контейнера canvas, если есть
      const host = context?.chart?.canvas?.parentNode;
      if (host && host.appendChild) host.appendChild(tooltipEl);
      else document.body.appendChild(tooltipEl);
    }
    
    // NOTE: Removed touch event listeners that were interfering with scroll/clicks

    tooltipEl.addEventListener('click', async (e) => {
      const btn = e.target?.closest?.('#chartjs-tooltip-export-btn, #chartjs-tooltip-copy-btn');
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      if (!lastTooltipExportText) return;

      if (btn.id === 'chartjs-tooltip-export-btn') {
        downloadTextFile(lastTooltipExportText, lastTooltipExportFilename);
      } else if (btn.id === 'chartjs-tooltip-copy-btn') {
        const ok = await copyToClipboard(lastTooltipExportText);

        // UI feedback: swap icon to checkmark for ~1s (or red state on failure)
        try {
          tooltipEl.dataset.copied = '1';
          tooltipEl.dataset.copyStatus = ok ? 'ok' : 'fail';
          if (tooltipCopyFeedbackTimer) clearTimeout(tooltipCopyFeedbackTimer);
          tooltipCopyFeedbackTimer = setTimeout(() => {
            try {
              delete tooltipEl.dataset.copied;
              delete tooltipEl.dataset.copyStatus;
            } catch (e) {}
          }, 1000);
        } catch (e) {}
      }
    });
  }

  const tooltipModel = context.tooltip;

  // Mobile: tooltip always clickable when visible
  if (tooltipEl.style.opacity && Number(tooltipEl.style.opacity) > 0) {
    tooltipEl.style.pointerEvents = 'auto';
  }
  
  // Block tooltips when in fullscreen widget mode
  const fullscreenOverlay = document.querySelector('.fullscreen-widget-overlay');
  if (fullscreenOverlay) {
    return;
  }
  
  // Block tooltips during range updates
  if (isRangeUpdating) {
    return;
  }
  
  // Block tooltips during scrolling
  if (isScrolling) {
    return;
  }
  
  // Block tooltips during resize
  if (isResizing) {
    return;
  }

  if (tooltipModel.opacity === 0) {
    // Chart.js wants to hide - but on mobile we let user dismiss via back button/backdrop
    return;
  }

  if (tooltipModel.body) {
    const bodyLines = tooltipModel.body.map((b) => b.lines).flat();

    // If tooltip is pinned, ignore hover updates from other bars (prevents “мешаются”).
    const dp = tooltipModel.dataPoints?.[0];
    const activeKey = dp ? `idx:${dp.dataIndex}` : '';
    if (activeKey) lastActiveKey = activeKey;
    if (tooltipPinned && !tooltipForceUpdate && activeKey && activeKey !== tooltipPinnedKey) {
      return;
    }

    lastTooltipExportText = bodyLines
      .map((l) => (l === '---' ? '----------------' : l))
      .filter((l) => l !== undefined && l !== null)
      .filter((l) => String(l).trim() !== '')
      .join('\n');
    lastTooltipExportFilename = 'chart-tooltip.txt';

    let innerHtml = '';
    bodyLines.forEach((line, i) => {
      if (line === '---') {
        innerHtml += '<div style="height:1px; background: rgba(255,255,255,0.1); margin: 8px 0;"></div>';
        return;
      }
      if (!line) return;

      // 1) Date line (top)
      if (i === 0) {
        const style =
          'color: #888; margin-bottom: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        innerHtml += `<div style="${style}">${escapeHtml(line)}</div>`;
        return;
      }

      // 2) Total line (second line) + actions on the right
      if (i === 1) {
        innerHtml += `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 15px; color: var(--tooltip-text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(line)}</div>
            <div style="display:flex; gap:6px; flex: 0 0 auto;">
              <button class="tt-btn tt-btn--copy" id="chartjs-tooltip-copy-btn" aria-label="Копировать" title="Копировать" style="all:unset; cursor:pointer; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(135,189,233,0.3); border-radius:6px; color:var(--tooltip-text-main); background:rgba(135,189,233,0.08);"><span class="tt-ico tt-ico-copy">${ICON_COPY}</span><span class="tt-ico tt-ico-check">${ICON_CHECK}</span></button>
              <button class="tt-btn tt-btn--export" id="chartjs-tooltip-export-btn" aria-label="Экспорт" title="Экспорт" style="all:unset; cursor:pointer; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(135,189,233,0.3); border-radius:6px; color:var(--tooltip-text-main); background:rgba(135,189,233,0.12);"><span class="tt-ico">${ICON_EXPORT}</span></button>
            </div>
          </div>
        `;
        return;
      }

      // 3) Other lines with color rules
      const defaultColor = getComputedStyle(document.documentElement).getPropertyValue('--tooltip-text-main').trim() || '#333';
      let color = defaultColor;
      let weight = 400;

      // Summary lines
      if (/^\s*Доход:/i.test(line)) {
        color = '#34c759';
        weight = 600;
      } else if (/^\s*Расход:/i.test(line)) {
        color = '#ff3b30';
        weight = 600;
      }

      // Operation lines (we print with + / -)
      if (/^\s*\+/.test(line)) {
        color = '#34c759';
        weight = 500;
      } else if (/^\s*-/.test(line)) {
        color = '#ff3b30';
        weight = 500;
      }

      // Overrides by category keywords
      if (line.includes('Предоплата')) {
        color = '#FF9D00';
        weight = 600;
      }
      if (line.includes('Кредит')) {
        color = '#8FD4FF';
        weight = 600;
      }
      if (line.includes('Вывод средств')) {
        color = '#DE8FFF';
        weight = 600;
      }

      const style = `color:${color}; font-weight:${weight}; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
      innerHtml += `<div style="${style}">${escapeHtml(line)}</div>`;
    });

    // Add mobile back button
    const isMobileNow = window.innerWidth <= 768;
    if (isMobileNow) {
      innerHtml += `<button class="tt-mobile-back" id="chartjs-tooltip-back-btn">Назад</button>`;
    }

    tooltipEl.innerHTML = innerHtml;
    tooltipForceUpdate = false;
    
    // Add back button click handler
    const backBtn = tooltipEl.querySelector('#chartjs-tooltip-back-btn');
    if (backBtn) {
      backBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        tooltipPinned = false;
        tooltipPinnedKey = '';
        tooltipForceUpdate = false;
        tooltipEl.style.opacity = 0;
        tooltipEl.style.pointerEvents = 'none';
        const backdrop = document.getElementById(`${TOOLTIP_EL_ID}-backdrop`);
        if (backdrop) backdrop.classList.remove('visible');
      };
    }
  }

  // Mobile overlay positioning - always show centered overlay
  const backdropEl = document.getElementById(`${TOOLTIP_EL_ID}-backdrop`);
  
  // Mobile: show overlay with backdrop
  tooltipEl.style.opacity = 1;
  if (backdropEl) backdropEl.classList.add('visible');
};

onUnmounted(() => {
  const el = document.getElementById(TOOLTIP_EL_ID);
  if (el) el.remove();

  const styleEl = document.getElementById(TOOLTIP_STYLE_ID);
  if (styleEl) styleEl.remove();

  _clearTooltipAutoUnpinTimer();

  if (tooltipCopyFeedbackTimer) {
    clearTimeout(tooltipCopyFeedbackTimer);
    tooltipCopyFeedbackTimer = null;
  }
});

const _getDayOfYear = (date) => {
  if (!date) return 0;
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start + (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000;
  return Math.floor(diff / 86400000);
};
const _getDateKey = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const doy = _getDayOfYear(date);
  return `${year}-${doy}`;
};

const rawMaxY = computed(() => {
  const _v = mainStore.cacheVersion;

  const days = normalizedVisibleDays.value;
  if (!Array.isArray(days) || days.length === 0) return 1;

  // 🔧 FIX: Use mainStore.dailyChartData to avoid circular dependency with projectionStore
  // (projectionStore is minified to 'pt' in production, causing TDZ errors)
  const chartData = mainStore.dailyChartData;
  if (!chartData) return 1;

  const map = (chartData instanceof Map)
    ? chartData
    : chartData?.value;
  if (!(map instanceof Map)) return 1;

  let max = 0;
  for (const day of days) {
    const key = _getDateKey(day.date);
    const rec = map.get(key);
    if (!rec) continue;

    // учитываем предоплаты в доходах и вывод средств в расходах, чтобы шкала была адекватной
    const inc =
      Math.abs(Number(rec.income || 0)) +
      Math.abs(Number(rec.prepayment || 0));

    const exp = Math.abs(Number(rec.expense || 0)) + Math.abs(Number(rec.withdrawal || 0));

    if (inc > max) max = inc;
    if (exp > max) max = exp;
  }

  return max || 1;
});

function niceStep(rawStep) {
  if (rawStep <= 0) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exp);
  const frac = rawStep / base;
  let niceFrac;
  if (frac <= 1) niceFrac = 1;
  else if (frac <= 2) niceFrac = 2;
  else if (frac <= 5) niceFrac = 5;
  else niceFrac = 10;
  return niceFrac * base;
}
const axisStep = computed(() => {
  const desired = rawMaxY.value / 8;
  return niceStep(desired);
});
const axisMax = computed(() => {
  const maxNeeded = rawMaxY.value;
  const step = axisStep.value;
  const minNiceMax = step * 8;
  if (maxNeeded <= minNiceMax) return minNiceMax;
  const k = Math.ceil(maxNeeded / step);
  const kAligned = Math.max(8, k);
  const kAligned8 = Math.ceil(kAligned / 8) * 8;
  return kAligned8 * step;
});
const yAxisTicks = computed(() => {
  const ticks = [];
  const step = axisStep.value;
  const max = axisMax.value;
  for (let v = max; v >= 0; v -= step) {
    ticks.push(v);
  }
  if (ticks.length > 9) return ticks.slice(0, 9);
  if (ticks.length < 9) {
    while (ticks.length < 9) ticks.push(0);
  }
  return ticks;
});
watch(
  yAxisTicks,
  (ticks) => {
    emit('update:yLabels', ticks);
  },
  { immediate: true }
);



// 🟢 3. НАКОПИТЕЛЬНЫЕ ИТОГИ (SUMMARIES)
// Ключевая цель: summaries НЕ должны зависеть от выбранного окна.
// Мы считаем от начального баланса + ВСЕ операции, которые уже известны (и preloaded выше).

const _cmpDateKey = (ka, kb) => {
  const [y1, d1] = String(ka || '0-0').split('-').map(Number);
  const [y2, d2] = String(kb || '0-0').split('-').map(Number);
  return (y1 - y2) || (d1 - d2);
};

const _asArray = (v) => (Array.isArray(v) ? v : Array.isArray(v?.value) ? v.value : []);

const _unrefAny = (v) => {
  if (!v) return v;
  if (typeof v === 'object' && 'value' in v) return v.value;
  return v;
};
// Все операции, которые участвуют в расчёте баланса (объединяем источники и убираем дубли)
const opsForSummaries = computed(() => {
  const _v = mainStore.cacheVersion;
  const _h = historyLoadTick.value;

  const seen = new Set();
  const out = [];

  const push = (op) => {
    if (!op) return;
    const id = op._id ? String(op._id) : null;
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    out.push(op);
  };

  // Источник для SummaryDay должен включать ВСЮ историю, которую мы подгружаем через fetchOperationsRange.
  // В mainStore это лежит в displayCache, и наружу (в store) обычно прокинуто как displayOperationsFlat.
  // Если в вашем store его нет — строка безопасна (просто будет пустой массив).
  _asArray(mainStore.allKnownOperations).forEach(push);
  _asArray(mainStore.displayOperationsFlat).forEach(push);
  _asArray(mainStore.currentOps).forEach(push);

  const dc = _unrefAny(mainStore.displayCache);
  if (dc && typeof dc === 'object') {
    Object.values(dc).forEach((list) => {
      _asArray(list).forEach(push);
    });
  }

  const cc = _unrefAny(mainStore.calculationCache);
  if (cc && typeof cc === 'object') {
    Object.values(cc).forEach((list) => {
      _asArray(list).forEach(push);
    });
  }

  return out;
});

// Сводка операций по дням (для расчёта running balance)
const dailyAggForSummaries = computed(() => {
  const _v = mainStore.cacheVersion;
  const _h = historyLoadTick.value;

  const ops = opsForSummaries.value;
  const map = new Map();

  const prepayIds = _asArray(mainStore.getPrepaymentCategoryIds);
  const creditCatId = mainStore.creditCategoryId;
  const retailId = mainStore.retailIndividualId;

  const getRec = (key) => {
    if (!map.has(key)) {
      map.set(key, {
        incomeMain: 0,
        prepayment: 0,
        expense: 0,
        withdrawal: 0,
        systemTransferOut: 0
      });
    }
    return map.get(key);
  };

  for (const op of ops) {
    if (!op) continue;
    if (!isOpVisible(op)) continue;

    const isOutOfSystemTransfer = isPersonalTransferWithdrawal(op);

    // Игнорируем переводы (кроме вывода средств)
    if ((op.isTransfer || op.type === 'transfer') && !isOutOfSystemTransfer) continue;

    const dt = _coerceDate(op.date);
    if (!dt) continue;

    const key = _getDateKey(dt);
    const rec = getRec(key);

    const amt = Number(op.amount) || 0;
    const absAmt = Math.abs(amt);

    if (isOutOfSystemTransfer) {
      rec.systemTransferOut += absAmt;
      continue;
    }

    if (op.isWithdrawal) {
      rec.withdrawal += absAmt;
      continue;
    }

    if (op.type === 'expense') {
      // исключаем списания розницы, если так принято в UI
      if (mainStore._isRetailWriteOff && mainStore._isRetailWriteOff(op)) continue;
      if (mainStore._isInterCompanyOp && mainStore._isInterCompanyOp(op)) continue;
      rec.expense += absAmt;
      continue;
    }

    if (op.type === 'income') {
      const catId = op.categoryId?._id || op.categoryId;
      const prepId = op.prepaymentId?._id || op.prepaymentId;
      const isCredit = creditCatId && String(catId) === String(creditCatId);

      const isPrepayCategory =
        (catId && prepayIds.includes(catId)) ||
        (prepId && prepayIds.includes(prepId)) ||
        (op.categoryId && op.categoryId.isPrepayment);

      const isTranche = false;
      const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
      const isRetailPrepay = retailId && String(indId) === String(retailId) && op.isClosed !== true;

      if (!op.isClosed && !isCredit && (isTranche || isPrepayCategory || isRetailPrepay)) {
        rec.prepayment += absAmt;
      } else {
        // Кредит и обычный доход — зелёная часть (incomeMain)
        rec.incomeMain += absAmt;
      }
    }
  }

  return map;
});

// Хронология closing balance по всем известным дням
const closingTimelineForSummaries = computed(() => {
  const _v = mainStore.cacheVersion;
  const _h = historyLoadTick.value;

  const agg = dailyAggForSummaries.value;
  const keys = Array.from(agg.keys()).sort(_cmpDateKey);

  let running = Math.max(0, Number(initialTotalBalance.value || 0));
  const closingByKey = new Map();
  const balances = [];

  for (const k of keys) {
    const rec = agg.get(k);
    const inc = Math.abs(Number(rec?.incomeMain || 0)) + Math.abs(Number(rec?.prepayment || 0));
    const exp =
      Math.abs(Number(rec?.expense || 0)) +
      Math.abs(Number(rec?.withdrawal || 0)) +
      Math.abs(Number(rec?.systemTransferOut || 0));
    running = Math.max(0, running + inc - exp);
    closingByKey.set(k, running);
    balances.push(running);
  }

  return { keys, balances, closingByKey };
});


// NOTE: accountBalancesByDateKey removed - now showing current balances with label instead

const _findLastKeyBefore = (sortedKeys, targetKey) => {
  // returns index of last key < targetKey, or -1
  let lo = 0;
  let hi = sortedKeys.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cmp = _cmpDateKey(sortedKeys[mid], targetKey);
    if (cmp < 0) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
};

const summaries = computed(() => {
  const _v = mainStore.cacheVersion;
  const _h = historyLoadTick.value;

  const daysSrc = normalizedVisibleDays.value;
  if (!Array.isArray(daysSrc) || daysSrc.length === 0) return [];

  const days = [...daysSrc]
    .filter(Boolean)
    .sort((a, b) => {
      const ta = a?.date instanceof Date ? a.date.getTime() : new Date(a?.date).getTime();
      const tb = b?.date instanceof Date ? b.date.getTime() : new Date(b?.date).getTime();
      return ta - tb;
    });

  const agg = dailyAggForSummaries.value;
  const tl = closingTimelineForSummaries.value;
  const tlKeys = Array.isArray(tl?.keys) ? tl.keys : [];
  const tlBalances = Array.isArray(tl?.balances) ? tl.balances : [];
  const closingByKey = tl?.closingByKey instanceof Map ? tl.closingByKey : new Map();

  const initial = Math.max(0, Number(initialTotalBalance.value || 0));

  return days.map((day) => {
    const d = day.date instanceof Date ? day.date : new Date(day.date);
    const dateKey = _getDateKey(d);

    // start balance = closing balance of the last known day before dateKey (or initial)
    const prevIdx = _findLastKeyBefore(tlKeys, dateKey);
    const startBalance = prevIdx >= 0 ? Math.max(0, Number(tlBalances[prevIdx]) || 0) : initial;

    const rec = agg.get(dateKey);

    const incPrepay = Math.abs(Number(rec?.prepayment || 0));
    const incMain = Math.abs(Number(rec?.incomeMain || 0));
    const incTotal = incPrepay + incMain;

    const expTotal = Math.abs(Number(rec?.expense || 0)) + Math.abs(Number(rec?.withdrawal || 0));

    const endBalance = closingByKey.has(dateKey)
      ? Math.max(0, Number(closingByKey.get(dateKey)) || 0)
      : startBalance;

    return {
      date: d.toLocaleDateString('ru-RU', { weekday: 'short', month: 'short', day: 'numeric' }),
      income: incTotal,
      incomeMain: incMain,
      prepayment: incPrepay,
      expense: expTotal,
      balance: endBalance
    };
  });
});

// Баланс на конец дня (из summaries)
const endBalanceValues = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  return arr.map((s) => Number(s?.balance) || 0);
});

// 🟢 PER-ACCOUNT BALANCES BY DATE: Calculate balance for each account on each visible day
const accountBalancesByDateKey = computed(() => {
  const _v = mainStore.cacheVersion;
  const _h = historyLoadTick.value;

  const ops = opsForSummaries.value;
  const accs = Array.isArray(mainStore.accounts) ? mainStore.accounts : [];
  const days = normalizedVisibleDays.value;
  
  // Map: dateKey -> { accountId -> {name, balance} }
  const result = new Map();
  
  // For each visible day, calculate balance of each account at END of that day
  for (const day of days) {
    if (!day?.date) continue;
    const dt = day.date instanceof Date ? day.date : new Date(day.date);
    const dateKey = _getDateKey(dt);
    const dayEndTime = new Date(dt);
    dayEndTime.setHours(23, 59, 59, 999);
    
    const balancesByAccount = {};
    
    // For each account, sum all operations up to and including this day
    for (const acc of accs) {
      if (!acc) continue;
      if (!isAccountVisibleInCurrentMode(acc)) continue;
      
      const accId = String(acc._id);
      let balance = Number(acc.initialBalance || 0);
      
      // Add/subtract all operations for this account up to end of this      
      for (const op of ops) {
        if (!op) continue;
        // ✅ FIX: Don't filter transfers by isOpVisible - handle them separately
        
        const opDate = _coerceDate(op.date);
        if (!opDate || opDate.getTime() > dayEndTime.getTime()) continue;
        
        const amt = Number(op.amount) || 0;
        const absAmt = Math.abs(amt);
        
        // Handle transfers - apply partially based on account visibility
        if (op.isTransfer) {
          // Transfer FROM this account (decreases balance)
          let fromAccId = null;
          if (op.fromAccountId) {
            fromAccId = typeof op.fromAccountId === 'object' ? op.fromAccountId._id : op.fromAccountId;
          }
          if (fromAccId && String(fromAccId) === accId) {
            // Only subtract if the 'from' account is visible
            if (isOpVisible(op, fromAccId)) {
              balance -= absAmt;
            }
            continue;
          }
          
          // Transfer TO this account (increases balance)
          let toAccId = null;
          if (op.toAccountId) {
            toAccId = typeof op.toAccountId === 'object' ? op.toAccountId._id : op.toAccountId;
          }
          if (!isPersonalTransferWithdrawal(op) && toAccId && String(toAccId) === accId) {
            // Only add if the 'to' account is visible
            if (isOpVisible(op, toAccId)) {
              balance += absAmt;
            }
            continue;
          }
          
          // Not related to this account
          continue;
        }
        
        // Handle regular operations (income/expense/withdrawal)
        // Only process if operation is visible
        if (!isOpVisible(op)) continue;
        
        let opAccId = null;
        if (op.accountId) {
          opAccId = typeof op.accountId === 'object' ? op.accountId._id : op.accountId;
        }
        if (!opAccId || String(opAccId) !== accId) continue;
        
        if (op.isWithdrawal || op.type === 'expense') {
          balance -= absAmt;
        } else if (op.type === 'income') {
          balance += amt;
        }
      }
      
      balancesByAccount[accId] = {
        name: acc.name || 'Счет',
        balance: Math.max(0, balance)
      };
    }
    
    result.set(dateKey, balancesByAccount);
  }
  
  return result;
});

// Баланс на начало дня (вчерашний итог): start = end - income + expense
const startBalanceValues = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  return arr.map((s) => {
    const end = Number(s?.balance) || 0;
    const inc = Math.abs(Number(s?.income) || 0);
    const exp = Math.abs(Number(s?.expense) || 0);
    return Math.max(0, end - inc + exp);
  });
});

// Пик дня: peak = start + income (то же самое что end + expense)
const peakBalanceValues = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  return arr.map((s) => {
    const end = Math.max(0, Number(s?.balance) || 0);
    const exp = Math.abs(Number(s?.expense) || 0);
    return Math.max(0, end + exp);
  });
});

// База после расходов: base = start - expense = end - income
const baseAfterExpenseValues = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  return arr.map((s) => {
    const end = Number(s?.balance) || 0;
    const inc = Math.abs(Number(s?.income) || 0);
    return Math.max(0, end - inc);
  });
});

const balanceAxis = computed(() => {
  const _v = mainStore.cacheVersion;
  const startVals = startBalanceValues.value || [];
  const endVals = endBalanceValues.value || [];
  const peakVals = peakBalanceValues.value || [];
  let max = 0;
  for (let i = 0; i < Math.max(startVals.length, endVals.length, peakVals.length); i++) {
    const a = Math.max(0, Number(startVals[i]) || 0);
    const b = Math.max(0, Number(endVals[i]) || 0);
    const p = Math.max(0, Number(peakVals[i]) || 0);
    if (a > max) max = a;
    if (b > max) max = b;
    if (p > max) max = p;
  }
  if (max === 0) return { min: 0, max: 1 };
  const pad = max * 0.08;
  return { min: 0, max: max + pad };
});

// Серый столбик = баланс на начало дня (start = остаток предыдущего дня)
const balanceBarData = computed(() => {
  const _v = mainStore.cacheVersion;
  const vals = startBalanceValues.value;
  return (vals || []).map((v) => Math.max(0, Number(v) || 0));
});

// Серый цвет: если были операции — чуть плотнее
const balanceColors = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  
  // Получаем цвет из CSS переменной
  const balanceColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--graph-line-balance').trim() || '#34c759';
  
  return arr.map((s) => {
    const inc = Math.abs(Number(s?.income) || 0);
    const exp = Math.abs(Number(s?.expense) || 0);
    const hasOps = inc + exp > 0;
    // Используем CSS переменную с разной прозрачностью
    return hasOps ? `${balanceColor}38` : `${balanceColor}1F`; // 38=0.22, 1F=0.12 в hex
  });
});

// 🎭 ВИЗУАЛЬНОЕ СЖАТИЕ (Visual Compression Illusion) - MOBILE
// ЛОГИКА: Доходы ВИЗУАЛЬНО сжимаются, чтобы показать расходы И создать переход на следующий день

// 🟠 Предоплата/транш (floating): ВИЗУАЛЬНО СЖАТА [start, endBalance]
const prepaymentFloatData = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  const startVals = startBalanceValues.value || [];
  const endVals = endBalanceValues.value || [];

  return arr.map((s, i) => {
    const p = Math.abs(Number(s?.prepayment) || 0);
    if (!p) return [0, 0];

    const start = Math.max(0, Number(startVals[i]) || 0);
    const end = Math.max(0, Number(endVals[i]) || 0);
    
    const inc = Math.abs(Number(s?.incomeMain) || 0);
    const totalIncome = p + inc;
    if (totalIncome === 0) return [0, 0];
    
    const ratio = p / totalIncome;
    const visualHeight = end - start;
    const prepayHeight = visualHeight * ratio;
    
    const to = start + prepayHeight;
    if (to <= start) return [0, 0];
    return [start, to];
  });
});

// 🟢 Обычный доход (floating): ВИЗУАЛЬНО СЖАТ [start+prepayPart, endBalance]
const incomeMainFloatData = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  const startVals = startBalanceValues.value || [];
  const endVals = endBalanceValues.value || [];

  return arr.map((s, i) => {
    const inc = Math.abs(Number(s?.incomeMain) || 0);
    if (!inc) return [0, 0];

    const start = Math.max(0, Number(startVals[i]) || 0);
    const end = Math.max(0, Number(endVals[i]) || 0);
    const p = Math.abs(Number(s?.prepayment) || 0);
    
    const totalIncome = p + inc;
    if (totalIncome === 0) return [0, 0];
    
    const ratio = inc / totalIncome;
    const visualHeight = end - start;
    const incHeight = visualHeight * ratio;
    const prepayHeight = visualHeight - incHeight;
    
    const from = start + prepayHeight;
    const to = end;
    if (to <= from) return [0, 0];
    return [from, to];
  });
});

// 🟥 Расход (floating): [endBalance, peak] - показывает "съеденную" часть
const expenseFloatData = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  const startVals = startBalanceValues.value || [];
  const endVals = endBalanceValues.value || [];

  return arr.map((s, i) => {
    const exp = Math.abs(Number(s?.expense) || 0);
    if (!exp) return [0, 0];

    const start = Math.max(0, Number(startVals[i]) || 0);
    const end = Math.max(0, Number(endVals[i]) || 0);
    const prepay = Math.abs(Number(s?.prepayment) || 0);
    const inc = Math.abs(Number(s?.incomeMain) || 0);
    
    const peak = start + prepay + inc;
    
    if (end >= peak) return [0, 0];
    return [end, peak];
  });
});

const prepaymentFloatColors = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  return arr.map((s) => {
    const p = Math.abs(Number(s?.prepayment) || 0);
    return p ? 'rgba(255,157,0,1)' : 'rgba(0,0,0,0)';
  });
});

const incomeMainFloatColors = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  return arr.map((s) => {
    const inc = Math.abs(Number(s?.incomeMain) || 0);
    return inc ? 'rgba(52,199,89,1)' : 'rgba(0,0,0,0)';
  });
});

const expenseFloatColors = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  return arr.map((s) => {
    const exp = Math.abs(Number(s?.expense) || 0);
    return exp ? 'rgba(255,59,48,1)' : 'rgba(0,0,0,0)';
  });
});

const getTooltipOperationList = (ops) => {
  if (!ops || !Array.isArray(ops) || ops.length === 0) return [];
  const sortedOps = [...ops].sort((a, b) => Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0));

  return sortedOps
    .map((op) => {
      if (!op) return null;
      
      // Handle transfers separately
      if (op.isTransfer || op.type === 'transfer') {
        const isOutOfSystemTransfer = isPersonalTransferWithdrawal(op);
        return {
          isTransfer: true,
          isOutOfSystemTransfer,
          fromAccName: op.fromAccountId?.name || op.accountId?.name || '???',
          toAccName: isOutOfSystemTransfer
            ? (op.destination || 'Вне системы')
            : (op.toAccountId?.name || '???'),
          amount: op.amount,
          desc: op.description
        };
      }

      const isTax = mainStore._isTaxPayment ? mainStore._isTaxPayment(op) : false;
      const isCredit = mainStore._isCreditIncome ? mainStore._isCreditIncome(op) : false;

      let catName = op.categoryId?.name || 'Без категории';

      if (isTax) {
        catName = 'Налог';
      } else if (op.isClosed) {
        catName = 'Сделка закрыта (Факт)';
      } else if (op.type === 'income' && !op.isClosed && !isCredit) {
        const prepayIds = mainStore.getPrepaymentCategoryIds || [];
        const catId = op.categoryId?._id || op.categoryId;
        const prepId = op.prepaymentId?._id || op.prepaymentId;
        const isTranche = false;
        const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
        const isRetailPrepay = indId && indId === mainStore.retailIndividualId;

        if (
          isTranche ||
          isRetailPrepay ||
          (catId && prepayIds.includes(catId)) ||
          (prepId && prepayIds.includes(prepId)) ||
          (op.categoryId && op.categoryId.isPrepayment)
        ) {
          catName = isRetailPrepay ? 'Предоплата (Розница)' : 'Предоплата / Транш';
        }
      }

      if (isCredit) catName = 'Кредит';
      if (op.isWithdrawal) catName = 'Вывод средств';

      let compName = '---';
      if (isTax) {
        compName = op.companyId?.name || op.individualId?.name || 'Компания';
      }

      return {
        isIncome: op.type === 'income',
        accName: op.accountId?.name || '???',
        contName: op.contractorId?.name || op.counterpartyIndividualId?.name || '---',
        projName: op.projectId?.name || '---',
        catName: catName,
        amount: op.amount,
        isWithdrawal: op.isWithdrawal,
        isTax: isTax,
        compName: compName,
        desc: op.description
      };
    })
    .filter(Boolean);
};

// 🟢 CHART DATA COMPUTED - SAFE
const chartData = computed(() => {
  const _v = mainStore.cacheVersion;

  const labels = [];
  const incomeData = [];
  const creditIncomeData = [];
  const prepaymentData = [];
  const expenseData = [];
  const withdrawalData = [];

  const incomeDetails = [];
  const creditIncomeDetails = [];
  const prepaymentDetails = [];
  const expenseDetails = [];
  const withdrawalDetails = [];
  const transferDetails = [];

  const safeDays = normalizedVisibleDays.value;
  const prepayIds = mainStore.getPrepaymentCategoryIds || [];
  const creditCatId = mainStore.creditCategoryId;
  const retailId = mainStore.retailIndividualId;

  for (const day of safeDays) {
    const dateKey = _getDateKey(day.date);
    const dayOps = getOpsForDateKey(dateKey).filter(op => op && !op.isDeleted && isOpVisible(op));

    const incomeOps = [];
    const creditOps = [];
    const prepayOps = [];
    const expenseOps = [];
    const withdrawalOps = [];
    const transferOps = [];

    let dayIncomeSum = 0;
    let dayCreditSum = 0;
    let dayPrepaySum = 0;
    let dayExpenseSum = 0;
    let dayWithdrawalSum = 0;

    dayOps.forEach((op) => {
      if (!op) return;
      if (!isOpVisible(op)) return;

      const amt = Number(op.amount) || 0;
      const absAmt = Math.abs(amt);

      if (op.isTransfer) {
        transferOps.push(op);
      } else if (op.isWithdrawal) {
        withdrawalOps.push(op);
        dayWithdrawalSum += absAmt;
      } else if (op.type === 'expense') {
        if (mainStore._isRetailWriteOff && mainStore._isRetailWriteOff(op)) return;
        expenseOps.push(op);
        dayExpenseSum += absAmt;
      } else if (op.type === 'income') {
        const catId = op.categoryId?._id || op.categoryId;
        const prepId = op.prepaymentId?._id || op.prepaymentId;
        const isCredit = creditCatId && String(catId) === String(creditCatId);
        const isPrepayCategory =
          (catId && prepayIds.includes(catId)) ||
          (prepId && prepayIds.includes(prepId)) ||
          (op.categoryId && op.categoryId.isPrepayment);
        const isTranche = false;

        const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
        const isRetailPrepay = retailId && String(indId) === String(retailId) && op.isClosed !== true;

        if (isCredit) {
          creditOps.push(op);
          dayCreditSum += amt;
        } else if (!op.isClosed && (isTranche || isPrepayCategory || isRetailPrepay)) {
          prepayOps.push(op);
          dayPrepaySum += amt;
        } else {
          incomeOps.push(op);
          dayIncomeSum += amt;
        }
      }
    });

    incomeDetails.push(getTooltipOperationList(incomeOps));
    creditIncomeDetails.push(getTooltipOperationList(creditOps));
    prepaymentDetails.push(getTooltipOperationList(prepayOps));
    expenseDetails.push(getTooltipOperationList(expenseOps));
    withdrawalDetails.push(getTooltipOperationList(withdrawalOps));
    transferDetails.push(getTooltipOperationList(transferOps));

    const labelDate = day.date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    labels.push(labelDate);

    incomeData.push(dayIncomeSum);
    creditIncomeData.push(dayCreditSum);
    prepaymentData.push(dayPrepaySum);
    expenseData.push(dayExpenseSum);
    withdrawalData.push(dayWithdrawalSum);
  }

  const balanceBars = (balanceBarData.value || []).slice(0, labels.length);
  const balanceCols = (balanceColors.value || []).slice(0, labels.length);


  // Keep tooltip details accessible for tooltip callbacks
  tooltipDetails.value = {
    income: incomeDetails,
    credit: creditIncomeDetails,
    prepayment: prepaymentDetails,
    expense: expenseDetails,
    withdrawal: withdrawalDetails,
    transfer: transferDetails
  };

  return {
    labels,
    datasets: [
      // 🟢 Баланс (основание) — серый столбик по остатку на НАЧАЛО дня
      {
        type: 'bar',
        label: 'Баланс',
        data: balanceBars,
        backgroundColor: balanceCols,
        yAxisID: 'yBalance',
        order: 0,
        grouped: false,
        barPercentage: 0.92,
        categoryPercentage: 1.0,
        borderSkipped: false
      },
      // 🟥 Расход — "СЪЕДЕННАЯ" часть: [endBalance, peak]
      {
        type: 'bar',
        label: 'Расход',
        data: (expenseFloatData.value || []).slice(0, labels.length),
        backgroundColor: (expenseFloatColors.value || []).slice(0, labels.length),
        yAxisID: 'yBalance',
        order: 6000,
        borderSkipped: false,
        grouped: false,
        barPercentage: 0.92,
        categoryPercentage: 1.0
      },
      // 🟠 Предоплата/транш — оранжевый сегмент над стартом дня
      {
        type: 'bar',
        label: 'Предоплата',
        data: (prepaymentFloatData.value || []).slice(0, labels.length),
        backgroundColor: (prepaymentFloatColors.value || []).slice(0, labels.length),
        yAxisID: 'yBalance',
        order: 4500,
        borderSkipped: false,
        grouped: false,
        barPercentage: 0.92,
        categoryPercentage: 1.0
      },
      // 🟢 Доход — всегда СВЕРХУ (после предоплаты)
      {
        type: 'bar',
        label: 'Доход',
        data: (incomeMainFloatData.value || []).slice(0, labels.length),
        backgroundColor: (incomeMainFloatColors.value || []).slice(0, labels.length),
        yAxisID: 'yBalance',
        order: 5000,
        borderSkipped: false,
        grouped: false,
        barPercentage: 0.92,
        categoryPercentage: 1.0
      }
    ]
  };
});

const chartOptions = computed(() => {
  const yMax = axisMax.value;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: true
    },
    onClick: (event, elements, chart) => {
      const el = document.getElementById(TOOLTIP_EL_ID);

      // Click on empty space -> unpin and hide
      if (!elements || elements.length === 0) {
        tooltipPinned = false;
        tooltipPinnedKey = '';
        tooltipForceUpdate = false;
        if (el && !tooltipIsHovering) el.style.opacity = 0;
        return;
      }

      const usableEl = elements.find((e) => e && e.datasetIndex === 0) || elements[0];
      const key = `idx:${usableEl.index}`;

      // Clicking the same bar toggles pin off
      if (tooltipPinned && tooltipPinnedKey === key) {
        tooltipPinned = false;
        tooltipPinnedKey = '';
        tooltipForceUpdate = false;
        if (el && !tooltipIsHovering) el.style.opacity = 0;
        return;
      }

      const elementsToActivate = [usableEl];

      // Pin to clicked bar
      tooltipPinned = true;
      tooltipPinnedKey = key;
      tooltipForceUpdate = true;

      try {
        const pos = { x: event?.x ?? event?.native?.offsetX, y: event?.y ?? event?.native?.offsetY };
        chart.setActiveElements(elementsToActivate);
        if (chart.tooltip?.setActiveElements) chart.tooltip.setActiveElements(elementsToActivate, pos);
        chart.update('none');
      } catch (e) {}
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: false,
        external: externalTooltipHandler,
        filter: (ctx) => ctx.datasetIndex === 0,
        callbacks: {
          title: () => null,
          label: (context) => {
            // We render ONE unified tooltip based on the base (balance) dataset only.
            if (context.datasetIndex !== 0) return '';
            const index = context.dataIndex;
            const dateLabel = context.chart.data.labels[index];

            const daySum = Array.isArray(summaries.value) ? summaries.value[index] : null;
            const dayIncome = Math.abs(Number(daySum?.income) || 0);
            const dayExpense = Math.abs(Number(daySum?.expense) || 0);
            const dayBalance = Math.max(0, Number(daySum?.balance) || 0);

            // === HEADER: Дата + Общий баланс ===
            const lines = [`${dateLabel}`, `Баланс общий: ${formatNumber(dayBalance)} т`];

            // === ОСТАТКИ ПО СЧЕТАМ (ИСТОРИЧЕСКИЕ) ===
            const day = normalizedVisibleDays.value[index];
            const dateKey = day ? _getDateKey(day.date) : null;
            const dateAccountBalances = dateKey ? accountBalancesByDateKey.value.get(dateKey) : null;
            
            if (dateAccountBalances && Object.keys(dateAccountBalances).length > 0) {
              lines.push('---');
              lines.push('Остатки на счетах:');
              Object.values(dateAccountBalances).forEach(acc => {
                const bal = Number(acc.balance) || 0;
                const name = acc.name || 'Счет';
                lines.push(`${name} — ${formatNumber(bal)} т`);
              });
            } else {
              // Fallback to current balances if no historical data
              const accs = mainStore?.currentAccountBalances || [];
              const visibleAccs = accs.filter(a => {
                if (!a) return false;
                if (!isAccountVisibleInCurrentMode(a)) return false;
                return true;
              });
              
              if (visibleAccs.length > 0) {
                lines.push('---');
                lines.push('Остатки на счетах (текущие):');
                visibleAccs.forEach(acc => {
                  const bal = Number(acc.balance) || 0;
                  const name = acc.name || 'Счет';
                  lines.push(`${name} — ${formatNumber(bal)} т`);
                });
              }
            }

            // === СВОДКА ДОХОД/РАСХОД ===
            if (dayIncome || dayExpense) {
              lines.push('---');
              if (dayIncome) lines.push(`Доход: +${formatNumber(dayIncome)} т`);
              if (dayExpense) lines.push(`Расход: -${formatNumber(dayExpense)} т`);
            }

            // Собираем детализацию (всегда общий tooltip): сначала доходы, потом расходы, потом переводы
            const safeGet = (key) => {
              const arr = tooltipDetails.value?.[key];
              return Array.isArray(arr) && Array.isArray(arr[index]) ? arr[index] : [];
            };

            let incomeDetails = [...safeGet('prepayment'), ...safeGet('credit'), ...safeGet('income')];
            let expenseDetails = [...safeGet('expense'), ...safeGet('withdrawal')];
            let transferDetails = safeGet('transfer');

            const sortByAbs = (a, b) => Math.abs(Number(b?.amount) || 0) - Math.abs(Number(a?.amount) || 0);
            incomeDetails = [...incomeDetails].sort(sortByAbs);
            expenseDetails = [...expenseDetails].sort(sortByAbs);
            transferDetails = [...transferDetails].sort(sortByAbs);

            // ✅ FIX: Show tooltip even if only transfers exist
            if (!incomeDetails.length && !expenseDetails.length && !transferDetails.length) return lines;

            lines.push('---');

            if (incomeDetails.length) {
              lines.push('ДОХОДЫ');
              incomeDetails.forEach((op) => {
                const amountStr = `+${formatNumber(Math.abs(op?.amount || 0))} т`;
                const acc = op?.accName || '—';
                const cont = op?.contName || '—';
                const proj = op?.projName || '—';
                const cat = op?.catName || '—';

                if (op?.isTax) {
                  lines.push(`${amountStr} > Налог: ${op?.compName || 'Компания'}`);
                } else {
                  lines.push(`${amountStr} < ${acc} < ${cont} < ${proj} < ${cat}`);
                }
              });
            }

            if (expenseDetails.length) {
              lines.push('---');
              lines.push('РАСХОДЫ');
              expenseDetails.forEach((op) => {
                const amountStr = `-${formatNumber(Math.abs(op?.amount || 0))} т`;
                const acc = op?.accName || '—';
                const cont = op?.contName || '—';
                const proj = op?.projName || '—';
                const cat = op?.catName || '—';

                if (op?.isTax) {
                  lines.push(`${amountStr} > Налог: ${op?.compName || 'Компания'}`);
                } else if (op?.isWithdrawal) {
                  lines.push(`${amountStr} > ${acc} (Вывод средств)`);
                } else {
                  lines.push(`${amountStr} > ${acc} > ${cont} > ${proj} > ${cat}`);
                }
              });
            }
            
            if (transferDetails.length) {
              lines.push('---');
              lines.push('ПЕРЕВОДЫ');
              transferDetails.forEach((op) => {
                const amountStr = `${formatNumber(Math.abs(op?.amount || 0))} т`;
                const fromAcc = op?.fromAccName || '—';
                const toAcc = op?.toAccName || '—';
                lines.push(`${amountStr}: ${fromAcc} → ${toAcc}`);
              });
            }

            return lines;
          },
          footer: () => null
        }
      }
    },
    scales: {
      x: { stacked: false, display: false },
      y: { stacked: false, max: yMax, min: 0, display: false },
      yBalance: {
        stacked: false,
        display: false,
        min: balanceAxis.value.min,
        max: balanceAxis.value.max,
        grid: { display: false },
        ticks: { display: false }
      }
    }
  };

  if (!props.animate) {
    options.animation = false;
    options.animations = { colors: false, x: false, y: false, tension: false, numbers: false };
    options.transitions = {
      active: { animation: { duration: 0 } },
      resize: { animation: { duration: 0 } },
      show: { animations: { x: { duration: 0 }, y: { duration: 0 } } },
      hide: { animations: { x: { duration: 0 }, y: { duration: 0 } } }
    };
    options.datasets = { bar: { animations: { x: { duration: 0 }, y: { duration: 0 } } } };
    options.plugins.tooltip.animation = { duration: 0 };
  }

  return options;
});

const chartRef = ref(null);

watch(
  [chartData, chartOptions],
  async () => {
    await nextTick();
    const chart = chartRef.value?.chart;
    if (chart) {
      chart.update('none');
    }
  },
  { deep: true }
);
</script>

<template>
  <div class="graph-area" :class="{ 'no-anim': !animate }">
    <div class="chart-wrapper">
      <Bar ref="chartRef" :data="chartData" :options="chartOptions" />
    </div>

    <div v-if="showSummaries" class="summaries-wrapper" :style="{ gridTemplateColumns: `repeat(${summaries.length}, 1fr)` }">
      <div v-for="(day, index) in summaries" :key="index" class="day-summary">
        <div class="day-date">{{ day.date }}</div>
        <div class="day-income">₸ {{ formatNumber(day.income) }}</div>
        <div class="day-expense">₸ {{ formatNumber(day.expense) }}</div>
        <div class="day-balance">₸ {{ formatNumber(day.balance) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-area {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.no-anim,
.no-anim * {
  transition: none !important;
  animation: none !important;
}
.chart-wrapper {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background-color: var(--chart-wrapper-bg);
}
.summaries-wrapper {
  flex: 0 0 90px;
  height: 90px;
  background-color: var(--day-summary-bg);
  border-top: 1px solid var(--color-border);
  overflow: hidden;
  display: grid;
  width: 100%;
}
:deep(canvas) {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
}
.day-summary {
  padding: 8px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-size: 0.8em;
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}
.day-date {
  color: var(--day-summary-date);
  font-weight: bold;
  margin-bottom: 5px;
}
.day-income {
  color: var(--color-primary);
  font-weight: 500;
}
.day-expense {
  color: var(--color-danger);
  font-weight: 500;
}
.day-balance {
  color: var(--day-summary-balance-value);
  font-weight: 500;
  margin-top: 5px;
}
</style>
