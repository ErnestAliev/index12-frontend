<script setup>
defineProps({
  title: { type: String, default: 'Подтвердите действие' },
  message: { type: String, required: true },
  confirmText: { type: String, default: 'Да, удалить' }, // 🟢 Настраиваемый текст
  cancelText: { type: String, default: 'Отмена' }
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
          {{ cancelText }}
        </button>
        <button @click="$emit('confirm')" class="btn-submit btn-submit-delete">
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-overlay {
  position: fixed; top: 0; left: 0;
  width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex; 
  justify-content: center; 
  align-items: center;
  /* 🟢 FIX: Максимальный слой, чтобы перекрывать TransferListEditor (1100) и другие (3000) */
  z-index: 4000; 
  overflow-y: auto;
}

.popup-content {
  background: #F4F4F4;
  padding: 2rem;
  border-radius: 12px;
  color: #1a1a1a;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 15px 50px rgba(0, 0, 0, 0.4);
  margin: 1rem;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

h3 {
  color: #1a1a1a;
  margin-top: 0;
  margin-bottom: 1.5rem;
  text-align: center;
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

.btn-submit-secondary {
  background-color: #e0e0e0;
  color: #333;
  font-weight: 500;
}
.btn-submit-secondary:hover {
  background-color: #d1d1d1;
}

.btn-submit-delete {
  background-color: #FF3B30;
}
.btn-submit-delete:hover {
  background-color: #d93025;
}
</style>