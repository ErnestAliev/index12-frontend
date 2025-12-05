<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import BaseSelect from './BaseSelect.vue';
import DateRangePicker from './DateRangePicker.vue';

const props = defineProps({
    initialData: { type: Object, default: null } // { companyId, amount, periodFrom, periodTo }
});

const emit = defineEmits(['close', 'success']);
const mainStore = useMainStore();

const isCalculating = ref(false);
const isSaving = ref(false);

// --- ДАННЫЕ ФОРМЫ ---
const selectedCompanyId = ref(null);
const selectedAccountId = ref(null);
const dateRange = ref({ from: null, to: null }); 
const paymentDate = ref(new Date().toISOString().slice(0, 10)); // Дата самой операции (по умолчанию сегодня)

// --- РЕЗУЛЬТАТЫ РАСЧЕТА ---
const calculationResult = ref({
    base: 0,
    tax: 0, 
    income: 0,
    expense: 0,
    percent: 0,
    regime: '',
    alreadyPaid: 0, 
    debt: 0         
});

// --- ОПЦИИ ---
const companyOptions = computed(() => {
    return mainStore.companies.map(c => ({
        value: c._id,
        label: c.name
    }));
});

// Фильтрация счетов по выбранной компании
// 🟢 FIX 1: Используем currentAccountBalances для доступа к balance и защита от NaN
const accountOptions = computed(() => {
    if (!selectedCompanyId.value) return [];
    
    // Ищем счета, привязанные к компании
    const linkedAccounts = mainStore.currentAccountBalances.filter(a => {
         if (!a.companyId) return false;
         const cId = (typeof a.companyId === 'object') ? a.companyId._id : a.companyId;
         return String(cId) === String(selectedCompanyId.value);
    });
    
    return linkedAccounts.map(a => ({
        value: a._id,
        label: a.name,
        // 🟢 FIX: (a.balance || 0) чтобы избежать NaN
        rightText: `${formatNumber(Math.abs(a.balance || 0))} ₸`
    }));
});

// Helper для дат
const toISODate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
};

// Отображение периода текстом
const periodDisplayText = computed(() => {
    const { from, to } = dateRange.value;
    if (!from && !to) return 'Весь период';
    const f = from ? new Date(from).toLocaleDateString('ru-RU') : '...';
    const t = to ? new Date(to).toLocaleDateString('ru-RU') : '...';
    if (from && to && from === to) return f;
    return `${f} - ${t}`;
});

// --- INIT ---
onMounted(() => {
    if (props.initialData) {
        selectedCompanyId.value = props.initialData.companyId;
        
        if (props.initialData.periodFrom || props.initialData.periodTo) {
            dateRange.value = {
                from: toISODate(props.initialData.periodFrom),
                to: toISODate(props.initialData.periodTo)
            };
        }
    }
});

// --- WATCHERS ---

// 1. Авторасчет при изменении Компании или Периода
watch([selectedCompanyId, dateRange], () => {
    if (selectedCompanyId.value) {
        calculateTax();
    }
}, { deep: true, immediate: true });

// 2. Авто-выбор счета при смене компании
watch(selectedCompanyId, () => {
    selectedAccountId.value = null;
});

// 3. Если список счетов обновился и там всего 1 счет — выбираем его
watch(accountOptions, (newOpts) => {
    if (newOpts.length === 1) {
        selectedAccountId.value = newOpts[0].value;
    }
});

const calculateTax = async () => {
    if (!selectedCompanyId.value) return;
    
    isCalculating.value = true;
    await new Promise(r => setTimeout(r, 150));
    
    const fromStr = dateRange.value.from;
    const toStr = dateRange.value.to;
    
    const from = fromStr ? new Date(fromStr) : null;
    const to = toStr ? new Date(toStr) : null;
    if (to) to.setHours(23, 59, 59, 999);

    // 1. Считаем начисление (база * процент) за выбранный период
    const res = mainStore.calculateTaxForPeriod(selectedCompanyId.value, from, to);
    
    // 2. Считаем уже оплаченное (из истории taxes)
    // 🟢 FIX 2: Улучшенная логика пересечения периодов
    const paid = mainStore.taxes
        .filter(t => {
            const cId = (typeof t.companyId === 'object') ? t.companyId._id : t.companyId;
            if (String(cId) !== String(selectedCompanyId.value)) return false;
            if (t.status !== 'paid') return false;
            
            // Если мы считаем за "весь период", то вычитаем все платежи
            if (!from && !to) return true;

            // Определяем период ПЛАТЕЖА
            // Если у платежа нет периода, считаем его точечным (на дату платежа)
            // Это предотвращает ситуацию, когда старый платеж без дат (0..Infinity) перекрывает всё
            const pFrom = t.periodFrom ? new Date(t.periodFrom).getTime() : new Date(t.date).getTime();
            const pTo = t.periodTo ? new Date(t.periodTo).getTime() : new Date(t.date).getTime();
            
            const reqFrom = from ? from.getTime() : 0;
            const reqTo = to ? to.getTime() : Infinity;
            
            // Проверка пересечения отрезков времени: (StartA <= EndB) and (EndA >= StartB)
            return (pFrom <= reqTo) && (pTo >= reqFrom);
        })
        .reduce((acc, t) => acc + (t.amount || 0), 0);

    const debt = Math.max(0, res.tax - paid);
    
    calculationResult.value = {
        ...res,
        alreadyPaid: paid, // Можно отобразить, сколько уже оплачено
        debt: debt 
    };
    
    // Если пришли из списка с готовой суммой и даты совпадают — используем её
    if (props.initialData && 
        props.initialData.companyId === selectedCompanyId.value &&
        props.initialData.amount > 0) {
        
        const initFrom = toISODate(props.initialData.periodFrom);
        const initTo = toISODate(props.initialData.periodTo);

        if (initFrom === fromStr && initTo === toStr) {
             calculationResult.value.debt = props.initialData.amount;
        }
    }

    isCalculating.value = false;
};

// --- ACTIONS ---

const confirmPayment = async () => {
    if (!selectedCompanyId.value) {
        alert("Выберите компанию.");
        return;
    }
    if (!selectedAccountId.value) {
        alert("Выберите счет списания.");
        return;
    }
    
    // Разрешаем оплату даже 0, если пользователь очень хочет (но лучше проверить)
    const amountToPay = calculationResult.value.debt;
    
    if (amountToPay <= 0) {
        alert("Нет суммы к оплате за выбранный период.");
        return;
    }

    isSaving.value = true;
    try {
        const payload = {
            companyId: selectedCompanyId.value,
            amount: amountToPay,
            date: new Date(paymentDate.value),
            periodFrom: dateRange.value.from ? new Date(dateRange.value.from) : null,
            periodTo: dateRange.value.to ? new Date(dateRange.value.to) : null,
            accountId: selectedAccountId.value
        };
        
        await mainStore.createTaxPayment(payload);
        emit('success'); 
    } catch (e) {
        console.error(e);
        alert('Ошибка оплаты: ' + e.message);
    } finally {
        isSaving.value = false;
    }
};

const formatMoney = (v) => formatNumber(Math.floor(v || 0));
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content assistant-content">
      
      <div class="assistant-header">
          <h3>Налоговый платеж</h3>
      </div>

      <div class="step-body">
          <p class="step-hint">Проверьте данные и подтвердите платеж.</p>
          
          <!-- 1. КОМПАНИЯ -->
          <div class="input-spacing">
              <BaseSelect 
                  v-model="selectedCompanyId" 
                  :options="companyOptions" 
                  label="Компания"
                  placeholder="Выберите компанию" 
              />
          </div>

          <!-- 2. СЧЕТ (Авто или Выбор) -->
          <div class="input-spacing">
              <BaseSelect 
                  v-model="selectedAccountId" 
                  :options="accountOptions" 
                  label="Счет списания"
                  placeholder="Выберите счет" 
                  :disabled="!selectedCompanyId"
              />
              <p v-if="selectedCompanyId && accountOptions.length === 0" class="warn-text">
                  Нет привязанных счетов.
              </p>
          </div>

          <!-- 3. ПЕРИОД -->
          <div class="custom-input-box input-spacing has-value">
             <div class="input-inner-content">
                <span class="floating-label">Отчетный период</span>
                <DateRangePicker v-model="dateRange" placeholder="Весь период" class="embedded-picker" />
             </div>
          </div>

          <!-- ИНФОРМАЦИОННОЕ ТАБЛО -->
          <div class="calc-card" v-if="selectedCompanyId">
              <div v-if="isCalculating" class="calc-loading">Расчет...</div>
              <div v-else>
                  <div class="calc-row period-row">
                      <span>Период расчета:</span>
                      <span class="calc-val">{{ periodDisplayText }}</span>
                  </div>
                  <div class="divider"></div>
                  
                  <div class="calc-row">
                      <span>Режим:</span>
                      <span class="calc-val">{{ calculationResult.regime === 'simplified' ? 'Упрощенка' : 'ОУР' }} ({{ calculationResult.percent }}%)</span>
                  </div>
                  <div class="calc-row">
                      <span>Доход за период:</span>
                      <span class="calc-val income">+ {{ formatMoney(calculationResult.income) }} ₸</span>
                  </div>
                  <div class="calc-row" v-if="calculationResult.regime === 'our'">
                      <span>Расход за период:</span>
                      <span class="calc-val expense">- {{ formatMoney(calculationResult.expense) }} ₸</span>
                  </div>
                  
                  <div class="divider"></div>
                  
                  <div class="calc-row">
                      <span>Начислено:</span>
                      <span class="calc-val total">{{ formatMoney(calculationResult.tax) }} ₸</span>
                  </div>
                  <div class="calc-row" v-if="calculationResult.alreadyPaid > 0">
                      <span>Уже оплачено:</span>
                      <span class="calc-val paid-text">- {{ formatMoney(calculationResult.alreadyPaid) }} ₸</span>
                  </div>

                  <div class="calc-row total-row">
                      <span>К уплате:</span>
                      <span class="calc-val warn-text">{{ formatMoney(calculationResult.debt) }} ₸</span>
                  </div>
              </div>
          </div>
          
          <!-- ДАТА ОПЕРАЦИИ (Опционально, внизу) -->
          <div class="date-row">
              <label>Дата платежа:</label>
              <input type="date" v-model="paymentDate" class="mini-date-input" />
          </div>

          <div class="popup-footer">
              <button class="btn-secondary" @click="$emit('close')">Отмена</button>
              <button class="btn-primary" @click="confirmPayment" :disabled="isSaving || !selectedCompanyId || !selectedAccountId || calculationResult.debt <= 0">
                  {{ isSaving ? 'Обработка...' : 'Подтвердить' }}
              </button>
          </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 2500; backdrop-filter: blur(3px); }
.assistant-content { background: #fff; width: 400px; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); display: flex; flex-direction: column; }

.assistant-header { background: #222; padding: 16px 20px; color: #fff; text-align: center; }
.assistant-header h3 { margin: 0; font-size: 18px; font-weight: 600; }

.step-body { padding: 24px; display: flex; flex-direction: column; }
.step-hint { margin: 0; font-size: 13px; color: #666; text-align: center; margin-bottom: 20px; }

.input-spacing { margin-bottom: 12px; }

/* Стили для DateRangePicker внутри input-box */
.custom-input-box { width: 100%; height: 54px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; padding: 0 14px; display: flex; align-items: center; position: relative; transition: all 0.2s ease; box-sizing: border-box; }
.custom-input-box:focus-within { border-color: #222; box-shadow: 0 0 0 1px rgba(34,34,34,0.2); }
.input-inner-content { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.floating-label { font-size: 11px; color: #999; margin-bottom: 0px; margin-top: 4px; line-height: 1.2; }

/* Глубокий стиль для пикера, чтобы убрать его рамки */
:deep(.embedded-picker .picker-trigger) { border: none !important; padding: 0 !important; height: auto !important; margin: 0 !important; background: transparent !important; box-shadow: none !important; }
:deep(.embedded-picker .value-text) { font-size: 15px !important; font-weight: 500 !important; color: #1a1a1a !important; }
:deep(.embedded-picker .placeholder) { font-size: 15px !important; color: #aaa !important; }

.calc-card { background: #f9f9f9; border: 1px solid #eee; border-radius: 12px; padding: 16px; margin-top: 10px; margin-bottom: 20px; }
.calc-loading { text-align: center; color: #888; font-style: italic; font-size: 13px; }
.calc-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
.calc-row span:first-child { color: #666; }
.calc-val { font-weight: 600; color: #222; }
.calc-val.income { color: #34C759; }
.calc-val.expense { color: #FF3B30; }
.calc-val.total { font-size: 14px; font-weight: 700; color: #222; }
.calc-val.paid-text { color: #34C759; } /* Зеленый для оплаченного */
.period-row span { font-weight: 500; color: #555; }
.divider { height: 1px; background: #ddd; margin: 8px 0; }

.total-row { margin-top: 8px; font-size: 15px; }
.warn-text { color: #F59E0B; font-weight: 800; font-size: 18px; }

.date-row { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-bottom: 20px; font-size: 13px; color: #666; }
.mini-date-input { border: 1px solid #ddd; border-radius: 6px; padding: 4px 8px; font-size: 13px; color: #333; }

.popup-footer { display: flex; gap: 12px; margin-top: 0; }
.btn-secondary { flex: 1; height: 48px; border: 1px solid #ddd; background: #fff; border-radius: 8px; cursor: pointer; font-weight: 600; color: #333; }
.btn-secondary:hover { background: #f5f5f5; }
.btn-primary { flex: 2; height: 48px; background: #222; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #444; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-pay { background: #34C759; }
.btn-pay:hover:not(:disabled) { background: #2da84e; }

:deep(.full-width-picker .picker-trigger) { height: 48px !important; }
</style>