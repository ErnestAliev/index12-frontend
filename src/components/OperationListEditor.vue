<script setup>
import { ALL_PROJECTS } from '@/utils/projectScope';
import { ref, computed, onMounted, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { migrateWidgetKey } from '@/utils/dashboardWidgets.js';
import { formatNumber } from '@/utils/formatters.js';
// 🟢 1. ЗАМЕНА ИМПОРТОВ: Удален OperationPopup, добавлены Income/Expense
import IncomePopup from './IncomePopup.vue';
import ExpensePopup from './ExpensePopup.vue';
import DateRangePicker from './DateRangePicker.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v56.0 - POPUP FIX ---
 * * ВЕРСИЯ: 56.0 - Замена удаленного OperationPopup на Income/Expense
 * * ДАТА: 2025-12-03
 */

const props = defineProps({
  title: { type: String, default: 'Редактировать операции' },
  type: { type: String, required: true }, // 'income' | 'expense'
  widgetKey: { type: String, default: null } // Optional: corresponding widget key
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const localItems = ref([]);

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
const projects = computed(() => [{ _id: ALL_PROJECTS, name: 'Все проекты' }, ...mainStore.projects]);
const categories = computed(() => mainStore.categories.filter(c => !['перевод', 'transfer'].includes(c.name.toLowerCase())));
const companies = computed(() => mainStore.companies);
const individuals = computed(() => mainStore.individuals);

// Опции для фильтра (оставляем для верхнего бара)
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

// --- ХЕЛПЕРЫ ДЛЯ ОТОБРАЖЕНИЯ ТЕКСТА ---

// Форматирование даты для вывода (DD.MM.YYYY)
const formatDateDisplay = (isoDateString) => {
  if (!isoDateString) return '-';
  const [year, month, day] = isoDateString.split('-'); // item.date хранится как YYYY-MM-DD
  return `${day}.${month}.${year}`;
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

// Получение имени контрагента
const getContractorName = (contrValue) => {
    if (!contrValue) return '-';
    const [prefix, id] = contrValue.split('_');
    if (prefix === 'contr') {
        const c = mainStore.contractors.find(x => x._id === id);
        return c ? c.name : '-';
    } else if (prefix === 'ind') {
        const i = mainStore.individuals.find(x => x._id === id);
        return i ? i.name : '-';
    }
    return '-';
};

// Получение имени категории
const getCategoryName = (catId) => {
    const c = categories.value.find(x => x._id === catId);
    return c ? c.name : '-';
};

// Получение имени проекта
const getProjectName = (projId) => {
    if (Array.isArray(projId)) {
        const names = projId.map(id => {
            const found = projects.value.find(x => x._id === id);
            return found ? found.name : null;
        }).filter(Boolean);
        return names.length ? names.join(', ') : '-';
    }
    const p = projects.value.find(x => x._id === projId);
    return p ? p.name : '-';
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

const loadOperations = () => {
  const allOps = mainStore.allOperationsFlat;

  const targetOps = allOps.filter(op => {
    if (op.type !== props.type) return false; 
    if (op.isTransfer || op.isWithdrawal) return false;
    if (op.categoryId?.name?.toLowerCase() === 'перевод') return false;
    if (mainStore._isRetailWriteOff(op)) return false;
    // Показываем только родителя сплита (дочерние доли скрываем)
    if (op.isSplitChild) return false;

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
      const projectIdsArr = Array.isArray(op.projectIds)
        ? op.projectIds.map(id => typeof id === 'object' ? id._id : id).filter(Boolean)
        : [];
      const primaryProjectId = projectIdsArr.length ? projectIdsArr[0] : (op.projectId?._id || op.projectId);

      return {
        _id: op._id,
        originalOp: op,
        projectScope: op.projectScope,
        date: toInputDate(op.date),
        amount: amount,
        amountFormatted: formatNumber(amount),
        accountId: op.accountId?._id || op.accountId,
        ownerId: ownerId, 
        contractorValue: contrVal, 
        categoryId: op.categoryId?._id || op.categoryId,
        subcategoryId: op.subcategoryId?._id || op.subcategoryId,
        subcategoryName: mainStore.getOperationSubcategoryName(op),
        projectId: primaryProjectId,
        projectIds: op.projectScope === 'all' ? [ALL_PROJECTS] : projectIdsArr.length ? projectIdsArr : (primaryProjectId ? [primaryProjectId] : []),
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
    if (filters.value.project) {
        const arr = Array.isArray(item.projectIds) ? item.projectIds : (item.projectId ? [item.projectId] : []);
        if (!arr.includes(filters.value.project)) return false;
    }

    return true;
  });
});

// SUMMARY BAR (reactive totals for current filtered list)
const filteredCount = computed(() => filteredItems.value.length);

const filteredTotal = computed(() => {
  return filteredItems.value.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
});

const filteredTotalText = computed(() => `${formatNumber(filteredTotal.value)} KZT`);

// ACTIONS
const openCreatePopup = () => { isCreatePopupVisible.value = true; };

// Expose method for parent component
defineExpose({
  openCreatePopup
});

const dashboardWidgetKey = computed(() => migrateWidgetKey(props.widgetKey));
// --- WIDGET TOGGLE LOGIC ---
const isWidgetOnDashboard = computed(() => {
  if (!dashboardWidgetKey.value) return null;
  return mainStore.dashboardLayout.includes(dashboardWidgetKey.value);
});

const toggleWidgetOnDashboard = () => {
  if (!dashboardWidgetKey.value) return;
  
  if (isWidgetOnDashboard.value) {
    const newLayout = mainStore.dashboardLayout.filter(k => k !== dashboardWidgetKey.value);
    mainStore.dashboardLayout = newLayout;
  } else {
    mainStore.dashboardLayout = [...mainStore.dashboardLayout, dashboardWidgetKey.value];
  }
};

// 🟢 2. НОВЫЙ ОБРАБОТЧИК СОХРАНЕНИЯ
const handleSave = async ({ mode, data }) => {
    isCreatePopupVisible.value = false;
    try {
        // Этот редактор используется только для создания новых
        if (mode === 'create') {
             if (data.cellIndex === undefined) {
                 // Если cellIndex не задан, вычисляем первый свободный
                 const dateKey = mainStore._getDateKey(new Date(data.date));
                 data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey);
             }
             await mainStore.createEvent(data);
        }
        // Перезагрузка списка произойдет автоматически через watcher allOperationsFlat
    } catch (e) {
        console.error(e);
        alert('Ошибка при сохранении: ' + e.message);
    }
};

const askDelete = (item) => { itemToDelete.value = item; showDeleteConfirm.value = true; };
const confirmDelete = async () => { if (!itemToDelete.value) return; isDeleting.value = true; try { await mainStore.deleteOperation(itemToDelete.value.originalOp); itemToDelete.value.isDeleted = true; showDeleteConfirm.value = false; } catch (e) { alert(e.message); } finally { isDeleting.value = false; } };

// EXPORT AND COPY FUNCTIONALITY
const exportToCSV = () => {
    if (filteredItems.value.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }

    // CSV Header
    const headers = ['Дата', 'Владелец', 'Счет', 'Сумма', 'Контрагент', 'Категория', 'Подкатегория', 'Проект'];
    
    // CSV Rows
    const rows = filteredItems.value.map(item => {
        return [
            formatDateDisplay(item.date),
            getOwnerName(item.ownerId),
            getAccountName(item.accountId),
            item.amountFormatted,
            getContractorName(item.contractorValue),
            getCategoryName(item.categoryId),
            item.subcategoryName || 'Без подкатегории',
            getProjectName(item.projectIds || item.projectId)
        ];
    });

    // Combine headers and rows
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const typeLabel = props.type === 'income' ? 'доходы' : 'расходы';
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `${typeLabel}_${dateStr}.csv`);
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

    const typeLabel = props.type === 'income' ? 'Доходы' : 'Расходы';
    
    // Определяем период на основе фильтров
    let periodLabel = '';
    const { from, to } = filters.value.dateRange;
    if (from && to) {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        periodLabel = `${fromDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })} - ${toDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    } else if (from) {
        periodLabel = `с ${new Date(from).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    } else if (to) {
        periodLabel = `до ${new Date(to).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    } else {
        periodLabel = 'все время';
    }
    
    // Compact format without emojis
    let message = `${typeLabel} (${periodLabel})\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `Всего операций: ${filteredCount.value}\n`;
    message += `Итого: ${filteredTotalText.value}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;

    filteredItems.value.forEach((item, index) => {
        const parts = [];
        
        // Дата
        parts.push(`[${formatDateDisplay(item.date)}]`);
        
        // Сумма с знаком
        const sign = props.type === 'income' ? '+' : '-';
        parts.push(`${sign}${item.amountFormatted} т`);
        
        // Счет
        const accountName = getAccountName(item.accountId);
        if (accountName !== '-') {
            parts.push(accountName);
        }
        
        // Владелец
        const ownerName = getOwnerName(item.ownerId);
        if (ownerName !== '-') {
            parts.push(ownerName);
        }
        
        // Контрагент
        const contractorName = getContractorName(item.contractorValue);
        if (contractorName !== '-') {
            parts.push(contractorName);
        }
        
        // Категория
        const categoryName = getCategoryName(item.categoryId);
        if (categoryName !== '-') {
            parts.push(categoryName);
        }
        
        // Проект
        const projectName = getProjectName(item.projectIds || item.projectId);
        if (projectName !== '-') {
            parts.push(projectName);
        }
        
        // Формируем строку
        message += `${index + 1}. ${parts.join(' < ')}\n`;
    });

    try {
        await navigator.clipboard.writeText(message);
        showCopySuccess.value = true;
        setTimeout(() => {
            showCopySuccess.value = false;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Ошибка копирования в буфер обмена');
    }
};

const showCopySuccess = ref(false);

</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      <div class="popup-header">
        <div class="header-row">
          <div class="header-with-toggle">
            <h3>{{ title }}</h3>
            <button 
              v-if="widgetKey && isWidgetOnDashboard !== null"
              class="widget-toggle-btn"
              @click.stop="toggleWidgetOnDashboard"
              :title="isWidgetOnDashboard ? 'Скрыть виджет с рабочего стола' : 'Показать виджет на рабочем столе'"
            >
              <svg v-if="isWidgetOnDashboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
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

          <div class="summary-bar" :title="`Операций: ${filteredCount}`">
            <span class="summary-label">Итого:</span>
            <span class="summary-value">{{ filteredTotalText }}</span>
            <span class="summary-count">({{ filteredCount }})</span>
          </div>
        </div>
      </div>

      <!-- FILTERS (Остаются инпутами для поиска) -->
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

      <!-- LIST (Теперь только текст) -->
      <div class="list-scroll">
        <div v-if="filteredItems.length === 0" class="empty-state">Операций не найдено.</div>

        <div v-for="item in filteredItems" :key="item._id" class="grid-row">
            <!-- Дата -->
            <div class="col-date">
                <span class="text-cell">{{ formatDateDisplay(item.date) }}</span>
            </div>

            <!-- Владелец -->
            <div class="col-owner">
                <span class="text-cell" :title="getOwnerName(item.ownerId)">{{ getOwnerName(item.ownerId) }}</span>
            </div>

            <!-- Счет -->
            <div class="col-acc">
                <span class="text-cell" :title="getAccountName(item.accountId)">{{ getAccountName(item.accountId) }}</span>
            </div>

            <!-- Сумма -->
            <div class="col-amount">
                <span class="text-cell amount-text">{{ item.amountFormatted }}</span>
            </div>

            <!-- Контрагент -->
            <div class="col-contr">
                <span class="text-cell" :title="getContractorName(item.contractorValue)">{{ getContractorName(item.contractorValue) }}</span>
            </div>

            <!-- Категория -->
            <div class="col-cat">
                <span class="text-cell" :title="getCategoryName(item.categoryId)">{{ getCategoryName(item.categoryId) }}<template v-if="item.subcategoryName"> → {{ item.subcategoryName }}</template></span>
            </div>

            <!-- Проект -->
            <div class="col-proj">
                <span class="text-cell" :title="getProjectName(item.projectIds || item.projectId)">{{ getProjectName(item.projectIds || item.projectId) }}</span>
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
            <button class="btn-add-new-footer btn-income" @click="openCreatePopup">+ Создать</button>
        </div>
        <div class="footer-actions">
            <button class="btn-close" @click="$emit('close')">Закрыть</button>
        </div>
      </div>
    </div>

    <!-- 🟢 3. УСЛОВНЫЙ РЕНДЕРИНГ ПОПАПОВ -->
    <IncomePopup 
        v-if="isCreatePopupVisible && props.type === 'income'"
        :date="new Date()" 
        :cellIndex="0" 
        @close="isCreatePopupVisible = false" 
        @save="handleSave" 
    />

    <ExpensePopup 
        v-if="isCreatePopupVisible && props.type === 'expense'"
        :date="new Date()" 
        :cellIndex="0" 
        @close="isCreatePopupVisible = false" 
        @save="handleSave" 
    />

    <div v-if="showDeleteConfirm" class="inner-overlay" @click.self="showDeleteConfirm = false"><div class="delete-confirm-box"><h4>Удалить операцию?</h4><p class="confirm-text">Вы действительно хотите удалить эту операцию? Это действие необратимо.</p><div class="delete-actions"><button class="btn-delete-confirm" @click="confirmDelete">Да, удалить</button><button class="btn-cancel" @click="showDeleteConfirm = false">Отмена</button></div></div></div>
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 3500; overflow-y: auto; }
.popup-content { background: var(--color-background); border-radius: 12px; display: flex; flex-direction: column; height: 50vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 95%; max-width: 1300px; border: 1px solid var(--color-border); }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 24px; color: var(--color-heading); font-weight: 700; letter-spacing: -0.02em; }

.header-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.header-with-toggle {
  display: flex;
  align-items: center;
  gap: 16px;
}

.widget-toggle-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  color: var(--color-text-soft);
}

.widget-toggle-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-background-mute);
}

.widget-toggle-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.widget-toggle-btn .toggle-label {
  font-weight: 500;
}

.summary-bar {
  display: flex;
  align-items: baseline;
  gap: 8px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 6px 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  white-space: nowrap;
}

.summary-label {
  font-size: 12px;
  color: var(--color-text-soft);
  font-weight: 600;
}

.summary-value {
  font-size: 14px;
  color: var(--color-heading);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.summary-count {
  font-size: 12px;
  color: var(--color-text-soft);
  font-weight: 600;
}

.export-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.export-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  height: 32px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.export-btn svg {
  width: 16px;
  height: 16px;
  stroke: var(--color-text-soft);
  transition: stroke 0.2s;
}

.export-btn:hover {
  background: var(--color-background-mute);
  border-color: #10b981;
  color: #10b981;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
}

.export-btn:hover svg {
  stroke: #10b981;
}

.export-btn:active {
  transform: scale(0.98);
}

.copy-success {
  position: absolute;
  right: 0;
  top: -30px;
  background: #10b981;
  color: white;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  white-space: nowrap;
  z-index: 1000;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 1100px) {
  .header-row {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .export-buttons {
    order: 2;
  }
  
  .summary-bar {
    order: 3;
  }
}

@media (max-width: 900px) {
  .header-row {
    flex-direction: column;
    align-items: flex-start;
  }
}

/* GRID LAYOUTS */
.filters-row, .grid-row { display: grid; grid-template-columns: 130px 1fr 1fr 120px 1fr 1fr 1fr 50px; gap: 12px; align-items: center; padding: 0 1.5rem; margin-top: 15px;}

.filters-row { margin-bottom: 10px; }
.grid-row { padding: 8px 1.5rem; background: var(--color-background-soft); border: 1px solid var(--color-border); border-radius: 8px; margin-bottom: 6px; transition: box-shadow 0.2s; min-height: 40px; }
.grid-row:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-color: var(--color-border); }

.text-red { color: #ff3b30 !important; }
.col-trash { display: flex; justify-content: left; align-items: center; }
.col-date { display: flex; align-items: center; }

.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; max-height: 55vh; scrollbar-width: none; -ms-overflow-style: none; }
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

/* Filter Input Styles */
.filter-input { width: 100%; height: 28px; border: 1px solid var(--color-border); border-radius: 6px; padding: 0 6px; font-size: 13px; color: var(--color-text); box-sizing: border-box; background-color: var(--color-background-soft); margin: 0; }
.filter-select { -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.filter-input:focus { outline: none; border-color: var(--color-primary); }

.delete-btn { width: 28px; height: 28px; border: 1px solid var(--color-border); background: var(--color-background); border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; padding: 0; margin: 0; }
.delete-btn svg { width: 14px; height: 14px; stroke: var(--color-text-soft); }
.delete-btn:hover { border-color: #FF3B30; background: var(--color-background-mute); }
.delete-btn:hover svg { stroke: #FF3B30; }

.popup-footer { padding: 1.5rem; border-top: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; background-color: var(--color-background); border-radius: 0 0 12px 12px; }
.footer-left-actions { display: flex; gap: 10px; }
.btn-add-new-footer { padding: 0 16px; height: 28px; border: 1px solid transparent; border-radius: 6px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; display: flex; align-items: center; justify-content: center; }
.btn-income { background: #10b981; }
.btn-income:hover { background: #059669; }
.footer-actions { display: flex; gap: 10px; }
.btn-close { padding: 0 16px; height: 28px; background: var(--color-background-soft); border: 1px solid var(--color-border); color: var(--color-text); border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.btn-close:hover { background: var(--color-background-mute); }
.empty-state { text-align: center; padding: 4rem; color: var(--color-text-soft); font-style: italic; }

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
