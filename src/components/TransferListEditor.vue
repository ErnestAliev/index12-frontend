<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v1.0 - NEW TRANSFER EDITOR ---
 * * КОМПОНЕНТ: TransferListEditor
 * * ДАТА: 2025-11-19
 * * Окно для просмотра и удаления операций перевода.
 */

const props = defineProps({
  title: { type: String, default: 'Редактировать переводы' }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

// Берем все операции и фильтруем только переводы
const transfers = computed(() => {
  const allOps = mainStore.allOperationsFlat;
  const onlyTransfers = allOps.filter(op => 
    op.type === 'transfer' || 
    op.isTransfer === true || 
    (op.categoryId && (op.categoryId.name === 'Перевод' || op.categoryId.name === 'Transfer'))
  );
  
  // Сортировка: Сначала новые
  return onlyTransfers.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB - dateA;
  });
});

const getAccountName = (idOrObj) => {
  if (!idOrObj) return '???';
  const id = typeof idOrObj === 'object' ? idOrObj._id : idOrObj;
  const acc = mainStore.accounts.find(a => a._id === id);
  return acc ? acc.name : 'Удален';
};

const formatDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

// --- Удаление ---
const showDeleteConfirm = ref(false);
const itemToDelete = ref(null);
const isDeleting = ref(false);

const askDelete = (item) => {
  itemToDelete.value = item;
  showDeleteConfirm.value = true;
};

const confirmDelete = async () => {
  if (!itemToDelete.value) return;
  isDeleting.value = true;
  try {
    await mainStore.deleteOperation(itemToDelete.value);
    showDeleteConfirm.value = false;
    itemToDelete.value = null;
  } catch (e) {
    console.error(e);
    alert('Ошибка при удалении');
  } finally {
    isDeleting.value = false;
  }
};

const cancelDelete = () => {
  showDeleteConfirm.value = false;
  itemToDelete.value = null;
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      
      <div class="popup-header">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>
      
      <p class="hint">Список операций перевода. Нажмите на корзину для удаления.</p>
      
      <div class="transfers-list">
        <div v-if="transfers.length === 0" class="empty-state">
          Переводов пока нет.
        </div>

        <div v-for="t in transfers" :key="t._id" class="transfer-row">
          
          <!-- Инфо о переводе -->
          <div class="transfer-info">
            <div class="row-top">
                <span class="acc-name from" :title="getAccountName(t.fromAccountId)">
                {{ getAccountName(t.fromAccountId) }}
                </span>
                
                <span class="arrow">→</span>
                
                <span class="amount">
                {{ formatNumber(Math.abs(t.amount)) }} ₸
                </span>
                
                <span class="arrow">→</span>
                
                <span class="acc-name to" :title="getAccountName(t.toAccountId)">
                {{ getAccountName(t.toAccountId) }}
                </span>
            </div>
            <div class="row-bottom">
                <span class="date-badge">{{ formatDate(t.date) }}</span>
            </div>
          </div>

          <!-- Кнопка удалить -->
          <button class="delete-btn" @click="askDelete(t)" title="Удалить этот перевод">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>

        </div>
      </div>

      <div class="popup-footer">
        <button class="btn-close" @click="$emit('close')">Закрыть</button>
      </div>
    </div>

    <!-- Внутренний модал подтверждения -->
    <div v-if="showDeleteConfirm" class="inner-overlay" @click.self="cancelDelete">
      <div class="confirm-box">
        <h4>Удалить перевод?</h4>
        <p v-if="itemToDelete" class="confirm-text">
          {{ getAccountName(itemToDelete.fromAccountId) }} → {{ getAccountName(itemToDelete.toAccountId) }}<br>
          <b>{{ formatNumber(Math.abs(itemToDelete.amount)) }} ₸</b>
        </p>
        <div class="confirm-actions">
          <button class="btn-cancel" @click="cancelDelete" :disabled="isDeleting">Отмена</button>
          <button class="btn-delete-confirm" @click="confirmDelete" :disabled="isDeleting">
            {{ isDeleting ? '...' : 'Удалить' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.popup-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.6);
  display: flex; justify-content: center; align-items: center;
  z-index: 1200;
}

.popup-content {
  background: #F4F4F4; width: 100%; max-width: 600px;
  border-radius: 12px; display: flex; flex-direction: column;
  max-height: 85vh; margin: 1rem;
  box-shadow: 0 15px 40px rgba(0,0,0,0.3);
}

.popup-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1.5rem 1.5rem 0.5rem 1.5rem;
}
h3 { margin: 0; font-size: 20px; color: #1a1a1a; font-weight: 600; }

.close-btn { font-size: 28px; background: none; border: none; cursor: pointer; color: #888; line-height: 1; }
.close-btn:hover { color: #333; }

.hint { padding: 0 1.5rem; font-size: 0.9em; color: #666; margin-bottom: 1rem; margin-top: 0; }

.transfers-list {
  flex-grow: 1; overflow-y: auto;
  padding: 0 1.5rem;
  display: flex; flex-direction: column; gap: 8px;
  margin-bottom: 1.5rem;
}
.transfers-list::-webkit-scrollbar { display: none; }

.transfer-row {
  background: #fff; border: 1px solid #e0e0e0; border-radius: 8px;
  padding: 12px 16px;
  display: flex; justify-content: space-between; align-items: center;
  transition: border-color 0.2s;
}
.transfer-row:hover { border-color: #bbb; }

.transfer-info {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 0.95em; color: #333;
  flex-grow: 1;
}
.row-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.row-bottom { display: flex; align-items: center; }

.acc-name { font-weight: 500; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9em; }
.arrow { color: #999; font-size: 0.8em; }
.amount { font-weight: 700; color: #333; white-space: nowrap; }
.date-badge { font-size: 0.8em; color: #888; }

.delete-btn {
  flex-shrink: 0; width: 40px; height: 40px;
  border: 1px solid #eee; background: #fff; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: #ccc; transition: all 0.2s;
  margin-left: 10px;
}
.delete-btn:hover {
  border-color: #ff3b30; background: #fff5f5; color: #ff3b30;
}
.delete-btn svg { width: 20px; height: 20px; }

.empty-state { text-align: center; padding: 2rem; color: #888; }

.popup-footer {
  padding: 1rem 1.5rem; border-top: 1px solid #e0e0e0;
  display: flex; justify-content: flex-end;
}
.btn-close {
  background: #333; color: #fff; border: none;
  padding: 10px 24px; border-radius: 6px;
  cursor: pointer; font-weight: 600;
}
.btn-close:hover { background: #555; }

.inner-overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.4); border-radius: 12px;
  display: flex; justify-content: center; align-items: center;
  z-index: 1210;
}
.confirm-box {
  background: #fff; padding: 24px; border-radius: 8px;
  width: 300px; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.2);
}
.confirm-text { font-size: 14px; margin-bottom: 20px; color: #555; }
.confirm-actions { display: flex; gap: 10px; justify-content: center; }
.btn-cancel { background: #e0e0e0; color: #333; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
.btn-delete-confirm { background: #ff3b30; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
</style>
