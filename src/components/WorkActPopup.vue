<script setup>
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/formatters.js';

const props = defineProps({
  dealItem: { type: Object, required: true }, // Объект сделки/транша из редактора
});

const emit = defineEmits(['close', 'confirm']);

// Дата подписания акта (по умолчанию сегодня)
const signingDate = ref(new Date().toISOString().slice(0, 10));

const title = computed(() => {
    const pName = props.dealItem.projectName || 'Проект';
    return `Акт выполненных работ по "${pName}"`;
});

// Форматирование данных для отображения
const totalDeal = computed(() => formatNumber(props.dealItem.totalDeal));
const prepaymentAmount = computed(() => formatNumber(props.dealItem.amount));
const accountName = computed(() => props.dealItem.accountName || '-');
const companyName = computed(() => props.dealItem.companyName || '-');
const contractorName = computed(() => props.dealItem.contractorName || '-');
const projectName = computed(() => props.dealItem.projectName || '-');
const categoryName = computed(() => props.dealItem.categoryName || '-');
const receiptDate = computed(() => props.dealItem.date ? new Date(props.dealItem.date).toLocaleDateString('ru-RU') : '-');

const handleConfirm = () => {
  emit('confirm', {
    date: new Date(signingDate.value),
    description: 'Акт выполненных работ / Отработали'
  });
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <div class="header">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>

      <div class="info-grid">
        <div class="info-row main-row">
          <span class="label">Общая сумма сделки:</span>
          <span class="value">{{ totalDeal }} ₸</span>
        </div>
        <div class="info-row main-row">
          <span class="label">Сумма предоплаты:</span>
          <span class="value highlight">+ {{ prepaymentAmount }} ₸</span>
        </div>
        
        <div class="divider"></div>

        <div class="info-row">
          <span class="label">Поступили на счет:</span>
          <span class="value">{{ accountName }}</span>
        </div>
        <div class="info-row">
          <span class="label">Моей компании:</span>
          <span class="value">{{ companyName }}</span>
        </div>
        <div class="info-row">
          <span class="label">От контрагента:</span>
          <span class="value">{{ contractorName }}</span>
        </div>
        <div class="info-row">
          <span class="label">Из проекта:</span>
          <span class="value">{{ projectName }}</span>
        </div>
        <div class="info-row">
          <span class="label">По категории:</span>
          <span class="value">{{ categoryName }}</span>
        </div>
        <div class="info-row">
          <span class="label">Дата поступления:</span>
          <span class="value">{{ receiptDate }}</span>
        </div>

        <div class="divider"></div>

        <div class="input-group">
           <label>Дата подписания акта</label>
           <input type="date" v-model="signingDate" class="date-input" />
        </div>

        <div class="info-block-desc">
           <p>Описание: <b>Акт выполненных работ / Отработали</b></p>
        </div>
        
        <p class="hint-text">
            Подписание акта фиксирует выполнение обязательств по данному траншу.
            Это техническая операция, не влияющая на баланс счетов.
        </p>
      </div>

      <div class="actions">
        <button class="btn-cancel" @click="$emit('close')">Отмена</button>
        <button class="btn-confirm" @click="handleConfirm">Подписать акт</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 2200; backdrop-filter: blur(2px); }
.popup-content { background: #fff; width: 420px; border-radius: 12px; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); display: flex; flex-direction: column; border: 1px solid #e0e0e0; }

.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
h3 { margin: 0; font-size: 18px; font-weight: 700; color: #1a1a1a; max-width: 90%; line-height: 1.3; }
.close-btn { background: none; border: none; font-size: 24px; color: #999; cursor: pointer; padding: 0; line-height: 1; }

.info-grid { display: flex; flex-direction: column; gap: 8px; }
.info-row { display: flex; justify-content: space-between; font-size: 13px; color: #333; align-items: baseline; }
.label { color: #777; }
.value { font-weight: 600; text-align: right; color: #222; }

.main-row { font-size: 14px; }
.highlight { color: #34c759; font-weight: 700; }

.divider { height: 1px; background: #eee; margin: 10px 0; }

.input-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 5px; }
.input-group label { font-size: 12px; color: #666; font-weight: 500; }
.date-input { padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; width: 100%; box-sizing: border-box; background: #fcfcfc; }

.info-block-desc { background: #f5f5f5; padding: 10px; border-radius: 6px; border: 1px solid #eee; margin-top: 5px; font-size: 13px; color: #444; text-align: center; }
.hint-text { font-size: 11px; color: #999; margin-top: 10px; text-align: center; line-height: 1.4; font-style: italic; }

.actions { display: flex; gap: 10px; margin-top: 20px; }
.btn-cancel { flex: 1; padding: 12px; border: 1px solid #ddd; background: #fff; border-radius: 8px; cursor: pointer; font-weight: 500; color: #333; }
.btn-cancel:hover { background: #f5f5f5; }
.btn-confirm { flex: 1.5; padding: 12px; background: #222; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
.btn-confirm:hover { background: #444; }
</style>