// Independent browser storage represents a PC, tablet and a second account.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {defaultPreferences,presetTheme} from '../../src/utils/appearance.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=await createServer({root,server:{host:'127.0.0.1',port:5194,strictPort:true}});
const libraries=new Map(),errors=[];let browser,offline=false;
const legacy=defaultPreferences();legacy.mode='light';legacy.themes.light=presetTheme('warm','light');
legacy.themes.light.overrides.widgets.colors.surface='#fff4dd';
legacy.saved=[{id:'legacy-pc',name:'Тема ПК',mode:'light',theme:structuredClone(legacy.themes.light)}];
try {
 await server.listen();browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 async function device(actor,width,stored) {
  const context=await browser.newContext({viewport:{width,height:982},...(width<1100?{hasTouch:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1'}:{})});
  await context.addInitScript(({actor,stored})=>{localStorage.setItem('app_data_version','1');localStorage.setItem('theme','light');if(stored&&!localStorage.getItem('seeded')){localStorage.setItem(`index12-appearance-v1:${actor}`,JSON.stringify(stored));localStorage.setItem('seeded','1');}}, {actor,stored});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;let data=[],status=200;
   if(path.includes('/user/appearance-themes')) {
    if(offline)return route.abort('failed');
    const items=libraries.get(actor)||[],method=req.method(),body=req.postDataJSON();
    if(method==='GET')data={themes:items};
    else if(method==='POST'){let item=items.find(t=>t.id===body.id);if(!item){item={...body,revision:1};items.push(item);libraries.set(actor,items);}data={theme:item};}
    else {const id=decodeURIComponent(path.split('/').at(-1)),item=items.find(t=>t.id===id);
     if(!item||item.revision!==body.revision){status=409;data={error:'Тема изменена на другом устройстве.'};}
     else if(method==='PUT'){const next={...body,revision:item.revision+1};libraries.set(actor,items.map(t=>t.id===id?next:t));data={theme:next};}
     else{libraries.set(actor,items.filter(t=>t.id!==id));data={ok:true};}
    }
   }
   if(path.endsWith('/auth/me'))data={_id:actor,role:'admin',workspaceRole:'admin',createdAt:'2026-01-01'};
   if(path.endsWith('/accounts'))data=[{_id:'cash',name:'Счёт',initialBalance:2000000}];
   if(path.endsWith('/snapshot'))data={accountBalances:{cash:2000000},companyBalances:{},individualBalances:{},contractorBalances:{}};
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:5194/');
  await page.getByRole('button',{name:'Настройки оформления',exact:true}).click();
  const panel=page.getByRole('dialog',{name:'Настройки оформления',exact:true}),list=panel.getByLabel('Мои темы',{exact:true});
  await panel.getByRole('button',{name:'Обновить список тем',exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Обновить список тем"]').disabled);
  return {page,panel,list,context,token:key=>page.evaluate(key=>getComputedStyle(document.documentElement).getPropertyValue(key).trim(),key)};
 }
 const pc=await device('alice',1512,legacy);
 assert.equal(libraries.get('alice').length,1,'legacy PC theme is uploaded automatically');
 const tablet=await device('alice',1024);
 await tablet.list.selectOption('legacy-pc');
 assert.equal(await tablet.token('--widget-background'),'#fff4dd');
 const color=(d,value)=>d.panel.getByLabel('Виджеты: Фон виджетов',{exact:true}).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await color(tablet,'#ddeecc');
 assert.equal(await pc.token('--widget-background'),'#fff4dd','tablet draft does not alter PC');
 assert.equal(libraries.get('alice')[0].theme.overrides.widgets.colors.surface,'#fff4dd','draft does not change shared template');
 await tablet.panel.getByRole('button',{name:'Обновить',exact:true}).click();
 await tablet.panel.getByRole('status').filter({hasText:'Тема сохранена'}).waitFor();
 await pc.panel.getByRole('button',{name:'Обновить список тем',exact:true}).click();
 await pc.page.waitForFunction(()=>!document.querySelector('[aria-label="Обновить список тем"]').disabled);
 assert.equal(await pc.token('--widget-background'),'#fff4dd','refresh only updates the library');
 // PC still holds revision 1; explicit update must not overwrite tablet revision 2.
 await color(pc,'#ddeeff');
 await pc.panel.getByRole('button',{name:'Обновить',exact:true}).click();
 await pc.panel.getByRole('alert').filter({hasText:'другом устройстве'}).waitFor();
 assert.equal(libraries.get('alice')[0].theme.overrides.widgets.colors.surface,'#ddeecc');
 await pc.list.selectOption('');await pc.list.selectOption('legacy-pc');
 assert.equal(await pc.token('--widget-background'),'#ddeecc');
 await color(tablet,'#ffeedd');
 await tablet.panel.getByRole('textbox',{name:'Название темы',exact:true}).fill('Планшет');
 await tablet.panel.getByRole('button',{name:'Сохранить как новую',exact:true}).click();
 await tablet.page.waitForFunction(()=>document.querySelector('#personal-theme-list').options.length===3);
 await pc.panel.getByRole('button',{name:'Обновить список тем',exact:true}).click();
 await pc.page.waitForFunction(()=>document.querySelector('#personal-theme-list').options.length===3);
 const bob=await device('bob',834);
 assert.equal(await bob.list.locator('option').count(),1,'other accounts have separate libraries');
 // Network loss keeps the cached list and current per-device edits.
 offline=true;await tablet.panel.getByRole('button',{name:'Обновить список тем',exact:true}).click();
 await tablet.panel.getByRole('alert').waitFor();assert.equal(await tablet.list.locator('option').count(),3);
 assert.equal(await tablet.token('--widget-background'),'#ffeedd');offline=false;
 const selected=await tablet.list.inputValue();
 await tablet.panel.getByRole('button',{name:'Удалить сохранённую тему',exact:true}).click();
 await tablet.page.waitForFunction(()=>document.querySelector('#personal-theme-list').options.length===2);
 await pc.page.reload();await pc.page.getByRole('button',{name:'Настройки оформления',exact:true}).click();
 await pc.page.waitForFunction(()=>document.querySelector('#personal-theme-list').options.length===2);
 assert.ok(!libraries.get('alice').some(t=>t.id===selected),'stale remote cache does not resurrect deletion');
 const keys=await pc.page.evaluate(async()=>{const {useWidgetStore}=await import('/src/stores/widgetStore.js');return useWidgetStore().staticWidgets.map(t=>t.key);});
 assert.ok(!keys.some(k=>['incomeList','expenseList','transfers','subcategories'].includes(k)));
 assert.deepEqual(await pc.panel.locator('.theme-scope-tabs button').allTextContents(),['Вся тема','1Виджеты','2Разделители','3Таблица','4Операции','5Графики','6Итоги дня']);
 assert.deepEqual(errors,[]);
 console.log('PASS legacy import, PC/tablet exchange, independent local edits, explicit update, stale-version protection, offline cache, shared deletion, account isolation, six sections and removed widgets');
} finally {await browser?.close();await server.close();}
