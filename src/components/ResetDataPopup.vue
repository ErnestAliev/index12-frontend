<script setup>
import UiIcon from '@/components/UiIcon.vue';
import { ref } from 'vue';

defineProps({
  title: { type: String, required: true }
});

const emit = defineEmits(['close', 'confirm']);

// 🔴 ОПЕРАЦИИ по умолчанию ВКЛЮЧЕНЫ
// (самый частый сценарий - сбросить
// транзакции, но оставить настройки)
const options = ref({
  operations: true,
  accounts: false,
  companies: false,
  contractors: false,
  projects: false,
  categories: false
});
</script>

<template>
  <div class="popup-overlay" @mousedown.self="$emit('close')">
    <div class="popup-content">
      
      <div class="popup-header">
        <h3>{{ title }}</h3>
        <button type="button" @click="$emit('close')" class="close-btn ui-icon-button" aria-label="Закрыть"><UiIcon name="close" /></button>
      </div>

      <div class="popup-body">
        
        <div class="warning-box">
          <strong>ВНИМАНИЕ!</strong> Это действие необратимо.
          Выбранные данные будут **полностью удалены** из базы данных.
        </div>
        
        <p>Какие данные вы хотите удалить?</p>
        
        <div class="checkbox-list">
          <label>
            <input type="checkbox" v-model="options.operations" />
            <span>Все **Операции** (Доходы, Расходы, Переводы)</span>
          </label>
          <label>
            <input type="checkbox" v-model="options.accounts" />
            <span>Все **Счета** (и их начальные балансы)</span>
          </label>
          <label>
            <input type="checkbox" v-model="options.companies" />
            <span>Все **Компании**</span>
          </label>
          <label>
            <input type="checkbox" v-model="options.contractors" />
            <span>Все **Контрагенты**</span>
          </label>
          <label>
            <input type="checkbox" v-model="options.projects" />
            <span>Все **Проекты**</span>
          </label>
          <label>
            <input type="checkbox" v-model="options.categories" />
            <span>Все **Категории**</span>
          </label>
        </div>
        
      </div>

      <div class="popup-footer">
        <button @click="$emit('close')" class="btn btn-secondary">
          Отмена
        </button>
        <button @click="$emit('confirm', options)" class="btn btn-danger">
          Удалить выбранные
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
}

.popup-content {
  width: 100%;
  max-width: 450px;
  background-color: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  display: flex;
  flex-direction: column;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.popup-header h3 {
  margin: 0;
  font-size: 1.1em;
  color: var(--color-heading);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.8em;
  line-height: 1;
  color: #888;
  cursor: pointer;
  padding: 0;
}
.close-btn:hover {
  color: #fff;
}

.popup-body {
  padding: 1.25rem;
  color: var(--color-text);
}

.warning-box {
  background-color: rgba(255, 100, 100, 0.05);
  border: 1px solid var(--color-danger);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  font-size: 0.9em;
  margin-bottom: 1rem;
  color: var(--color-danger-light);
}
.warning-box strong {
  color: var(--color-danger);
  display: block;
  margin-bottom: 4px;
}

.popup-body p {
  margin-top: 0;
  margin-bottom: 0.75rem;
  color: var(--color-heading);
  font-weight: 500;
}

.checkbox-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.checkbox-list label {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 0.95em;
}
.checkbox-list input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin-right: 10px;
  accent-color: var(--color-danger);
}
.checkbox-list span strong {
  color: var(--color-heading);
}

.popup-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--color-border);
  background-color: rgba(0,0,0,0.1);
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 0.9em;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}
.btn-secondary {
  background-color: #555;
  color: #fff;
}
.btn-secondary:hover {
  background-color: #666;
}
.btn-danger {
  background-color: var(--color-danger);
  color: #fff;
}
.btn-danger:hover {
  background-color: #ff6b6b; /* Ярче при наведении */
}
</style>