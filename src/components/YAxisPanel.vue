<script setup>
import { computed } from 'vue';

/**
 * * --- МЕТКА ВЕРСИИ: v1.2-DYNAMIC-PADDING ---
 * * ВЕРСИЯ: 1.2 - Добавлен проп bottomPadding
 * ДАТА: 2025-11-18
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (NEW) Добавлен prop `bottomPadding` (default: 90).
 * 2. (UPDATE) `.y-axis-content` теперь использует стиль `bottom: ...px`.
 * Это нужно, чтобы убирать отступ в модальном окне графиков, где нет итогов дня.
 */

const props = defineProps({
  yLabels: { 
    type: Array, 
    required: true,
    default: () => [] 
  },
  // 🟢 v1.2: Отступ снизу (для учета блока итогов или его отсутствия)
  bottomPadding: {
    type: Number,
    default: 90 // По умолчанию для HomeView (высота итогов)
  }
});

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
    <!-- 🟢 v1.2: Динамический bottom -->
    <div class="y-axis-content" :style="{ bottom: props.bottomPadding === 90 ? 'var(--appearance-summaries-height, 90px)' : props.bottomPadding + 'px' }">
      <div v-for="(label, index) in formattedLabels" :key="index" class="y-label">
        {{ label }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.y-axis-panel {
  width: 100%;
  height: 100%;
  overflow: hidden; 
  position: relative; 
  background-color: var(--y-axis-panel-bg);
  border-right: 1px solid var(--y-axis-panel-border);
  box-sizing: border-box;
}

.y-axis-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  
  /* bottom задается инлайново через style */
  
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  text-align: right;
  padding: 0 5px;
  box-sizing: border-box;

  /* Отступы для выравнивания тиков с линиями графика ChartJS */
  padding-top: 10px; 
  padding-bottom: 10px;
}

.y-label {
  font-size: 0.7em;
  color: var(--y-axis-label-color);
  height: 15px;
  line-height: 15px;
  user-select: none;
  white-space: nowrap;
}
</style>
