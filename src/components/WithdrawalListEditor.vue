<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import WithdrawalPopup from './WithdrawalPopup.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';
import DateRangePicker from './DateRangePicker.vue';

const props = defineProps({
  title: { type: String, default: 'Мои выводы' },
  widgetKey: { type: String, default: null }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const localItems = ref([]);
const isSaving = ref(false);

// Состояния попапов
const isCreatePopupVisible = ref(false);
const isWithdrawalPopupVisible = ref(false);
const withdrawalToEdit = ref(null);

const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const isDeleting = ref(false);

const filters = ref({
  dateRange: { from: null, to: null },
  account: '',
  amount: '',
  search: '' // Поиск по назначению
});

// DATA SOURCES
const accounts = computed(() => mainStore.accounts);

// Helpers
const toInputDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const loadOperations = () => {
  const allOps = mainStore.allOperationsFlat;
  
  // Фильтруем только выводы
  const targetOps = allOps.filter(op => op.isWithdrawal);

  localItems.value = targetOps.sort((a, b) => new Date(b.date) - new Date(a.date)).map(op => {
      const amount = Math.abs(op.amount);
      const nodeName = op.destination || op.description || op.reason || 'Личные нужды';

      return {
        _id: op._id,
        originalOp: op,
        date: toInputDate(op.date),
        amount: amount,
        amountFormatted: formatNumber(amount),
        accountId: op.accountId?._id || op.accountId,
        accountName: op.accountId?.name || '---',
        nodeName: nodeName,
        isDeleted: false
      };
    });
};

onMounted(() => { 
    loadOperations(); 
});

watch(() => mainStore.allOperationsFlat, () => { loadOperations(); }, { deep: true });

// FILTERING
const filteredItems = computed(() => {
  return localItems.value.filter(item => {
    if (item.isDeleted) return false;
    const { from, to } = filters.value.dateRange;
    
    if (from && item.date < from) return false;
    if (to && item.date > to) return false;

    if (filters.value.amount && !String(item.amount).includes(filters.value.amount.replace(/\s/g, ''))) return false;
    if (filters.value.account && item.accountId !== filters.value.account) return false;
    if (filters.value.search && !item.nodeName.toLowerCase().includes(filters.value.search.toLowerCase())) return false;

    return true;
  });
});

const totalSum = computed(() => filteredItems.value.reduce((acc, item) => acc + item.amount, 0));

// ACTIONS
const openCreatePopup = () => { 
    withdrawalToEdit.value = null; 
    isWithdrawalPopupVisible.value = true; 
};

// Expose method for parent component
defineExpose({
  openCreatePopup
});

const isWidgetOnDashboard = computed(() => {
  if (!props.widgetKey) return null;
  return mainStore.dashboardLayout.includes(props.widgetKey);
});

const toggleWidgetOnDashboard = () => {
  if (!props.widgetKey) return;
  if (isWidgetOnDashboard.value) {
    mainStore.dashboardLayout = mainStore.dashboardLayout.filter(k => k !== props.widgetKey);
  } else {
    mainStore.dashboardLayout = [...mainStore.dashboardLayout, props.widgetKey];
  }
};

const openEdit = (item) => {
    withdrawalToEdit.value = item.originalOp;
    isWithdrawalPopupVisible.value = true;
};

const handleWithdrawalSaved = async ({ mode, id, data }) => { 
    isWithdrawalPopupVisible.value = false; 
    try {
        if (mode === 'create') {
             if (data.cellIndex === undefined) {
                 const dateKey = mainStore._getDateKey(new Date(data.date));
                 data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey);
             }
             await mainStore.createEvent(data);
        } else {
             await mainStore.updateOperation(id, data);
        }
        await mainStore.fetchAllEntities(); 
        loadOperations();
    } catch(e) {
        console.error(e);
        alert('Ошибка сохранения');
    }
};

const askDelete = (item) => { itemToDelete.value = item; showDeleteConfirm.value = true; };

const confirmDelete = async () => { 
    if (!itemToDelete.value) return; 
    isDeleting.value = true; 
    try { 
        await mainStore.deleteOperation(itemToDelete.value.originalOp); 
        showDeleteConfirm.value = false; 
        itemToDelete.value = null; 
        loadOperations();
    } catch (e) { 
        alert(e.message); 
    } finally { 
        isDeleting.value = false; 
    } 
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      
      <div class="popup-header">
        <div class="header-with-toggle">
          <h3>{{ title }}</h3>
          <button v-if="widgetKey && isWidgetOnDashboard !== null" class="widget-toggle-btn" @click.stop="toggleWidgetOnDashboard" :title="isWidgetOnDashboard ? 'Скрыть' : 'Показать'">
            <svg v-if="isWidgetOnDashboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
            <span class="toggle-label">{{ isWidgetOnDashboard ? 'На столе' : 'Скрыт' }}</span>
          </button>
        </div>
      </div>

      <div class="summary-bar">
          <div class="sum-item"><span class="sum-label">Всего выведено:</span><span class="sum-val expense-text">- {{ formatNumber(totalSum) }} ₸</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Количество:</span><span class="sum-val">{{ filteredItems.length }}</span></div>
      </div>

      <!-- FILTERS -->
      <div class="filters-row withdrawal-grid">
        <div class="filter-col col-date"><DateRangePicker v-model="filters.dateRange" placeholder="Период" /></div>
        
        <div class="filter-col col-acc">
            <select v-model="filters.account" class="filter-input filter-select">
                <option value="">Счет (Все)</option>
                <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
            </select>
        </div>
        
        <div class="filter-col col-amount"><input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма" /></div>
        
        <div class="filter-col col-search"><input type="text" v-model="filters.search" class="filter-input" placeholder="Назначение..." /></div>

        <div class="filter-col col-trash"></div>
      </div>
      
      <div class="list-scroll">
        <div v-if="filteredItems.length === 0" class="empty-state">Выводов не найдено.</div>
        
        <div v-for="item in filteredItems" :key="item._id" class="grid-row withdrawal-grid">
            <div class="col-date text-display">{{ item.date }}</div>
            <div class="col-acc text-display">{{ item.accountName }}</div>
            
            <div class="col-amount text-display expense-text">- {{ item.amountFormatted }} ₸</div>
            
            <div class="col-node">
                <div class="withdrawal-node" @click="openEdit(item)">
                    {{ item.nodeName }}
                </div>
            </div>

            <div class="col-trash">
                <button class="delete-btn" @click="askDelete(item)" title="Удалить">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
      </div>

      <div class="popup-footer">
        <div class="footer-left-actions">
            <button class="btn-add-new-footer btn-withdrawal" @click="openCreatePopup">+ Вывод средств</button>
        </div>
        <div class="footer-actions">
            <button class="btn-close" @click="$emit('close')">Закрыть</button>
        </div>
      </div>
    </div>
    
    <WithdrawalPopup 
       v-if="isWithdrawalPopupVisible" 
       :operation-to-edit="withdrawalToEdit"
       :initial-data="{ amount: 0 }"
       @close="isWithdrawalPopupVisible = false" 
       @save="handleWithdrawalSaved"
    />

    <ConfirmationPopup v-if="showDeleteConfirm" title="Удаление вывода" message="Вы уверены? Деньги вернутся на баланс." @close="showDeleteConfirm = false" @confirm="confirmDelete" />
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 3500; overflow-y: auto; }
.popup-content { background: var(--color-background); border-radius: 12px; display: flex; flex-direction: column; max-height: 85vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 95%; max-width: 1300px; border: 1px solid var(--color-border); }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 24px; color: var(--color-heading); font-weight: 700; }
.header-with-toggle { display: flex; align-items: center; gap: 16px; }
.widget-toggle-btn { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--color-background); border: 1px solid var(--color-border); border-radius: 8px; cursor: pointer; transition: all 0.2s; font-size: 13px; color: var(--color-text-soft); }
.widget-toggle-btn:hover { border-color: var(--color-primary); background: var(--color-background-mute); }
.widget-toggle-btn svg { width: 16px; height: 16px; flex-shrink: 0; }
.widget-toggle-btn .toggle-label { font-weight: 500; }

.summary-bar { display: flex; align-items: center; gap: 15px; padding: 15px 24px; background-color: var(--color-background-soft); border-bottom: 1px solid var(--color-border); font-size: 15px; color: var(--color-text); margin-top: 10px; }
.sum-item { display: flex; gap: 6px; }
.sum-label { color: var(--color-text-soft); }
.sum-val { font-weight: 700; }
.sum-sep { color: var(--color-border); }
.expense-text { color: #ff3b30; }

/* GRID */
.filters-row, .grid-row { display: grid; gap: 10px; align-items: center; padding: 0 1.5rem; }
.filters-row { margin: 10px 0; }
.grid-row { padding: 8px 1.5rem; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 8px; margin-bottom: 6px; transition: box-shadow 0.2s; }
.grid-row:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.05); }

/* 5 колонок: Дата, Счет, Сумма, Назначение, Корзина */
.withdrawal-grid { 
  grid-template-columns: 130px minmax(150px, 1fr) 150px 2fr 40px;
}

.text-display { font-size: 13px; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; max-height: 55vh; scrollbar-width: none; }
.list-scroll::-webkit-scrollbar { display: none; }

/* Inputs */
.filter-input { width: 100%; height: 28px; border: 1px solid var(--color-border); border-radius: 6px; padding: 0 6px; font-size: 13px; background: var(--color-background-soft); box-sizing: border-box; color: var(--color-text); }
.filter-input:focus { outline: none; border-color: var(--color-heading); }
.filter-select { -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }

/* Node chip */
.withdrawal-node {
    display: inline-block; padding: 4px 12px; background-color: #DE8FFF; color: #FFFFFF;
    border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; transition: opacity 0.2s;
}
.withdrawal-node:hover { opacity: 0.9; }

.delete-btn { width: 28px; height: 28px; border: 1px solid var(--color-border); background: var(--color-background); border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.delete-btn:hover { border-color: #FF3B30; background: var(--color-background-mute); }
.delete-btn svg { width: 14px; stroke: var(--color-text-soft); transition: stroke 0.2s; }
.delete-btn:hover svg { stroke: #FF3B30; }

.popup-footer { padding: 1.5rem; border-top: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; background: var(--color-background); border-radius: 0 0 12px 12px; }
.btn-add-new-footer { padding: 0 16px; height: 28px; border: 1px solid transparent; border-radius: 6px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
.btn-withdrawal { background-color: #DE8FFF; }
.btn-withdrawal:hover { background-color: #c876eb; }
.btn-close { padding: 0 16px; height: 28px; background: var(--color-background-soft); border: 1px solid var(--color-border); color: var(--color-text); border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 13px; }
.btn-close:hover { background: var(--color-background-mute); }

.empty-state { text-align: center; padding: 3rem; color: var(--color-text-soft); font-style: italic; }
</style>