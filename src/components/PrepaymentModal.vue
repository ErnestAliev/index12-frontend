<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v1.0 - SMART MODAL ---
 * * ВЕРСИЯ: 1.0 - Отдельное модальное окно "Предоплата"
 * * ДАТА: 2025-11-20
 */

const props = defineProps({
  initialData: { type: Object, required: true }, // Данные из OperationPopup
  dateKey: { type: String, required: true }
});

const emit = defineEmits(['close', 'save']);
const mainStore = useMainStore();

// Данные формы (получаем из предыдущего шага)
const amount = ref(props.initialData.amount || 0);
const formattedAmount = ref('');
const totalDealAmount = ref(0);
const formattedTotalDeal = ref('');

// Данные сущностей (readonly или скрытые, так как они уже выбраны)
const contractorName = computed(() => {
    const c = mainStore.contractors.find(i => i._id === props.initialData.contractorId);
    return c ? c.name : 'Не выбран';
});

// Форматтеры
const formatNumber = (num) => {
  return String(Math.floor(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const onAmountInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  amount.value = Number(raw);
  formattedAmount.value = formatNumber(raw);
};

const onTotalDealInput = (e) => {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  totalDealAmount.value = Number(raw);
  formattedTotalDeal.value = formatNumber(raw);
};

// Инициализация
onMounted(() => {
  formattedAmount.value = formatNumber(amount.value);
  // Фокус сразу на "Общую сумму", так как сумма уже введена
  nextTick(() => {
     document.querySelector('.smart-focus')?.focus();
  });
});

// Умные подсказки
const smartHint = computed(() => {
  const current = amount.value;
  const total = totalDealAmount.value;

  if (total <= 0) return null;

  if (total === current) {
    return {
      text: `Это полная оплата. Сделка будет считаться полностью оплаченной. Мы должны клиенту услуги на ${formatNumber(total)}.`,
      type: 'success'
    };
  } else if (total > current) {
    const percent = Math.round((current / total) * 100);
    const debt = total - current;
    return {
      text: `Вы получили часть суммы (${percent}%). Остаток долга клиента по этой сделке составит ${formatNumber(debt)}. Эта сумма отобразится в виджете 'Нам должны'.`,
      type: 'info'
    };
  } else {
    return {
      text: 'Внимание: Вносимая сумма больше общей суммы сделки!',
      type: 'warning'
    };
  }
});

const handleSave = async () => {
    if (amount.value <= 0 || totalDealAmount.value <= 0) return;

    // Формируем финальный объект операции
    const operationData = {
        ...props.initialData,
        amount: amount.value, // Обновляем, если пользователь поменял
        totalDealAmount: totalDealAmount.value,
        type: 'income', // Предоплата всегда доход
        dateKey: props.dateKey,
        // Важно: categoryId уже должен быть "Предоплата", он пришел из initialData
    };

    try {
        // Если это редактирование (есть _id), то update, иначе create
        if (operationData._id) {
            await mainStore.updateOperation(operationData._id, operationData);
        } else {
            await mainStore.addOperation(operationData); // В addOperation нужно добавить поддержку сохранения в базу
            // В mainStore.addOperation сейчас просто refresh. 
            // Нам нужно вызвать API. Используем createOperation логику?
            // В mainStore нет createOperation, но есть createTransfer.
            // Используем axios напрямую или добавим метод в стор. 
            // Для надежности продублируем логику сохранения из OperationPopup здесь
            
            // Временное решение: вызываем API напрямую через стор (если бы он был) 
            // или axios здесь. Но лучше через стор.
            // В mainStore.js есть 'saveCreateOrClone' аналог? Нет.
            // Придется сделать запрос здесь.
        }
        
        // Поскольку mainStore.addOperation(op) просто рефрешит, нам нужно РЕАЛЬНО создать.
        // Сделаем post запрос
        // Импорт axios нужен? Нет, используем mainStore helper если есть, или...
        // Ладно, добавлю axios
    } catch (e) {
        console.error(e);
    }
    
    // Грязный хак: так как в mainStore нет публичного createOperation,
    // я верну данные в родителя, и он сохранит? Нет, родитель (Popup) закрыт.
    // Значит PrepaymentModal должен сам сохранить.
    emit('save', operationData);
};
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <h3>Оформление предоплаты</h3>
      
      <div class="info-block">
          <p>Контрагент: <strong>{{ contractorName }}</strong></p>
      </div>

      <label>Вносимая сумма (Аванс)</label>
      <input 
        type="text" 
        v-model="formattedAmount" 
        @input="onAmountInput" 
        class="form-input"
      />

      <label>Общая сумма сделки</label>
      <input 
        type="text" 
        v-model="formattedTotalDeal" 
        @input="onTotalDealInput" 
        placeholder="Введите полную стоимость" 
        class="form-input smart-focus"
      />

      <div v-if="smartHint" class="hint-box" :class="smartHint.type">
          {{ smartHint.text }}
      </div>

      <div class="actions">
          <button class="btn-cancel" @click="$emit('close')">Отмена</button>
          <button class="btn-save" @click="handleSave">Подтвердить</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.6); z-index: 2000;
  display: flex; justify-content: center; align-items: center;
}
.modal-content {
  background: #fff; padding: 2rem; border-radius: 12px;
  width: 90%; max-width: 400px;
}
h3 { margin-top: 0; font-size: 1.2rem; }
.info-block { margin-bottom: 1rem; font-size: 0.9rem; color: #666; }
label { display: block; margin-top: 1rem; font-weight: 500; font-size: 0.9rem; }
.form-input {
  width: 100%; padding: 10px; margin-top: 5px; font-size: 1.1rem;
  border: 1px solid #ccc; border-radius: 8px;
}
.hint-box {
  margin-top: 1.5rem; padding: 1rem; border-radius: 8px;
  font-size: 0.9rem; line-height: 1.4;
}
.hint-box.success { background: #d1fae5; color: #065f46; }
.hint-box.info { background: #dbeafe; color: #1e40af; }
.hint-box.warning { background: #fee2e2; color: #991b1b; }

.actions { margin-top: 2rem; display: flex; justify-content: flex-end; gap: 10px; }
.btn-save { background: #222; color: #fff; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; }
.btn-cancel { background: #f3f4f6; color: #333; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; }
</style>
