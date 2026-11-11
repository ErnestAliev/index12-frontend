import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseTeamDestination, rememberTeamDestination, pendingTeamDestination, takeTeamDestination, openTeamDestination, connectTeamDestinations} from '../src/utils/teamDestination.js';
const origin='https://index12.test',workspace='a'.repeat(24),task='11111111-1111-4111-8111-111111111111',message='22222222-2222-4222-8222-222222222222';
const owner={status:'active',owner:true,workspaceId:workspace};
const saved=new Map();
globalThis.window=Object.assign(new EventTarget(),{location:{origin,href:origin+'/'}});
globalThis.sessionStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:new EventTarget()}});
test('destination survives missing identity, login, and workspace startup without opening another workspace',()=>{
  rememberTeamDestination('/?teamChat='+workspace+'&task='+task+'&message='+message);
  assert.equal(takeTeamDestination(null,'/mobile'),null);
  assert.equal(takeTeamDestination({...owner,status:'pending'},'/mobile'),null);
  assert.equal(takeTeamDestination({...owner,workspaceId:'b'.repeat(24)},'/mobile'),null);
  assert.equal(takeTeamDestination({...owner,owner:false},'/mobile'),null);
  const chat={me:owner,show(){this.open=true;}};
  assert.equal(openTeamDestination(chat,'/mobile'),true);
  assert.equal(chat.requestedTaskId,task);assert.equal(chat.requestedTaskMessageId,message);assert.equal(chat.open,true);
  assert.equal(pendingTeamDestination(),null);assert.equal(openTeamDestination(chat,'/mobile'),false,'consumed links do not reopen a task after closing it');
});
test('general chat messages and invitation-only staff links retain their distinct destination',()=>{
  rememberTeamDestination('/?teamChat='+workspace+'&message='+message);
  const chat={me:owner,show(){}};openTeamDestination(chat,'/');
  assert.equal(chat.requestedTaskId,null);assert.equal(chat.requestedMessageId,message);
  const path='/team/fixture-invitation-0000000000';
  rememberTeamDestination(path+'?task='+task+'&message='+message);
  assert.equal(takeTeamDestination({...owner,owner:false},'/'),null);
  assert.equal(takeTeamDestination({...owner,owner:false},path).messageId,message);
});
test('reject foreign destinations, malformed ids, extra query parameters and expired links',()=>{
  for(const value of ['https://evil.test/?teamChat='+workspace,'/?teamChat=bad','/?teamChat='+workspace+'&task=bad','/?teamChat='+workspace+'&redirect=elsewhere','/?teamChat='+workspace+'#hash'])assert.equal(parseTeamDestination(value),null,value);
  rememberTeamDestination('/?teamChat='+workspace);
  const now=Date.now;Date.now=()=>now()+31*60*1000;
  try{assert.equal(pendingTeamDestination(),null);}finally{Date.now=now;}
});
test('OAuth return restores the owner target; warm push acknowledges only after routing',async()=>{
  rememberTeamDestination('/?teamChat='+workspace+'&task='+task+'&message='+message);
  let guard,after;const routes=[];
  const router={beforeEach(fn){guard=fn;return()=>{};},afterEach(fn){after=fn;return()=>{};},async replace(path){routes.push(path);after({fullPath:path},{fullPath:'/'},null);}};
  const disconnect=connectTeamDestinations(router);
  assert.equal(guard({path:'/mobile',query:{}}),'/?teamChat='+workspace+'&task='+task+'&message='+message);
  takeTeamDestination(owner,'/mobile');
  let acknowledged=false;
  const event=new Event('message');Object.assign(event,{data:{type:'team:refresh',url:origin+'/?teamChat='+workspace+'&task='+task+'&message='+message},ports:[{postMessage(){acknowledged=true;}}]});
  navigator.serviceWorker.dispatchEvent(event);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(routes.at(-1),'/?teamChat='+workspace+'&task='+task+'&message='+message);assert.equal(acknowledged,true);assert.equal(pendingTeamDestination().messageId,message);
  disconnect();takeTeamDestination(owner,'/mobile');
});
