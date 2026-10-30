<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

const mainStore = useMainStore();

const _toYmd = (d) => {
  const dd = new Date(d);
  if (Number.isNaN(dd.getTime())) return '';
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${dd.getFullYear()}-${pad2(dd.getMonth() + 1)}-${pad2(dd.getDate())}`;
};

// Получаем данные из стора
const currentTotal = computed(() => mainStore.currentTotalBalance);
const futureTotal = computed(() => mainStore.futureTotalBalance);
const currentAccountsCount = computed(() => mainStore.currentAccountBalances.length);
const futureAccountsCount = computed(() => mainStore.futureAccountBalances.length);

// 🟢 COMPACT FORMAT: dd.mm.yy
const todayStr = computed(() => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
});

// 🟢 COMPACT FORMAT: dd.mm.yy
const futureDateStr = computed(() => {
  const d = mainStore.projection?.rangeEndDate ? new Date(mainStore.projection.rangeEndDate) : new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
});

// Parse subtitle parts for highlighting (current)
const parsedCurrentSubtitle = computed(() => {
  const text = `Сейчас на ${currentAccountsCount.value} счетах`;
  const match = text.match(/^(\S+)(\s+.+?)(\d+)(.+)$/);
  if (match) {
    return {
      keyword: match[1],     // "Сейчас"
      middle: match[2],      // " на "
      count: match[3],       // count number
      after: match[4]        // " счетах"
    };
  }
  return { keyword: null, middle: '', count: null, after: text };
});

// Parse subtitle parts for highlighting (future)
const parsedFutureSubtitle = computed(() => {
  const text = `Будет на ${futureAccountsCount.value} счетах`;
  const match = text.match(/^(\S+)(\s+.+?)(\d+)(.+)$/);
  if (match) {
    return {
      keyword: match[1],     // "Будет"
      middle: match[2],      // " на "
      count: match[3],       // count number
      after: match[4]        // " счетах"
    };
  }
  return { keyword: null, middle: '', count: null, after: text };
});

// =========================
// =========================

</script>

<template>
  <div class="mobile-totals-wrapper">
    <!-- Левая карточка: Текущее -->
    <div class="total-card left-card">
      <div class="card-label">Всего на счетах<br>на текущий момент</div>
      <div class="card-value">
        <span class="currency">₸</span> {{ formatNumber(currentTotal) }}
      </div>
      <div class="card-sub">
        <template v-if="parsedCurrentSubtitle.keyword">
          <span class="subtitle-keyword">{{ parsedCurrentSubtitle.keyword }}</span>{{ parsedCurrentSubtitle.middle }}<span class="subtitle-count">{{ parsedCurrentSubtitle.count }}</span>{{ parsedCurrentSubtitle.after }}
        </template>
        <template v-else>
          Сейчас на {{ currentAccountsCount }} счетах
        </template>
        •
        <span class="green-text">до {{ todayStr }}</span>
      </div>
    </div>

    <!-- Разделитель -->
    <div class="divider"></div>

    <!-- Правая карточка: Будущее -->
    <div class="total-card right-card">
      <div class="card-label right-align">Всего на счетах<br>с учетом будущих</div>
      <div class="card-value right-align">
        {{ formatNumber(futureTotal) }} <span class="currency">₸</span>
      </div>
      <div class="card-sub right-align">
        <template v-if="parsedFutureSubtitle.keyword">
          <span class="subtitle-keyword">{{ parsedFutureSubtitle.keyword }}</span>{{ parsedFutureSubtitle.middle }}<span class="subtitle-count">{{ parsedFutureSubtitle.count }}</span>{{ parsedFutureSubtitle.after }}
        </template>
        <template v-else>
          Будет на {{ futureAccountsCount }} счетах
        </template>
        •
        <span class="green-text">до {{ futureDateStr }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-totals-wrapper {
  display: flex;
  width: 100%;
  height: 120px;
  background-color: var(--widget-background, #ffffff);
  border-bottom: 1px solid var(--widget-border, #e0e0e0);
  flex-shrink: 0;
}

.total-card {
  flex: 1;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.divider {
  width: 1px;
  background-color: var(--widget-border, #e0e0e0);
  height: 100%;
}

.card-label {
  font-size: 10px;
  color: var(--text-mute, #888);
  margin-bottom: 4px;
  line-height: 1.2;
}

.card-value {
  font-size: 1.6em;
  font-weight: 700;
  color: var(--text-main, #fff);
  
  white-space: nowrap;
}

.currency {
  font-size: 14px;
  color: #aaa;
  font-weight: 400;
}

.card-sub {
  font-size: 10px;
  color: var(--text-mute, #666);
  font-weight: 500;
}

.green-text {
  color: var(--color-primary, #34c759);
  font-weight: 800;
}

.subtitle-keyword {
  color: var(--color-primary, #34c759);
  font-weight: 800;
}

.subtitle-count {
  color: var(--color-primary, #34c759);
  font-weight: 800;
}

.right-align {
  text-align: right;
}
</style>