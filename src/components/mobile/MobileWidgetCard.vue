<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import { useWidgetData } from '@/composables/useWidgetData.js';

const props = defineProps({
  widgetKey: { type: String, required: true },
});

const emit = defineEmits(['click', 'add', 'edit']);

const mainStore = useMainStore();
const { getWidgetItems } = useWidgetData();

// Robust number parser for values that may be formatted as strings like "2 400 000 ₸".
const toNum = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'boolean') return v ? 1 : 0;

    let s = String(v)
        .replace(/\u00A0/g, ' ')            // NBSP
        .replace(/[\s\u2009\u202F]/g, '') // spaces / thin spaces
        .trim();
    if (!s) return 0;

    // Keep digits and minus only
    s = s.replace(/[^0-9-]/g, '');
    // Allow only one leading minus
    s = s.replace(/(?!^)-/g, '');
    if (s === '' || s === '-') return 0;

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
};

const widgetInfo = computed(() => {
  const w = mainStore.allWidgets.find(x => x.key === props.widgetKey);
  return w ? w.name : 'Виджет';
});

const isForecastActive = computed(() => {
  const val = mainStore.dashboardForecastState[props.widgetKey];
  return val !== undefined ? val : true; 
});

const isListWidget = computed(() => {
    return ['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(props.widgetKey);
});

const isBalanceWidget = computed(() => {
    return ['accounts', 'companies'].includes(props.widgetKey);
});

const isLiabilitiesWidget = computed(() => props.widgetKey === 'liabilities');

const isSingleLineWidget = computed(() => {
    return [
        'incomeList', 
        'expenseList', 
        'withdrawalList', 
        'transfers',
        'liabilities'
    ].includes(props.widgetKey);
});

const isAlwaysNegativeWidget = computed(() => {
    return ['expenseList', 'withdrawalList', 'credits'].includes(props.widgetKey);
});

const isTransferWidget = computed(() => {
    return props.widgetKey === 'transfers';
});

const sortMode = computed(() => mainStore.widgetSortMode);
const filterMode = computed(() => mainStore.widgetFilterMode);

const items = computed(() => {
  if (isLiabilitiesWidget.value) return [];
  const rawList = getWidgetItems(props.widgetKey, isForecastActive.value);
  return filterAndSort(rawList);
});

const liabilitiesData = computed(() => {
    return {
        weOwe: mainStore.liabilitiesWeOwe || 0,
        theyOwe: mainStore.liabilitiesTheyOwe || 0,
        weOweFuture: mainStore.liabilitiesWeOweFuture || 0,
        theyOweFuture: mainStore.liabilitiesTheyOweFuture || 0
    };
});

function filterAndSort(originalList) {
    let list = [...(originalList || [])];

    const getFilterValue = (item) => {
        if (!item) return 0;
        if (isForecastActive.value && item.totalForecast !== undefined) return toNum(item.totalForecast);
        if (item.balance !== undefined) return toNum(item.balance);
        return toNum(item.currentBalance);
    };

    if (filterMode.value === 'positive') list = list.filter(i => getFilterValue(i) > 0);
    else if (filterMode.value === 'negative') list = list.filter(i => getFilterValue(i) < 0);
    else if (filterMode.value === 'nonZero') list = list.filter(i => getFilterValue(i) !== 0);

    const getSortVal = (i) => getFilterValue(i);
    if (sortMode.value === 'desc') list.sort((a, b) => getSortVal(b) - getSortVal(a));
    else if (sortMode.value === 'asc') list.sort((a, b) => getSortVal(a) - getSortVal(b));

    return list;
}

const isEmpty = computed(() => { 
    if (isLiabilitiesWidget.value) return false; 
    if (isListWidget.value) return false; 
    return items.value.length === 0; 
});

// 🟢 ИЗМЕНЕНО: Принудительный минус для расходов
const formatVal = (val) => {
    const num = toNum(val);
    const formatted = formatNumber(Math.abs(num));
    
    // Если это виджет расходов - всегда ставим минус (кроме 0)
    if (props.widgetKey === 'expenseList') {
        if (num === 0) return `${formatted} ₸`;
        return `- ${formatted} ₸`;
    }

    if (num < 0) return `- ${formatted} ₸`;
    return `₸ ${formatted}`;
};

// 🟢 ЛЕВАЯ КОЛОНКА (Факт): Строго Серый/Стандартный для Доходов
const getFactValueClass = (item) => {
    const val = (item?.currentBalance ?? item?.balance ?? 0);
    const num = toNum(val);
    
    // Если это виджет расходов - всегда красный цвет
    if (props.widgetKey === 'expenseList') return 'red-text';
    
    if (num < 0) return 'red-text';
    // ⚡️ ИНАЧЕ ВОЗВРАЩАЕМ БЕЛЫЙ/СЕРЫЙ (white-text имеет opacity 0.9)
    // Никогда не возвращаем зеленый для факта, как и просили.
    return 'white-text';
  };

const getRightValue = (item) => {
    if (isBalanceWidget.value) {
        return toNum(item.currentBalance) + toNum(item.futureChange);
    } 
    else {
        return toNum(item.futureChange);
    }
};

const getRightValueFormatted = (item) => {
    const val = getRightValue(item);
    const raw = toNum(val);
    const num = Math.abs(raw);
    const formatted = formatNumber(num);

    if (isBalanceWidget.value) return formatVal(raw);
    if (num === 0) return `${formatted} ₸`;
    if (isAlwaysNegativeWidget.value) return `- ${formatted} ₸`;
    if (isTransferWidget.value) return `${formatted} ₸`;

    // ⚡️ ПЛАН/ПРОГНОЗ: Всегда с плюсом для положительных значений
    if (raw > 0) return `+ ${formatted} ₸`;
    return `- ${formatted} ₸`;
};

// 🟢 ПРАВАЯ КОЛОНКА (План): Всегда Зеленый для положительного прогноза
const getRightValueClass = (item) => {
    // 🟢 Спец. логика для Счетов и Компаний
    if (isBalanceWidget.value) {
        const futureTotal = getRightValue(item);
        if (futureTotal < 0) return 'red-text';
        const change = toNum(item?.futureChange);
        // Рост -> Зеленый
        if (change > 0) return 'green-text';
        // Падение -> Красный
        if (change < 0) return 'red-text';
        // Без изменений -> Белый
        return 'white-text';
    }

    // Логика для остальных (Обороты, Налоги и т.д.)
    const val = getRightValue(item);
    const num = toNum(val);

    if (num === 0) return 'white-text';
    if (isAlwaysNegativeWidget.value) return 'red-text';
    if (isTransferWidget.value) return 'white-text';

    // ⚡️ ДЛЯ СПИСКОВ (IncomeList и др.): Положительный прогноз -> Зеленый
    return num >= 0 ? 'green-text' : 'red-text';
  };

const formatLiabilitiesPlan = (val) => {
    const num = toNum(val);
    const formatted = formatNumber(Math.abs(num));
    if (num === 0) return `${formatted} ₸`;
    return num >= 0 ? `+ ${formatted} ₸` : `- ${formatted} ₸`;
};

const getLiabilitiesPlanClass = (val, defaultClass) => {
    const num = toNum(val);
    if (num === 0) return 'white-text';
    return defaultClass;
};

const handleClick = () => { emit('click', props.widgetKey); };

const cardStyleClass = computed(() => {
  const k = props.widgetKey;
  if (k === 'withdrawalList') return 'style-purple'; 
  if (k === 'transfers') return 'style-dark-blue'; 
  if (k === 'individuals') return 'style-cyan'; 
  if (k === 'accounts') return 'style-blue-grey'; 
  if (k === 'companies') return 'style-teal'; 
  if (k === 'projects') return 'style-pink'; 
  if (k === 'incomeList') return 'style-green'; 
  if (k === 'expenseList' || k === 'contractors') return 'style-red'; 
  if (k === 'liabilities') return 'style-orange'; 
  if (k === 'credits') return 'style-light-blue'; 
  return 'style-gray';
});

// =========================
// UI snapshot (screen = truth)
// =========================
const _formatPlanSum = (val) => {
    const num = Math.abs(toNum(val));
    const formatted = formatNumber(num);

    // Balance widgets show future TOTAL (no +/- sign)
    if (isBalanceWidget.value) return formatVal(val);

  // 0 always without sign
  if (num === 0) return `${formatted} ₸`;

  // Always-negative widgets always show minus
  if (isAlwaysNegativeWidget.value) return `- ${formatted} ₸`;

  // Transfers show without sign
  if (isTransferWidget.value) return `${formatted} ₸`;

  // Default: positive with plus, negative with minus
  const raw = toNum(val);
  if (raw > 0) return `+ ${formatted} ₸`;
  return `- ${formatted} ₸`;
};

function getSnapshot() {
  const key = props.widgetKey;
  const title = widgetInfo.value;
  const forecastActive = Boolean(isForecastActive.value);

  // LIABILITIES (custom layout)
  if (isLiabilitiesWidget.value) {
    const weOweCurrent = toNum(liabilitiesData.value.weOwe);
    const theyOweCurrent = toNum(liabilitiesData.value.theyOwe);
    const weOweFuture = toNum(liabilitiesData.value.weOweFuture);
    const theyOweFuture = toNum(liabilitiesData.value.theyOweFuture);

    return {
      key,
      title,
      type: 'liabilities',
      showFutureBalance: forecastActive,
      rows: [
        {
          label: 'Должны отработать',
          kind: 'weOwe',
          current: weOweCurrent,
          currentText: formatVal(weOweCurrent),
          future: weOweFuture,
          futureText: formatLiabilitiesPlan(weOweFuture),
        },
        {
          label: 'Должны получить',
          kind: 'theyOwe',
          current: theyOweCurrent,
          currentText: formatVal(theyOweCurrent),
          future: theyOweFuture,
          futureText: formatLiabilitiesPlan(theyOweFuture),
        },
      ]
    };
  }

  const list = Array.isArray(items.value) ? items.value : [];

  const factSum = list.reduce((s, it) => {
    const v = (it && (it.currentBalance !== undefined ? it.currentBalance : it.balance)) ?? 0;
    return s + toNum(v);
  }, 0);

  const planSum = list.reduce((s, it) => {
    if (!forecastActive) return s;
    return s + toNum(getRightValue(it));
  }, 0);

  // Compact summary widgets (income/expense/withdrawals/transfers)
  if (isListWidget.value) {
    // Get detailed operations from mainStore for AI
    let detailedOperations = [];
    
    try {
      const pickStoreArray = (...names) => {
        for (const n of names) {
          const v = mainStore?.[n];
          if (Array.isArray(v) && v.length > 0) return v;
        }
        return [];
      };
      
      // Get current operations based on widget type
      if (key === 'incomeList') {
        detailedOperations = pickStoreArray('currentIncomes', 'currentIncome', 'incomesCurrent');
      } else if (key === 'expenseList') {
        detailedOperations = pickStoreArray('currentExpenses', 'currentExpense', 'expensesCurrent');
      } else if (key === 'withdrawalList') {
        detailedOperations = pickStoreArray('currentWithdrawals', 'currentWithdrawal', 'withdrawalsCurrent');
      } else if (key === 'transfers') {
        detailedOperations = pickStoreArray('currentTransfers', 'currentTransfer', 'transfersCurrent');
      }
    } catch (e) {
      console.warn('Failed to get detailed operations for', key, e);
    }

    // Map detailed operations for AI snapshot
    const detailItems = (detailedOperations || []).slice(0, 100).map((op) => {
      const amount = toNum(op?.amount ?? op?.sum ?? op?.value ?? 0);
      const date = op?.date ?? op?.dateIso ?? op?.operationDate ?? null;
      const contractor = op?.contractorName ?? op?.contractor ?? op?.counterparty ?? '';
      const category = op?.categoryName ?? op?.category ?? '';
      const account = op?.accountName ?? op?.account ?? '';
      const description = op?.description ?? op?.desc ?? op?.note ?? '';

      return {
        id: op?._id ?? null,
        date: date,
        name: contractor || category || account || description || 'Операция',
        amount: Math.abs(amount),
        contractor: contractor,
        category: category,
        account: account,
        description: description,
        type: op?.type ?? key.replace('List', ''),
        isExcluded: Boolean(op?.excludeFromTotals ?? op?.isExcluded),
      };
    });

    return {
      key,
      title,
      type: 'summary',
      showFutureBalance: forecastActive,

      // For backend summary answers
      rows: [
        {
          current: toNum(factSum),
          currentText: formatVal(factSum),
          future: toNum(planSum),
          futureText: _formatPlanSum(planSum),
        }
      ],

      // Detailed operations for AI
      items: detailItems,
      totalItems: detailedOperations.length,
    };
  }

  // Standard list widgets (accounts/companies/projects/contractors/categories/individuals/credits/etc.)
  const rows = list.slice(0, 50).map((it) => {
    const factVal = (it && (it.currentBalance !== undefined ? it.currentBalance : it.balance)) ?? 0;
    const planVal = forecastActive ? toNum(getRightValue(it)) : 0;

    return {
      id: it?._id ?? null,
      name: it?.name ?? '',
      fact: toNum(factVal),
      factText: formatVal(factVal),
      plan: planVal,
      planText: forecastActive ? getRightValueFormatted(it) : '',
      isExcluded: Boolean(it?.isExcluded),
      isLinked: Boolean(it?.isLinked),
      linkMarkerColor: it?.linkMarkerColor ?? null,
    };
  });

  return {
    key,
    title,
    type: 'list',
    showFutureBalance: forecastActive,
    rows,
    totalItems: list.length,
  };
}

defineExpose({ getSnapshot });
</script>

<template>
  <div 
    class="mobile-widget-card auto-height" 
    :class="[cardStyleClass, { 'limit-height': !isSingleLineWidget }]" 
    @click="handleClick"
  >
    <div class="widget-header">
      <div class="header-badge badge-fact">Факт</div>
      <div class="widget-title">{{ widgetInfo }}</div>
      <div class="header-badge badge-plan" :class="{ active: isForecastActive }">План</div>
    </div>

    <div class="widget-body scrollable-list">
      
      <!-- LIABILITIES WIDGET -->
      <div v-if="isLiabilitiesWidget" class="items-list three-col-grid">
          <div class="list-item-grid">
              <div class="col-left white-text">{{ formatVal(liabilitiesData.weOwe) }}</div>
              <div class="col-center">Должны отработать</div>
              <div class="col-right" :class="getLiabilitiesPlanClass(liabilitiesData.weOweFuture, 'red-text')">
                  {{ isForecastActive ? formatLiabilitiesPlan(liabilitiesData.weOweFuture) : '' }}
              </div>
          </div>

          <div class="list-item-grid">
              <div class="col-left white-text">{{ formatVal(liabilitiesData.theyOwe) }}</div>
              <div class="col-center">Должны получить</div>
              <div class="col-right" :class="getLiabilitiesPlanClass(liabilitiesData.theyOweFuture, 'orange-text')">
                  {{ isForecastActive ? formatLiabilitiesPlan(liabilitiesData.theyOweFuture) : '' }}
              </div>
          </div>
      </div>

      <div v-else-if="isEmpty" class="empty-text">Нет данных</div>
      
      <!-- STANDARD LIST -->
      <div v-else class="items-list three-col-grid">
        <div v-for="item in items.slice(0, 50)" :key="item._id" class="list-item-grid">
          
          <!-- КОЛОНКА 1: ФАКТ -->
          <div class="col-left" :class="getFactValueClass(item)">
             {{ formatVal(item.currentBalance !== undefined ? item.currentBalance : item.balance) }}
          </div>
          
          <!-- КОЛОНКА 2: НАЗВАНИЕ (Центр) -->
          <div class="col-center">
              <span v-if="item.linkMarkerColor" class="color-dot" :style="{ backgroundColor: item.linkMarkerColor }"></span>
              {{ item.name }}
              
              <!-- 🟢 Иконка связанности -->
              <span v-if="item.isLinked" class="link-icon">
                 <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              </span>

              <!-- 🟢 Иконка исключенного счета -->
              <span v-if="item.isExcluded" class="excluded-icon" title="Исключен из общего баланса">
                 <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              </span>
          </div>
          
          <!-- КОЛОНКА 3: ПЛАН (Дельта) -->
          <div class="col-right">
              <template v-if="isForecastActive">
                  <span :class="getRightValueClass(item)">
                      {{ getRightValueFormatted(item) }}
                  </span>
              </template>
          </div>
          
        </div>
        
        <div v-if="items.length > 50" class="more-text">Еще {{ items.length - 50 }}...</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-widget-card { 
  background-color: var(--widget-background, #ffffff); 
  border: 1px solid var(--widget-border, #87bde9); 
  margin-top: 12px; 
  display: flex; 
  flex-direction: column; 
  padding: 0; 
  box-sizing: border-box; 
  overflow: hidden; 
  cursor: pointer; 
  border-radius: 12px; 
  border-top-width: 4px; 
  border-top-style: solid;
  transition: transform 0.15s ease;
}

.mobile-widget-card.auto-height { height: auto; min-height: 60px; }
.mobile-widget-card.limit-height .widget-body { max-height: 320px; overflow-y: auto; scrollbar-width: none; }
.mobile-widget-card.limit-height .widget-body::-webkit-scrollbar { display: none; }
.mobile-widget-card:active { background-color: rgba(255,255,255,0.05); transform: scale(0.98); }

/* Colors */
.style-purple { border-top-color: rgba(135,189,233,0.4); }
.style-dark-blue { border-top-color: rgba(135,189,233,0.4); }
.style-cyan { border-top-color: rgba(135,189,233,0.4); }
.style-blue-grey { border-top-color: rgba(135,189,233,0.4); }
.style-teal { border-top-color: rgba(135,189,233,0.4); }
.style-pink { border-top-color: rgba(135,189,233,0.4); }
.style-green { border-top-color: rgba(135,189,233,0.4); }
.style-red { border-top-color: rgba(135,189,233,0.4); }
.style-orange { border-top-color: rgba(135,189,233,0.4); }
.style-light-blue { border-top-color: rgba(135,189,233,0.4); }
.style-gray { border-top-color: rgba(135,189,233,0.4); }

.widget-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); flex-shrink: 0; min-height: 30px; }
.widget-title { font-size: 15px; color: var(--color-text, #fff); font-weight: 600; text-align: center; flex-grow: 1; }
.header-badge { font-size: 11px; padding: 3px 10px; border-radius: 6px; font-weight: 600; text-transform: capitalize; min-width: 40px; text-align: center; }
.badge-fact { background-color: rgba(135,189,233,0.15); color: var(--color-text, #1a1a1a); }
.badge-plan { background-color: transparent; color: var(--text-mute, #888); border: 1px solid var(--widget-border, #e0e0e0); }
.badge-plan.active { background-color: rgba(52, 199, 89, 0.15); color: var(--color-primary, #34c759); border: 1px solid var(--color-primary, #34c759); }

.widget-body { flex-grow: 1; overflow: hidden; padding: 10px 12px 14px 12px; }
.items-list.three-col-grid { display: flex; flex-direction: column; gap: 8px; }
.list-item-grid { display: grid; grid-template-columns: 1fr 1.2fr 1fr; align-items: center; font-size: 13px; line-height: 1.3; }

.col-left { text-align: left; white-space: nowrap; font-weight: 500; }

.col-center {
    text-align: center;
    color: var(--color-text, #ccc);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.col-right { text-align: right; white-space: nowrap; font-weight: 600; }

.white-text { color: var(--color-text, #fff); opacity: 0.9; }
.green-text { color: var(--color-primary, #34c759); }
.red-text { color: #ff3b30; }
.orange-text { color: #FF9D00; }

.empty-text { font-size: 13px; color: #555; text-align: center; margin-top: 10px; }
.more-text { font-size: 11px; color: #666; text-align: right; margin-top: 4px; }
.color-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; }
.link-icon { color: var(--color-primary, #34c759); opacity: 0.8; margin-left: 2px; }
.excluded-icon { color: #888; opacity: 0.8; margin-left: 4px; }
</style>
