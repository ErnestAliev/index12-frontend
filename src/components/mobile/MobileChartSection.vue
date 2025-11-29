<script setup>
import { ref } from 'vue';
import GraphRenderer from '@/components/GraphRenderer.vue';

// 🟢 Принимаем visibleDays как проп
const props = defineProps({
  visibleDays: { type: Array, default: () => [] }
});

const emit = defineEmits(['scroll']);

// Скролл оставляем локальным, так как это поведение UI
const scrollContainer = ref(null);
const onScroll = (e) => { emit('scroll', e.target.scrollLeft); };
const setScroll = (left) => { if (scrollContainer.value) scrollContainer.value.scrollLeft = left; };

defineExpose({ setScroll });
</script>

<template>
  <div class="mobile-chart-section">
    <div class="chart-scroll-area" ref="scrollContainer" @scroll="onScroll">
      <div class="chart-wide-wrapper">
        <!-- 🟢 Передаем пропс дальше в рендерер -->
        <GraphRenderer 
          v-if="visibleDays.length"
          :visibleDays="visibleDays"
          :animate="false"
          :showSummaries="true"
        />
        <div v-else class="loading-placeholder">
           Загрузка графика...
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-chart-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-background, #1a1a1a);
  border-top: 1px solid var(--color-border, #444);
  min-height: 0; 
}

.chart-scroll-area {
  flex-grow: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  position: relative;
}
.chart-scroll-area::-webkit-scrollbar { display: none; }

.chart-wide-wrapper {
  height: 100%;
  width: 300vw; /* 12 колонок */
}

.loading-placeholder {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #666;
    font-size: 12px;
}
</style>