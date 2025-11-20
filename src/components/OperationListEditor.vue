<script setup>
import { ref, computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import OperationPopup from './OperationPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v21.2 - CATEGORY FILTER FIX ---
 * * ВЕРСИЯ: 21.2 - Исправление фильтра категорий (включена Предоплата)
 * * ДАТА: 2025-11-21
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (LOGIC) Computed `categories` теперь не использует `visibleCategories` (который скрывает предоплату),
 * а берет полный список `mainStore.categories` и исключает только "Перевод".
 * Это позволяет фильтровать список операций по категории "Предоплата".
 */

const props = defineProps({
  title: { type: String, default: 'Редактировать операции' },
  type: { type: String, required: true }, // 'income' | 'expense'
  filterMode: { type: String, default: 'default' } // 'default' | 'prepayment_only'
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const localItems = ref([]);
const isSaving = ref(false);

const filters = ref({
  date: '',
  owner: '',
  account: '',
  amount: '',
  contractor: '',
  category: '',
  project: ''
});

const isCreatePopupVisible = ref(false);
const isDeleting = ref(false);
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);

const accounts = computed(() => mainStore.accounts);
const projects = computed(() => mainStore.projects);

// 🟢 ИСПРАВЛЕНИЕ: Формируем список категорий для фильтра
// Включаем ВСЕ категории (в т.ч. Предоплату), исключаем только Перевод
const categories = computed(() => {
  return mainStore.categories.filter(c => {
      const name = c.name.toLowerCase().trim();
      return name !== 'перевод' && name !== 'transfer';
  }).sort((a, b) => a.name.localeCompare(b.name)); // Сортировка по алфавиту для удобства
});

const contractors = computed(() => mainStore.contractors);
const companies = computed(() => mainStore.companies);
const individuals = computed(() => mainStore.individuals);

const toInputDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateReadable = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  return d.toLocaleDateString('ru-RU');
};

const getOwnerId = (compId, indId) => {
  if (compId) return typeof compId === 'object' ? `company-${compId._id}` : `company-${compId}`;
  if (indId) return typeof indId === 'object' ? `individual-${indId._id}` : `individual-${indId}`;
  return null;
};

const loadOperations = () => {
  const allOps = mainStore.allOperationsFlat;
  
  const targetOps = allOps.filter(op => {
    if (op.type !== props.type) return false;
    if (op.isTransfer) return false;
    if (op.categoryId?.name?.toLowerCase() === 'перевод') return false;
    
    if (props.filterMode === 'prepayment_only') {
        const prepayIds = mainStore.getPrepaymentCategoryIds;
        const catId = op.categoryId?._id || op.categoryId;
        const prepId = op.prepaymentId?._id || op.prepaymentId;
        const isPrepay = (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
        return !!isPrepay; 
    }

    return true;
  });

  localItems.value = targetOps
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(op => {
      const ownerId = getOwnerId(op.companyId, op.individualId);
      
      return {
        _id: op._id,
        originalOp: op,
        date: toInputDate(op.date),
        amount: Math.abs(op.amount),
        amountFormatted: formatNumber(Math.abs(op.amount)),
        
        accountId: op.accountId?._id || op.accountId,
        ownerId: ownerId,
        
        contractorId: op.contractorId?._id || op.contractorId,
        categoryId: op.categoryId?._id || op.categoryId,
        projectId: op.projectId?._id || op.projectId,
        
        isDeleted: false
      };
    });
};

onMounted(() => {
  loadOperations();
});

const filteredItems = computed(() => {
  return localItems.value.filter(item => {
    if (item.isDeleted) return false;
    if (filters.value.date && item.date !== filters.value.date) return false;
    if (filters.value.amount) {
        const searchAmount = filters.value.amount.replace(/\s/g, '');
        const itemAmount = String(item.amount);
        if (!itemAmount.includes(searchAmount)) return false;
    }
    if (filters.value.owner && item.ownerId !== filters.value.owner) return false;
    if (filters.value.account && item.accountId !== filters.value.account) return false;
    if (filters.value.contractor && item.contractorId !== filters.value.contractor) return false;
    
    // Фильтрация по категории
    if (filters.value.category) {
        // Если категория в операции совпадает с выбранной
        if (item.categoryId !== filters.value.category) {
            // Дополнительная проверка для системной предоплаты (если выбрана категория "Предоплата")
            // Если item.categoryId не совпал напрямую, возможно это системная предоплата
            // Но обычно item.categoryId уже содержит ID предоплаты, если это она.
            return false; 
        }
    }
    
    if (filters.value.project && item.projectId !== filters.value.project) return false;

    return true;
  });
});

const isFilterActive = computed(() => Object.values(filters.value).some(val => val !== ''));

const totalSum = computed(() => {
    const rawSum = localItems.value.reduce((acc, item) => acc + (item.amount || 0), 0);
    return props.type === 'expense' ? -rawSum : rawSum;
});

const filteredSum = computed(() => {
    const rawSum = filteredItems.value.reduce((acc, item) => acc + (item.amount || 0), 0);
    return props.type === 'expense' ? -rawSum : rawSum;
});

const formatTotal = (val) => {
    const absVal = Math.abs(val);
    const formatted = formatNumber(absVal);
    if (val > 0) return `+ ${formatted} ₸`;
    if (val < 0) return `- ${formatted} ₸`;
    return `${formatted} ₸`;
};

const getTotalClass = (val) => {
    if (props.filterMode === 'prepayment_only') return 'total-prepayment';
    if (val > 0) return 'total-income';
    if (val < 0) return 'total-expense';
    return '';
};

const getInputClass = () => {
    if (props.filterMode === 'prepayment_only') return 'is-prepayment';
    return props.type === 'income' ? 'is-income' : 'is-expense';
};

const openCreatePopup = () => { isCreatePopupVisible.value = true; };
const handleOperationAdded = async (newOp) => {
  isCreatePopupVisible.value = false;
  await mainStore.fetchAllEntities(); 
  if (newOp && newOp.dateKey) await mainStore.refreshDay(newOp.dateKey);
  loadOperations(); 
};

const onAmountInput = (item) => {
  const raw = item.amountFormatted.replace(/[^0-9]/g, '');
  item.amountFormatted = formatNumber(raw);
  item.amount = Number(raw);
};

const onAccountChange = (item) => {
  const account = accounts.value.find(a => a._id === item.accountId);
  if (account) {
    let newOwnerId = null;
    if (account.companyId) {
      const cId = typeof account.companyId === 'object' ? account.companyId._id : account.companyId;
      newOwnerId = `company-${cId}`;
    } else if (account.individualId) {
      const iId = typeof account.individualId === 'object' ? account.individualId._id : account.individualId;
      newOwnerId = `individual-${iId}`;
    }
    if (newOwnerId) item.ownerId = newOwnerId;
  }
};

const onContractorChange = (item) => {
  const contr = contractors.value.find(c => c._id === item.contractorId);
  if (contr) {
      if (contr.defaultCategoryId) {
          item.categoryId = (typeof contr.defaultCategoryId === 'object') ? contr.defaultCategoryId._id : contr.defaultCategoryId;
      }
      if (contr.defaultProjectId) {
          item.projectId = (typeof contr.defaultProjectId === 'object') ? contr.defaultProjectId._id : contr.defaultProjectId;
      }
  }
};

const handleSave = async () => {
  isSaving.value = true;
  try {
    const updates = [];
    for (const item of localItems.value) {
      if (item.isDeleted) continue;
      const original = item.originalOp;
      
      let compId = null, indId = null;
      if (item.ownerId) {
        const [type, id] = item.ownerId.split('-');
        if (type === 'company') compId = id; else indId = id;
      }
      
      const [year, month, day] = item.date.split('-').map(Number);
      const newDateObj = new Date(year, month - 1, day, 12, 0, 0);
      
      const isChanged = 
        toInputDate(original.date) !== item.date ||
        Math.abs(original.amount) !== item.amount ||
        (original.accountId?._id || original.accountId) !== item.accountId ||
        (original.contractorId?._id || original.contractorId) !== item.contractorId ||
        (original.categoryId?._id || original.categoryId) !== item.categoryId ||
        (original.projectId?._id || original.projectId) !== item.projectId ||
        getOwnerId(original.companyId, original.individualId) !== item.ownerId;

      if (isChanged) {
        const signedAmount = props.type === 'income' ? item.amount : -Math.abs(item.amount);
        updates.push(mainStore.updateOperation(item._id, {
          date: newDateObj,
          amount: signedAmount,
          accountId: item.accountId,
          companyId: compId,
          individualId: indId,
          contractorId: item.contractorId,
          categoryId: item.categoryId,
          projectId: item.projectId,
          type: props.type 
        }));
      }
    }
    if (updates.length > 0) await Promise.all(updates);
    emit('close');
  } catch (e) {
    console.error("Ошибка сохранения:", e);
    alert("Ошибка при сохранении изменений");
  } finally {
    isSaving.value = false;
  }
};

const askDelete = (item) => { itemToDelete.value = item; showDeleteConfirm.value = true; };
const confirmDelete = async () => {
  if (!itemToDelete.value) return;
  isDeleting.value = true;
  try {
    await new Promise(resolve => setTimeout(resolve, 600)); 
    await mainStore.deleteOperation(itemToDelete.value.originalOp);
    localItems.value = localItems.value.filter(i => i._id !== itemToDelete.value._id);
    showDeleteConfirm.value = false; itemToDelete.value = null;
  } catch (e) { alert('Ошибка при удалении: ' + e.message); } finally { isDeleting.value = false; }
};
const cancelDelete = () => { if (isDeleting.value) return; showDeleteConfirm.value = false; itemToDelete.value = null; };

const isSystemPrepayment = (item) => {
    const op = item.originalOp;
    const prepayIds = mainStore.getPrepaymentCategoryIds;
    const catId = op.categoryId?._id || op.categoryId;
    const prepId = op.prepaymentId?._id || op.prepaymentId;
    return (catId && prepayIds.includes(catId)) || (prepId && prepayIds.includes(prepId)) || (op.categoryId && op.categoryId.isPrepayment);
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      
      <div class="popup-header">
        <h3>{{ title }}</h3>
      </div>
      
      <p class="editor-hint">
        Редактируйте параметры операций. Нажмите на корзину для удаления.
      </p>
      
      <div class="create-section">
        <button 
           class="btn-add-new" 
           :class="type === 'income' ? 'btn-income' : 'btn-expense'"
           @click="openCreatePopup"
        >
          + Создать {{ type === 'income' ? 'Доход' : 'Расход' }}
        </button>
      </div>

      <div v-if="localItems.length > 0" class="totals-bar">
          <div class="total-item">
              <span class="total-label">Всего:</span>
              <span class="total-value" :class="getTotalClass(totalSum)">{{ formatTotal(totalSum) }}</span>
          </div>
          <div class="total-item" v-if="isFilterActive">
              <span class="total-label">Итого (по фильтру):</span>
              <span class="total-value filtered" :class="getTotalClass(filteredSum)">{{ formatTotal(filteredSum) }}</span>
          </div>
      </div>
      
      <div class="filters-row">
        <div class="filter-col col-date">
           <input type="date" v-model="filters.date" class="filter-input" placeholder="Фильтр..." />
        </div>
        <div class="filter-col col-owner">
           <select v-model="filters.owner" class="filter-input filter-select">
              <option value="">Все</option>
              <optgroup label="Компании">
                  <option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option>
              </optgroup>
              <optgroup label="Физлица">
                  <option v-for="i in individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option>
              </optgroup>
           </select>
        </div>
        <div class="filter-col col-acc">
           <select v-model="filters.account" class="filter-input filter-select">
              <option value="">Все</option>
              <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
           </select>
        </div>
        <div class="filter-col col-amount">
           <input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма..." />
        </div>
        <div class="filter-col col-contr">
           <select v-model="filters.contractor" class="filter-input filter-select">
              <option value="">Все</option>
              <option v-for="c in contractors" :key="c._id" :value="c._id">{{ c.name }}</option>
           </select>
        </div>
        <div class="filter-col col-cat">
           <select v-model="filters.category" class="filter-input filter-select">
              <option value="">Все</option>
              <!-- 🟢 Теперь categories содержит и Предоплату -->
              <option v-for="c in categories" :key="c._id" :value="c._id">{{ c.name }}</option>
           </select>
        </div>
        <div class="filter-col col-proj">
           <select v-model="filters.project" class="filter-input filter-select">
              <option value="">Все</option>
              <option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option>
           </select>
        </div>
        <div class="filter-col col-trash"></div>
      </div>
      
      <div class="grid-header">
        <span class="col-date">Дата</span>
        <span class="col-owner">Владелец</span>
        <span class="col-acc">Счет</span>
        <span class="col-amount">Сумма</span>
        <span class="col-contr">Контрагент</span>
        <span class="col-cat">Категория</span>
        <span class="col-proj">Проект</span>
        <span class="col-trash"></span>
      </div>
      
      <div class="list-scroll">
        <div v-if="localItems.length === 0" class="empty-state">Операций не найдено.</div>
        <div v-else-if="filteredItems.length === 0" class="empty-state">Нет операций, соответствующих фильтрам.</div>

        <div v-for="item in filteredItems" :key="item._id" class="grid-row">
          <div class="col-date"><input type="date" v-model="item.date" class="edit-input date-input" /></div>
          <div class="col-owner">
             <select v-model="item.ownerId" class="edit-input select-input">
                <option :value="null">-</option>
                <optgroup label="Компании"><option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option></optgroup>
                <optgroup label="Физлица"><option v-for="i in individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option></optgroup>
             </select>
          </div>
          <div class="col-acc">
            <select v-model="item.accountId" @change="onAccountChange(item)" class="edit-input select-input">
               <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
            </select>
          </div>
          
          <div class="col-amount">
            <input type="text" v-model="item.amountFormatted" @input="onAmountInput(item)" class="edit-input amount-input" :class="getInputClass()" />
          </div>
          
          <div class="col-contr">
             <select v-model="item.contractorId" @change="onContractorChange(item)" class="edit-input select-input">
                <option :value="null">-</option>
                <option v-for="c in contractors" :key="c._id" :value="c._id">{{ c.name }}</option>
             </select>
          </div>
          
          <div class="col-cat">
             <div v-if="isSystemPrepayment(item) || props.filterMode === 'prepayment_only'" class="system-tag-wrapper">
                <span class="system-tag" :class="{ 'tag-orange': props.filterMode === 'prepayment_only' }">
                    Предоплата
                </span>
             </div>
             <select v-else v-model="item.categoryId" class="edit-input select-input">
                <option :value="null">-</option>
                <option v-for="c in categories" :key="c._id" :value="c._id">{{ c.name }}</option>
             </select>
          </div>

          <div class="col-proj">
             <select v-model="item.projectId" class="edit-input select-input">
                <option :value="null">-</option>
                <option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option>
             </select>
          </div>
          <div class="col-trash">
            <button class="delete-btn" @click="askDelete(item)" title="Удалить">
               <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="popup-footer">
        <button class="btn-close" @click="$emit('close')">Отмена</button>
        <button class="btn-save" @click="handleSave" :disabled="isSaving">{{ isSaving ? 'Сохранение...' : 'Сохранить изменения' }}</button>
      </div>
    </div>

    <OperationPopup v-if="isCreatePopupVisible" :type="type" :date="new Date()" :cellIndex="0" @close="isCreatePopupVisible = false" @operation-added="handleOperationAdded" />
    <div v-if="showDeleteConfirm" class="inner-overlay" @click.self="cancelDelete">
      <div class="delete-confirm-box">
        <div v-if="isDeleting" class="deleting-state"><h4>Удаление...</h4><p class="sub-note">Пожалуйста, подождите.</p><div class="progress-container"><div class="progress-bar"></div></div></div>
        <div v-else>
          <h4>Подтвердите удаление</h4>
          <p class="confirm-text" v-if="itemToDelete">Удалить операцию от <b>{{ formatDateReadable(itemToDelete.date) }}</b><br>на сумму <b>{{ itemToDelete.amountFormatted }} ₸</b>?</p>
          <div class="delete-actions"><button class="btn-cancel" @click="cancelDelete">Отмена</button><button class="btn-delete-confirm" @click="confirmDelete">Удалить</button></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F4F4F4; border-radius: 12px; display: flex; flex-direction: column; max-height: 90vh; margin: 2rem 1rem; box-shadow: 0 15px 40px rgba(0,0,0,0.3); width: 98%; max-width: 1300px; }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 22px; color: #1a1a1a; font-weight: 600; }
.editor-hint { padding: 0 1.5rem; font-size: 0.9em; color: #666; margin-bottom: 1.5rem; margin-top: 0; }

.create-section { margin: 0 1.5rem 1.5rem 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #e0e0e0; }

.btn-add-new { 
  width: 100%; padding: 12px; 
  border: 1px solid transparent; 
  border-radius: 8px; 
  color: #fff; 
  font-size: 15px; cursor: pointer; transition: all 0.2s; 
}
.btn-income { background-color: var(--color-primary); }
.btn-income:hover { background-color: #2da84e; }

.btn-expense { background-color: var(--color-danger); }
.btn-expense:hover { background-color: #d93025; }


.totals-bar { display: flex; justify-content: flex-start; gap: 30px; padding: 0 1.5rem 1rem; margin-bottom: 1rem; border-bottom: 1px solid #e0e0e0; }
.total-item { font-size: 16px; color: #333; }
.total-label { margin-right: 8px; color: #666; }
.total-value { font-weight: 700; }
.total-income { color: var(--color-primary); }
.total-expense { color: var(--color-danger); }
.total-prepayment { color: #FF9D00; }

.filters-row { display: grid; grid-template-columns: 130px 1fr 1fr 120px 1fr 1fr 1fr 50px; gap: 8px; align-items: center; padding: 0 1.5rem; margin-bottom: 8px; }
.filter-input { width: 100%; height: 32px; border: 1px solid #ccc; border-radius: 6px; padding: 0 6px; font-size: 0.8em; color: #333; box-sizing: border-box; background-color: #fff; margin: 0; }
.filter-select { -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 6px center; padding-right: 20px; }
.filter-input:focus { outline: none; border-color: var(--color-primary); }
.grid-header, .grid-row { display: grid; grid-template-columns: 130px 1fr 1fr 120px 1fr 1fr 1fr 50px; gap: 8px; align-items: center; padding: 0 1.5rem; }
.grid-header { font-size: 0.8em; color: #666; margin-bottom: 8px; font-weight: 500; }
.grid-row { margin-bottom: 8px; background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; padding: 10px 1.5rem; }
.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; scrollbar-width: none; -ms-overflow-style: none; }
.list-scroll::-webkit-scrollbar { display: none; }
.edit-input { width: 100%; height: 40px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 6px; padding: 0 8px; font-size: 0.85em; color: #333; box-sizing: border-box; margin: 0; display: block; }
.edit-input:focus { outline: none; border-color: #222; box-shadow: 0 0 0 2px rgba(34,34,34,0.1); }
.select-input { -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; padding-right: 24px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.amount-input { text-align: right; font-weight: 600; }

.is-income { color: var(--color-primary); }
.is-expense { color: var(--color-danger); }
.is-prepayment { color: #FF9D00 !important; }

.delete-btn { width: 40px; height: 40px; border: 1px solid #E0E0E0; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; padding: 0; margin: 0; }
.delete-btn svg { width: 18px; height: 18px; stroke: #999; }
.delete-btn:hover { border-color: #FF3B30; background: #FFF5F5; }
.delete-btn:hover svg { stroke: #FF3B30; }
.popup-footer { padding: 1.5rem; border-top: 1px solid #E0E0E0; display: flex; justify-content: flex-end; gap: 10px; background-color: #F9F9F9; border-radius: 0 0 12px 12px; }
.btn-close { padding: 12px 24px; border: 1px solid #ccc; background: transparent; border-radius: 8px; cursor: pointer; font-weight: 500; color: #555; }
.btn-close:hover { background: #eee; }
.btn-save { padding: 12px 24px; border: none; background: #222; border-radius: 8px; cursor: pointer; font-weight: 600; color: #fff; }
.btn-save:hover:not(:disabled) { background: #444; }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
.empty-state { text-align: center; padding: 2rem; color: #888; }

.system-tag-wrapper {
  display: flex; align-items: center; height: 40px;
}
.system-tag {
  display: inline-block;
  background-color: #e0f2f1;
  color: #009688;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85em;
  font-weight: 600;
  border: 1px solid #b2dfdb;
}
.system-tag.tag-orange {
  background-color: #FFF3E0;
  color: #FF9D00;
  border-color: #FFE0B2;
}

@media (max-width: 1400px) { .grid-header, .grid-row, .filters-row { grid-template-columns: 110px 1fr 1fr 100px 1fr 1fr 1fr 40px; } }
@media (max-width: 1100px) { .popup-content { max-width: 98vw; margin: 0.5rem; } .grid-header, .filters-row { display: none; } .grid-row { display: flex; flex-direction: column; height: auto; padding: 1rem; gap: 10px; } .grid-row > div { width: 100%; } }
.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 1210; }
.delete-confirm-box { background: #fff; padding: 24px; border-radius: 12px; width: 320px; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.2); text-align: center; }
.delete-confirm-box h4 { margin: 0 0 10px; color: #222; font-size: 18px; font-weight: 600; }
.confirm-text { font-size: 14px; margin-bottom: 20px; color: #555; line-height: 1.5; }
.delete-actions { display: flex; gap: 10px; justify-content: center; }
.btn-cancel { background: #e0e0e0; color: #333; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 500; }
.btn-cancel:hover { background: #d1d1d1; }
.btn-delete-confirm { background: #ff3b30; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-delete-confirm:hover { background: #e02e24; }
.deleting-state { display: flex; flex-direction: column; align-items: center; padding: 1rem 0; }
.sub-note { font-size: 13px; color: #888; margin-top: -5px; margin-bottom: 20px; }
.progress-container { width: 100%; height: 6px; background-color: #eee; border-radius: 3px; overflow: hidden; position: relative; }
.progress-bar { width: 100%; height: 100%; background-color: #222; position: absolute; left: -100%; animation: indeterminate 1.5s infinite ease-in-out; }
@keyframes indeterminate { 0% { left: -100%; width: 50%; } 50% { left: 25%; width: 50%; } 100% { left: 100%; width: 50%; } }
</style>
