<script setup>
import {computed,ref} from 'vue';
import {useTeamChatStore,teamApi,teamError} from '@/stores/teamChatStore';
import UiIcon from './UiIcon.vue';
const props=defineProps({message:{type:Object,required:true}});
const chat=useTeamChatStore(),busy=ref(false),error=ref('');
const request=computed(()=>props.message.approvalRequest);
const own=computed(()=>request.value.recipients.find(p=>p.actorId===chat.me?.actorId));
const single=computed(()=>request.value.recipients.length===1 ? request.value.recipients[0] : null);
const resolved=computed(()=>single.value && single.value.state!=='pending');
const title=computed(()=>resolved.value ? label(single.value.state) : 'Согласование');
const showSingleName=computed(()=>single.value && single.value.actorId!==props.message.authorId);
const label=state=>({pending:'Ожидает решения',approved:'Согласовано',rejected:'Отклонено'}[state]||'Ожидает решения');
async function decide(action){
  if(busy.value||own.value?.state!=='pending')return;busy.value=true;error.value='';
  try{await chat.action(`/messages/${props.message._id}/decision`,{action,expectedVersion:props.message.version||0});}
  catch(e){error.value=teamError(e);if(e.response?.status===409){try{const {data}=await teamApi.get('/messages/'+props.message._id);chat.mergeMessage(data.message);}catch{/* Keep the original decision error. */}}}
  finally{busy.value=false;}
}
</script>
<template>
  <div class="task-approval" :data-state="request.state" role="group" aria-label="Согласование" @keydown.stop>
    <div class="approval-heading" :class="{ resolved }" :role="resolved ? 'status' : undefined">
      <UiIcon :name="resolved ? (single.state==='approved' ? 'check' : 'close') : 'clock'" />
      <strong>{{ title }}</strong>
    </div>
    <template v-if="single">
      <p v-if="showSingleName" class="approval-reviewer-name">{{ single.name }}</p>
      <p v-if="!resolved" class="approval-waiting" role="status">Ожидает решения</p>
    </template>
    <ul v-else aria-label="Решения согласователей"><li v-for="person in request.recipients" :key="person.actorId" :data-state="person.state"><span>{{ person.name }}</span><span>{{ label(person.state) }}</span></li></ul>
    <div v-if="own?.state === 'pending'" class="approval-actions">
      <button type="button" :disabled="busy" @pointerdown.stop @click.stop="decide('approve')"><UiIcon name="check" /><span>Согласовать</span></button>
      <button type="button" :disabled="busy" @pointerdown.stop @click.stop="decide('reject')"><UiIcon name="close" /><span>Отклонить</span></button>
    </div>
    <p v-if="error" role="alert" class="approval-error">{{ error }}</p>
  </div>
</template>
<style scoped>
.task-approval{display:flex;flex-direction:column;gap:6px;min-width:0;max-width:100%;font-size:13px;padding-top:8px}
.approval-heading{display:flex;align-items:center;gap:7px;min-width:0;line-height:20px}
.approval-heading>.ui-icon{width:16px;height:16px;flex:none;color:var(--codex-pane-muted)}
.approval-heading strong{font-size:14px;font-weight:500;overflow-wrap:anywhere}
.task-approval[data-state=approved] .approval-heading.resolved,.task-approval[data-state=approved] .approval-heading.resolved>.ui-icon{color:var(--codex-pane-accent)}
.task-approval[data-state=rejected] .approval-heading.resolved,.task-approval[data-state=rejected] .approval-heading.resolved>.ui-icon{color:var(--codex-pane-danger)}
.task-approval p{margin:0;line-height:18px;font-size:12px}
.approval-waiting{color:var(--codex-pane-muted)}
.approval-reviewer-name{overflow-wrap:anywhere}
ul{display:flex;flex-direction:column;gap:4px;padding:0;margin:0;list-style:none}
li{display:flex;justify-content:space-between;gap:12px;font-size:12px;min-width:0}
li>span:first-child{overflow-wrap:anywhere;min-width:0}li>span:last-child{flex:none;color:var(--codex-pane-muted);font-size:11px}
[data-state=approved]>span:last-child{color:var(--codex-pane-accent)}[data-state=rejected]>span:last-child{color:var(--codex-pane-danger)}
.approval-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 -4px}
.task-approval .approval-actions button{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:44px!important;padding:0 8px;border:0;background:transparent;color:var(--codex-pane-text);border-radius:6px;font:inherit;font-size:12px;cursor:pointer}
.approval-actions button::before{content:'';position:absolute;inset:7px 0;border:1px solid var(--codex-pane-border);border-radius:6px;pointer-events:none}
.approval-actions button:first-child{color:var(--codex-pane-accent)}
.approval-actions button:hover::before{background:var(--codex-pane-surface-soft)}
.approval-actions .ui-icon{width:14px;height:14px;position:relative}
.approval-actions button>span{position:relative}
.approval-actions button:disabled{opacity:.45;cursor:default}
.approval-actions button:focus-visible{outline:2px solid var(--codex-pane-focus);outline-offset:1px}
.approval-error{margin:0;color:var(--codex-pane-danger);font-size:12px}
</style>
