<script setup>
import { computed } from 'vue';

// Snapshot helpers (used by AI snapshot aggregator)
const _pad2 = (n) => String(n).padStart(2, '0');
const _ymd = (d) => `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;
const _hourLabel = (h) => `${_pad2(h)}:00`;

import { useMainStore } from '@/stores/mainStore';
import MobileHourCell from './MobileHourCell.vue';

const props = defineProps({
  date: { type: Date, required: true },
  isToday: { type: Boolean, default: false },
  dateKey: { type: String, required: true }
});

// 🟢 FIX: Добавлен 'drop-operation' в emits
const emit = defineEmits(['show-menu', 'drop-operation']); 
const mainStore = useMainStore();

const operations = computed(() => {
  return mainStore.getOperationsForDay(props.dateKey);
});

const cells = computed(() => {
  const cellArray = [];
  const ops = operations.value;
  for (let i = 0; i < 24; i++) {
    cellArray.push({
      id: i,
      operation: ops.find(op => op.cellIndex === i) || null 
    });
  }
  return cellArray;
});

const headerDate = computed(() => {
  return props.date.toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
});

// Expose a snapshot so parents (and TheHeader-style snapshot builders) can include
// real operations with dates in the uiSnapshot.
// This enables queries like "ближайший доход/расход".
const getSnapshot = () => {
  const dayYmd = _ymd(props.date);
  const ops = Array.isArray(operations.value) ? operations.value : [];

  const rows = ops.map((op) => {
    const hour = Number(op?.cellIndex);
    const hh = Number.isFinite(hour) ? hour : null;

    // Build a stable datetime label based on the day + cell hour.
    const date = dayYmd;
    const time = (hh != null) ? _hourLabel(hh) : null;

    // Generic fields: we intentionally keep multiple aliases so backend can "guess".
    const amount = op?.amount ?? op?.sum ?? op?.value ?? op?.money ?? op?.tenge ?? op?.price ?? 0;
    const type = op?.type ?? op?.kind ?? op?.direction ?? null; // expected: income/expense
    const contractorName = op?.contractorName ?? op?.contractor ?? op?.counterpartyName ?? op?.counterparty ?? op?.partyName ?? op?.fromName ?? op?.toName ?? null;
    const projectName = op?.projectName ?? op?.project ?? op?.projectTitle ?? null;
    const companyName = op?.companyName ?? op?.company ?? null;

    return {
      id: op?.id ?? op?._id ?? null,
      date,
      time,
      dateStr: time ? `${date} ${time}` : date,
      cellIndex: op?.cellIndex ?? null,
      amount,
      amountText: (typeof amount === 'string' || typeof amount === 'number') ? String(amount) : null,
      type,
      contractorName,
      projectName,
      companyName,
      // Keep the original op for debugging (lightweight). Avoid huge nested blobs.
      _raw: {
        title: op?.title ?? op?.name ?? null,
        note: op?.note ?? op?.comment ?? null,
      }
    };
  });

  return {
    key: 'operationsDay',
    title: `Операции: ${headerDate.value}`,
    meta: {
      dateKey: props.dateKey,
      dayYmd,
      isToday: Boolean(props.isToday),
      rowsCount: rows.length,
    },
    rows,
  };
};

defineExpose({ getSnapshot });

const handleShowMenu = (payload) => {
    emit('show-menu', { ...payload, date: props.date });
};
</script>

<template>
  <div class="mobile-day-col" :class="{ today: isToday }">
    <div class="day-header">{{ headerDate }}</div>
    <div class="day-body">
      <!-- 🟢 FIX: Пробрасываем @drop-operation наверх -->
      <MobileHourCell 
        v-for="cell in cells" 
        :key="cell.id"
        :operation="cell.operation"
        :date-key="dateKey"
        :cell-index="cell.id"
        @show-menu="handleShowMenu"
        @drop-operation="(payload) => emit('drop-operation', payload)"
      />
    </div>
  </div>
</template>

<style scoped>
.mobile-day-col {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--color-border, #444);
  background-color: var(--color-background-soft, #282828);
  min-width: 0; 
}

.day-header {
  text-align: center;
  font-size: 11px;
  color: #888;
  padding: 8px 4px;
  border-bottom: 1px solid var(--color-border, #444);
  background-color: var(--color-background, #1a1a1a);
  font-weight: 500;
  text-transform: lowercase;
}

.mobile-day-col.today .day-header {
  color: var(--color-primary, #34c759);
  font-weight: 700;
}

.day-body {
  flex-grow: 1;
  overflow-y: auto; 
  scrollbar-width: none; 
}
.day-body::-webkit-scrollbar { display: none; }
</style>