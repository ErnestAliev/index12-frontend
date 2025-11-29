<script setup>
import { onMounted, ref, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';

// UI Компоненты
import MobileHeaderTotals from '@/components/mobile/MobileHeaderTotals.vue';
import MobileWidgetGrid from '@/components/mobile/MobileWidgetGrid.vue';
import MobileTimeline from '@/components/mobile/MobileTimeline.vue';
import MobileChartSection from '@/components/mobile/MobileChartSection.vue'; // 🟢 Подключили Chart
import MobileActionPanel from '@/components/mobile/MobileActionPanel.vue';
import MobileBottomNav from '@/components/mobile/MobileBottomNav.vue';

// Модальные окна
import OperationPopup from '@/components/OperationPopup.vue';
import TransferPopup from '@/components/TransferPopup.vue';
import WithdrawalPopup from '@/components/WithdrawalPopup.vue';
import RetailClosurePopup from '@/components/RetailClosurePopup.vue';
import RefundPopup from '@/components/RefundPopup.vue';

const mainStore = useMainStore();

// --- Рефы для синхронизации скролла ---
const timelineRef = ref(null);
const chartRef = ref(null);

// --- Состояния модалок ---
const isOperationPopupVisible = ref(false);
const operationType = ref('income');
const isTransferPopupVisible = ref(false);
const isWithdrawalPopupVisible = ref(false);
const isRetailPopupVisible = ref(false);
const isRefundPopupVisible = ref(false);
const operationToEdit = ref(null);

// Данные для создания/редактирования
const selectedDate = ref(new Date());
const selectedCellIndex = ref(0);

const handleAction = (type) => {
  operationToEdit.value = null;
  selectedDate.value = new Date();
  selectedCellIndex.value = 0;

  if (type === 'transfer') {
    isTransferPopupVisible.value = true;
  } else if (type === 'income') {
    operationType.value = 'income';
    isOperationPopupVisible.value = true;
  } else if (type === 'expense') {
    operationType.value = 'expense';
    isOperationPopupVisible.value = true;
  }
};

const handleOpClick = (op) => {
  operationToEdit.value = op;
  if (mainStore._isRetailWriteOff(op)) { isRetailPopupVisible.value = true; return; }
  if (mainStore._isRetailRefund(op)) { isRefundPopupVisible.value = true; return; }
  
  if (op.type === 'transfer' || op.isTransfer) {
    isTransferPopupVisible.value = true;
  } else if (op.isWithdrawal) {
    isWithdrawalPopupVisible.value = true;
  } else {
    operationType.value = op.type;
    isOperationPopupVisible.value = true;
  }
};

const handleOpAdd = ({ date, cellIndex }) => {
  operationToEdit.value = null;
  selectedDate.value = date;
  selectedCellIndex.value = cellIndex;
  operationType.value = 'income'; 
  isOperationPopupVisible.value = true;
};

const handleOperationAdded = async (newOp) => {
  if (newOp?.dateKey) await mainStore.addOperation(newOp);
  isOperationPopupVisible.value = false;
};

const handleOperationSave = async ({ mode, id, data }) => {
  try {
    if (mode === 'create') {
        if (data.cellIndex === undefined) {
            const dateKey = mainStore._getDateKey(new Date(data.date));
            data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey);
        }
        await mainStore.createEvent(data);
    } else {
        await mainStore.updateOperation(id, data);
    }
    isOperationPopupVisible.value = false;
  } catch(e) { console.error(e); }
};

const handleTransferSave = async ({ mode, id, data }) => {
  try {
    if (mode === 'create') {
        if (data.cellIndex === undefined) {
            const dateKey = mainStore._getDateKey(new Date(data.date));
            data.cellIndex = await mainStore.getFirstFreeCellIndex(dateKey);
        }
        await mainStore.createTransfer(data);
    } else {
        await mainStore.updateTransfer(id, data);
    }
    isTransferPopupVisible.value = false;
  } catch(e) { console.error(e); }
};

const handleWithdrawalSave = async ({ mode, id, data }) => {
    try {
        if (mode === 'create') await mainStore.createEvent(data);
        else await mainStore.updateOperation(id, data);
        isWithdrawalPopupVisible.value = false;
    } catch (e) { console.error(e); }
};

const handleRetailSave = async ({ id, data }) => {
    try {
        await mainStore.updateOperation(id, {
            amount: -Math.abs(data.amount),
            projectId: data.projectIds[0] || null, 
            date: new Date(data.date)
        });
        isRetailPopupVisible.value = false;
    } catch(e) { console.error(e); }
};

const handleRefundSave = async ({ mode, id, data }) => {
    try {
        if (mode === 'create') await mainStore.createEvent(data);
        else await mainStore.updateOperation(id, data);
        isRefundPopupVisible.value = false;
    } catch(e) { console.error(e); }
};

const handleRetailDelete = async (op) => {
    await mainStore.deleteOperation(op);
    isRetailPopupVisible.value = false;
};

const handleRefundDelete = async (op) => {
    await mainStore.deleteOperation(op);
    isRefundPopupVisible.value = false;
};

const handleOperationDelete = async () => {
    if (operationToEdit.value) {
        await mainStore.deleteOperation(operationToEdit.value);
        isOperationPopupVisible.value = false;
    }
};

// --- СИНХРОНИЗАЦИЯ СКРОЛЛА ---
// Используем флаг isSyncing, чтобы избежать бесконечного цикла событий
let isSyncing = false;

const onTimelineScroll = (event) => {
  if (isSyncing) return;
  isSyncing = true;
  const left = event.target.scrollLeft;
  // Передаем скролл в график
  if (chartRef.value) {
    chartRef.value.setScroll(left);
  }
  requestAnimationFrame(() => { isSyncing = false; });
};

const onChartScroll = (left) => {
  if (isSyncing) return;
  isSyncing = true;
  // Передаем скролл в таймлайн (через DOM элемент, т.к. Timeline это просто div container)
  // В MobileTimeline нам нужно добраться до .timeline-grid
  const timelineGrid = timelineRef.value?.$el.querySelector('.timeline-grid');
  if (timelineGrid) {
    timelineGrid.scrollLeft = left;
  }
  requestAnimationFrame(() => { isSyncing = false; });
};

onMounted(async () => {
  await mainStore.checkAuth();
  if (!mainStore.user) {
    window.location.href = '/'; 
    return;
  }
  await mainStore.fetchAllEntities();
  
  // Инициализация скролла таймлайна (DOM listeners для нативного события)
  nextTick(() => {
      const timelineGrid = timelineRef.value?.$el.querySelector('.timeline-grid');
      if (timelineGrid) {
          timelineGrid.addEventListener('scroll', onTimelineScroll);
          
          // Центрируем скролл на "сегодня" (5-й день) при загрузке
          const oneColWidth = window.innerWidth * 0.25;
          const scrollPos = oneColWidth * 4;
          timelineGrid.scrollLeft = scrollPos;
          if (chartRef.value) chartRef.value.setScroll(scrollPos);
      }
  });
});
</script>

<template>
  <div class="mobile-layout">
    
    <!-- 1. Хедер (Фикс высота) -->
    <div class="layout-header">
      <MobileHeaderTotals />
    </div>

    <!-- 2. Рабочая область (Без общего скролла) -->
    <div class="layout-body">
      
      <!-- Зона виджетов (Сетка) -->
      <!-- Высота зависит от контента, но если развернуто - сжимает график? 
           В требовании сказано: "Все блоки должны быть видны разом".
           Значит, используем flex для распределения места. -->
      <div class="widgets-area" :class="{ 'expanded': mainStore.isHeaderExpanded }">
        <MobileWidgetGrid />
      </div>

      <!-- Зона таймлайна -->
      <div class="timeline-area">
        <MobileTimeline 
          ref="timelineRef"
          @op-click="handleOpClick"
          @op-add="handleOpAdd"
        />
      </div>

      <!-- Зона графика -->
      <div class="chart-area">
        <MobileChartSection 
           ref="chartRef"
           @scroll="onChartScroll"
        />
      </div>

    </div>

    <!-- 3. Футер (Фикс высота) -->
    <div class="layout-footer">
      <MobileActionPanel @action="handleAction" />
      <MobileBottomNav />
    </div>

    <!-- MODALS -->
    <OperationPopup 
      v-if="isOperationPopupVisible" 
      :type="operationType" 
      :date="selectedDate" 
      :cellIndex="selectedCellIndex" 
      :operation-to-edit="operationToEdit"
      @close="isOperationPopupVisible = false" 
      @save="handleOperationSave"
      @operation-added="handleOperationAdded"
      @operation-deleted="handleOperationDelete"
    />
    <TransferPopup 
      v-if="isTransferPopupVisible" 
      :date="selectedDate" 
      :cellIndex="selectedCellIndex" 
      :transferToEdit="operationToEdit"
      @close="isTransferPopupVisible = false" 
      @save="handleTransferSave"
    />
    <WithdrawalPopup 
       v-if="isWithdrawalPopupVisible" 
       :operation-to-edit="operationToEdit"
       :initial-data="{ amount: 0 }"
       @close="isWithdrawalPopupVisible = false" 
       @save="handleWithdrawalSave"
    />
    <RetailClosurePopup 
       v-if="isRetailPopupVisible" 
       :operation-to-edit="operationToEdit"
       @close="isRetailPopupVisible = false" 
       @save="handleRetailSave"
       @delete="handleRetailDelete"
    />
    <RefundPopup 
       v-if="isRefundPopupVisible" 
       :operation-to-edit="operationToEdit"
       @close="isRefundPopupVisible = false" 
       @save="handleRefundSave"
       @delete="handleRefundDelete"
    />
  </div>
</template>

<style scoped>
.mobile-layout {
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  background-color: var(--color-background, #1a1a1a);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.layout-header {
  flex-shrink: 0;
}

.layout-body {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* Важно для flex children scrolling */
  overflow: hidden;
}

.widgets-area {
  flex-shrink: 0;
  transition: all 0.2s;
  /* Если свернуто, высота контента. Если развернуто, может занять до 50% экрана */
  max-height: 50vh; 
  display: flex;
  flex-direction: column;
}
.widgets-area.expanded {
  max-height: 70vh; /* Увеличиваем лимит при развороте */
  overflow-y: auto; /* Внутренний скролл, если виджетов супер много */
}

.timeline-area {
  /* Фикс высота для таймлайна, чтобы он не схлопывался */
  height: 350px; 
  flex-shrink: 0;
  border-top: 1px solid var(--color-border, #444);
}

.chart-area {
  /* График занимает все оставшееся место */
  flex-grow: 1; 
  min-height: 0; 
  border-top: 1px solid var(--color-border, #444);
}

.layout-footer {
  flex-shrink: 0;
  z-index: 200; /* Поверх графиков */
}
</style>