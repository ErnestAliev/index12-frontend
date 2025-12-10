import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import { useMainStore } from './mainStore';
import { useDealStore } from './dealStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// 🟢 ВЕРСИЯ ДАННЫХ
// Измените это число (+1), когда делаете обновление, требующее пересчета данных у всех пользователей.
const DATA_VERSION = 1; 

export const useRepairStore = defineStore('repairStore', () => {
    const mainStore = useMainStore();
    const dealStore = useDealStore();
    
    const isRepairing = ref(false);
    const progress = ref(0);
    const repairLog = ref([]);

    const log = (msg) => {
        console.log(`[Repair] ${msg}`);
        repairLog.value.push(msg);
    };

    /**
     * Вспомогательная функция для обновления балансов в Map
     */
    const updateBalance = (map, id, amount) => {
        if (!id) return;
        const key = (typeof id === 'object' ? id._id : id).toString();
        if (map[key] === undefined) map[key] = 0;
        map[key] += amount;
    };

    /**
     * Основная функция полной синхронизации и пересчета
     */
    const runFullRepair = async () => {
        if (isRepairing.value) return;
        isRepairing.value = true;
        progress.value = 0;
        repairLog.value = [];
        
        try {
            log('Запуск полного восстановления данных...');

            // 1. Очистка текущих кэшей
            mainStore.displayCache = {};
            mainStore.calculationCache = {};
            mainStore.dealOperations = []; // Сброс сделок
            
            log('Кэши очищены. Начинаем загрузку всей истории...');

            // 2. Загрузка ВСЕХ операций (используем широкий диапазон дат)
            // Допустим, с 2000 года по 2100 год, чтобы наверняка захватить всё
            const startDate = '2000-01-01';
            const endDate = '2100-01-01';
            
            // Адаптивная загрузка
            const response = await axios.get(`${API_BASE_URL}/events`, {
                params: {
                    startDate,
                    endDate,
                    limit: 100000 // Пытаемся взять всё
                }
            });

            let rawOps = response.data;
            if (!Array.isArray(rawOps)) rawOps = [];
            
            log(`Загружено ${rawOps.length} операций.`);
            progress.value = 50;

            // 3. Структурирование данных (Re-indexing)
            
            const newSnapshot = {
                totalBalance: 0,
                accountBalances: {},
                companyBalances: {},
                individualBalances: {},
                contractorBalances: {},
                projectBalances: {},
                categoryTotals: {},
                timestamp: new Date().toISOString()
            };

            const processedOps = [];

            // Сортируем по дате (важно для последовательности)
            rawOps.sort((a, b) => new Date(a.date) - new Date(b.date));

            for (const op of rawOps) {
                // Подготовка для кэша
                const dateKey = mainStore._getDateKey(new Date(op.date));
                const richOp = { 
                    ...op, 
                    date: new Date(op.date), 
                    dateKey 
                };
                
                // Заполнение displayCache
                if (!mainStore.displayCache[dateKey]) {
                    mainStore.displayCache[dateKey] = [];
                    mainStore.calculationCache[dateKey] = [];
                }
                mainStore.displayCache[dateKey].push(richOp);
                mainStore.calculationCache[dateKey].push(richOp);
                
                processedOps.push(richOp);

                // --- МАТЕМАТИКА СНАПШОТА ---
                if (richOp.isWorkAct) continue;

                const absAmt = Math.abs(richOp.amount || 0);
                const type = richOp.type;
                const isIncome = type === 'income';

                // Перевод
                if (richOp.isTransfer || type === 'transfer') {
                    // Списали
                    updateBalance(newSnapshot.accountBalances, richOp.fromAccountId, -absAmt);
                    updateBalance(newSnapshot.companyBalances, richOp.fromCompanyId, -absAmt);
                    updateBalance(newSnapshot.individualBalances, richOp.fromIndividualId, -absAmt);
                    
                    // Начислили
                    updateBalance(newSnapshot.accountBalances, richOp.toAccountId, absAmt);
                    updateBalance(newSnapshot.companyBalances, richOp.toCompanyId, absAmt);
                    updateBalance(newSnapshot.individualBalances, richOp.toIndividualId, absAmt);
                } 
                // Доход/Расход
                else {
                    const isRetailWriteOff = !richOp.accountId && 
                                             richOp.counterpartyIndividualId === mainStore.retailIndividualId &&
                                             type === 'expense';

                    const effectiveAmount = isIncome ? absAmt : -absAmt;

                    if (richOp.accountId) {
                        updateBalance(newSnapshot.accountBalances, richOp.accountId, effectiveAmount);
                    }
                    
                    if (!isRetailWriteOff) {
                       updateBalance(newSnapshot.companyBalances, richOp.companyId, effectiveAmount);
                    }

                    updateBalance(newSnapshot.individualBalances, richOp.individualId, effectiveAmount);
                    updateBalance(newSnapshot.individualBalances, richOp.counterpartyIndividualId, effectiveAmount);
                    updateBalance(newSnapshot.contractorBalances, richOp.contractorId, effectiveAmount);
                    updateBalance(newSnapshot.projectBalances, richOp.projectId, effectiveAmount);

                    // Категории
                    const catId = richOp.categoryId ? (richOp.categoryId._id || richOp.categoryId).toString() : null;
                    if (catId) {
                        if (!newSnapshot.categoryTotals[catId]) {
                            newSnapshot.categoryTotals[catId] = { income: 0, expense: 0, total: 0 };
                        }
                        const catEntry = newSnapshot.categoryTotals[catId];
                        if (isIncome) {
                            catEntry.income += absAmt;
                            catEntry.total += absAmt;
                        } else {
                            catEntry.expense += absAmt;
                            catEntry.total -= absAmt;
                        }
                    }
                }
            }

            log('Математика пересчитана.');
            progress.value = 80;

            // 4. Применение результатов
            mainStore.snapshot = newSnapshot;
            
            // Обновляем список для сделок
            mainStore.dealOperations = processedOps.filter(op => 
                (op.totalDealAmount > 0) || 
                op.isDealTranche || 
                op.isWorkAct || 
                mainStore.getPrepaymentCategoryIds.includes(String(op.categoryId))
            );

            log('Снапшот и сделки обновлены.');
            progress.value = 100;
            log('Готово! Система синхронизирована.');
            
            return true; // Успех

        } catch (e) {
            console.error(e);
            log(`Ошибка: ${e.message}`);
            return false; // Ошибка
        } finally {
            isRepairing.value = false;
        }
    };

    /**
     * 🟢 АВТО-ПРОВЕРКА ВЕРСИИ
     * Запускается при старте приложения.
     */
    const checkAndRunAutoRepair = async () => {
        const STORAGE_KEY = 'app_data_version';
        const lastVersion = parseInt(localStorage.getItem(STORAGE_KEY) || '0');
        
        console.log(`[Repair] Проверка версий. Текущая (код): ${DATA_VERSION}, Сохраненная (юзер): ${lastVersion}`);

        // Если версия в коде больше, чем у юзера -> Запускаем лечение
        if (DATA_VERSION > lastVersion) {
            console.warn('[Repair] Обнаружено обновление логики данных. Запуск авто-восстановления...');
            
            const success = await runFullRepair();
            
            if (success) {
                localStorage.setItem(STORAGE_KEY, DATA_VERSION.toString());
                console.log(`[Repair] Версия данных обновлена до ${DATA_VERSION}.`);
            } else {
                console.error('[Repair] Не удалось обновить данные. Повторная попытка будет при следующем запуске.');
            }
        } else {
            console.log('[Repair] Данные актуальны. Восстановление не требуется.');
        }
    };

    return {
        runFullRepair,
        checkAndRunAutoRepair,
        isRepairing,
        progress,
        repairLog
    };
});