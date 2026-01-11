<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useUiStore } from '@/stores/uiStore';
import { formatNumber } from '@/utils/formatters.js';
import DateRangePicker from './DateRangePicker.vue';

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true },
  emptyText: { type: String, default: "...нет..." },
  widgetKey: { type: String, required: true },
  widgetIndex: { type: Number, required: true },
  isDeltaMode: { type: Boolean, default: false }
});

const emit = defineEmits(['add', 'edit']);
const mainStore = useMainStore();
const uiStore = useUiStore();

const showFutureBalance = computed({
  get: () => mainStore.dashboardForecastState[props.widgetKey] ?? false,
  set: (val) => mainStore.setForecastState(props.widgetKey, val)
});

/* --- FILTERS --- */
const isFilterOpen = ref(false);
const filterBtnRef = ref(null);
const filterDropdownRef = ref(null);
const filterPos = ref({ top: '0px', left: '0px' });

// Use uiStore for persistent filter state
const sortMode = computed({
  get: () => uiStore.getWidgetSortMode(props.widgetKey),
  set: (val) => uiStore.setWidgetSortMode(props.widgetKey, val)
});

const filterMode = computed({
  get: () => uiStore.getWidgetFilterMode(props.widgetKey),
  set: (val) => uiStore.setWidgetFilterMode(props.widgetKey, val)
});

// Show green button when filters are not default
const isFilterActive = computed(() => {
  return sortMode.value !== 'default' || filterMode.value !== 'all';
});

/* --- PERIOD FILTER --- */
const isPeriodOpen = ref(false);
const periodBtnRef = ref(null);
const periodDropdownRef = ref(null);
const periodPos = ref({ top: '0px', left: '0px' });

const dateRangePickerRef = ref(null);
const dateRangeValue = ref({ from: null, to: null });
const isDateRangePickerVisible = ref(false);

// Use mainStore period filter instead of uiStore
const periodFilter = computed(() => mainStore.periodFilter);
const isPeriodActive = computed(() => periodFilter.value.mode !== 'all');

const updatePeriodPosition = () => {
  if (periodBtnRef.value) {
    const rect = periodBtnRef.value.getBoundingClientRect();
    periodPos.value = { top: `${rect.bottom + 5}px`, left: `${rect.right - 160}px` };
  }
};

const setPeriodMode = (mode) => {
  if (mode === 'custom') {
    // Close period dropdown and show DateRangePicker
    isPeriodOpen.value = false;
    isDateRangePickerVisible.value = true;
    
    // Initialize with current period if already set
    const current = periodFilter.value;
    if (current.mode === 'custom' && current.customStart && current.customEnd) {
      dateRangeValue.value = {
        from: current.customStart.split('T')[0],
        to: current.customEnd.split('T')[0]
      };
    } else {
      dateRangeValue.value = { from: null, to: null };
    }
    
    // Open DateRangePicker calendar directly
    nextTick(() => {
      if (dateRangePickerRef.value?.toggle) {
        dateRangePickerRef.value.toggle();
      }
    });
  } else {
    mainStore.setPeriodFilter({ mode, customStart: null, customEnd: null });
    isPeriodOpen.value = false;
  }
};

// Watch dateRangeValue and apply immediately when user selects both dates
watch(dateRangeValue, (newVal) => {
  if (newVal.from && newVal.to) {
    const start = new Date(newVal.from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(newVal.to);
    end.setHours(23, 59, 59, 999);
    
    mainStore.setPeriodFilter({
      mode: 'custom',
      customStart: start.toISOString(),
      customEnd: end.toISOString()
    });
    
    // Hide DateRangePicker after selection
    isDateRangePickerVisible.value = false;
  }
}, { deep: true });

watch(isPeriodOpen, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    updatePeriodPosition();
    document.addEventListener('mousedown', handlePeriodClickOutside);
    window.addEventListener('resize', updatePeriodPosition);
    window.addEventListener('scroll', updatePeriodPosition, true);
  } else {
    document.removeEventListener('mousedown', handlePeriodClickOutside);
    window.removeEventListener('resize', updatePeriodPosition);
    window.removeEventListener('scroll', updatePeriodPosition, true);
  }
});

const handlePeriodClickOutside = (event) => {
  const insideTrigger = periodBtnRef.value && periodBtnRef.value.contains(event.target);
  const insideDropdown = periodDropdownRef.value && periodDropdownRef.value.contains(event.target);
  if (!insideTrigger && !insideDropdown) isPeriodOpen.value = false;
};

const updateFilterPosition = () => {
  if (filterBtnRef.value) {
    const rect = filterBtnRef.value.getBoundingClientRect();
    filterPos.value = { top: `${rect.bottom + 5}px`, left: `${rect.right - 160}px` };
  }
};

const getId = (field) => {
    if (!field) return null;
    if (typeof field === 'object' && field._id) return field._id;
    return field; 
};

const financialStats = computed(() => {
    const balances = new Map(); 
    let systemTotalBalance = 0; 

    const sourceAccounts = mainStore.currentAccountBalances || [];

    sourceAccounts.forEach(acc => {
        if (acc.isExcluded && !mainStore.includeExcludedInTotal) return;

        const rawBalance = Number(acc.balance);
        const balance = isNaN(rawBalance) ? 0 : rawBalance; 
        
        systemTotalBalance += balance;

        const cId = getId(acc.companyId);
        const iId = getId(acc.individualId);
        const ownerId = cId || iId;

        if (ownerId) {
            const current = balances.get(ownerId) || 0;
            const newTotal = current + balance; 
            balances.set(ownerId, newTotal);
        }
    });

    const maxBalance = systemTotalBalance > 0 ? systemTotalBalance : 1;

    return { balances, maxBalance };
});

const getStatusColor = (currentBalance, totalSystemBalance) => {
    const safeBalance = Number(currentBalance) || 0;
    
    if (safeBalance <= 0) return '#FF3B30'; 

    const ratio = safeBalance / totalSystemBalance;
    
    if (ratio >= 0.5) return '#34C759'; 
    if (ratio > 0.1) return '#FFCC00';  
    return '#FF3B30';                   
};

const getFutureColor = (item) => {
    if (props.isDeltaMode) {
        if (item.futureBalance > 0) return 'income';
        if (item.futureBalance < 0) return 'expense';
        return '';
    }

    const current = Number(item.balance) || 0;
    const future = Number(item.futureBalance) || 0;

    if (future > current) return 'income';
    if (future < current) return 'expense';
    
    return '';
};

// Period filter is now in mainStore - no need for local filtering
// MainStore.currentOps automatically filters by period, so balances
// in props.items are already correct

const processedItems = computed(() => {
  let items = [...props.items];
  
  // Period filtering happens in mainStore.currentOps - items already filtered
  // Apply other filters (positive/negative/nonZero)
  if (filterMode.value === 'positive') items = items.filter(item => (item.balance || 0) > 0);
  else if (filterMode.value === 'negative') items = items.filter(item => (item.balance || 0) < 0);
  else if (filterMode.value === 'nonZero') items = items.filter(item => (item.balance || 0) !== 0);

  if (sortMode.value === 'desc') items.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  else if (sortMode.value === 'asc') items.sort((a, b) => (a.balance || 0) - (b.balance || 0));
  else items.sort((a, b) => (a.order || 0) - (b.order || 0));

  const { balances, maxBalance } = financialStats.value;

  return items.map(item => {
      let color = null;
      let hasLink = false;
      let tooltipText = ''; 

      const itemId = getId(item); 

      if (props.widgetKey === 'accounts') {
          color = getStatusColor(item.balance, maxBalance);

          const cId = getId(item.companyId);
          const iId = getId(item.individualId);
          const ownerId = cId || iId;
          
          if (ownerId) {
              hasLink = true;
              let ownerName = 'Владелец';
              if (cId) {
                  const c = mainStore.companies.find(x => x._id === cId);
                  if (c) ownerName = c.name;
              } else if (iId) {
                  const i = mainStore.individuals.find(x => x._id === iId);
                  if (i) ownerName = i.name;
              }
              tooltipText = `Владелец: ${ownerName}`;
          }
      }
      
      else if (props.widgetKey === 'companies') {
          const totalBalance = balances.get(itemId) || 0;
          color = getStatusColor(totalBalance, maxBalance);

          const companyAccounts = mainStore.accounts.filter(acc => getId(acc.companyId) === itemId);

          if (companyAccounts.length > 0) {
              hasLink = true;
              const accNames = companyAccounts.map(a => a.name).join(', ');
              tooltipText = `Счета: ${accNames}`;
          } else {
              hasLink = false;
              tooltipText = 'Нет связанных счетов';
          }
      }

      else if (props.widgetKey === 'individuals') {
          const linkedAccounts = mainStore.accounts.filter(acc => getId(acc.individualId) === itemId);

          if (linkedAccounts.length > 0) {
              hasLink = true;
              const accNames = linkedAccounts.map(a => a.name).join(', ');
              tooltipText = `Связан со счетом: ${accNames}`;
              const totalBalance = balances.get(itemId) || 0;
              color = getStatusColor(totalBalance, maxBalance);
          } else {
              hasLink = false;
              color = null; 
          }
      }

      return {
          ...item,
          linkMarkerColor: color,
          isLinked: hasLink,
          linkTooltip: tooltipText
      };
  });
});

const setSortMode = (mode) => { 
    sortMode.value = mode; 
    isFilterOpen.value = false; 
};
const setFilterMode = (mode) => { 
    filterMode.value = mode; 
    isFilterOpen.value = false; 
};

watch(isFilterOpen, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    updateFilterPosition();
    document.addEventListener('mousedown', handleFilterClickOutside);
    window.addEventListener('resize', updateFilterPosition);
    window.addEventListener('scroll', updateFilterPosition, true);
  } else {
    document.removeEventListener('mousedown', handleFilterClickOutside);
    window.removeEventListener('resize', updateFilterPosition);
    window.removeEventListener('scroll', updateFilterPosition, true);
  }
});

const handleFilterClickOutside = (event) => {
  const insideTrigger = filterBtnRef.value && filterBtnRef.value.contains(event.target);
  const insideDropdown = filterDropdownRef.value && filterDropdownRef.value.contains(event.target);
  if (!insideTrigger && !insideDropdown) isFilterOpen.value = false;
};

const formatBalance = (balance) => {
  const num = Number(balance) || 0;
  const safeBalance = isNaN(num) ? 0 : num;
  const formatted = formatNumber(Math.abs(safeBalance)); 
  return safeBalance < 0 ? `- ${formatted}` : formatted;
};

const formatDelta = (val) => {
  const num = Number(val) || 0;
  if (num === 0) return '0';
  const formatted = formatNumber(Math.abs(num));
  return num > 0 ? `+ ${formatted}` : `- ${formatted}`;
};

const isFullscreen = computed(() => props.widgetIndex < 0);

const isTotalsWidget = computed(() => {
  return props.widgetKey === 'contractors'
      || props.widgetKey === 'projects'
      || props.widgetKey === 'individuals'
      || props.widgetKey === 'categories';
});

const _sumListByFieldSign = (list, field, sign) => {
  if (!Array.isArray(list) || !list.length) return 0;

  let total = 0;
  for (const item of list) {
    const v = Number(item?.[field]) || 0;

    if (sign === 'pos') {
      if (v > 0) total += v;
    } else {
      if (v < 0) total += Math.abs(v);
    }
  }

  return total;
};

const summaryTotals = computed(() => {
  if (!isTotalsWidget.value) return null;

  // Totals must be calculated ONLY from the list inside this widget (what you see here),
  // not from operations in mainStore.
  const list = processedItems.value || [];

  return {
    factExpense: _sumListByFieldSign(list, 'balance', 'neg'),
    factIncome: _sumListByFieldSign(list, 'balance', 'pos'),
    planExpense: _sumListByFieldSign(list, 'futureBalance', 'neg'),
    planIncome: _sumListByFieldSign(list, 'futureBalance', 'pos'),
  };
});

const formatSignedMoney = (amount, sign) => {
  const num = Math.abs(Number(amount) || 0);
  const formatted = formatNumber(num);
  return `${sign} ${formatted}`;
};

// Expose a UI-accurate snapshot of what is currently visible in this widget.
// This is used by the AI layer to answer strictly from the screen state.
const getSnapshot = () => {
  const list = processedItems.value || [];

  const rows = list.map((item) => {
    const bal = Number(item?.balance) || 0;
    const fut = Number(item?.futureBalance) || 0;

    return {
      id: item?._id ?? getId(item) ?? item?.id ?? null,
      name: item?.name ?? '',
      order: item?.order ?? 0,
      isExcluded: Boolean(item?.isExcluded),

      // Raw numbers (for calculations if needed)
      balance: bal,
      futureBalance: fut,

      // Exactly as shown in UI
      balanceText: formatBalance(bal),
      futureText: props.isDeltaMode ? formatDelta(fut) : formatBalance(fut),
      futureColor: props.isDeltaMode
        ? (fut > 0 ? 'income' : (fut < 0 ? 'expense' : ''))
        : getFutureColor({ balance: bal, futureBalance: fut }),

      // UI markers
      linkMarkerColor: item?.linkMarkerColor ?? null,
      isLinked: Boolean(item?.isLinked),
      linkTooltip: item?.linkTooltip ?? '',
    };
  });

  const totals = summaryTotals.value
    ? {
        factExpense: Number(summaryTotals.value.factExpense) || 0,
        factIncome: Number(summaryTotals.value.factIncome) || 0,
        planExpense: Number(summaryTotals.value.planExpense) || 0,
        planIncome: Number(summaryTotals.value.planIncome) || 0,

        // Text versions as used in the footer
        factExpenseText: formatSignedMoney(summaryTotals.value.factExpense ?? 0, '-'),
        factIncomeText: formatSignedMoney(summaryTotals.value.factIncome ?? 0, '+'),
        planExpenseText: formatSignedMoney(summaryTotals.value.planExpense ?? 0, '-'),
        planIncomeText: formatSignedMoney(summaryTotals.value.planIncome ?? 0, '+'),
      }
    : null;

  return {
    key: props.widgetKey,
    title: props.title,
    widgetIndex: props.widgetIndex,
    isFullscreen: isFullscreen.value,

    // UI state that affects what user sees
    showFutureBalance: Boolean(showFutureBalance.value),
    isDeltaMode: Boolean(props.isDeltaMode),
    sortMode: sortMode.value,
    filterMode: filterMode.value,
    includeExcludedInTotal: Boolean(mainStore.includeExcludedInTotal),

    // Visible data
    rows,
    totals,
  };
};

defineExpose({ getSnapshot });
</script>

<template>
  <!-- 🟢 Убрал .stop чтобы клик прошел вверх к TheHeader для Fullscreen -->
  <div class="dashboard-card" :class="{ 'is-fullscreen': isFullscreen }" @click="isFilterOpen = false">
    
    <div class="card-title-container">
      <div class="card-title">{{ props.title }}</div>

      <div class="card-actions">
        <!-- Only workspace OWNER can toggle excluded accounts visibility (invited users always hide) -->
        <button 
            v-if="props.widgetKey === 'accounts' && (!mainStore.workspaceRole || mainStore.isWorkspaceOwner || mainStore.isWorkspaceAdmin)"
            class="action-square-btn" 
            :class="{ active: mainStore.includeExcludedInTotal }" 
            @click.stop="mainStore.toggleExcludedInclusion()" 
            title="Учитывать скрытые счета"
        >
            <svg v-if="mainStore.includeExcludedInTotal" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-svg">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-svg">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
        </button>

        <!-- Period Filter Button (only in fullscreen) -->
        <button 
            v-if="isFullscreen"
            class="action-square-btn" 
            :class="{ active: isPeriodActive }" 
            ref="periodBtnRef" 
            @click.stop="isPeriodOpen = !isPeriodOpen" 
            title="Период"
        >
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </button>

        <button class="action-square-btn" :class="{ active: isFilterActive }" ref="filterBtnRef" @click.stop="isFilterOpen = !isFilterOpen" title="Фильтр">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
        </button>
        <!-- Forecast button: keep visible always -->
        <button 
            class="action-square-btn" 
            :class="{ 'active': showFutureBalance }" 
            @click.stop="showFutureBalance = !showFutureBalance" 
            title="Прогноз"
        >
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
        </button>
        <button @click.stop="$emit('edit')" class="action-square-btn" title="Редактировать">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button @click.stop="$emit('add')" class="action-square-btn" title="Добавить">
           <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="isFilterOpen" class="filter-dropdown-fixed" :style="filterPos" ref="filterDropdownRef" @click.stop>
        <div class="filter-group">
          <div class="filter-group-title">Сортировка</div>
          <ul>
            <li :class="{ active: sortMode === 'default' }" @click="setSortMode('default')"><span>По умолчанию</span></li>
            <li :class="{ active: sortMode === 'desc' }" @click="setSortMode('desc')"><span>По убыванию</span></li>
            <li :class="{ active: sortMode === 'asc' }" @click="setSortMode('asc')"><span>По возрастанию</span></li>
          </ul>
        </div>
        <div class="filter-group">
          <div class="filter-group-title">Фильтр</div>
          <ul>
            <li :class="{ active: filterMode === 'all' }" @click="setFilterMode('all')">Все</li>
            <li :class="{ active: filterMode === 'nonZero' }" @click="setFilterMode('nonZero')">Скрыть 0</li>
            <li :class="{ active: filterMode === 'positive' }" @click="setFilterMode('positive')">Только (+)</li>
            <li :class="{ active: filterMode === 'negative' }" @click="setFilterMode('negative')">Только (-)</li>
          </ul>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="isPeriodOpen" class="filter-dropdown-fixed" :style="periodPos" ref="periodDropdownRef" @click.stop>
        <div class="filter-group">
          <div class="filter-group-title">Период</div>
          <ul>
            <li :class="{ active: periodFilter.mode === 'all' }" @click="setPeriodMode('all')"><span>За весь период</span></li>
            <li :class="{ active: periodFilter.mode === 'currentMonth' }" @click="setPeriodMode('currentMonth')"><span>За текущий месяц</span></li>
            <li :class="{ active: periodFilter.mode === 'previousMonth' }" @click="setPeriodMode('previousMonth')"><span>За прошлый месяц</span></li>
            <li :class="{ active: periodFilter.mode === 'custom' }" @click="setPeriodMode('custom')"><span>Выбрать период</span></li>
          </ul>
        </div>
      </div>
    </Teleport>

    <!-- DateRangePicker for custom period selection - only visible when needed -->
    <DateRangePicker 
      v-if="isDateRangePickerVisible"
      ref="dateRangePickerRef"
      v-model="dateRangeValue" 
      placeholder="Выберите период"
    />
    
    <div class="card-items-list" :class="{ 'forecast-mode': showFutureBalance }">
      <div v-for="item in processedItems" :key="item._id" class="card-item">
        <span class="name-cell">
          
          <span 
            v-if="item.linkMarkerColor" 
            class="color-dot" 
            :style="{ backgroundColor: item.linkMarkerColor }"
            :title="item.linkTooltip"
          ></span>

          {{ item.name }}
          
          <span 
            v-if="item.isLinked" 
            class="link-icon" 
            :title="item.linkTooltip"
          >
             <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          </span>

          <span v-if="item.isExcluded" class="excluded-icon" :class="{ 'included-now': mainStore.includeExcludedInTotal }" :title="mainStore.includeExcludedInTotal ? 'Временно включен в расчет' : 'Исключен из общего баланса'">
             <svg v-if="mainStore.includeExcludedInTotal" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-svg">
                 <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                 <circle cx="12" cy="12" r="3"></circle>
             </svg>
             <svg v-else xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                 <line x1="1" y1="1" x2="23" y2="23"></line>
             </svg>
          </span>
        </span>
        
        <span v-if="!showFutureBalance" class="single-balance" :class="{ 'expense': item.balance < 0 }">
          <span class="currency">₸</span> {{ formatBalance(item.balance) }}
        </span>

        <span v-else class="forecast-display">
          <span class="current-cell" :class="{ 'expense': item.balance < 0 }">
             <span class="currency">₸</span> {{ formatBalance(item.balance) }}
          </span>
          <span class="arrow-cell">></span>
          <span v-if="isDeltaMode" class="future-cell" :class="{ 'income': item.futureBalance > 0, 'expense': item.futureBalance < 0 }">
             {{ formatDelta(item.futureBalance) }}
          </span>
          <span v-else class="future-cell" :class="getFutureColor(item)">
             {{ formatBalance(item.futureBalance) }}
          </span>
        </span>
      </div>
      <p v-if="!processedItems.length" class="card-item-empty">{{ props.emptyText }}</p>
    </div>

    <div v-if="isTotalsWidget && isFullscreen" class="card-summary-footer fullscreen">
      <div class="summary-grid" :class="{ 'one-line': isFullscreen }">
        <template v-if="props.widgetKey === 'projects'">
          <div class="summary-item">
            <div class="summary-label">Прибыль по проектам</div>
            <div class="summary-value income"><span class="currency">₸</span> {{ formatSignedMoney(summaryTotals?.factIncome ?? 0, '+') }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Расходы по проектам</div>
            <div class="summary-value expense"><span class="currency">₸</span> {{ formatSignedMoney(summaryTotals?.factExpense ?? 0, '-') }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Планируемая прибыль</div>
            <div class="summary-value income"><span class="currency">₸</span> {{ formatSignedMoney(summaryTotals?.planIncome ?? 0, '+') }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Планируемый расход</div>
            <div class="summary-value expense"><span class="currency">₸</span> {{ formatSignedMoney(summaryTotals?.planExpense ?? 0, '-') }}</div>
          </div>
        </template>

        <template v-else>
          <div class="summary-item">
            <div class="summary-label">Фактические доходы</div>
            <div class="summary-value income"><span class="currency">₸</span> {{ formatSignedMoney(summaryTotals?.factIncome ?? 0, '+') }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Фактические расходы</div>
            <div class="summary-value expense"><span class="currency">₸</span> {{ formatSignedMoney(summaryTotals?.factExpense ?? 0, '-') }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Планируемые доходы</div>
            <div class="summary-value income"><span class="currency">₸</span> {{ formatSignedMoney(summaryTotals?.planIncome ?? 0, '+') }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Планируемые расходы</div>
            <div class="summary-value expense"><span class="currency">₸</span> {{ formatSignedMoney(summaryTotals?.planExpense ?? 0, '-') }}</div>
          </div>
        </template>
      </div>
    </div>

  </div>
</template>

<style scoped>
.dashboard-card { 
  display: flex; flex-direction: column; 
  height: 100%; 
  overflow: hidden; 
  padding-right: 1.5rem; 
  border-right: 1px solid var(--color-border); 
  position: relative; 
}
.dashboard-card:last-child { border-right: none; padding-right: 0; }

.card-title-container { 
  display: flex; justify-content: space-between; align-items: center; 
  height: var(--h-header-card); 
  margin-bottom: var(--gap-sm); 
  flex-shrink: 0; 
}

.card-title { 
  font-size: var(--font-sm); 
  font-weight: var(--fw-semi); 
  color: var(--text-main); 
  position: relative; z-index: 101; 
  letter-spacing: 0.01em;
}

.card-actions { display: flex; gap: 6px; position: relative; z-index: 101; }
/* Используем переменные из theme.css */
.action-square-btn { 
  width: 18px; height: 18px; 
  border: 1px solid var(--btn-widget-border); border-radius: 4px; 
  background-color: var(--btn-widget-bg); 
  display: flex; align-items: center; justify-content: center; 
  cursor: pointer; padding: 0; color: var(--btn-widget-color); 
  transition: all var(--trans-fast); 
}
.action-square-btn:hover { background-color: var(--btn-widget-bg-hover); color: var(--btn-widget-color-hover); }
.action-square-btn.active { background-color: var(--btn-widget-bg-active); color: var(--btn-widget-color-active); border-color: var(--btn-widget-border-active); }

.icon-svg { width: 11px; height: 11px; display: block; object-fit: contain; }

.card-items-list { 
  flex-grow: 1; overflow-y: auto; padding-right: 5px; scrollbar-width: none; min-height: 0; display: flex; flex-direction: column; 
}
.card-items-list::-webkit-scrollbar { display: none; }

.card-item { 
  display: flex; 
  justify-content: space-between; 
  font-size: var(--font-sm);
  flex-shrink: 0; 
  margin-bottom: 2px;
}

.card-items-list.forecast-mode {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 12px auto; 
  column-gap: 6px;
  align-items: center;
  align-content: start;
  font-size: var(--font-sm);
  row-gap: 2px; 
}

.card-items-list.forecast-mode .card-item { display: contents; }
.card-items-list.forecast-mode .forecast-display { display: contents; }

.name-cell {
  color: var(--text-soft); 
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
  display: flex; align-items: center; gap: 6px;
}

.color-dot {
  width: 8px; 
  height: 8px; 
  border-radius: 50%; 
  display: inline-block;
  flex-shrink: 0;
}

.link-icon { color: var(--color-primary); display: inline-flex; align-items: center; opacity: 0.6; cursor: help; }
.link-icon:hover { opacity: 1; }

.excluded-icon { color: #888; display: inline-flex; align-items: center; opacity: 0.8; cursor: help; transition: all 0.2s; }
.excluded-icon.included-now { color: var(--color-primary); opacity: 1; text-shadow: 0 0 5px rgba(52, 199, 89, 0.4); }

.current-cell { 
  color: var(--text-main); 
  font-weight: var(--fw-medium); 
  text-align: right; 
  white-space: nowrap; 
  font-variant-numeric: tabular-nums;
}

.arrow-cell { color: var(--text-mute); text-align: center; user-select: none; }

.future-cell { 
  font-weight: var(--fw-medium); 
  text-align: right; 
  white-space: nowrap; 
  font-variant-numeric: tabular-nums;
}

.currency { font-size: 0.85em; color: var(--text-mute); margin-right: 2px; font-weight: 400; }
.card-item-empty { font-size: var(--font-xs); color: #666; grid-column: 1 / -1; margin-top: 10px; font-style: italic; }

.expense { color: var(--color-danger) !important; }
.income { color: var(--color-primary) !important; }
.single-balance { color: var(--text-main); white-space: nowrap; font-variant-numeric: tabular-nums; }
.single-balance.expense { color: var(--color-danger) !important; font-weight: var(--fw-medium); }

/* 🟢 SUMMARY FOOTER (for Contractors / Projects / Individuals / Categories) */
.dashboard-card.is-fullscreen {
  border-right: none;
  padding-right: 0;
}

.card-summary-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border);
  padding-top: 8px;
  margin-top: 8px;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
}

.summary-grid.one-line {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
}

.summary-grid.one-line .summary-item {
  padding: 0 10px;
}

.summary-grid.one-line .summary-item:first-child {
  padding-left: 0;
}

.summary-grid.one-line .summary-item:last-child {
  padding-right: 0;
}

.summary-grid.one-line .summary-item:not(:last-child) {
  border-right: 1px solid var(--color-border);
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.summary-label {
  font-size: var(--font-xs);
  color: var(--text-mute);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.05;
  transform: translateY(-1px);
}

.summary-value {
  font-weight: var(--fw-semi);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1.15;
  margin-top: 3px;
  font-size: calc(var(--font-sm) * 1.05);
}

@media (max-height: 900px) {
  .dashboard-card { padding-right: 1rem; }
  .card-title { font-size: 0.8em; }
  .card-item { font-size: 0.8em; margin-bottom: 0.2rem; }
  .card-items-list.forecast-mode { font-size: var(--font-xs); }
}

/* 🟢 Date Range Dialog Styles */
.date-range-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 6000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.date-range-dialog {
  background: var(--widget-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 400px;
  padding: 0;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
}

.dialog-close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-soft);
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.dialog-close-btn:hover {
  background-color: var(--color-background-soft);
  color: var(--text-main);
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.date-input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-input-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-soft);
}

.date-input-group input {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  background-color: var(--color-background);
  color: var(--text-main);
  transition: border-color 0.2s;
}

.date-input-group input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.dialog-btn-cancel {
  background-color: var(--color-background-soft);
  color: var(--text-main);
}

.dialog-btn-cancel:hover {
  background-color: var(--color-background-mute);
}

.dialog-btn-apply {
  background-color: var(--color-primary);
  color: white;
}

.dialog-btn-apply:hover {
  opacity: 0.9;
}

/* 🟢 FIX: Принудительный размер шрифта для планшетов */
@media (min-width: 768px) and (max-width: 1024px) {
    .card-items-list.forecast-mode {
        font-size: var(--font-sm) !important;
    }
    .card-item { 
        font-size: var(--font-sm) !important;
    }
}
</style>