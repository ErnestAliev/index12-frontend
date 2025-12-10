import { defineStore } from 'pinia';
import axios from 'axios';
import { useMainStore } from './mainStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export const useTransferStore = defineStore('transfer', () => {
  console.log('--- transferStore.js v1.0 (NEW) LOADED ---');

  // --- Actions ---

  /**
   * Импорт операций на сервер
   * @param {Array} operations - массив распарсенных операций
   * @param {Array} selectedIndices - индексы выбранных строк для импорта
   * @param {Function} progressCallback - коллбэк для обновления прогресса (не обязателен)
   */
  async function importOperations(operations, selectedIndices, progressCallback = () => {}) {
    const mainStore = useMainStore();
    
    try {
      const response = await axios.post(`${API_BASE_URL}/import/operations`, { 
        operations, 
        selectedRows: selectedIndices 
      });
      
      const createdOps = response.data;
      progressCallback(createdOps.length);
      
      // После успешного импорта принудительно обновляем все данные в основном сторе
      await mainStore.forceRefreshAll();
      
      return createdOps;
    } catch (error) {
      if (error.response && error.response.status === 401) {
        mainStore.user = null;
      }
      throw error;
    }
  }

  /**
   * Экспорт всех операций
   * Получает сырые данные с сервера и добавляет начальный баланс
   */
  async function exportAllOperations() {
    const mainStore = useMainStore();
    
    try {
      const res = await axios.get(`${API_BASE_URL}/events/all-for-export`);
      
      return { 
        operations: res.data, 
        // Берем вычисленный начальный баланс из mainStore
        initialBalance: mainStore.totalInitialBalance || 0 
      };
    } catch (e) {
      if (e.response && e.response.status === 401) {
        mainStore.user = null;
      }
      throw e;
    }
  }

  return {
    importOperations,
    exportAllOperations
  };
});