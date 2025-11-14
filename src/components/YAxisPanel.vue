<script setup>
import { computed } from 'vue';

/**
 * * --- МЕТКА ВЕРСИИ: v1.1-DEFENSIVE ---
 * * ВЕРСИЯ: 1.1 - Добавлено значение по умолчанию
 * ДАТА: 2025-11-07
 *
 * ЧТО ИСПРАВЛЕНО:
 * 1. (FIX) Добавлено `default: () => []` в prop `yLabels`.
 * 2. Это предотвращает сбой "Cannot read... (reading 'map')"
 * при первом рендеринге, если HomeView передает `undefined`.
 */

const props = defineProps({
  // ОЖИДАЕМ ЧИСЛА (например: [16000000, 14000000, ..., 0])
  yLabels: { 
    type: Array, 
    required: true,
    default: () => [] // <-- 🔴 ИСПРАВЛЕНИЕ (v1.1)
  }
});

/**
 * Компактное форматирование БЕЗ десятичных:
 * - >= 1 000 000 000  -> "N млрд"
 * - >= 1 000 000      -> "N млн"
 * - >= 1 000          -> "N тыс"
 * - иначе целое число
 * Пример: 1_000_000 -> "1 млн", 100_000 -> "100 тыс", 2_000_000_000 -> "2 млрд"
 */
function formatCompact(n) {
  if (n === null || n === undefined) return '';
  const sign = n < 0 ? '-' : '';
  const val = Math.abs(Number(n) || 0);

  const B = 1_000_000_000;
  const M = 1_000_000;
  const K = 1_000;

  if (val >= B) return `${sign}${Math.round(val / B)} млрд`;
  if (val >= M) return `${sign}${Math.round(val / M)} млн`;
  if (val >= K) return `${sign}${Math.round(val / K)} тыс`;
  return `${sign}${Math.round(val)}`;
}

const formattedLabels = computed(() => (props.yLabels || []).map(formatCompact));
</script>

<template>
  <div class="y-axis-panel">
    <div class="y-axis-content">
      <div v-for="(label, index) in formattedLabels" :key="index" class="y-label">
        {{ label }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.y-axis-panel {
  width: 100%;
  height: 100%; /* Занимает 100% родителя */
  overflow: hidden; 
  position: relative; 
  
  /* Стилизация */
  background-color: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
  box-sizing: border-box;
}

.y-axis-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;

  /* ВАЖНО: оставляем ровно как у вас,
     чтобы низ НЕ смещался и учитывал высоту блока итогов */
  bottom: 90px; 
  
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  text-align: right;
  padding: 0 5px;
  box-sizing: border-box;

  /* Отступы, чтобы выровнять метки с графиком — оставляю без изменений */
  padding-top: 10px; 
  padding-bottom: 10px;
}

.y-label {
  font-size: 0.7em;
  color: #777;
  height: 15px;
  line-height: 15px;
  user-select: none;
  white-space: nowrap;
}
</style>