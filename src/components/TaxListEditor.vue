<script setup>
import { ref, computed, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import DateRangePicker from './DateRangePicker.vue';
import TaxPaymentPopup from './TaxPaymentPopup.vue';

const props = defineProps({
  title: { type: String, default: 'Управление налогами' }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

// Вкладки
const activeTab = ref('current'); // 'current' | 'history'

// Состояния
const isPaymentPopupVisible = ref(false);
const showDeleteConfirm = ref(false); // Управляет видимостью кастомного попапа удаления
const itemToDelete = ref(null);
const isDeleting = ref(false); // Состояние "Минутку удаляем..."
const preselectedPaymentData = ref(null);

// Фильтры
const filters = ref({
    dateRange: { from: null, to: null },
    company: '',
    status: ''
});

// Справочники
const companies = computed(() => mainStore.companies);
const accounts = computed(() => mainStore.accounts);

// Хелперы
const formatDate = (dateVal) => {
    if (!dateVal) return '-';
    return new Date(dateVal).toLocaleDateString('ru-RU');
};

const formatPeriod = (from, to) => {
    if (!from && !to) return 'Весь период';
    if (!from || !to) return '-';
    const f = new Date(from).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const t = new Date(to).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' });
    return `${f} - ${t}`;
};

// ==========================================
// 1. ВКЛАДКА "ТЕКУЩАЯ ЗАДОЛЖЕННОСТЬ"
// ==========================================
const currentDebtItems = computed(() => {
    return companies.value.map(comp => {
        const fDates = filters.value.dateRange;
        const from = fDates.from ? new Date(fDates.from) : null;
        const to = fDates.to ? new Date(fDates.to) : null;

        const taxData = mainStore.calculateTaxForPeriod(comp._id, from, to);
        
        const paidTax = mainStore.taxes
            .filter(t => {
                const cId = (typeof t.companyId === 'object' ? t.companyId._id : t.companyId);
                return cId === comp._id && t.status === 'paid';
            })
            .reduce((acc, t) => acc + (t.amount || 0), 0);

        const debt = Math.max(0, taxData.tax - paidTax);

        return {
            _id: `debt_${comp._id}`,
            companyId: comp._id,
            companyName: comp.name,
            regime: taxData.regime === 'simplified' ? 'Упрощенка' : 'ОУР',
            percent: taxData.percent,
            
            incomeBase: taxData.income,
            incomeFormatted: formatNumber(taxData.income),
            
            totalAccrued: taxData.tax,
            totalAccruedFormatted: formatNumber(taxData.tax),
            
            paid: paidTax,
            
            amountToPay: debt,
            amountFormatted: formatNumber(debt),
            
            statusLabel: debt > 0 ? 'Не оплачено' : 'Нет долгов',
            statusClass: debt > 0 ? 'pending' : 'paid',
            
            periodFrom: from,
            periodTo: to
        };
    }).filter(item => {
        if (filters.value.company && item.companyId !== filters.value.company) return false;
        return true;
    });
});

// ==========================================
// 2. ВКЛАДКА "ИСТОРИЯ УПЛАТЫ"
// ==========================================
const historyItems = computed(() => {
    let list = [...(mainStore.taxes || [])];
    list.sort((a, b) => new Date(b.date) - new Date(a.date));

    return list.map(item => {
        const cId = (typeof item.companyId === 'object' ? item.companyId._id : item.companyId);
        const comp = companies.value.find(c => c._id === cId);
        
        let accountName = '-';
        if (item.relatedEventId) {
            const op = mainStore.allOperationsFlat.find(o => o._id === item.relatedEventId);
            if (op && op.accountId) {
                const acc = accounts.value.find(a => a._id === (op.accountId._id || op.accountId));
                if (acc) accountName = acc.name;
            }
        }

        const destAccount = 'Бюджет'; 
        let baseIncome = 0;
        if (cId && item.periodFrom && item.periodTo) {
             const calc = mainStore.calculateTaxForPeriod(cId, new Date(item.periodFrom), new Date(item.periodTo));
             baseIncome = calc.income;
        }

        return {
            _id: item._id,
            date: item.date,
            periodFrom: item.periodFrom,
            periodTo: item.periodTo,
            
            amount: item.amount,
            amountFormatted: formatNumber(item.amount),
            
            companyName: comp ? comp.name : 'Удалена',
            companyId: cId,
            
            accountName: accountName,
            destAccount: destAccount,
            
            percent: comp ? comp.taxPercent : '-',
            incomeBase: baseIncome,
            incomeFormatted: formatNumber(baseIncome),
            
            status: item.status,
            statusLabel: 'Оплачено'
        };
    }).filter(item => {
        const { from, to } = filters.value.dateRange;
        if (from && new Date(item.date) < new Date(from)) return false;
        if (to && new Date(item.date) > new Date(to)) return false;
        
        if (filters.value.company && item.companyId !== filters.value.company) return false;
        return true;
    });
});

// ==========================================
// СТАТИСТИКА
// ==========================================
const dashboardStats = computed(() => {
    let totalIncomeBase = 0;
    let totalToPay = 0;

    currentDebtItems.value.forEach(item => {
        totalIncomeBase += item.incomeBase;
        totalToPay += item.amountToPay;
    });

    return {
        income: formatNumber(totalIncomeBase),
        toPay: formatNumber(totalToPay)
    };
});

// ==========================================
// ACTIONS
// ==========================================

const openPayModal = (debtItem = null) => {
    if (debtItem) {
        preselectedPaymentData.value = {
            companyId: debtItem.companyId,
            amount: debtItem.amountToPay,
            periodFrom: debtItem.periodFrom,
            periodTo: debtItem.periodTo
        };
    } else {
        preselectedPaymentData.value = null;
    }
    isPaymentPopupVisible.value = true;
};

const handlePaymentSuccess = async () => {
    isPaymentPopupVisible.value = false;
    await mainStore.fetchAllEntities();
};

// Удаление: Открытие диалога
const askDelete = (item, tab) => {
    itemToDelete.value = { ...item, tab }; 
    showDeleteConfirm.value = true;
};

// Удаление: Подтверждение и Процесс
const confirmDelete = async () => {
    if (!itemToDelete.value) return;
    
    // Включаем режим удаления (показываем прогрессбар)
    isDeleting.value = true;
    
    try {
        // Имитация задержки для UI, чтобы пользователь увидел прогресс
        await new Promise(r => setTimeout(r, 1500));

        if (itemToDelete.value.tab === 'history') {
            // Удаляем запись taxes + связанный расход
            await mainStore.deleteEntity('taxes', itemToDelete.value._id, true);
        } else {
            // Удаление текущей задолженности (Сброс визуальный, если нужно)
            // Пока просто обновляем
        }
        
        await mainStore.fetchAllEntities();
        
        // Закрываем попап только после завершения
        showDeleteConfirm.value = false;
        itemToDelete.value = null;
    } catch (e) {
        alert('Ошибка: ' + e.message);
    } finally {
        isDeleting.value = false;
    }
};

const cancelDelete = () => {
    if (isDeleting.value) return; // Нельзя отменить, если процесс уже идет
    showDeleteConfirm.value = false;
    itemToDelete.value = null;
};

onMounted(async () => {
    await mainStore.fetchAllEntities();
});
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      <div class="popup-header">
          <h3>{{ title }}</h3>
      </div>

      <!-- Вкладки -->
      <div class="tabs-header">
          <button class="tab-btn" :class="{ active: activeTab === 'current' }" @click="activeTab = 'current'">Текущая задолженность</button>
          <button class="tab-btn" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">История уплаты</button>
      </div>

      <!-- ИНФОРМАЦИОННАЯ ПАНЕЛЬ -->
      <div class="summary-bar main-stats" v-if="activeTab === 'current'">
          <div class="sum-item">
              <span class="sum-label">Всего поступлений (База):</span>
              <span class="sum-val income-text">+ {{ dashboardStats.income }} ₸</span>
          </div>
          <div class="sum-sep">/</div>
          <div class="sum-item">
              <span class="sum-label">Налог к уплате (Долг):</span>
              <span class="sum-val warn-text">{{ dashboardStats.toPay }} ₸</span>
          </div>
          <div class="sum-sep">|</div>
          
          <button class="btn-small-pay" @click="openPayModal()">Оплатить налоги</button>
      </div>

      <!-- ЗАГОЛОВОК ТАБЛИЦЫ (Фильтры) -->
      <div class="list-header-row tax-grid">
         <!-- Симметричное расположение фильтров -->
         
         <!-- Col 1: Status -->
         <div class="header-filter-wrapper">
             <span>СТАТУС</span>
         </div>
         
         <!-- Col 2: Period -->
         <div class="header-filter-wrapper">
             <DateRangePicker v-model="filters.dateRange" placeholder="ПЕРИОД" class="header-date-picker" />
         </div>
         
         <!-- Col 3: Company -->
         <div class="header-filter-wrapper">
             <select v-model="filters.company" class="header-select">
                 <option value="">КОМПАНИЯ</option>
                 <option v-for="c in companies" :key="c._id" :value="c._id">{{ c.name }}</option>
             </select>
         </div>
         
         <!-- Col 4: Regime/% -->
         <div class="header-filter-wrapper center-text">
             <span>РЕЖИМ/%</span>
         </div>
         
         <template v-if="activeTab === 'current'">
             <!-- Col 5 -->
             <div class="header-filter-wrapper right-text">ПОСТУПЛЕНИЯ</div>
             <!-- Col 6 -->
             <div class="header-filter-wrapper right-text">ВСЕГО НАЧИСЛЕНО</div>
             <!-- Col 7 -->
             <div class="header-filter-wrapper right-text">К УПЛАТЕ</div>
             <!-- Col 8 -->
             <div class="header-filter-wrapper center-text">ДЕЙСТВИЕ</div>
         </template>
         
         <template v-else>
             <!-- Col 5 -->
             <div class="header-filter-wrapper">СЧЕТ СПИСАНИЯ</div>
             <!-- Col 6 -->
             <div class="header-filter-wrapper right-text">БАЗА (ДОХОД)</div>
             <!-- Col 7 -->
             <div class="header-filter-wrapper right-text">СУММА УПЛАТЫ</div>
             <!-- Col 8 -->
             <div class="header-filter-wrapper center-text">ДАТА УПЛАТЫ</div>
         </template>
         
         <!-- Col 9: Trash -->
         <div class="header-filter-wrapper trash-col"></div>
      </div>

      <!-- СПИСОК СТРОК -->
      <div class="list-scroll">
          
          <!-- 1. ТЕКУЩАЯ ЗАДОЛЖЕННОСТЬ -->
          <template v-if="activeTab === 'current'">
              <div v-if="currentDebtItems.length === 0" class="empty-state">Нет задолженностей по выбранным фильтрам.</div>
              <div v-for="item in currentDebtItems" :key="item._id" class="grid-row tax-grid">
                  <!-- Col 1 -->
                  <div class="col-cell">
                      <span class="status-badge" :class="item.statusClass">{{ item.statusLabel }}</span>
                  </div>
                  <!-- Col 2 -->
                  <div class="col-cell text-display">{{ formatPeriod(filters.dateRange.from, filters.dateRange.to) }}</div>
                  <!-- Col 3 -->
                  <div class="col-cell text-display bold truncate" :title="item.companyName">{{ item.companyName }}</div>
                  <!-- Col 4 -->
                  <div class="col-cell text-display center-text">{{ item.regime }} ({{ item.percent }}%)</div>
                  
                  <!-- Col 5 -->
                  <div class="col-cell col-amount income-text">+ {{ item.incomeFormatted }} ₸</div>
                  <!-- Col 6 -->
                  <div class="col-cell col-amount text-display">{{ item.totalAccruedFormatted }} ₸</div>
                  <!-- Col 7 -->
                  <div class="col-cell col-amount expense-text bold">{{ item.amountFormatted }} ₸</div>
                  
                  <!-- Col 8 -->
                  <div class="col-cell center-text">
                      <button v-if="item.amountToPay > 0" class="btn-row-pay" @click="openPayModal(item)">Оплатить</button>
                  </div>
                  
                  <!-- Col 9 -->
                  <div class="col-cell col-trash">
                      <button class="delete-btn" @click="askDelete(item, 'current')" title="Сбросить">
                          <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                  </div>
              </div>
          </template>

          <!-- 2. ИСТОРИЯ УПЛАТЫ -->
          <template v-if="activeTab === 'history'">
              <div v-if="historyItems.length === 0" class="empty-state">История платежей пуста.</div>
              <div v-for="item in historyItems" :key="item._id" class="grid-row tax-grid">
                  <!-- Col 1 -->
                  <div class="col-cell">
                      <span class="status-badge paid">Оплачено</span>
                  </div>
                  <!-- Col 2 -->
                  <div class="col-cell text-display">{{ formatPeriod(item.periodFrom, item.periodTo) }}</div>
                  <!-- Col 3 -->
                  <div class="col-cell text-display bold truncate" :title="item.companyName">{{ item.companyName }}</div>
                  <!-- Col 4 -->
                  <div class="col-cell text-display center-text">{{ item.percent }}%</div>
                  
                  <!-- Col 5 -->
                  <div class="col-cell text-display truncate" :title="item.accountName">{{ item.accountName }}</div>
                  
                  <!-- Col 6 -->
                  <div class="col-cell col-amount text-display">{{ item.incomeFormatted }} ₸</div>
                  
                  <!-- Col 7 -->
                  <div class="col-cell col-amount expense-text bold">- {{ item.amountFormatted }} ₸</div>
                  
                  <!-- Col 8 -->
                  <div class="col-cell text-display center-text">{{ formatDate(item.date) }}</div>
                  
                  <!-- Col 9 -->
                  <div class="col-cell col-trash">
                      <button class="delete-btn" @click="askDelete(item, 'history')" title="Удалить">
                          <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                  </div>
              </div>
          </template>

      </div>

      <div class="popup-footer">
          <button class="btn-close" @click="$emit('close')">Закрыть</button>
      </div>
    </div>

    <!-- Модалки -->
    <TaxPaymentPopup 
        v-if="isPaymentPopupVisible" 
        :initial-data="preselectedPaymentData"
        @close="isPaymentPopupVisible = false" 
        @success="handlePaymentSuccess" 
    />
    
    <!-- 🟢 КАСТОМНЫЙ ПОПАП УДАЛЕНИЯ -->
    <div v-if="showDeleteConfirm" class="inner-overlay" @click.self="cancelDelete">
        <div class="delete-confirm-box">
            <!-- 1. Состояние удаления (Прогрессбар) -->
            <div v-if="isDeleting" class="deleting-state">
                <h4>Удаление...</h4>
                <p class="sub-note">Минутку удаляем ....</p>
                <div class="progress-container">
                    <div class="progress-bar"></div>
                </div>
            </div>
            
            <!-- 2. Состояние подтверждения -->
            <div v-else>
                <h4>{{ itemToDelete?.tab === 'history' ? 'Отмена уплаты налога' : 'Удаление задолженности' }}</h4>
                <p class="confirm-text">
                    {{ itemToDelete?.tab === 'history' ? 'Удалить запись об уплате? Сумма вернется в долг, а расход будет удален.' : 'Вы действительно хотите удалить эту запись?' }}
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
.popup-content { background: #F9F9F9; border-radius: 12px; display: flex; flex-direction: column; height: 50vh; margin: 2rem 1rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); width: 95%; max-width: 1400px; border: 1px solid #ddd; }
.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 24px; color: #111827; font-weight: 700; }

.tabs-header { display: flex; gap: 24px; padding: 0 1.5rem; margin-top: 0.5rem; border-bottom: 1px solid #e5e7eb; }
.tab-btn { background: none; border: none; border-bottom: 3px solid transparent; font-size: 14px; font-weight: 600; color: #6b7280; padding: 10px 0; cursor: pointer; transition: all 0.2s; }
.tab-btn.active { color: #111827; border-color: #111827; }
.tab-btn:hover { color: #374151; }

.summary-bar { display: flex; align-items: center; gap: 15px; padding: 15px 24px; background-color: #fff; border-bottom: 1px solid #eee; font-size: 15px; color: #333; margin-top: 0; }
.sum-item { display: flex; gap: 6px; align-items: center; }
.sum-label { color: #666; }
.sum-val { font-weight: 700; }
.sum-sep { color: #ddd; }
.income-text { color: #10b981; }
.expense-text { color: #ef4444; }
.warn-text { color: #F59E0B; }

.btn-small-pay { 
    padding: 8px 20px; 
    background-color: #34C759; 
    color: #fff; 
    border: none; 
    border-radius: 6px; 
    font-size: 13px; 
    font-weight: 700; 
    cursor: pointer; 
    margin-left: auto;
    text-transform: uppercase;
}
.btn-small-pay:hover { background-color: #2da84e; }

.btn-row-pay {
    padding: 4px 10px;
    background-color: #34C759;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
}
.btn-row-pay:hover { background-color: #444; }

/* 🟢 GRID SYSTEM (SYMMETRIC) 
   Макс. ширина колонки ~24 символа (около 200-220px).
   Сумма ширины колонок должна помещаться в экран (1400px макс).
   
   1. Status (100px)
   2. Period (140px)
   3. Company (minmax 120, max 220px) -> берем 1.5fr
   4. Regime (110px)
   5. Account/Base (minmax 120, max 220px) -> берем 1.2fr
   6. Accrued (130px)
   7. Pay (130px)
   8. Action (120px)
   9. Trash (40px)
*/
.tax-grid { 
    display: grid; 
    grid-template-columns: 100px 140px 200px 110px 160px 140px 140px 120px 40px; 
    gap: 12px; 
    align-items: center; 
    padding: 0 1.5rem; 
}

.list-header-row { padding: 0 12px; height: 44px; background: #fff; position: sticky; top: 0; z-index: 10; border-bottom: 1px solid #eee; margin-top: 10px; }
.header-filter-wrapper { width: 100%; height: 100%; display: flex; align-items: center; font-size: 10px; font-weight: 700; color: #555; text-transform: uppercase; overflow: hidden; }
.right-text { justify-content: flex-end; text-align: right; width: 100%; }
.center-text { justify-content: center; text-align: center; width: 100%; }

.header-select, :deep(.date-picker-input) { width: 100%; border: none; background: transparent; font-size: 10px; font-weight: 700; color: #4B5563; text-transform: uppercase; cursor: pointer; outline: none; }
:deep(.dp__input) { font-size: 10px !important; font-weight: 700 !important; color: #4B5563 !important; border: none !important; background: transparent !important; padding: 0 !important; height: auto !important; text-transform: uppercase; box-shadow: none !important; }

.grid-row { padding: 10px 12px; background: #fff; border: 1px solid #E0E0E0; border-radius: 8px;  min-height: 48px; }
.col-cell { overflow: hidden; }

.list-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 1rem; scrollbar-width: none; }
.list-scroll::-webkit-scrollbar { display: none; }

.text-display { font-size: 12px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bold { font-weight: 600; }
.truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.status-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase; display: inline-block; white-space: nowrap;}
.status-badge.paid { background-color: #dcfce7; color: #166534; }
.status-badge.pending { background-color: #fee2e2; color: #991b1b; }

.col-amount { text-align: right; font-size: 12px; white-space: nowrap; }

.delete-btn { width: 28px; height: 28px; border: 1px solid #E0E0E0; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.delete-btn:hover { border-color: #FF3B30; background: #FFF5F5; }
.delete-btn svg { width: 14px; stroke: #999; }
.delete-btn:hover svg { stroke: #FF3B30; }

.popup-footer { padding: 1.5rem; border-top: 1px solid #E0E0E0; display: flex; justify-content: flex-end; align-items: center; background: #F9F9F9; border-radius: 0 0 12px 12px; }
.btn-close { padding: 0 16px; height: 36px; background: white; border: 1px solid #d1d5db; color: #374151; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 14px; }
.btn-close:hover { background: #f3f4f6; }
.empty-state { text-align: center; padding: 3rem; color: #999; font-style: italic; }

/* 🟢 СТИЛИ ДЛЯ ВСТРОЕННОГО ПОПАПА УДАЛЕНИЯ */
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