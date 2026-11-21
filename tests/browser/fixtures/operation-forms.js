import '/src/assets/main.css';
// Include the mobile route's real global input rules as well as component CSS.
import '/src/views/MobileHomeView.vue';
import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import axios from 'axios';
import { useMainStore } from '/src/stores/mainStore.js';
import Income from '/src/components/IncomePopup.vue';
import Expense from '/src/components/ExpensePopup.vue';
import Transfer from '/src/components/TransferPopup.vue';

const pinia = createPinia(), main = useMainStore(pinia);
main.user = { _id: 'owner', role: 'admin', workspaceRole: 'admin' };
main.companies = [{ _id: 'company', name: 'ТОО UU' }];
main.individuals = [{ _id: 'person', name: 'Шерхан' }];
main.accounts = [
  { _id: 'business', name: 'Касса Пушкина', companyId: 'company', initialBalance: 10000000 },
  { _id: 'personal', name: 'Kaspi Gold Шерхан', individualId: 'person', initialBalance: 10000000 },
];
main.contractors = [{ _id: 'contractor', name: 'Поставщик' }];
main.projects = [{ _id: 'project', name: 'Пушкина 33' }];
main.categories = [{ _id: 'category', name: 'Перевод' }];
main.subcategories = [{ _id: 'subcategory', name: 'Услуги', parentCategoryId: 'category' }];
axios.defaults.adapter = async () => ({ status: 200, data: {
  timestamp: new Date().toISOString(), accountBalances: {}, companyBalances: {}, individualBalances: {}, contractorBalances: {},
} });
const active = ref(null), edit = ref(false), revision = ref(0);
window.operationForms = {
  open(type, editing = false) { active.value = type; edit.value = editing; revision.value++; },
};
createApp({ render() {
  if (!active.value) return null;
  const type = active.value;
  const operation = {
    _id: 'operation', type, amount: type === 'expense' ? -1500000 : 1500000,
    date: '2026-11-21T12:00:00', accountId: 'personal', individualId: 'person',
    fromAccountId: 'business', fromCompanyId: 'company', toAccountId: 'personal', toIndividualId: 'person',
    contractorId: 'contractor', projectId: 'project', categoryId: 'category', subcategoryId: 'subcategory',
    comment: 'Короткий комментарий', description: 'Описание операции',
  };
  return h({ income: Income, expense: Expense, transfer: Transfer }[type], {
    key: revision.value, date: new Date(2026, 10, 21, 12), cellIndex: 0,
    ...(edit.value ? { [type === 'transfer' ? 'transferToEdit' : 'operationToEdit']: operation } : {}),
    onClose: () => { active.value = null; },
  });
} }).use(pinia).mount('#app');
