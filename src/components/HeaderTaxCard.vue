<script setup>
import { computed } from 'vue';
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

// Используем данные из стора
const companies = computed(() => mainStore.companies);

// Хелпер для безопасного получения ID
const getSafeId = (val) => {
    if (!val) return null;
    if (typeof val === 'object') return val._id || null;
    return val;
};

// Расчет налогов для каждой компании за ВСЕ ВРЕМЯ (Total Calculated - Total Paid)
const taxItems = computed(() => {
    return companies.value.map(comp => {
        // 1. Считаем сколько налога начислено (исходя из дохода)
        const taxData = mainStore.calculateTaxForPeriod(comp._id, null, null);
        
        // 2. Считаем сколько уже оплачено (из истории taxes)
        const paidTax = mainStore.taxes
            .filter(t => {
                // 🟢 FIX: Безопасное сравнение ID
                const tCompId = getSafeId(t.companyId);
                return tCompId === comp._id && t.status === 'paid';
            })
            .reduce((acc, t) => acc + (t.amount || 0), 0);

        // 3. Разница = К уплате
        const taxToPay = Math.max(0, taxData.tax - paidTax);
        
        return {
            _id: comp._id,
            name: comp.name,
            regime: comp.taxRegime === 'simplified' ? 'УПР' : 'ОУР',
            percent: comp.taxPercent,
            taxAmount: taxToPay, // Показываем долг по налогам
            income: taxData.income,
            expense: taxData.expense
        };
    });
});

// Форматирование
const formatMoney = (val) => formatNumber(Math.floor(val || 0));
</script>

<template>
  <div class="dashboard-card">
    <div class="card-title-container card-drag-handle">
      <!-- Заголовок -->
      <div class="card-title">{{ title }}</div>
      
      <!-- 🟢 FIX: Блокировка событий драга на контейнере кнопок -->
      <div class="card-actions" @mousedown.stop @touchstart.stop @pointerdown.stop>
        <button @click.stop="$emit('edit')" class="action-square-btn" title="История налогов / Редактор">
           <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button @click.stop="$emit('add')" class="action-square-btn" title="Оплатить налог">
           <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </div>

    <div class="card-items-list">
      <div v-for="item in taxItems" :key="item._id" class="card-item tax-grid">
        <!-- Название компании -->
        <span class="name-cell" :title="item.name">{{ item.name }}</span>
        
        <!-- Режим и процент -->
        <span class="regime-cell">
            <span class="badge" :class="item.regime === 'УПР' ? 'badge-upr' : 'badge-our'">
                {{ item.regime }} {{ item.percent }}%
            </span>
        </span>

        <!-- Сумма налога -->
        <span class="amount-cell" :class="{ 'zero-tax': item.taxAmount === 0 }">
          <span class="currency">₸</span> {{ formatMoney(item.taxAmount) }}
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

.card-actions { display: flex; gap: 6px; }

.action-square-btn { 
  width: 18px; height: 18px; 
  border: 1px solid transparent; border-radius: 4px; 
  background-color: #3D3B3B; 
  display: flex; align-items: center; justify-content: center; 
  cursor: pointer; padding: 0; color: var(--text-mute); 
  transition: all var(--trans-fast); 
}
.action-square-btn:hover { background-color: #555; color: #ccc; }
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

.amount-cell { 
    text-align: right; 
    font-weight: var(--fw-medium); 
    color: var(--color-danger); /* Налоги это расход, поэтому красный */
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.amount-cell.zero-tax { color: var(--text-mute); opacity: 0.5; }

.currency { font-size: 0.85em; color: var(--text-mute); font-weight: 400; margin-right: 2px; }
.card-item-empty { font-size: var(--font-xs); color: #666; margin-top: 5px; font-style: italic; }

@media (max-height: 900px) {
  .dashboard-card { padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .tax-grid { font-size: 0.8em; }
}
</style>