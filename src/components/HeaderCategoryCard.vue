<script setup>
import { ref, watch, computed, nextTick } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import filterIcon from '@/assets/filter-edit.svg';

/**
 * * --- МЕТКА ВЕРСИИ: v4.1 - LIST LAYOUT UPDATE ---
 * * ВЕРСИЯ: 4.1 - Обновление макета списков Доходов/Расходов
 * * ДАТА: 2025-11-19
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (UI) Макет списка операций переделан под "3 колонки":
 * - Слева: Источник (Контрагент/Счет).
 * - Центр: Дата.
 * - Справа: Сумма (сверху) и Приемник (снизу).
 * 2. (LOGIC) Добавлено `listTotal` для подсчета итоговой суммы списка.
 * 3. (UI) Добавлена строка "Итого" внизу списка операций.
 */

console.log('--- HeaderCategoryCard.vue v4.1 (List Layout Update) ЗАГРУЖЕН ---');

const props = defineProps({
  title: { type: String, required: true },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true }
});

const emit = defineEmits(['add', 'edit']);
const mainStore = useMainStore();

const isDropdownOpen = ref(false);
const menuRef = ref(null);
const searchQuery = ref('');

const isFilterOpen = ref(false);
const filterBtnRef = ref(null);
const filterDropdownRef = ref(null);
const sortMode = ref('default'); 
const filterMode = ref('all');

const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

const filteredWidgets = computed(() => {
  if (!searchQuery.value) return mainStore.allWidgets;
  const query = searchQuery.value.toLowerCase();
  return mainStore.allWidgets.filter(widget => widget.name.toLowerCase().includes(query));
});

const handleSelect = (newWidgetKey) => {
  if (mainStore.dashboardLayout.includes(newWidgetKey) && newWidgetKey !== props.widgetKey) return;
  mainStore.replaceWidget(props.widgetIndex, newWidgetKey);
  nextTick(() => { isDropdownOpen.value = false; });
};

const handleClickOutside = (event) => {
  if (isDropdownOpen.value && menuRef.value && !menuRef.value.contains(event.target)) {
    isDropdownOpen.value = false;
  }
  if (isFilterOpen.value && 
      filterDropdownRef.value && !filterDropdownRef.value.contains(event.target) && 
      filterBtnRef.value && !filterBtnRef.value.contains(event.target)) {
    isFilterOpen.value = false;
  }
};

watch([isDropdownOpen, isFilterOpen], ([widgetOpen, filterOpen]) => {
  if (widgetOpen || filterOpen) {
    if (widgetOpen) searchQuery.value = '';
    document.addEventListener('mousedown', handleClickOutside);
  } else {
    document.removeEventListener('mousedown', handleClickOutside);
  }
});

// --- Определяем тип виджета ---
const isTransferWidget = computed(() => {
  const catId = props.widgetKey.replace('cat_', '');
  const category = mainStore.getCategoryById(catId); 
  if (category) {
      const name = category.name.toLowerCase();
      return name === 'перевод' || name === 'transfer';
  }
  return false;
});

const isIncomeListWidget = computed(() => props.widgetKey === 'incomeList');
const isExpenseListWidget = computed(() => props.widgetKey === 'expenseList');
const isListWidget = computed(() => isTransferWidget.value || isIncomeListWidget.value || isExpenseListWidget.value);

// --- Списки данных ---
const transferList = computed(() => {
  if (!isTransferWidget.value) return [];
  let list = showFutureBalance.value ? mainStore.futureTransfers : mainStore.currentTransfers;
  if (!list) return [];
  list = [...list];
  applySort(list);
  return list;
});

const operationList = computed(() => {
  let list = [];
  if (isIncomeListWidget.value) {
    list = showFutureBalance.value ? mainStore.futureIncomes : mainStore.currentIncomes;
  } else if (isExpenseListWidget.value) {
    list = showFutureBalance.value ? mainStore.futureExpenses : mainStore.currentExpenses;
  }
  if (!list) return [];
  // Копируем и сортируем
  let sorted = [...list];
  applySort(sorted);
  return sorted;
});

// 🟢 NEW: Подсчет итогов для списочных виджетов
const listTotal = computed(() => {
  return operationList.value.reduce((acc, op) => {
    const amount = op.amount || 0;
    // Для доходов суммируем, для расходов - тоже суммируем абсолютные значения для отображения "Итого", 
    // но можно отображать и чистую сумму. Обычно в "расходах" хотят видеть "сколько всего потрачено" (положительное число или отрицательное).
    // Будем суммировать как есть (доходы +, расходы -).
    return acc + amount;
  }, 0);
});

function applySort(list) {
  if (sortMode.value === 'desc') list.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  else if (sortMode.value === 'asc') list.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
}

// --- Хелперы отображения ---
const getAccountName = (accIdOrObj) => {
  if (!accIdOrObj) return '???';
  const id = typeof accIdOrObj === 'object' ? accIdOrObj._id : accIdOrObj;
  const acc = mainStore.accounts.find(a => a._id === id);
  return acc ? acc.name : 'Удален';
};

const getEntityName = (entityIdOrObj, type) => {
  if (!entityIdOrObj) return '---';
  const id = typeof entityIdOrObj === 'object' ? entityIdOrObj._id : entityIdOrObj;
  if (type === 'contractor') {
      const c = mainStore.contractors.find(x => x._id === id);
      return c ? c.name : 'Контрагент';
  }
  if (type === 'company') {
      const c = mainStore.companies.find(x => x._id === id);
      return c ? c.name : 'Компания';
  }
  if (type === 'individual') {
      const i = mainStore.individuals.find(x => x._id === id);
      return i ? i.name : 'Физлицо';
  }
  return '???';
};

// Универсальный метод получения имени "Второй стороны"
const getCounterpartyName = (op) => {
    if (op.contractorId) return getEntityName(op.contractorId, 'contractor');
    if (op.companyId) return getEntityName(op.companyId, 'company');
    if (op.individualId) return getEntityName(op.individualId, 'individual');
    return 'Без контрагента';
};

const formatOpDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear().toString().slice(-2); // Берем 2 последние цифры года
  return `${day}.${month}.${year}`;
};

const categoryBreakdown = computed(() => {
  if (isListWidget.value) return { income: 0, expense: 0, total: 0 };
  const source = showFutureBalance.value ? mainStore.futureCategoryBreakdowns : mainStore.currentCategoryBreakdowns;
  const data = source[props.widgetKey] || { income: 0, expense: 0, total: 0 };
  return data;
});

const setSortMode = (mode) => { sortMode.value = mode; };
const setFilterMode = (mode) => { filterMode.value = mode; };
const toggleDropdown = () => { isDropdownOpen.value = !isDropdownOpen.value; };
const handleAdd = () => { emit('add'); };
const handleEdit = () => { emit('edit'); };
</script>

<template>
  <div class="dashboard-card" ref="cardRef">

    <div class="card-title-container">
      <div class="card-title" ref="menuRef" @click.stop="toggleDropdown">
        {{ title }} <span>▽</span>
        <div v-if="isDropdownOpen" class="widget-dropdown" @click.stop>
          <input type="text" class="widget-search-input" v-model="searchQuery" placeholder="Поиск..." @click.stop />
          <ul>
            <li v-for="widget in filteredWidgets" :key="widget.key"
              :class="{ 'active': widget.key === props.widgetKey, 'disabled': mainStore.dashboardLayout.includes(widget.key) && widget.key !== props.widgetKey }"
              @click.stop="handleSelect(widget.key)">
              {{ widget.name }}
            </li>
          </ul>
        </div>
      </div>

      <div class="card-actions">
        <button class="action-square-btn" ref="filterBtnRef" @click.stop="isFilterOpen = !isFilterOpen" title="Фильтр">
          <img :src="filterIcon" alt="Filter" class="icon-svg" />
        </button>
        <button class="action-square-btn" :class="{ 'active': showFutureBalance }" @click.stop="showFutureBalance = !showFutureBalance" title="Прогноз">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
        </button>
        <button @click.stop="handleAdd" class="action-square-btn" title="Добавить">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button @click.stop="handleEdit" class="action-square-btn" title="Редактировать">
           <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
      </div>

      <div v-if="isFilterOpen" class="filter-dropdown" ref="filterDropdownRef" @click.stop>
        <div v-if="isListWidget" class="filter-group">
          <div class="filter-group-title">Сортировка</div>
          <ul>
            <li :class="{ active: sortMode === 'default' }" @click="setSortMode('default')">По дате</li>
            <li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')">Сумма (убыв.)</li>
            <li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')">Сумма (возр.)</li>
          </ul>
        </div>
        <div v-else class="filter-group">
           <div class="filter-group-title">Отображение</div>
           <ul>
             <li :class="{ active: filterMode === 'all' }" @click="setFilterMode('all')">Все строки</li>
             <li :class="{ active: filterMode === 'nonZero' }" @click="setFilterMode('nonZero')">Скрыть нули</li>
           </ul>
        </div>
      </div>
    </div>

    <div class="category-items-list-scroll">
      
      <!-- 1. СПИСОК ПЕРЕВОДОВ (Оставляем как есть, или можно тоже адаптировать, но в задаче просили Доходы/Расходы) -->
      <div v-if="isTransferWidget" class="transfer-list">
        <div v-for="t in transferList" :key="t._id" class="transfer-item">
          <div class="t-row t-top">
            <span class="t-amount expense">- {{ formatNumber(t.amount) }} ₸</span>
            <span class="t-arrow">→</span>
            <span class="t-amount income">+ {{ formatNumber(t.amount) }} ₸</span>
          </div>
          <div class="t-row t-bottom">
            <span class="t-acc left" :title="getAccountName(t.fromAccountId)">{{ getAccountName(t.fromAccountId) }}</span>
            <span class="t-date">{{ formatOpDate(t.date) }}</span>
            <span class="t-acc right" :title="getAccountName(t.toAccountId)">{{ getAccountName(t.toAccountId) }}</span>
          </div>
        </div>
        <div v-if="transferList.length === 0" class="category-item-empty">
          {{ showFutureBalance ? 'Нет будущих переводов' : 'Нет переводов' }}
        </div>
      </div>

      <!-- 2. СПИСОК ДОХОДОВ / РАСХОДОВ (Новый дизайн: 3 колонки + 2 строки справа) -->
      <div v-else-if="isIncomeListWidget || isExpenseListWidget" class="custom-list-container">
        <div class="custom-list">
            <div v-for="op in operationList" :key="op._id" class="custom-item">
            
            <!-- ЛЕВАЯ ЧАСТЬ: Источник -->
            <!-- Доход: От кого (Контрагент) -->
            <!-- Расход: Со счета (Счет) -->
            <div class="col-left">
                <span v-if="op.type === 'income'" :title="getCounterpartyName(op)">{{ getCounterpartyName(op) }}</span>
                <span v-else :title="getAccountName(op.accountId)">{{ getAccountName(op.accountId) }}</span>
            </div>

            <!-- ЦЕНТР: Дата -->
            <div class="col-center">
                {{ formatOpDate(op.date) }}
            </div>

            <!-- ПРАВАЯ ЧАСТЬ: Сумма и Приемник -->
            <div class="col-right">
                <!-- Сумма -->
                <span class="amount-text" :class="op.type === 'income' ? 'income' : 'expense'">
                {{ op.type === 'income' ? '+' : '' }} {{ formatNumber(op.amount) }} ₸
                </span>
                
                <!-- Подпись снизу -->
                <!-- Доход: На счет (Счет) -->
                <!-- Расход: Кому (Контрагент) -->
                <span class="sub-text" v-if="op.type === 'income'" :title="getAccountName(op.accountId)">
                    {{ getAccountName(op.accountId) }}
                </span>
                <span class="sub-text" v-else :title="getCounterpartyName(op)">
                    {{ getCounterpartyName(op) }}
                </span>
            </div>
            </div>
        </div>

        <div v-if="operationList.length === 0" class="category-item-empty">
          {{ showFutureBalance ? 'Нет будущих операций' : 'Нет операций' }}
        </div>
        
        <!-- ИТОГО (FOOTER) -->
        <div v-if="operationList.length > 0" class="list-footer">
            <span>Итого</span>
            <span :class="listTotal > 0 ? 'income' : (listTotal < 0 ? 'expense' : '')">
                {{ listTotal > 0 ? '+' : '' }} {{ formatNumber(listTotal) }} ₸
            </span>
        </div>
      </div>

      <!-- 3. ОБЫЧНЫЙ СПИСОК КАТЕГОРИИ (Старый) -->
      <div v-else class="category-breakdown-list">
        <div class="category-item" v-if="filterMode === 'all' || categoryBreakdown.income !== 0">
          <span>Доходы</span>
          <span class="income">₸ {{ formatNumber(categoryBreakdown.income) }}</span>
        </div>
        <div class="category-item" v-if="filterMode === 'all' || categoryBreakdown.expense !== 0">
          <span>Расходы</span>
          <span class="expense">₸ {{ formatNumber(categoryBreakdown.expense) }}</span>
        </div>
        <div class="category-item category-item-total" v-if="filterMode === 'all' || categoryBreakdown.total !== 0">
            <span>Итого</span>
            <span :class="{ 'income': categoryBreakdown.total > 0, 'expense': categoryBreakdown.total < 0 }">
                <template v-if="categoryBreakdown.total < 0">-</template>
                ₸ {{ formatNumber(Math.abs(categoryBreakdown.total)) }}
            </span>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.dashboard-card {
  flex: 1; display: flex; flex-direction: column;
  padding-right: 1.5rem; border-right: 1px solid var(--color-border);
  position: relative; min-height: 0;
}
.dashboard-card:last-child { border-right: none; padding-right: 0; }

.card-title-container { 
  display: flex; justify-content: space-between; align-items: center; 
  height: 32px; margin-bottom: 0.5rem; flex-shrink: 0; 
}
.card-title { 
  font-size: 0.85em; color: #aaa; transition: color 0.2s; cursor: pointer; 
  position: relative; z-index: 101; 
}
.card-title:hover { color: #ddd; }
.card-title span { font-size: 0.8em; margin-left: 4px; }

.card-actions { display: flex; gap: 6px; position: relative; z-index: 101; }
.action-square-btn { width: 18px; height: 18px; border: 1px solid transparent; border-radius: 4px; background-color: #3D3B3B; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; color: #888; transition: all 0.2s ease; }
.action-square-btn:hover { background-color: #555; color: #ccc; }
.action-square-btn.active { background-color: #34c759; color: #fff; border-color: transparent; }
.icon-svg { width: 11px; height: 11px; display: block; object-fit: contain; }

.filter-dropdown { position: absolute; top: 35px; right: 0; width: 160px; background-color: #f4f4f4; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); z-index: 100; padding: 10px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; }
.filter-group-title { font-size: 0.75em; font-weight: 600; color: #888; text-transform: uppercase; margin-bottom: 6px; padding-left: 2px; }
.filter-dropdown ul { list-style: none; margin: 0; padding: 0; }
.filter-dropdown li { padding: 8px 10px; border-radius: 6px; font-size: 0.85em; color: #333; cursor: pointer; font-weight: 500 !important; transition: background-color 0.2s; }
.filter-dropdown li:hover { background-color: #e9e9e9; }
.filter-dropdown li.active { color: #007AFF; background-color: #e0e0e0; }

.category-items-list-scroll { flex-grow: 1; overflow-y: auto; padding-right: 5px; scrollbar-width: none; -ms-overflow-style: none; min-height: 0; display: flex; flex-direction: column; }
.category-items-list-scroll::-webkit-scrollbar { display: none; }

/* Стили для Переводов (старые) */
.transfer-list { display: flex; flex-direction: column; gap: 10px; }
.transfer-item { display: flex; flex-direction: column; padding-bottom: 8px; border-bottom: 1px solid var(--color-border); }
.transfer-item:last-child { border-bottom: none; }
.t-row { display: flex; justify-content: space-between; align-items: center; line-height: 1.4; }
.t-top { margin-bottom: 2px; }
.t-amount { font-size: 0.9em; font-weight: 500; }
.t-amount.expense { color: var(--color-danger); }
.t-amount.income { color: var(--color-primary); }
.t-arrow { color: #888; font-size: 0.8em; }
.t-bottom { font-size: 0.8em; color: #aaa; }
.t-acc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 35%; }
.t-acc.left { text-align: left; }
.t-acc.right { text-align: right; }
.t-date { color: #666; font-size: 0.9em; white-space: nowrap; }

/* 🟢 НОВЫЕ СТИЛИ ДЛЯ СПИСКОВ ДОХОД/РАСХОД */
.custom-list-container {
  display: flex; flex-direction: column; height: 100%;
}
.custom-list {
  flex-grow: 1; display: flex; flex-direction: column; gap: 12px; /* Отступы между элементами */
}
.custom-item {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 0.85em;
}

.col-left {
  flex: 1; min-width: 0; /* Чтобы текст сокращался */
  color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  padding-right: 8px;
  font-size: 1.05em; /* Чуть крупнее имя */
}
.col-center {
  color: #666;
  font-size: 0.95em;
  flex-shrink: 0;
  text-align: center;
  min-width: 60px;
}
.col-right {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; align-items: flex-end;
  padding-left: 8px;
}
.amount-text {
  font-weight: 600; font-size: 1.05em; white-space: nowrap;
}
.amount-text.income { color: var(--color-primary); }
.amount-text.expense { color: var(--color-danger); }

.sub-text {
  color: #888; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 100%; margin-top: 2px;
}

/* ИТОГО (FOOTER) */
.list-footer {
  margin-top: auto; /* Прибиваем к низу, если список короткий, или просто отступ */
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
  display: flex; justify-content: space-between; align-items: center;
  font-weight: 600; font-size: 0.95em;
  color: var(--color-text);
}
.list-footer .income { color: var(--color-primary); }
.list-footer .expense { color: var(--color-danger); }

.category-breakdown-list { display: flex; flex-direction: column; flex-grow: 1; gap: 0.25rem; }
.category-item { display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 0.25rem; }
.category-item span:first-child { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
.category-item span:last-child { color: var(--color-text); font-weight: 500; white-space: nowrap; }
.category-item span.income { color: var(--color-primary); }
.category-item span.expense { color: var(--color-danger); }
.category-item-total { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--color-border); }
.category-item-empty { font-size: 0.9em; color: #666; text-align: center; margin-top: 10px; }

.widget-dropdown { position: absolute; top: 35px; left: 0; width: 220px; background-color: #f4f4f4; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); z-index: 100; padding: 8px; box-sizing: border-box; max-height: 400px; display: flex; flex-direction: column; }
.widget-search-input { flex-shrink: 0; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px; font-size: 0.9em; box-sizing: border-box; width: 100%; background-color: #FFFFFF; color: #333; }
.widget-search-input:focus { outline: none; border-color: #007AFF; }
.widget-dropdown ul { list-style: none; margin: 0; padding: 0; flex-grow: 1; overflow-y: auto; }
.widget-dropdown li { padding: 10px 12px; border-radius: 6px; font-size: 0.9em; color: #333; cursor: pointer; font-weight: 500 !important; }
.widget-dropdown li:not(.disabled):hover { background-color: #e9e9e9; }
.widget-dropdown li.active { color: #333; background-color: #e0e0e0; }
.widget-dropdown li.disabled { color: #aaa; background-color: transparent; cursor: not-allowed; }

@media (max-height: 900px) {
  .dashboard-card { min-width: 100px; padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .category-item { font-size: 0.8em; margin-bottom: 0.2rem; }
  .category-item span:first-child { padding-right: 5px; }
  .t-amount { font-size: 0.85em; }
  .t-bottom { font-size: 0.75em; }
  .card-actions { gap: 3px; }
  .action-square-btn { width: 16px; height: 16px; }
  .icon-svg { width: 10px; height: 10px; }
}
</style>
