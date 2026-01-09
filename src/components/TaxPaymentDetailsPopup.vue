<script setup>
import { computed, ref } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import ConfirmationPopup from './ConfirmationPopup.vue';

const props = defineProps({
  operationToEdit: { type: Object, required: true }
});

const emit = defineEmits(['close', 'delete']);
const mainStore = useMainStore();

const showDeleteConfirm = ref(false);

// Находим запись о налоге в сторе, чтобы достать Период
const taxRecord = computed(() => {
    if (!props.operationToEdit) return null;
    const opId = props.operationToEdit._id;
    return mainStore.taxes.find(t => {
        const relId = typeof t.relatedEventId === 'object' ? t.relatedEventId._id : t.relatedEventId;
        return String(relId) === String(opId);
    });
});

// Форматирование данных
const displayData = computed(() => {
    const op = props.operationToEdit;
    const tax = taxRecord.value;

    // Компания
    let compName = '---';
    if (op.companyId) {
        compName = typeof op.companyId === 'object' ? op.companyId.name : 'Компания'; 
        // Попытка найти в списке, если пришел ID
        if (typeof op.companyId !== 'object') {
            const c = mainStore.companies.find(x => x._id === op.companyId);
            if (c) compName = c.name;
        }
    }

    // Счет
    let accName = '---';
    if (op.accountId) {
        accName = typeof op.accountId === 'object' ? op.accountId.name : 'Счет';
        if (typeof op.accountId !== 'object') {
            const a = mainStore.accounts.find(x => x._id === op.accountId);
            if (a) accName = a.name;
        }
    }

    // Период
    let periodStr = '---';
    if (tax && tax.periodFrom && tax.periodTo) {
        const f = new Date(tax.periodFrom).toLocaleDateString('ru-RU');
        const t = new Date(tax.periodTo).toLocaleDateString('ru-RU');
        periodStr = `${f} - ${t}`;
    }

    return {
        amount: formatNumber(Math.abs(op.amount)),
        date: new Date(op.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
        company: compName,
        account: accName,
        period: periodStr,
        description: op.description || 'Налоговый платеж'
    };
});

const canDelete = computed(() => mainStore.canDelete);

const askDelete = () => { showDeleteConfirm.value = true; };

const confirmDelete = () => {
    emit('delete', props.operationToEdit);
    showDeleteConfirm.value = false;
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <div class="header-row">
         <h3>Налоговый платеж</h3>
         <button v-if="canDelete" class="btn-icon-delete" @click="askDelete" title="Удалить платеж">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
         </button>
      </div>

      <div class="info-block">
          
          <!-- Сумма -->
          <div class="info-row main-amount">
              <span class="label">Сумма платежа:</span>
              <span class="value sum-text">{{ displayData.amount }} ₸</span>
          </div>

          <div class="divider"></div>

          <!-- Компания -->
          <div class="info-row">
              <span class="label">Компания:</span>
              <span class="value">{{ displayData.company }}</span>
          </div>

          <!-- Период -->
          <div class="info-row">
              <span class="label">За период:</span>
              <span class="value highlight">{{ displayData.period }}</span>
          </div>

          <!-- Счет -->
          <div class="info-row">
              <span class="label">Списано со счета:</span>
              <span class="value">{{ displayData.account }}</span>
          </div>

          <!-- Дата -->
          <div class="info-row">
              <span class="label">Дата операции:</span>
              <span class="value">{{ displayData.date }}</span>
          </div>
          
      </div>

      <div class="actions">
        <button class="btn-close" @click="$emit('close')">Закрыть</button>
      </div>
    </div>

    <ConfirmationPopup 
        v-if="showDeleteConfirm" 
        title="Отмена налогового платежа" 
        message="Вы уверены? Платеж будет удален, а сумма долга по налогам восстановится." 
        confirmText="Удалить"
        @close="showDeleteConfirm = false" 
        @confirm="confirmDelete" 
    />
  </div>
</template>

<style scoped>
.popup-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 3000;
  pointer-events: auto; /* Prevent click-through */
  backdrop-filter: blur(2px);
}
.popup-content {
  background: #fff; padding: 25px; border-radius: 12px; width: 360px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2); display: flex; flex-direction: column;
}

.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
h3 { margin: 0; color: #1a1a1a; font-size: 1.2rem; font-weight: 700; }

.btn-icon-delete {
    background: none; border: none; cursor: pointer; color: #ff3b30; padding: 5px;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.2s;
}
.btn-icon-delete:hover { transform: scale(1.1); }
.btn-icon-delete svg { width: 20px; height: 20px; }

.info-block { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
.info-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; }
.info-row .label { color: #888; }
.info-row .value { color: #222; font-weight: 600; text-align: right; }

.main-amount { margin-top: 5px; font-size: 16px; }
.sum-text { color: #222; font-weight: 800; font-size: 18px; }
.highlight { color: #34c759; } /* Зеленый акцент для периода */

.divider { height: 1px; background: #eee; margin: 5px 0; }

.actions { display: flex; justify-content: center; }
.btn-close { 
    width: 100%; padding: 12px; background: #f0f0f0; border: none; border-radius: 8px; cursor: pointer; 
    color: #333; font-weight: 600; font-size: 15px; transition: background 0.2s;
}
.btn-close:hover { background: #e0e0e0; }
</style>