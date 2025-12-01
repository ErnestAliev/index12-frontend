<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

const props = defineProps({
  title: { type: String, default: 'Мои предоплаты' },
  weOweAmount: { type: Number, default: 0 },        
  theyOweAmount: { type: Number, default: 0 },       
  weOweAmountFuture: { type: Number, default: 0 },   
  theyOweAmountFuture: { type: Number, default: 0 }, 
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

// 🟢 Добавлено событие open-tab
const emit = defineEmits(['add', 'edit', 'open-menu', 'open-tab']);
const mainStore = useMainStore();

const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

const formatCurrency = (val) => `${formatNumber(Math.abs(val || 0))} ₸`;

const displayWeOwe = computed(() => {
    if (!showFutureBalance.value) return formatCurrency(props.weOweAmount);
    return `${formatCurrency(props.weOweAmount)} > ${formatCurrency(props.weOweAmountFuture)}`;
});

const displayTheyOwe = computed(() => {
    if (!showFutureBalance.value) return formatCurrency(props.theyOweAmount);
    return `${formatCurrency(props.theyOweAmount)} > ${formatCurrency(props.theyOweAmountFuture)}`;
});

// Хендлеры кликов по строкам
const openRetailTab = () => {
    emit('open-tab', 'retail');
};

const openClientsTab = () => {
    emit('open-tab', 'clients');
};
</script>

<template>
  <div class="dashboard-card">
    <div class="card-title-container card-drag-handle">
      <div class="card-title">{{ title }}</div>
      <div class="card-actions">
        <button 
          class="action-square-btn"
          :class="{ 'active': showFutureBalance }"
          @click.stop="showFutureBalance = !showFutureBalance"
          title="Показать прогноз"
        >
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
        </button>
        
        <!-- Редактирование открывает список (по умолчанию Сделки) -->
        <button @click.stop="$emit('edit')" class="action-square-btn" title="Управление предоплатами">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        
        <button @click.stop="$emit('add')" class="action-square-btn" title="Оформить предоплату">
           <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </div>

    <div class="card-items-list">
      <!-- 🟢 Кликабельная строка "Мы должны" -> Вкладка Розница -->
      <div class="card-item clickable-row" @click.stop="openRetailTab">
        <span title="Полученные авансы, по которым работа не сдана">Мы должны</span>
        <span class="value-expense">{{ displayWeOwe }}</span>
      </div>
      
      <!-- 🟢 Кликабельная строка "Нам должны" -> Вкладка Сделки -->
      <div class="card-item clickable-row" @click.stop="openClientsTab">
        <span title="Остатки по сделкам, где внесена только часть суммы">Нам должны</span>
        <span class="value-orange">{{ displayTheyOwe }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-card { display: flex; flex-direction: column; height: 100%; overflow: hidden; padding-right: 1.5rem; border-right: 1px solid var(--color-border); position: relative; }
.dashboard-card:last-child { border-right: none; padding-right: 0; }
.card-title-container { display: flex; justify-content: space-between; align-items: center; height: 32px; margin-bottom: 0.5rem; flex-shrink: 0; cursor: grab; }
.card-title-container:active { cursor: grabbing; }
.card-title { font-size: 0.85em; color: #aaa; position: relative; z-index: 101; }
.card-actions { display: flex; gap: 6px; position: relative; z-index: 101; }
.action-square-btn { width: 18px; height: 18px; border: 1px solid transparent; border-radius: 4px; background-color: #3D3B3B; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; color: #888; transition: all 0.2s ease; }
.action-square-btn:hover { background-color: #555; color: #ccc; }
.action-square-btn.active { background-color: #34c759; color: #fff; border-color: transparent; }
.icon-svg { width: 11px; height: 11px; display: block; object-fit: contain; }
.card-items-list { flex-grow: 1; overflow-y: auto; padding-right: 5px; scrollbar-width: none; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
.card-items-list::-webkit-scrollbar { display: none; }
.card-item { display: flex; justify-content: space-between; align-items: center; font-size: 0.9em; margin-bottom: 0.25rem; flex-shrink: 0; border-radius: 4px; padding: 2px 4px; margin-left: -4px; margin-right: -4px;}
.card-item span:first-child { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
.card-item span:last-child { font-weight: 500; white-space: nowrap; }
.value-expense { color: var(--color-danger); }
.value-orange { color: #FF9D00; }

/* 🟢 Стили для кликабельных строк */
.clickable-row { cursor: pointer; transition: background-color 0.2s; }
.clickable-row:hover { background-color: rgba(255, 255, 255, 0.05); }

@media (max-height: 900px) {
  .dashboard-card { min-width: 100px; padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .card-item { font-size: 0.8em; margin-bottom: 0.2rem; }
  .action-square-btn { width: 16px; height: 16px; }
  .icon-svg { width: 10px; height: 10px; }
}
</style>