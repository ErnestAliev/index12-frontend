<script setup>
defineProps({
  title: { type: String, default: 'Информация' },
  message: { type: String, required: true },
  buttonText: { type: String, default: 'Понятно' }
});
const emit = defineEmits(['close']);
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <h3>{{ title }}</h3>
      <p class="message">{{ message }}</p>
      <div class="popup-actions">
        <button @click="$emit('close')" class="btn-submit">
          {{ buttonText }}
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
  display: flex; justify-content: center; align-items: center;
  z-index: 5000; /* Поверх всего */
  backdrop-filter: blur(3px);
}

.popup-content {
  background: #282828; /* Темный фон под стиль мобильной версии */
  border: 1px solid #444;
  padding: 24px;
  border-radius: 16px;
  color: #fff;
  width: 85%;
  max-width: 320px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  animation: fadeIn 0.2s ease-out;
  text-align: center;
}

h3 {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.message {
  font-size: 15px;
  color: #ccc;
  margin-bottom: 24px;
  line-height: 1.5;
}

.popup-actions {
  display: flex;
  justify-content: center;
}

.btn-submit {
  width: 100%;
  height: 48px;
  background-color: #34C759;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}
.btn-submit:active {
    background-color: #2da84e;
    transform: scale(0.98);
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>