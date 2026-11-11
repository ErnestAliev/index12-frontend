import './team-chat-search.js';
import {teamApi} from '/src/stores/teamChatStore.js';
const chat=window.searchChat,base=teamApi.defaults.adapter,rows=[];
const people=[{_id:'actor',name:'Эрнест',owner:true,status:'active'},{_id:'reviewer',name:'Давид',role:'employee',status:'active'},{_id:'reviewer2',name:'Мария',role:'manager',status:'active'},{_id:'invited',name:'Ещё не вошёл',status:'invited'}];
window.approvalRequests=[];window.approvalDecisions=[];
chat.state.people=people;
teamApi.defaults.adapter=async config=>{
  if(config.url==='/messages'&&config.method==='post'){
    const input=JSON.parse(config.data);window.approvalRequests.push(input);
    let message=rows.find(r=>r._id===input.id);
    if(!message){message={_id:input.id,taskId:input.taskId,text:input.text,authorId:chat.me.actorId,authorName:chat.me.displayName,kind:'approval_request',attachments:[],createdAt:new Date().toISOString(),version:0,approvalRequest:{state:'pending',recipients:input.approvalRecipientIds.map(id=>({actorId:id,name:people.find(p=>p._id===id).name,state:'pending'}))}};rows.push(message);}
    return {status:201,data:{message:structuredClone(message)}};
  }
  if(config.url.endsWith('/decision')){
    const input=JSON.parse(config.data),id=config.url.split('/')[2],message=rows.find(r=>r._id===id);
    window.approvalDecisions.push({...input,actorId:chat.me.actorId});
    const person=message.approvalRequest.recipients.find(p=>p.actorId===chat.me.actorId);person.state=input.action==='approve'?'approved':'rejected';
    message.approvalRequest.state=message.approvalRequest.recipients.some(p=>p.state==='rejected')?'rejected':message.approvalRequest.recipients.every(p=>p.state==='approved')?'approved':'pending';message.version++;
    return {status:200,data:{message:structuredClone(message)}};
  }
  const result=await base(config);
  if(config.url==='/state')result.data.people=people;
  if(config.url==='/messages')result.data.messages=[...result.data.messages,...structuredClone(rows.filter(r=>r.taskId===config.params?.taskId))];
  return result;
};
window.approvalFixture={taskId:'22222222-2222-4222-8222-222222222222',
  switchActor(id){const person=people.find(p=>p._id===id);chat.me={...chat.me,actorId:id,displayName:person.name,role:person.role||'manager',owner:!!person.owner};},
  comment(){const row={_id:crypto.randomUUID(),taskId:this.taskId,text:'Продолжаем обсуждение',authorId:'actor',authorName:'Эрнест',attachments:[],createdAt:new Date().toISOString()};rows.push(row);chat.mergeMessage(row);},
};
