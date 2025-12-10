import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useMainStore } from './mainStore';

export const useDealStore = defineStore('dealStore', () => {
  const mainStore = useMainStore();
  console.log('--- dealStore.js v117.0 (REFACTOR: Stage 2 - Break Closed Deals) LOADED ---');

  const opStatusMap = ref(new Map());

  const _toStr = (val) => {
      if (!val) return '';
      if (typeof val === 'object') {
          return val._id ? String(val._id) : ''; 
      }
      return String(val);
  };

  const getStrictKey = (op, isRetail) => {
      const pId = _toStr(op.projectId?._id || op.projectId);
      const cId = _toStr(op.categoryId?._id || op.categoryId);
      
      if (!pId || !cId) return null; 

      if (isRetail) {
          return `retail_${pId}_${cId}`;
      } else {
          const contrIdRaw = op.contractorId ? (op.contractorId._id || op.contractorId) : (op.counterpartyIndividualId?._id || op.counterpartyIndividualId);
          const contrId = _toStr(contrIdRaw);
          if (!contrId) return null;
          return `deal_${pId}_${cId}_${contrId}`;
      }
  };

  const dealGroups = computed(() => {
      const groups = new Map(); 
      opStatusMap.value.clear();

      const allOps = mainStore.getAllRelevantOps;
      const retailId = mainStore.retailIndividualId;
      const prepaymentCategoryIds = mainStore.getPrepaymentCategoryIds || [];

      const sortedOps = [...allOps].sort((a, b) => {
          const timeA = new Date(a.date).getTime();
          const timeB = new Date(b.date).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return (a._id || '').toString().localeCompare((b._id || '').toString());
      });

      for (const op of sortedOps) {
          if (op.isTransfer || op.type === 'transfer') continue;

          const opIndId = _toStr(op.counterpartyIndividualId || op.individualId);
          const isRetailOp = (retailId && opIndId === String(retailId));
          const isIncome = op.type === 'income';
          const isExpense = op.type === 'expense';
          const opBudget = Number(op.totalDealAmount || 0);

          // === ФЕЙС-КОНТРОЛЬ B2B (НЕ ТРОГАЕМ) ===
          if (!isRetailOp && isIncome) {
              if (op.isPrepayment === false) continue;
              if (op.isPrepayment !== true) { 
                  const opCatId = _toStr(op.categoryId?._id || op.categoryId);
                  const isPrepaymentCat = prepaymentCategoryIds.includes(opCatId);
                  const isTranche = op.isDealTranche === true;
                  if (opBudget === 0 && !isTranche && !isPrepaymentCat) continue; 
              }
          }

          // === ФЕЙС-КОНТРОЛЬ РОЗНИЦА ===
          if (isRetailOp && isIncome) {
              if (op.isClosed && op.isPrepayment !== true) {
                  continue; 
              }
          }

          const key = getStrictKey(op, isRetailOp);
          if (!key) continue; 

          if (!groups.has(key)) groups.set(key, []);
          const history = groups.get(key);

          const amt = Math.abs(op.amount || 0);

          // === ВЕТКА РОЗНИЦЫ (Вечная коробка) ===
          if (isRetailOp) {
              if (history.length === 0) {
                  history.push({
                      isRetail: true,
                      budget: 0,
                      received: 0,
                      workedOut: 0,
                      ops: []
                  });
              }
              const currentBox = history[0];
              currentBox.ops.push(op);
              
              if (isIncome) {
                  currentBox.received += amt;
              } else if (isExpense) {
                  currentBox.workedOut += amt;
              }
              
              opStatusMap.value.set(op._id, { 
                  trancheIndex: 0, 
                  isDealClosed: false,
                  dealUUID: key 
              });
          } 
          
          // === 🟢 ВЕТКА СДЕЛОК B2B (REFACTORED) ===
          else {
              let currentDeal = history.length > 0 ? history[history.length - 1] : null;
              let shouldCreateNew = false;

              // 1. Проверяем, закрыта ли текущая сделка
              let isCurrentEffectivelyClosed = false;
              if (currentDeal) {
                  const debt = Math.max(0, currentDeal.budget - currentDeal.received);
                  // Если долга нет или сделка закрыта вручную - считаем её завершенной
                  if (debt <= 0 || currentDeal.isManualClosed) {
                      isCurrentEffectivelyClosed = true;
                  }
              }

              if (opBudget > 0) {
                  // Если операция явно задает новый бюджет (напр. "Предоплата" с суммой сделки)
                  if (!currentDeal || isCurrentEffectivelyClosed) {
                      shouldCreateNew = true; // Начинаем новую сделку
                  } else {
                      // Если старая еще открыта, возможно это расширение бюджета
                      if (opBudget > currentDeal.budget) {
                          currentDeal.budget = opBudget; 
                      }
                  }
              }
              else {
                  // Если это обычная операция (Транш или Факт с бюджетом 0)
                  if (!currentDeal) {
                      shouldCreateNew = true;
                  } 
                  // 🟢 FIX: Если текущая сделка закрыта, запрещаем добавлять туда новые транши.
                  // Начинаем новую историю (даже если бюджет 0).
                  else if (isCurrentEffectivelyClosed) {
                      shouldCreateNew = true;
                  }
                  // Иначе: Сделка открыта, добавляем как транш
              }

              if (shouldCreateNew) {
                  currentDeal = {
                      isRetail: false,
                      id: `deal_${key}_${history.length + 1}`,
                      budget: opBudget,
                      received: 0,
                      workedOut: 0, 
                      isManualClosed: false,
                      incomeCount: 0,
                      ops: []
                  };
                  history.push(currentDeal);
              }

              currentDeal.ops.push(op);
              
              let trancheIdx = 0;

              if (isIncome) {
                  currentDeal.received += amt;
                  currentDeal.incomeCount++;
                  trancheIdx = currentDeal.incomeCount;
              } else if (isExpense) {
                  currentDeal.workedOut += amt;
              }
              
              const isOpClosed = !!op.isClosed; 
              
              opStatusMap.value.set(op._id, { 
                  trancheIndex: trancheIdx,
                  isDealClosed: isOpClosed,
                  dealUUID: currentDeal.id,
                  dealRef: currentDeal
              });
          }
      }

      return groups;
  });

  const liabilitiesTheyOwe = computed(() => {
      let total = 0;
      dealGroups.value.forEach((history) => {
          history.forEach(deal => {
              if (deal.isManualClosed) return;
              if (deal.isRetail) {
                  // Для розницы: Долг клиента = Отработано (Списано) - Получено
                  total += Math.max(0, deal.workedOut - deal.received);
              } else {
                  total += Math.max(0, deal.budget - deal.received);
              }
          });
      });
      return total;
  });

  const liabilitiesWeOwe = computed(() => {
      let total = 0;
      dealGroups.value.forEach((history) => {
          history.forEach(deal => {
              if (deal.isManualClosed) return;
              // Для розницы: Мы должны (Аванс) = Получено - Отработано
              total += Math.max(0, deal.received - deal.workedOut);
          });
      });
      return total;
  });

  function getOpTrancheStatus(opId) {
      if (!dealGroups.value) return null;
      const status = opStatusMap.value.get(opId);
      if (!status) return null;
      
      const deal = status.dealRef;
      const isFullyDone = deal && (deal.isManualClosed || (deal.budget > 0 && deal.received >= deal.budget && deal.workedOut >= deal.received));
      
      return {
          trancheIndex: status.trancheIndex,
          isDealClosed: status.isDealClosed || isFullyDone
      };
  }

  function getDealStatus(projectId, categoryId, contractorId) {
      const pId = _toStr(projectId);
      const cId = _toStr(categoryId);
      const contrId = _toStr(contractorId);
      
      let key = `deal_${pId}_${cId}_${contrId}`;
      let history = dealGroups.value.get(key);

      if (!history && contrId === String(mainStore.retailIndividualId)) {
          key = `retail_${pId}_${cId}`;
          history = dealGroups.value.get(key);
      }

      if (!history || history.length === 0) {
          return { totalDeal: 0, paidTotal: 0, debt: 0, activeTranche: null, tranchesCount: 0 };
      }

      const activeDeal = history[history.length - 1];
      
      let debt = 0;
      if (activeDeal.isRetail) {
           debt = Math.max(0, activeDeal.workedOut - activeDeal.received);
      } else {
           debt = Math.max(0, activeDeal.budget - activeDeal.received);
      }
      
      if (activeDeal.isManualClosed) debt = 0;
      
      const activeTrancheOp = activeDeal.ops
          .slice()
          .reverse()
          .find(op => op.type === 'income' && !op.isClosed);

      return {
          totalDeal: activeDeal.budget,
          paidTotal: activeDeal.received,
          debt: debt,
          activeTranche: activeTrancheOp || null,
          tranchesCount: activeDeal.incomeCount || 0,
          isClosed: activeDeal.isManualClosed || debt <= 0
      };
  }

  function checkOverpayment(projectId, categoryId, contractorId, amount) {
      const status = getDealStatus(projectId, categoryId, contractorId);
      if (contractorId === String(mainStore.retailIndividualId)) return false;
      if (status.totalDeal === 0) return false; 
      if (status.debt <= 0) return false; 
      
      if ((status.paidTotal + amount) > status.totalDeal) {
          return true; 
      }
      return false;
  }

  return {
      dealGroups,
      liabilitiesTheyOwe,
      liabilitiesWeOwe,
      getDealStatus,
      checkOverpayment,
      getOpTrancheStatus
  };
});