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

const isForecastActive = computed(() => {
  return mainStore.dashboardForecastState[props.widgetKey] ?? false;
});

const isListWidget = computed(() => {
    return ['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(props.widgetKey);
});

const isBalanceWidget = computed(() => {
    return ['accounts', 'companies'].includes(props.widgetKey);
});

const isLiabilitiesWidget = computed(() => props.widgetKey === 'liabilities');

const sortMode = computed(() => mainStore.widgetSortMode);
const filterMode = computed(() => mainStore.widgetFilterMode);

const items = computed(() => {
  if (isLiabilitiesWidget.value) return [];
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

const formatVal = (val) => `${formatNumber(Math.abs(Number(val) || 0))} ₸`;

const formatDelta = (val) => { 
  const num = Number(val) || 0; 
  if (num === 0) return '0 ₸'; 
  const formatted = formatNumber(Math.abs(num)); 
  return num > 0 ? `+ ${formatted} ₸` : `- ${formatted} ₸`; 
};

const getDeltaClass = (val) => {
    const num = Number(val) || 0;
    return num > 0 ? 'green-text' : (num < 0 ? 'red-text' : 'white-text');
};

const getValueClass = (val) => {
    const num = Number(val) || 0;
    if (isListWidget.value) { 
        if (props.widgetKey === 'incomeList') return 'green-text'; 
        if (props.widgetKey === 'transfers') return 'white-text'; 
        return 'red-text'; 
    }
    return num < 0 ? 'red-text' : 'white-text';
};

const handleClick = () => { emit('click', props.widgetKey); };

// 🟢 ЦВЕТОВАЯ КОДИРОВКА И СТИЛИ (Neon Shadows)
const cardStyleClass = computed(() => {
  const k = props.widgetKey;
  
  // 1. Выводы (#7B1FA2 - Фиолетовый)
  if (k === 'withdrawalList') return 'style-purple'; 
  
  // 2. Переводы (#001969 - Темно-синий)
  if (k === 'transfers') return 'style-dark-blue'; 
  
  // 3. Физлица (#00BCD4 - Циан/Бирюзовый)
  if (k === 'individuals') return 'style-cyan'; 
  
  // 4. Счета (#607D8B - Сизый/Blue Grey)
  if (k === 'accounts') return 'style-blue-grey'; 
  
  // 5. Компании (#009688 - Тил/Морская волна)
  if (k === 'companies') return 'style-teal'; 
  
  // 6. Проекты (#E91E63 - Малиновый/Pink)
  if (k === 'projects') return 'style-pink'; 

  // --- СТАНДАРТНЫЕ ГРУППЫ ---
  if (k === 'incomeList') return 'style-green'; // Доходы
  if (k === 'expenseList' || k === 'contractors') return 'style-red'; // Расходы / Контрагенты
  if (k === 'liabilities') return 'style-orange'; // Обязательства
  if (k === 'credits') return 'style-light-blue'; // Кредиты

  return 'style-gray';
});
</script>

<template>
  <div class="mobile-widget-card" :class="cardStyleClass" @click="handleClick">
    <div class="widget-header">
      <div class="widget-title-row">
        <span class="widget-title">{{ widgetInfo }}</span>
        <span v-if="isForecastActive" class="forecast-badge">Прогноз</span>
      </div>
      <div class="widget-arrow">
         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </div>
    </div>

    <div class="widget-body scrollable-list">
      
      <div v-if="isLiabilitiesWidget" class="items-list" :class="{ 'forecast-mode': isForecastActive }">
          <div class="list-item">
              <div class="name-cell">Должны отработать</div>
              <template v-if="isForecastActive">
                  <div class="current-cell red-text">{{ formatVal(liabilitiesData.weOwe) }}</div>
                  <div class="arrow-cell">&gt;</div>
                  <div class="future-cell red-text">{{ formatVal(liabilitiesData.weOweFuture) }}</div>
              </template>
              <template v-else>
                  <div class="single-val-cell red-text">{{ formatVal(liabilitiesData.weOwe) }}</div>
              </template>
          </div>

          <div class="list-item">
              <div class="name-cell">Должны получить</div>
              <template v-if="isForecastActive">
                  <div class="current-cell orange-text">{{ formatVal(liabilitiesData.theyOwe) }}</div>
                  <div class="arrow-cell">&gt;</div>
                  <div class="future-cell orange-text">{{ formatVal(liabilitiesData.theyOweFuture) }}</div>
              </template>
              <template v-else>
                  <div class="single-val-cell orange-text">{{ formatVal(liabilitiesData.theyOwe) }}</div>
              </template>
          </div>
      </div>

      <div v-else-if="isEmpty" class="empty-text">Нет данных</div>
      
      <div v-else class="items-list" :class="{ 'forecast-mode': isForecastActive }">
        <div v-for="item in items.slice(0, 8)" :key="item._id" class="list-item">
          
          <div class="name-cell">
              <span 
                v-if="item.linkMarkerColor" 
                class="color-dot" 
                :style="{ backgroundColor: item.linkMarkerColor }"
              ></span>

              {{ item.name }}

              <span v-if="item.isLinked" class="link-icon">
                 <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              </span>
          </div>
          
          <template v-if="isForecastActive">
              <div class="current-cell" :class="getValueClass(item.currentBalance)">{{ formatVal(item.currentBalance) }}</div>
              <div class="arrow-cell">&gt;</div>
              
              <div v-if="isBalanceWidget" class="future-cell" :class="getValueClass(item.currentBalance + (item.futureChange || 0))">
                  {{ formatVal(item.currentBalance + (item.futureChange || 0)) }}
              </div>
              <div v-else class="future-cell" :class="getDeltaClass(item.futureChange)">
                  {{ formatDelta(item.futureChange) }}
              </div>
          </template>

          <template v-else>
              <div class="single-val-cell" :class="getValueClass(item.balance || item.currentBalance)">{{ formatVal(item.balance || item.currentBalance) }}</div>
          </template>
          
        </div>
        
        <div v-if="items.length > 8" class="more-text">Еще {{ items.length - 8 }}...</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-widget-card { 
  background-color: var(--color-background-soft, #282828); 
  border: 1px solid var(--color-border, #444); 
  
  /* 🟢 FIX: height auto, чтобы margin работал внутри flex/grid контейнера и создавал отступ */
  /* Если родитель задает фиксированную высоту ячейки, margin "съест" часть высоты самой карточки, создавая просвет */
  height: calc(100% - 12px); 
  margin-bottom: 12px; 

  display: flex; 
  flex-direction: column; 
  padding: 0; 
  box-sizing: border-box; 
  overflow: hidden; 
  cursor: pointer; 
  
  /* 🟢 Скругление и базовые стили границы */
  border-radius: 12px; 
  border-top-width: 4px;
  border-top-style: solid;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.mobile-widget-card:active { background-color: rgba(255,255,255,0.05); transform: scale(0.98); }

/* 🟢 ЦВЕТОВЫЕ СТИЛИ (Border + Neon Shadow) */
/* Тень полупрозрачная, в цвет бордера, создает эффект свечения */

.style-purple { 
  border-top-color: #666666; 
  
}
.style-dark-blue { 
  border-top-color: #666666; 
  
}
.style-cyan { 
  border-top-color: #666666; 
 
}
.style-blue-grey { 
  border-top-color: #666666; 
  
}
.style-teal { 
  border-top-color: #666666; 
  
}
.style-pink { 
  border-top-color: #666666; 
  
}

/* Стандартные цвета */
.style-green { 
  border-top-color: #666666; 
  
}
.style-red { 
  border-top-color: #666666; 
  
}
.style-orange { 
  border-top-color: #666666; 
  
}
.style-light-blue { 
  border-top-color: #666666; 
  
}
.style-gray { 
  border-top-color: #666666; 
  
}


.widget-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 0; 
  padding: 8px 12px 4px 12px; 
  border-bottom: 1px solid rgba(255,255,255,0.05); 
  flex-shrink: 0; 
  height: 26px; 
  box-sizing: content-box; 
}
.widget-title-row { display: flex; align-items: center; gap: 6px; overflow: hidden; }
.widget-title { font-size: 13px; color: #aaa; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.forecast-badge { font-size: 10px; background-color: rgba(52, 199, 89, 0.15); color: var(--color-primary, #34c759); padding: 1px 4px; border-radius: 3px; font-weight: 500; }

.widget-body { 
  flex-grow: 1; 
  overflow: hidden; 
  display: flex; 
  flex-direction: column; 
  justify-content: flex-start; 
  padding: 8px 12px 12px 12px; 
}

@media (orientation: landscape) {
  .widget-body {
    justify-content: flex-start;
    padding-top: 6px;
  }
}

.items-list { display: flex; flex-direction: column; gap: 6px; } 
.list-item { display: flex; justify-content: space-between; align-items: center; font-size: 13px; line-height: 1.4; }
.items-list.forecast-mode { display: grid; grid-template-columns: minmax(0, 1fr) auto 12px auto; column-gap: 4px; row-gap: 4px; align-items: center; align-content: center; }
.items-list.forecast-mode .list-item { display: contents; }

.name-cell { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; display: flex; align-items: center; gap: 6px; }

.color-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.link-icon { color: var(--color-primary, #34c759); display: inline-flex; align-items: center; opacity: 0.7; transform: scale(1.1); }

.single-val-cell { text-align: right; white-space: nowrap; font-weight: 500; }
.current-cell { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 500; }
.arrow-cell { text-align: center; color: #666; font-size: 11px; }
.future-cell { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; }
.red-text { color: #ff3b30; }
.green-text { color: #34c759; }
.orange-text { color: #FF9D00; }
.white-text { color: #fff; }
.empty-text { font-size: 13px; color: #555; text-align: center; margin-top: 10px; }
.more-text { font-size: 11px; color: #666; text-align: right; margin-top: 4px; grid-column: 1 / -1; }
</style>