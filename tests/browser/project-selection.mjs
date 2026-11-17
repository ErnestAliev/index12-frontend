import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright-core';
const engine=process.argv.includes('--webkit')?'webkit':'chromium',origin='http://127.0.0.1:5224';
const keyboardOnly=process.argv.includes('--keyboard-only');
const chosenWidth=Number(process.argv.find(v=>v.startsWith('--width='))?.split('=')[1]);
const server=await createServer({root:process.cwd(),envDir:'/private/tmp',server:{host:'127.0.0.1',port:5224,strictPort:true},plugins:[{name:'project-selection-fixture',configureServer(s){s.middlewares.use('/__projects',(_q,r)=>{r.setHeader('Content-Type','text/html');r.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><div id="app"></div><script type="module" src="/tests/browser/fixtures/project-selection.js"></script>')})}}]});
let browser;
try{
 await server.listen();browser=engine==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const width of chosenWidth?[chosenWidth]:keyboardOnly?[390]:[320,390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<500}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/__projects');await page.waitForFunction(()=>window.projectSelection);
  const use=async locator=>{await locator.scrollIntoViewIfNeeded();if(width<500)await locator.tap();else await locator.click()};
  const field=page.getByRole('combobox',{name:'Проект',exact:true}),list=page.getByRole('listbox',{name:'Проект',exact:true});
  const option=name=>list.getByRole('option',{name,exact:true});
  for(const theme of keyboardOnly?[]:['dark','light'])for(const type of ['income','expense']){
   await page.evaluate(({type,theme})=>{document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty('--safe-area-bottom','34px');window.projectSelection.open(type)},{type,theme});
   await use(field);await use(option('Акмекен'));
   await list.waitFor({state:'hidden'});assert.ok((await field.innerText()).includes('Акмекен'),'one project selects and closes immediately');
   await use(field);await use(option('Пушкина 33'));await list.waitFor({state:'hidden'});
   assert.ok(!(await field.innerText()).includes('Акмекен'),'single mode replaces the old project');
   await use(field);await use(page.getByRole('button',{name:'Выбрать несколько',exact:true}));
   await use(option('Акмекен'));assert.equal(await option('Акмекен').getAttribute('aria-selected'),'true');
   assert.equal(await option('Пушкина 33').getAttribute('aria-selected'),'true');
   const done=page.getByRole('button',{name:'Готово',exact:true});await done.waitFor();
   const geometry=await done.evaluate(e=>{const b=e.getBoundingClientRect(),p=e.closest('.options-list').getBoundingClientRect();return {height:b.height,bottom:b.bottom,panelBottom:p.bottom,viewport:innerWidth,scroll:document.documentElement.scrollWidth}});
   assert.ok(geometry.height>=44);assert.ok(geometry.bottom<=geometry.panelBottom+1);assert.ok(geometry.scroll<=geometry.viewport+1);
   await use(done);await list.waitFor({state:'hidden'});
   assert.ok((await field.innerText()).includes('Акмекен'));assert.ok((await field.innerText()).includes('Пушкина 33'));
   await use(field);assert.ok(await done.isVisible(),'reopening two projects retains multiple mode');
   await use(option('Все проекты'));assert.equal(await option('Акмекен').getAttribute('aria-selected'),'false');
   await use(done);await use(field);assert.ok(await page.getByRole('button',{name:'Выбрать несколько',exact:true}).isVisible(),'one selection resets to quick mode');
   await use(option('Без проекта'));await list.waitFor({state:'hidden'});
   // Previously saved allocations open in multiple mode and survive saving.
   await page.evaluate(type=>window.projectSelection.open(type,['one','two']),type);
   await use(field);assert.ok(await done.isVisible());assert.equal(await option('Акмекен').getAttribute('aria-selected'),'true');assert.equal(await option('Пушкина 33').getAttribute('aria-selected'),'true');
   await use(done);await use(page.getByRole('button',{name:'Сохранить',exact:true}));
   await page.waitForFunction(()=>window.projectSelection.saved.length>0);
   const payload=await page.evaluate(()=>window.projectSelection.saved.pop());assert.deepEqual(payload.projectIds,['one','two']);
   console.log(`PASS ${engine} ${width} ${theme} ${type}: single replacement/close, opt-in multiple, Done, exclusivity and saved allocation`);
  }
  await page.evaluate(()=>window.projectSelection.open('income',['one']));await field.focus();await page.keyboard.press('Enter');
  await list.waitFor();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await list.waitFor({state:'hidden'});
  await field.focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button',{name:'Выбрать несколько',exact:true}).evaluate(e=>e===document.activeElement),true,await page.evaluate(()=>document.activeElement.outerHTML));
  await page.keyboard.press('Enter');await page.getByRole('button',{name:'Готово',exact:true}).focus();await page.keyboard.press('Enter');await list.waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);console.log(`PASS ${engine} ${width}: keyboard open/select, Tab into multiple, Done`);await context.close();
 }
}finally{await browser?.close();await server.close()}
