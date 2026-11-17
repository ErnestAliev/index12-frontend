// Local synthetic API; real Vue, mouse/touch, no screenshots or production calls.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright-core';
const engine=process.argv.includes('--webkit')?'webkit':'chromium',origin='http://127.0.0.1:5244';
const server=await createServer({root:process.cwd(),envDir:'/private/tmp',server:{host:'127.0.0.1',port:5244,strictPort:true}});
let browser;
try {
 await server.listen();browser=await (engine==='webkit'?webkit.launch():chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
 for(const mobile of [false,true])for(const theme of ['dark','light']) {
  const context=await browser.newContext({viewport:{width:mobile?320:1280,height:mobile?740:900},hasTouch:mobile});
  await context.addInitScript(({mobile,theme})=>{window.fixtureMobile=mobile;localStorage.setItem('theme',theme);}, {mobile,theme});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));let job,history=[];
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;if(!path.startsWith('/api/'))return url.origin===origin?route.continue():route.abort();
   let data={};
   if(path==='/api/codex/status')data={connected:true,configured:true,backend:'cloud'};
   if(path==='/api/codex/chats')data={chats:[{id:'chat',title:'Проверка'}]};
   if(path==='/api/codex/chats/chat')data={chat:{id:'chat'},cachedHistory:{messages:history}};
   if(path.endsWith('/jobs')){const body=req.postDataJSON();if(body.kind==='history')data={job:{status:'completed',result:{messages:history}}};else{job={id:'progress-job',status:'running',progress:{text:'Извлекаю данные документа'}};data={job};}}
   if(path==='/api/codex/jobs/progress-job')data={job};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(origin+'/tests/browser/fixtures/fragments-codex.html');
  await page.evaluate(theme=>{document.documentElement.setAttribute('data-theme',theme);document.documentElement.style.setProperty('--safe-area-bottom','34px');},theme);
  await page.waitForFunction(()=>document.querySelector('.desktop-chat-picker select')?.value==='chat'&&!document.querySelector('.desktop-chat-picker select').disabled);
  await page.getByRole('textbox',{name:'Спросите Codex'}).fill('Обработай счёт');
  const send=page.getByRole('button',{name:'Отправить',exact:true});if(mobile)await send.tap();else await send.click();
  const status=page.locator('.codex-typing');await status.getByText('Извлекаю данные документа',{exact:true}).waitFor();
  for(const text of ['Ищу контрагента в 1С','Сверяю результат записи в 1С','Платёжное поручение проведено']){job={...job,progress:{text}};await status.getByText(text,{exact:true}).waitFor();}
  const geometry=await status.evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,right:r.right,viewport:innerWidth,scroll:el.scrollWidth,client:el.clientWidth,role:el.getAttribute('role'),live:el.getAttribute('aria-live')};});
  assert.ok(geometry.right<=geometry.viewport+1,JSON.stringify(geometry));assert.ok(geometry.scroll<=geometry.client+1);assert.equal(geometry.role,'status');assert.equal(geometry.live,'polite');
  history=[{id:'done',role:'assistant',content:'Счёт оформлен'}];job={id:job.id,status:'completed',result:{text:'Счёт оформлен'}};await status.waitFor({state:'detached'});assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS '+engine+': live execution statuses, completion cleanup, narrow/mobile touch and desktop, light/dark, no overflow');
}finally{await browser?.close();await server.close();}
