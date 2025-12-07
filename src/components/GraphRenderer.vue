<script setup>
import { computed, ref, watch, nextTick, onUnmounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js/auto';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

/**
 * * --- МЕТКА ВЕРСИИ: v56.0 - TAX TOOLTIP FIX ---
 * * ВЕРСИЯ: 56.0 - Улучшенное отображение налогов в тултипах
 */

const props = defineProps({
  visibleDays: { type: Array, required: true, default: () => [] }, 
  animate: { type: Boolean, default: false },
  showSummaries: { type: Boolean, default: true }
});
const emit = defineEmits(['update:yLabels']);
const mainStore = useMainStore();

// ... (externalTooltipHandler без изменений) ...
const externalTooltipHandler = (context) => {
  let tooltipEl = document.getElementById('chartjs-custom-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'chartjs-custom-tooltip';
    Object.assign(tooltipEl.style, { background: 'rgba(26, 26, 26, 0.95)', border: '1px solid #444', borderRadius: '8px', color: 'white', opacity: 0, pointerEvents: 'none', position: 'fixed', zIndex: 9999, fontSize: '12px', padding: '12px', lineHeight: '1.4', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', transition: 'opacity .15s ease', width: 'max-content', maxWidth: '100vw', boxSizing: 'border-box' });
    document.body.appendChild(tooltipEl);
  }
  const tooltipModel = context.tooltip;
  if (tooltipModel.opacity === 0) { tooltipEl.style.opacity = 0; return; }
  if (tooltipModel.body) {
    const bodyLines = tooltipModel.body.map(b => b.lines).flat();
    let innerHtml = '';
    bodyLines.forEach((line, i) => {
       if (line === '---') { innerHtml += '<div style="height:1px; background: rgba(255,255,255,0.1); margin: 8px 0;"></div>'; return; }
       if (!line) return;
       let style = 'color: #ddd; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'; 
       if (i === 0) style = 'color: #888; margin-bottom: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;';
       else if (i === 1) style = 'font-weight: 700; font-size: 15px; margin-bottom: 8px; color: #fff; white-space: nowrap;';
       innerHtml += `<div style="${style}">${line}</div>`;
    });
    tooltipEl.innerHTML = innerHtml;
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

onUnmounted(() => { const el = document.getElementById('chartjs-custom-tooltip'); if (el) el.remove(); });
const _getDayOfYear = (date) => { if (!date) return 0; const start = new Date(date.getFullYear(), 0, 0); const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000); return Math.floor(diff / 86400000); };
const _getDateKey = (date) => { if (!date) return ''; const year = date.getFullYear(); const doy = _getDayOfYear(date); return `${year}-${doy}`; };
const rawMaxY = computed(() => { let max = 0; if (mainStore.dailyChartData) { for (const [, data] of mainStore.dailyChartData) { const totalIncome = (data.income || 0) + (data.prepayment || 0); if (totalIncome > max) max = totalIncome; const totalExpense = Math.abs(data.expense || 0) + Math.abs(data.withdrawal || 0); if (totalExpense > max) max = totalExpense; } } return max || 1; });
function niceStep(rawStep) { if (rawStep <= 0) return 1; const exp = Math.floor(Math.log10(rawStep)); const base = Math.pow(10, exp); const frac = rawStep / base; let niceFrac; if (frac <= 1) niceFrac = 1; else if (frac <= 2) niceFrac = 2; else if (frac <= 5) niceFrac = 5; else niceFrac = 10; return niceFrac * base; }
const axisStep = computed(() => { const desired = rawMaxY.value / 8; return niceStep(desired); });
const axisMax = computed(() => { const maxNeeded = rawMaxY.value; const step = axisStep.value; const minNiceMax = step * 8; if (maxNeeded <= minNiceMax) return minNiceMax; const k = Math.ceil(maxNeeded / step); const kAligned = Math.max(8, k); const kAligned8 = Math.ceil(kAligned / 8) * 8; return kAligned8 * step; });
const yAxisTicks = computed(() => { const ticks = []; const step = axisStep.value; const max = axisMax.value; for (let v = max; v >= 0; v -= step) { ticks.push(v); } if (ticks.length > 9) return ticks.slice(0, 9); if (ticks.length < 9) { while (ticks.length < 9) ticks.push(0); } return ticks; });
watch(yAxisTicks, (ticks) => { emit('update:yLabels', ticks); }, { immediate: true });
const summaries = computed(() => { if (!props.showSummaries) return []; if (!Array.isArray(props.visibleDays)) return []; return props.visibleDays.map(day => { if (!day || !day.date) return { date: '', income: 0, expense: 0, balance: 0 }; const dateKey = _getDateKey(day.date); const data = mainStore.dailyChartData?.get(dateKey) || { income: 0, prepayment: 0, expense: 0, withdrawal: 0, closingBalance: 0 }; return { date: day.date.toLocaleDateString('ru-RU', { weekday: 'short', month: 'short', day: 'numeric' }), income: (data.income || 0) + (data.prepayment || 0), expense: (data.expense || 0) + (data.withdrawal || 0), balance: data.closingBalance }; }); });

const getTooltipOperationList = (ops) => {
  if (!ops || !Array.isArray(ops) || ops.length === 0) return [];
  const sortedOps = [...ops].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  
  return sortedOps.map(op => {
    if (op.isTransfer && !op.isWithdrawal) return null;
    
    // 🟢 Проверка на налог
    const isTax = mainStore._isTaxPayment ? mainStore._isTaxPayment(op) : false;
    const isCredit = mainStore._isCreditIncome(op);
    
    let catName = op.categoryId?.name || 'Без категории';
    
    if (isTax) {
        catName = 'Налог';
    }
    else if (op.isClosed) { 
        catName = 'Сделка закрыта (Факт)'; 
    } 
    else if (op.type === 'income' && !op.isClosed && !isCredit) { 
         const prepayIds = mainStore.getPrepaymentCategoryIds;
         const catId = op.categoryId?._id || op.categoryId;
         const prepId = op.prepaymentId?._id || op.prepaymentId;
         const isTranche = op.isDealTranche === true;
         const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
         const isRetailPrepay = indId && indId === mainStore.retailIndividualId;

         if (isTranche || isRetailPrepay || (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment)) {
             catName = isRetailPrepay ? 'Предоплата (Розница)' : 'Предоплата / Транш';
         }
    }
    if (isCredit) catName = 'Кредит';
    if (op.isWithdrawal) catName = 'Вывод средств';

    // Компания для налога
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
      // 🟢 Новые поля для налога
      isTax: isTax,
      compName: compName,
      desc: op.description
    };
  }).filter(Boolean);
};

const chartData = computed(() => {
  const labels = [];
  const incomeData = []; const creditIncomeData = []; const prepaymentData = [];
  const expenseData = []; const withdrawalData = [];
  const incomeDetails = []; const creditIncomeDetails = []; const prepaymentDetails = [];
  const expenseDetails = []; const withdrawalDetails = [];

  const safeDays = Array.isArray(props.visibleDays) ? props.visibleDays : [];
  const prepayIds = mainStore.getPrepaymentCategoryIds;
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
        const amt = op.amount || 0;
        const absAmt = Math.abs(amt);

        if (op.isWithdrawal) {
            withdrawalOps.push(op); dayWithdrawalSum += absAmt;
        } else if (op.type === 'expense') {
            if (mainStore._isRetailWriteOff(op)) return;
            expenseOps.push(op); dayExpenseSum += absAmt;
        } else if (op.type === 'income') {
            const catId = op.categoryId?._id || op.categoryId;
            const prepId = op.prepaymentId?._id || op.prepaymentId;
            const isCredit = creditCatId && catId === creditCatId;
            const isPrepayCategory = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
            const isTranche = op.isDealTranche === true || (op.totalDealAmount || 0) > 0;
            
            const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
            const isRetailPrepay = retailId && indId === retailId && op.isClosed !== true;

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
                  // 🟢 Формат для налогов
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
watch([chartData, chartOptions], async () => { await nextTick(); const chart = chartRef.value?.chart; if (chart) chart.update('none'); });
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