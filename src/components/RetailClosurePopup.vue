<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';
import BaseSelect from './BaseSelect.vue';
import ConfirmationPopup from './ConfirmationPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v1.4 - RETAIL UI UPDATE ---
 * * ВЕРСИЯ: 1.4
 * * ДАТА: 2025-12-03
 * * ИЗМЕНЕНИЯ:
 * 1. (UI) Изменен порядок полей в режиме просмотра (Read-Only).
 * 2. (UI) Изменен заголовок суммы на "Отработали".
 * 3. (UI) Сумма выводится без минуса (абсолютное значение).
 */

const props = defineProps({
  operationToEdit: { type: Object, default: null }
});

const emit = defineEmits(['close', 'confirm', 'save', 'delete']);
const mainStore = useMainStore();

const isEditMode = computed(() => !!props.operationToEdit);
const title = computed(() => isEditMode.value ? 'Списание (Розница)' : 'Закрытие смены (Розница)');
const btnText = computed(() => isEditMode.value ? 'Закрыть' : 'Внести корректировку');

// Поля формы (для создания)
const amount = ref('');
const dateValue = ref(new Date().toISOString().slice(0, 10));
const selectedProjectId = ref(null);
const inputRef = ref(null);
const isSaving = ref(false);

const showDeleteConfirm = ref(false);

// --- ДАННЫЕ ДЛЯ ПРОСМОТРА (READONLY) ---
const displayData = computed(() => {
    if (!props.operationToEdit) return {};
    const op = props.operationToEdit;
    
    // Проект
    let projName = '---';
    if (op.projectId) {
        if (typeof op.projectId === 'object') projName = op.projectId.name;
        else {
            const p = mainStore.projects.find(x => x._id === op.projectId);
            if (p) projName = p.name;
        }
    }

    // Категория
    let catName = '---';
    if (op.categoryId) {
        if (typeof op.categoryId === 'object') catName = op.categoryId.name;
        else {
            const c = mainStore.categories.find(x => x._id === op.categoryId);
            if (c) catName = c.name;
        }
    }

    // Компания
    let compName = '---';
    if (op.companyId) {
        if (typeof op.companyId === 'object') compName = op.companyId.name;
        else {
            const c = mainStore.companies.find(x => x._id === op.companyId);
            if (c) compName = c.name;
        }
    } else if (op.individualId) {
         if (typeof op.individualId === 'object') compName = op.individualId.name;
         else {
             const i = mainStore.individuals.find(x => x._id === op.individualId);
             if (i) compName = i.name;
         }
    }

    // Счет (если есть, хотя у списания работ счета нет, но вдруг)
    // Обычно у списания розницы accountId = null. 
    // Но если вдруг логика изменится и мы будем списывать деньги, то покажем.
    // В данном контексте "Счет поступления" скорее относится к тому, куда пришли деньги в авансе,
    // но в самой операции списания (Expense без счета) этой информации нет. 
    // Если пользователь просит "Счет поступления", возможно он имеет в виду "На какой счет" упали деньги ранее?
    // Но в операции списания работ счета нет. Оставим поле, если оно будет заполнено.
    let accName = '---'; 
    if (op.accountId) {
         if (typeof op.accountId === 'object') accName = op.accountId.name;
         else {
             const a = mainStore.accounts.find(x => x._id === op.accountId);
             if (a) accName = a.name;
         }
    } else {
        accName = 'Без счета (Акт)';
    }

    return {
        date: new Date(op.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
        amount: formatNumber(Math.abs(op.amount)), // Абсолютное значение
        project: projName,
        category: catName,
        company: compName,
        account: accName,
        client: 'Розничные клиенты',
        description: op.description || 'Списание выполненных работ'
    };
});

// 🟢 FILTERED PROJECTS (Для создания)
const projectOptions = computed(() => {
  // Список ID проектов с долгами из стора
  const allowedIds = new Set(mainStore.projectsWithRetailDebts || []);
  
  return mainStore.projects
    .filter(p => allowedIds.has(p._id))
    .map(p => ({ value: p._id, label: p.name }));
});

const onInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = formatNumber(raw);
};

const handleConfirm = () => {
    const val = parseFloat(amount.value.replace(/\s/g, ''));
    if (!val || val <= 0) return;
    if (!selectedProjectId.value) {
        alert("Выберите проект!");
        return;
    }

    isSaving.value = true;

    const payload = { 
        amount: val, 
        projectId: selectedProjectId.value, 
        date: dateValue.value 
    };
    
    emit('confirm', payload);
};

const askDelete = () => { showDeleteConfirm.value = true; };
const confirmDelete = () => {
    emit('delete', props.operationToEdit);
    showDeleteConfirm.value = false;
};

onMounted(() => {
    if (!isEditMode.value) {
        if (projectOptions.value.length === 1) {
            selectedProjectId.value = projectOptions.value[0].value;
        }
        nextTick(() => inputRef.value?.focus());
    }
});
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <div class="header-row">
         <h3>{{ title }}</h3>
         <!-- Кнопка удаления (только в режиме просмотра) -->
         <button v-if="isEditMode" class="btn-icon-delete" @click="askDelete" title="Удалить">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
         </button>
      </div>
      
      <!-- 🟢 1. РЕЖИМ ПРОСМОТРА (READONLY) -->
      <div v-if="isEditMode" class="readonly-view">
          
          <!-- Сумма (Отработали) -->
          <div class="info-row main-amount">
              <span class="label">Отработали:</span>
              <!-- Цвет текста обычный (черный/темный), так как это не "расход денег", а "закрытие обязательств" -->
              <span class="value sum-text">{{ displayData.amount }} ₸</span>
          </div>

          <div class="divider"></div>

          <!-- Порядок полей по запросу -->
          
          <!-- 1. Счет поступления (если есть) -->
          <div class="info-row" v-if="displayData.account !== 'Без счета (Акт)'">
              <span class="label">Счет поступления:</span>
              <span class="value">{{ displayData.account }}</span>
          </div>

          <!-- 2. На какую компанию -->
          <div class="info-row">
              <span class="label">Компания:</span>
              <span class="value">{{ displayData.company }}</span>
          </div>

          <!-- 3. Из какого проекта -->
          <div class="info-row">
              <span class="label">Проект:</span>
              <span class="value">{{ displayData.project }}</span>
          </div>

          <!-- 4. По какой категории -->
          <div class="info-row">
              <span class="label">Категория:</span>
              <span class="value">{{ displayData.category }}</span>
          </div>

          <!-- 5. Какого числа закрыли -->
          <div class="info-row">
              <span class="label">Дата закрытия:</span>
              <span class="value">{{ displayData.date }}</span>
          </div>
          
      </div>
      
      <!-- 🟢 2. РЕЖИМ СОЗДАНИЯ (ФОРМА) - Без изменений -->
      <div v-else>
          <p class="hint">Введите сумму выполненных работ для списания обязательств перед розничными клиентами.</p>
          
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

          <div class="input-box">
             <label class="field-label">Дата</label>
             <input type="date" v-model="dateValue" class="date-input" />
          </div>
          
          <div class="input-spacing">
             <BaseSelect
                v-model="selectedProjectId"
                :options="projectOptions"
                label="Проект"
                placeholder="Выберите проект"
             />
             <p v-if="projectOptions.length === 0" class="empty-hint">
                 Нет проектов с активными предоплатами от розницы.
             </p>
          </div>
      </div>
      
      <div class="actions">
        <!-- Кнопка Закрыть (В режиме просмотра) -->
        <button v-if="isEditMode" class="btn-cancel" @click="$emit('close')">
            Закрыть
        </button>
        
        <!-- Кнопки создания -->
        <template v-else>
            <button class="btn-cancel" @click="$emit('close')">Отмена</button>
            <button class="btn-confirm" @click="handleConfirm" :disabled="!amount || isSaving || !selectedProjectId">
                {{ isSaving ? 'Сохранение...' : 'Внести корректировку' }}
            </button>
        </template>
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
  pointer-events: auto; /* Prevent click-through */
  backdrop-filter: blur(2px);
}
.popup-content {
  background: #fff; padding: 25px; border-radius: 12px; width: 360px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2); display: flex; flex-direction: column;
}

.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
h3 { margin: 0; color: #222; font-size: 1.2rem; font-weight: 700; }

.btn-icon-delete {
    background: none; border: none; cursor: pointer; color: #ff3b30; padding: 5px;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.2s;
}
.btn-icon-delete:hover { transform: scale(1.1); }
.btn-icon-delete svg { width: 20px; height: 20px; }

/* Readonly Styles */
.readonly-view { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
.info-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; }
.info-row .label { color: #888; }
.info-row .value { color: #222; font-weight: 600; text-align: right; }

.main-amount { margin-top: 5px; font-size: 16px; }
.sum-text { color: #222; font-weight: 800; font-size: 18px; } /* Жирный черный для "Отработали" */

.divider { height: 1px; background: #eee; margin: 5px 0; }

/* Form Styles */
.hint { font-size: 13px; color: #666; margin-bottom: 20px; line-height: 1.4; text-align: center; }
.empty-hint { font-size: 12px; color: #999; margin-top: 5px; font-style: italic; }

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