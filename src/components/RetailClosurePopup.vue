<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { formatNumber } from '@/utils/formatters.js';

const emit = defineEmits(['close', 'confirm']);
const amount = ref('');
const inputRef = ref(null);
const isSaving = ref(false);

const onInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = formatNumber(raw);
};

const handleConfirm = () => {
    const val = parseFloat(amount.value.replace(/\s/g, ''));
    if (!val || val <= 0) return;
    isSaving.value = true;
    emit('confirm', val);
};

onMounted(() => {
    nextTick(() => inputRef.value?.focus());
});
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <h3>Закрытие смены (Розница)</h3>
      <p class="hint">Введите общую сумму оказанных услуг за сегодня.</p>
      
      <div class="input-box">
         <input 
            type="text" 
            v-model="amount" 
            @input="onInput" 
            placeholder="0 ₸" 
            ref="inputRef"
            @keyup.enter="handleConfirm"
         />
      </div>
      
      <div class="actions">
        <button class="btn-cancel" @click="$emit('close')">Отмена</button>
        <button class="btn-confirm" @click="handleConfirm" :disabled="!amount || isSaving">
            {{ isSaving ? 'Сохранение...' : 'Списать' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 3000;
  backdrop-filter: blur(2px);
}
.popup-content {
  background: #fff; padding: 25px; border-radius: 12px; width: 300px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center;
}
h3 { margin: 0 0 10px; color: #222; }
.hint { font-size: 13px; color: #666; margin-bottom: 20px; }
.input-box input {
    width: 100%; font-size: 24px; font-weight: bold; text-align: center;
    border: 1px solid #ddd; border-radius: 8px; padding: 10px; outline: none;
    margin-bottom: 20px;
}
.input-box input:focus { border-color: #34c759; }
.actions { display: flex; gap: 10px; }
.btn-cancel { flex: 1; padding: 10px; background: #eee; border: none; border-radius: 6px; cursor: pointer; }
.btn-confirm { flex: 1; padding: 10px; background: #34c759; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
</style>