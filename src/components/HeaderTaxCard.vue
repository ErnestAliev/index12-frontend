<script setup>
import { computed, ref, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

const props = defineProps({
  title: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true },
  emptyText: { type: String, default: "Нет компаний" }
});

const emit = defineEmits(['add', 'edit']);
const mainStore = useMainStore();

const isTaxWarmupDone = ref(false);

const isLoading = computed(() => {
  // Prefer store flag if present, but fallback to local warmup
  const storeLoading = (mainStore && mainStore.isTaxOpsLoading === true);
  return storeLoading || !isTaxWarmupDone.value;
});

onMounted(async () => {
  try {
    // If the store supports full-history warmup, wait for it once on mount
    if (mainStore && typeof mainStore.ensureTaxOpsUntil === 'function') {
      await mainStore.ensureTaxOpsUntil(new Date());
    }
  } catch (e) {
    // Silent: taxes will still render from whatever data is available
  } finally {
    isTaxWarmupDone.value = true;
  }
});


// Состояние прогноза (синхронизировано со стором)
const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

// Используем данные из стора
const companies = computed(() => mainStore.companies);

// Хелпер для безопасного получения ID
const getSafeId = (val) => {
    if (!val) return null;
    if (typeof val === 'object') return val._id || null;
    return val;
};

// Расчет налогов
const taxItems = computed(() => {
    // 🟢 1. Триггер реактивности:
    // Обращаемся к массиву операций, чтобы пересчет срабатывал при подгрузке данных (при смене 12д -> 1мес)
    const _opsTrigger = (mainStore.allOperationsFlat?.length || 0) + (mainStore.dealOperations?.length || 0) + (mainStore.taxKnownOperations?.length || 0) + (mainStore.taxOpsCache?.length || 0); 
    
    // 🟢 2. Получаем актуальную дату конца диапазона
    // Если projection.rangeEndDate меняется (переключение в навигации), это свойство пересчитается
    const rangeEndDate = mainStore.projection?.rangeEndDate ? new Date(mainStore.projection.rangeEndDate) : null;
    
    // Устанавливаем конец дня для корректного сравнения
    if (rangeEndDate) {
        rangeEndDate.setHours(23, 59, 59, 999);
    }

    const now = new Date();

    return companies.value.map(comp => {
        // --- А. РАСЧЕТ ТЕКУЩИЙ (Факт на сегодня) ---
        // Считаем начисления строго до текущего момента
        const currentCalc = mainStore.calculateTaxForPeriod(comp._id, null, now);
        
        // Оплачено (только операции с датой <= сейчас)
        const paidCurrent = mainStore.taxes
            .filter(t => {
                const tCompId = getSafeId(t.companyId);
                const tDate = t.date ? new Date(t.date) : new Date(0);
                return tCompId === comp._id && t.status === 'paid' && tDate <= now;
            })
            .reduce((acc, t) => acc + (t.amount || 0), 0);

        const currentDebt = Math.max(0, currentCalc.tax - paidCurrent);

        // --- Б. РАСЧЕТ ПРОГНОЗА (С учетом диапазона) ---
        // Передаем rangeEndDate. Если диапазон сузился (1мес -> 12д), rangeEndDate станет ближе,
        // и calculateTaxForPeriod отсечет будущие операции.
        const totalCalc = mainStore.calculateTaxForPeriod(comp._id, null, rangeEndDate);
        
        // Оплачено всего (включая будущие платежи, если они попадают в выбранный диапазон)
        const paidTotal = mainStore.taxes
            .filter(t => {
                const tCompId = getSafeId(t.companyId);
                const tDate = t.date ? new Date(t.date) : new Date(0);
                // Учитываем платежи, которые попадают в выбранный диапазон
                const isInRange = rangeEndDate ? tDate <= rangeEndDate : true;
                return tCompId === comp._id && t.status === 'paid' && isInRange;
            })
            .reduce((acc, t) => acc + (t.amount || 0), 0);

        // Долг на конец периода
        const totalDebt = Math.max(0, totalCalc.tax - paidTotal);

        // --- В. ДЕЛЬТА (Изменение за период) ---
        // Разница между долгом на конец периода и текущим долгом.
        // ✅ ИСПРАВЛЕНО: Используем Math.max(0, ...) как в мобильной версии
        // Это гарантирует, что дельта всегда >= 0 (прирост долга)
        // Если долг уменьшится (платеж превысит начисления), дельта = 0
        const futureDiff = Math.max(0, totalDebt - currentDebt);
        
        return {
            _id: comp._id,
            name: comp.name,
            regime: comp.taxRegime === 'simplified' ? 'УПР' : 'ОУР',
            percent: comp.taxPercent,
            
            // Данные для отображения (положительные числа, знак добавим в шаблоне)
            currentDebt: currentDebt,
            futureDebt: futureDiff, // Изменение (+ сколько добавится долга)
            totalFutureDebt: totalDebt, // Итоговый долг в будущем (не используем в отображении, но храним)
            
            // Для совместимости
            income: currentCalc.income,
            expense: currentCalc.expense
        };
    });
});

// Форматирование
const formatMoney = (val) => formatNumber(Math.floor(Math.abs(val || 0)));

// 🟢 NEW: Форматтер для дельты (плана)
// Если > 0, значит долг растет (плохо, expense-text) -> "- 9 000"
// Если < 0, значит долг уменьшается (платеж, good) -> "+ 1 000"
const formatDelta = (val) => {
    const num = Math.floor(val || 0);
    if (num === 0) return '0';
    
    // Если число положительное (долг вырос), ставим минус
    if (num > 0) return `- ${formatNumber(num)}`;
    
    // Если число отрицательное (долг уменьшился), ставим плюс
    return `+ ${formatNumber(Math.abs(num))}`;
};


// 🟢 NEW: Класс цвета для дельты
const getDeltaClass = (val) => {
    if (val === 0) return 'zero-tax';
    if (val > 0) return 'expense-text'; // Долг растет -> Красный
    return 'income-text'; // Долг падает -> Зеленый
};


// =========================
// UI snapshot (screen = truth)
// =========================
function getSnapshot() {
  const rows = (taxItems.value || []).map((item) => {
    const currentDebt = Number(item?.currentDebt) || 0;
    const futureDelta = Number(item?.futureDebt) || 0; // delta shown in UI in forecast mode

    // Match UI text exactly
    const currentText = `- ${formatMoney(currentDebt)} ₸`;
    const futureDeltaText = `${formatDelta(futureDelta)} ₸`;

    return {
      id: item?._id ?? null,
      name: item?.name ?? '',
      regime: item?.regime ?? null,
      percent: item?.percent ?? null,

      currentDebt,
      currentText,

      futureDelta,
      futureDeltaText,

      // Optional: available for deeper answers if needed later
      totalFutureDebt: Number(item?.totalFutureDebt) || 0,
    };
  });

  const totalCurrentDebt = rows.reduce((s, r) => s + (Number(r.currentDebt) || 0), 0);

  return {
    key: props.widgetKey,
    title: props.title,
    type: 'taxes',
    showFutureBalance: Boolean(showFutureBalance.value),
    isLoading: Boolean(isLoading.value),
    rows,
    totals: {
      totalCurrentDebt,
      totalCurrentDebtText: `- ${formatMoney(totalCurrentDebt)} ₸`,
    }
  };
}

defineExpose({ getSnapshot });

</script>

<template>
  <div class="dashboard-card">
    <div class="card-title-container card-drag-handle">
      <!-- Заголовок -->
      <div class="card-title">
          {{ title }}
          <span v-if="isLoading" class="tax-loading">обновляю…</span>
        </div>
      
      <div class="card-actions" @mousedown.stop @touchstart.stop @pointerdown.stop>
        
        <!-- Кнопка Прогноз -->
        <button 
          class="action-square-btn" 
          :class="{ 'active': showFutureBalance }" 
          @click.stop="showFutureBalance = !showFutureBalance" 
          title="Прогноз"
        >
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="7" y1="17" x2="17" y2="7"></line>
            <polyline points="7 7 17 7 17 17"></polyline>
          </svg>
        </button>

        <button @click.stop="$emit('edit')" class="action-square-btn" title="История налогов / Редактор">
           <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button @click.stop="$emit('add')" class="action-square-btn" title="Оплатить налог">
           <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </div>

    <div class="card-items-list" :class="{ 'forecast-mode': showFutureBalance }">
      <div v-for="item in taxItems" :key="item._id" class="card-item tax-grid">
        <!-- Название компании -->
        <span class="name-cell" :title="item.name">{{ item.name }}</span>
        
        <!-- Режим и процент -->
        <span class="regime-cell">
            <span class="badge" :class="item.regime === 'УПР' ? 'badge-upr' : 'badge-our'">
                {{ item.regime }} {{ item.percent }}%
            </span>
        </span>

        <!-- Сумма налога (Логика отображения) -->
        <span class="amount-cell-wrapper">
            <!-- Режим ФАКТ -->
            <!-- 🟢 Всегда красный (расход), всегда с минусом -->
            <span v-if="!showFutureBalance" class="amount-single expense-text" :class="{ 'zero-tax': item.currentDebt === 0 }">
                <span class="currency">₸</span> - {{ formatMoney(item.currentDebt) }}
            </span>

            <!-- Режим ПРОГНОЗ -->
            <span v-else class="forecast-display">
                <!-- Текущий долг -->
                <span class="current-val expense-text" :class="{ 'zero-tax': item.currentDebt === 0 }">
                    - {{ formatMoney(item.currentDebt) }}
                </span>
                
                <span class="arrow">></span>
                
                <!-- 🟢 Будущий долг (ДЕЛЬТА) -->
                <!-- Отображаем только изменение за период -->
                <span class="future-val" :class="getDeltaClass(item.futureDebt)">
                    {{ formatDelta(item.futureDebt) }}
                </span>
            </span>
        </span>
      </div>
      
      <p v-if="!taxItems.length" class="card-item-empty">{{ emptyText }}</p>
    </div>
  </div>
</template>

<style scoped>
.dashboard-card { 
  display: flex; flex-direction: column; 
  height: 100%; 
  overflow: hidden; 
  padding-right: 1.5rem; 
  border-right: 1px solid var(--color-border); 
  position: relative; 
}
.dashboard-card:last-child { border-right: none; padding-right: 0; }

.card-title-container { 
  display: flex; justify-content: space-between; align-items: center; 
  height: var(--h-header-card); 
  flex-shrink: 0; 
  cursor: grab;
}
.card-title-container:active { cursor: grabbing; }

.card-title { 
  font-size: var(--font-sm); 
  color: var(--text-main); 
  font-weight: var(--fw-semi);
}

.tax-loading {
  margin-left: 10px;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: var(--fw-regular);
}


.card-actions { display: flex; gap: 6px; }

/* Используем переменные из theme.css */
.action-square-btn { 
  width: 18px; height: 18px; 
  border: 1px solid var(--btn-widget-border); border-radius: 4px; 
  background-color: var(--btn-widget-bg); 
  display: flex; align-items: center; justify-content: center; 
  cursor: pointer; padding: 0; color: var(--btn-widget-color); 
  transition: all var(--trans-fast); 
}
.action-square-btn:hover { background-color: var(--btn-widget-bg-hover); color: var(--btn-widget-color-hover); }
.action-square-btn.active { background-color: var(--btn-widget-bg-active); color: var(--btn-widget-color-active); border-color: var(--btn-widget-border-active); }

.icon-svg { width: 11px; height: 11px; display: block; object-fit: contain; }

.card-items-list { 
  flex-grow: 1; overflow-y: auto; 
  padding-right: 5px; scrollbar-width: none; 
  display: flex; flex-direction: column; gap: 4px;
}
.card-items-list::-webkit-scrollbar { display: none; }

/* Сетка для строки налога */
.tax-grid {
    display: grid;
    grid-template-columns: 1fr auto minmax(80px, auto);
    gap: 8px;
    align-items: center;
    font-size: var(--font-sm);
}

.name-cell { 
    color: var(--text-soft); 
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
}

.regime-cell {
    display: flex;
    justify-content: center;
}

.badge {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 4px;
    font-weight: 700;
    text-transform: uppercase;
}
.badge-upr { background-color: rgba(52, 199, 89, 0.15); color: #34c759; border: 1px solid rgba(52, 199, 89, 0.3); }
.badge-our { background-color: rgba(255, 157, 0, 0.15); color: #FF9D00; border: 1px solid rgba(255, 157, 0, 0.3); }

.amount-cell-wrapper {
    text-align: right;
    white-space: nowrap;
}

/* 🟢 Стили сумм */
.amount-single { 
    font-weight: var(--fw-medium); 
    font-variant-numeric: tabular-nums;
}

.forecast-display {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
    font-variant-numeric: tabular-nums;
}

.expense-text { color: var(--color-danger); } /* Красный цвет */
.income-text { color: var(--color-primary); } /* Зеленый цвет */

.current-val { font-weight: 400; opacity: 0.9; }
.future-val { font-weight: 600; }

.arrow { color: var(--text-mute); font-size: 0.9em; }

.zero-tax { color: var(--text-mute); opacity: 0.5; } /* Если долг 0 - серый цвет */

.currency { font-size: 0.85em; color: inherit; opacity: 0.7; font-weight: 400; margin-right: 2px; }
.card-item-empty { font-size: var(--font-xs); color: #666; margin-top: 5px; font-style: italic; }

@media (max-height: 900px) {
  .dashboard-card { padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .tax-grid { font-size: 0.8em; }
}
</style>