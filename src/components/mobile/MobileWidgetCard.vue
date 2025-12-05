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

const widgetInfo = computed(() => {
  const w = mainStore.allWidgets.find(x => x.key === props.widgetKey);
  return w ? w.name : 'Виджет';
});

// 🟢 ИЗМЕНЕНИЕ: По умолчанию true (активен), если в сторе нет явного false
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

// 🟢 НОВЫЕ ГРУППЫ ВИДЖЕТОВ
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
  // Триггеры реактивности
  if (mainStore.transactions) {};
  if (mainStore.categories) {};
  if (mainStore.allWidgets) {};

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
        if (isForecastActive.value && item.totalForecast !== undefined) return item.totalForecast;
        return item.balance !== undefined ? item.balance : item.currentBalance;
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

// 🟢 ФОРМАТИРОВАНИЕ ДЛЯ ЛЕВОЙ КОЛОНКИ (ФАКТ)
const formatVal = (val) => {
    const num = Number(val) || 0; // Берем число как есть, чтобы проверить знак
    const formatted = formatNumber(Math.abs(num));

    // Если значение отрицательное - ставим минус и формат
    if (num < 0) {
        return `- ${formatted} ₸`;
    }
    
    // Если положительное - просто сумма
    return `₸ ${formatted}`;
};

// 🟢 ЦВЕТ ДЛЯ ЛЕВОЙ КОЛОНКИ (ФАКТ)
const getFactValueClass = (val) => {
    const num = Number(val) || 0;
    if (num < 0) return 'red-text';
    return 'white-text';
};

// Хелпер для определения значения правой колонки
const getRightValue = (item) => {
    if (isBalanceWidget.value) {
        return item.currentBalance + (item.futureChange || 0);
    } else {
        return item.futureChange || 0;
    }
};

// 🟢 ФОРМАТИРОВАНИЕ ДЛЯ ПРАВОЙ КОЛОНКИ (ПЛАН)
const getRightValueFormatted = (item) => {
    const val = getRightValue(item);
    const num = Math.abs(Number(val) || 0);
    const formatted = formatNumber(num);

    // Счета, Компании -> Без знака (накопительные)
    if (isBalanceWidget.value) {
        return `${formatted} ₸`;
    }

    // 🟢 ЕСЛИ 0 -> Без знака (для всех кроме счетов/компаний)
    if (num === 0) {
        return `${formatted} ₸`;
    }

    // Расходы, Выводы, Кредиты -> Всегда с минусом (если не 0)
    if (isAlwaysNegativeWidget.value) {
        return `- ${formatted} ₸`;
    }

    // Переводы -> Без знака
    if (isTransferWidget.value) {
        return `${formatted} ₸`;
    }

    // Остальные (Доходы и пр.) -> Со знаком +/-
    if (val > 0) return `+ ${formatted} ₸`;
    return `- ${formatted} ₸`;
};

// 🟢 ЦВЕТ ДЛЯ ПРАВОЙ КОЛОНКИ
const getRightValueClass = (item) => {
    const val = getRightValue(item);
    const num = Number(val) || 0;

    // 🟢 ЕСЛИ 0 и не балансовый -> Белый (без цвета)
    if (!isBalanceWidget.value && num === 0) {
        return 'white-text';
    }

    // Расходы, Выводы, Кредиты -> Всегда красный
    if (isAlwaysNegativeWidget.value) return 'red-text';
    
    // Переводы -> Белый
    if (isTransferWidget.value) return 'white-text';

    return val >= 0 ? 'green-text' : 'red-text';
};

// LIABILITIES SPECIAL FORMATTERS
const formatLiabilitiesPlan = (val) => {
    const num = Number(val) || 0;
    const formatted = formatNumber(Math.abs(num));
    // Если 0 -> просто значение
    if (num === 0) return `${formatted} ₸`;
    return val >= 0 ? `+ ${formatted} ₸` : `- ${formatted} ₸`;
};

// Хелпер для цвета обязательств
const getLiabilitiesPlanClass = (val, defaultClass) => {
    const num = Number(val) || 0;
    if (num === 0) return 'white-text';
    return defaultClass;
};

const handleClick = () => { emit('click', props.widgetKey); };

// ЦВЕТОВАЯ КОДИРОВКА И СТИЛИ
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
</script>

<template>
  <div 
    class="mobile-widget-card auto-height" 
    :class="[cardStyleClass, { 'limit-height': !isSingleLineWidget }]" 
    @click="handleClick"
  >
    <!-- 🟢 НОВЫЙ ХЕДЕР: Факт - Заголовок - План -->
    <div class="widget-header">
      <div class="header-badge badge-fact">Факт</div>
      <div class="widget-title">{{ widgetInfo }}</div>
      <div class="header-badge badge-plan" :class="{ active: isForecastActive }">План</div>
    </div>

    <div class="widget-body scrollable-list">
      
      <!-- LIABILITIES WIDGET (Специфичный лейаут) -->
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
          
          <!-- КОЛОНКА 1: ФАКТ (Динамический цвет и знак) -->
          <div class="col-left" :class="getFactValueClass(item.currentBalance || item.balance)">
             {{ formatVal(item.currentBalance || item.balance) }}
          </div>
          
          <!-- КОЛОНКА 2: НАЗВАНИЕ (Центр) -->
          <div class="col-center">
              <span v-if="item.linkMarkerColor" class="color-dot" :style="{ backgroundColor: item.linkMarkerColor }"></span>
              {{ item.name }}
              <span v-if="item.isLinked" class="link-icon">
                 <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              </span>
          </div>
          
          <!-- КОЛОНКА 3: ПЛАН (Цвет зависит от виджета) -->
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
  background-color: var(--color-background-soft, #282828); 
  border: 1px solid #333; 
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

.mobile-widget-card.auto-height {
  height: auto;
  min-height: 60px;
}

.mobile-widget-card.limit-height .widget-body {
  max-height: 320px; 
  overflow-y: auto; 
  scrollbar-width: none;
}
.mobile-widget-card.limit-height .widget-body::-webkit-scrollbar { display: none; }

.mobile-widget-card:active { background-color: rgba(255,255,255,0.05); transform: scale(0.98); }

/* ЦВЕТОВЫЕ СТИЛИ ТОПА */
.style-purple { border-top-color: #666666; }
.style-dark-blue { border-top-color: #666666; }
.style-cyan { border-top-color: #666666; }
.style-blue-grey { border-top-color: #666666; }
.style-teal { border-top-color: #666666; }
.style-pink { border-top-color: #666666; }
.style-green { border-top-color: #666666; }
.style-red { border-top-color: #666666; }
.style-orange { border-top-color: #666666; }
.style-light-blue { border-top-color: #666666; }
.style-gray { border-top-color: #666666; }

/* ХЕДЕР */
.widget-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  padding: 10px 12px 6px 12px; 
  border-bottom: 1px solid rgba(255,255,255,0.05); 
  flex-shrink: 0; 
  min-height: 30px; 
}

.widget-title { 
    font-size: 15px; 
    color: #fff; 
    font-weight: 600; 
    text-align: center;
    flex-grow: 1;
}

.header-badge {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 6px;
    font-weight: 600;
    text-transform: capitalize;
    min-width: 40px;
    text-align: center;
}

.badge-fact {
    background-color: #444; /* Серый фон */
    color: #ccc;
}

.badge-plan {
    background-color: transparent;
    color: #555;
    border: 1px solid #444;
}

.badge-plan.active {
    background-color: rgba(52, 199, 89, 0.2);
    color: var(--color-primary, #34c759);
    border: 1px solid var(--color-primary, #34c759);
}

.widget-body { 
  flex-grow: 1; 
  overflow: hidden; 
  padding: 10px 12px 14px 12px; 
}

/* СЕТКА 3 КОЛОНКИ */
.items-list.three-col-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.list-item-grid {
    display: grid;
    /* Лево (Факт) | Центр (Имя) | Право (План) */
    grid-template-columns: 1fr 1.2fr 1fr; 
    align-items: center;
    font-size: 13px;
    line-height: 1.3;
}

.col-left {
    text-align: left;
    white-space: nowrap;
    font-weight: 500;
}

.col-center {
    text-align: center;
    color: #ccc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 4px;
}

.col-right {
    text-align: right;
    white-space: nowrap;
    font-weight: 600;
}

.white-text { color: #fff; opacity: 0.9; }
.green-text { color: var(--color-primary, #34c759); }
.red-text { color: #ff3b30; }
.orange-text { color: #FF9D00; }

.empty-text { font-size: 13px; color: #555; text-align: center; margin-top: 10px; }
.more-text { font-size: 11px; color: #666; text-align: right; margin-top: 4px; }
.color-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; }
.link-icon { color: var(--color-primary, #34c759); opacity: 0.8; margin-left: 2px; }
</style>