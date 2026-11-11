<script setup>
import {computed,ref} from 'vue';
import {useTeamChatStore,teamApi,teamError} from '@/stores/teamChatStore';
import UiIcon from './UiIcon.vue';
const props=defineProps({message:{type:Object,required:true}});
const chat=useTeamChatStore(),busy=ref(false),error=ref('');
const request=computed(()=>props.message.approvalRequest);
const own=computed(()=>request.value.recipients.find(p=>p.actorId===chat.me?.actorId));
const label=state=>({pending:'Ожидает решения',approved:'Согласовано',rejected:'Отклонено'}[state]||'Ожидает решения');
async function decide(action){
  if(busy.value||own.value?.state!=='pending')return;busy.value=true;error.value='';
  try{await chat.action(`/messages/${props.message._id}/decision`,{action,expectedVersion:props.message.version||0});}
  catch(e){error.value=teamError(e);if(e.response?.status===409){try{const {data}=await teamApi.get('/messages/'+props.message._id);chat.mergeMessage(data.message);}catch{/* Keep the original decision error. */}}}
  finally{busy.value=false;}
}
</script>
<template>
  <div class="task-approval" :data-state="request.state" @keydown.stop>
    <div class="approval-heading"><UiIcon name="check" /><strong>Согласование</strong><span role="status">{{ label(request.state) }}</span></div>
    <ul aria-label="Решения согласователей"><li v-for="person in request.recipients" :key="person.actorId" :data-state="person.state"><span>{{ person.name }}</span><span>{{ label(person.state) }}</span></li></ul>
    <div v-if="own?.state === 'pending'" class="approval-actions">
      <button type="button" :disabled="busy" @pointerdown.stop @click.stop="decide('approve')"><UiIcon name="check" /><span>Согласовать</span></button>
      <button type="button" :disabled="busy" @pointerdown.stop @click.stop="decide('reject')"><UiIcon name="close" /><span>Отклонить</span></button>
    </div>
    <p v-if="error" role="alert" class="approval-error">{{ error }}</p>
  </div>
</template>
<style scoped>
.task-approval{display:flex;flex-direction:column;gap:8px;min-width:0;max-width:100%;font-size:13px}
.approval-heading{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.approval-heading>.ui-icon{width:16px;height:16px;flex:none}
.approval-heading strong{font-size:13px;font-weight:500}
.approval-heading>span{font-size:11px;color:var(--codex-pane-muted)}
.task-approval[data-state=approved] .approval-heading>span{color:var(--codex-pane-accent)}
.task-approval[data-state=rejected] .approval-heading>span{color:var(--codex-pane-danger)}
ul{display:flex;flex-direction:column;gap:4px;padding:0;margin:0;list-style:none}
li{display:flex;justify-content:space-between;gap:12px;font-size:12px;min-width:0}
li>span:first-child{overflow-wrap:anywhere;min-width:0}li>span:last-child{flex:none;color:var(--codex-pane-muted);font-size:11px}
[data-state=approved]>span:last-child{color:var(--codex-pane-accent)}[data-state=rejected]>span:last-child{color:var(--codex-pane-danger)}
.approval-actions{display:flex;gap:8px;flex-wrap:wrap}
.task-approval .approval-actions button{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:44px!important;padding:0 8px;border:0;background:transparent;color:var(--codex-pane-text);border-radius:6px;font:inherit;font-size:12px;cursor:pointer}
.approval-actions button::before{content:'';position:absolute;inset:7px 0;border:1px solid var(--codex-pane-border);border-radius:6px;pointer-events:none}
.approval-actions button:hover::before{background:var(--codex-pane-surface-soft)}
.approval-actions .ui-icon{width:14px;height:14px;position:relative}
.approval-actions button>span{position:relative}
.approval-actions button:disabled{opacity:.45;cursor:default}
.approval-error{margin:0;color:var(--codex-pane-danger);font-size:12px}
</style>
