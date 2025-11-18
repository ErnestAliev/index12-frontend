<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v18.1 - FULL EDITOR GRID ---
 * * ВЕРСИЯ: 18.1 - Полноценный табличный редактор переводов
 * * ДАТА: 2025-11-19
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (UI) Полная переработка верстки под Grid-таблицу.
 * 2. (FEAT) Добавлено редактирование всех полей: Дата, Сумма, Счета, Владельцы.
 * 3. (LOGIC) Добавлена кнопка "Сохранить изменения" с пакетным обновлением.
 * 4. (LOGIC) Добавлена авто-подстановка владельца при смене счета.
 */

const props = defineProps({
  title: { type: String, default: 'Редактировать переводы' }
});

const emit = defineEmits(['close']);
const mainStore = useMainStore();

const localItems = ref([]);
const isSaving = ref(false);
const isDeleting = ref(false);

// --- Данные для селектов ---
const accounts = computed(() => mainStore.accounts);
// Объединяем Компании и Физлица для селекта "Владелец"
const owners = computed(() => {
  const comps = mainStore.companies.map(c => ({ ...c, type: 'company', label: c.name }));
  const inds = mainStore.individuals.map(i => ({ ...i, type: 'individual', label: i.name }));
  return [...comps, ...inds];
});

// Форматирование даты для input type="date" (YYYY-MM-DD)
const toInputDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Инициализация данных
onMounted(() => {
  const allOps = mainStore.allOperationsFlat;
  // Фильтруем только переводы
  const onlyTransfers = allOps.filter(op => 
    op.type === 'transfer' || 
    op.isTransfer === true || 
    (op.categoryId && (op.categoryId.name === 'Перевод' || op.categoryId.name === 'Transfer'))
  );

  // Сортируем (новые сверху) и маппим в локальную структуру
  localItems.value = onlyTransfers
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(t => {
      // Определяем ID владельцев
      const fromOwnerId = getOwnerId(t.fromCompanyId, t.fromIndividualId);
      const toOwnerId = getOwnerId(t.toCompanyId, t.toIndividualId);

      return {
        _id: t._id,
        originalOp: t,
        date: toInputDate(t.date),
        amount: t.amount,
        amountFormatted: formatNumber(Math.abs(t.amount)),
        
        fromAccountId: t.fromAccountId?._id || t.fromAccountId,
        fromOwnerId: fromOwnerId,
        
        toAccountId: t.toAccountId?._id || t.toAccountId,
        toOwnerId: toOwnerId,
        
        isDeleted: false
      };
    });
});

// Хелпер для получения ID владельца из полей операции
const getOwnerId = (compId, indId) => {
  if (compId) return typeof compId === 'object' ? `company-${compId._id}` : `company-${compId}`;
  if (indId) return typeof indId === 'object' ? `individual-${indId._id}` : `individual-${indId}`;
  return null;
};

// --- Обработчики изменений ---

const onAmountInput = (item) => {
  const raw = item.amountFormatted.replace(/[^0-9]/g, '');
  item.amountFormatted = formatNumber(raw);
  item.amount = Number(raw);
};

// При смене счета пытаемся найти его владельца и подставить
const onAccountChange = (item, direction) => {
  const accId = direction === 'from' ? item.fromAccountId : item.toAccountId;
  const account = accounts.value.find(a => a._id === accId);
  
  if (account) {
    let newOwnerId = null;
    if (account.companyId) {
      const cId = typeof account.companyId === 'object' ? account.companyId._id : account.companyId;
      newOwnerId = `company-${cId}`;
    } else if (account.individualId) {
      const iId = typeof account.individualId === 'object' ? account.individualId._id : account.individualId;
      newOwnerId = `individual-${iId}`;
    }
    
    if (newOwnerId) {
      if (direction === 'from') item.fromOwnerId = newOwnerId;
      else item.toOwnerId = newOwnerId;
    }
  }
};

// --- Сохранение ---
const handleSave = async () => {
  isSaving.value = true;
  try {
    const updates = [];
    
    for (const item of localItems.value) {
      // Пропускаем удаленные (они удаляются сразу)
      if (item.isDeleted) continue;

      const original = item.originalOp;
      const newDate = new Date(item.date);
      
      // Парсим владельцев
      let fromComp = null, fromInd = null;
      if (item.fromOwnerId) {
        const [type, id] = item.fromOwnerId.split('-');
        if (type === 'company') fromComp = id; else fromInd = id;
      }
      
      let toComp = null, toInd = null;
      if (item.toOwnerId) {
        const [type, id] = item.toOwnerId.split('-');
        if (type === 'company') toComp = id; else toInd = id;
      }

      // Проверяем, изменилось ли что-то
      const isChanged = 
        toInputDate(original.date) !== item.date ||
        Math.abs(original.amount) !== item.amount ||
        (original.fromAccountId?._id || original.fromAccountId) !== item.fromAccountId ||
        (original.toAccountId?._id || original.toAccountId) !== item.toAccountId ||
        getOwnerId(original.fromCompanyId, original.fromIndividualId) !== item.fromOwnerId ||
        getOwnerId(original.toCompanyId, original.toIndividualId) !== item.toOwnerId;

      if (isChanged) {
        updates.push(mainStore.updateTransfer(item._id, {
          date: newDate,
          amount: item.amount,
          fromAccountId: item.fromAccountId,
          toAccountId: item.toAccountId,
          fromCompanyId: fromComp,
          fromIndividualId: fromInd,
          toCompanyId: toComp,
          toIndividualId: toInd
        }));
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
    emit('close');
  } catch (e) {
    console.error("Ошибка сохранения:", e);
    alert("Ошибка при сохранении изменений");
  } finally {
    isSaving.value = false;
  }
};

// --- Удаление ---
const handleDelete = async (item) => {
  if (!confirm('Удалить этот перевод?')) return;
  isDeleting.value = true; // Можно добавить индикатор на конкретную строку, но пока общий
  try {
    await mainStore.deleteOperation(item.originalOp);
    // Удаляем из локального списка
    localItems.value = localItems.value.filter(i => i._id !== item._id);
  } catch (e) {
    console.error(e);
  } finally {
    isDeleting.value = false;
  }
};

</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content wide-editor">
      
      <div class="popup-header">
        <h3>{{ title }}</h3>
      </div>
      
      <p class="editor-hint">
        Редактируйте параметры переводов. Нажмите на корзину для удаления.
      </p>
      
      <!-- Шапка таблицы -->
      <div class="grid-header">
        <span class="col-date">Дата</span>
        <span class="col-owner">Отправитель</span>
        <span class="col-acc">Счет (От)</span>
        <span class="col-amount">Сумма</span>
        <span class="col-acc">Счет (Куда)</span>
        <span class="col-owner">Получатель</span>
        <span class="col-trash"></span>
      </div>
      
      <div class="list-scroll">
        <div v-if="localItems.length === 0" class="empty-state">
          Нет переводов.
        </div>

        <div v-for="item in localItems" :key="item._id" class="grid-row">
          
          <!-- Дата -->
          <div class="col-date">
            <input type="date" v-model="item.date" class="edit-input" />
          </div>

          <!-- Владелец От -->
          <div class="col-owner">
             <select v-model="item.fromOwnerId" class="edit-input select-input">
                <option :value="null">-</option>
                <optgroup label="Компании">
                   <option v-for="c in mainStore.companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option>
                </optgroup>
                <optgroup label="Физлица">
                   <option v-for="i in mainStore.individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option>
                </optgroup>
             </select>
          </div>

          <!-- Счет От -->
          <div class="col-acc">
            <select v-model="item.fromAccountId" @change="onAccountChange(item, 'from')" class="edit-input select-input">
               <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
            </select>
          </div>

          <!-- Сумма -->
          <div class="col-amount">
            <input type="text" v-model="item.amountFormatted" @input="onAmountInput(item)" class="edit-input amount-input" />
          </div>

          <!-- Счет Куда -->
          <div class="col-acc">
            <select v-model="item.toAccountId" @change="onAccountChange(item, 'to')" class="edit-input select-input">
               <option v-for="a in accounts" :key="a._id" :value="a._id">{{ a.name }}</option>
            </select>
          </div>

          <!-- Владелец Куда -->
          <div class="col-owner">
             <select v-model="item.toOwnerId" class="edit-input select-input">
                <option :value="null">-</option>
                <optgroup label="Компании">
                   <option v-for="c in mainStore.companies" :key="c._id" :value="`company-${c._id}`">{{ c.name }}</option>
                </optgroup>
                <optgroup label="Физлица">
                   <option v-for="i in mainStore.individuals" :key="i._id" :value="`individual-${i._id}`">{{ i.name }}</option>
                </optgroup>
             </select>
          </div>

          <!-- Удалить -->
          <div class="col-trash">
            <button class="delete-btn" @click="handleDelete(item)" title="Удалить">
               <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
               </svg>
            </button>
          </div>

        </div>
      </div>

      <div class="popup-footer">
        <button class="btn-close" @click="$emit('close')">Отмена</button>
        <button class="btn-save" @click="handleSave" :disabled="isSaving">
          {{ isSaving ? 'Сохранение...' : 'Сохранить изменения' }}
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.popup-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.6);
  display: flex; justify-content: center; align-items: center;
  z-index: 1200; overflow-y: auto;
}

.popup-content {
  background: #F4F4F4; 
  border-radius: 12px; display: flex; flex-direction: column;
  max-height: 85vh; margin: 2rem 1rem;
  box-shadow: 0 15px 40px rgba(0,0,0,0.3);
  width: 95%; max-width: 1100px; /* Широкий попап для таблицы */
}

.popup-header { padding: 1.5rem 1.5rem 0.5rem; }
h3 { margin: 0; font-size: 22px; color: #1a1a1a; font-weight: 600; }
.editor-hint { padding: 0 1.5rem; font-size: 0.9em; color: #666; margin-bottom: 1.5rem; margin-top: 0; }

/* --- ТАБЛИЦА (GRID) --- */
/* Определяем колонки: 
   Date (110px) | Owner (1fr) | Acc (1fr) | Amount (100px) | Acc (1fr) | Owner (1fr) | Trash (50px) 
*/
.grid-header, .grid-row {
  display: grid;
  grid-template-columns: 130px 1fr 1fr 120px 1fr 1fr 50px;
  gap: 10px;
  align-items: center;
  padding: 0 1.5rem;
}

.grid-header {
  font-size: 0.8em; color: #666; margin-bottom: 8px; font-weight: 500;
}
.grid-row {
  margin-bottom: 8px;
}

.list-scroll {
  flex-grow: 1; overflow-y: auto; padding-bottom: 1rem;
  scrollbar-width: none; -ms-overflow-style: none;
}
.list-scroll::-webkit-scrollbar { display: none; }

/* Стили инпутов (как в EntityListEditor) */
.edit-input {
  width: 100%; height: 44px;
  background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px;
  padding: 0 10px; font-size: 0.9em; color: #333;
  box-sizing: border-box;
}
.edit-input:focus { outline: none; border-color: #222; box-shadow: 0 0 0 2px rgba(34,34,34,0.1); }

.select-input {
  -webkit-appearance: none; appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center;
  padding-right: 30px;
}
.amount-input { text-align: right; font-weight: 600; }

/* Кнопка удаления */
.delete-btn {
  width: 44px; height: 44px;
  border: 1px solid #E0E0E0; background: #fff; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.2s;
}
.delete-btn svg { width: 20px; height: 20px; stroke: #999; }
.delete-btn:hover { border-color: #FF3B30; background: #FFF5F5; }
.delete-btn:hover svg { stroke: #FF3B30; }

/* Футер */
.popup-footer {
  padding: 1.5rem; border-top: 1px solid #E0E0E0;
  display: flex; justify-content: flex-end; gap: 10px;
  background-color: #F9F9F9; border-radius: 0 0 12px 12px;
}
.btn-close {
  padding: 12px 24px; border: 1px solid #ccc; background: transparent;
  border-radius: 8px; cursor: pointer; font-weight: 500; color: #555;
}
.btn-close:hover { background: #eee; }

.btn-save {
  padding: 12px 24px; border: none; background: #222;
  border-radius: 8px; cursor: pointer; font-weight: 600; color: #fff;
}
.btn-save:hover:not(:disabled) { background: #444; }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

.empty-state { text-align: center; padding: 2rem; color: #888; }

/* Адаптив для малых экранов */
@media (max-width: 1024px) {
  .popup-content { max-width: 95vw; margin: 1rem; }
  .grid-header { display: none; /* Скрываем шапку на узких экранах */ }
  .grid-row {
    display: flex; flex-direction: column; height: auto;
    background: #fff; padding: 1rem; border: 1px solid #eee; border-radius: 8px;
    gap: 10px;
  }
  .edit-input { height: 40px; }
  .delete-btn { width: 100%; margin-top: 5px; background-color: #FFF0F0; border-color: #FFD0D0; }
}
</style>
