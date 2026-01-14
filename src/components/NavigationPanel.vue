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
    <button class="nav-arrow" @click="changeView(-1)">▼</button>
  </div>
</template>

<style scoped>
.nav-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0;
  box-sizing: border-box;
  background-color: var(--nav-panel-bg);
  border-right: 1px solid var(--nav-panel-border);
}

.nav-arrow {
  border: none;
  background: none;
  color: var(--nav-arrow-color);
  font-size: 1.8em;
  cursor: pointer;
  transition: color 0.2s, transform 0.2s;
  padding: 8px;
  border-radius: 4px;
}

.nav-arrow:hover {
  color: var(--nav-arrow-hover);
  background: rgba(255, 255, 255, 0.05);
  transform: scale(1.1);
}

.nav-arrow:active {
  transform: scale(0.95);
}
</style>
