<script setup>
import { ref, computed, onMounted } from 'vue';

/**
 * * --- МЕТКА ВЕРСИИ: v1.3-FIXED-EMIT ---
 * * ВЕРСИЯ: 1.3 - Исправление бага "опоздания на 1 шаг"
 * ДАТА: 2024-01-21 (Предполагаемая дата исправления)
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. `changeView` теперь отправляет (`emit`) НОВЫЙ ключ, а не
 * старый `currentView.value.key` (который еще не успел обновиться).
 * 2. Добавлены "ЖУРНАЛЫ" для отслеживания кликов.
 */

// --- !!! ВАША МЕТКА !!! ---
('--- NavigationPanel.vue v1.3-FIXED-EMIT ЗАГРУЖЕН ---');


const emit = defineEmits(['change-view']);

const views = [
  { key: '12d', num: '12', unit: 'ДНЕЙ' },
  { key: '1m',  num: '1',  unit: 'МЕС' },
  { key: '3m',  num: '3',  unit: 'МЕС' },
  { key: '6m',  num: '6',  unit: 'МЕС' },
  { key: '1y',  num: '1',  unit: 'ГОД' }
];
const currentIndex = ref(0); // Стартуем с '12d'

const currentView = computed(() => views[currentIndex.value]);

// --- !!! ГЛАВНЫЙ ФИКС ЗДЕСЬ !!! ---
const changeView = (direction) => {
  const newIndex = currentIndex.value + direction;
  
  // Проверяем, что не вышли за границы массива
  if (newIndex >= 0 && newIndex < views.length) {
    currentIndex.value = newIndex;
    
    // --- ИСПРАВЛЕНИЕ ---
    // БЫЛО: emit('change-view', currentView.value.key); 
    // (Это отправляло СТАРОЕ значение, т.к. computed 'currentView' еще не обновился)
    
    // СТАЛО: Мы берем ключ напрямую из нового индекса
    const newKey = views[newIndex].key;
    
    // --- !!! ЛОГ !!! ---
    const logDir = direction > 0 ? '⬆️' : '⬇️';
    (`[ЖУРНАЛ] NavigationPanel: ${logDir} Переключил вид на ${newKey}`);

    emit('change-view', newKey); // Отправляем ПРАВИЛЬНЫЙ новый ключ
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
  }
};

onMounted(() => {
  // <— важно: сообщаем родителю стартовый режим
  const startKey = currentView.value.key;
  (`[ЖУРНАЛ] NavigationPanel: 🚀 Старт. Установлен вид ${startKey}`);
  emit('change-view', startKey);
});
</script>

<template>
  <div class="nav-panel">
    <button class="nav-arrow" @click="changeView(1)">▲</button>
    
    <div class="nav-display">
      <div class="nav-num">{{ currentView.num }}</div>
      <div class="nav-unit">{{ currentView.unit }}</div>
    </div>
    
    <button class="nav-arrow" @click="changeView(-1)">▼</button>
  </div>
</template>

<style scoped>
/* (Стили остаются без изменений) */
.nav-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 1rem;
  box-sizing: border-box;
  background-color: var(--nav-panel-bg);
  border-right: 1px solid var(--nav-panel-border);
}
.nav-arrow {
  border: none;
  background: none;
  color: var(--nav-arrow-color);
  font-size: 2em;
  cursor: pointer;
  transition: color 0.2s;
}
.nav-arrow:hover {
  color: var(--nav-arrow-hover);
}
.nav-display {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  user-select: none;
}
.nav-num {
  font-size: 2.5em;
  font-weight: bold;
  color: var(--nav-num-color);
  line-height: 1;
}
.nav-unit {
  font-size: 0.8em;
  color: var(--nav-unit-color);
  letter-spacing: 0.1em;
}
</style>
