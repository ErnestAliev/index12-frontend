<script setup>
import { ref, computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import TransferPopup from './TransferPopup.vue'; 
import DateRangePicker from './DateRangePicker.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v26.12 - READ ONLY TRANSFERS ---
 * * ВЕРСИЯ: 26.12 - Инпуты и селекты в списке заменены на текстовые значения.
 * * ДАТА: 2025-12-01
 */

const props = defineProps({
  title: { type: String, default: 'Редактировать переводы' },
  widgetKey: { type: String, default: null }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const localItems = ref([]);
const isCreatePopupVisible = ref(false);
const isDeleting = ref(false);
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);

const accounts = computed(() => mainStore.accounts);
const companies = computed(() => mainStore.companies);
const individuals = computed(() => mainStore.individuals);

// 🟢 Фильтры для переводов
const filters = ref({
  dateRange: { from: null, to: null },
  amount: '',
  fromAccount: '',
  toAccount: '',
  fromOwner: '',
  toOwner: ''
});

// --- ХЕЛПЕРЫ ДЛЯ ОТОБРАЖЕНИЯ ТЕКСТА ---

// Форматирование даты для вывода (DD.MM.YYYY)
const formatDateDisplay = (isoDateString) => {
  if (!isoDateString) return '-';
  const [year, month, day] = isoDateString.split('-'); 
  return `${day}.${month}.${year}`;
};

// Форматирование даты для диалога удаления
const formatDateReadable = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  return d.toLocaleDateString('ru-RU');
};

// Получение имени владельца
const getOwnerName = (ownerId) => {
    if (!ownerId) return '-';
    const [type, id] = ownerId.split('-');
    if (type === 'company') {
        const c = companies.value.find(x => x._id === id);
        return c ? c.name : '-';
    } else if (type === 'individual') {
        const i = individuals.value.find(x => x._id === id);
        return i ? i.name : '-';
    }
    return '-';
};

// Получение имени счета
const getAccountName = (accId) => {
    const acc = accounts.value.find(a => a._id === accId);
    return acc ? acc.name : '-';
};

// --- ЛОГИКА ЗАГРУЗКИ ---

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

const loadTransfers = () => {
  const allOps = mainStore.allOperationsFlat;
  const onlyTransfers = allOps.filter(op => 
    op.type === 'transfer' || 
    op.isTransfer === true || 
    (op.isWithdrawal === true && op.transferPurpose === 'personal' && op.transferReason === 'personal_use') ||
    (op.categoryId && (op.categoryId.name === 'Перевод' || op.categoryId.name === 'Transfer'))
  );

  localItems.value = onlyTransfers
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(t => {
      const fromOwnerId = getOwnerId(t.fromCompanyId, t.fromIndividualId);
      const toOwnerId = getOwnerId(t.toCompanyId, t.toIndividualId);

      return {
        _id: t._id,
        originalOp: t,
        categoryDetail: mainStore.getOperationCategoryLabel(t, 'Перевод'),
        subcategoryName: mainStore.getOperationSubcategoryName(t),
        date: toInputDate(t.date), // YYYY-MM-DD для сортировки и фильтров
        amount: Math.abs(t.amount),
        amountFormatted: formatNumber(Math.abs(t.amount)),
        fromAccountId: t.fromAccountId?._id || t.fromAccountId,
        fromOwnerId: fromOwnerId,
        toAccountId: t.toAccountId?._id || t.toAccountId,
        toOwnerId: toOwnerId,
        isDeleted: false
      };
    });
};

onMounted(() => {
  loadTransfers();
});

// 🟢 Логика фильтрации
const filteredItems = computed(() => {
  return localItems.value.filter(item => {
    if (item.isDeleted) return false;

    // Даты
    const { from, to } = filters.value.dateRange;
    if (from && item.date < from) return false;
    if (to && item.date > to) return false;

    // Сумма
    if (filters.value.amount) {
        const searchAmount = filters.value.amount.replace(/\s/g, '');
        const itemAmount = String(item.amount);
        if (!itemAmount.includes(searchAmount)) return false;
    }

    // Счета
    if (filters.value.fromAccount && item.fromAccountId !== filters.value.fromAccount) return false;
    if (filters.value.toAccount && item.toAccountId !== filters.value.toAccount) return false;

    // Владельцы
    if (filters.value.fromOwner && item.fromOwnerId !== filters.value.fromOwner) return false;
    if (filters.value.toOwner && item.toOwnerId !== filters.value.toOwner) return false;

    return true;
  });
});

const isFilterActive = computed(() => {
    const f = filters.value;
    return f.dateRange.from !== null || f.dateRange.to !== null || 
           f.amount !== '' || f.fromAccount !== '' || f.toAccount !== '' || 
           f.fromOwner !== '' || f.toOwner !== '';
});

const totalSum = computed(() => filteredItems.value.reduce((acc, item) => acc + (item.amount || 0), 0));
const formatTotal = (val) => formatNumber(Math.abs(val)) + ' ₸';

// Summary bar (aligns with доходы/расходы tabs)
const filteredCount = computed(() => filteredItems.value.length);
const filteredTotalText = computed(() => `${formatNumber(totalSum.value)} KZT`);

// Экспорт и копирование
const showCopySuccess = ref(false);

const exportToCSV = () => {
  if (filteredItems.value.length === 0) {
    alert('Нет данных для экспорта');
    return;
  }

  const headers = ['Дата', 'Отправитель', 'Счет От', 'Сумма', 'Счет Куда', 'Получатель', 'Категория / Подкатегория'];
  const rows = filteredItems.value.map(item => [
    formatDateDisplay(item.date),
    getOwnerName(item.fromOwnerId),
    getAccountName(item.fromAccountId),
    item.amountFormatted,
    getAccountName(item.toAccountId),
    getOwnerName(item.toOwnerId),
    item.categoryDetail
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('href', url);
  link.setAttribute('download', `transfers_${dateStr}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const copyToClipboard = async () => {
  if (filteredItems.value.length === 0) {
    alert('Нет данных для копирования');
    return;
  }

  let periodLabel = '';
  const { from, to } = filters.value.dateRange;
  if (from && to) {
    periodLabel = `${new Date(from).toLocaleDateString('ru-RU')} - ${new Date(to).toLocaleDateString('ru-RU')}`;
  } else if (from) {
    periodLabel = `с ${new Date(from).toLocaleDateString('ru-RU')}`;
  } else if (to) {
    periodLabel = `до ${new Date(to).toLocaleDateString('ru-RU')}`;
  } else {
    periodLabel = 'все время';
  }

  let message = `Переводы (${periodLabel})\n`;
  message += `━━━━━━━━━━━━━━━━━━\n`;
  message += `Всего переводов: ${filteredCount.value}\n`;
  message += `Итого: ${filteredTotalText.value}\n`;
  message += `━━━━━━━━━━━━━━━━━━\n`;

  filteredItems.value.forEach((item, index) => {
    const parts = [];
    parts.push(`[${formatDateDisplay(item.date)}]`);
    parts.push(`${item.amountFormatted} т`);

    const routeAccounts = `${getAccountName(item.fromAccountId)} → ${getAccountName(item.toAccountId)}`;
    parts.push(routeAccounts);

    const fromOwner = getOwnerName(item.fromOwnerId);
    const toOwner = getOwnerName(item.toOwnerId);
    if (fromOwner !== '-' || toOwner !== '-') {
      parts.push(`${fromOwner} → ${toOwner}`);
    }

    message += `${index + 1}. ${parts.join(' < ')}\n`;
  });

  try {
    await navigator.clipboard.writeText(message);
    showCopySuccess.value = true;
    setTimeout(() => (showCopySuccess.value = false), 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Ошибка копирования в буфер обмена');
  }
};

const openCreatePopup = () =>{
  isCreatePopupVisible.value = true;
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

const handleTransferSave = async ({ mode, id, data }) => {
  try {
    if (mode === 'create') {
      if (data.cellIndex === undefined) {
        const dateKey = mainStore._getDateKey(new Date(data.date));
        data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey);
      }
      await mainStore.createTransfer(data);
    } else {
      await mainStore.updateTransfer(id, data);
    }

    isCreatePopupVisible.value = false;
    await mainStore.fetchAllEntities();
    const dateKey = data?.date ? mainStore._getDateKey(new Date(data.date)) : null;
    if (dateKey) await mainStore.refreshDay(dateKey);
    loadTransfers();
  } catch (e) {
    console.error(e);
    alert('Ошибка сохранения перевода');
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
  } catch (e) {
    console.error(e);
    alert('Ошибка при удалении: ' + e.message);
  } finally {
    isDeleting.value = false;
  }
};
const cancelDelete = () => { if (isDeleting.value) return; showDeleteConfirm.value = false; itemToDelete.value = null; };
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      <div class="popup-header">
        <div class="header-row">
          <div class="header-with-toggle">
            <h3>{{ title }}</h3>
            <button v-if="widgetKey && isWidgetOnDashboard !== null" class="widget-toggle-btn" @click.stop="toggleWidgetOnDashboard" :title="isWidgetOnDashboard ? 'Скрыть' : 'Показать'">
              <svg v-if="isWidgetOnDashboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              <span class="toggle-label">{{ isWidgetOnDashboard ? 'На столе' : 'Скрыт' }}</span>
            </button>
          </div>

          <div class="export-buttons">
            <button class="export-btn" @click="exportToCSV" title="Экспорт в CSV">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              CSV
            </button>
            
            <button class="export-btn copy-btn" @click="copyToClipboard" title="Копировать для WhatsApp">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Копировать
            </button>
            
            <transition name="fade">
              <div v-if="showCopySuccess" class="copy-success">✓ Скопировано!</div>
            </transition>
          </div>

          <div class="summary-bar" :title="`Переводов: ${filteredCount}`">
            <span class="summary-label">Итого:</span>
            <span class="summary-value">{{ filteredTotalText }}</span>
            <span class="summary-count">({{ filteredCount }})</span>
          </div>
        </div>
      </div>
     
      
      <!-- ИТОГИ ПО ФИЛЬТРУ -->
      <div class="totals-bar" v-if="isFilterActive">
          <div class="total-item">
              <span class="total-label">Оборот (по фильтру):</span>
              <span class="total-value">{{ formatTotal(totalSum) }}</span>
          </div>
      </div>

      <!-- 🟢 ПАНЕЛЬ ФИЛЬТРОВ (Остаются инпутами для поиска) -->
      <div class="filters-row">
        <!-- Дата -->
        <div class="filter-col col-date">
           <DateRangePicker 
             v-model="filters.dateRange"
             placeholder="Период"
           />
        </div>
        
        <!-- Отправитель -->
        <div class="filter-col col-owner">
           <select v-model="filters.fromOwner" class="filter-input filter-select">
              <option value="">Отправитель (Все)</option>
              <optgroup label="Компании"><option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option></optgroup>
              <optgroup label="Физлица"><option v-for="i in individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option></optgroup>
           </select>
        </div>

        <!-- Счет От -->
        <div class="filter-col col-acc">
           <select v-model="filters.fromAccount" class="filter-input filter-select">
              <option value="">Счет От (Все)</option>
              <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
           </select>
        </div>

        <!-- Сумма -->
        <div class="filter-col col-amount">
           <input type="text" v-model="filters.amount" class="filter-input" placeholder="Сумма..." />
        </div>

        <!-- Счет Куда -->
        <div class="filter-col col-acc">
           <select v-model="filters.toAccount" class="filter-input filter-select">
              <option value="">Счет Куда (Все)</option>
              <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
           </select>
        </div>

        <!-- Получатель -->
        <div class="filter-col col-owner">
           <select v-model="filters.toOwner" class="filter-input filter-select">
              <option value="">Получатель (Все)</option>
              <optgroup label="Компании"><option v-for="c in companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option></optgroup>
              <optgroup label="Физлица"><option v-for="i in individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option></optgroup>
           </select>
        </div>

        <div class="filter-col col-trash"></div>
      </div>
      
      <!-- СПИСОК (ТЕПЕРЬ ТОЛЬКО ТЕКСТ) -->
      <div class="list-scroll">
        <div v-if="localItems.length === 0" class="empty-state">Нет переводов.</div>
        <div v-else-if="filteredItems.length === 0" class="empty-state">Нет переводов по фильтру.</div>

        <div v-for="item in filteredItems" :key="item._id" class="grid-row">
          <!-- Дата -->
          <div class="col-date">
              <span class="text-cell">{{ formatDateDisplay(item.date) }}</span><span v-if="item.subcategoryName" class="text-cell" :title="item.categoryDetail">{{ item.subcategoryName }}</span>
          </div>

          <!-- Отправитель -->
          <div class="col-owner">
             <span class="text-cell" :title="getOwnerName(item.fromOwnerId)">{{ getOwnerName(item.fromOwnerId) }}</span>
          </div>

          <!-- Счет От -->
          <div class="col-acc">
            <span class="text-cell" :title="getAccountName(item.fromAccountId)">{{ getAccountName(item.fromAccountId) }}</span>
          </div>

          <!-- Сумма -->
          <div class="col-amount">
              <span class="text-cell amount-text">{{ item.amountFormatted }}</span>
          </div>

          <!-- Счет Куда -->
          <div class="col-acc">
            <span class="text-cell" :title="getAccountName(item.toAccountId)">{{ getAccountName(item.toAccountId) }}</span>
          </div>

          <!-- Получатель -->
          <div class="col-owner">
             <span class="text-cell" :title="getOwnerName(item.toOwnerId)">{{ getOwnerName(item.toOwnerId) }}</span>
          </div>

          <div class="col-trash">
            <button class="delete-btn" @click="askDelete(item)" title="Удалить">
               <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="popup-footer">
        <div class="footer-left-actions">
          <button class="btn-add-new-footer btn-transfer" @click="openCreatePopup">
            + Создать перевод
          </button>
        </div>
        
        <div class="footer-actions">
            <button class="btn-close" @click="$emit('close')">Закрыть</button>
            <!-- Кнопка "Сохранить" удалена -->
        </div>
      </div>
    </div>

    <TransferPopup v-if="isCreatePopupVisible" :date="new Date()" :cellIndex="0" @close="isCreatePopupVisible = false" @save="handleTransferSave" />
    
    <div v-if="showDeleteConfirm" class="inner-overlay" @click.self="cancelDelete">
      <div class="delete-confirm-box">
        <div v-if="isDeleting" class="deleting-state"><h4>Удаление...</h4><p class="sub-note">Пожалуйста, подождите, обновляем данные.</p><div class="progress-container"><div class="progress-bar"></div></div></div>
        <div v-else>
          <h4>Подтвердите удаление</h4>
          <p class="confirm-text" v-if="itemToDelete">Вы действительно хотите удалить перевод от <b>{{ formatDateReadable(itemToDelete.date) }}</b><br>на сумму <b>{{ itemToDelete.amountFormatted }} ₸</b>?</p>
          <div class="delete-actions"><button class="btn-cancel" @click="cancelDelete">Отмена</button><button class="btn-delete-confirm" @click="confirmDelete">Удалить</button></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 3500; overflow-y: auto; }
.popup-content { background: var(--color-background); border-radius: 12px; display: flex; flex-direction: column; height: 50vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 95%; max-width: 1200px; border: 1px solid var(--color-border); }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 22px; color: var(--color-heading); font-weight: 700; }
.header-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.header-with-toggle { display: flex; align-items: center; gap: 16px; }
.widget-toggle-btn { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--color-background); border: 1px solid var(--color-border); border-radius: 8px; cursor: pointer; transition: all 0.2s; font-size: 13px; color: var(--color-text-soft); }
.widget-toggle-btn:hover { border-color: var(--color-primary); background: var(--color-background-mute); }
.widget-toggle-btn svg { width: 16px; height: 16px; flex-shrink: 0; }
.widget-toggle-btn .toggle-label { font-weight: 500; }
.editor-hint { padding: 0 1.5rem; font-size: 0.9em; color: var(--color-text-soft); margin-bottom: 1.5rem; margin-top: 0; }

.totals-bar { display: flex; justify-content: flex-start; gap: 30px; padding: 0 1.5rem 1rem; margin-bottom: 1rem; border-bottom: 1px solid var(--color-border); align-items: baseline; }
.total-item { font-size: 16px; color: var(--color-text); }
.total-label { margin-right: 8px; color: var(--color-text-soft); font-weight: 500; }
.total-value { font-weight: 800; font-size: 1.3em; }

.export-buttons { display: flex; align-items: center; gap: 8px; position: relative; }
.export-btn { display: flex; align-items: center; gap: 6px; padding: 6px 12px; height: 32px; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--color-text); cursor: pointer; transition: all 0.2s; white-space: nowrap; }
.export-btn svg { width: 16px; height: 16px; stroke: var(--color-text-soft); transition: stroke 0.2s; }
.export-btn:hover { background: var(--color-background-mute); border-color: #10b981; color: #10b981; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1); }
.export-btn:hover svg { stroke: #10b981; }
.export-btn:active { transform: scale(0.98); }
.copy-success { position: absolute; right: 0; top: -30px; background: #10b981; color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); white-space: nowrap; z-index: 1000; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.summary-bar { display: flex; align-items: baseline; gap: 8px; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 10px; padding: 6px 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); white-space: nowrap; }
.summary-label { font-size: 12px; color: var(--color-text-soft); font-weight: 600; }
.summary-value { font-size: 14px; color: var(--color-heading); font-weight: 800; font-variant-numeric: tabular-nums; }
.summary-count { font-size: 12px; color: var(--color-text-soft); font-weight: 600; }

/* Grid System for Transfers */
.filters-row, .grid-row { 
  display: grid; 
  grid-template-columns: 130px 1fr 1fr 120px 1fr 1fr 50px; 
  gap: 12px; 
  align-items: center; 
  padding: 0 1.5rem; 
}

.filters-row { margin-bottom: 10px; }

.grid-row { 
  padding: 8px 1.5rem; 
  background: var(--color-background-soft); 
  border: 1px solid var(--color-border); 
  border-radius: 8px;
  margin-bottom: 6px;
  transition: box-shadow 0.2s;
  min-height: 40px;
}
.grid-row:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  border-color: var(--color-border);
}

.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; scrollbar-width: none; -ms-overflow-style: none; }
.list-scroll::-webkit-scrollbar { display: none; }

/* Text Display Styles */
.text-cell { 
    display: block; 
    white-space: nowrap; 
    overflow: hidden; 
    text-overflow: ellipsis; 
    font-size: 13px; 
    color: var(--color-text); 
    line-height: 28px;
}
.amount-text {
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

/* Filter Inputs (28px) */
.filter-input { width: 100%; height: 28px; border: 1px solid var(--color-border); border-radius: 6px; padding: 0 6px; font-size: 13px; color: var(--color-text); box-sizing: border-box; background-color: var(--color-background-soft); margin: 0; }
.filter-select, .select-input { 
  -webkit-appearance: none; appearance: none; 
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); 
  background-repeat: no-repeat; background-position: right 10px center; 
  padding-right: 30px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; 
}
.filter-input:focus { outline: none; border-color: var(--color-primary); }

.delete-btn { 
  width: 28px; height: 28px; 
  border: 1px solid var(--color-border); background: var(--color-background); 
  border-radius: 6px; 
  display: flex; align-items: center; justify-content: center; 
  cursor: pointer; transition: all 0.2s; padding: 0; margin: 0; 
}
.delete-btn svg { width: 14px; height: 14px; stroke: var(--color-text-soft); }
.delete-btn:hover { border-color: #FF3B30; background: var(--color-background-mute); }
.delete-btn:hover svg { stroke: #FF3B30; }

/* Footer Styles */
.popup-footer { 
  padding: 1.5rem; border-top: 1px solid var(--color-border); 
  display: flex; justify-content: space-between;
  align-items: center;
  background-color: var(--color-background); border-radius: 0 0 12px 12px; 
}

.footer-actions {
    display: flex; 
    gap: 12px;
}

.btn-add-new-footer { 
  padding: 0 16px; height: 28px;
  border: 1px solid transparent; 
  border-radius: 6px; 
  color: #fff; 
  font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; 
  white-space: nowrap;
  display: flex; align-items: center; justify-content: center;
}

.btn-transfer { background-color: #2F3340; }
.btn-transfer:hover { background-color: #3a3f50; }

.btn-close { padding: 0 16px; height: 28px; border: 1px solid var(--color-border); background: var(--color-background-soft); border-radius: 6px; cursor: pointer; font-weight: 500; color: var(--color-text); font-size: 13px; display: flex; align-items: center; justify-content: center; }
.btn-close:hover { background: var(--color-background-mute); }

.empty-state { text-align: center; padding: 3rem; color: var(--color-text-soft); font-style: italic; }

@media (max-width: 1100px) {
  .header-row { flex-direction: column; align-items: flex-start; }
  .export-buttons { order: 2; }
  .summary-bar { order: 3; }
}

@media (max-width: 1200px) { 
  .popup-content { max-width: 95vw; margin: 1rem; } 
  .filters-row { display: none; }
  .grid-row { display: flex; flex-direction: column; height: auto; padding: 1rem; gap: 10px; } 
  .grid-row > div { width: 100%; } 
  .col-date, .col-amount, .col-trash { width: 100%; } 
  .delete-btn { width: 100%; margin-top: 5px; background-color: #FFF0F0; border-color: #FFD0D0; color: #FF3B30; } 
  .delete-btn svg { stroke: #FF3B30; } 
}

/* Confirmation */
.inner-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 1210; }
.delete-confirm-box { background: var(--color-background); padding: 24px; border-radius: 12px; width: 320px; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.2); }
.delete-confirm-box h4 { margin: 0 0 10px; color: var(--color-heading); font-size: 18px; font-weight: 600; }
.confirm-text { font-size: 14px; margin-bottom: 20px; color: var(--color-text); line-height: 1.5; }
.delete-actions { display: flex; gap: 10px; justify-content: center; }
.btn-cancel { background: var(--color-background-mute); color: var(--color-text); border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 500; }
.btn-cancel:hover { background: var(--color-border); }
.btn-delete-confirm { background: #ff3b30; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-delete-confirm:hover { background: #e02e24; }
.deleting-state { display: flex; flex-direction: column; align-items: center; padding: 1rem 0; }
.sub-note { font-size: 13px; color: var(--color-text-soft); margin-top: -5px; margin-bottom: 20px; }
.progress-container { width: 100%; height: 6px; background-color: var(--color-background-mute); border-radius: 3px; overflow: hidden; position: relative; }
.progress-bar { width: 100%; height: 100%; background-color: var(--color-heading); position: absolute; left: -100%; animation: indeterminate 1.5s infinite ease-in-out; }
@keyframes indeterminate { 0% { left: -100%; width: 50%; } 50% { left: 25%; width: 50%; } 100% { left: 100%; width: 50%; } }
</style>
