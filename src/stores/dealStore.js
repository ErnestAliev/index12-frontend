import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useMainStore } from './mainStore';

export const useDealStore = defineStore('dealStore', () => {
  const mainStore = useMainStore();
  console.log('--- dealStore.js v142.0 (FIX: Auto-Reset Deal Cycle) LOADED ---');

  const _toStr = (val) => {
      if (!val) return '';
      if (typeof val === 'object') {
          return val._id ? String(val._id) : ''; 
      }
      return String(val);
  };
  
  const _isPastOrToday = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      const now = new Date();
      
      d.setHours(0, 0, 0, 0);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      
      return d.getTime() <= today.getTime();
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

  const calculationResult = computed(() => {
      const _trigger = mainStore.cacheVersion;
      
      const groups = new Map(); 
      const statusMap = new Map();

      const allOps = mainStore.getAllRelevantOps;
      const retailId = mainStore.retailIndividualId;

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

          // === B2B FILTER ===
          if (!isRetailOp && isIncome) {
              const isExplicitPrepay = op.isPrepayment === true;
              const isTranche = op.isDealTranche === true;
              const hasBudget = opBudget > 0;
              
              if (!isExplicitPrepay && !isTranche && !hasBudget) {
                  continue; 
              }
          }

          // === RETAIL FILTER ===
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
          const isOpClosed = !!op.isClosed;

          // === RETAIL LOGIC ===
          if (isRetailOp) {
              if (history.length === 0) {
                  history.push({
                      isRetail: true,
                      budget: 0,
                      received: 0,
                      workedOut: 0,
                      ops: [],
                      hasOpenOps: false
                  });
              }
              const currentBox = history[0];
              currentBox.ops.push(op);
              
              if (isIncome) {
                  currentBox.received += amt;
              } else if (isExpense) {
                  currentBox.workedOut += amt;
              }
              
              if (!isOpClosed) {
                  currentBox.hasOpenOps = true;
              }
              
              statusMap.set(op._id, { 
                  trancheIndex: 0, 
                  isDealClosed: false,
                  dealUUID: key 
              });
          } 
          
          // === B2B DEAL LOGIC ===
          else {
              let currentDeal = history.length > 0 ? history[history.length - 1] : null;
              let shouldCreateNew = false;

              let isCurrentEffectivelyClosed = false;

              if (currentDeal) {
                  const debt = Math.max(0, currentDeal.budget - currentDeal.received);
                  // Сделка считается "финансово закрытой", если бюджет набран
                  if (currentDeal.budget > 0 && debt <= 0) {
                      isCurrentEffectivelyClosed = true;
                  }
              }

              if (opBudget > 0) {
                  // Если пришла операция с БЮДЖЕТОМ (Новая сделка или корректировка)
                  if (currentDeal && !isCurrentEffectivelyClosed) {
                      if (opBudget > currentDeal.budget) {
                          currentDeal.budget = opBudget;
                      }
                      shouldCreateNew = false; 
                  } else {
                      // Если текущая сделка закрыта, а пришел новый бюджет -> это новая сделка
                      shouldCreateNew = true; 
                  }
              }
              else {
                  // Если пришла операция БЕЗ бюджета (Акт, Транш, Доп.расход)
                  if (!currentDeal) {
                      shouldCreateNew = true; 
                  } 
                  else {
                      // 🟢 LOGIC UPDATE: Проверяем, активна ли текущая сделка
                      if (isIncome) {
                          const debt = Math.max(0, currentDeal.budget - currentDeal.received);
                          
                          // Критерии активности сделки:
                          // 1. Есть открытые операции (незакрытые транши)
                          // 2. Бюджет задан и не исчерпан
                          // 3. Бюджета нет (работа по факту), но есть переплата (received > workedOut)
                          const isActive = currentDeal.hasOpenOps || 
                                           (currentDeal.budget > 0 && debt > 0) || 
                                           (currentDeal.budget === 0 && currentDeal.received > currentDeal.workedOut);
                          
                          if (!isActive) {
                              // Сделка завершена -> Начинаем новую (счетчик траншей сбросится)
                              shouldCreateNew = true;
                          } else {
                              // Сделка активна -> Прикрепляем как следующий транш
                              shouldCreateNew = false;
                          }
                      } else {
                          // Расходы (Акты) всегда прикрепляем к текущей, чтобы "закрыть" её
                          shouldCreateNew = false;
                      }
                  }
              }

              if (shouldCreateNew) {
                  currentDeal = {
                      isRetail: false,
                      id: `deal_${key}_${history.length + 1}`,
                      budget: opBudget,
                      received: 0,
                      workedOut: 0, 
                      incomeCount: 0,
                      ops: [],
                      hasOpenOps: false 
                  };
                  history.push(currentDeal);
              }

              if (opBudget > currentDeal.budget) {
                  currentDeal.budget = opBudget;
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
              
              // Только ОТКРЫТЫЕ ДОХОДЫ (Транши) держат сделку открытой.
              // Расходы (Акты) и закрытые доходы не должны влиять на флаг hasOpenOps.
              if (isIncome && !isOpClosed) {
                  currentDeal.hasOpenOps = true;
              }
              
              statusMap.set(op._id, { 
                  trancheIndex: trancheIdx,
                  isDealClosed: isOpClosed, 
                  dealUUID: currentDeal.id,
                  dealRef: currentDeal
              });
          }
      }

      return { groups, statusMap };
  });

  const dealGroups = computed(() => calculationResult.value.groups);
  const opStatusMap = computed(() => calculationResult.value.statusMap);

  const _isDealActive = (deal) => {
      const debt = Math.max(0, deal.budget - deal.received);
      
      if (deal.hasOpenOps) return true;
      if (deal.budget > 0 && debt > 0) return true;
      if (deal.budget === 0 && deal.received > deal.workedOut) return true;
      
      return false;
  };

  // 🟢 TOTAL (Forecast)
  const liabilitiesTheyOweTotal = computed(() => {
      let total = 0;
      dealGroups.value.forEach((history) => {
          history.forEach(deal => {
              if (!_isDealActive(deal)) return;

              if (deal.isRetail) {
                  total += Math.max(0, deal.workedOut - deal.received); 
              } else {
                  total += Math.max(0, deal.budget - deal.received); 
              }
          });
      });
      return total;
  });

  const liabilitiesWeOweTotal = computed(() => {
      let total = 0;
      dealGroups.value.forEach((history) => {
          history.forEach(deal => {
              if (!_isDealActive(deal)) return;
              total += Math.max(0, deal.received - deal.workedOut); 
          });
      });
      return total;
  });

  // 🟢 CURRENT (Fact)
  const liabilitiesTheyOweCurrent = computed(() => {
      let total = 0;
      dealGroups.value.forEach((history) => {
          history.forEach(deal => {
              if (!_isDealActive(deal)) return;

              const currentOps = deal.ops.filter(op => _isPastOrToday(op.date));
              
              if (currentOps.length === 0 && deal.budget > 0) {
                 return;
              }
              if (currentOps.length === 0) return;

              let curReceived = 0;
              let curWorked = 0;
              const curBudget = deal.budget; 

              currentOps.forEach(op => {
                   if (op.type === 'income') {
                       curReceived += (op.amount || 0);
                   } else if (op.type === 'expense') {
                       curWorked += Math.abs(op.amount || 0);
                   }
              });

              if (deal.isRetail) {
                  total += Math.max(0, curWorked - curReceived);
              } else {
                  total += Math.max(0, curBudget - curReceived);
              }
          });
      });
      return total;
  });

  const liabilitiesWeOweCurrent = computed(() => {
      let total = 0;
      dealGroups.value.forEach((history) => {
          history.forEach(deal => {
              if (!_isDealActive(deal)) return;

              const currentOps = deal.ops.filter(op => _isPastOrToday(op.date));
              if (currentOps.length === 0) return;

              let curReceived = 0;
              let curWorked = 0;

              currentOps.forEach(op => {
                   if (op.type === 'income') curReceived += (op.amount || 0);
                   else if (op.type === 'expense') curWorked += Math.abs(op.amount || 0);
              });

              // Должны отработать = Получено - Отработано
              total += Math.max(0, curReceived - curWorked);
          });
      });
      return total;
  });

  function getOpTrancheStatus(opId) {
      if (!opStatusMap.value) return null;
      const status = opStatusMap.value.get(opId);
      if (!status) return null;
      
      const deal = status.dealRef;
      const isFullyDone = !_isDealActive(deal);
      
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
      
      if (!_isDealActive(activeDeal)) debt = 0;
      
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
          isClosed: !_isDealActive(activeDeal)
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
      liabilitiesTheyOweTotal,
      liabilitiesWeOweTotal,
      liabilitiesTheyOweCurrent,
      liabilitiesWeOweCurrent,
      
      liabilitiesTheyOwe: liabilitiesTheyOweTotal,
      liabilitiesWeOwe: liabilitiesWeOweTotal,

      getDealStatus,
      checkOverpayment,
      getOpTrancheStatus
  };
});