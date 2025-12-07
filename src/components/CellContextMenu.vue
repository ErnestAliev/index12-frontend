<script setup>
const emit = defineEmits(['select']);
</script>

<template>
  <div class="context-menu">
    <button class="btn-income" @click="emit('select', 'income')">
      + Доход
    </button>
    <button class="btn-expense" @click="emit('select', 'expense')">
      - Расход
    </button>
    <button class="btn-transfer" @click="emit('select', 'transfer')">
      Перевод
    </button>
  </div>
</template>

<style scoped>
.context-menu {
  position: absolute; 
  display: flex;
  gap: 5px;
  background-color: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
  z-index: 1001;
  /* 🟢 FIX: Запрет переноса строк и сжатия */
  white-space: nowrap;
  width: max-content;
}

.context-menu button {
  border: none;
  color: white;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9em;
  /* 🟢 FIX: Текст внутри кнопки тоже не должен переноситься */
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-income {
  background-color: var(--color-primary);
}
.btn-income:hover {
  background-color: #28a745;
}
.btn-expense {
  background-color: var(--color-danger);
}
.btn-expense:hover {
  background-color: #d63027;
}

/* 🟢 ОБНОВЛЕННЫЙ ЦВЕТ ДЛЯ КНОПКИ ПЕРЕВОДА */
.btn-transfer {
  background-color: #2F3340; 
}
.btn-transfer:hover {
  background-color: #3a3f50;
}
</style>