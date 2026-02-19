<script setup>
import { computed, ref } from 'vue';
import { formatNumber } from '@/utils/formatters.js';
import { useMainStore } from '@/stores/mainStore';
import { usePermissions } from '@/composables/usePermissions';

/**
 * * --- МЕТКА ВЕРСИИ: v3.3 - HIDE EXCLUDED ACCOUNTS ---
 * * ВЕРСИЯ: 3.3
 * * ДАТА: 2025-12-10
 * * ИЗМЕНЕНИЯ:
 * 1. (LOGIC) Добавлена проверка isOpVisible. Теперь операции по скрытым счетам не отображаются,
 * если выключена настройка "Показывать скрытые" (includeExcludedInTotal).
 */

const props = defineProps({
  operation: { type: Object, default: null },
  dateKey: { type: String, required: true },
  cellIndex: { type: Number, required: true },
  columnCount: { type: Number, default: 11 },
  dayDate: { type: Date, default: null }
});

const emit = defineEmits(['edit-operation', 'add-operation', 'drop-operation']);
const isDragOver = ref(false);
const mainStore = useMainStore();
const permissions = usePermissions();
const visibilityMode = computed(() => mainStore.accountVisibilityMode);

// 🟢 Permission Check - can user interact with this operation?
const canInteract = computed(() => {
    const op = props.operation;
    if (!op) return true; // Empty cell, можно кликнуть для создания
    if (op.isPhantom) return false; // Phantom всегда заблокирован
    
    // Check if user can edit this specific operation
    return permissions.canEditOperation(op);
});

const isPersonalTransferWithdrawal = (op) => !!op &&
  op.isWithdrawal === true &&
  op.transferPurpose === 'personal' &&
  op.transferReason === 'personal_use';

/* UI-детектор перевода */
const isTransferOp = computed(() => {
  const op = props.operation;
  if (!op) return false;
  if (isPersonalTransferWithdrawal(op)) return true;
  if (op.isWithdrawal) return false; 
  
  if (op.type?.toLowerCase?.() === 'transfer') return true;
  if (op.isTransfer === true) return true;
  if (op.transferGroupId) return true;
  const cat = op.categoryId?.name?.toLowerCase?.() || '';
  return cat === 'перевод' || cat === 'transfer';
});

// Проверка на розничного клиента
const isRetailClient = computed(() => {
    const op = props.operation;
    if (!op) return false;
    const indId = op.counterpartyIndividualId?._id || op.counterpartyIndividualId;
    return indId && indId === mainStore.retailIndividualId;
});

// 🟢 1. Получаем список ID исключенных счетов
const excludedAccountIds = computed(() => {
    const mode = visibilityMode.value;
    if (mode === 'all') return new Set();
    
    const ids = new Set();
    mainStore.accounts.forEach(a => {
        if (mode === 'none') { ids.add(a._id); return; }
        if (mode === 'open' && a.isExcluded) ids.add(a._id);
        if (mode === 'hidden' && !a.isExcluded) ids.add(a._id);
    });
    return ids;
});

// 🟢 2. Видимость текущей операции
const isOpVisible = computed(() => {
    const op = props.operation;
    if (!op) return false;
    
    // Если включен режим «Все» - всегда true
    if (visibilityMode.value === 'all') return true;

    // Проверяем счет операции
    if (op.accountId) {
        const aId = typeof op.accountId === 'object' ? op.accountId._id : op.accountId;
        if (excludedAccountIds.value.has(aId)) return false;
    }
    return true;
});

// 🟢 Phantom Detection - операция на скрытом счете
const isPhantom = computed(() => {
    return props.operation?.isPhantom === true;
});



// 🟢 4. Детектор ОТКРЫТОЙ предоплаты / Сделки / Транша (Оранжевый)

const isWorkActOp = computed(() => {
    const op = props.operation;
    return op && op.isWorkAct === true; 
});

const isTechnicalOp = computed(() => {
    const op = props.operation;
    // Акты выполненных работ - отдельная категория
    if (isWorkActOp.value) return false;
    // Остальные технические операции (без счета, не акт, не вывод)
    return op && op.type === 'expense' && !op.accountId && !op.isWithdrawal; 
});

const isWithdrawalOp = computed(() => !!props.operation && props.operation.isWithdrawal && !isPersonalTransferWithdrawal(props.operation));
const isCreditIncomeOp = computed(() => mainStore._isCreditIncome(props.operation));

const toOwnerName = computed(() => {
  const op = props.operation;
  if (!op) return '';
  if (op.toCompanyId) return typeof op.toCompanyId === 'object' ? op.toCompanyId.name : 'Компания...'; 
  if (op.toIndividualId) return typeof op.toIndividualId === 'object' ? op.toIndividualId.name : 'Физлицо...';
  return op.toAccountId?.name || 'Счет...';
});

// 🟢 Хелпер для очистки текста от суммы
const cleanDescription = (desc) => {
    if (!desc) return '';
    const cleaned = desc.replace(/^[\d\s]+\s/, '').trim();
    return cleaned || desc;
};

const chipLabel = computed(() => {
  const op = props.operation;
  if (!op) return '';
  

  
  if (isWorkActOp.value) return 'Отработано';
  
  if (isTechnicalOp.value) return op.description || 'Техническая операция';
  
  return op.categoryId?.name || 'Без категории';
});

// Отображаемая сумма с учетом взаимозачетов (для доходов)
const getDisplayAmount = (op) => {
  if (!op || op.amount === undefined || op.amount === null) return null;
  const amt = Number(op.amount);
  if (!Number.isFinite(amt)) return null;

  if (op.type === 'income') {
    const offsets = mainStore.allOperationsFlat.filter(
      (o) => o.offsetIncomeId && mainStore._idsMatch(o.offsetIncomeId, op._id || op.id)
    );
    const offsetTotal = offsets.reduce((s, o) => s + Math.abs(Number(o.amount) || 0), 0);
    return amt - offsetTotal;
  }
  return amt;
};

const displayAmount = computed(() => getDisplayAmount(props.operation));

const TOOLTIP_EMPTY = '—';
const showOperationTooltip = computed(() => props.columnCount === 21 || props.columnCount >= 28);

const normalizeId = (value) => {
  if (!value) return null;
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
    return null;
  }
  return String(value);
};

const resolveEntityName = (value, list) => {
  if (!value) return TOOLTIP_EMPTY;
  if (typeof value === 'string') {
    const fromList = Array.isArray(list)
      ? list.find((item) => normalizeId(item) === value || normalizeId(item?._id) === value || normalizeId(item?.id) === value)
      : null;
    return fromList?.name || value;
  }
  if (typeof value === 'object') {
    if (value.name) return value.name;
    const id = normalizeId(value);
    if (!id || !Array.isArray(list)) return TOOLTIP_EMPTY;
    const fromList = list.find((item) => normalizeId(item?._id) === id || normalizeId(item?.id) === id || normalizeId(item) === id);
    return fromList?.name || TOOLTIP_EMPTY;
  }
  return TOOLTIP_EMPTY;
};

const resolveManyNames = (items, list) => {
  if (!Array.isArray(items) || !items.length) return TOOLTIP_EMPTY;
  const names = items
    .map((item) => resolveEntityName(item, list))
    .filter((name) => name && name !== TOOLTIP_EMPTY);
  return names.length ? names.join(', ') : TOOLTIP_EMPTY;
};

const tooltipDate = computed(() => {
  const op = props.operation;
  if (!op) return TOOLTIP_EMPTY;
  const dateCandidate = op.date || props.dayDate;
  if (!dateCandidate) return TOOLTIP_EMPTY;
  const dt = new Date(dateCandidate);
  return Number.isNaN(dt.getTime()) ? TOOLTIP_EMPTY : dt.toLocaleDateString('ru-RU');
});

const tooltipAmount = computed(() => {
  const op = props.operation;
  if (!op) return TOOLTIP_EMPTY;
  const absValue = Math.abs(Number(displayAmount.value ?? op.amount));
  if (!Number.isFinite(absValue)) return TOOLTIP_EMPTY;
  const prefix = isTransferOp.value ? '' : ((isWithdrawalOp.value || op.type === 'expense') ? '- ' : '+ ');
  return `${prefix}${formatNumber(absValue)} ₸`;
});

const tooltipAccount = computed(() => {
  const op = props.operation;
  if (!op) return TOOLTIP_EMPTY;
  const mainAccount = resolveEntityName(op.accountId, mainStore.accounts);
  if (!isTransferOp.value) return mainAccount;
  const from = resolveEntityName(op.fromAccountId, mainStore.accounts);
  const to = resolveEntityName(op.toAccountId, mainStore.accounts);
  if (from !== TOOLTIP_EMPTY && to !== TOOLTIP_EMPTY) return `${from} -> ${to}`;
  if (from !== TOOLTIP_EMPTY) return from;
  if (to !== TOOLTIP_EMPTY) return to;
  return mainAccount;
});

const tooltipOwner = computed(() => {
  const op = props.operation;
  if (!op) return TOOLTIP_EMPTY;
  const baseOwner = op.companyId
    ? resolveEntityName(op.companyId, mainStore.companies)
    : (op.individualId ? resolveEntityName(op.individualId, mainStore.individuals) : TOOLTIP_EMPTY);
  if (!isTransferOp.value) return baseOwner;
  const from = op.fromCompanyId
    ? resolveEntityName(op.fromCompanyId, mainStore.companies)
    : (op.fromIndividualId ? resolveEntityName(op.fromIndividualId, mainStore.individuals) : TOOLTIP_EMPTY);
  const to = op.toCompanyId
    ? resolveEntityName(op.toCompanyId, mainStore.companies)
    : (op.toIndividualId ? resolveEntityName(op.toIndividualId, mainStore.individuals) : TOOLTIP_EMPTY);
  if (from !== TOOLTIP_EMPTY && to !== TOOLTIP_EMPTY) return `${from} -> ${to}`;
  if (from !== TOOLTIP_EMPTY) return from;
  if (to !== TOOLTIP_EMPTY) return to;
  return baseOwner;
});

const tooltipContractor = computed(() => {
  const op = props.operation;
  if (!op) return TOOLTIP_EMPTY;
  if (op.contractorId) return resolveEntityName(op.contractorId, mainStore.contractors);
  if (op.counterpartyIndividualId) return resolveEntityName(op.counterpartyIndividualId, mainStore.individuals);
  return TOOLTIP_EMPTY;
});

const tooltipProject = computed(() => {
  const op = props.operation;
  if (!op) return TOOLTIP_EMPTY;
  const projectItems = Array.isArray(op.projectIds) && op.projectIds.length
    ? op.projectIds
    : (op.projectId ? [op.projectId] : []);
  return resolveManyNames(projectItems, mainStore.projects);
});

const tooltipCategory = computed(() => {
  const op = props.operation;
  if (!op) return TOOLTIP_EMPTY;
  const categoryItems = Array.isArray(op.categoryIds) && op.categoryIds.length
    ? op.categoryIds
    : (op.categoryId ? [op.categoryId] : []);
  return resolveManyNames(categoryItems, mainStore.categories);
});

const operationTooltip = computed(() => {
  if (!showOperationTooltip.value || !props.operation || !isOpVisible.value) return '';
  return [
    `Дата: ${tooltipDate.value}`,
    `Сумма: ${tooltipAmount.value}`,
    `Счет: ${tooltipAccount.value}`,
    `Владелец: ${tooltipOwner.value}`,
    `Контрагент: ${tooltipContractor.value}`,
    `Проект: ${tooltipProject.value}`,
    `Категория: ${tooltipCategory.value}`
  ].join('\n');
});

const phantomTooltip = computed(() => showOperationTooltip.value ? 'Ячейка занята операцией на скрытом счете' : '');



const onAddClick = (event) => emit('add-operation', event, props.cellIndex);

const onEditClick = () => { 
    // 🟢 Block editing of phantom operations and operations user can't edit
    if (!canInteract.value) return;
    if (props.operation) emit('edit-operation', props.operation); 
};

const onDragStart = (event) => {
  // 🟢 Block dragging if user can't interact with operation
  if (!canInteract.value) {
      event.preventDefault();
      return;
  }
  if (!props.operation) return;
  event.dataTransfer.setData('application/json', JSON.stringify(props.operation));
  event.dataTransfer.effectAllowed = 'move';
  event.currentTarget.style.opacity = '0.5';
};
const onDragEnd = (event) => { event.currentTarget.style.opacity = '1'; };
const onDragOver = (event) => { event.preventDefault(); isDragOver.value = true; event.dataTransfer.dropEffect = 'move'; };
const onDragLeave = () => { isDragOver.value = false; };
const onDrop = (event) => {
  event.preventDefault(); isDragOver.value = false;
  const raw = event.dataTransfer.getData('application/json'); if (!raw) return;
  let operationData = null; try { operationData = JSON.parse(raw); } catch { return; }
  if (!operationData || !operationData._id) return;
  emit('drop-operation', { operation: operationData, toCellIndex: props.cellIndex });
};
</script>

<template>
  <div class="hour-cell" :class="{ 'drag-over': isDragOver }" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <!-- 🟢 PHANTOM: Show placeholder for hidden excluded operations -->
    <div
      v-if="isPhantom"
      class="operation-chip phantom"
      draggable="false"
      :title="phantomTooltip"
    >
      <span class="op-amount">👁️‍🗨️ Занято</span>
      <span class="op-meta">Скрытый счет</span>
    </div>

    <!-- 🟢 REGULAR OPERATION: Show if visible -->
    <div
      v-else-if="operation && isOpVisible"
      class="operation-chip"
      :class="{ 
         transfer: isTransferOp, 
         income: operation.type==='income' && !isWithdrawalOp && !isCreditIncomeOp, 
         expense: operation.type==='expense' && !isWithdrawalOp && !isTechnicalOp && !isTransferOp,
         

         
         withdrawal: isWithdrawalOp,
          'work-act': isWorkActOp,
          technical: isTechnicalOp, 
          'credit-income': isCreditIncomeOp,
          'no-permission': !canInteract
      }"
      :draggable="canInteract"
      :title="operationTooltip"
      @dragstart="onDragStart" @dragend="onDragEnd"
      @click.stop="onEditClick"
    >
      <template v-if="isTransferOp">
        <span class="op-amount">{{ formatNumber(Math.abs(displayAmount ?? operation.amount)) }}</span>
        <span class="op-meta">{{ toOwnerName }}</span>
      </template>
      <template v-else-if="isWithdrawalOp">
        <span class="op-amount">- {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">{{ operation.destination || 'Вывод' }}</span>
      </template>
      <template v-else-if="isWorkActOp">
        <span class="op-amount">✓ {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">{{ chipLabel }}</span>
      </template>
      <template v-else-if="isTechnicalOp">
        <span class="op-amount">✓ {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">{{ chipLabel }}</span>
      </template>
      <template v-else-if="isCreditIncomeOp">
        <span class="op-amount">+ {{ formatNumber(Math.abs(operation.amount)) }}</span>
        <span class="op-meta">Кредит</span>
      </template>

      <!-- ОБЫЧНЫЕ / ПРЕДОПЛАТА / ЗАКРЫТЫЕ -->
      <template v-else>
        <span class="op-amount">
            {{ operation.type === 'income' ? '+' : '-' }} {{ formatNumber(Math.abs(displayAmount ?? operation.amount)) }}
        </span>
        <span class="op-meta">{{ chipLabel }}</span>
      </template>
    </div>

    <div v-else class="cell-empty-space" @click="onAddClick($event)">&nbsp;</div>
  </div>
</template>

<style scoped>
/* Используем переменные из theme.css */
.hour-cell { 
  width: 100%; 
  height: 36px; 
  border-bottom: 1px solid var(--cell-border); 
  display:flex; 
  align-items:center; 
  padding:4px 8px; 
  box-sizing:border-box; 
  flex-shrink:0; 
  transition: background-color .12s ease-in-out; 
}

.hour-cell:nth-child(odd) {
  background-color: var(--cell-bg-odd);
}


.hour-cell.drag-over { 
  background: var(--cell-bg-dragover); 
  outline:1px dashed var(--cell-dragover-outline); 
}
.hour-cell:last-child { border-bottom:none; }
.cell-empty-space { 
  width:100%; 
  height:100%; 
  cursor:cell; 
  border-radius:4px; 
}
.cell-empty-space:hover { background: var(--cell-bg-hover); }

.operation-chip { 
  background: var(--op-default-bg); 
  color: var(--op-default-text); 
  border: 1px solid var(--op-border); 
  padding: 2px 8px; 
  border-radius: 6px; 
  font-size: 0.82em; 
  display: flex; 
  align-items: center; 
  gap: 6px; 
  width: 100%;
  min-width: 0; 
  max-width: 100%; 
  overflow: hidden; 
  cursor: pointer; 
  transition: all .15s ease-in-out; 
}

/* 🟢 Phantom Operation Chip - для скрытых операций */
.operation-chip.phantom {
  background: var(--op-default-bg);
  color: var(--op-default-text);
  border: 1px dashed var(--op-border);
  cursor: not-allowed;
  opacity: 0.7;
}

.operation-chip.phantom:hover {
  opacity: 0.9;
  transform: none; /* Disable hover lift */
}

/* 🟢 No Permission - операция владельца для менеджера */
.operation-chip.no-permission {
  cursor: not-allowed;
  opacity: 0.6;
}
.operation-chip:active { cursor:grabbing; }

.op-amount { 
  font-weight:bold; 
  margin-right:6px; 
  white-space:nowrap; 
}
.op-meta { 
  white-space:nowrap; 
  overflow:hidden; 
  text-overflow:ellipsis; 
}

/* Доход (Income) - Зеленый */
.income {
  background: var(--op-income-bg);
  border: 1px solid var(--op-income-border);
}
.income .op-amount { color: var(--op-income-color); }
.income .op-meta { color: var(--op-income-meta); }

/* Расход (Expense) - Красный */
.expense {
  background: var(--op-expense-bg);
  border: 1px solid var(--op-expense-border);
}
.expense .op-amount { color: var(--op-expense-color); }
.expense .op-meta { color: var(--op-expense-meta); }

/* Предоплата (Prepayment) - Оранжевый */
.prepayment {
  background: var(--op-prepay-bg);
  border: 1px solid var(--op-prepay-border);
}
.prepayment .op-amount { color: var(--op-prepay-color) !important; }
.prepayment .op-meta { color: var(--op-prepay-meta); }

/* Закрытая сделка (Closed Deal) - Зеленый */
.closed-deal { 
  background: var(--op-closed-bg); 
  border: 1px solid var(--op-closed-border); 
}
.closed-deal .op-amount { color: var(--op-closed-color) !important; }
.closed-deal .op-meta { color: var(--op-closed-meta); }

/* Техническая операция (Technical) - Желтый */
.technical { 
  background: var(--op-technical-bg); 
  border: 1px solid var(--op-technical-border); 
}
.technical .op-amount { color: var(--op-technical-color); } 
.technical .op-meta { color: var(--op-technical-meta); }

/* Акт выполненных работ (Work Act) - Серо-зеленый */
.work-act { 
  background: var(--op-workact-bg); 
  border: 1px solid var(--op-workact-border); 
}
.work-act .op-amount { color: var(--op-workact-color) !important; } 
.work-act .op-meta { color: var(--op-workact-meta); }

/* Вывод (Withdrawal) - Фиолетовый */
.withdrawal { 
  background: var(--op-withdrawal-bg); 
  border: 1px solid var(--op-withdrawal-border);
}
.withdrawal .op-amount { color: var(--op-withdrawal-color); }
.withdrawal .op-meta { color: var(--op-withdrawal-meta); }

/* Кредит (Credit Income) - Голубой */
.credit-income { 
  background-color: var(--op-credit-bg); 
  border: 1px solid var(--op-credit-border);
}
.credit-income .op-amount { color: var(--op-credit-color); }
.credit-income .op-meta { color: var(--op-credit-meta); opacity: 0.8; }

/* Перевод (Transfer) - Серо-синий */
.transfer { 
  background: var(--op-transfer-bg); 
  border: 1px solid var(--op-transfer-border);
}
.transfer .op-amount { color: var(--op-transfer-color); } 
.transfer .op-meta { color: var(--op-transfer-meta); }

/* Адаптивные стили */
@media (max-height: 900px) { 
  .hour-cell { padding: 2px 4px; height: 28px; } 
  .operation-chip { font-size: 0.7em; padding: 3px 6px; } 
}
@media (max-width: 1200px) { 
  .hour-cell { padding: 4px 6px; } 
  .operation-chip { font-size: 0.7em; padding: 3px 6px; } 
}
</style>
