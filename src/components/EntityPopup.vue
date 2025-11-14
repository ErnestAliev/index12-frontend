<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps({
  title: { type: String, default: 'Новая запись' },
  initialValue: { type: String, default: '' }
});

const emit = defineEmits(['close', 'save']);

const name = ref(props.initialValue);
const nameInput = ref(null);

onMounted(() => {
  // Автофокус на поле "Название"
  setTimeout(() => {
    if (nameInput.value) {
      nameInput.value.focus();
    }
  }, 100);
});

const handleSave = () => {
  if (name.value.trim()) {
    emit('save', name.value.trim());
  }
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <h3>{{ title }}</h3>
      
      <label>Название</label>
      <input 
        type="text" 
        v-model="name"
        placeholder="Введите название" 
        ref="nameInput" 
        class="form-input"
        @keyup.enter="handleSave"
      />
          
      <div class="popup-actions">
        <button @click="handleSave" class="btn-submit btn-submit-edit">
          Сохранить
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  Мы используем те же стили, что и в OperationPopup,
  чтобы дизайн был 100% одинаковым
*/
.popup-overlay {
  position: fixed; top: 0; left: 0;
  width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex; 
  justify-content: center; 
  align-items: center;
  z-index: 1000;
  overflow-y: auto;
}
.popup-content {
  background: #F4F4F4;
  padding: 2rem;
  border-radius: 12px;
  color: #1a1a1a;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  margin: 2rem 1rem;
}
h3 {
  color: #1a1a1a;
  margin-top: 0;
  margin-bottom: 2rem;
  text-align: left;
  font-size: 22px;
  font-weight: 600;
}
label {
  display: block; 
  margin-bottom: 0.5rem;
  margin-top: 1rem;
  color: #333;
  font-size: 14px;
  font-weight: 500;
}
.form-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  margin: 0;
  background: #FFFFFF;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  color: #1a1a1a;
  font-size: 15px;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
/* Используем черную обводку для режима "Редактирование" */
.form-input:focus {
  outline: none;
  border-color: #222222; 
  box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.2);
}
.popup-actions {
  display: flex;
  margin-top: 2rem;
}
.btn-submit {
  width: 100%;
  height: 50px;
  padding: 0 1rem;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.2s ease;
}
/* Используем черную кнопку "Сохранить" */
.btn-submit-edit {
  background-color: #222222;
}
.btn-submit-edit:hover {
  background-color: #444444;
}
</style>