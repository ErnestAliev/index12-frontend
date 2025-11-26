<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';
import MultiSelectModal from './MultiSelectModal.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v26.11 - RETAIL MULTI-PROJECT ---
 * * ВЕРСИЯ: 26.11.8 - Множественный выбор проектов
 * * ДАТА: 2025-11-26
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (FEAT) Добавлен MultiSelectModal для выбора проектов.
 * 2. (LOGIC) Поддержка множественного выбора (selectedProjectIds).
 * 3. (API) Emit 'confirm' теперь передает { amount, projectIds }.
 */

const emit = defineEmits(['close', 'confirm']);
const mainStore = useMainStore();

const amount = ref('');
const inputRef = ref(null);
const isSaving = ref(false);

// Множественный выбор проектов
const showProjectPicker = ref(false);
const selectedProjectIds = ref([]);

// Данные для мульти-селекта
const projectItems = computed(() => mainStore.projects || []);
const selectedProjectsText = computed(() => {
  if (selectedProjectIds.value.length === 0) return '';
  if (selectedProjectIds.value.length === 1) {
      const p = projectItems.value.find(x => x._id === selectedProjectIds.value[0]);
      return p ? p.name : '???';
  }
  return `Выбрано: ${selectedProjectIds.value.length}`;
});

const onInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = formatNumber(raw);
};

const openProjectPicker = () => {
    showProjectPicker.value = true;
};

const onProjectPickerSave = (ids) => {
    selectedProjectIds.value = ids;
    showProjectPicker.value = false;
};

const handleConfirm = () => {
    const val = parseFloat(amount.value.replace(/\s/g, ''));
    if (!val || val <= 0) return;
    isSaving.value = true;
    
    // 🟢 Передаем массив выбранных проектов
    emit('confirm', { 
        amount: val, 
        projectIds: selectedProjectIds.value 
    });
};

onMounted(() => {
    nextTick(() => inputRef.value?.focus());
});
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <h3>Закрытие смены (Розница)</h3>
      <p class="hint">Введите общую сумму оказанных услуг за сегодня и выберите проект(ы).</p>
      
      <!-- 🟢 СУММА (Белый фон) -->
      <div class="input-box">
         <input 
            type="text" 
            v-model="amount" 
            @input="onInput" 
            placeholder="0 ₸" 
            ref="inputRef"
            class="amount-input"
         />
      </div>
      
      <!-- 🟢 ВЫБОР ПРОЕКТА (Кнопка + Мультиселект) -->
      <div class="input-box">
         <button class="project-select-btn" @click="openProjectPicker">
            <span v-if="selectedProjectIds.length === 0" class="placeholder">Выберите проект(ы)...</span>
            <span v-else class="selected-value">{{ selectedProjectsText }}</span>
            <span class="arrow">▼</span>
         </button>
      </div>
      
      <div class="actions">
        <button class="btn-cancel" @click="$emit('close')">Отмена</button>
        <button class="btn-confirm" @click="handleConfirm" :disabled="!amount || isSaving">
            {{ isSaving ? 'Сохранение...' : 'Списать' }}
        </button>
      </div>
    </div>

    <!-- МОДАЛКА ВЫБОРА -->
    <MultiSelectModal
      v-if="showProjectPicker"
      title="Выберите проекты"
      :items="projectItems"
      :initial-selected-ids="selectedProjectIds"
      @close="showProjectPicker = false"
      @save="onProjectPickerSave"
    />
  </div>
</template>

<style scoped>
.popup-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 3000;
  backdrop-filter: blur(2px);
}
.popup-content {
  background: #fff; padding: 25px; border-radius: 12px; width: 340px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center;
}
h3 { margin: 0 0 10px; color: #222; font-size: 1.2rem; }
.hint { font-size: 13px; color: #666; margin-bottom: 20px; line-height: 1.4; }

.input-box { margin-bottom: 15px; }

/* 🟢 Стили инпута суммы (Белый фон) */
.amount-input {
    width: 100%; font-size: 24px; font-weight: bold; text-align: center;
    border: 1px solid #ddd; border-radius: 8px; padding: 10px; outline: none;
    background-color: #ffffff; color: #222;
    box-sizing: border-box;
}
.amount-input:focus { border-color: #34c759; }

/* 🟢 Стили кнопки выбора проекта (под select) */
.project-select-btn {
    width: 100%; height: 42px;
    background: #ffffff; border: 1px solid #ddd; border-radius: 8px;
    padding: 0 12px; display: flex; align-items: center; justify-content: space-between;
    cursor: pointer; font-size: 14px; color: #222;
    transition: border-color 0.2s;
}
.project-select-btn:hover { border-color: #bbb; }
.project-select-btn .placeholder { color: #999; }
.project-select-btn .selected-value { font-weight: 500; }
.project-select-btn .arrow { font-size: 10px; color: #666; }

.actions { display: flex; gap: 10px; margin-top: 10px; }

/* 🟢 Кнопка отмены (Темнее текст) */
.btn-cancel { 
    flex: 1; padding: 10px; background: #eee; border: none; border-radius: 6px; cursor: pointer; 
    color: #333; font-weight: 500; 
}
.btn-cancel:hover { background: #e0e0e0; }

.btn-confirm { flex: 1; padding: 10px; background: #34c759; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
</style>