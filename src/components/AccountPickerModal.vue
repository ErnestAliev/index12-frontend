<script setup>
import { ref } from 'vue';

/**
 * * --- МЕТКА ВЕРСИИ: v2.1 - HTML HINT ---
 * * ВЕРСИЯ: 2.1 - Поддержка HTML в подсказке
 * * ДАТА: 2025-11-19
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (UI) `hintText` теперь рендерится через `v-html`, чтобы поддерживать цвета.
 */

const props = defineProps({
  initialSelectedIds: {
    type: Array,
    default: () => []
  },
  allAccounts: {
    type: Array,
    default: () => []
  },
  hintText: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['close', 'save']);

const localSelectedIds = ref(new Set(props.initialSelectedIds));

const toggleAccount = (accountId) => {
  if (localSelectedIds.value.has(accountId)) {
    localSelectedIds.value.delete(accountId);
  } else {
    localSelectedIds.value.add(accountId);
  }
};

const handleSave = () => {
  emit('save', Array.from(localSelectedIds.value));
  emit('close');
};

const handleCancel = () => {
  emit('close');
};
</script>

<template>
  <div class="picker-overlay" @click.self="handleCancel">
    <div class="picker-content">
      
      <h4>Выберите счета</h4>
      
      <!-- 🟢 v2.1: Используем v-html для цветного текста -->
      <div v-if="hintText" class="picker-hint" v-html="hintText"></div>
      
      <div class="account-list-scroll">
        <label v-for="acc in allAccounts" :key="acc._id" class="account-item">
          <input
            type="checkbox"
            :checked="localSelectedIds.has(acc._id)"
            @change="toggleAccount(acc._id)"
          />
          <span class="account-name">{{ acc.name }}</span>
        </label>
        <div v-if="!allAccounts.length" class="account-item-empty">
          Сначала создайте счета.
        </div>
      </div>
      
      <div class="picker-footer">
        <button @click="handleCancel" class="btn btn-secondary">
          Отмена
        </button>
        <button @click="handleSave" class="btn btn-primary">
          Готово
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7); 
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1002; 
  overflow-y: auto;
}

.picker-content {
  width: 100%;
  max-width: 400px;
  background: #F4F4F4;
  border-radius: 12px;
  color: #1a1a1a;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  margin: 1rem;
  display: flex;
  flex-direction: column;
  overflow: hidden; 
}

h4 {
  color: #1a1a1a;
  margin: 0;
  padding: 1.5rem 1.5rem 1rem 1.5rem;
  font-size: 20px;
  font-weight: 600;
  text-align: center;
  border-bottom: 1px solid #E0E0E0;
}

.picker-hint {
  padding: 0.8rem 1.5rem 0;
  font-size: 0.9em;
  color: #666;
  text-align: center;
  line-height: 1.4;
}

.account-list-scroll {
  padding: 1rem 1.5rem;
  max-height: 40vh; 
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: background-color 0.2s;
}
.account-item:hover {
  background-color: #E9E9E9;
}
.account-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  margin-right: 12px;
  accent-color: #222222; 
}
.account-name {
  font-size: 16px;
  color: #333;
  font-weight: 500;
}
.account-item-empty {
  text-align: center;
  color: #888;
  padding: 1rem;
}

.picker-footer {
  display: flex;
  gap: 10px;
  padding: 1rem 1.5rem;
  border-top: 1px solid #E0E0E0;
  background-color: #F9F9F9;
}

.btn {
  flex: 1; 
  height: 48px;
  padding: 0 1rem;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-secondary {
  background-color: #e0e0e0;
  color: #333;
  font-weight: 500;
}
.btn-secondary:hover {
  background-color: #d1d1d1;
}

.btn-primary {
  background-color: #222222;
  color: white;
}
.btn-primary:hover {
  background-color: #444444;
}
</style>
