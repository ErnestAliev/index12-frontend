<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale
} from 'chart.js/auto';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

/**
 * * --- МЕТКА ВЕРСИИ: v20.1 - GRAPH FIX ---
 * * ВЕРСИЯ: 20.1 - Исправление синтаксиса и тултипов
 * * ДАТА: 2025-11-20
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (FIX) Исправлена опечатка в defineProps.
 * 2. (FIX) Исправлено отображение категории "Предоплата" в тултипе.
 */

const props = defineProps({
  visibleDays: { type: Array, required: true, default: () => [] }, 
  animate: { type: Boolean, default: false },
  showSummaries: { type: Boolean, default: true }
});
const emit = defineEmits(['update:yLabels']);

const mainStore = useMainStore();

const _getDayOfYear = (date) => {
  if (!date) return 0; 
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000);
  return Math.floor(diff / 86400000);
};
const _getDateKey = (date) => {
  if (!date) return ''; 
  const year = date.getFullYear();
  const doy = _getDayOfYear(date);
  return `${year}-${doy}`;
};

const rawMaxY = computed(() => {
  let max = 0;
  if (mainStore.dailyChartData) {
      for (const [, data] of mainStore.dailyChartData) {
        // Max is sum of income + prepayment
        const totalIncome = (data.income || 0) + (data.prepayment || 0);
        if (totalIncome > max) max = totalIncome;
        if (Math.abs(data.expense) > max) max = Math.abs(data.expense);
      }
  }
  return max || 1;
});

function niceStep(rawStep) {
  if (rawStep <= 0) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exp);
  const frac = rawStep / base;

  let niceFrac;
  if (frac <= 1)      niceFrac = 1;
  else if (frac <= 2) niceFrac = 2;
  else if (frac <= 5) niceFrac = 5;
  else                niceFrac = 10;

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

watch(yAxisTicks, (ticks) => {
  emit('update:yLabels', ticks);
}, { immediate: true });

const summaries = computed(() => {
  if (!props.showSummaries) return [];
  if (!Array.isArray(props.visibleDays)) return [];

  return props.visibleDays.map(day => {
    if (!day || !day.date) return { date: '', income: 0, expense: 0, balance: 0 }; 

    const dateKey = _getDateKey(day.date);
    const data = mainStore.dailyChartData?.get(dateKey) || { income: 0, prepayment: 0, expense: 0, closingBalance: 0 };
    
    // В итогах объединяем обычный доход и предоплату
    return {
      date: day.date.toLocaleDateString('ru-RU', { weekday: 'short', month: 'short', day: 'numeric' }),
      income: (data.income || 0) + (data.prepayment || 0),
      expense: data.expense,
      balance: data.closingBalance
    };
  });
});

const getTooltipOperationList = (ops) => {
  if (!ops || !Array.isArray(ops) || ops.length === 0) return [];
  const sortedOps = [...ops].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return sortedOps.map(op => {
    if (op.isTransfer) return null;
    
    // Проверка на предоплату для подписи
    const prepayIds = mainStore.getPrepaymentCategoryIds;
    const catId = op.categoryId?._id || op.categoryId;
    const prepId = op.prepaymentId?._id || op.prepaymentId;
    
    // Проверяем ID категории или ID предоплаты
    const isPrepay = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
    
    // Определяем имя категории
    let catName = op.categoryId?.name || 'Без категории';
    if (isPrepay) {
        catName = 'Предоплата'; // Принудительно ставим имя для предоплат
    }

    return {
      isIncome: op.type === 'income',
      accName: op.accountId?.name || '???',
      contName: op.contractorId?.name || '---',
      projName: op.projectId?.name || '---',
      catName: catName, // Используем вычисленное имя
      amount: op.amount
    };
  }).filter(Boolean);
};

const chartData = computed(() => {
  const labels = [];
  const incomeData = [];
  const prepaymentData = []; 
  const expenseData = [];
  const incomeDetails = []; 
  const prepaymentDetails = []; 
  const expenseDetails = [];

  const safeDays = Array.isArray(props.visibleDays) ? props.visibleDays : [];
  const prepayIds = mainStore.getPrepaymentCategoryIds;

  for (const day of safeDays) {
    if (!day || !day.date) continue; 

    const dateKey = _getDateKey(day.date);
    const data = mainStore.dailyChartData?.get(dateKey) || { income: 0, prepayment: 0, expense: 0 };
    
    const allOps = (mainStore.allOperationsFlat || []);
    
    // Фильтруем операции
    const dayOps = allOps.filter(op => op.dateKey === dateKey);
    
    const incomeOps = [];
    const prepayOps = [];
    const expenseOps = [];

    dayOps.forEach(op => {
        if (op.type === 'expense') {
            expenseOps.push(op);
        } else if (op.type === 'income') {
            const catId = op.categoryId?._id || op.categoryId;
            const prepId = op.prepaymentId?._id || op.prepaymentId;
            const isPrepay = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
            
            if (isPrepay) prepayOps.push(op);
            else incomeOps.push(op);
        }
    });

    incomeDetails.push(getTooltipOperationList(incomeOps));
    prepaymentDetails.push(getTooltipOperationList(prepayOps)); 
    expenseDetails.push(getTooltipOperationList(expenseOps));

    labels.push(day.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
    incomeData.push(data.income);
    prepaymentData.push(data.prepayment || 0); 
    expenseData.push(Math.abs(data.expense));
  }

  return {
    labels,
    datasets: [
      { 
        label: 'Предоплата', 
        backgroundColor: '#FF9D00', 
        data: prepaymentData,  
        stack: 'stack1',
        details: prepaymentDetails 
      },
      { 
        label: 'Доход',
        backgroundColor: '#34c759', 
        data: incomeData,  
        stack: 'stack1',
        details: incomeDetails 
      },
      { 
        label: 'Расход', 
        backgroundColor: '#ff3b30', 
        data: expenseData, 
        stack: 'stack1',
        details: expenseDetails 
      }
    ]
  };
});

const chartOptions = computed(() => {
  const yMax = axisMax.value;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        callbacks: {
          title: () => null,
          label: (context) => {
            const dataset = context.dataset;
            const index = context.dataIndex;
            const totalLabel = dataset.label || '';
            const totalValue = context.raw;
            
            // Пропускаем пустые значения в тултипе
            if (!totalValue) return null;

            const formattedTotal = totalLabel === 'Расход' 
              ? formatNumber(-Math.abs(totalValue)) 
              : formatNumber(totalValue);
            
            const lines = [`${totalLabel}: ${formattedTotal} т`];

            const opsList = dataset.details?.[index];
            if (!opsList || opsList.length === 0) {
              return lines; 
            }
            
            lines.push('---'); 

            opsList.forEach(op => {
              const amountStr = formatNumber(Math.abs(op.amount)) + ' т';
              const acc = op.accName || '???';
              const cont = op.contName || '---';
              const proj = op.projName || '---';
              const cat = op.catName || 'Без кат.';
              
              lines.push('');

              if (op.isIncome) {
                lines.push(`${amountStr} < ${acc} < ${cont} < ${proj} < ${cat}`);
              } else {
                lines.push(`${amountStr} > ${acc} > ${cont} > ${proj} > ${cat}`);
              }
            });
            return lines;
          },
          footer: () => null
        }
      }
    },
    scales: {
      x: { stacked: true, display: false },
      y: { stacked: true, max: yMax, min: 0, display: false }
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
watch([chartData, chartOptions], async () => {
  await nextTick();
  const chart = chartRef.value?.chart;
  if (chart) chart.update('none');
});
</script>

<template>
  <div class="graph-area" :class="{'no-anim': !animate}">
    <div class="chart-wrapper">
      <Bar ref="chartRef" :data="chartData" :options="chartOptions" />
    </div>

    <div v-if="showSummaries" class="summaries-wrapper">
      <div
        v-for="(day, index) in summaries"
        :key="index"
        class="day-summary"
      >
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

.no-anim, .no-anim * {
  transition: none !important;
  animation: none !important;
}

.chart-wrapper {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

/* Зона сводок */
.summaries-wrapper {
  flex: 0 0 90px;
  height: 90px;
  border-top: 1px solid var(--color-border);
  overflow: hidden;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
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
.day-date   { color: #aaa; font-weight: bold; margin-bottom: 5px; }
.day-income { color: var(--color-primary); font-weight: 500; }
.day-expense{ color: var(--color-danger);  font-weight: 500; }
.day-balance{ color: #ccc; font-weight: 500; margin-top: 5px; }
</style>
