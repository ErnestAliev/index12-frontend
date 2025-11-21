<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

/**
 * * --- КОМПОНЕНТ: BaseSelect v1.0 ---
 * * ОПИСАНИЕ: Кастомный селект для замены нативного.
 * * Поддерживает слот для кастомного отображения опций (слева/справа).
 */

const props = defineProps({
  modelValue: { type: [String, Number, Object], default: null },
  options: { type: Array, default: () => [] }, // { value, label, rightText, ... }
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
    
    <!-- Триггер (то, что видно когда закрыто) -->
    <div class="select-trigger" @click="toggle">
      <div class="trigger-content">
        <span v-if="selectedOption" class="selected-text">
          <!-- Если выбрано, показываем лейбл. Можно доработать, чтобы показывал и баланс, но обычно только имя -->
          {{ selectedOption.label }}
          <span v-if="selectedOption.rightText" class="selected-right-text"> — {{ selectedOption.rightText }}</span>
        </span>
        <span v-else class="placeholder">{{ placeholder }}</span>
      </div>
      <span class="arrow">▼</span>
    </div>

    <!-- Выпадающий список -->
    <transition name="fade">
      <ul v-if="isOpen" class="options-list">
        <li 
          v-for="option in options" 
          :key="option.value"
          class="option-item"
          :class="{ 'is-selected': option.value === modelValue, 'is-special': option.isSpecial }"
          @click="selectOption(option)"
        >
          <!-- Слот или дефолтное отображение -->
          <div class="option-row">
            <span class="option-left">{{ option.label }}</span>
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
}

/* ТРИГГЕР (Поле ввода) */
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
  transition: border-color 0.2s, box-shadow 0.2s;
  user-select: none;
}

.base-select.is-open .select-trigger {
  border-color: #222; /* Цвет активного бордера */
  border-bottom-left-radius: 0; /* Чтобы сливалось со списком */
  border-bottom-right-radius: 0;
}

.trigger-content {
  flex-grow: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  color: #1a1a1a;
  display: flex;
  justify-content: space-between; /* Чтобы выбранное значение тоже разъезжалось, если нужно */
}

.placeholder {
  color: #aaa;
}

.arrow {
  font-size: 10px;
  color: #666;
  margin-left: 10px;
}

/* СПИСОК ОПЦИЙ */
.options-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #FFFFFF;
  border: 1px solid #E0E0E0;
  border-top: none;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
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
  transition: background-color 0.2s;
  border-bottom: 1px solid #f0f0f0;
}
.option-item:last-child {
  border-bottom: none;
}

.option-item:hover {
  background-color: #f5f5f5;
}

.option-item.is-selected {
  background-color: #e9e9e9;
  font-weight: 500;
}

/* Разнесение по краям */
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
  margin-right: 10px;
}

.option-right {
  text-align: right;
  white-space: nowrap;
  font-weight: 600;
  color: #34c759; /* Зеленый цвет для баланса, как просили */
  font-size: 0.95em;
}

/* Спец. опция (Создать новый) */
.option-item.is-special {
  color: #007AFF;
  font-style: italic;
  background-color: #fafafa;
}
.option-item.is-special:hover {
  background-color: #f0f8ff;
}

/* Анимация */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
