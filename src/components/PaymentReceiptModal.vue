<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="header">
        <h2>Создание документа оплаты</h2>
        <div class="close-btn" @click="$emit('close')">✕</div>
      </div>

      <div class="content">
        <!-- CONTROLS -->
        <div class="controls">
          
          <!-- Шаг 1: Выбор компании -->
          <div class="step-block">
            <div class="step-title">1. Мои компании</div>
            <select v-model="selectedCompanyId">
              <option v-for="c in myCompanies" :key="c._id" :value="c._id">{{ c.name }}</option>
            </select>
          </div>

          <!-- Шаг 2: Выбор контрагента -->
          <div class="step-block">
            <div class="step-title">2. Мои контрагенты</div>
            <select v-model="selectedClientId" @change="selectedTxId = null">
              <option :value="null" disabled>Выберите клиента</option>
              <option v-for="c in clients" :key="c._id" :value="c._id">{{ c.name }}</option>
            </select>
          </div>

          <!-- Шаг 3: Список транзакций -->
          <div class="step-block" v-if="selectedClientId">
            <div class="step-title">3. Выберите операцию</div>
            
            <div class="tx-list">
              <div v-for="tx in filteredTransactions" 
                   :key="tx._id" 
                   class="tx-item" 
                   :class="{active: selectedTxId === tx._id}"
                   @click="selectedTxId = tx._id">
                <div class="tx-header">
                  <span :style="{color: tx.amount > 0 ? '#10b981' : '#ef4444'}">
                    {{ tx.amount > 0 ? '+' : '' }}{{ formatMoney(tx.amount) }} ₸
                  </span>
                  <span class="tx-date">{{ formatDate(tx.date) }}</span>
                </div>
                <div class="tx-description">{{ tx.description || 'Без описания' }}</div>
              </div>
              
              <div v-if="filteredTransactions.length === 0" class="empty-list">
                Нет операций
              </div>
            </div>
          </div>

          <button class="btn-download" 
                  :disabled="!isReady || isGenerating" 
                  @click="downloadPDF">
            <span v-if="isGenerating">Генерация...</span>
            <span v-else>Скачать PDF (Чек)</span>
          </button>
        </div>

        <!-- PREVIEW -->
        <div class="preview-area">
          <div class="preview-label">ПРЕДПРОСМОТР</div>
          
          <div v-if="isReady" id="receipt-el" class="receipt-container">
            <div class="receipt-body">
              <div class="receipt-brand">{{ receiptData.myCompany.name }}</div>

              <div class="receipt-status">
                <span class="status-pill">ОПЛАЧЕНО</span>
              </div>

              <div class="receipt-amount">{{ receiptData.amount }} ₸</div>
              <div class="receipt-date">{{ receiptData.date }}</div>

              <div class="divider"></div>

              <div class="info-row">
                <span class="label">Квитанция</span>
                <span class="val">{{ receiptData.number }}</span>
              </div>
              <div class="info-row">
                <span class="label">Получатель</span>
                <span class="val">
                  {{ receiptData.myCompany.name }}<br>
                  <span class="bin-text">БИН/ИИН: {{ receiptData.myCompany.bin }}</span>
                </span>
              </div>

              <div class="divider"></div>

              <div class="info-row">
                <span class="label">Плательщик</span>
                <span class="val">
                  {{ receiptData.client.name }}<br>
                  <span class="bin-text">{{ receiptData.client.details }}</span>
                </span>
              </div>

              <div class="info-row">
                <span class="label">Назначение</span>
                <span class="val">{{ receiptData.purpose }}</span>
              </div>

              <div class="receipt-footer">
                Документ сформирован автоматически в системе управления финансами <a href="https://index12.com" target="_blank" class="footer-link">INDEX12.COM</a>
              </div>
            </div>
          </div>

          <div v-else class="empty-preview">
            Заполните данные слева
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import html2pdf from 'html2pdf.js';

const emit = defineEmits(['close']);

const mainStore = useMainStore();

// State
const selectedCompanyId = ref(null);
const selectedClientId = ref(null);
const selectedTxId = ref(null);
const isGenerating = ref(false);

// Computed: Мои компании (из mainStore.companies)
const myCompanies = computed(() => {
  return mainStore.companies.map(c => ({
    _id: c._id,
    name: c.name,
    bin: c.identificationNumber || 'Не указан'
  }));
});

// Computed: Контрагенты (из mainStore.contractors + individuals)
const clients = computed(() => {
  const contractors = mainStore.contractors.map(c => ({
    _id: c._id,
    name: c.name,
    details: c.identificationNumber ? `БИН/ИИН: ${c.identificationNumber}` : 'Не указан',
    contract: c.contractNumber ? `№${c.contractNumber}` : null,
    type: 'contractor'
  }));

  const individuals = mainStore.individuals
    .filter(i => i._id !== mainStore.retailIndividualId) // Исключаем "Розницу"
    .map(i => ({
      _id: i._id,
      name: i.name,
      details: 'Физ. лицо',
      contract: null,
      type: 'individual'
    }));

  return [...contractors, ...individuals];
});

// Computed: Транзакции (доходы для выбранного контрагента)
const filteredTransactions = computed(() => {
  if (!selectedClientId.value) return [];
  
  // Получаем все операции из mainStore
  const allOps = mainStore.allOperationsFlat || [];
  
  // Фильтруем только доходы для выбранного клиента
  return allOps.filter(op => {
    if (op.type !== 'income') return false;
    if (op.isTransfer) return false;
    
    const contractorId = op.contractorId?._id || op.contractorId;
    const individualId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
    
    return contractorId === selectedClientId.value || 
           individualId === selectedClientId.value;
  }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Сортируем по дате (новые первые)
});

// Computed: Готовность к генерации
const isReady = computed(() => 
  selectedCompanyId.value && selectedClientId.value && selectedTxId.value
);

// Computed: Данные для квитанции
const receiptData = computed(() => {
  if (!isReady.value) return null;
  
  const company = myCompanies.value.find(c => c._id === selectedCompanyId.value);
  const client = clients.value.find(c => c._id === selectedClientId.value);
  const tx = filteredTransactions.value.find(t => t._id === selectedTxId.value);
  
  if (!company || !client || !tx) return null;
  
  let purpose = tx.description || 'Оплата услуг';
  if (client.contract) {
    purpose += ` (${client.contract})`;
  }
  if (tx.contractDate) {
    purpose += ` от ${formatDate(tx.contractDate)}`;
  }
  
  return {
    myCompany: company,
    client: client,
    amount: Math.abs(tx.amount).toLocaleString('ru-RU'),
    date: new Date(tx.date).toLocaleDateString('ru-RU'),
    number: `${new Date().getFullYear()}-${company._id.slice(-4)}-${tx._id.slice(-6)}`,
    purpose: purpose
  };
});

// Helpers
const formatMoney = (v) => Math.abs(v).toLocaleString('ru-RU');
const formatDate = (d) => new Date(d).toLocaleDateString('ru-RU');

// PDF Generation
const downloadPDF = () => {
  isGenerating.value = true;
  const element = document.getElementById('receipt-el');
  element.classList.add('export-mode');

  const contentHeight = element.offsetHeight;
  const contentWidth = element.offsetWidth;
  const ratio = contentHeight / contentWidth;
  
  // 80mm ширина (стандарт термоленты), высота автоматически
  const pdfWidth = 80; 
  const pdfHeight = pdfWidth * ratio;

  const opt = {
    margin: 0,
    filename: `Receipt_${receiptData.value.number}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 3, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: [pdfWidth, pdfHeight], orientation: 'portrait' } 
  };

  html2pdf().set(opt).from(element).save().then(() => {
    element.classList.remove('export-mode');
    isGenerating.value = false;
  });
};

// Auto-select first company if available
if (myCompanies.value.length > 0 && !selectedCompanyId.value) {
  selectedCompanyId.value = myCompanies.value[0]._id;
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.modal-container {
  width: 1000px;
  height: 700px;
  background: var(--color-background);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
  border: 1px solid var(--color-border);
}

.header {
  padding: 20px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h2 { 
  margin: 0; 
  font-size: 18px;
  color: var(--color-text);
}

.close-btn {
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
  font-size: 20px;
  padding: 4px 8px;
  color: var(--color-text);
}

.close-btn:hover {
  opacity: 1;
}

.content { 
  display: flex; 
  flex: 1; 
  overflow: hidden; 
}

/* Left Sidebar - Controls */
.controls {
  flex: 1;
  padding: 24px;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.step-block {
  background: rgba(255,255,255,0.03);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.05);
}

.step-title {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

select {
  width: 100%;
  padding: 12px;
  background: var(--color-input-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: 8px;
  outline: none;
  cursor: pointer;
  font-size: 14px;
}

select:focus { 
  border-color: var(--color-primary); 
}

/* Transaction List */
.tx-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 5px;
}

.tx-list::-webkit-scrollbar { width: 6px; }
.tx-list::-webkit-scrollbar-track { background: var(--color-surface); border-radius: 3px; }
.tx-list::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 3px; }
.tx-list::-webkit-scrollbar-thumb:hover { background: var(--color-text-secondary); }

.tx-item {
  padding: 12px;
  background: var(--color-input-bg);
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: 0.2s;
  flex-shrink: 0;
}

.tx-item:hover { 
  border-color: var(--color-text-secondary); 
}

.tx-item.active { 
  background: rgba(16, 185, 129, 0.15); 
  border-color: #10b981;
}

.tx-header {
  display: flex;
  justify-content: space-between;
  font-weight: bold;
  font-size: 13px;
}

.tx-date {
  color: var(--color-text-secondary);
  font-weight: normal;
}

.tx-description {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.empty-list {
  color: var(--color-text-secondary);
  font-size: 12px;
  padding: 5px;
  text-align: center;
}

.btn-download {
  margin-top: auto;
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 16px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  text-align: center;
  transition: 0.2s;
}

.btn-download:hover { 
  background: var(--color-primary-hover); 
}

.btn-download:disabled { 
  opacity: 0.5; 
  cursor: not-allowed; 
}

/* Right Side - Preview */
.preview-area {
  flex: 1.3;
  background: var(--color-background-secondary);
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
}

.preview-label {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-bottom: 20px;
}

.empty-preview {
  margin-top: 100px;
  color: var(--color-text-secondary);
  text-align: center;
}

/* --- RECEIPT STYLE (WHITE BACKGROUND) --- */
.receipt-container {
  width: 300px;
  background: #fff;
  color: #000;
  padding: 0;
  box-shadow: 0 0 40px rgba(0,0,0,0.5);
  font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  position: relative;
}

.receipt-body { 
  padding: 25px; 
}

.receipt-brand {
  text-align: center;
  font-weight: 900;
  font-size: 14px;
  text-transform: uppercase;
  margin-bottom: 20px;
  letter-spacing: 1px;
  color: #333;
  border-bottom: 2px solid #000;
  padding-bottom: 15px;
}

.receipt-status { 
  text-align: center; 
  margin-bottom: 20px; 
}

.status-pill {
  display: inline-block;
  background: #16a34a;
  color: #fff;
  padding: 8px 24px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.receipt-amount {
  text-align: center;
  font-size: 36px;
  font-weight: 800;
  margin-bottom: 5px;
  letter-spacing: -1px;
  color: #000;
}

.receipt-date {
  text-align: center;
  font-size: 12px;
  color: #666;
  margin-bottom: 30px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 12px;
  line-height: 1.4;
}

.label { 
  color: #888; 
  flex: 1; 
}

.val { 
  font-weight: 600; 
  text-align: right; 
  flex: 1.5; 
  word-wrap: break-word;
}

.bin-text {
  font-weight: normal;
  font-size: 10px;
}

.divider { 
  border-top: 1px dashed #ccc; 
  margin: 15px 0; 
}

.receipt-footer {
  margin-top: 30px;
  text-align: center;
  font-size: 10px;
  color: #888;
  padding-top: 15px;
  border-top: 1px solid #eee;
}

.footer-link {
  color: #2563eb;
  text-decoration: none;
  font-weight: 600;
}

.footer-link:hover {
  text-decoration: underline;
}

/* Export mode (remove shadows for clean PDF) */
.export-mode { 
  box-shadow: none; 
  border-radius: 0; 
}
</style>
