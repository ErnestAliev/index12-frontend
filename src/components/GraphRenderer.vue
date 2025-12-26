<script setup>
import { computed, ref, watch, nextTick, onUnmounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js/auto';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

// --- Tooltip copy/export helpers ---
let lastTooltipExportText = '';
let lastTooltipExportFilename = 'chart-tooltip.txt';

const _downloadTextFile = (text, filename = 'chart-tooltip.txt') => {
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.warn('[GraphRenderer] tooltip export failed', e);
  }
};

const _copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}

  // Fallback
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
};

// --- Tooltip interaction (hover delay + click-to-pin) ---
let tooltipPinned = false;
let tooltipPinnedKey = '';
let tooltipForceUpdate = false;
let tooltipIsHovering = false;
let tooltipHideTimer = null;
let lastActiveKey = '';
let tooltipPinnedByHover = false;
const TOOLTIP_HIDE_DELAY_MS = 2500;

const _clearTooltipHideTimer = () => {
  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }
};

const ICON_COPY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_EXPORT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const ICON_CHECK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
let tooltipCopyFeedbackTimer = null;

const props = defineProps({
  visibleDays: { type: Array, required: true, default: () => [] },
  animate: { type: Boolean, default: false },
  showSummaries: { type: Boolean, default: true }
});
const emit = defineEmits(['update:yLabels']);

const mainStore = useMainStore();

// Храним детализацию операций по дням для Tooltips (вне chartData, чтобы callbacks могли читать)
const tooltipDetails = ref({
  income: [],
  credit: [],
  prepayment: [],
  expense: [],
  withdrawal: []
});

// 🟢 1. Получаем список ID исключенных счетов (SAFE)
const excludedAccountIds = computed(() => {
  if (mainStore.includeExcludedInTotal) return new Set();
  const ids = new Set();
  if (Array.isArray(mainStore.accounts)) {
    mainStore.accounts.forEach((a) => {
      if (a && a.isExcluded) {
        ids.add(String(a._id)); // Always store as String
      }
    });
  }
  return ids;
});

// 🟢 2. Хелпер для проверки видимости операции (SAFE)
const isOpVisible = (op) => {
  if (!op) return false;
  if (op.accountId) {
    const aId = typeof op.accountId === 'object' ? op.accountId._id : op.accountId;
    if (aId && excludedAccountIds.value.has(String(aId))) return false;
  }
  return true;
};

// ... (externalTooltipHandler logic) ...
const externalTooltipHandler = (context) => {
  let tooltipEl = document.getElementById('chartjs-custom-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'chartjs-custom-tooltip';

    // One-time CSS for tooltip buttons (hover + copy feedback)
    let styleEl = document.getElementById('chartjs-custom-tooltip-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'chartjs-custom-tooltip-style';
      styleEl.textContent = `
        #chartjs-custom-tooltip .tt-btn{transition:background .12s ease,border-color .12s ease,transform .04s ease;}
        #chartjs-custom-tooltip .tt-btn:hover{border-color:rgba(52,199,89,.9)!important;background:rgba(52,199,89,.18)!important;}
        #chartjs-custom-tooltip .tt-btn:active{transform:translateY(1px);}

        #chartjs-custom-tooltip .tt-ico{display:flex;align-items:center;justify-content:center;}
        #chartjs-custom-tooltip .tt-ico-check{display:none;}

        /* When copy succeeded: show checkmark for a moment */
        #chartjs-custom-tooltip[data-copied="1"][data-copy-status="ok"] .tt-ico-copy{display:none;}
        #chartjs-custom-tooltip[data-copied="1"][data-copy-status="ok"] .tt-ico-check{display:flex;}
        #chartjs-custom-tooltip[data-copied="1"][data-copy-status="ok"] .tt-btn--copy{border-color:rgba(52,199,89,1)!important;background:rgba(52,199,89,.25)!important;}

        /* When copy failed */
        #chartjs-custom-tooltip[data-copied="1"][data-copy-status="fail"] .tt-btn--copy{border-color:rgba(255,59,48,1)!important;background:rgba(255,59,48,.14)!important;}
      `;
      document.head.appendChild(styleEl);
    }

    Object.assign(tooltipEl.style, {
      background: 'rgba(26, 26, 26, 0.95)',
      border: '1px solid #444',
      borderRadius: '8px',
      color: 'white',
      opacity: 0,
      pointerEvents: 'auto',
      position: 'absolute',
      zIndex: 9999,
      fontSize: '12px',
      padding: '12px',
      lineHeight: '1.4',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      transition: 'opacity .15s ease',
      width: 'max-content',
      maxWidth: 'calc(100% - 20px)',
      boxSizing: 'border-box'
    });
    // Монтируем tooltip внутрь контейнера canvas, если есть
    const host = context?.chart?.canvas?.parentNode;
    if (host && host.appendChild) host.appendChild(tooltipEl);
    else document.body.appendChild(tooltipEl);

    tooltipEl.addEventListener('click', async (e) => {
      const btn = e.target?.closest?.('#chartjs-tooltip-export-btn, #chartjs-tooltip-copy-btn');
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      if (!lastTooltipExportText) return;

      if (btn.id === 'chartjs-tooltip-export-btn') {
        _downloadTextFile(lastTooltipExportText, lastTooltipExportFilename);
      } else if (btn.id === 'chartjs-tooltip-copy-btn') {
        const ok = await _copyToClipboard(lastTooltipExportText);

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

    tooltipEl.addEventListener('mouseenter', () => {
      tooltipIsHovering = true;
      _clearTooltipHideTimer();

      // Временный pin по ховеру: чтобы tooltip не “убегал”, пока ты целишься в Copy/Export
      if (!tooltipPinned) {
        tooltipPinnedByHover = true;
        tooltipPinned = true;
        tooltipPinnedKey = lastActiveKey || tooltipPinnedKey;
        tooltipForceUpdate = false;
      }
    });

    tooltipEl.addEventListener('mouseleave', () => {
      tooltipIsHovering = false;

      // Снять временный pin (если его включили ховером)
      if (tooltipPinnedByHover) {
        tooltipPinnedByHover = false;
        tooltipPinned = false;
        tooltipPinnedKey = '';
        tooltipForceUpdate = false;
      }

      if (!tooltipPinned) {
        _clearTooltipHideTimer();
        tooltipHideTimer = setTimeout(() => {
          if (!tooltipPinned && !tooltipIsHovering) tooltipEl.style.opacity = 0;
        }, 150);
      }
    });
  }

  const tooltipModel = context.tooltip;
  // Tooltip должен быть кликабельным, пока он видим (иначе невозможно нажать Copy/Export)
  try {
    const visibleNow = Number(tooltipEl.style.opacity || 0) > 0;
    tooltipEl.style.pointerEvents = (tooltipPinned || tooltipIsHovering || visibleNow) ? 'auto' : 'none';
  } catch (e) {}

  if (tooltipModel.opacity === 0) {
    // If the user is moving from chart to tooltip (to click buttons) or tooltip is pinned, keep it visible.
    if (tooltipPinned || tooltipIsHovering) return;

    // Otherwise hide with a small delay so the user can reach the tooltip.
    _clearTooltipHideTimer();
    tooltipHideTimer = setTimeout(() => {
      if (!tooltipPinned && !tooltipIsHovering) tooltipEl.style.opacity = 0;
    }, TOOLTIP_HIDE_DELAY_MS);
    return;
  }

  // Tooltip is visible again; cancel any pending hide.
  _clearTooltipHideTimer();

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

    const _escapeHtml = (s) =>
      String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

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
        innerHtml += `<div style="${style}">${_escapeHtml(line)}</div>`;
        return;
      }

      // 2) Total line (second line) + actions on the right
      if (i === 1) {
        innerHtml += `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 15px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${_escapeHtml(line)}</div>
            <div style="display:flex; gap:6px; flex: 0 0 auto;">
              <button class="tt-btn tt-btn--copy" id="chartjs-tooltip-copy-btn" aria-label="Копировать" title="Копировать" style="all:unset; cursor:pointer; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.18); border-radius:6px; color:#fff; background:rgba(255,255,255,0.06);"><span class="tt-ico tt-ico-copy">${ICON_COPY}</span><span class="tt-ico tt-ico-check">${ICON_CHECK}</span></button>
              <button class="tt-btn tt-btn--export" id="chartjs-tooltip-export-btn" aria-label="Экспорт" title="Экспорт" style="all:unset; cursor:pointer; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.18); border-radius:6px; color:#fff; background:rgba(255,255,255,0.10);"><span class="tt-ico">${ICON_EXPORT}</span></button>
            </div>
          </div>
        `;
        return;
      }

      // 3) Other lines with color rules
      let color = '#ddd';
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
      innerHtml += `<div style="${style}">${_escapeHtml(line)}</div>`;
    });

    tooltipEl.innerHTML = innerHtml;
    tooltipForceUpdate = false;
  }

  // Новое позиционирование: всегда внутри области графика (canvas/chart-wrapper)
  const canvas = context.chart.canvas;
  const host = canvas?.parentNode;

  // Позиционируем относительно host (chart-wrapper), чтобы tooltip НЕ выходил за область графика.
  const canvasRect = canvas.getBoundingClientRect();
  const hostRect = host?.getBoundingClientRect?.() || canvasRect;

  const hostW = host?.clientWidth || hostRect.width || 0;
  const hostH = host?.clientHeight || hostRect.height || 0;

  const tooltipWidth = tooltipEl.offsetWidth;
  const tooltipHeight = tooltipEl.offsetHeight;

  // caretX/Y идут в координатах canvas, переведём в координаты host
  const caretX = (tooltipModel.caretX || 0) + (canvasRect.left - hostRect.left);
  const caretY = (tooltipModel.caretY || 0) + (canvasRect.top - hostRect.top);

  const M = 10; // margin внутри области графика

  let left = caretX;
  let top = caretY;

  // Горизонталь: стараемся быть по центру, но если упираемся в край — прыгаем влево/вправо
  let transformX = '-50%';
  if (left - tooltipWidth / 2 < M) {
    left = M;
    transformX = '0%';
  } else if (left + tooltipWidth / 2 > hostW - M) {
    left = hostW - M;
    transformX = '-100%';
  }

  // Вертикаль: по умолчанию показываем над курсором, но если не влезает — снизу
  top = top - 10;
  let transformY = '-100%';
  if (top - tooltipHeight < M) {
    top = caretY + 18;
    transformY = '0%';
  }
  // Если снизу тоже не влезает — зажимаем внутри
  if (transformY === '0%' && top + tooltipHeight > hostH - M) {
    top = Math.max(M, hostH - M);
    transformY = '-100%';
  }

  tooltipEl.style.transform = `translate(${transformX}, ${transformY})`;
  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = top + 'px';
  tooltipEl.style.opacity = 1;
};

onUnmounted(() => {
  const el = document.getElementById('chartjs-custom-tooltip');
  if (el) el.remove();

  const styleEl = document.getElementById('chartjs-custom-tooltip-style');
  if (styleEl) styleEl.remove();

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
  let max = 0;

  if (!Array.isArray(props.visibleDays)) return 1;

  for (const day of props.visibleDays) {
    if (!day || !day.date) continue;
    const dateKey = _getDateKey(day.date);
    const dayOps = mainStore.getOperationsForDay(dateKey) || [];

    let dayIncome = 0;
    let dayExpense = 0;

    dayOps.forEach((op) => {
      if (!op) return;
      if (!isOpVisible(op)) return;
      if (op.type === 'transfer' || op.isTransfer) return;
      if (op.isWorkAct) return;

      const amt = Math.abs(Number(op.amount) || 0);

      if (op.type === 'income') dayIncome += amt;
      else if (op.type === 'expense' || op.isWithdrawal) dayExpense += amt;
    });

    if (dayIncome > max) max = dayIncome;
    if (dayExpense > max) max = dayExpense;
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

// 🟢 3. НАКОПИТЕЛЬНЫЕ ИТОГИ (SUMMARIES) - SAFE
const summaries = computed(() => {
  const _v = mainStore.cacheVersion;
  if (!Array.isArray(props.visibleDays) || props.visibleDays.length === 0) return [];

  const computeDayIncExp = (date) => {
    const dateKey = _getDateKey(date);
    const dayOps = mainStore.getOperationsForDay(dateKey) || [];

    let inc = 0;
    let exp = 0;

    dayOps.forEach((op) => {
      if (!op) return;
      if (!isOpVisible(op)) return;
      if (op.type === 'transfer' || op.isTransfer) return;
      if (op.isWorkAct) return;
      if (!op.accountId) return;

      const amt = Math.abs(Number(op.amount) || 0);

      if (op.isWithdrawal) {
        exp += amt;
      } else if (op.type === 'expense') {
        if (mainStore._isRetailWriteOff && mainStore._isRetailWriteOff(op)) return;
        exp += amt;
      } else if (op.type === 'income') {
        inc += amt;
      }
    });

    return { inc, exp };
  };

  const cutoff = new Date();
  cutoff.setHours(23, 59, 59, 999);

  let netPastWindow = 0;
  props.visibleDays.forEach((day) => {
    if (!day?.date) return;
    const d = day.date instanceof Date ? day.date : new Date(day.date);
    if (Number.isNaN(d.getTime())) return;
    if (d.getTime() > cutoff.getTime()) return;
    const { inc, exp } = computeDayIncExp(d);
    netPastWindow += inc - exp;
  });

  let runningBalance = Number(mainStore.currentTotalBalance || 0) - netPastWindow;

  return props.visibleDays.map((day) => {
    if (!day || !day.date) return { date: '', income: 0, expense: 0, balance: 0 };

    const d = day.date instanceof Date ? day.date : new Date(day.date);
    const { inc, exp } = computeDayIncExp(d);

    runningBalance += inc - exp;

    return {
      date: d.toLocaleDateString('ru-RU', { weekday: 'short', month: 'short', day: 'numeric' }),
      income: inc,
      expense: exp,
      balance: runningBalance
    };
  });
});

// Баланс на конец дня (из summaries)
const endBalanceValues = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  return arr.map((s) => Number(s?.balance) || 0);
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

// Серый столбик = баланс на конец дня (end)
const balanceBarData = computed(() => {
  const _v = mainStore.cacheVersion;
  const vals = endBalanceValues.value;
  return (vals || []).map((v) => Math.max(0, Number(v) || 0));
});

// Серый цвет: если были операции — чуть плотнее
const balanceColors = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  return arr.map((s) => {
    const inc = Math.abs(Number(s?.income) || 0);
    const exp = Math.abs(Number(s?.expense) || 0);
    const hasOps = inc + exp > 0;
    return hasOps ? 'rgba(160,160,160,0.22)' : 'rgba(160,160,160,0.12)';
  });
});

// Плавающие сегменты расходов и доходов (чтобы видеть ОБА в один день)
// Плавающий сегмент расхода: рисуем только ту часть, которая опустила баланс ниже start.
// Это гарантирует, что доход (зелёный) всегда останется наверху и не будет перекрыт расходом.
// - если end < start (расходов больше, чем перекрыл доход) -> красный = [end, start]
// - если end >= start (доход перекрыл расходы) -> красный не рисуем (0)
const expenseFloatData = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  const endVals = endBalanceValues.value || [];
  const startVals = startBalanceValues.value || [];

  return arr.map((s, i) => {
    const exp = Math.abs(Number(s?.expense) || 0);
    if (!exp) return [0, 0];

    const end = Math.max(0, Number(endVals[i]) || 0);
    const start = Math.max(0, Number(startVals[i]) || 0);

    // Если расходы не опустили баланс ниже start — красный сегмент не нужен
    if (end >= start) return [0, 0];

    return [end, start];
  });
});

const incomeFloatData = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  const startVals = startBalanceValues.value || [];
  const peakVals = peakBalanceValues.value || [];
  return arr.map((s, i) => {
    const inc = Math.abs(Number(s?.income) || 0);
    if (!inc) return [0, 0];
    const start = Math.max(0, Number(startVals[i]) || 0);
    const peak = Math.max(0, Number(peakVals[i]) || 0);
    return [start, peak];
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

const incomeFloatColors = computed(() => {
  const _v = mainStore.cacheVersion;
  const arr = Array.isArray(summaries.value) ? summaries.value : [];
  return arr.map((s) => {
    const inc = Math.abs(Number(s?.income) || 0);
    return inc ? 'rgba(52,199,89,1)' : 'rgba(0,0,0,0)';
  });
});

const getTooltipOperationList = (ops) => {
  if (!ops || !Array.isArray(ops) || ops.length === 0) return [];
  const sortedOps = [...ops].sort((a, b) => Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0));

  return sortedOps
    .map((op) => {
      if (!op) return null;
      if (op.isTransfer && !op.isWithdrawal) return null;

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
        const isTranche = op.isDealTranche === true || (op.totalDealAmount || 0) > 0;
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

  const safeDays = Array.isArray(props.visibleDays) ? props.visibleDays : [];
  const prepayIds = mainStore.getPrepaymentCategoryIds || [];
  const creditCatId = mainStore.creditCategoryId;
  const retailId = mainStore.retailIndividualId;

  for (const day of safeDays) {
    if (!day || !day.date) continue;
    const dateKey = _getDateKey(day.date);
    const dayOps = mainStore.getOperationsForDay(dateKey) || [];

    const incomeOps = [];
    const creditOps = [];
    const prepayOps = [];
    const expenseOps = [];
    const withdrawalOps = [];

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

      if (op.isWithdrawal) {
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
        const isTranche = op.isDealTranche === true || (op.totalDealAmount || 0) > 0;

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
    withdrawal: withdrawalDetails
  };

  return {
    labels,
    datasets: [
      // 🟢 Баланс (основание) — серый столбик по остатку в каждой колонке
      {
        type: 'bar',
        label: 'Баланс',
        data: balanceBars,
        backgroundColor: balanceCols,
        yAxisID: 'yBalance',
        order: 0,
        grouped: false,
        stack: 'stack1',
        borderSkipped: false
      },
      // 🟢 Расход (floating segment)
      {
        type: 'bar',
        label: 'Расход',
        data: (expenseFloatData.value || []).slice(0, labels.length),
        backgroundColor: (expenseFloatColors.value || []).slice(0, labels.length),
        yAxisID: 'yBalance',
        order: 2,
        borderSkipped: false,
        grouped: false,
        stack: 'stack1'
      },
      // 🟢 Доход (floating segment)
      {
        type: 'bar',
        label: 'Доход',
        data: (incomeFloatData.value || []).slice(0, labels.length),
        backgroundColor: (incomeFloatColors.value || []).slice(0, labels.length),
        yAxisID: 'yBalance',
        order: 3,
        borderSkipped: false,
        grouped: false,
        stack: 'stack1'
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
      const el = document.getElementById('chartjs-custom-tooltip');

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
            const index = context.dataIndex;
            const dateLabel = context.chart.data.labels[index];

            const daySum = Array.isArray(summaries.value) ? summaries.value[index] : null;
            const dayIncome = Math.abs(Number(daySum?.income) || 0);
            const dayExpense = Math.abs(Number(daySum?.expense) || 0);
            const dayBalance = Number(daySum?.balance) || 0;

            // Всегда: дата + баланс
            const lines = [`${dateLabel}`, `Баланс: ${formatNumber(dayBalance)} т`];

            // Если есть операции — покажем сводку (цвета зададим в externalTooltipHandler)
            if (dayIncome || dayExpense) {
              lines.push('---');
              if (dayIncome) lines.push(`Доход: +${formatNumber(dayIncome)} т`);
              if (dayExpense) lines.push(`Расход: -${formatNumber(dayExpense)} т`);
            }

            // Если операций нет — просто баланс
            if (!dayIncome && !dayExpense) return lines;

            // Собираем детализацию (всегда общий tooltip): сначала доходы, потом расходы
            const safeGet = (key) => {
              const arr = tooltipDetails.value?.[key];
              return Array.isArray(arr) && Array.isArray(arr[index]) ? arr[index] : [];
            };

            let incomeDetails = [...safeGet('prepayment'), ...safeGet('credit'), ...safeGet('income')];
            let expenseDetails = [...safeGet('expense'), ...safeGet('withdrawal')];

            const sortByAbs = (a, b) => Math.abs(Number(b?.amount) || 0) - Math.abs(Number(a?.amount) || 0);
            incomeDetails = [...incomeDetails].sort(sortByAbs);
            expenseDetails = [...expenseDetails].sort(sortByAbs);

            if (!incomeDetails.length && !expenseDetails.length) return lines;

            lines.push('---');

            if (incomeDetails.length) {
              lines.push('ДОХОДЫ');
              incomeDetails.forEach((op) => {
                const amountStr = `+${formatNumber(Math.abs(op?.amount || 0))} т`;
                const acc = op?.accName || '???';
                const cont = op?.contName || '---';
                const proj = op?.projName || '---';
                const cat = op?.catName || 'Без кат.';

                if (op?.isTax) {
                  lines.push(`${amountStr} > Налог: ${op?.compName || 'Компания'}`);
                  if (op?.desc) lines.push(`(${op.desc})`);
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
                const acc = op?.accName || '???';
                const cont = op?.contName || '---';
                const proj = op?.projName || '---';
                const cat = op?.catName || 'Без кат.';

                if (op?.isTax) {
                  lines.push(`${amountStr} > Налог: ${op?.compName || 'Компания'}`);
                  if (op?.desc) lines.push(`(${op.desc})`);
                } else {
                  if (op?.isWithdrawal) lines.push(`${amountStr} > ${acc} (Вывод средств)`);
                  else lines.push(`${amountStr} > ${acc} > ${cont} > ${proj} > ${cat}`);
                }
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

    <div v-if="showSummaries" class="summaries-wrapper" :style="{ gridTemplateColumns: `repeat(${visibleDays.length}, 1fr)` }">
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
}
.summaries-wrapper {
  flex: 0 0 90px;
  height: 90px;
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
  color: #aaa;
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
  color: #ccc;
  font-weight: 500;
  margin-top: 5px;
}
</style>