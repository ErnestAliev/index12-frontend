import { defineStore } from 'pinia';
import axios from 'axios';
import { useMainStore } from './mainStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export const useTransferStore = defineStore('transfer', () => {
  console.log('--- transferStore.js v2.0 (EXPORT LOGIC ADDED) LOADED ---');

  // --- Helpers ---

  // Очистка и округление (никаких копеек)
  const _cleanNumber = (val) => {
      if (!val) return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : Math.round(num);
  };

  // ISO дата для Excel (YYYY-MM-DD)
  const _formatDateISO = (dateStr) => {
      if (!dateStr) return '';
      try {
          const d = new Date(dateStr);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
      } catch (e) { return ''; }
  };

  // "Явное лучше неявного"
  const _entityToText = (val, defaultText) => {
      return val ? val : defaultText;
  };

  /**
   * 1. ПОДГОТОВКА ДАННЫХ ДЛЯ CSV
   * Превращает объекты из Store в плоский массив для экспорта.
   * @param {Array} operations - список операций
   * @param {Object} options - { mode: 'excel' | 'backup' }
   */
  function prepareDataForExport(operations, options = { mode: 'excel' }) {
      return operations.map(op => {
          // Получаем имена сущностей (Store уже должен содержать populated данные или мы берем их из кеша)
          // В mainStore.allOperationsFlat обычно лежат объекты, где categoryId - это объект { _id, name } или просто ID.
          // Здесь мы стараемся достать имена.
          
          const catName = typeof op.categoryId === 'object' ? op.categoryId?.name : op.categoryName;
          const projName = typeof op.projectId === 'object' ? op.projectId?.name : op.projectName;
          const accName = typeof op.accountId === 'object' ? op.accountId?.name : op.accountName;
          const contrName = typeof op.contractorId === 'object' ? op.contractorId?.name : op.contractorName;

          // Базовая строка
          const row = {
              'Дата': _formatDateISO(op.date),
              'Тип': op.type || 'Операция',
              'Категория': _entityToText(catName, 'Без категории'),
              'Проект': _entityToText(projName, 'Без проекта'),
          };

          const amount = _cleanNumber(op.amount);

          // ЛОГИКА РЕЖИМОВ
          if (options.mode === 'excel') {
              // Excel: Две колонки, без минусов
              row['Приход'] = amount > 0 ? amount : 0;
              row['Расход'] = amount < 0 ? Math.abs(amount) : 0;
          } else {
              // Backup: Одна колонка, как есть
              row['Сумма'] = amount;
          }

          // Остальные поля
          row['Счет'] = _entityToText(accName, 'Счет удален');
          row['Контрагент'] = _entityToText(contrName, 'Без контрагента');
          row['Описание'] = op.description || '';
          row['Статус'] = op.isPlanned ? 'План' : 'Исполнено';

          // Технические ID (Включаем всегда для Backup, для Excel - опционально, но здесь формируем "максимальный" набор, лишнее UI может не скачать)
          // Но лучше следовать логике: если Excel - ID не нужны пользователю, но нужны системе.
          // Добавим их в конец.
          row['TX_ID'] = op._id;
          row['Account_ID'] = typeof op.accountId === 'object' ? op.accountId?._id : op.accountId;
          row['Project_ID'] = typeof op.projectId === 'object' ? op.projectId?._id : op.projectId;
          row['Category_ID'] = typeof op.categoryId === 'object' ? op.categoryId?._id : op.categoryId;

          return row;
      });
  }

  // --- Legacy / Server Actions (Оставляем как есть для совместимости) ---

  async function importOperations(operations, selectedIndices, progressCallback = () => {}) {
    const mainStore = useMainStore();
    try {
      const response = await axios.post(`${API_BASE_URL}/import/operations`, { 
        operations, 
        selectedRows: selectedIndices 
      });
      const createdOps = response.data;
      progressCallback(createdOps.length);
      await mainStore.forceRefreshAll();
      return createdOps;
    } catch (error) {
      if (error.response && error.response.status === 401) {
        mainStore.user = null;
      }
      throw error;
    }
  }

  async function exportAllOperations() {
    const mainStore = useMainStore();
    try {
      const res = await axios.get(`${API_BASE_URL}/events/all-for-export`);
      return { 
        operations: res.data, 
        initialBalance: mainStore.totalInitialBalance || 0 
      };
    } catch (e) {
      if (e.response && e.response.status === 401) mainStore.user = null;
      throw e;
    }
  }

  return {
      prepareDataForExport, // 🟢 Новая функция
      importOperations,
      exportAllOperations
  };
});