<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

const props = defineProps({
  widgetKey: { type: String, required: true },
});

const mainStore = useMainStore();

const widgetInfo = computed(() => {
  const w = mainStore.allWidgets.find(x => x.key === props.widgetKey);
  return w ? w.name : 'Виджет';
});

const items = computed(() => {
  const k = props.widgetKey;
  if (k === 'accounts') return mainStore.currentAccountBalances || [];
  if (k === 'companies') return mainStore.currentCompanyBalances || [];
  if (k === 'contractors') {
      const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
      return (mainStore.currentContractorBalances || []).filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));
  }
  if (k === 'projects') return mainStore.currentProjectBalances || [];
  if (k === 'individuals') return mainStore.currentIndividualBalances || [];
  
  if (k === 'categories') {
      const visibleIds = new Set(mainStore.visibleCategories.map(c => c._id));
      return (mainStore.currentCategoryBalances || []).filter(c => visibleIds.has(c._id));
  }

  if (['incomeList', 'expenseList', 'withdrawalList', 'transfers'].includes(k)) {
      let list = [];
      if (k === 'incomeList') list = mainStore.currentIncomes;
      else if (k === 'expenseList') list = mainStore.currentExpenses;
      else if (k === 'withdrawalList') list = mainStore.currentWithdrawals;
      else if (k === 'transfers') list = mainStore.currentTransfers;
      
      const sum = (list || []).reduce((acc, op) => acc + Math.abs(op.amount || 0), 0);
      return [{ _id: 'total', name: 'Всего', balance: sum }];
  }

  return [];
});

const isEmpty = computed(() => items.value.length === 0);

const formatVal = (val) => {
  const num = Number(val) || 0;
  return `${formatNumber(Math.abs(num))} ₸`;
};

const isExpense = (val) => Number(val) < 0;
</script>

<template>
  <div class="mobile-widget-card">
    <div class="widget-header">
      <div class="widget-title">{{ widgetInfo }}</div>
      <div class="widget-actions">
         <div class="icon-group">
            <!-- Иконки-заглушки (Filter, Arrow, Edit, Plus) как на скрине -->
            <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
            <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
         </div>
      </div>
    </div>

    <!-- 1. Скроллируемое тело списка -->
    <div class="widget-body scrollable-list">
      <div v-if="isEmpty" class="empty-text">...пусто...</div>
      
      <div v-else class="items-list">
        <div v-for="item in items" :key="item._id" class="list-item">
          <span class="item-name">{{ item.name }}</span>
          <span class="item-val" :class="{ 'red-text': isExpense(item.balance) }">
            {{ formatVal(item.balance) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-widget-card {
  background-color: var(--color-background-soft, #282828);
  border: 1px solid var(--color-border, #444);
  /* Удаляем border-radius чтобы было как в таблице/гриде, или оставляем минимальным */
  border-radius: 0; 
  padding: 4px 8px; /* Компактные отступы */
  display: flex;
  flex-direction: column;
  height: 100%; 
  /* 1. Фиксированная высота (как на десктопе примерно) или 100% от ячейки грида */
  box-sizing: border-box;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0; /* Заголовок не сжимается */
  height: 24px;
}

.widget-title {
  font-size: 10px;
  color: #888;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.icon-group {
  display: flex;
  gap: 4px;
}

.w-icon {
  width: 10px;
  height: 10px;
  color: #666;
  cursor: pointer;
}

.widget-body {
  flex-grow: 1;
  overflow: hidden; /* Скрываем внешний скролл */
  position: relative;
}

/* 1. Внутренний скролл для списка */
.scrollable-list {
  overflow-y: auto;
  scrollbar-width: none; /* Firefox */
}
.scrollable-list::-webkit-scrollbar { 
  display: none; /* Chrome */ 
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 10px; /* Мелкий шрифт как на скрине */
  line-height: 1.4;
}

.item-name {
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
}

.item-val {
  color: #fff;
  font-weight: 600;
  white-space: nowrap;
}

.red-text {
  color: var(--color-danger, #ff3b30);
}

.empty-text {
  font-size: 9px;
  color: #555;
  text-align: center;
  margin-top: 10px;
}
</style>