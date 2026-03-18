<script setup>
import { computed } from 'vue';
import { Doughnut } from 'vue-chartjs';
import 'chart.js/auto';

const props = defineProps({
  rows: {
    type: Array,
    default: () => []
  }
});

const MAX_GROUP_ITEMS = 8;
const GREEN_PALETTE = ['#10b981', '#34d399', '#6ee7b7', '#059669', '#22c55e', '#4ade80', '#86efac', '#bbf7d0'];
const RED_PALETTE = ['#ef4444', '#f87171', '#fca5a5', '#dc2626', '#fb7185', '#f97316', '#fdba74', '#fecaca'];

const formatMoney = (value) => {
  const amount = Number(value) || 0;
  return `₸${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(amount)}`;
};

const getOperationKind = (row) => {
  if (row?.type === 'Доход') return 'income';
  if (row?.type === 'Расход') return 'expense';
  return null;
};

const normalizeGroupLabel = (value, fallback) => {
  const safe = String(value || '').trim();
  return safe || fallback;
};

const buildRatioItems = () => {
  let income = 0;
  let expense = 0;

  props.rows.forEach((row) => {
    const amount = Math.abs(Number(row?.amount) || 0);
    if (row?.type === 'Доход') income += amount;
    if (row?.type === 'Расход') expense += amount;
  });

  return [
    { label: 'Доход', total: income, color: GREEN_PALETTE[0] },
    { label: 'Расход', total: expense, color: RED_PALETTE[0] }
  ].filter((item) => item.total > 0);
};

const foldGroupedItems = (items) => {
  if (items.length <= MAX_GROUP_ITEMS) return items;

  const head = items.slice(0, MAX_GROUP_ITEMS - 1);
  const tail = items.slice(MAX_GROUP_ITEMS - 1);
  const rest = tail.reduce(
    (acc, item) => {
      acc.income += item.income;
      acc.expense += item.expense;
      return acc;
    },
    { label: 'Остальное', income: 0, expense: 0 }
  );

  return [...head, rest];
};

const buildGroupedItems = (field, fallback) => {
  const grouped = new Map();

  props.rows.forEach((row) => {
    const kind = getOperationKind(row);
    if (!kind) return;

    const label = normalizeGroupLabel(row?.values?.[field], fallback);
    if (!grouped.has(label)) {
      grouped.set(label, { label, income: 0, expense: 0 });
    }

    const bucket = grouped.get(label);
    bucket[kind] += Math.abs(Number(row?.amount) || 0);
  });

  return foldGroupedItems(
    Array.from(grouped.values())
      .filter((item) => item.income > 0 || item.expense > 0)
      .sort((a, b) => (b.income + b.expense) - (a.income + a.expense))
  );
};

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      callbacks: {
        label(context) {
          const label = context.label || '';
          const value = Number(context.raw) || 0;
          const datasetLabel = context.dataset?.label ? `${context.dataset.label}: ` : '';
          return `${label} • ${datasetLabel}${formatMoney(value)}`;
        }
      }
    }
  }
};

const chartCards = computed(() => {
  const ratioItems = buildRatioItems();
  const groupedCards = [
    {
      key: 'projects',
      title: 'По проектам',
      note: 'Внешнее кольцо: доход. Внутреннее: расход.',
      items: buildGroupedItems('Проект', 'Без проекта')
    },
    {
      key: 'categories',
      title: 'По категориям',
      note: 'Внешнее кольцо: доход. Внутреннее: расход.',
      items: buildGroupedItems('Категория', 'Без категории')
    },
    {
      key: 'contractors',
      title: 'По контрагентам',
      note: 'Внешнее кольцо: доход. Внутреннее: расход.',
      items: buildGroupedItems('Контрагент', 'Без контрагента')
    },
    {
      key: 'accounts',
      title: 'По счетам',
      note: 'Внешнее кольцо: доход. Внутреннее: расход.',
      items: buildGroupedItems('Счет', 'Без счета')
    },
    {
      key: 'owners',
      title: 'Компании / Физлица',
      note: 'Внешнее кольцо: доход. Внутреннее: расход.',
      items: buildGroupedItems('Компания/Физлицо', 'Без владельца')
    }
  ];

  const ratioCard = {
    key: 'ratio',
    title: 'Доход / Расход',
    note: 'Соотношение по текущим фильтрам таблицы.',
    hasData: ratioItems.length > 0,
    data: {
      labels: ratioItems.map((item) => item.label),
      datasets: [
        {
          data: ratioItems.map((item) => item.total),
          backgroundColor: ratioItems.map((item) => item.color),
          borderWidth: 0,
          hoverOffset: 6
        }
      ]
    },
    legend: ratioItems
  };

  const restCards = groupedCards.map((card) => ({
    key: card.key,
    title: card.title,
    note: card.note,
    hasData: card.items.length > 0,
    data: {
      labels: card.items.map((item) => item.label),
      datasets: [
        {
          label: 'Доход',
          data: card.items.map((item, index) => item.income),
          backgroundColor: card.items.map((_, index) => GREEN_PALETTE[index % GREEN_PALETTE.length]),
          borderWidth: 0,
          weight: 1.1,
          hoverOffset: 5
        },
        {
          label: 'Расход',
          data: card.items.map((item) => item.expense),
          backgroundColor: card.items.map((_, index) => RED_PALETTE[index % RED_PALETTE.length]),
          borderWidth: 0,
          weight: 0.86,
          hoverOffset: 5
        }
      ]
    },
    legend: card.items
  }));

  return [ratioCard, ...restCards].map((card) => ({
    ...card,
    options: baseChartOptions
  }));
});
</script>

<template>
  <div class="journal-charts-panel">
    <div class="journal-charts-stack">
      <section v-for="card in chartCards" :key="card.key" class="journal-chart-card">
        <div class="journal-chart-card-header">
          <h4 class="journal-chart-card-title">{{ card.title }}</h4>
          <p class="journal-chart-card-note">{{ card.note }}</p>
        </div>

        <template v-if="card.hasData">
          <div class="journal-chart-canvas-wrap">
            <Doughnut :data="card.data" :options="card.options" />
          </div>

          <div class="journal-chart-legend">
            <div v-for="item in card.legend" :key="`${card.key}-${item.label}`" class="journal-chart-legend-row">
              <div class="journal-chart-legend-label">
                <span
                  class="journal-chart-legend-dot"
                  :style="{ background: card.key === 'ratio' ? item.color : 'linear-gradient(135deg, #10b981 0%, #ef4444 100%)' }"
                ></span>
                <span class="journal-chart-legend-text">{{ item.label }}</span>
              </div>

              <div v-if="card.key === 'ratio'" class="journal-chart-legend-values ratio">
                <span class="legend-total">{{ formatMoney(item.total) }}</span>
              </div>

              <div v-else class="journal-chart-legend-values">
                <span class="legend-income">+ {{ formatMoney(item.income) }}</span>
                <span class="legend-expense">- {{ formatMoney(item.expense) }}</span>
              </div>
            </div>
          </div>
        </template>

        <div v-else class="journal-chart-empty">
          Нет данных по текущим фильтрам
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.journal-charts-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  background: var(--ai-pane-bg);
}

.journal-charts-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.journal-chart-card {
  border: 1px solid var(--ai-pane-border);
  border-radius: 14px;
  background: var(--ai-pane-surface);
  padding: 12px;
}

.journal-chart-card-header {
  margin-bottom: 10px;
}

.journal-chart-card-title {
  margin: 0;
  color: var(--ai-pane-text);
  font-size: 13px;
  font-weight: var(--fw-semi, 600);
}

.journal-chart-card-note {
  margin: 4px 0 0;
  color: var(--ai-pane-muted);
  font-size: 11px;
  line-height: 1.35;
}

.journal-chart-canvas-wrap {
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: 360px;
  min-height: 220px;
}

.journal-chart-legend {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.journal-chart-legend-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.journal-chart-legend-label {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.journal-chart-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex-shrink: 0;
}

.journal-chart-legend-text {
  color: var(--ai-pane-text);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.journal-chart-legend-values {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.journal-chart-legend-values.ratio {
  gap: 0;
}

.legend-income,
.legend-expense,
.legend-total {
  font-size: 11px;
  font-weight: var(--fw-semi, 600);
}

.legend-income {
  color: #10b981;
}

.legend-expense {
  color: #ef4444;
}

.legend-total {
  color: var(--ai-pane-text);
}

.journal-chart-empty {
  min-height: 180px;
  display: grid;
  place-items: center;
  color: var(--ai-pane-muted);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 1024px) {
  .journal-charts-panel {
    padding: 10px;
  }

  .journal-chart-card {
    padding: 10px;
  }

  .journal-chart-canvas-wrap {
    min-height: 200px;
  }

  .journal-chart-legend-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
