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
 * * --- МЕТКА ВЕРСИИ: v4.4-ALL-TOOLTIPS ---
 * * ВЕРСИЯ: 4.4 - Подсказка показывает ВСЕ операции (лимит снят)
 * ДАТА: 2025-11-08
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (FIX) `chartOptions.callbacks.label` (ТУЛТИП)
 * теперь отрисовывает ВСЕ операции, а не Top-3.
 * 2. (FIX) Убрана строка "...и еще N опер."
 */

/* ── Пропсы ─────────────────────────────────────────────────────────────── */
const props = defineProps({
  visibleDays: { type: Array, required: true },
  // рубильник анимаций (по умолчанию ВЫКЛ)
  animate: { type: Boolean, default: false }
});
const emit = defineEmits(['update:yLabels']);

const mainStore = useMainStore();

// =================================================================
// --- Хелперы для dateKey (v3.7+) ---
// =================================================================
// Получение дня года с учетом года
const _getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000);
  return Math.floor(diff / 86400000);
};
// Создание уникального ключа с учетом года и DOY
const _getDateKey = (date) => {
  const year = date.getFullYear();
  const doy = _getDayOfYear(date);
  return `${year}-${doy}`;
};
// --- КОНЕЦ ХЕЛПЕРОВ ---


/* ── Максимум по данным ─────────────────────────────────────────────────── */
const rawMaxY = computed(() => {
  let max = 0;
  for (const [, data] of mainStore.dailyChartData) {
    if (data.income > max) max = data.income;
    if (Math.abs(data.expense) > max) max = Math.abs(data.expense);
  }
  return max || 1;
});

/* ── «Красивые» шаг/максимум по ряду 1/2/5×10^n на 8 интервалов ─────────── */
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

/* ── Тики для Y-оси (ЧИСЛА, сверху вниз) ────────────────────────────────── */
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

// Отдаём в YAxisPanel ЧИСЛА (позиционирование остаётся корректным)
watch(yAxisTicks, (ticks) => {
  emit('update:yLabels', ticks);
}, { immediate: true });

/* ── Сводки по дням ─────────────────────────────────────────────────────── */
const summaries = computed(() => {
  return props.visibleDays.map(day => {
    const dateKey = _getDateKey(day.date);
    const data = mainStore.dailyChartData.get(dateKey) || { income: 0, expense: 0, closingBalance: 0 };
    
    return {
      date: day.date.toLocaleDateString('ru-RU', { weekday: 'short', month: 'short', day: 'numeric' }),
      income: data.income,
      expense: data.expense,
      balance: data.closingBalance
    };
  });
});

// --- 🔴 ИСПРАВЛЕНИЕ v4.0: Логика для группировки в подсказке ---
/**
 * Возвращает отсортированный массив ОБЪЕКТОВ операций
 * @param {Array} ops - Массив операций
 * @returns {Array} - Массив объектов { isIncome, accName, ... }
 */
const getTooltipOperationList = (ops) => {
  if (!ops || ops.length === 0) return [];

  // 1. Сортируем (самые крупные вверху)
  const sortedOps = [...ops].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  
  // 2. Форматируем в объекты
  return sortedOps.map(op => {
    if (op.isTransfer) return null; // Переводы пропускаем

    return {
      isIncome: op.type === 'income',
      // (?.name) - это "защита" на случай, если данные не подтянулись
      accName: op.accountId?.name || '???',
      contName: op.contractorId?.name || '---',
      projName: op.projectId?.name || '---',
      catName: op.categoryId?.name || 'Без категории',
      amount: op.amount
    };
  }).filter(Boolean); // Убираем null (если попались переводы)
};
// --- КОНЕЦ ИСПРАВЛЕНИЯ ---

/* ── Данные графика ─────────────────────────────────────────────────────── */
const chartData = computed(() => {
  const labels = [];
  const incomeData = [];
  const expenseData = [];
  const incomeDetails = []; 
  const expenseDetails = [];

  for (const day of props.visibleDays) {
    const dateKey = _getDateKey(day.date);
    const data = mainStore.dailyChartData.get(dateKey) || { income: 0, expense: 0 };
    
    // (allOperationsFlat должен быть экспортирован из mainStore)
    const allOps = (mainStore.allOperationsFlat || []);
    const incomeOps = allOps.filter(op => op.dateKey === dateKey && op.type === 'income');
    const expenseOps = allOps.filter(op => op.dateKey === dateKey && op.type === 'expense');
    
    incomeDetails.push(getTooltipOperationList(incomeOps)); // 👈 Добавляем массив ОБЪЕКТОВ
    expenseDetails.push(getTooltipOperationList(expenseOps)); // 👈 Добавляем массив ОБЪЕКТОВ

    labels.push(day.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
    incomeData.push(data.income);
    expenseData.push(Math.abs(data.expense));
  }

  return {
    labels,
    datasets: [
      { 
        label: 'Доход',
        backgroundColor: '#34c759', 
        data: incomeData,  
        stack: 'stack1',
        details: incomeDetails // 👈 Встраиваем детали в dataset
      },
      { 
        label: 'Расход', 
        backgroundColor: '#ff3b30', 
        data: expenseData, 
        stack: 'stack1',
        details: expenseDetails // 👈 Встраиваем детали в dataset
      }
    ]
  };
});

/* ── Опции графика (жёстко без анимаций) ────────────────────────────────── */
const chartOptions = computed(() => {
  const yMax = axisMax.value;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        // --- 🔴 ИСПРАВЛЕНИЕ v4.4: Кастомные подсказки ---
        callbacks: {
          /**
           * title - убираем дату, она нам не нужна
           */
          title: () => null,
          /**
           * label - теперь это наш ГЛАВНЫЙ рендерер.
           * Он возвращает МАССИВ СТРОК.
           */
          label: (context) => {
            const dataset = context.dataset;
            const index = context.dataIndex;
            
            // 1. Достаем ОБЩУЮ сумму (которая в .raw)
            const totalLabel = dataset.label || '';
            const totalValue = context.raw;
            const formattedTotal = totalLabel === 'Расход' 
              ? formatNumber(-Math.abs(totalValue)) 
              : formatNumber(totalValue);
            
            // Линия 1: "Расход: -6 000 000 т"
            const lines = [`${totalLabel}: ${formattedTotal} т`];

            // 2. Достаем наш массив ОБЪЕКТОВ [ {op1}, {op2}, ... ]
            const opsList = dataset.details?.[index];
            if (!opsList || opsList.length === 0) {
              return lines; // Возвращаем только заголовок, если деталей нет
            }
            
            lines.push('---'); // Линия 2: Разделитель

            // 3. 🔴 ИСПРАВЛЕНИЕ: УБРАН ЛИМИТ .slice(0, 3)
            // const opsToShow = opsList.slice(0, 3);

            // 4. Форматируем КАЖДУЮ операцию по вашему шаблону
            opsList.forEach(op => {
              const amountStr = formatNumber(Math.abs(op.amount)) + ' т';
              const acc = op.accName || '???';
              const cont = op.contName || '---';
              const proj = op.projName || '---';
              const cat = op.catName || 'Без кат.';
              
              lines.push(''); // Отступ

              if (op.isIncome) {
                // Доход: Сумма < На Счет < От Контрагента < ...
                lines.push(`${amountStr} < ${acc} < ${cont} < ${proj} < ${cat}`);
              } else {
                // Расход: Сумма > Со Счета > Контрагенту > ...
                lines.push(`${amountStr} > ${acc} > ${cont} > ${proj} > ${cat}`);
              }
            });

            // 5. 🔴 ИСПРАВЛЕНИЕ: Убрана строка "...и еще..."
            
            return lines;
          },
          /**
           * footer - больше не нужен, мы все делаем в label
           */
          footer: () => null
        }
        // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
      }
    },
    scales: {
      x: { stacked: true, display: false },
      y: { stacked: true, max: yMax, min: 0, display: false }
    }
  };
  
  // Если анимация ВЫКЛЮЧЕНА (default)
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


/* ── Принудительное обновление без анимаций ─────────────────────────────── */
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

    <div class="summaries-wrapper">
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
/* Корневой контейнер графика — колонковый flex
   КРИТИЧНО: min-height:0, чтобы контент НЕ растягивал родителя вниз */
.graph-area {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;      /* 👈 спасает от «проваливания» */
  overflow: hidden;   /* страховка */
}

/* Рубильник CSS-анимаций */
.no-anim, .no-anim * {
  transition: none !important;
  animation: none !important;
}

/* Область чарта должна строго вписываться в доступную высоту
   КРИТИЧНО: min-height:0, иначе flex-child будет тянуть родителя */
.chart-wrapper {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;      /* 👈 критично для корректного shrink */
  overflow: hidden;
  /* min-width: 1800px; (Удалено, т.к. ширина 100%) */
}

/* --- 🔴 ИСПРАВЛЕНИЕ: (flex -> grid) --- */
/* Зона сводок фиксированной высоты — низ */
.summaries-wrapper {
  flex: 0 0 90px;     /* ровно 90px высоты */
  height: 90px;
  border-top: 1px solid var(--color-border);
  overflow: hidden;
  
  /* --- 🔴 НОВЫЕ СТИЛИ (как в HomeView) --- */
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  width: 100%;
  /* --- КОНЕЦ ИСПРАВЛЕНИЯ --- */
}

/* Выставляем canvas на всю доступную площадь чарта (без аспект-рейшо) */
:deep(canvas) {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
}

/* Сводки */
.day-summary {
  /* --- 🔴 ИСПРАВЛЕНИЕ: min-width УДАЛЕН --- */
  /* min-width: 150px; (Больше не нужен) */ 
  
  padding: 8px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-size: 0.8em;
  border-right: 1px solid var(--color-border);
  
  /* 🔴 НОВОЕ: (для grid-ячеек) */
  overflow: hidden; /* Предотвращает "выпирание" текста */
}
.day-date   { color: #aaa; font-weight: bold; margin-bottom: 5px; }
.day-income { color: var(--color-primary); font-weight: 500; }
.day-expense{ color: var(--color-danger);  font-weight: 500; }
.day-balance{ color: #ccc; font-weight: 500; margin-top: 5px; }
</style>