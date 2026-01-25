<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

/**
 * * --- КОМПОНЕНТ: BaseSelect v4.5 - OWNER LABEL SUPPORT ---
 * * ВЕРСИЯ: 4.5
 * * ДАТА: 2025-12-14
 * * ИЗМЕНЕНИЯ:
 * 1. (UI) Добавлена поддержка `subLabel` для отображения владельца (компании/физлица) серым цветом.
 * 2. (CSS) Обновлена структура отображения выбранного элемента и опций списка.
 */

const props = defineProps({
  modelValue: { type: [String, Number, Object, Array], default: null },
  options: { type: Array, default: () => [] }, // { value, label, subLabel, rightText, tooltip, isSpecial, isHeader, isActionRow }
  placeholder: { type: String, default: 'Выберите...' },
  label: { type: String, default: '' }, 
  disabled: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'change']);

const isOpen = ref(false);
const containerRef = ref(null);

const selectedOptions = computed(() => {
  if (props.multiple) {
    const vals = Array.isArray(props.modelValue) ? props.modelValue : [];
    return props.options.filter(o => vals.includes(o.value) && !o.isHeader && !o.isActionRow);
  }
  const single = props.options.find(o => o.value === props.modelValue && !o.isHeader && !o.isActionRow);
  return single ? [single] : [];
});

const displayText = computed(() => {
  if (!props.multiple) return selectedOptions.value[0]?.label || '';
  if (!selectedOptions.value.length) return '';
  if (selectedOptions.value.length <= 2) return selectedOptions.value.map(o => o.label).join(', ');
  return `${selectedOptions.value.length} выбрано`;
});

const toggle = () => {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
};

const selectOption = (option) => {
  if (option.isHeader || option.isActionRow || option.disabled) return;
  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : [];
    const idx = current.indexOf(option.value);
    if (idx !== -1) current.splice(idx, 1); else current.push(option.value);
    emit('update:modelValue', current);
    emit('change', current);
  } else {
    emit('update:modelValue', option.value);
    emit('change', option.value);
    isOpen.value = false;
  }
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
        
        <!-- СОСТОЯНИЕ 1: ЗНАЧЕНИЕ ВЫБРАНО -->
        <div v-if="selectedOptions.length && displayText" class="filled-state">
          <span class="small-label">{{ label }}</span>
          <div class="value-row">
             <div class="text-group">
                 <span class="selected-text">{{ displayText }}</span>
                 <span v-if="!multiple && selectedOptions[0]?.subLabel" class="sub-text">{{ selectedOptions[0].subLabel }}</span>
             </div>
             <span v-if="!multiple && selectedOptions[0]?.rightText" class="right-text">{{ selectedOptions[0].rightText }}</span>
          </div>
        </div>

        <!-- СОСТОЯНИЕ 2: ПУСТО (Плейсхолдер) -->
        <span v-else class="placeholder">{{ placeholder }}</span>
        
      </div>
      <span class="arrow">▼</span>
    </div>

    <!-- Список -->
    <transition name="fade">
      <ul v-if="isOpen" class="options-list">
        <li 
          v-for="(option, index) in options" 
          :key="index"
          class="list-item-wrapper"
          :class="{ 
             'is-header': option.isHeader, 
             'is-special': option.isSpecial,
             'is-action-row': option.isActionRow,
             'is-selected': multiple ? (Array.isArray(modelValue) && modelValue.includes(option.value)) : option.value === modelValue
          }"
          :title="option.tooltip || ''"
          @click.stop="selectOption(option)"
        >
          <!-- 1. Заголовок группы -->
          <div v-if="option.isHeader" class="group-header">
            {{ option.label }}
          </div>

          <!-- 2. Слот для действий (Кнопки) -->
          <div v-else-if="option.isActionRow" class="action-row-container" @click.stop>
             <slot name="action-item" :option="option"></slot>
          </div>

          <!-- 3. Обычная опция -->
          <div v-else class="option-row">
            <div class="option-left-group">
                <span class="option-label">{{ option.label }}</span>
                <!-- 🟢 subLabel в списке -->
                <span v-if="option.subLabel" class="option-sub">{{ option.subLabel }}</span>
            </div>
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
  height: 54px; /* Дефолт для десктопа */
  padding: 0 14px;
  background: #FFFFFF;
  border: 1px solid #E0E0E0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

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

.filled-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  height: 100%;
  padding-top: 4px;
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
  overflow: hidden; /* Предотвращает вываливание */
}

/* Группа текста (Название + Компания) */
.text-group {
  display: flex;
  align-items: baseline;
  overflow: hidden;
  white-space: nowrap;
  flex-grow: 1;
  margin-right: 8px;
}

.selected-text {
  font-size: 15px;
  color: #1a1a1a;
  font-weight: 500;
  white-space: nowrap;
}

/* 🟢 Стиль для subLabel в триггере */
.sub-text {
  font-size: 13px;
  color: #999; /* Бледно-серый */
  font-weight: 400;
  margin-left: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.right-text {
  font-size: 13px;
  color: #999;
  flex-shrink: 0;
}

.placeholder { 
  font-size: 15px;
  color: #aaa;
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
  max-height: 280px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.list-item-wrapper {
  padding: 12px 14px;
  cursor: pointer;
  font-size: 15px;
  color: #1a1a1a;
  transition: background-color 0.15s;
  border-bottom: 1px solid #f5f5f5;
}
.list-item-wrapper:last-child { border-bottom: none; }

/* Hover для обычных опций */
.list-item-wrapper:not(.is-header):not(.is-action-row):hover { background-color: #f2f2f2; }
.list-item-wrapper.is-selected { background-color: #e8e8e8; font-weight: 500; }

/* Стили заголовка */
.list-item-wrapper.is-header {
  background-color: #f9f9f9;
  color: #888;
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 600;
  cursor: default;
  padding-top: 8px;
  padding-bottom: 8px;
  letter-spacing: 0.5px;
}

/* Стили Action Row (Контейнер для кнопок) */
.list-item-wrapper.is-action-row {
  padding: 0;
  cursor: default;
  background-color: #fff;
  border-top: 1px solid #eee;
  position: sticky;
  bottom: 0;
  z-index: 2010;
}

.option-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.option-left-group {
    display: flex;
    align-items: baseline;
    flex-grow: 1;
    overflow: hidden;
    white-space: nowrap;
    margin-right: 8px;
}

.option-label {
    color: #1a1a1a;
}

/* 🟢 Стиль для subLabel в списке */
.option-sub {
    font-size: 13px;
    color: #aaa;
    margin-left: 8px;
    font-weight: 400;
}

.option-right { text-align: right; font-size: 0.9em; color: #aaa; flex-shrink: 0; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; transform-origin: top; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: scaleY(0.95); }

/* 🟢 MOBILE OPTIMIZATION */
@media (max-width: 600px), (max-height: 900px) {
  .select-trigger {
    height: 38px; /* Уменьшаем высоту */
    padding: 0 10px;
  }
  .selected-text, .placeholder {
    font-size: 12px; /* Чуть меньше шрифт */
  }
  .sub-text {
      font-size: 11px; /* Чуть меньше сабтекст */
      margin-left: 6px;
  }
  .small-label {
    font-size: 10px;
    margin-bottom: -2px; /* Подтягиваем лейбл */
  }
  .filled-state {
    padding-top: 2px;
  }
  .list-item-wrapper {
    padding: 10px 12px; /* Уменьшаем отступы в списке */
    font-size: 14px;
  }
  .option-sub {
      font-size: 12px;
  }
}
</style>
