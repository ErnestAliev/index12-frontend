<script setup>
// Этот компонент очень простой: он просто принимает 
// сообщение и "спрашивает" Да (confirm) или Нет (close)
defineProps({
  title: { type: String, default: 'Подтвердите действие' },
  message: { type: String, required: true }
});
const emit = defineEmits(['close', 'confirm']);
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <h3>{{ title }}</h3>
      
      <p class="message">{{ message }}</p>
          
      <div class="popup-actions">
        <button @click="$emit('close')" class="btn-submit btn-submit-secondary">
          Отмена
        </button>
        <button @click="$emit('confirm')" class="btn-submit btn-submit-delete">
          Да, удалить
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Стили похожи на EntityPopup, 
  но с другим набором кнопок 
*/
.popup-overlay {
  position: fixed; top: 0; left: 0;
  width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.7); /* Чуть темнее фон */
  display: flex; 
  justify-content: center; 
  align-items: center;
  z-index: 1001; /* На один слой ВЫШЕ, чем OperationPopup */
  overflow-y: auto;
}
.popup-content {
  background: #F4F4F4;
  padding: 2rem;
  border-radius: 12px;
  color: #1a1a1a;
  width: 100%;
  max-width: 400px; /* Немного уже */
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  margin: 1rem;
}
h3 {
  color: #1a1a1a;
  margin-top: 0;
  margin-bottom: 1.5rem;
  text-align: center; /* Центрируем заголовок */
  font-size: 20px;
  font-weight: 600;
}
.message {
  font-size: 1.1em;
  color: #333;
  text-align: center;
  margin-bottom: 2rem;
  line-height: 1.5;
}
.popup-actions {
  display: flex;
  margin-top: 1.5rem;
  gap: 10px; 
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
  flex: 1 1 0; 
}

/* Новая кнопка "Отмена" (светло-серая) */
.btn-submit-secondary {
  background-color: #e0e0e0;
  color: #333;
  font-weight: 500;
}
.btn-submit-secondary:hover {
  background-color: #d1d1d1;
}

/* Кнопка "Удалить" (красная) */
.btn-submit-delete {
  background-color: #FF3B30;
}
.btn-submit-delete:hover {
  background-color: #d93025;
}
</style>