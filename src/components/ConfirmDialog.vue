<template>
  <div v-if="show" class="dialog-overlay" @click.self="onCancel">
    <div class="dialog-box">
      <h3 class="dialog-title">{{ title }}</h3>
      <p class="dialog-message">{{ message }}</p>
      <div class="dialog-actions">
        <button class="btn-cancel" @click="onCancel">{{ cancelText }}</button>
        <button class="btn-confirm" @click="onConfirm">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  show: Boolean,
  title: { type: String, default: 'Подтверждение' },
  message: { type: String, required: true },
  confirmText: { type: String, default: 'Подтвердить' },
  cancelText: { type: String, default: 'Отмена' }
});

const emit = defineEmits(['confirm', 'cancel']);

function onConfirm() {
  emit('confirm');
}

function onCancel() {
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
</style>
