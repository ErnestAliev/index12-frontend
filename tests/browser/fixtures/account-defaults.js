import '/src/assets/main.css';
import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { useMainStore } from '/src/stores/mainStore.js';
import Editor from '/src/components/EntityListEditor.vue';
const pinia = createPinia(), main = useMainStore(pinia), open = ref(true);
main.user = { _id: 'owner', workspaceRole: 'admin', currentWorkspaceId: 'a'.repeat(24) };
main.companies = [{ _id: 'b'.repeat(24), name: 'ТОО Покупатель' }];
main.accounts = [
  { _id: '1'.repeat(24), name: 'BCCUU', order: 0, companyId: main.companies[0]._id, initialBalance: 100, isDefaultForExpenses: false },
  { _id: '2'.repeat(24), name: 'Второй', order: 1, companyId: main.companies[0]._id, initialBalance: 10000, isDefaultForExpenses: false },
  { _id: '3'.repeat(24), name: 'Касса', order: 2, isCashRegister: true, isDefaultForExpenses: true },
  { _id: '4'.repeat(24), name: 'Архив', order: 3, isExcluded: true, isDefaultForExpenses: true },
];
window.accountDefaults = { main, open, saves: [] };
createApp({ render: () => [
  h('button', { onClick: () => { open.value = true; } }, 'Открыть'),
  open.value ? h(Editor, { title: 'Редактирование счетов', entityType: 'accounts', items: main.accounts, onClose: () => { open.value = false; }, onSave: rows => window.accountDefaults.saves.push(JSON.parse(JSON.stringify(rows))) }) : null,
] }).use(pinia).mount('#app');
