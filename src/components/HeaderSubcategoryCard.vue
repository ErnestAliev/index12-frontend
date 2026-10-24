<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
const store = useMainStore();
const planned = computed({ get: () => !!store.dashboardForecastState.subcategories, set: value => store.setForecastState('subcategories', value) });
const rows = computed(() => planned.value ? store.futureSubcategoryBreakdowns : store.currentSubcategoryBreakdowns);
defineExpose({ getSnapshot: () => ({ key: 'subcategories', title: 'Подкатегории', type: 'subcategories', showFutureBalance: planned.value, rows: rows.value }) });
</script>
<template>
  <div class="dashboard-card subcategory-card" data-testid="subcategory-widget">
    <div class="card-title-container">
      <div class="card-title">Подкатегории</div>
      <div class="card-actions"><button type="button" class="action-square-btn" :class="{ active: planned }" @click.stop="planned = !planned" :title="planned ? 'Показать факт' : 'Показать план'">↗</button></div>
    </div>
    <div class="subcategory-rows">
      <div v-for="row in rows" :key="row._id" class="subcategory-row">
        <div class="subcategory-name" :title="row.name">{{ row.name }}</div>
        <div class="subcategory-values">
          <span v-if="row.income" class="income">Доход +{{ formatNumber(row.income) }} ₸</span>
          <span v-if="row.expense" class="expense">Расход −{{ formatNumber(row.expense) }} ₸</span>
          <span v-if="row.transfers" class="transfer">Переводы {{ formatNumber(row.transfers) }} ₸</span>
        </div>
      </div>
      <p v-if="!rows.length" class="empty">Нет операций за выбранный период</p>
    </div>
  </div>
</template>
<style scoped>
.subcategory-card { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; box-sizing: border-box; padding: 8px 12px; color: var(--text-main); background: var(--widget-background); }
.card-title-container { display: flex; align-items: center; justify-content: space-between; min-height: 32px; margin-bottom: 8px; flex-shrink: 0; }
.card-title { font-size: 13px; font-weight: 600; }
.action-square-btn { width: 22px; height: 22px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--btn-widget-bg); color: var(--text-main); cursor: pointer; }
.action-square-btn.active { color: var(--color-primary); }
.subcategory-rows { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.subcategory-row { margin-bottom: 6px; font-size: 12px; }
.subcategory-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-soft); }
.subcategory-values { display: flex; flex-wrap: wrap; gap: 2px 8px; font-variant-numeric: tabular-nums; }
.income { color: var(--color-primary); }
.expense { color: var(--color-danger); }
.transfer { color: var(--text-main); }
.empty { font-size: 12px; color: var(--text-mute); }
</style>
