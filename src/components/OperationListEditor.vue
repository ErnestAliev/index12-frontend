<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import OperationPopup from './OperationPopup.vue';
import DateRangePicker from './DateRangePicker.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v55.0 - CLEANUP WITHDRAWALS ---
 * * ВЕРСИЯ: 55.0 - Удалена логика выводов (перенесена в WithdrawalListEditor)
 * * ДАТА: 2025-12-01
 */

const props = defineProps({
  title: { type: String, default: 'Редактировать операции' },
  type: { type: String, required: true }, // 'income' | 'expense'
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const localItems = ref([]);
const isSaving = ref(false);

// Состояния попапов
const isCreatePopupVisible = ref(false);
const isDeleting = ref(false);
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);

const filters = ref({
  dateRange: { from: null, to: null },
  owner: '',
  account: '',
  amount: '',
  contractorValue: '',
  category: '',
  project: ''
});

// DATA SOURCES
const accounts = computed(() => mainStore.accounts);
const projects = computed(() => mainStore.projects);
const categories = computed(() => mainStore.categories.filter(c => !['перевод', 'transfer'].includes(c.name.toLowerCase())));
const companies = computed(() => mainStore.companies);
const individuals = computed(() => mainStore.individuals);

const contractorOptions = computed(() => {
  const opts = [];
  const myCompanyNames = new Set(mainStore.companies.map(c => c.name.trim().toLowerCase()));
  const filteredContractors = mainStore.contractors.filter(c => !myCompanyNames.has(c.name.trim().toLowerCase()));

  if (filteredContractors.length > 0) {
      const group = { label: 'Юрлица / ИП', options: [] };
      filteredContractors.forEach(c => group.options.push({ value: `contr_${c._id}`, label: c.name }));
      opts.push(group);
  }
  
  const filteredIndividuals = mainStore.individuals.filter(i => {
      const name = i.name.trim().toLowerCase();
      return name !== 'розничные клиенты' && name !== 'розница';
  });

  if (filteredIndividuals.length > 0) {
      const group = { label: 'Физлица (Контрагенты)', options: [] };
      filteredIndividuals.forEach(i => group.options.push({ value: `ind_${i._id}`, label: i.name }));
      opts.push(group);
  }
  return opts;
});

const toInputDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    if (op.isTransfer || op.isWithdrawal) return false; // Выводы и переводы — нет
    if (op.categoryId?.name?.toLowerCase() === 'перевод') return false;
    if (mainStore._isRetailWriteOff(op)) return false; // Списания — нет
    
    return true;
  });

  localItems.value = targetOps.sort((a, b) => new Date(b.date) - new Date(a.date)).map(op => {
      let cId = op.companyId;
      let iId = op.individualId;

      if (!cId && !iId && op.accountId) {
          const accId = (typeof op.accountId === 'object') ? op.accountId._id : op.accountId;
          const storeAccount = mainStore.accounts.find(a => a._id === accId);
          if (storeAccount) {
              cId = storeAccount.companyId;
              iId = storeAccount.individualId;
          }
      }
      const ownerId = getOwnerId(cId, iId);
      
      let contrVal = null;
      const contrId = op.contractorId?._id || op.contractorId;
      const indContrId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
      if (contrId) contrVal = `contr_${contrId}`;
      else if (indContrId) contrVal = `ind_${indContrId}`;

      let amount = Math.abs(op.amount);

      return {
        _id: op._id,
        originalOp: op,
        date: toInputDate(op.date),
        amount: amount,
        amountFormatted: formatNumber(amount),
        accountId: op.accountId?._id || op.accountId,
        ownerId: ownerId, 
        contractorValue: contrVal, 
        categoryId: op.categoryId?._id || op.categoryId,
        projectId: op.projectId?._id || op.projectId,
        isDeleted: false
      };
    });
};

onMounted(() => { loadOperations(); });
watch(() => mainStore.accounts, () => { loadOperations(); }, { deep: true });
watch(() => mainStore.allOperationsFlat, () => { loadOperations(); }, { deep: true });

// FILTERING
const filteredItems = computed(() => {
  return localItems.value.filter(item => {
    if (item.isDeleted) return false;
    const { from, to } = filters.value.dateRange;
    if (from && item.date < from) return false;
    if (to && item.date > to) return false;

    if (filters.value.amount && !String(item.amount).includes(filters.value.amount.replace(/\s/g, ''))) return false;
    
    if (filters.value.owner && item.ownerId !== filters.value.owner) return false;
    if (filters.value.account && item.accountId !== filters.value.account) return false;
    
    if (filters.value.contractorValue && item.contractorValue !== filters.value.contractorValue) return false;
    if (filters.value.category && item.categoryId !== filters.value.category) return false;
    if (filters.value.project && item.projectId !== filters.value.project) return false;

    return true;
  });
});

// ACTIONS
const openCreatePopup = () => { isCreatePopupVisible.value = true; };
const handleOperationAdded = async (newOp) => { isCreatePopupVisible.value = false; await mainStore.fetchAllEntities(); loadOperations(); };
const onAmountInput = (item) => { const raw = item.amountFormatted.replace(/[^0-9]/g, ''); item.amountFormatted = formatNumber(raw); item.amount = Number(raw); };
const askDelete = (item) => { itemToDelete.value = item; showDeleteConfirm.value = true; };
const confirmDelete = async () => { if (!itemToDelete.value) return; isDeleting.value = true; try { await mainStore.deleteOperation(itemToDelete.value.originalOp); itemToDelete.value.isDeleted = true; showDeleteConfirm.value = false; } catch (e) { alert(e.message); } finally { isDeleting.value = false; } };

const handleSave = async () => {
  isSaving.value = true;
  try {
    const updates = [];
    for (const item of localItems.value) {
      if (item.isDeleted) continue;
      const original = item.originalOp;
      
      let companyId = null; let individualId = null;
      if (item.ownerId) { const [type, id] = item.ownerId.split('-'); if (type === 'company') companyId = id; else individualId = id; }

      let contractorId = null; let counterpartyIndividualId = null;
      if (item.contractorValue) { const [prefix, id] = item.contractorValue.split('_'); if (prefix === 'contr') contractorId = id; else if (prefix === 'ind') counterpartyIndividualId = id; }

      const [year, month, day] = item.date.split('-').map(Number);
      const newDateObj = new Date(year, month - 1, day, 12, 0, 0);

      const isChanged = 
        toInputDate(original.date) !== item.date || Math.abs(original.amount) !== item.amount ||
        (original.accountId?._id || original.accountId) !== item.accountId ||
        (original.companyId?._id || original.companyId) !== companyId || (original.individualId?._id || original.individualId) !== individualId ||
        (original.contractorId?._id || original.contractorId) !== contractorId || (original.counterpartyIndividualId?._id || original.counterpartyIndividualId) !== counterpartyIndividualId ||
        (original.categoryId?._id || original.categoryId) !== item.categoryId || (original.projectId?._id || original.projectId) !== item.projectId;

      if (isChanged) {
        updates.push(mainStore.updateOperation(item._id, {
          date: newDateObj,
          amount: props.type === 'income' ? item.amount : -item.amount,
          accountId: item.accountId,
          companyId, individualId,
          contractorId, counterpartyIndividualId,
          categoryId: item.categoryId,
          projectId: item.projectId,
          isWithdrawal: false // Гарантируем, что это не вывод
        }));
      }
    }
    if (updates.length > 0) await Promise.all(updates);
    emit('close');
  } catch (e) { console.error(e); } finally { isSaving.value = false; }
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      <div class="popup-header"><h3>{{ title }}</h3></div>

      <!-- FILTERS -->
      <div class="filters-row">
        <div class="filter-col col-date"><DateRangePicker v-model="filters.dateRange" placeholder="Период" /></div>
        
        <div class="filter-col col-owner">
            <select v-model="filters.owner" class="filter-input filter-select">
                <option value="">Владелец</option>
                <optgroup label="Компании"><option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option></optgroup>
                <optgroup label="Физлица"><option v-for="i in individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option></optgroup>
            </select>
        </div>
        <div class="filter-col col-acc"><select v-model="filters.account" class="filter-input filter-select"><option value="">Счет</option><option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option></select></div>
        
        <div class="filter-col col-amount"><input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма" /></div>
        
        <div class="filter-col col-contr">
            <select v-model="filters.contractorValue" class="filter-input filter-select"><option value="">Контрагент</option><optgroup v-for="g in contractorOptions" :key="g.label" :label="g.label"><option v-for="o in g.options" :key="o.value" :value="o.value">{{ o.label }}</option></optgroup></select>
        </div>
        <div class="filter-col col-cat"><select v-model="filters.category" class="filter-input filter-select"><option value="">Категория</option><option v-for="c in categories" :key="c._id" :value="c._id">{{ c.name }}</option></select></div>
        <div class="filter-col col-proj"><select v-model="filters.project" class="filter-input filter-select"><option value="">Проект</option><option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option></select></div>
        
        <div class="filter-col col-trash"></div>
      </div>
      
      <div class="list-scroll">
        <div v-if="filteredItems.length === 0" class="empty-state">Операций не найдено.</div>
        
        <div v-for="item in filteredItems" :key="item._id" class="grid-row">
            <div class="col-date"><input type="date" v-model="item.date" class="edit-input date-input" /></div>
            
            <div class="col-owner">
                <select v-model="item.ownerId" class="edit-input select-input">
                    <option :value="null">-</option>
                    <optgroup label="Компании"><option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option></optgroup>
                    <optgroup label="Физлица"><option v-for="i in individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option></optgroup>
                </select>
            </div>

            <div class="col-acc"><select v-model="item.accountId" class="edit-input select-input"><option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option></select></div>
            <div class="col-amount">
                <input type="text" v-model="item.amountFormatted" @input="onAmountInput(item)" class="edit-input amount-input" />
            </div>
            
            <div class="col-contr">
                <select v-model="item.contractorValue" class="edit-input select-input"><option :value="null">-</option><optgroup v-for="g in contractorOptions" :key="g.label" :label="g.label"><option v-for="o in g.options" :key="o.value" :value="o.value">{{ o.label }}</option></optgroup></select>
            </div>
            <div class="col-cat"><select v-model="item.categoryId" class="edit-input select-input"><option :value="null">-</option><option v-for="c in categories" :key="c._id" :value="c._id">{{ c.name }}</option></select></div>
            <div class="col-proj"><select v-model="item.projectId" class="edit-input select-input"><option :value="null">-</option><option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option></select></div>

            <div class="col-trash">
            <button class="delete-btn" @click="askDelete(item)" title="Удалить">
                <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
            </div>
        </div>
      </div>

      <div class="popup-footer">
        <div class="footer-left-actions">
            <button class="btn-add-new-footer btn-income" @click="openCreatePopup">+ Создать</button>
        </div>
        <div class="footer-actions">
            <button class="btn-close" @click="$emit('close')">Закрыть</button>
            <button class="btn-save" @click="handleSave" :disabled="isSaving">Сохранить изменения</button>
        </div>
      </div>
    </div>

    <OperationPopup v-if="isCreatePopupVisible" :type="type" :date="new Date()" :cellIndex="0" @close="isCreatePopupVisible = false" @operation-added="handleOperationAdded" />
    
    <div v-if="showDeleteConfirm" class="inner-overlay" @click.self="showDeleteConfirm = false"><div class="delete-confirm-box"><h4>Удалить операцию?</h4><p class="confirm-text">Вы действительно хотите удалить эту операцию? Это действие необратимо.</p><div class="delete-actions"><button class="btn-delete-confirm" @click="confirmDelete">Да, удалить</button><button class="btn-cancel" @click="showDeleteConfirm = false">Отмена</button></div></div></div>
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; max-height: 85vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 95%; max-width: 1300px; border: 1px solid #ddd; }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 24px; color: #111827; font-weight: 700; letter-spacing: -0.02em; }

/* GRID LAYOUTS */
.filters-row, .grid-row { display: grid; grid-template-columns: 130px 1fr 1fr 120px 1fr 1fr 1fr 50px; gap: 12px; align-items: center; padding: 0 1.5rem; margin-top: 15px;}

.filters-row { margin-bottom: 10px; }
.grid-row { padding: 4px 1.5rem; background: #fff; border: 1px solid #E0E0E0; border-radius: 8px; margin-bottom: 6px; transition: box-shadow 0.2s; }
.grid-row:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-color: #ccc; }

.text-red { color: #ff3b30 !important; }
.col-trash { display: flex; justify-content: left; align-items: center; }
.col-date { display: flex; align-items: center; }

.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; max-height: 55vh; scrollbar-width: none; -ms-overflow-style: none; }
.list-scroll::-webkit-scrollbar { display: none; }

.edit-input { width: 100%; height: 28px; background: #FFFFFF; border: 1px solid #ccc; border-radius: 6px; padding: 0 10px; font-size: 13px; color: #333; box-sizing: border-box; margin: 0; display: block; }
.edit-input:focus { outline: none; border-color: #222; box-shadow: 0 0 0 2px rgba(34,34,34,0.1); }
.filter-input { width: 100%; height: 28px; border: 1px solid #ccc; border-radius: 6px; padding: 0 6px; font-size: 13px; color: #333; box-sizing: border-box; background-color: #fff; margin: 0; }
.filter-select, .select-input { -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.filter-input:focus { outline: none; border-color: var(--color-primary); }
.amount-input { text-align: right; font-weight: 700; color: #333; }
.date-input { color: #555; }

.delete-btn { width: 28px; height: 28px; border: 1px solid #E0E0E0; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; padding: 0; margin: 0; }
.delete-btn svg { width: 14px; height: 14px; stroke: #999; }
.delete-btn:hover { border-color: #FF3B30; background: #FFF5F5; }
.delete-btn:hover svg { stroke: #FF3B30; }

.popup-footer { padding: 1.5rem; border-top: 1px solid #E0E0E0; display: flex; justify-content: space-between; align-items: center; background-color: #F9F9F9; border-radius: 0 0 12px 12px; }
.footer-left-actions { display: flex; gap: 10px; }
.btn-add-new-footer { padding: 0 16px; height: 28px; border: 1px solid transparent; border-radius: 6px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; display: flex; align-items: center; justify-content: center; }
.btn-income { background: #10b981; }
.btn-income:hover { background: #059669; }
.footer-actions { display: flex; gap: 10px; }
.btn-save { padding: 0 16px; height: 28px; background: #111827; color: white; border: none; border-radius: 6px; font-weight: 600; border: none; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.btn-save:hover { background: #374151; }
.btn-close { padding: 0 16px; height: 28px; background: white; border: 1px solid #d1d5db; color: #374151; border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.btn-close:hover { background: #f3f4f6; }
.empty-state { text-align: center; padding: 4rem; color: #9ca3af; font-style: italic; }

.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 1210; }
.delete-confirm-box { background: #fff; padding: 24px; border-radius: 12px; width: 320px; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.2); }
.delete-confirm-box h4 { margin: 0 0 10px; color: #222; font-size: 18px; font-weight: 600; }
.confirm-text { font-size: 14px; margin-bottom: 20px; color: #555; line-height: 1.5; }
.delete-actions { display: flex; gap: 10px; justify-content: center; }
.btn-cancel { background: #e0e0e0; color: #333; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 500; }
.btn-cancel:hover { background: #d1d1d1; }
.btn-delete-confirm { background: #ff3b30; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-delete-confirm:hover { background: #e02e24; }
</style>