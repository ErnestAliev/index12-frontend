<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';
import BaseSelect from './BaseSelect.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';

const props = defineProps({
  operationToEdit: { type: Object, default: null }
});

const emit = defineEmits(['close', 'confirm', 'save', 'delete']);
const mainStore = useMainStore();

const isEditMode = computed(() => !!props.operationToEdit);
const title = computed(() => isEditMode.value ? 'Редактор списания' : 'Закрытие смены (Розница)');
// Согласно Сценарию 2, кнопка должна называться "Внести корректировку"
const btnText = computed(() => isEditMode.value ? 'Сохранить' : 'Внести корректировку');

// Поля формы
const amount = ref('');
const dateValue = ref(new Date().toISOString().slice(0, 10));
const selectedProjectId = ref(null);
const inputRef = ref(null);
const isSaving = ref(false);

// Удаление
const showDeleteConfirm = ref(false);

// Опции проектов
const projectOptions = computed(() => {
  return mainStore.projects.map(p => ({ value: p._id, label: p.name }));
});

const onInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = formatNumber(raw);
};

const handleConfirm = () => {
    const val = parseFloat(amount.value.replace(/\s/g, ''));
    if (!val || val <= 0) return;
    isSaving.value = true;

    const payload = { 
        amount: val, 
        projectId: selectedProjectId.value, // Строго один проект
        date: dateValue.value 
    };
    
    if (isEditMode.value) {
        emit('save', { id: props.operationToEdit._id, data: payload });
    } else {
        emit('confirm', { 
            amount: payload.amount, 
            projectIds: payload.projectId ? [payload.projectId] : [], // Совместимость с API
            date: payload.date 
        });
    }
};

// Логика удаления
const askDelete = () => { showDeleteConfirm.value = true; };
const confirmDelete = () => {
    emit('delete', props.operationToEdit);
    showDeleteConfirm.value = false;
};

onMounted(() => {
    if (isEditMode.value) {
        const op = props.operationToEdit;
        amount.value = formatNumber(Math.abs(op.amount));
        if (op.date) {
            dateValue.value = new Date(op.date).toISOString().slice(0, 10);
        }
        if (op.projectId) {
            selectedProjectId.value = typeof op.projectId === 'object' ? op.projectId._id : op.projectId;
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
      
      <p class="hint" v-if="!isEditMode">Введите сумму выполненных работ для списания обязательств перед розничными клиентами.</p>
      
      <!-- СУММА -->
      <div class="input-box">
         <label class="field-label">Сумма выполненных работ</label>
         <input 
            type="text" 
            v-model="amount" 
            @input="onInput" 
            placeholder="0 ₸" 
            ref="inputRef"
            class="amount-input"
         />
      </div>

      <!-- ДАТА -->
      <div class="input-box">
         <label class="field-label">Дата</label>
         <input type="date" v-model="dateValue" class="date-input" />
      </div>
      
      <!-- ПРОЕКТ -->
      <div class="input-spacing">
         <BaseSelect
            v-model="selectedProjectId"
            :options="projectOptions"
            label="Проект"
            placeholder="Выберите проект"
         />
      </div>
      
      <div class="actions">
        <button class="btn-cancel" @click="$emit('close')">Отмена</button>
        <button class="btn-confirm" @click="handleConfirm" :disabled="!amount || isSaving">
            {{ isSaving ? 'Сохранение...' : btnText }}
        </button>
      </div>
    </div>

    <ConfirmationPopup 
        v-if="showDeleteConfirm" 
        title="Отмена корректировки" 
        message="Вы уверены? Сумма долга перед клиентом будет восстановлена." 
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
  background: #fff; padding: 25px; border-radius: 12px; width: 360px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2); display: flex; flex-direction: column;
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
.input-spacing { margin-bottom: 20px; }
.field-label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; font-weight: 500; }

.amount-input {
    width: 100%; font-size: 24px; font-weight: bold; text-align: center;
    border: 1px solid #ddd; border-radius: 8px; padding: 12px; outline: none;
    background-color: #ffffff; color: #222;
    box-sizing: border-box;
}
.amount-input:focus { border-color: #34c759; }

.date-input {
    width: 100%; height: 48px; padding: 0 10px;
    border: 1px solid #ddd; border-radius: 8px;
    font-size: 15px; color: #222; background: #fff;
    box-sizing: border-box;
}

.actions { display: flex; gap: 10px; margin-top: 10px; }

.btn-cancel { 
    flex: 1; padding: 12px; background: #eee; border: none; border-radius: 6px; cursor: pointer; 
    color: #333; font-weight: 500; 
}
.btn-cancel:hover { background: #e0e0e0; }

.btn-confirm { flex: 1; padding: 12px; background: #34c759; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; white-space: nowrap; }
.btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
</style>