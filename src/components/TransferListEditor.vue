<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import TransferPopup from './TransferPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v23.1 - COMPACT STYLE ---
 * * ВЕРСИЯ: 23.1 - Приведение стилей к виду "Зебра" (как в OperationListEditor)
 * * ДАТА: 2025-11-20
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (STYLE) Внедрено чередование цветов строк ("зебра").
 * 2. (STYLE) Убраны отступы между строками, список стал слитным.
 * 3. (STYLE) Уменьшена высота полей ввода.
 */

const props = defineProps({
  // 'transfer' | 'act'
  mode: { type: String, default: 'transfer' }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const localItems = ref([]);
const isSaving = ref(false);
const isCreatePopupVisible = ref(false);
const isDeleting = ref(false);
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);

// --- Справочники ---
const accounts = computed(() => mainStore.accounts);
const contractors = computed(() => mainStore.contractors);
const projects = computed(() => mainStore.projects);
const companies = computed(() => mainStore.companies);
const individuals = computed(() => mainStore.individuals);
const availableCategories = computed(() => mainStore.categories.filter(c => {
    const name = c.name.toLowerCase().trim();
    return name !== 'перевод' && name !== 'transfer' && name !== 'проводки';
}));

// --- Фильтры ---
const filters = ref({
  date: '',
  fromOwner: '',
  fromAccount: '',
  toAccount: '', 
  toOwner: '',   
  amount: '',
  contractor: '',
  category: '',
  project: ''
});

// --- Заголовки и тексты ---
const title = computed(() => props.mode === 'transfer' ? 'Редактор переводов' : 'Редактор проводок');
const createButtonText = computed(() => props.mode === 'transfer' ? '+ Создать перевод' : '+ Создать проводку');
const emptyStateText = computed(() => props.mode === 'transfer' ? 'Нет переводов.' : 'Нет проводок.');

// --- Хелперы ---
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

// --- Загрузка данных ---
const loadItems = () => {
  const allOps = mainStore.allOperationsFlat;
  let targetOps = [];

  if (props.mode === 'transfer') {
      targetOps = allOps.filter(op => op.type === 'transfer' || op.isTransfer === true);
  } else {
      targetOps = allOps.filter(op => op.type === 'act');
  }

  localItems.value = targetOps
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(t => {
      const fromOwnerId = getOwnerId(t.fromCompanyId, t.fromIndividualId);
      const toOwnerId = getOwnerId(t.toCompanyId, t.toIndividualId);
      const contractorId = t.contractorId?._id || t.contractorId;
      const categoryId = t.categoryId?._id || t.categoryId;
      const projectId = t.projectId?._id || t.projectId;

      return {
        _id: t._id,
        originalOp: t,
        date: toInputDate(t.date),
        amount: Math.abs(t.amount),
        amountFormatted: formatNumber(Math.abs(t.amount)),
        
        // Transfer Specific
        fromAccountId: t.fromAccountId?._id || t.fromAccountId,
        fromOwnerId: fromOwnerId,
        toAccountId: t.toAccountId?._id || t.toAccountId,
        toOwnerId: toOwnerId,

        // Act Specific
        contractorId,
        categoryId,
        projectId,
        
        isDeleted: false
      };
    });
};

onMounted(() => {
  loadItems();
});

watch(() => props.mode, () => {
    loadItems();
    filters.value = { date: '', fromOwner: '', fromAccount: '', toAccount: '', toOwner: '', amount: '', contractor: '', category: '', project: '' };
});

// --- Фильтрация ---
const filteredItems = computed(() => {
  return localItems.value.filter(item => {
    if (item.isDeleted) return false;

    if (filters.value.date && item.date !== filters.value.date) return false;
    
    if (filters.value.amount) {
        const searchAmount = filters.value.amount.replace(/\s/g, '');
        const itemAmount = String(item.amount);
        if (!itemAmount.includes(searchAmount)) return false;
    }

    if (props.mode === 'transfer') {
        if (filters.value.fromOwner && item.fromOwnerId !== filters.value.fromOwner) return false;
        if (filters.value.toOwner && item.toOwnerId !== filters.value.toOwner) return false;
        if (filters.value.fromAccount && item.fromAccountId !== filters.value.fromAccount) return false;
        if (filters.value.toAccount && item.toAccountId !== filters.value.toAccount) return false;
    } 
    else {
        if (filters.value.contractor && item.contractorId !== filters.value.contractor) return false;
        if (filters.value.category && item.categoryId !== filters.value.category) return false;
        if (filters.value.project && item.projectId !== filters.value.project) return false;
    }

    return true;
  });
});

const isFilterActive = computed(() => {
  return Object.values(filters.value).some(val => val !== '');
});

// --- ИТОГИ ---
const totalSum = computed(() => {
    return localItems.value.reduce((acc, item) => acc + (item.amount || 0), 0);
});
const filteredSum = computed(() => {
    return filteredItems.value.reduce((acc, item) => acc + (item.amount || 0), 0);
});
const formatTotal = (val) => `${formatNumber(val)} ₸`;

// --- Редактирование ---
const onAmountInput = (item) => {
  const raw = item.amountFormatted.replace(/[^0-9]/g, '');
  item.amountFormatted = formatNumber(raw);
  item.amount = Number(raw);
};

const onAccountChange = (item, direction) => {
  const accId = direction === 'from' ? item.fromAccountId : item.toAccountId;
  const account = accounts.value.find(a => a._id === accId);
  if (account) {
    let newOwnerId = null;
    if (account.companyId) {
      const cId = typeof account.companyId === 'object' ? account.companyId._id : account.companyId;
      newOwnerId = `company-${cId}`;
    } else if (account.individualId) {
      const iId = typeof account.individualId === 'object' ? account.individualId._id : account.individualId;
      newOwnerId = `individual-${iId}`;
    }
    if (newOwnerId) {
      if (direction === 'from') item.fromOwnerId = newOwnerId;
      else item.toOwnerId = newOwnerId;
    }
  }
};

const onContractorChange = (item) => {
  const contr = contractors.value.find(c => c._id === item.contractorId);
  if (contr) {
      if (contr.defaultCategoryId) {
          const cId = (typeof contr.defaultCategoryId === 'object') ? contr.defaultCategoryId._id : contr.defaultCategoryId;
          if (availableCategories.value.some(c => c._id === cId)) item.categoryId = cId;
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
      const [year, month, day] = item.date.split('-').map(Number);
      const newDateObj = new Date(year, month - 1, day, 12, 0, 0);

      let isChanged = false;

      if (props.mode === 'transfer') {
          let fromComp = null, fromInd = null;
          if (item.fromOwnerId) { const [type, id] = item.fromOwnerId.split('-'); if (type === 'company') fromComp = id; else fromInd = id; }
          
          let toComp = null, toInd = null;
          if (item.toOwnerId) { const [type, id] = item.toOwnerId.split('-'); if (type === 'company') toComp = id; else toInd = id; }

          isChanged = 
            toInputDate(original.date) !== item.date ||
            Math.abs(original.amount) !== item.amount ||
            (original.fromAccountId?._id || original.fromAccountId) !== item.fromAccountId ||
            (original.toAccountId?._id || original.toAccountId) !== item.toAccountId ||
            getOwnerId(original.fromCompanyId, original.fromIndividualId) !== item.fromOwnerId ||
            getOwnerId(original.toCompanyId, original.toIndividualId) !== item.toOwnerId;
          
          if (isChanged) {
            updates.push(mainStore.updateTransfer(item._id, {
              date: newDateObj,
              amount: item.amount,
              fromAccountId: item.fromAccountId,
              toAccountId: item.toAccountId,
              fromCompanyId: fromComp,
              fromIndividualId: fromInd,
              toCompanyId: toComp,
              toIndividualId: toInd
            }));
          }
      } else {
          isChanged = 
            toInputDate(original.date) !== item.date ||
            Math.abs(original.amount) !== item.amount ||
            (original.contractorId?._id || original.contractorId) !== item.contractorId ||
            (original.categoryId?._id || original.categoryId) !== item.categoryId ||
            (original.projectId?._id || original.projectId) !== item.projectId;
            
          if (isChanged) {
             updates.push(mainStore.updateOperation(item._id, {
                 date: newDateObj,
                 amount: -Math.abs(item.amount),
                 contractorId: item.contractorId,
                 categoryId: item.categoryId,
                 projectId: item.projectId,
                 type: 'act'
             }));
          }
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
    showDeleteConfirm.value = false;
    itemToDelete.value = null;
  } catch (e) {
    alert('Ошибка при удалении: ' + e.message);
  } finally {
    isDeleting.value = false;
  }
};
const cancelDelete = () => { if (isDeleting.value) return; showDeleteConfirm.value = false; itemToDelete.value = null; };

const openCreatePopup = () => { isCreatePopupVisible.value = true; };
const handleTransferComplete = async (eventData) => {
  isCreatePopupVisible.value = false;
  await mainStore.fetchAllEntities();
  if (eventData?.dateKey) await mainStore.refreshDay(eventData.dateKey);
  loadItems();
};

const getTotalClass = (val) => {
    if (val > 0) return 'total-income'; // Хотя переводы технически нейтральны, оставим позитивный цвет
    return 'total-neutral'; 
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      
      <div class="popup-header">
        <h3>{{ title }}</h3>
      </div>
      
      <p class="editor-hint">
        Редактируйте параметры. Нажмите на корзину для удаления.
      </p>
      
      <div class="create-section">
        <button class="btn-add-new" @click="openCreatePopup">
          {{ createButtonText }}
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

      <!-- ФИЛЬТРЫ (Фикс сетки: Дата первая) -->
      <div class="filters-row table-grid" :class="{ 'act-grid': mode === 'act' }">
        <div class="filter-col col-date">
           <input type="date" v-model="filters.date" class="filter-input" />
        </div>
        
        <template v-if="mode === 'transfer'">
            <div class="filter-col col-owner">
               <select v-model="filters.fromOwner" class="filter-input filter-select">
                  <option value="">Все (От)</option>
                  <optgroup label="Компании">
                      <option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option>
                  </optgroup>
                  <optgroup label="Физлица">
                      <option v-for="i in individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option>
                  </optgroup>
               </select>
            </div>
            <div class="filter-col col-acc">
               <select v-model="filters.fromAccount" class="filter-input filter-select">
                  <option value="">Все (От)</option>
                  <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
               </select>
            </div>
            <div class="filter-col col-amount">
               <input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма..." />
            </div>
            <div class="filter-col col-acc">
               <select v-model="filters.toAccount" class="filter-input filter-select">
                  <option value="">Все (Куда)</option>
                  <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
               </select>
            </div>
            <div class="filter-col col-owner">
               <select v-model="filters.toOwner" class="filter-input filter-select">
                  <option value="">Все (Куда)</option>
                  <optgroup label="Компании">
                      <option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option>
                  </optgroup>
                  <optgroup label="Физлица">
                      <option v-for="i in individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option>
                  </optgroup>
               </select>
            </div>
        </template>
        
        <template v-else>
            <div class="filter-col col-contr">
               <select v-model="filters.contractor" class="filter-input filter-select">
                  <option value="">Все Контрагенты</option>
                  <option v-for="c in contractors" :key="c._id" :value="c._id">{{ c.name }}</option>
               </select>
            </div>
            <div class="filter-col col-cat">
               <select v-model="filters.category" class="filter-input filter-select">
                  <option value="">Все Категории</option>
                  <option v-for="c in availableCategories" :key="c._id" :value="c._id">{{ c.name }}</option>
               </select>
            </div>
            <div class="filter-col col-proj">
               <select v-model="filters.project" class="filter-input filter-select">
                  <option value="">Все Проекты</option>
                  <option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option>
               </select>
            </div>
            <div class="filter-col col-amount">
               <input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма..." />
            </div>
        </template>

        <div class="filter-col col-trash"></div>
      </div>

      <!-- ЗАГОЛОВКИ -->
      <div class="grid-header table-grid" :class="{ 'act-grid': mode === 'act' }">
        <span class="col-date">Дата</span>
        
        <template v-if="mode === 'transfer'">
            <span class="col-owner">Отправитель</span>
            <span class="col-acc">Счет (От)</span>
            <span class="col-amount">Сумма</span>
            <span class="col-acc">Счет (Куда)</span>
            <span class="col-owner">Получатель</span>
        </template>
        
        <template v-else>
            <span class="col-contr">Контрагент</span>
            <span class="col-cat">Категория</span>
            <span class="col-proj">Проект</span>
            <span class="col-amount">Сумма</span>
        </template>

        <span class="col-trash"></span>
      </div>
      
      <!-- СПИСОК -->
      <div class="list-scroll">
        <div v-if="localItems.length === 0" class="empty-state">
          {{ emptyStateText }}
        </div>
        <div v-else-if="filteredItems.length === 0" class="empty-state">
            Нет записей по фильтру.
        </div>

        <div v-for="item in filteredItems" :key="item._id" class="grid-row table-grid" :class="{ 'act-grid': mode === 'act' }">
          
          <div class="col-date">
            <input type="date" v-model="item.date" class="edit-input date-input" />
          </div>

          <template v-if="mode === 'transfer'">
              <div class="col-owner">
                 <select v-model="item.fromOwnerId" class="edit-input select-input">
                    <option :value="null">-</option>
                    <optgroup label="Компании">
                       <option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option>
                    </optgroup>
                    <optgroup label="Физлица">
                       <option v-for="i in individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option>
                    </optgroup>
                 </select>
              </div>
    
              <div class="col-acc">
                <select v-model="item.fromAccountId" @change="onAccountChange(item, 'from')" class="edit-input select-input">
                   <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
                </select>
              </div>
    
              <div class="col-amount">
                <input type="text" v-model="item.amountFormatted" @input="onAmountInput(item)" class="edit-input amount-input" />
              </div>
    
              <div class="col-acc">
                <select v-model="item.toAccountId" @change="onAccountChange(item, 'to')" class="edit-input select-input">
                   <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
                </select>
              </div>
    
              <div class="col-owner">
                 <select v-model="item.toOwnerId" class="edit-input select-input">
                    <option :value="null">-</option>
                    <optgroup label="Компании">
                       <option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option>
                    </optgroup>
                    <optgroup label="Физлица">
                       <option v-for="i in individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option>
                    </optgroup>
                 </select>
              </div>
          </template>
          
          <template v-else>
              <div class="col-contr">
                 <select v-model="item.contractorId" @change="onContractorChange(item)" class="edit-input select-input">
                    <option :value="null">-</option>
                    <option v-for="c in contractors" :key="c._id" :value="c._id">{{ c.name }}</option>
                 </select>
              </div>
              <div class="col-cat">
                 <select v-model="item.categoryId" class="edit-input select-input">
                    <option :value="null">-</option>
                    <option v-for="c in availableCategories" :key="c._id" :value="c._id">{{ c.name }}</option>
                 </select>
              </div>
              <div class="col-proj">
                 <select v-model="item.projectId" class="edit-input select-input">
                    <option :value="null">-</option>
                    <option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option>
                 </select>
              </div>
              <div class="col-amount">
                <input type="text" v-model="item.amountFormatted" @input="onAmountInput(item)" class="edit-input amount-input" />
              </div>
          </template>

          <div class="col-trash">
            <button class="delete-btn" @click="askDelete(item)" title="Удалить">
               <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
               </svg>
            </button>
          </div>

        </div>
      </div>

      <div class="popup-footer">
        <button class="btn-close" @click="$emit('close')">Отмена</button>
        <button class="btn-save" @click="handleSave" :disabled="isSaving">
          {{ isSaving ? 'Сохранение...' : 'Сохранить изменения' }}
        </button>
      </div>

    </div>

    <TransferPopup
      v-if="isCreatePopupVisible"
      :date="new Date()"
      :cellIndex="0"
      :initialMode="mode"
      @close="isCreatePopupVisible = false"
      @transfer-complete="handleTransferComplete"
    />

    <div v-if="showDeleteConfirm" class="inner-overlay" @click.self="cancelDelete">
      <div class="delete-confirm-box">
        <div v-if="isDeleting" class="deleting-state">
          <h4>Удаление...</h4><p class="sub-note">Пожалуйста, подождите.</p><div class="progress-container"><div class="progress-bar"></div></div>
        </div>
        <div v-else>
          <h4>Подтвердите удаление</h4>
          <p class="confirm-text" v-if="itemToDelete">
            Удалить элемент от <b>{{ formatDateReadable(itemToDelete.date) }}</b><br>
            на сумму <b>{{ itemToDelete.amountFormatted }} ₸</b>?
          </p>
          <div class="delete-actions">
            <button class="btn-cancel" @click="cancelDelete">Отмена</button>
            <button class="btn-delete-confirm" @click="confirmDelete">Удалить</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1200; overflow-y: auto; }
.popup-content { background: #F4F4F4; border-radius: 12px; display: flex; flex-direction: column; max-height: 85vh; margin: 2rem 1rem; box-shadow: 0 15px 40px rgba(0,0,0,0.3); width: 95%; max-width: 1300px; }

.popup-header { padding: 1.2rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 20px; color: #1a1a1a; font-weight: 600; }
.editor-hint { padding: 0 1.5rem; font-size: 0.85em; color: #666; margin-bottom: 1rem; margin-top: 0; }

.create-section { margin: 0 1.5rem 1rem 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #e0e0e0; }
.btn-add-new { width: 100%; padding: 10px; border: 1px dashed #aaa; background-color: transparent; border-radius: 8px; color: #555; font-size: 14px; cursor: pointer; transition: all 0.2s; }
.btn-add-new:hover { border-color: #222; color: #222; background-color: #e9e9e9; }

.totals-bar { display: flex; justify-content: flex-start; gap: 30px; padding: 0 1.5rem 1rem; margin-bottom: 0.5rem; border-bottom: 1px solid #e0e0e0; }
.total-item { font-size: 15px; color: #333; }
.total-label { margin-right: 8px; color: #666; }
.total-value { font-weight: 700; }
.total-income { color: var(--color-primary); }
.total-expense { color: var(--color-danger); }
.total-neutral { color: var(--color-text); }

/* --- 🟢 COMPACT GRID & ZEBRA STRIPING --- */
/* Общий класс сетки для TransferListEditor */
.table-grid {
    display: grid;
    /* Default (Transfer): Date(120) Owner(1fr) Acc(1fr) Amount(100) Acc(1fr) Owner(1fr) Trash(40) */
    grid-template-columns: 120px 1fr 1fr 100px 1fr 1fr 40px;
    gap: 6px;
    align-items: center;
    padding: 4px 1.5rem;
}
/* Переопределение для Act */
.table-grid.act-grid {
    /* Date(120) Contr(1fr) Cat(1fr) Proj(1fr) Amount(100) Trash(40) */
    grid-template-columns: 120px 1fr 1fr 1fr 100px 40px;
}

.filters-row { 
    margin-bottom: 4px; 
    padding-bottom: 4px;
    border-bottom: 1px solid #e0e0e0;
    background-color: #f0f0f0;
    padding-top: 8px;
}

.grid-header { 
    font-size: 0.75em; 
    color: #888; 
    font-weight: 600; 
    text-transform: uppercase; 
    padding-bottom: 4px;
}

/* Стили строк */
.grid-row { 
    background-color: #fff;
    border: none;
    border-radius: 0;
}

/* Чередование (Зебра) - четные строки серые */
.grid-row:nth-child(even) {
    background-color: #f7f7f7;
}

/* Скролл контейнер */
.list-scroll { 
    flex-grow: 1; 
    overflow-y: auto; 
    padding-bottom: 0; 
    border-top: 1px solid #e0e0e0; 
    background-color: #fff; 
}

.filter-input, .edit-input { 
    width: 100%; 
    height: 32px; /* Компактная высота */
    border: 1px solid transparent; 
    border-radius: 4px; 
    padding: 0 6px; 
    font-size: 0.85em; 
    color: #333; 
    box-sizing: border-box; 
    background-color: transparent; 
    margin: 0; 
}

.filter-input {
    background-color: #fff;
    border-color: #ccc;
}

.edit-input:hover { border-color: #ddd; background-color: #fff; }
.edit-input:focus { outline: none; border-color: #222; background-color: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.1); }

.filter-select, .select-input { 
    -webkit-appearance: none; appearance: none; 
    background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); 
    background-repeat: no-repeat; 
    background-position: right 6px center; 
    padding-right: 18px; 
}

.amount-input { text-align: right; font-weight: 600; }
.is-income { color: var(--color-primary); }
.is-expense { color: var(--color-danger); }

.delete-btn { width: 32px; height: 32px; border: none; background: transparent; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; padding: 0; }
.delete-btn svg { width: 16px; height: 16px; stroke: #bbb; }
.delete-btn:hover { background: #fee; }
.delete-btn:hover svg { stroke: #ff3b30; }

.popup-footer { padding: 1rem 1.5rem; border-top: 1px solid #E0E0E0; display: flex; justify-content: flex-end; gap: 10px; background-color: #F9F9F9; border-radius: 0 0 12px 12px; }
.btn-close { padding: 10px 20px; border: 1px solid #ccc; background: transparent; border-radius: 6px; cursor: pointer; font-weight: 500; color: #555; font-size: 14px; }
.btn-close:hover { background: #eee; }
.btn-save { padding: 10px 20px; border: none; background: #222; border-radius: 6px; cursor: pointer; font-weight: 600; color: #fff; font-size: 14px; }
.btn-save:hover:not(:disabled) { background: #444; }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
.empty-state { text-align: center; padding: 2rem; color: #888; }

@media (max-width: 1400px) {
  .table-grid { grid-template-columns: 110px 1fr 1fr 90px 1fr 1fr 36px; }
  .table-grid.act-grid { grid-template-columns: 110px 1fr 1fr 1fr 90px 36px; }
}
@media (max-width: 1100px) {
  .popup-content { max-width: 98vw; margin: 0.5rem; }
  .grid-header, .filters-row { display: none; } 
  .grid-row { display: flex; flex-direction: column; height: auto; padding: 1rem; gap: 8px; border-bottom: 1px solid #eee; }
  .grid-row:nth-child(even) { background-color: #fff; }
  .grid-row > div { width: 100%; }
  .edit-input { height: 40px; border: 1px solid #e0e0e0; background-color: #fff; }
}

/* Модалки */
.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 1210; }
.delete-confirm-box { background: #fff; padding: 24px; border-radius: 12px; width: 320px; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.2); }
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
