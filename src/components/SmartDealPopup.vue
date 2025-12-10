<script setup>
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/formatters.js';

const props = defineProps({
  dealStatus: { type: Object, required: true },
  currentAmount: { type: Number, required: true },
  projectName: { type: String, default: 'Проект' },
  contractorName: { type: String, default: 'Контрагент' },
  categoryName: { type: String, default: 'Категория' }
});

const emit = defineEmits(['close', 'confirm']);

// По умолчанию галочка стоит (автоподписание)
const isPreviousStageDone = ref(true);

// Логика "Финала"
const isFinal = computed(() => props.currentAmount >= props.dealStatus.debt);
const overpayment = computed(() => Math.max(0, props.currentAmount - props.dealStatus.debt));

// Номер следующего транша
const nextTrancheNum = computed(() => (props.dealStatus.tranchesCount || 0) + 1);
const hasPreviousTranche = computed(() => (props.dealStatus.tranchesCount || 0) > 0);

// 🟢 FIX: Показываем чекбокс только если есть прошлый транш И сделка НЕ финальная.
// В финале мы закрываем всё автоматически, спрашивать не нужно.
const showCheckbox = computed(() => hasPreviousTranche.value && !isFinal.value);

const confirmText = computed(() => {
    if (isFinal.value) return 'Закрыть сделку';
    return 'Внести транш';
});

const title = computed(() => {
    return isFinal.value ? 'Финал сделки' : `Внесение ${nextTrancheNum.value}-го транша`;
});

const handleConfirm = () => {
    emit('confirm', {
        // Если финал - принудительно закрываем всё (true), иначе берем значение чекбокса
        closePrevious: isFinal.value ? true : isPreviousStageDone.value,
        isFinal: isFinal.value,
        nextTrancheNum: nextTrancheNum.value
    });
};

const handleCancel = () => {
    emit('close'); 
};
</script>

<template>
  <div class="modal-overlay" @click.self="handleCancel">
    <div class="modal-content smart-deal-content">
      <div class="header">
          <h3>{{ title }}</h3>
          <button class="close-btn" @click="handleCancel">&times;</button>
      </div>

      <!-- Блок информации о сделке -->
      <div class="deal-info-block">
          <div class="info-row">
              <span class="info-label">От кого:</span>
              <span class="info-val">{{ contractorName }}</span>
          </div>
          <div class="info-row">
              <span class="info-label">Проект:</span>
              <span class="info-val">{{ projectName }}</span>
          </div>
          <div class="info-row">
              <span class="info-label">Категория:</span>
              <span class="info-val">{{ categoryName }}</span>
          </div>
      </div>

      <div class="separator-dashed"></div>

      <!-- Статистика -->
      <div class="stats-grid">
          <!-- Общая сумма -->
          <div class="stat-item">
              <span class="label">Бюджет</span>
              <span class="value">{{ formatNumber(dealStatus.totalDeal) }} ₸</span>
          </div>

          <!-- Остаток (Долг) -->
          <div class="stat-item">
              <span class="label">Нам должны еще</span>
              <span class="value warning">{{ formatNumber(dealStatus.debt) }} ₸</span>
          </div>
      </div>

      <!-- Блок текущего внесения -->
      <div class="current-op-box">
          <div class="op-row">
              <span class="op-label">Вносимая сумма:</span>
              <span class="op-val income-text">+ {{ formatNumber(currentAmount) }} ₸</span>
          </div>
      </div>

      <!-- Анализ (Финал) -->
      <div class="analysis-box final-state" v-if="isFinal">
          <div class="analysis-row final">
              <div class="final-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div class="final-text">
                  <strong>Сделка закрывается полностью</strong>
                  <span class="sub-text">Все этапы будут отмечены как сданные</span>
                  <span v-if="overpayment > 0" class="over-text">Переплата: {{ formatNumber(overpayment) }} ₸</span>
              </div>
          </div>
      </div>

      <!-- Чекбокс (Скрыт при финале) -->
      <div class="checkbox-wrapper" v-if="showCheckbox">
          <label class="custom-checkbox">
              <input type="checkbox" v-model="isPreviousStageDone">
              <span class="checkmark"></span>
              <span class="cb-label">Работы по предыдущему этапу сданы?</span>
          </label>
          <p class="cb-hint" v-if="isPreviousStageDone">Предыдущий транш получит статус "Отработан"</p>
      </div>

      <div class="actions">
          <button class="btn-cancel" @click="handleCancel">Отмена</button>
          <button class="btn-confirm" @click="handleConfirm">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 2100; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(3px); }
.modal-content { background: #fff; border-radius: 16px; width: 420px; padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }

.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
h3 { margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a; }
.close-btn { background: none; border: none; font-size: 28px; color: #999; cursor: pointer; line-height: 1; padding: 0; }

.deal-info-block { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
.info-row { display: flex; justify-content: space-between; font-size: 14px; }
.info-label { color: #666; }
.info-val { font-weight: 600; color: #333; text-align: right; }

.separator-dashed { border-top: 1px dashed #ddd; margin-bottom: 20px; width: 100%; }

.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.stat-item { 
    background: #f9f9f9; border-radius: 12px; padding: 12px; 
    display: flex; flex-direction: column; gap: 4px; border: 1px solid #eee; 
    text-align: center;
}

.label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
.value { font-size: 16px; font-weight: 700; color: #1a1a1a; }
.value.warning { color: #FF9D00; }

.current-op-box { background: #fff; border-top: 1px dashed #ddd; border-bottom: 1px dashed #ddd; padding: 16px 0; margin-bottom: 20px; }
.op-row { display: flex; justify-content: space-between; align-items: center; }
.op-label { font-size: 14px; color: #555; }
.op-val { font-size: 18px; font-weight: 800; }
.income-text { color: #34c759; }

.analysis-box { padding: 16px; margin-bottom: 20px; border-radius: 12px; transition: all 0.3s; }
.analysis-box.final-state { background: #1a1a1a; border: 1px solid #333; color: #fff; }
.analysis-row { display: flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 600; }
.analysis-row.final { align-items: flex-start; }
.final-icon { color: #34c759; margin-top: 2px; }
.final-text { display: flex; flex-direction: column; }
.sub-text { font-size: 11px; color: #aaa; margin-top: 2px; font-weight: 400; }
.over-text { font-size: 11px; color: #FF9D00; margin-top: 4px; }

.checkbox-wrapper { margin-bottom: 24px; padding: 0 4px; }
.custom-checkbox { display: flex; align-items: center; cursor: pointer; user-select: none; }
.custom-checkbox input { display: none; }
.checkmark { width: 22px; height: 22px; border: 2px solid #ddd; border-radius: 6px; margin-right: 12px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; background: #fff; }
.custom-checkbox input:checked ~ .checkmark { background-color: #34c759; border-color: #34c759; }
.checkmark:after { content: ""; width: 5px; height: 10px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg) scale(0); transition: transform 0.2s; margin-bottom: 2px; }
.custom-checkbox input:checked ~ .checkmark:after { transform: rotate(45deg) scale(1); }
.cb-label { font-size: 14px; color: #333; font-weight: 500; }
.cb-hint { font-size: 12px; color: #888; margin-left: 34px; margin-top: 4px; }

.actions { display: flex; gap: 10px; }
.actions .btn-confirm { flex: 1; height: 50px; background: #34c759; color: white; font-weight: 700; border-radius: 12px; border: none; cursor: pointer; font-size: 16px; transition: background 0.2s; }
.actions .btn-confirm:hover { background: #2da84e; }
.actions .btn-cancel { flex: 1; height: 50px; background: #eee; color: #333; font-weight: 600; border-radius: 12px; border: none; cursor: pointer; font-size: 16px; transition: background 0.2s; }
.actions .btn-cancel:hover { background: #e0e0e0; }
</style>