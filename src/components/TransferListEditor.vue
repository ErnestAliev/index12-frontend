<script setup>
import { ref, computed, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { formatNumber } from '@/utils/formatters.js';

/**
 * * --- МЕТКА ВЕРСИИ: v18.0 - STYLE & PROGRESS ---
 * * ВЕРСИЯ: 18.0 - Приведение стилей к единообразию и добавление прогресс-бара
 * * ДАТА: 2025-11-19
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (STYLE) Обновлена верстка списка переводов:
 * - Формат: Дата (слева), далее: Счет Отпр > Сумма > Счет Получ.
 * - Кнопка удаления (корзина) справа, стиль как в EntityListEditor.
 * 2. (FEAT) Добавлен прогресс-бар при удалении (анимация).
 * 3. (STYLE) Общий стиль попапа приведен к EntityListEditor (заголовки, отступы).
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

// Формат даты: "18.11.25" (как в других виджетах)
const formatDate = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
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
  
  isDeleting.value = true; // Показываем прогресс-бар

  try {
    // Имитация задержки для красоты (как в других попапах), если операция слишком быстрая
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await mainStore.deleteOperation(itemToDelete.value);
    
    isDeleting.value = false;
    showDeleteConfirm.value = false;
    itemToDelete.value = null;
  } catch (e) {
    console.error(e);
    alert('Ошибка при удалении');
    isDeleting.value = false; // Скрываем прогресс-бар при ошибке
  }
};

const cancelDelete = () => {
  if (isDeleting.value) return;
  showDeleteConfirm.value = false;
  itemToDelete.value = null;
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    
    <!-- Используем класс 'wide' для ширины, как в EntityListEditor -->
    <div class="popup-content wide">
      
      <h3>{{ title }}</h3>
      
      <p class="editor-hint">
        Список операций перевода. Нажмите на корзину для удаления.
      </p>
      
      <!-- Шапка списка (как в EntityListEditor) -->
      <div class="editor-header transfer-header">
        <span class="header-date">Дата</span>
        <span class="header-details">Детали перевода</span>
        <span class="header-trash"></span>
      </div>
      
      <div class="transfers-list">
        <div v-if="transfers.length === 0" class="empty-state">
          Переводов пока нет.
        </div>

        <div v-for="t in transfers" :key="t._id" class="edit-item">
          
          <!-- Дата (слева) -->
          <span class="t-date">{{ formatDate(t.date) }}</span>
          
          <!-- Детали (центр) -->
          <div class="t-details">
            <span class="acc-name" :title="getAccountName(t.fromAccountId)">
               {{ getAccountName(t.fromAccountId) }}
            </span>
            
            <span class="arrow">→</span>
            
            <span class="amount expense">
              {{ formatNumber(Math.abs(t.amount)) }} ₸
            </span>
            
            <span class="arrow">→</span>
            
            <span class="acc-name" :title="getAccountName(t.toAccountId)">
               {{ getAccountName(t.toAccountId) }}
            </span>
          </div>

          <!-- Кнопка удалить (справа) -->
          <button class="delete-btn" @click="askDelete(t)" title="Удалить">
            <svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>

        </div>
      </div>

      <div class="popup-actions">
        <button class="btn-submit btn-submit-edit" @click="$emit('close')">Закрыть</button>
      </div>
    </div>

    <!-- Внутренний модал подтверждения -->
    <div v-if="showDeleteConfirm" class="inner-overlay" @click.self="cancelDelete">
      <div class="delete-confirm-box">
        
        <!-- 🟢 Прогресс бар -->
        <div v-if="isDeleting" class="deleting-state">
          <h4>Удаление...</h4>
          <p class="sub-note">Пожалуйста, подождите, обновляем данные.</p>
          <div class="progress-container">
            <div class="progress-bar"></div>
          </div>
        </div>

        <!-- Окно подтверждения -->
        <div v-else>
          <h4>Удалить перевод?</h4>
          <p class="confirm-text" v-if="itemToDelete">
            {{ formatDate(itemToDelete.date) }}: <br>
            {{ getAccountName(itemToDelete.fromAccountId) }} → {{ getAccountName(itemToDelete.toAccountId) }}<br>
            <b>{{ formatNumber(Math.abs(itemToDelete.amount)) }} ₸</b>
          </p>
          
          <div class="delete-actions">
             <!-- Используем стили кнопок из EntityListEditor для единообразия -->
             <button class="btn-choice btn-nuke" @click="confirmDelete">
                <span class="main-text">Удалить операцию</span>
                <span class="sub-text">Действие необратимо</span>
             </button>
          </div>
          
          <button class="btn-cancel" @click="cancelDelete">Отмена</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* 🟢 Общие стили (как в EntityListEditor) */
.popup-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex; justify-content: center; align-items: center;
  z-index: 1200; overflow-y: auto;
}

.popup-content {
  max-width: 580px;
  background: #F4F4F4; padding: 2rem; border-radius: 12px;
  color: #1a1a1a; width: 100%;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); margin: 2rem 1rem;
  transition: max-width 0.2s ease;
  display: flex; flex-direction: column;
}
.popup-content.wide { max-width: 680px; }

h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 1.5rem; text-align: left; font-size: 22px; font-weight: 600; }

.editor-hint { font-size: 0.9em; color: #666; text-align: center; margin-top: -10px; margin-bottom: 1rem; }

/* Шапка таблицы */
.editor-header { display: flex; align-items: flex-end; gap: 10px; font-size: 0.8em; color: #666; margin-bottom: 5px; padding: 0 10px; }
.transfer-header .header-date { width: 80px; flex-shrink: 0; }
.transfer-header .header-details { flex-grow: 1; }
.transfer-header .header-trash { width: 48px; flex-shrink: 0; }

/* Список */
.transfers-list {
  max-height: 400px; overflow-y: auto; padding-right: 5px;
  scrollbar-width: none; -ms-overflow-style: none;
  display: flex; flex-direction: column; gap: 8px;
}
.transfers-list::-webkit-scrollbar { display: none; }

.empty-state { text-align: center; padding: 2rem; color: #888; }

/* Строка элемента (как .edit-item в EntityListEditor) */
.edit-item {
  display: flex; align-items: center; gap: 10px;
  background: #FFFFFF; border: 1px solid #E0E0E0; border-radius: 8px;
  padding: 0 10px; height: 48px; /* Фиксированная высота как у инпутов */
  margin-bottom: 4px;
}

/* Содержимое строки */
.t-date {
  width: 80px; flex-shrink: 0; font-size: 0.9em; color: #666;
}

.t-details {
  flex-grow: 1; display: flex; align-items: center; gap: 6px;
  overflow: hidden; white-space: nowrap; font-size: 0.95em;
}

.acc-name { font-weight: 500; max-width: 100px; overflow: hidden; text-overflow: ellipsis; color: #333; }
.arrow { color: #999; font-size: 0.8em; }
.amount { font-weight: 600; color: #333; }
.amount.expense { color: var(--color-text); /* Нейтральный или как в теме */ }

/* Кнопка удаления (как в EntityListEditor) */
.delete-btn {
  width: 36px; height: 36px; flex-shrink: 0;
  border: 1px solid #E0E0E0; background: #fff;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.2s;
  padding: 0; margin: 0;
}
.delete-btn svg {
  width: 18px; height: 18px;
  stroke: #999; transition: stroke 0.2s;
  display: block;
}
.delete-btn:hover { border-color: #FF3B30; background: #fff5f5; }
.delete-btn:hover svg { stroke: #FF3B30; }

/* Подвал */
.popup-actions { display: flex; margin-top: 2rem; justify-content: flex-end; }
.btn-submit {
  width: 100%; height: 50px; padding: 0 1rem;
  color: white; border: none; border-radius: 8px;
  font-size: 16px; font-weight: 600; cursor: pointer;
  transition: background-color 0.2s ease;
}
.btn-submit-edit { background-color: #222222; }
.btn-submit-edit:hover { background-color: #444444; }


/* 🟢 ВНУТРЕННИЙ МОДАЛ (Подтверждение) - Стили 1-в-1 с EntityListEditor */
.inner-overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.3); border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  z-index: 1210;
}
.delete-confirm-box {
  background: #fff; padding: 20px; border-radius: 12px;
  width: 90%; max-width: 400px;
  box-shadow: 0 5px 20px rgba(0,0,0,0.2);
  text-align: center;
}
.delete-confirm-box h4 { margin: 0 0 10px; color: #222; font-size: 18px; }
.confirm-text { font-size: 14px; margin-bottom: 20px; color: #555; line-height: 1.4; }

.delete-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; }

.btn-choice {
  border: 1px solid #ddd; border-radius: 8px; background: #fff;
  padding: 12px; cursor: pointer; text-align: left;
  display: flex; flex-direction: column;
  transition: border-color 0.2s, background 0.2s;
}
.btn-choice:hover { border-color: #aaa; background: #f9f9f9; }
.btn-choice .main-text { font-weight: 600; color: #333; font-size: 15px; margin-bottom: 2px; }
.btn-choice .sub-text { font-size: 12px; color: #888; }

.btn-nuke:hover { border-color: #FF3B30; background: #FFF0F0; }
.btn-nuke .main-text { color: #FF3B30; }

.btn-cancel { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; text-decoration: underline; }
.btn-cancel:hover { color: #555; }

/* 🟢 ПРОГРЕСС БАР */
.deleting-state { display: flex; flex-direction: column; align-items: center; padding: 1rem 0; }
.sub-note { font-size: 13px; color: #888; margin-top: -5px; margin-bottom: 20px; }
.progress-container {
  width: 100%; height: 6px; background-color: #eee; border-radius: 3px;
  overflow: hidden; position: relative;
}
.progress-bar {
  width: 100%; height: 100%; background-color: #222;
  position: absolute; left: -100%;
  animation: indeterminate 1.5s infinite ease-in-out;
}
@keyframes indeterminate {
  0% { left: -100%; width: 50%; }
  50% { left: 25%; width: 50%; }
  100% { left: 100%; width: 50%; }
}
</style>
