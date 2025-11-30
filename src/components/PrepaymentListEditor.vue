<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import ConfirmationPopup from './ConfirmationPopup.vue';
import DateRangePicker from './DateRangePicker.vue';

const props = defineProps({
  title: { type: String, default: 'Редактор предоплат' }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const localPrepayments = ref([]);
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const isDeleting = ref(false);

// Фильтры
const filters = ref({
    dateRange: { from: null, to: null },
    contractor: '',   
    amount: '',     
    project: '',
});

// Опции для селектов
const projects = computed(() => mainStore.projects);

const contractorsOptions = computed(() => {
    const opts = [];
    // Контрагенты (Юрлица)
    const contrs = mainStore.contractors.map(c => ({ value: `contr_${c._id}`, label: c.name }));
    if (contrs.length) opts.push({ label: 'Контрагенты', options: contrs });
    
    // Физлица (кроме розницы)
    const inds = mainStore.individuals
        .filter(i => {
            // Исключаем розницу и самого владельца (если он залогинен как физлицо, хотя тут список всех)
            if (mainStore.retailIndividualId && i._id === mainStore.retailIndividualId) return false;
            return true;
        })
        .map(i => ({ value: `ind_${i._id}`, label: i.name }));
        
    if (inds.length) opts.push({ label: 'Физлица', options: inds });
    
    return opts;
});

// Форматтеры
const toInputDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDisplayDate = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    return d.toLocaleDateString('ru-RU');
};

// Загрузка данных
const loadData = () => {
    // Собираем все операции предоплат (входящие)
    const prepayIds = mainStore.getPrepaymentCategoryIds;
    
    const source = mainStore.allOperationsFlat.filter(op => {
        // Только доходы
        if (op.type !== 'income') return false;
        // Исключаем переводы и выводы
        if (op.isTransfer || op.isWithdrawal) return false;
        
        // Проверяем категорию
        const catId = op.categoryId?._id || op.categoryId;
        const prepId = op.prepaymentId?._id || op.prepaymentId;
        
        const isPrepayCat = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId));
        
        // Также считаем предоплатой, если указана общая сумма сделки (аванс)
        const isAdvance = (op.totalDealAmount || 0) > 0;
        
        return isPrepayCat || isAdvance;
    });

    localPrepayments.value = source.map(op => {
        let contractorName = '-';
        let contractorVal = '';
        
        if (op.contractorId) {
            const c = mainStore.contractors.find(x => x._id === (op.contractorId._id || op.contractorId));
            if (c) { contractorName = c.name; contractorVal = `contr_${c._id}`; }
        } else if (op.counterpartyIndividualId) {
            const i = mainStore.individuals.find(x => x._id === (op.counterpartyIndividualId._id || op.counterpartyIndividualId));
            if (i) { contractorName = i.name; contractorVal = `ind_${i._id}`; }
        }

        let projectName = '-';
        const pId = op.projectId ? (op.projectId._id || op.projectId) : null;
        if (pId) {
            const p = mainStore.projects.find(x => x._id === pId);
            if (p) projectName = p.name;
        }

        return {
            _id: op._id,
            originalOp: op,
            date: new Date(op.date),
            dateFormatted: toInputDate(op.date),
            displayDate: toDisplayDate(op.date),
            amount: op.amount,
            amountFormatted: formatNumber(op.amount),
            contractorName,
            contractorVal,
            projectName,
            projectId: pId,
            description: op.description || op.reason || 'Предоплата'
        };
    }).sort((a, b) => b.date - a.date); // Сортировка: новые сверху
};

// Фильтрация
const filteredList = computed(() => {
    const { from, to } = filters.value.dateRange;

    return localPrepayments.value.filter(item => {
        // Фильтр по дате
        if (from && item.dateFormatted < from) return false;
        if (to && item.dateFormatted > to) return false;

        // Фильтр по контрагенту
        if (filters.value.contractor && item.contractorVal !== filters.value.contractor) return false;
        
        // Фильтр по сумме
        if (filters.value.amount) {
            const q = filters.value.amount.replace(/\s/g, ''); // Убираем пробелы из запроса
            const itemAmt = String(item.amount); // Чистая сумма
            if (!itemAmt.includes(q)) return false;
        }

        // Фильтр по проекту
        if (filters.value.project && item.projectId !== filters.value.project) return false;
        
        return true;
    });
});

const totalSum = computed(() => filteredList.value.reduce((acc, item) => acc + (item.amount || 0), 0));

onMounted(async () => {
    await mainStore.fetchAllEntities(); 
    loadData();
});

watch(() => mainStore.allOperationsFlat, loadData, { deep: true });

// Удаление
const askDelete = (item) => { itemToDelete.value = item; showDeleteConfirm.value = true; };

const confirmDelete = async () => {
    if (!itemToDelete.value) return;
    isDeleting.value = true;
    try {
        await mainStore.deleteOperation(itemToDelete.value.originalOp);
        showDeleteConfirm.value = false;
        itemToDelete.value = null;
        loadData(); // Перезагружаем локальный список
    } catch(e) { 
        console.error(e);
        alert('Ошибка при удалении: ' + e.message); 
    } finally { 
        isDeleting.value = false; 
    }
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      <div class="popup-header"><h3>{{ title }}</h3></div>

      <!-- ИТОГИ -->
      <div class="summary-bar">
          <div class="sum-item"><span class="sum-label">Всего предоплат:</span><span class="sum-val income-text">+ {{ formatNumber(totalSum) }} ₸</span></div>
          <div class="sum-sep">/</div>
          <div class="sum-item"><span class="sum-label">Количество:</span><span class="sum-val">{{ filteredList.length }}</span></div>
      </div>

      <!-- ФИЛЬТРЫ (ОНИ ЖЕ ЗАГОЛОВКИ ТАБЛИЦЫ) -->
      <div class="filters-row prepay-grid">
        <div class="filter-col col-date">
           <DateRangePicker v-model="filters.dateRange" placeholder="Период" />
        </div>
        
        <div class="filter-col">
           <select v-model="filters.contractor" class="filter-input filter-select">
              <option value="">Контрагент (Все)</option>
              <optgroup v-for="grp in contractorsOptions" :key="grp.label" :label="grp.label">
                  <option v-for="opt in grp.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </optgroup>
           </select>
        </div>
        
        <div class="filter-col">
            <input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма" />
        </div>
        
        <div class="filter-col">
           <select v-model="filters.project" class="filter-input filter-select">
              <option value="">Проект (Все)</option>
              <option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option>
           </select>
        </div>
        
        <div class="filter-col header-label">Описание</div>
        <div class="filter-col col-trash"></div>
      </div>

      <!-- СПИСОК -->
      <div class="list-scroll">
         <div v-if="filteredList.length === 0" class="empty-state">Нет предоплат.</div>
         
         <div v-for="item in filteredList" :key="item._id" class="grid-row prepay-grid">
            <!-- 1. Дата -->
            <div class="col text-display">{{ item.displayDate }}</div>

            <!-- 2. Контрагент -->
            <div class="col text-display bold-text">{{ item.contractorName }}</div>
            
            <!-- 3. Сумма -->
            <div class="col text-display income-text">+ {{ item.amountFormatted }} ₸</div>
            
            <!-- 4. Проект -->
            <div class="col text-display">{{ item.projectName }}</div>
            
            <!-- 5. Описание -->
            <div class="col text-display small-text">{{ item.description }}</div>
            
            <!-- 6. Удалить -->
            <div class="col-trash">
                <button class="delete-btn" @click="askDelete(item)" title="Удалить">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
         </div>
      </div>

      <!-- ФУТЕР -->
      <div class="popup-footer">
        <div class="footer-actions">
            <button class="btn-close" @click="$emit('close')">Закрыть</button>
        </div>
      </div>
    </div>
    
    <ConfirmationPopup 
        v-if="showDeleteConfirm" 
        title="Удаление предоплаты" 
        message="Удалить запись о предоплате? Средства будут списаны с баланса." 
        confirmText="Удалить"
        @close="showDeleteConfirm = false" 
        @confirm="confirmDelete" 
    />
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; max-height: 85vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 95%; max-width: 1200px; border: 1px solid #ddd; }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 24px; color: #111827; font-weight: 700; }

.summary-bar { display: flex; align-items: center; gap: 15px; padding: 15px 24px; background-color: #fff; border-bottom: 1px solid #eee; font-size: 15px; color: #333; margin-top: 10px; }
.sum-item { display: flex; gap: 6px; }
.sum-label { color: #666; }
.sum-val { font-weight: 700; }
.sum-sep { color: #ddd; }
.income-text { color: #10b981; }

/* GRID */
.filters-row, .grid-row { display: grid; gap: 10px; align-items: center; padding: 0 1.5rem; }
.filters-row { margin: 10px 0; }
.grid-row { padding: 8px 1.5rem; background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; margin-bottom: 6px; }

/* 6 колонок: Дата, Контрагент, Сумма, Проект, Описание, Корзина */
/* Подбираем ширину колонок, чтобы было красиво */
.prepay-grid { 
  grid-template-columns: 130px minmax(150px, 1fr) 130px minmax(120px, 1fr) 2fr 40px
}

.header-label { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.text-display { font-size: 13px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bold-text { font-weight: 600; color: #222; }
.small-text { font-size: 12px; color: #666; }

.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; max-height: 55vh; scrollbar-width: none; }
.list-scroll::-webkit-scrollbar { display: none; }

/* Inputs */
.filter-input { width: 100%; height: 28px; border: 1px solid #ccc; border-radius: 6px; padding: 0 6px; font-size: 13px; background: #fff; box-sizing: border-box; color: #333; }
.filter-input:focus { outline: none; border-color: #222; }
.filter-select { 
  -webkit-appearance: none; appearance: none; 
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); 
  background-repeat: no-repeat; background-position: right 10px center; 
  padding-right: 30px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; 
}

/* Delete Btn */
.delete-btn { width: 28px; height: 28px; border: 1px solid #E0E0E0; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.delete-btn:hover { border-color: #FF3B30; background: #FFF5F5; }
.delete-btn svg { width: 14px; stroke: #999; transition: stroke 0.2s; }
.delete-btn:hover svg { stroke: #FF3B30; }

.popup-footer { padding: 1.5rem; border-top: 1px solid #E0E0E0; display: flex; justify-content: flex-end; align-items: center; background: #F9F9F9; border-radius: 0 0 12px 12px; }
.btn-close { padding: 0 16px; height: 36px; background: white; border: 1px solid #d1d5db; color: #374151; border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 14px; }
.btn-close:hover { background: #f3f4f6; }

.empty-state { text-align: center; padding: 3rem; color: #999; font-style: italic; }
</style>