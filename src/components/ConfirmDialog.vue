<template>
  <div v-if="show" class="dialog-overlay" @click.self="onCancel">
    <div class="dialog-box">
      <template v-if="loading">
        <h3 class="dialog-title">Удаление...</h3>
        <p class="dialog-message">Пожалуйста, подождите, обновляем данные.</p>
        <div class="progress-container">
          <div class="progress-bar"></div>
        </div>
      </template>
      <template v-else>
        <h3 class="dialog-title">{{ title }}</h3>
        <p class="dialog-message">{{ message }}</p>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="onCancel">{{ cancelText }}</button>
          <button class="btn-confirm" @click="onConfirm">{{ confirmText }}</button>
        </div>
      </template>
      <div v-if="loading" class="dialog-actions loading-actions">
        <button class="btn-cancel" disabled>Удаляем...</button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  show: Boolean,
  loading: { type: Boolean, default: false },
  title: { type: String, default: 'Подтверждение' },
  message: { type: String, required: true },
  confirmText: { type: String, default: 'Подтвердить' },
  cancelText: { type: String, default: 'Отмена' }
});

const emit = defineEmits(['confirm', 'cancel']);

function onConfirm() {
  if (props.loading) return;
  emit('confirm');
}

function onCancel() {
  if (props.loading) return;
  emit('cancel');
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dialog-box {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.dialog-title {
  margin: 0 0 12px 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text);
}

.dialog-message {
  margin: 0 0 24px 0;
  color: var(--color-text-mute);
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.loading-actions {
  justify-content: center;
  margin-top: 16px;
}

.btn-cancel,
.btn-confirm {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-cancel {
  background: var(--color-background-mute);
  color: var(--color-text);
}

.btn-cancel:hover {
  background: var(--color-background-soft);
}

.btn-confirm {
  background: var(--color-primary);
  color: white;
}

.btn-confirm:hover {
  opacity: 0.9;
}

.btn-cancel:disabled,
.btn-confirm:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.progress-container {
  width: 100%;
  height: 6px;
  background-color: var(--color-background-mute, #eee);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.progress-bar {
  width: 100%;
  height: 100%;
  background-color: var(--color-heading, #222);
  position: absolute;
  left: -100%;
  animation: indeterminate 1.5s infinite ease-in-out;
}

@keyframes indeterminate {
  0% { left: -100%; width: 50%; }
  50% { left: 25%; width: 50%; }
  100% { left: 100%; width: 50%; }
}
</style>
