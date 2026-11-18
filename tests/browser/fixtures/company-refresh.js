import '/src/assets/main.css';
import {createApp,h} from 'vue';
import {createPinia} from 'pinia';
import {useMainStore} from '/src/stores/mainStore.js';
import Editor from '/src/components/EntityListEditor.vue';
const pinia=createPinia(),main=useMainStore(pinia);
main.user={_id:'owner',workspaceRole:'admin',currentWorkspaceId:'a'.repeat(24)};
main.contractors=[{_id:'b'.repeat(24),name:'Поставщик',identificationNumber:'040914551559',bankAccounts:[],profileVersion:0,onecSync:{ref:'11111111-1111-4111-8111-111111111111',checkedAt:'2026-11-18T04:00:00Z'}}];
createApp({render:()=>h(Editor,{title:'Редактор контрагентов',entityType:'contractors',items:main.contractors})}).use(pinia).mount('#app');
