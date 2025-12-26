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
const TOOLTIP_HIDE_DELAY_MS = 2500;

const _clearTooltipHideTimer = () => {
  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }
};

const ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_EXPORT = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
let tooltipCopyFeedbackTimer = null;

/**
 * * --- МЕТКА ВЕРСИИ: v60.2 - RENDER CRASH FIX ---
 * * ВЕРСИЯ: 60.2
 * * ДАТА: 2025-12-16
 * * ИЗМЕНЕНИЯ:
 * 1. (FIX) Добавлены проверки на существование объектов (op, account) во всех циклах.
 * 2. (FIX) Приведение ID к String() перед сравнением в isOpVisible.
 * 3. (FIX) Принудительное приведение amount к Number() для защиты от NaN.
 */

const props = defineProps({
  visibleDays: { type: Array, required: true, default: () => [] }, 
  animate: { type: Boolean, default: false },
  showSummaries: { type: Boolean, default: true }
});
const emit = defineEmits(['update:yLabels']);
const mainStore = useMainStore();

// 🟢 1. Получаем список ID исключенных счетов (SAFE)
const excludedAccountIds = computed(() => {
    if (mainStore.includeExcludedInTotal) return new Set();
    const ids = new Set();
    if (Array.isArray(mainStore.accounts)) {
        mainStore.accounts.forEach(a => {
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
        // Check if ID exists and is in the set (casted to string)
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
      position: 'fixed',
      zIndex: 9999,
      fontSize: '12px',
      padding: '12px',
      lineHeight: '1.4',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      transition: 'opacity .15s ease',
      width: 'max-content',
      maxWidth: '100vw',
      boxSizing: 'border-box'
    });
    document.body.appendChild(tooltipEl);
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
    });

    tooltipEl.addEventListener('mouseleave', () => {
      tooltipIsHovering = false;
      if (!tooltipPinned) {
        _clearTooltipHideTimer();
        tooltipHideTimer = setTimeout(() => {
          if (!tooltipPinned && !tooltipIsHovering) tooltipEl.style.opacity = 0;
        }, 150);
      }
    });
  }
  const tooltipModel = context.tooltip;
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
    const bodyLines = tooltipModel.body.map(b => b.lines).flat();

    // If tooltip is pinned, ignore hover updates from other bars (prevents “мешаются”).
    const dp = tooltipModel.dataPoints?.[0];
    const activeKey = dp ? `${dp.datasetIndex}:${dp.dataIndex}` : '';
    if (tooltipPinned && !tooltipForceUpdate && activeKey && activeKey !== tooltipPinnedKey) {
      return;
    }

    // Save the exact visible tooltip content for WhatsApp (date + total + list)
    // UI does not render empty lines, so we drop them here too.
    lastTooltipExportText = bodyLines
      .map(l => (l === '---' ? '----------------' : l))
      .filter(l => l !== undefined && l !== null)
      .filter(l => String(l).trim() !== '')
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
        const style = 'color: #888; margin-bottom: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        innerHtml += `<div style="${style}">${line}</div>`;
        return;
      }

      // 2) Total line (second line) + actions on the right
      if (i === 1) {
        innerHtml += `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 15px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${line}</div>
            <div style="display:flex; gap:6px; flex: 0 0 auto;">
              <button class="tt-btn tt-btn--copy" id="chartjs-tooltip-copy-btn" aria-label="Копировать" title="Копировать" style="all:unset; cursor:pointer; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.18); border-radius:6px; color:#fff; background:rgba(255,255,255,0.06);"><span class="tt-ico tt-ico-copy">${ICON_COPY}</span><span class="tt-ico tt-ico-check">${ICON_CHECK}</span></button>
              <button class="tt-btn tt-btn--export" id="chartjs-tooltip-export-btn" aria-label="Экспорт" title="Экспорт" style="all:unset; cursor:pointer; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.18); border-radius:6px; color:#fff; background:rgba(255,255,255,0.10);"><span class="tt-ico">${ICON_EXPORT}</span></button>
            </div>
          </div>
        `;
        return;
      }

      // 3) Other lines
      const style = 'color: #ddd; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
      innerHtml += `<div style="${style}">${line}</div>`;
    });
    tooltipEl.innerHTML = innerHtml;
    // Allow next hover updates unless we are pinned.
    tooltipForceUpdate = false;
  }
  const position = context.chart.canvas.getBoundingClientRect();
  const viewportX = position.left + tooltipModel.caretX;
  const viewportY = position.top + tooltipModel.caretY;
  const tooltipWidth = tooltipEl.offsetWidth;
  const tooltipHeight = tooltipEl.offsetHeight;
  const screenWidth = window.innerWidth;
  let left = viewportX; let top = viewportY; let transformX = '-50%';
  if (left < tooltipWidth / 2 + 10) { left = 10; transformX = '0%'; }
  else if (left + tooltipWidth / 2 > screenWidth - 10) { left = screenWidth - 10; transformX = '-100%'; if (left - tooltipWidth < 0) { left = 0; transformX = '0%'; } }
  top = top - 10; let transformY = '-100%';
  if (top - tooltipHeight < 10) { top = viewportY + 20; transformY = '0%'; }
  tooltipEl.style.transform = `translate(${transformX}, ${transformY})`;
  tooltipEl.style.left = left + 'px'; tooltipEl.style.top = top + 'px'; tooltipEl.style.opacity = 1;
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

const _getDayOfYear = (date) => { if (!date) return 0; const start = new Date(date.getFullYear(), 0, 0); const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000); return Math.floor(diff / 86400000); };
const _getDateKey = (date) => { if (!date) return ''; const year = date.getFullYear(); const doy = _getDayOfYear(date); return `${year}-${doy}`; };

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
     
     dayOps.forEach(op => {
         if (!op) return; // Guard
         if (!isOpVisible(op)) return;
         if (op.type === 'transfer' || op.isTransfer) return;
         if (op.isWorkAct) return;
         
         // Safe number parsing
         const amt = Math.abs(Number(op.amount) || 0);
         
         if (op.type === 'income') dayIncome += amt;
         else if (op.type === 'expense' || op.isWithdrawal) dayExpense += amt;
     });
     
     if (dayIncome > max) max = dayIncome;
     if (dayExpense > max) max = dayExpense;
  }
  return max || 1; 
});

function niceStep(rawStep) { if (rawStep <= 0) return 1; const exp = Math.floor(Math.log10(rawStep)); const base = Math.pow(10, exp); const frac = rawStep / base; let niceFrac; if (frac <= 1) niceFrac = 1; else if (frac <= 2) niceFrac = 2; else if (frac <= 5) niceFrac = 5; else niceFrac = 10; return niceFrac * base; }
const axisStep = computed(() => { const desired = rawMaxY.value / 8; return niceStep(desired); });
const axisMax = computed(() => { const maxNeeded = rawMaxY.value; const step = axisStep.value; const minNiceMax = step * 8; if (maxNeeded <= minNiceMax) return minNiceMax; const k = Math.ceil(maxNeeded / step); const kAligned = Math.max(8, k); const kAligned8 = Math.ceil(kAligned / 8) * 8; return kAligned8 * step; });
const yAxisTicks = computed(() => { const ticks = []; const step = axisStep.value; const max = axisMax.value; for (let v = max; v >= 0; v -= step) { ticks.push(v); } if (ticks.length > 9) return ticks.slice(0, 9); if (ticks.length < 9) { while (ticks.length < 9) ticks.push(0); } return ticks; });
watch(yAxisTicks, (ticks) => { emit('update:yLabels', ticks); }, { immediate: true });

// 🟢 3. НАКОПИТЕЛЬНЫЕ ИТОГИ (SUMMARIES) - SAFE
const summaries = computed(() => { 
  const _v = mainStore.cacheVersion;
  if (!props.showSummaries || !Array.isArray(props.visibleDays) || props.visibleDays.length === 0) return []; 

  const computeDayIncExp = (date) => {
    const dateKey = _getDateKey(date); 
    const dayOps = mainStore.getOperationsForDay(dateKey) || [];

    let inc = 0;
    let exp = 0;

    dayOps.forEach(op => {
        if (!op) return; // Guard
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

  // Base balance for the first visible day:
  // we take the current all-time balance (snapshot) and subtract net for the visible past window up to today.
  const cutoff = new Date();
  cutoff.setHours(23, 59, 59, 999);

  let netPastWindow = 0;
  props.visibleDays.forEach(day => {
      if (!day?.date) return;
      const d = (day.date instanceof Date) ? day.date : new Date(day.date);
      if (Number.isNaN(d.getTime())) return;
      if (d.getTime() > cutoff.getTime()) return; // future days don't affect current balance
      const { inc, exp } = computeDayIncExp(d);
      netPastWindow += (inc - exp);
  });

  let runningBalance = Number(mainStore.currentTotalBalance || 0) - netPastWindow;

  return props.visibleDays.map(day => { 
    if (!day || !day.date) return { date: '', income: 0, expense: 0, balance: 0 }; 

    const d = (day.date instanceof Date) ? day.date : new Date(day.date);
    const { inc, exp } = computeDayIncExp(d);

    runningBalance += (inc - exp);

    return { 
        date: d.toLocaleDateString('ru-RU', { weekday: 'short', month: 'short', day: 'numeric' }), 
        income: inc, 
        expense: exp, 
        balance: runningBalance 
    }; 
  }); 
});

const getTooltipOperationList = (ops) => {
  if (!ops || !Array.isArray(ops) || ops.length === 0) return [];
  // Safety sort
  const sortedOps = [...ops].sort((a, b) => Math.abs(Number(b.amount)||0) - Math.abs(Number(a.amount)||0));
  
  return sortedOps.map(op => {
    if (!op) return null;
    if (op.isTransfer && !op.isWithdrawal) return null;
    
    const isTax = mainStore._isTaxPayment ? mainStore._isTaxPayment(op) : false;
    const isCredit = mainStore._isCreditIncome ? mainStore._isCreditIncome(op) : false;
    
    let catName = op.categoryId?.name || 'Без категории';
    
    if (isTax) {
        catName = 'Налог';
    }
    else if (op.isClosed) { 
        catName = 'Сделка закрыта (Факт)'; 
    } 
    else if (op.type === 'income' && !op.isClosed && !isCredit) { 
         const prepayIds = mainStore.getPrepaymentCategoryIds || [];
         const catId = op.categoryId?._id || op.categoryId;
         const prepId = op.prepaymentId?._id || op.prepaymentId;
         const isTranche = op.isDealTranche === true || (op.totalDealAmount || 0) > 0;
         const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
         const isRetailPrepay = indId && indId === mainStore.retailIndividualId;

         if (isTranche || isRetailPrepay || (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment)) {
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
  }).filter(Boolean);
};

// 🟢 CHART DATA COMPUTED - SAFE
const chartData = computed(() => {
  const _v = mainStore.cacheVersion;

  const labels = [];
  const incomeData = []; const creditIncomeData = []; const prepaymentData = [];
  const expenseData = []; const withdrawalData = [];
  const incomeDetails = []; const creditIncomeDetails = []; const prepaymentDetails = [];
  const expenseDetails = []; const withdrawalDetails = [];

  const safeDays = Array.isArray(props.visibleDays) ? props.visibleDays : [];
  const prepayIds = mainStore.getPrepaymentCategoryIds || [];
  const creditCatId = mainStore.creditCategoryId;
  const retailId = mainStore.retailIndividualId;

  for (const day of safeDays) {
    if (!day || !day.date) continue; 
    const dateKey = _getDateKey(day.date);
    const dayOps = mainStore.getOperationsForDay(dateKey) || [];
    
    const incomeOps = []; const creditOps = []; const prepayOps = [];
    const expenseOps = []; const withdrawalOps = [];

    let dayIncomeSum = 0; let dayCreditSum = 0; let dayPrepaySum = 0;
    let dayExpenseSum = 0; let dayWithdrawalSum = 0;

    dayOps.forEach(op => {
        if (!op) return; // Guard
        if (!isOpVisible(op)) return;

        const amt = Number(op.amount) || 0;
        const absAmt = Math.abs(amt);

        if (op.isWithdrawal) {
            withdrawalOps.push(op); dayWithdrawalSum += absAmt;
        } else if (op.type === 'expense') {
            if (mainStore._isRetailWriteOff && mainStore._isRetailWriteOff(op)) return;
            expenseOps.push(op); dayExpenseSum += absAmt;
        } else if (op.type === 'income') {
            const catId = op.categoryId?._id || op.categoryId;
            const prepId = op.prepaymentId?._id || op.prepaymentId;
            const isCredit = creditCatId && String(catId) === String(creditCatId);
            const isPrepayCategory = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
            const isTranche = op.isDealTranche === true || (op.totalDealAmount || 0) > 0;
            
            const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
            const isRetailPrepay = retailId && String(indId) === String(retailId) && op.isClosed !== true;

            if (isCredit) {
                creditOps.push(op); dayCreditSum += amt;
            } else if (!op.isClosed && (isTranche || isPrepayCategory || isRetailPrepay)) {
                prepayOps.push(op); dayPrepaySum += amt;
            } else {
                incomeOps.push(op); dayIncomeSum += amt;
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
    
    incomeData.push(dayIncomeSum); creditIncomeData.push(dayCreditSum); prepaymentData.push(dayPrepaySum); 
    expenseData.push(dayExpenseSum); withdrawalData.push(dayWithdrawalSum);
  }

  return {
    labels,
    datasets: [
      { label: 'Предоплата', backgroundColor: '#FF9D00', data: prepaymentData, stack: 'stack1', details: prepaymentDetails, order: 1 },
      { label: 'Кредит', backgroundColor: '#8FD4FF', data: creditIncomeData, stack: 'stack1', details: creditIncomeDetails, order: 2 },
      { label: 'Доход', backgroundColor: '#34c759', data: incomeData, stack: 'stack1', details: incomeDetails, order: 3 },
      { label: 'Расход', backgroundColor: '#ff3b30', data: expenseData, stack: 'stack1', details: expenseDetails, order: 4 },
      { label: 'Вывод', backgroundColor: '#DE8FFF', data: withdrawalData, stack: 'stack1', details: withdrawalDetails, order: 5 }
    ]
  };
});

const chartOptions = computed(() => {
  const yMax = axisMax.value;
  const options = {
    responsive: true, maintainAspectRatio: false,
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

      const e0 = elements[0];
      const key = `${e0.datasetIndex}:${e0.index}`;

      // Clicking the same bar toggles pin off
      if (tooltipPinned && tooltipPinnedKey === key) {
        tooltipPinned = false;
        tooltipPinnedKey = '';
        tooltipForceUpdate = false;
        if (el && !tooltipIsHovering) el.style.opacity = 0;
        return;
      }

      // Pin to clicked bar
      tooltipPinned = true;
      tooltipPinnedKey = key;
      tooltipForceUpdate = true;

      try {
        const pos = { x: event?.x ?? event?.native?.offsetX, y: event?.y ?? event?.native?.offsetY };
        chart.setActiveElements(elements);
        if (chart.tooltip?.setActiveElements) chart.tooltip.setActiveElements(elements, pos);
        chart.update('none');
      } catch (e) {}
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: false, external: externalTooltipHandler,
        callbacks: {
          title: () => null,
          label: (context) => {
            const dataset = context.dataset; const index = context.dataIndex;
            const totalLabel = dataset.label || ''; const totalValue = context.raw;
            const dateLabel = context.chart.data.labels[index];
            if (!totalValue) return null;
            const formattedTotal = (totalLabel === 'Расход' || totalLabel === 'Вывод') ? formatNumber(-Math.abs(totalValue)) : formatNumber(totalValue);
            const lines = [`${dateLabel}`, `${totalLabel}: ${formattedTotal} т`];
            const opsList = dataset.details?.[index];
            if (!opsList || opsList.length === 0) return lines; 
            lines.push('---'); 
            opsList.forEach(op => {
              const amountStr = formatNumber(Math.abs(op.amount)) + ' т';
              const acc = op.accName || '???'; 
              const cont = op.contName || '---'; 
              const proj = op.projName || '---'; 
              const cat = op.catName || 'Без кат.';
              
              lines.push('');
              
              if (op.isTax) {
                  lines.push(`${amountStr} > Налог: ${op.compName}`);
                  if (op.desc) lines.push(`(${op.desc})`);
              }
              else if (op.isIncome) {
                  lines.push(`${amountStr} < ${acc} < ${cont} < ${proj} < ${cat}`);
              }
              else { 
                  if (op.isWithdrawal) lines.push(`${amountStr} > ${acc} (Вывод средств)`); 
                  else lines.push(`${amountStr} > ${acc} > ${cont} > ${proj} > ${cat}`); 
              }
            });
            return lines;
          },
          footer: () => null
        }
      }
    },
    scales: { x: { stacked: true, display: false }, y: { stacked: true, max: yMax, min: 0, display: false } }
  };
  if (!props.animate) {
    options.animation = false;
    options.animations = { colors: false, x: false, y: false, tension: false, numbers: false };
    options.transitions = { active: { animation: { duration: 0 } }, resize: { animation: { duration: 0 } }, show: { animations: { x: { duration: 0 }, y: { duration: 0 } } }, hide: { animations: { x: { duration: 0 }, y: { duration: 0 } } } };
    options.datasets = { bar: { animations: { x: { duration: 0 }, y: { duration: 0 } } } };
    options.plugins.tooltip.animation = { duration: 0 };
  }
  return options;
});

const chartRef = ref(null);

watch([chartData, chartOptions], async () => { 
    await nextTick(); 
    const chart = chartRef.value?.chart; 
    if (chart) {
        chart.update('none'); 
    }
}, { deep: true });

</script>

<template>
  <div class="graph-area" :class="{'no-anim': !animate}">
    <div class="chart-wrapper"><Bar ref="chartRef" :data="chartData" :options="chartOptions" /></div>
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
.graph-area { width: 100%; height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.no-anim, .no-anim * { transition: none !important; animation: none !important; }
.chart-wrapper { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.summaries-wrapper { flex: 0 0 90px; height: 90px; border-top: 1px solid var(--color-border); overflow: hidden; display: grid; width: 100%; }
:deep(canvas) { display: block !important; width: 100% !important; height: 100% !important; }
.day-summary { padding: 8px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; font-size: 0.8em; border-right: 1px solid var(--color-border); overflow: hidden; }
.day-date   { color: #aaa; font-weight: bold; margin-bottom: 5px; }
.day-income { color: var(--color-primary); font-weight: 500; }
.day-expense{ color: var(--color-danger);  font-weight: 500; }
.day-balance{ color: #ccc; font-weight: 500; margin-top: 5px; }
</style> 