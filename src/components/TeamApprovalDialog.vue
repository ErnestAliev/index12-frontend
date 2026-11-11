<script setup>
import { computed, ref } from 'vue';
import TeamChatDialog from './TeamChatDialog.vue';
import TeamTaskRecipientPicker from './TeamTaskRecipientPicker.vue';
import UiIcon from './UiIcon.vue';
import {useTeamChatStore,teamError} from '@/stores/teamChatStore';
const props=defineProps({taskId:{type:String,required:true}}),emit=defineEmits(['close','added']);
const chat=useTeamChatStore(),selected=ref([]),busy=ref(false),error=ref(''),requestId=ref(null);
const people=computed(()=>(chat.state.people||[]).filter(p=>!p.status||p.status==='active'));
const ids=computed(()=>selected.value.map(p=>p._id));
function choose(person){if(busy.value||ids.value.includes(person._id))return;selected.value.push(person);requestId.value=null;}
function remove(id){if(busy.value)return;selected.value=selected.value.filter(p=>p._id!==id);requestId.value=null;}
async function add(){
  if(busy.value||!ids.value.length)return;
  busy.value=true;error.value='';requestId.value ||= crypto.randomUUID();
  try{await chat.action('/messages',{id:requestId.value,taskId:props.taskId,text:'Согласование',approvalRecipientIds:ids.value});emit('added');}
  catch(e){error.value=teamError(e);}finally{busy.value=false;}
}
</script>
<template>
  <TeamChatDialog title="Добавить согласование" :busy="busy" dismiss-outside @close="emit('close')">
    <form class="approval-form" @submit.prevent="add">
      <div class="approval-picker"><TeamTaskRecipientPicker :people="people" :actor-id="chat.me?.actorId" :excluded-ids="ids" :disabled="busy" searchable heading="С кем согласовать?" @select="choose" /></div>
      <div v-if="selected.length" class="approval-selected" aria-label="Согласователи">
        <button v-for="person in selected" :key="person._id" type="button" :disabled="busy" :aria-label="`Убрать согласователя ${person.name}`" @click="remove(person._id)">{{ person.name }}<UiIcon name="close" /></button>
      </div>
      <p v-if="error" role="alert" class="approval-error">{{ error }}</p>
      <footer><button type="button" :disabled="busy" @click="emit('close')">Отмена</button><button type="submit" class="approval-submit" :disabled="busy || !selected.length">{{ busy ? 'Добавляем…' : 'Добавить' }}</button></footer>
    </form>
  </TeamChatDialog>
</template>
<style scoped>
.approval-form{display:flex;flex-direction:column;gap:12px;padding:12px;overflow:hidden;min-height:0}
.approval-picker{min-height:0;overflow:auto}
.approval-picker :deep(.task-step-title){margin:0;font-size:14px;font-weight:500}
.approval-picker :deep(.recipient-results){position:static;max-height:160px!important}
.approval-selected{display:flex;flex-wrap:wrap;gap:6px;flex:none;max-height:132px;overflow:auto}
.approval-form .approval-selected button{display:flex;align-items:center;gap:6px;min-height:44px!important;max-width:100%;padding:0 8px;border:0;background:var(--codex-pane-surface-soft);color:inherit;border-radius:6px;font:inherit;font-size:13px;cursor:pointer;overflow-wrap:anywhere}
.approval-selected .ui-icon{width:14px;height:14px;flex:none}
.approval-error{margin:0;color:var(--codex-pane-danger);font-size:12px}
footer{display:flex;justify-content:flex-end;gap:8px;flex:none}
.approval-form footer button{min-height:44px!important;padding:0 12px;border:1px solid var(--codex-pane-border);border-radius:8px;background:var(--codex-pane-surface);color:inherit;font:inherit;font-size:13px;cursor:pointer}
.approval-form footer .approval-submit{background:var(--codex-pane-accent);border-color:transparent;color:var(--codex-pane-send-text)}
button:disabled{opacity:.45;cursor:default}
button:focus-visible{outline:2px solid var(--codex-pane-focus);outline-offset:2px}
</style>
