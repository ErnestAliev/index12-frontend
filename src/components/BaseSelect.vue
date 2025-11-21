<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

/**
 * * --- КОМПОНЕНТ: BaseSelect v2.1 - PRO UI ---
 * * ВЕРСИЯ: 2.1 - Темный баланс и поддержка тем фокуса
 * * ДАТА: 2025-11-21
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. Цвет суммы (.option-right) изменен на темный (#1a1a1a).
 * 2. Спец-опция "Создать..." теперь выглядит как кнопка действия.
 * 3. Цвет активного бордера теперь берется из переменной var(--focus-color).
 */

const props = defineProps({
  modelValue: { type: [String, Number, Object], default: null },
  options: { type: Array, default: () => [] }, // { value, label, rightText, isSpecial }
  placeholder: { type: String, default: 'Выберите...' },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'change']);

const isOpen = ref(false);
const containerRef = ref(null);

const selectedOption = computed(() => {
  return props.options.find(o => o.value === props.modelValue);
});

const toggle = () => {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
};

const selectOption = (option) => {
  emit('update:modelValue', option.value);
  emit('change', option.value);
  isOpen.value = false;
};

const close = (e) => {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    isOpen.value = false;
  }
};

onMounted(() => document.addEventListener('click', close));
onBeforeUnmount(() => document.removeEventListener('click', close));
</script>

<template>
  <div class="base-select" ref="containerRef" :class="{ 'is-open': isOpen, 'is-disabled': disabled }">
    
    <!-- Триггер -->
    <div class="select-trigger" @click="toggle">
      <div class="trigger-content">
        <span v-if="selectedOption" class="selected-text">
          {{ selectedOption.label }}
          <!-- Баланс в выбранном состоянии (опционально, сейчас скрыт для чистоты) -->
          <!-- <span v-if="selectedOption.rightText" class="selected-right-text"> — {{ selectedOption.rightText }}</span> -->
        </span>
        <span v-else class="placeholder">{{ placeholder }}</span>
      </div>
      <span class="arrow">▼</span>
    </div>

    <!-- Список -->
    <transition name="fade">
      <ul v-if="isOpen" class="options-list">
        <li 
          v-for="option in options" 
          :key="option.value"
          class="option-item"
          :class="{ 'is-selected': option.value === modelValue, 'is-special': option.isSpecial }"
          @click="selectOption(option)"
        >
          <div class="option-row">
            <span class="option-left">{{ option.label }}</span>
            <!-- 🟢 ЦВЕТ БАЛАНСА ТЕПЕРЬ ТЕМНЫЙ (в CSS) -->
            <span v-if="option.rightText" class="option-right">{{ option.rightText }}</span>
          </div>
        </li>
      </ul>
    </transition>
  </div>
</template>

<style scoped>
.base-select {
  position: relative;
  width: 100%;
  font-family: inherit;
  margin-bottom: 0; 
}

/* ТРИГГЕР */
.select-trigger {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  background: #FFFFFF;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  user-select: none;
  color: #1a1a1a;
  font-size: 15px;
}

/* 🟢 АКТИВНЫЙ БОРДЕР - ИСПОЛЬЗУЕТ ПЕРЕМЕННУЮ ТЕМЫ */
.base-select.is-open .select-trigger {
  border-color: var(--focus-color, #222);
  box-shadow: 0 0 0 2px var(--focus-shadow, rgba(34,34,34,0.1));
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.trigger-content {
  flex-grow: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.placeholder { color: #aaa; }
.arrow { font-size: 10px; color: #666; margin-left: 10px; transition: transform 0.2s; }
.base-select.is-open .arrow { transform: rotate(180deg); }

/* СПИСОК */
.options-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #FFFFFF;
  border: 1px solid var(--focus-color, #E0E0E0);
  border-top: none;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  z-index: 2000;
  max-height: 250px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.option-item {
  padding: 12px 14px;
  cursor: pointer;
  font-size: 15px;
  color: #1a1a1a;
  transition: background-color 0.15s;
  border-bottom: 1px solid #f5f5f5;
}
.option-item:last-child { border-bottom: none; }
.option-item:hover { background-color: #f2f2f2; }
.option-item.is-selected { background-color: #e8e8e8; font-weight: 500; }

/* LAYOUT ОПЦИИ */
.option-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.option-left {
  text-align: left;
  flex-grow: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 15px;
}

/* 🟢 СТИЛЬ БАЛАНСА (ТЕМНЫЙ) */
.option-right {
  text-align: right;
  white-space: nowrap;
  font-weight: 600;
  color: #1a1a1a; /* Темный цвет */
  opacity: 0.7;   /* Легкая прозрачность для иерархии */
  font-size: 0.9em;
}

/* 🟢 СТИЛЬ КНОПКИ "СОЗДАТЬ" */
.option-item.is-special {
  color: #1a1a1a;
  font-weight: 600;
  background-color: #FAFAFA;
  border-top: 1px solid #E0E0E0;
  font-style: normal; /* Убрали курсив */
  position: sticky;
  bottom: 0;
}
.option-item.is-special .option-left {
  display: flex;
  align-items: center;
}
.option-item.is-special:hover {
  background-color: #eee;
  color: #000;
}

/* Анимация */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; transform-origin: top; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: scaleY(0.95); }
</style>
