import {createServer} from 'vite';
import {chromium,webkit} from 'playwright-core';
import assert from 'node:assert/strict';
const engine=process.argv.includes('--webkit')?'webkit':'chromium';
const server=await createServer({root:process.cwd(),envDir:'/private/tmp',cacheDir:'/private/tmp/index12-approval-vite',server:{host:'127.0.0.1',port:5206,strictPort:true}});
let browser;
try{
 await server.listen();browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const theme of ['light','dark'])for(const width of [320,390,834,1280]){
  const touch=width<1000,context=await browser.newContext({viewport:{width,height:900},hasTouch:touch,isMobile:touch});context.setDefaultTimeout(10000);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5206/tests/browser/fixtures/task-approvals.html');
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;for(const [side,value]of Object.entries({top:24,bottom:34,left:16,right:16}))document.documentElement.style.setProperty('--safe-area-'+side,value+'px');},theme);
  const activate=async locator=>touch?locator.tap():locator.click();
  const globalPlus=page.locator('.team-compose-area:visible .team-add-trigger');await activate(globalPlus);
  assert.equal(await page.getByRole('menuitem',{name:'Добавить согласование',exact:true}).count(),0);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>window.searchChat.requestedTaskId=window.approvalFixture.taskId);
  const panel=page.locator('.task-panel');await panel.waitFor();const textarea=panel.locator('.team-compose-area textarea');await textarea.fill('Несохранённый черновик');
  const plus=panel.locator('.team-add-trigger');await activate(plus);
  const items=panel.locator('.team-add-options [role=menuitem]');assert.deepEqual((await items.allTextContents()).map(s=>s.trim()),['Новая подзадача','Добавить согласование','Загрузить файл или фото']);
  const align=await items.evaluateAll(elements=>elements.map(el=>({justify:getComputedStyle(el).justifyContent,align:getComputedStyle(el).textAlign,height:el.getBoundingClientRect().height,x:el.querySelector('svg').getBoundingClientRect().x})));
  assert.ok(align.every(a=>a.justify==='flex-start'&&a.align==='left'&&a.height>=44),JSON.stringify(align));assert.ok(align.every(a=>Math.abs(a.x-align[0].x)<1));
  await activate(items.nth(1));const dialog=page.getByRole('dialog',{name:'Добавить согласование',exact:true});await dialog.waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Отправить на согласование',exact:true}).isDisabled(),true);assert.equal(await dialog.getByTitle('Ещё не вошёл',{exact:true}).count(),0);
  await activate(dialog.getByTitle('Давид',{exact:true}));await activate(dialog.getByTitle('Мария',{exact:true}));
  if(touch){await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>430});window.visualViewport.dispatchEvent(new Event('resize'));});}
  const geometry=await dialog.evaluate(el=>({box:el.getBoundingClientRect().toJSON(),button:el.querySelector('button[type=submit]').getBoundingClientRect().toJSON(),vw:visualViewport.width,vh:visualViewport.height,scroll:document.documentElement.scrollWidth}));
  assert.ok(geometry.box.x>=16&&geometry.box.right<=width-16&&geometry.box.y>=24&&geometry.box.bottom<=geometry.vh&&geometry.button.height>=44&&geometry.scroll<=width,JSON.stringify(geometry));
  if(touch)await activate(dialog.getByRole('button',{name:'Отправить на согласование',exact:true}));else{await page.keyboard.press('Tab');await dialog.getByRole('button',{name:'Отправить на согласование',exact:true}).focus();await page.keyboard.press('Enter');}
  await dialog.waitFor({state:'detached'});assert.equal(await textarea.inputValue(),'Несохранённый черновик');
  assert.deepEqual(await page.evaluate(()=>window.approvalRequests[0].approvalRecipientIds),['reviewer','reviewer2']);
  const approval=panel.locator('.task-approval').last();await approval.waitFor();assert.equal(await approval.getByRole('button',{name:'Согласовать',exact:true}).count(),0,'author was not selected');
  await page.evaluate(()=>window.approvalFixture.switchActor('reviewer'));
  const decisionButton=approval.getByRole('button',{name:'Согласовать',exact:true});
  const actionSize=await decisionButton.evaluate(el=>({height:el.getBoundingClientRect().height,font:getComputedStyle(el).fontSize,visibleHeight:getComputedStyle(el,'::before').height}));assert.ok(actionSize.height>=44&&parseFloat(actionSize.font)<=13&&parseFloat(actionSize.visibleHeight)<=30,JSON.stringify(actionSize));
  await activate(decisionButton);
  await page.waitForFunction(()=>window.approvalDecisions.length===1);await page.waitForFunction(()=>document.querySelector('.task-approval li[data-state=approved]'));
  assert.equal(await approval.getByRole('button',{name:'Согласовать',exact:true}).count(),0);
  await page.evaluate(()=>window.approvalFixture.switchActor('reviewer2'));await activate(approval.getByRole('button',{name:'Отклонить',exact:true}));
  await page.waitForFunction(()=>document.querySelector('.task-approval[data-state=rejected]'));assert.equal(await approval.locator('li[data-state=rejected]').count(),1);
  await page.evaluate(()=>{window.approvalFixture.switchActor('actor');window.approvalFixture.comment();Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>innerHeight});window.visualViewport.dispatchEvent(new Event('resize'));});
  await activate(plus);await activate(panel.getByRole('menuitem',{name:'Добавить согласование',exact:true}));
  await activate(dialog.getByTitle('Давид',{exact:true}));await activate(dialog.getByRole('button',{name:'Отправить на согласование',exact:true}));await dialog.waitFor({state:'detached'});
  assert.equal(await panel.locator('.task-approval').count(),2);assert.equal(await page.evaluate(()=>window.approvalRequests.length),2);
  const order=await page.evaluate(()=>window.searchChat.threads[window.approvalFixture.taskId].messages.map(m=>m.kind==='approval_request'?'approval':m.text));assert.ok(order.indexOf('Продолжаем обсуждение')>order.indexOf('approval')&&order.lastIndexOf('approval')>order.indexOf('Продолжаем обсуждение'),JSON.stringify(order));
  // Owner assigning approval to themselves must get the same interactive card on iPhone.
  await activate(plus);await activate(panel.getByRole('menuitem',{name:'Добавить согласование',exact:true}));
  await activate(dialog.getByTitle('Эрнест',{exact:true}));await activate(dialog.getByRole('button',{name:'Отправить на согласование',exact:true}));await dialog.waitFor({state:'detached'});
  const selfApproval=panel.locator('.task-approval').last();await selfApproval.waitFor();
  assert.equal(await selfApproval.locator('li').count(),0,'self name is already shown once as the message author');
  assert.equal((await selfApproval.innerText()).match(/Ожидает решения/g)?.length,1,'pending status appears once');
  await activate(selfApproval.getByRole('button',{name:'Согласовать',exact:true}));
  await page.waitForFunction(()=>document.querySelectorAll('.task-approval[data-state=approved]').length===1);
  assert.equal(await selfApproval.getAttribute('data-state'),'approved');
  assert.equal((await selfApproval.innerText()).trim(),'Согласовано','a self approval becomes one clean result, without duplicated name/status');
  const resultGeometry=await selfApproval.evaluate(el=>({width:el.getBoundingClientRect().width,bubble:el.closest('.team-bubble').getBoundingClientRect().toJSON(),scroll:document.documentElement.scrollWidth}));
  assert.ok(resultGeometry.bubble.width<=260&&resultGeometry.bubble.height<115&&resultGeometry.scroll<=width,JSON.stringify(resultGeometry));
  assert.deepEqual(errors,[]);console.log(`PASS ${engine} ${theme} ${width}: task-only ordered/left-aligned add menu, multi-reviewer dialog, keyboard/touch, safe areas, inline decisions and preserved draft/history`);await context.close();
 }
}finally{await browser?.close();await server.close();}
