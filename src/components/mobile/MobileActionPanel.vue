<script setup>
const emit = defineEmits(['action']);

const handleAction = (type) => {
  emit('action', type);
};
</script>

<template>
  <div class="mobile-actions-panel">
    <button class="action-btn btn-income" @click="handleAction('income')">
      + Доход
    </button>
    <button class="action-btn btn-expense" @click="handleAction('expense')">
      Расход
    </button>
    <button class="action-btn btn-transfer" @click="handleAction('transfer')">
      Перевод
    </button>
  </div>
</template>

<style scoped>
.mobile-actions-panel {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background-color: var(--color-background, #1a1a1a);
  border-top: 1px solid var(--color-border, #444);
  flex-shrink: 0;
  /* Фиксируем над BottomNav */
  z-index: 100;
}

.action-btn {
  flex: 1;
  height: 44px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s;
}

.action-btn:active {
  transform: scale(0.98);
}

.btn-income {
  background-color: var(--color-primary, #34c759);
}

.btn-expense {
  background-color: var(--color-danger, #ff3b30);
}

.btn-transfer {
  background-color: #3D3B3B; /* Темно-серый как на макете */
}
</style>