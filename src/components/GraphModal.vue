<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import YAxisPanel from './YAxisPanel.vue';
import GraphRenderer from './GraphRenderer.vue';

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const isLoading = ref(true);
const yAxisLabels = ref([]);
const currentViewMode = ref('12d');
const today = ref(new Date());
const visibleDays = ref([]);
const currentMonthStart = ref(new Date());
const pastCount = ref(0);   // сколько месяцев добавлено в прошлое
const futureCount = ref(0); // сколько месяцев добавлено в будущее

// --- Хелперы ---
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const _getDateKey = (date) => `${date.getFullYear()}-${getDayOfYear(date)}`;

const formatCurrency = (val) => {
  const safe = Number(val) || 0;
  const absVal = Math.abs(safe);
  const formatted = formatNumber(absVal);
  const currency = '₸';
  if (safe < 0) return `- ${currency} ${formatted}`;
  return `${currency} ${formatted}`;
};

const isPersonalTransferWithdrawal = (op) => !!op &&
  op.transferPurpose === 'personal' &&
  op.transferReason === 'personal_use' &&
  (op.isWithdrawal === true || op.isTransfer === true || op.type === 'transfer');

// Текущий баланс (на сегодня, не зависит от диапазона)
const currentBalanceString = computed(() => formatCurrency(mainStore.currentTotalBalance || 0));

const rangeStartDate = computed(() => {
  const base = currentMonthStart.value;
  return new Date(base.getFullYear(), base.getMonth() - pastCount.value, 1);
});

const rangeEndDate = computed(() => {
  const base = currentMonthStart.value;
  // Конец последнего месяца в диапазоне (включая будущие)
  return new Date(base.getFullYear(), base.getMonth() + futureCount.value + 1, 0);
});

const generateVisibleDays = () => {
  const startDate = rangeStartDate.value;
  const endDate = rangeEndDate.value;
  const days = [];
  let cursor = new Date(startDate);
  let id = 0;
  while (cursor <= endDate) {
    days.push({
      id,
      date: new Date(cursor),
      isToday: sameDay(cursor, today.value),
      dayOfYear: getDayOfYear(cursor),
      dateKey: _getDateKey(cursor)
    });
    id += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  visibleDays.value = days;
};

const loadGraphData = async () => {
  isLoading.value = true;
  await nextTick();
  try {
    // IMPORTANT: Graph modal must not mutate global projection/timeline range.
    // Load only operations for the modal's local range.
    if (mainStore.fetchOperationsRange) {
      await mainStore.fetchOperationsRange(rangeStartDate.value, rangeEndDate.value);
    }
    generateVisibleDays();
  } catch (error) {
    console.error("GraphModal: Ошибка загрузки данных:", error);
  } finally {
    isLoading.value = false;
  }
};

const pickModeBySpan = (days) => {
  if (days <= 35) return '1m';
  if (days <= 100) return '3m';
  if (days <= 200) return '6m';
  return '1y';
};

const refreshDataForRange = () => {
  const start = rangeStartDate.value;
  const end = rangeEndDate.value;
  const spanDays = Math.max(1, Math.floor((end - start) / 86400000) + 1);
  const mode = pickModeBySpan(spanDays);
  currentViewMode.value = mode;
  loadGraphData();
};

const onChangeView = (newMode) => {
  if (newMode === currentViewMode.value) return;
  currentViewMode.value = newMode;
  loadGraphData();
};

onMounted(() => {
  const t = new Date(); t.setHours(0, 0, 0, 0); today.value = t; currentMonthStart.value = new Date(t.getFullYear(), t.getMonth(), 1);
  generateVisibleDays();
  refreshDataForRange();
});

const currentMonthLabel = computed(() => {
  return currentMonthStart.value.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
});

const extendFuture = () => {
  futureCount.value += 1;
  generateVisibleDays();
  refreshDataForRange();
};
const extendPast = () => {
  pastCount.value += 1;
  generateVisibleDays();
  refreshDataForRange();
};

const monthsLabels = computed(() => {
  const items = [];
  const base = currentMonthStart.value;
  for (let i = pastCount.value; i >= 1; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    items.push({ date: d, label: d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }), active: false });
  }
  items.push({ date: base, label: base.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }), active: true });
  for (let i = 1; i <= futureCount.value; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    items.push({ date: d, label: d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }), active: false });
  }
  return items;
});

const handleMonthClick = (dateObj) => {
  if (!dateObj) return;
  currentMonthStart.value = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
  pastCount.value = 0;
  futureCount.value = 0;
  generateVisibleDays();
  refreshDataForRange();
};

// Баланс на конец выбранного диапазона (учитывая скрытые, если включены)
const rangeEndBalance = computed(() => {
  const cutoff = rangeEndDate.value ? rangeEndDate.value.getTime() : Date.now();
  const todayEnd = today.value ? new Date(today.value) : new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayCutoff = todayEnd.getTime();

  // Базовые остатки: текущие балансы уже учитывают все операции до сегодня
  const balances = new Map();
  (mainStore.currentAccountBalances || []).forEach(acc => {
    balances.set(String(acc._id), Number(acc.balance || 0));
  });

  // Добавляем будущие операции до cutoff
  const opsSource = mainStore.getAllRelevantOps || [];
  const ops = Array.isArray(opsSource) ? opsSource : [];
  ops.forEach(op => {
    if (!op || !op.date) return;
    const t = new Date(op.date).getTime();
    if (t <= todayCutoff) return;       // уже в текущих балансах
    if (t > cutoff) return;             // за пределами выбранного диапазона
    if (op.isWorkAct) return;

    const amt = Math.abs(Number(op.amount) || 0);

    if (op.isTransfer || op.type === 'transfer') {
      const fromId = op.fromAccountId?._id || op.fromAccountId;
      const toId = op.toAccountId?._id || op.toAccountId;
      if (fromId && balances.has(String(fromId))) {
        balances.set(String(fromId), (balances.get(String(fromId)) || 0) - amt);
      }
      if (!isPersonalTransferWithdrawal(op) && toId && balances.has(String(toId))) {
        balances.set(String(toId), (balances.get(String(toId)) || 0) + amt);
      }
    } else {
      const accId = op.accountId?._id || op.accountId;
      if (!accId || !balances.has(String(accId))) return;
      if (op.type === 'income') {
        balances.set(String(accId), (balances.get(String(accId)) || 0) + (Number(op.amount) || 0));
      } else if (op.type === 'expense' || op.isWithdrawal) {
        balances.set(String(accId), (balances.get(String(accId)) || 0) - amt);
      }
    }
  });

  let total = 0;
  balances.forEach(v => { total += v; });
  return total;
});

const rangeEndBalanceString = computed(() => formatCurrency(rangeEndBalance.value));
const visibilityMode = computed(() => mainStore.accountVisibilityMode);
const showOpenActive = computed(() => visibilityMode.value === 'all' || visibilityMode.value === 'open');
const showHiddenActive = computed(() => visibilityMode.value === 'all' || visibilityMode.value === 'hidden');
const openEyeIcon = computed(() => (showOpenActive.value ? 'eye' : 'eye-off'));
const hiddenEyeIcon = computed(() => (showHiddenActive.value ? 'eye' : 'eye-off'));
const toggleVisibility = () => mainStore.cycleAccountVisibilityMode();
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
  <div class="modal-content graph-modal-content">

      <div class="modal-header">
        <div class="header-left">
          <div class="balance-label">Текущий баланс</div>
          <div class="balance-value">{{ currentBalanceString }}</div>
        </div>
        <div class="header-center eye-toggle">
          <button class="eye-btn icon-only" @click="mainStore.toggleOpenVisibility()" :class="{ active: showOpenActive }" :title="showOpenActive ? 'Отключить открытые счета' : 'Включить открытые счета'">
            <svg v-if="openEyeIcon === 'eye'" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
              <line x1="2" y1="22" x2="22" y2="2"></line>
            </svg>
          </button>
          <button class="eye-btn icon-only" @click="mainStore.toggleHiddenVisibility()" :class="{ active: showHiddenActive }" :title="showHiddenActive ? 'Отключить скрытые счета' : 'Включить скрытые счета'">
            <svg v-if="hiddenEyeIcon === 'eye'" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
              <line x1="2" y1="22" x2="22" y2="2"></line>
            </svg>
          </button>
        </div>
        <div class="header-right">
          <div class="balance-label">Будущий баланс</div>
          <div class="balance-value">{{ rangeEndBalanceString }}</div>
        </div>
      </div>

      <div class="graph-modal-body">
        <aside class="modal-left-panel">
          <div class="y-axis-wrapper">
             <YAxisPanel :yLabels="yAxisLabels" :bottom-padding="0" />
          </div>
        </aside>

        <main class="modal-main-content">
          <div v-if="isLoading" class="loading-indicator">
            <div class="spinner"></div>
            <p>Загрузка данных...</p>
          </div>
          <div v-else class="graph-wrapper">
            <GraphRenderer
              v-if="visibleDays.length"
              :visibleDays="visibleDays"
              @update:yLabels="yAxisLabels = $event"
              :show-summaries="false"
              :animate="true"
            />
          </div>
        </main>
      </div>
      <div class="modal-footer">
        <div class="month-nav-footer">
          <div class="month-group">
            <button class="month-nav-btn" @click="extendPast" title="Добавить месяц в прошлое">←</button>
            <div class="month-list">
              <button
                v-for="(item, idx) in monthsLabels"
                :key="idx"
                class="month-chip"
                :class="{ active: item.active }"
                @click="handleMonthClick(item.date)"
              >
                {{ item.label }}
              </button>
            </div>
            <button class="month-nav-btn" @click="extendFuture" title="Добавить месяц в будущее">→</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.75);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000; backdrop-filter: blur(3px);
}
.modal-content {
  width: 95vw; max-width: 1600px; height: 75vh; max-height: 900px;
  background: var(--color-background); border-radius: 12px;
  border: 1px solid var(--color-border); box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; overflow: hidden;
}
.modal-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 15px 24px;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-background-soft);
  column-gap: 32px;
}

.header-left,
.header-right {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.header-left { align-items: flex-start; }
.header-right { align-items: flex-end; text-align: right; }

.balance-label {
  font-size: 12px;
  color: var(--color-text-soft);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.balance-value {
  font-weight: 700;
  font-size: 1.2em;
  color: var(--color-text);
}

.header-center.eye-toggle {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.eye-btn {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid var(--btn-widget-border);
  background: var(--btn-widget-bg);
  color: var(--btn-widget-color);
  padding: 0;
  cursor: pointer;
  transition: all 0.2s ease;
}
.eye-btn.icon-only { gap: 0; }
.eye-btn:hover {
  border-color: var(--btn-widget-border-hover, var(--btn-widget-border));
  color: var(--btn-widget-color-hover, var(--color-primary));
}
.eye-btn.active {
  background: var(--color-primary, #34c759);
  border-color: transparent;
  color: #fff;
}

.month-nav {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  width: 100%;
}
.month-nav.center { flex: 1; justify-content: center; }
.month-nav-btn {
  width: 26px; height: 26px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-size: 14px;
  padding: 0;
}
.month-nav-btn:hover {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.month-nav-btn:active { transform: scale(0.96); }

.graph-modal-body {
  flex-grow: 1; display: flex; overflow: hidden;
  background-color: var(--color-background);
}

.modal-footer {
  border-top: 1px solid var(--color-border);
  background: var(--color-background-soft);
  padding: 8px 16px;
}
.month-nav-footer {
  display: flex;
  align-items: center;
  justify-content: center;
}
.month-group {
  display: flex;
  align-items: center;
  gap: 12px;
}
.month-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.month-chip {
  padding: 6px 12px;
  border-radius: 10px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  text-transform: capitalize;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.month-chip:hover { background: var(--color-background-mute); }
.month-chip.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

/* ЛЕВАЯ ПАНЕЛЬ */
.modal-left-panel {
  width: 80px; flex-shrink: 0;
  display: flex; flex-direction: column;
  background-color: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
}
.y-axis-wrapper {
  flex-grow: 1; min-height: 0; position: relative;
  padding-top: 12px;
}

/* ОСНОВНАЯ ОБЛАСТЬ */
.modal-main-content {
  flex-grow: 1; display: flex; flex-direction: column;
  overflow: hidden; position: relative;
}
.graph-wrapper {
  flex-grow: 1;
  width: 100%;
  height: 100%;
  padding: 0;
  box-sizing: border-box;

  /* Важно для кастомного tooltip в GraphRenderer:
     tooltip монтируется внутрь контейнера графика и позиционируется absolute. */
  position: relative;

  /* НЕ режем содержимое графика */
  overflow: visible;

  /* В flex-контейнерах иначе иногда схлопывается высота */
  min-height: 0;
}

.loading-indicator {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--color-text);
}
.spinner {
  width: 40px; height: 40px;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.graph-wrapper :deep(#chartjs-tooltip),
.graph-wrapper :deep(#chartjs-custom-tooltip) {
  z-index: 10;
}
</style>
