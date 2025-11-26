<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';
import MultiSelectModal from './MultiSelectModal.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v26.11.20 - WRITE-OFF EDITOR ---
 * * ВЕРСИЯ: 26.11.20 - Добавлен режим редактирования (Дата, Удаление)
 * * ДАТА: 2025-11-26
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (PROPS) Добавлен `operationToEdit`.
 * 2. (UI) Добавлено поле "Дата" (только для редактирования).
 * 3. (UI) Добавлена кнопка "Удалить" (только для редактирования).
 * 4. (LOGIC) Специальный текст подтверждения удаления.
 */

const props = defineProps({
  operationToEdit: { type: Object, default: null } // Если передан, значит режим редактирования
});

const emit = defineEmits(['close', 'confirm', 'save', 'delete']);
const mainStore = useMainStore();

const isEditMode = computed(() => !!props.operationToEdit);
const title = computed(() => isEditMode.value ? 'Редактор списания' : 'Закрытие смены (Розница)');
const btnText = computed(() => isEditMode.value ? 'Сохранить' : 'Списать');

// Поля формы
const amount = ref('');
const dateValue = ref(new Date().toISOString().slice(0, 10));
const inputRef = ref(null);
const isSaving = ref(false);

// Выбор проектов
const showProjectPicker = ref(false);
const selectedProjectIds = ref([]);

// Удаление
const showDeleteConfirm = ref(false);
const isDeleting = ref(false);

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

const openProjectPicker = () => { showProjectPicker.value = true; };
const onProjectPickerSave = (ids) => { selectedProjectIds.value = ids; showProjectPicker.value = false; };

const handleConfirm = () => {
    const val = parseFloat(amount.value.replace(/\s/g, ''));
    if (!val || val <= 0) return;
    isSaving.value = true;

    const payload = { 
        amount: val, 
        projectIds: selectedProjectIds.value,
        date: dateValue.value // Важно для редактирования
    };
    
    if (isEditMode.value) {
        emit('save', { id: props.operationToEdit._id, data: payload });
    } else {
        emit('confirm', payload);
    }
};

// Логика удаления
const askDelete = () => { showDeleteConfirm.value = true; };
const confirmDelete = () => {
    isDeleting.value = true;
    emit('delete', props.operationToEdit);
    // Закрытие произойдет в родителе после удаления
};

onMounted(() => {
    if (isEditMode.value) {
        const op = props.operationToEdit;
        amount.value = formatNumber(Math.abs(op.amount));
        if (op.date) {
            dateValue.value = new Date(op.date).toISOString().slice(0, 10);
        }
        if (op.projectId) {
            const pId = typeof op.projectId === 'object' ? op.projectId._id : op.projectId;
            selectedProjectIds.value = [pId];
        }
    }
    nextTick(() => inputRef.value?.focus());
});
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <div class="header-row">
         <h3>{{ title }}</h3>
         <button v-if="isEditMode" class="btn-icon-delete" @click="askDelete" title="Удалить">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
         </button>
      </div>
      
      <p class="hint" v-if="!isEditMode">Введите общую сумму оказанных услуг за сегодня и выберите проект(ы).</p>
      
      <!-- СУММА -->
      <div class="input-box">
         <label class="field-label">Сумма</label>
         <input 
            type="text" 
            v-model="amount" 
            @input="onInput" 
            placeholder="0 ₸" 
            ref="inputRef"
            class="amount-input"
         />
      </div>

      <!-- ДАТА (Только в редактировании или если нужно менять дату списания) -->
      <div class="input-box">
         <label class="field-label">Дата</label>
         <input type="date" v-model="dateValue" class="date-input" />
      </div>
      
      <!-- ПРОЕКТ -->
      <div class="input-box">
         <label class="field-label">Проект</label>
         <button class="project-select-btn" @click="openProjectPicker">
            <span v-if="selectedProjectIds.length === 0" class="placeholder">Выберите проект...</span>
            <span v-else class="selected-value">{{ selectedProjectsText }}</span>
            <span class="arrow">▼</span>
         </button>
      </div>
      
      <div class="actions">
        <button class="btn-cancel" @click="$emit('close')">Отмена</button>
        <button class="btn-confirm" @click="handleConfirm" :disabled="!amount || isSaving">
            {{ isSaving ? 'Сохранение...' : btnText }}
        </button>
      </div>
    </div>

    <!-- МОДАЛКА ВЫБОРА ПРОЕКТА -->
    <MultiSelectModal
      v-if="showProjectPicker"
      title="Выберите проект"
      :items="projectItems"
      :initial-selected-ids="selectedProjectIds"
      @close="showProjectPicker = false"
      @save="onProjectPickerSave"
    />

    <!-- 🟢 СПЕЦИАЛЬНОЕ УВЕДОМЛЕНИЕ ОБ УДАЛЕНИИ -->
    <ConfirmationPopup 
        v-if="showDeleteConfirm" 
        title="Отмена списания" 
        message="Вы уверены? Это вернет сумму долга перед розницей." 
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
  backdrop-filter: blur(2px);
}
.popup-content {
  background: #fff; padding: 25px; border-radius: 12px; width: 340px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2); 
}

.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
h3 { margin: 0; color: #222; font-size: 1.2rem; font-weight: 700; }

.btn-icon-delete {
    background: none; border: none; cursor: pointer; color: #ff3b30; padding: 5px;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.2s;
}
.btn-icon-delete:hover { transform: scale(1.1); }
.btn-icon-delete svg { width: 20px; height: 20px; }

.hint { font-size: 13px; color: #666; margin-bottom: 20px; line-height: 1.4; text-align: center; }

.input-box { margin-bottom: 15px; }
.field-label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; font-weight: 500; }

.amount-input {
    width: 100%; font-size: 20px; font-weight: bold; text-align: left;
    border: 1px solid #ddd; border-radius: 8px; padding: 10px; outline: none;
    background-color: #ffffff; color: #222;
    box-sizing: border-box;
}
.amount-input:focus { border-color: #34c759; }

.date-input {
    width: 100%; height: 42px; padding: 0 10px;
    border: 1px solid #ddd; border-radius: 8px;
    font-size: 15px; color: #222; background: #fff;
    box-sizing: border-box;
}

.project-select-btn {
    width: 100%; height: 42px;
    background: #ffffff; border: 1px solid #ddd; border-radius: 8px;
    padding: 0 12px; display: flex; align-items: center; justify-content: space-between;
    cursor: pointer; font-size: 14px; color: #222;
    transition: border-color 0.2s;
}
.project-select-btn:hover { border-color: #bbb; }
.project-select-btn .placeholder { color: #999; }
.project-select-btn .selected-value { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px; }
.project-select-btn .arrow { font-size: 10px; color: #666; }

.actions { display: flex; gap: 10px; margin-top: 25px; }

.btn-cancel { 
    flex: 1; padding: 10px; background: #eee; border: none; border-radius: 6px; cursor: pointer; 
    color: #333; font-weight: 500; 
}
.btn-cancel:hover { background: #e0e0e0; }

.btn-confirm { flex: 1; padding: 10px; background: #34c759; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
</style>