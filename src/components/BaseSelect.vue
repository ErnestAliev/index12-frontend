<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

/**
 * * --- КОМПОНЕНТ: BaseSelect v3.0 - FLOATING LABELS ---
 * * ВЕРСИЯ: 3.0 - Поддержка плавающих заголовков (как на макете)
 * * ДАТА: 2025-11-23
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (PROPS) Добавлен проп `label` для отображения маленького заголовка.
 * 2. (UI) Логика отображения:
 * - Если выбрано значение: показываем label (сверху, мелко) + value (снизу, крупно).
 * - Если не выбрано: показываем placeholder (по центру, крупно).
 */

const props = defineProps({
  modelValue: { type: [String, Number, Object], default: null },
  options: { type: Array, default: () => [] }, // { value, label, rightText, isSpecial }
  placeholder: { type: String, default: 'Выберите...' },
  label: { type: String, default: '' }, // 🟢 Новый проп для заголовка
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
        
        <!-- 🟢 СОСТОЯНИЕ 1: ЗНАЧЕНИЕ ВЫБРАНО -->
        <div v-if="selectedOption && selectedOption.value !== null" class="filled-state">
          <span class="small-label">{{ label }}</span>
          <div class="value-row">
             <span class="selected-text">{{ selectedOption.label }}</span>
             <span v-if="selectedOption.rightText" class="right-text">{{ selectedOption.rightText }}</span>
          </div>
        </div>

        <!-- 🟢 СОСТОЯНИЕ 2: ПУСТО (Плейсхолдер) -->
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  margin-bottom: 0; 
}

/* ТРИГГЕР */
.select-trigger {
  width: 100%;
  height: 54px; /* Высота как на скриншоте */
  padding: 0 14px;
  background: #FFFFFF;
  border: 1px solid #E0E0E0; /* Светлый бордер по умолчанию */
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

/* Активный бордер */
.base-select.is-open .select-trigger {
  border-color: var(--focus-color, #28B8A0);
  box-shadow: 0 0 0 1px var(--focus-shadow, rgba(40, 184, 160, 0.2));
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.trigger-content {
  flex-grow: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
}

/* Стили для выбранного состояния */
.filled-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  height: 100%;
  padding-top: 4px; /* Небольшой отступ сверху */
}

.small-label {
  font-size: 11px;
  color: #999;
  line-height: 1.2;
  margin-bottom: 0px;
}

.value-row {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: baseline;
}

.selected-text {
  font-size: 15px;
  color: #1a1a1a;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.right-text {
  font-size: 13px;
  color: #999;
  margin-left: 8px;
}

/* Стили для плейсхолдера */
.placeholder { 
  font-size: 15px;
  color: #aaa; /* Серый цвет как на скрине */
}

.arrow { 
  font-size: 10px; 
  color: #666; 
  margin-left: 10px; 
  transition: transform 0.2s; 
}
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

.option-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.option-left {
  text-align: left;
  flex-grow: 1;
}
.option-right {
  text-align: right;
  font-size: 0.9em;
  color: #aaa;
}

/* СТИЛЬ КНОПКИ "СОЗДАТЬ" */
.option-item.is-special {
  color: #1a1a1a;
  font-weight: 600;
  background-color: #FAFAFA;
  border-top: 1px solid #E0E0E0;
  position: sticky;
  bottom: 0;
}
.option-item.is-special:hover {
  background-color: #eee;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; transform-origin: top; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: scaleY(0.95); }
</style>