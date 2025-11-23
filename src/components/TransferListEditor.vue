<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';
import TransferPopup from './TransferPopup.vue'; 
import WithdrawalPopup from './WithdrawalPopup.vue';
import ConfirmationPopup from './ConfirmationPopup.vue'; // 🟢 Импорт нашего попапа подтверждения

const props = defineProps({
  title: { type: String, default: 'Редактор переводов' }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const activeTab = ref('active');
const chains = ref([]);
const isLoading = ref(false);

const isTransferPopupVisible = ref(false);
const isWithdrawalPopupVisible = ref(false);
// 🟢 Состояния для кастомного подтверждения отмены
const isCancelConfirmVisible = ref(false);
const chainToCancel = ref(null);

const operationToEdit = ref(null);
const initialTransferData = ref(null); 
const initialWithdrawalData = ref(null); 

const activePopoverId = ref(null);

const loadChains = () => {
  isLoading.value = true;
  const allOps = mainStore.allOperationsFlat;
  
  const relevantOps = allOps.filter(op => 
    op.type === 'transfer' || 
    op.isTransfer === true || 
    op.isWithdrawal === true || 
    (op.categoryId && ['перевод', 'transfer', 'вывод', 'withdrawal'].includes(op.categoryId.name?.toLowerCase()))
  );

  const groups = {};
  
  relevantOps.forEach(op => {
      const groupId = op.transferGroupId || op._id;
      if (!groups[groupId]) {
          groups[groupId] = {
              id: groupId,
              date: new Date(op.date),
              steps: [],
              status: 'active',
              totalAmount: Math.abs(op.amount),
              lastOp: null
          };
      }
      groups[groupId].steps.push(op);
      if (new Date(op.date) > groups[groupId].date) {
          groups[groupId].date = new Date(op.date);
          groups[groupId].lastOp = op;
      }
      if (!groups[groupId].lastOp) groups[groupId].lastOp = op;
  });

  chains.value = Object.values(groups).map(group => {
      group.steps.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      const lastStep = group.steps[group.steps.length - 1];
      const isWithdrawal = lastStep.isWithdrawal || (lastStep.categoryId?.name?.toLowerCase().includes('вывод'));
      
      if (isWithdrawal) {
          group.status = 'withdrawal';
      } else {
          group.status = 'active'; 
      }
      
      return group;
  }).sort((a, b) => b.date - a.date);

  isLoading.value = false;
};

onMounted(() => {
  loadChains();
  document.addEventListener('click', closePopover);
});

onUnmounted(() => {
  document.removeEventListener('click', closePopover);
});

const filteredChains = computed(() => {
    if (activeTab.value === 'all') return chains.value;
    if (activeTab.value === 'active') return chains.value.filter(c => c.status === 'active');
    if (activeTab.value === 'completed') return chains.value.filter(c => c.status === 'withdrawal' || c.status === 'completed');
    return chains.value;
});

const activeCount = computed(() => chains.value.filter(c => c.status === 'active').length);
const hiddenCount = computed(() => chains.value.length - activeCount.value);

const formatDate = (date) => {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const getFromName = (op) => {
    if (op.fromAccountId?.name) return `${op.fromAccountId.name}`;
    if (op.fromCompanyId?.name) return `${op.fromCompanyId.name}`;
    return 'Неизвестно';
};

const formatMoney = (val) => `${formatNumber(val)} ₸`;

const togglePopover = (event, chainId) => {
    event.stopPropagation();
    if (activePopoverId.value === chainId) {
        activePopoverId.value = null;
    } else {
        activePopoverId.value = chainId;
    }
};

const closePopover = () => {
    activePopoverId.value = null;
};

const handleCreateNew = () => {
    initialTransferData.value = null;
    operationToEdit.value = null;
    isTransferPopupVisible.value = true;
};

const handleContinueTransfer = (chain) => {
    const lastOp = chain.lastOp;
    operationToEdit.value = null;
    initialTransferData.value = {
        amount: Math.abs(lastOp.amount),
        fromAccountId: lastOp.toAccountId?._id || lastOp.toAccountId,
        fromCompanyId: lastOp.toCompanyId?._id || lastOp.toCompanyId,
        fromIndividualId: lastOp.toIndividualId?._id || lastOp.toIndividualId,
        transferGroupId: chain.id 
    };
    isTransferPopupVisible.value = true;
    activePopoverId.value = null;
};

const handleContinueWithdrawal = (chain) => {
    const lastOp = chain.lastOp;
    let fromName = 'Счет';
    if (lastOp.toAccountId?.name) fromName = lastOp.toAccountId.name;
    else if (lastOp.toCompanyId?.name) fromName = lastOp.toCompanyId.name;

    initialWithdrawalData.value = {
        amount: Math.abs(lastOp.amount),
        fromAccountId: lastOp.toAccountId?._id || lastOp.toAccountId,
        fromAccountName: fromName,
        transferGroupId: chain.id 
    };
    isWithdrawalPopupVisible.value = true;
    activePopoverId.value = null;
};

// 🟢 ИНИЦИАЛИЗАЦИЯ ОТМЕНЫ (Открытие попапа)
const handleCancelWithdrawal = (chain) => {
    chainToCancel.value = chain;
    isCancelConfirmVisible.value = true;
};

// 🟢 ПОДТВЕРЖДЕНИЕ ОТМЕНЫ
const onCancelConfirmed = async () => {
    if (!chainToCancel.value) return;
    const chain = chainToCancel.value;
    
    try {
        const lastStep = chain.steps[chain.steps.length - 1];
        if (lastStep && (lastStep.isWithdrawal || lastStep.type === 'expense')) {
            await mainStore.deleteOperation(lastStep);
            await mainStore.fetchAllEntities();
            loadChains(); 
        }
    } catch (e) {
        console.error(e);
        alert('Ошибка при отмене вывода');
    } finally {
        isCancelConfirmVisible.value = false;
        chainToCancel.value = null;
    }
};

const handleViewChain = (chain) => {
    const lastOp = chain.lastOp;
    if (lastOp.isWithdrawal) {
        operationToEdit.value = lastOp;
        isWithdrawalPopupVisible.value = true;
    } else {
        operationToEdit.value = lastOp;
        initialTransferData.value = null;
        isTransferPopupVisible.value = true;
    }
};

const onTransferSaved = async (eventData) => {
    try {
        if (eventData.mode === 'create') {
             await mainStore.createTransfer(eventData.data);
        } else {
             await mainStore.updateTransfer(eventData.id, eventData.data);
        }
        await mainStore.fetchAllEntities();
        loadChains();
        isTransferPopupVisible.value = false;
    } catch (e) {
        console.error(e);
        alert('Ошибка сохранения');
    }
};

const onWithdrawalSaved = async (eventData) => {
    try {
        const { mode, id, data } = eventData;
        if (mode === 'create') {
            const payload = {
                ...data,
                date: new Date(),
                categoryId: await mainStore._getOrCreateTransferCategory(), 
                transferGroupId: initialWithdrawalData.value?.transferGroupId,
                accountId: initialWithdrawalData.value?.fromAccountId
            };
            await mainStore.createEvent(payload);
        } else {
            const updatePayload = {
                 amount: -Math.abs(data.amount),
                 destination: data.destination,
                 reason: data.reason
            };
            await mainStore.updateOperation(id, updatePayload);
        }
        await mainStore.fetchAllEntities();
        loadChains();
        isWithdrawalPopupVisible.value = false;
    } catch (e) {
        console.error(e);
        alert('Ошибка вывода: ' + e.message);
    }
};
</script>

<template>
  <div class="editor-window-overlay" @click.self="$emit('close')">
    <div class="editor-window">
      <div class="header">
        <h3>Редактор переводов</h3>
      </div>

      <div class="controls-row">
        <div class="tabs">
          <button class="tab-btn" :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'">Все</button>
          <button class="tab-btn" :class="{ active: activeTab === 'active' }" @click="activeTab = 'active'">
            В работе <span class="badge">{{ activeCount }}</span>
          </button>
          <button class="tab-btn" :class="{ active: activeTab === 'completed' }" @click="activeTab = 'completed'">Завершенные</button>
        </div>
        <div class="info-text">
          Показано: {{ filteredChains.length }} цепочек 
          <span v-if="activeTab === 'active'">(скрыто {{ hiddenCount }} завершенных)</span>
        </div>
      </div>

      <div class="list-scroll">
        <div v-if="isLoading" class="loading-state">Загрузка...</div>
        <div v-else-if="filteredChains.length === 0" class="empty-state">Нет цепочек</div>

        <div 
          v-for="chain in filteredChains" 
          :key="chain.id" 
          class="chain-card"
          :class="{ 'closed': chain.status === 'withdrawal' || chain.status === 'completed' }"
          :style="chain.status === 'withdrawal' ? 'border-left-color: #7B1FA2;' : ''"
        >
          <div class="card-left">
            <div class="chain-header">
              <span class="chain-title">Цепочка от {{ formatDate(chain.date) }}</span>
              <span v-if="chain.status === 'active'" class="status-label status-active">АКТИВНА</span>
              <span v-else-if="chain.status === 'withdrawal'" class="status-label status-withdrawal">ВЫВЕДЕНО</span>
            </div>
            
            <div class="chain-flow">
              <template v-for="(step, idx) in chain.steps" :key="step._id">
                <span v-if="idx > 0" class="flow-arrow">➜</span>
                <span class="flow-step" :class="{ 'withdrawal-chip': step.isWithdrawal }">
                  <template v-if="step.isWithdrawal">
                    {{ step.destination || 'Вывод' }} ({{ formatNumber(Math.abs(step.amount)) }})
                  </template>
                  <template v-else>
                    {{ getFromName(step) }} ({{ formatNumber(Math.abs(step.amount)) }})
                  </template>
                </span>
              </template>
              <span v-if="chain.status === 'active'" class="flow-waiting">...на балансе</span>
            </div>
          </div>

          <div class="card-right">
            <div class="balance-block">
              <span class="balance-amount" :style="chain.status === 'withdrawal' ? 'color: #7B1FA2' : ''">
                {{ chain.status === 'withdrawal' ? '0 ₸' : formatMoney(chain.totalAmount) }}
              </span>
              <span class="balance-label">
                {{ chain.status === 'withdrawal' ? 'Закрыта' : 'Доступно' }}
              </span>
            </div>

            <div v-if="chain.status === 'active'" class="action-wrapper">
                <button class="btn-continue" @click="togglePopover($event, chain.id)">➜ Продолжить</button>
                <div v-if="activePopoverId === chain.id" class="action-popover">
                    <div class="popover-item" @click="handleContinueTransfer(chain)">
                        <span class="icon-transfer">➜</span> Перевод на счет
                    </div>
                    <div class="popover-item" @click="handleContinueWithdrawal(chain)">
                        <span class="icon-withdraw">⤓</span> Вывод денег
                    </div>
                </div>
            </div>

            <!-- 🟢 Кнопка отмены с вызовом нашего попапа -->
            <div v-if="chain.status === 'withdrawal'" class="action-wrapper">
                <button class="btn-undo" @click="handleCancelWithdrawal(chain)" title="Отменить вывод и вернуть деньги">
                   ↺ Отменить
                </button>
            </div>

            <button class="btn-view" @click="handleViewChain(chain)">👁</button>
          </div>
        </div>
      </div>

      <div class="footer">
        <button class="btn-create" @click="handleCreateNew">+ Новый перевод</button>
        <div class="footer-right">
          <button class="btn-close" @click="$emit('close')">Закрыть</button>
        </div>
      </div>
    </div>
  </div>

  <TransferPopup
    v-if="isTransferPopupVisible"
    :date="new Date()"
    :cellIndex="0"
    :transferToEdit="operationToEdit"
    :initial-data="initialTransferData"
    @close="isTransferPopupVisible = false"
    @save="onTransferSaved"
  />

  <WithdrawalPopup
    v-if="isWithdrawalPopupVisible"
    :initial-data="initialWithdrawalData || {}"
    :operation-to-edit="operationToEdit"
    @close="isWithdrawalPopupVisible = false"
    @save="onWithdrawalSaved"
  />

  <!-- 🟢 Наш красивый попап подтверждения -->
  <ConfirmationPopup
    v-if="isCancelConfirmVisible"
    title="Отмена вывода"
    message="Вы уверены, что хотите отменить вывод и вернуть деньги на баланс?"
    @close="isCancelConfirmVisible = false"
    @confirm="onCancelConfirmed"
  />

</template>

<style scoped>
.editor-window-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0,0,0,0.6);
  display: flex; justify-content: center; align-items: center;
  z-index: 1100;
}
.editor-window {
  background: #EBEBEB; border-radius: 16px; width: 95%; max-width: 1100px; height: 85vh;
  display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,0.5); overflow: hidden; position: relative;
}
.header { padding: 1.5rem 2rem 1rem; }
h3 { margin: 0; font-size: 24px; color: #1a1a1a; font-weight: 700; }
.controls-row { padding: 0 2rem 1.5rem; display: flex; justify-content: space-between; align-items: center; }
.tabs { display: flex; background: #DCDCDC; border-radius: 8px; padding: 4px; gap: 4px; }
.tab-btn { border: none; background: transparent; padding: 6px 16px; border-radius: 6px; font-size: 14px; color: #666; cursor: pointer; font-weight: 600; transition: all 0.2s; }
.tab-btn.active { background: #FFFFFF; color: #222; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.badge { background: #FF9D00; color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 10px; font-weight: 700; margin-left: 6px; }
.info-text { font-size: 13px; color: #888; }
.list-scroll { flex-grow: 1; overflow-y: auto; padding: 0 2rem 2rem; display: flex; flex-direction: column; gap: 12px; }
.chain-card { 
  background: #FFFFFF; border-radius: 12px; padding: 16px 20px; 
  display: flex; justify-content: space-between; align-items: center; 
  box-shadow: 0 2px 5px rgba(0,0,0,0.03); border: 1px solid transparent; 
  transition: border-color 0.2s; border-left: 4px solid #FF9D00; position: relative; 
}
.chain-card:hover { border-color: #ccc; }
.chain-card.closed { border-left-color: #aaa; background: #F5F5F5; }
.card-left { display: flex; flex-direction: column; gap: 10px; }
.chain-header { display: flex; align-items: center; gap: 10px; }
.chain-title { font-weight: 700; font-size: 16px; color: #222; }
.status-label { font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 3px 6px; border-radius: 4px; }
.status-active { color: #D97706; background: #FEF3C7; }
.status-withdrawal { color: #7B1FA2; background: #F3E5F5; }
.chain-flow { font-size: 14px; color: #555; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.flow-arrow { color: #aaa; font-size: 12px; }
.flow-step { background: #F3F4F6; padding: 3px 8px; border-radius: 4px; font-size: 13px; color: #333; }
.flow-step.withdrawal-chip { background: #F3E5F5; color: #7B1FA2; border: 1px solid #E1BEE7; font-weight: 600; }
.flow-waiting { color: #999; font-style: italic; font-size: 13px; margin-left: 4px; }
.card-right { display: flex; align-items: center; gap: 20px; position: relative; }
.balance-block { text-align: right; min-width: 100px; }
.balance-amount { display: block; font-weight: 800; font-size: 17px; color: #222; }
.balance-label { display: block; font-size: 10px; color: #888; text-transform: uppercase; margin-top: 2px; font-weight: 600; }
.action-wrapper { position: relative; }
.btn-continue { background: #2F3340; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.2s; }
.btn-continue:hover { background: #444; }
.btn-undo { background: #FFF0F0; color: #FF3B30; border: 1px solid #FFD0D0; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
.btn-undo:hover { background: #FFE5E5; border-color: #FF3B30; }
.btn-view { width: 40px; height: 40px; border: 1px solid #ddd; background: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #555; font-size: 18px; }
.btn-view:hover { background: #f9f9f9; }
.action-popover { position: absolute; top: 100%; right: 0; margin-top: 5px; background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); z-index: 100; width: 220px; display: flex; flex-direction: column; overflow: hidden; }
.popover-item { padding: 12px 16px; cursor: pointer; font-size: 14px; font-weight: 500; color: #333; border-bottom: 1px solid #f5f5f5; display: flex; align-items: center; gap: 10px; transition: background 0.2s; }
.popover-item:hover { background: #f9f9f9; }
.icon-transfer { color: #2F3340; font-weight: bold; }
.icon-withdraw { color: #7B1FA2; font-weight: bold; }
.footer { padding: 1.5rem 2rem; border-top: 1px solid #DEDEDE; background: #EBEBEB; display: flex; justify-content: space-between; align-items: center; }
.btn-close { padding: 12px 24px; border: 1px solid #ccc; background: transparent; border-radius: 8px; cursor: pointer; color: #555; font-weight: 600; }
.btn-create { padding: 12px 24px; background-color: #2F3340; color: #fff; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.loading-state, .empty-state { text-align: center; padding: 2rem; color: #888; }
</style>