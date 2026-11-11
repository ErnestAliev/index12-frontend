// Real App/owner startup with isolated HTTP data; no employee messages or screenshots.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright-core';
const engine=process.argv.includes('--webkit')?'webkit':'chromium';
const server=await createServer({root:process.cwd(),envDir:'/private/tmp',cacheDir:'/private/tmp/index12-push-vite',server:{host:'127.0.0.1',port:5207,strictPort:true}});
const workspace='aaaaaaaaaaaaaaaaaaaaaaaa',actor='owner:bbbbbbbbbbbbbbbbbbbbbbbb';
const taskId='11111111-1111-4111-8111-111111111111',messageId='22222222-2222-4222-8222-222222222222';
const task={_id:taskId,workspaceId:workspace,description:'Тест согласования себе',assigneeIds:[actor],assignees:[{actorId:actor,name:'Эрнест'}],creatorId:actor,creatorName:'Эрнест',status:'open',timing:'none',attachments:[],version:0};
const message={_id:messageId,workspaceId:workspace,taskId,authorId:actor,authorName:'Эрнест',text:'Согласование',kind:'approval_request',attachments:[],version:0,createdAt:new Date().toISOString(),approvalRequest:{state:'pending',recipients:[{actorId:actor,name:'Эрнест',state:'pending'}]}};
const identity={workspaceId:workspace,actorId:actor,owner:true,status:'active',displayName:'Эрнест',roles:{}};
let browser;
try{
 await server.listen();browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const cold of [true,false]){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'}),page=await context.newPage();context.setDefaultTimeout(15000);
  const errors=[],writes=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname.includes('/api/')){
    const path=url.pathname.slice(url.pathname.indexOf('/api/')+4);let data=[];
    if(!['GET','OPTIONS'].includes(request.method()))writes.push(path);
    if(path==='/auth/me')data={_id:'bbbbbbbbbbbbbbbbbbbbbbbb',id:'bbbbbbbbbbbbbbbbbbbbbbbb',name:'Эрнест',currentWorkspaceId:workspace,workspaceRole:'owner'};
    else if(path==='/team-chat/me'){await new Promise(resolve=>setTimeout(resolve,450));data=identity;}
    else if(path==='/team-chat/state')data={identity,messages:[],tasks:[task],members:[],people:[{_id:actor,name:'Эрнест',status:'active',owner:true}]};
    else if(path==='/team-chat/messages')data={messages:[message],hasMore:false};
    else if(path==='/team-chat/tasks/'+taskId)data={task};
    else if(path==='/team-chat/task-options')data={projects:[],parties:[]};
    else if(path.includes('/push/'))data={configured:false,enabled:false};
    else if(path.includes('/appearance')||path.includes('/preferences')||path.includes('/settings'))data={};
    else if(path==='/team-chat/events')return route.fulfill({status:200,contentType:'text/event-stream',body:': fixture\n\n'});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   }
   if(url.hostname!=='127.0.0.1'||url.pathname.startsWith('/socket.io'))return route.abort();
   return route.continue();
  });
  const destination='/?teamChat='+workspace+'&task='+taskId+'&message='+messageId;
  if(cold)await page.addInitScript(({destination,workspace,taskId,messageId})=>{
    sessionStorage.setItem('index12-team-destination',JSON.stringify({path:destination,workspaceId:workspace,taskId,messageId,staff:false,savedAt:Date.now()}));
  },{destination,workspace,taskId,messageId});
  await page.goto('http://127.0.0.1:5207/');
  if(!cold){
   await page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/team-chat/me'));
   const ack=await page.evaluate(async destination=>{
    const channel=new MessageChannel(),received=new Promise(resolve=>{channel.port1.onmessage=event=>resolve(event.data.received);setTimeout(()=>resolve(false),3000);});
    navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'team:refresh',url:location.origin+destination},ports:[channel.port2]}));
    return received;
   },destination);assert.equal(ack,true);
  }
  await page.locator('.task-approval').waitFor();
  await page.locator('.task-approval button').first().waitFor();
  assert.match(page.url(),/\/mobile\?/);const query=new URL(page.url()).searchParams;
  assert.equal(query.get('task'),taskId);assert.equal(query.get('message'),messageId);
  assert.equal(await page.locator('.task-approval').getByRole('button',{name:'Согласовать',exact:true}).count(),1);
  await page.locator('.team-message.reply-target .task-approval').waitFor();
  assert.ok(writes.every(path=>path==='/team-chat/messages/read'),'opening a push must not mutate task, decisions, or accounting: '+writes);
  assert.deepEqual(errors,[]);console.log(`PASS ${engine}: owner/self approval, ${cold?'OAuth return + delayed startup':'warm PWA push'}, mobile redirect and exact message`);await context.close();
 }
}finally{await browser?.close();await server.close();}
