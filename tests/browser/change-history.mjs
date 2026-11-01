import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {createAppearanceAPI} from './appearance-api.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=await createServer({root,server:{host:'127.0.0.1',port:5195,strictPort:true}});
const now=new Date(),day=`${now.getFullYear()}-${Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate())-new Date(now.getFullYear(),0,0))/86400000)}`;
const operation={_id:'income',type:'income',amount:1400000,date:now.toISOString(),dateKey:day,cellIndex:0,accountId:'cash',companyId:'owner',categoryId:'rent',description:'Оплата аренды за октябрь'};
let browser;
try{
 await server.listen();browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});await mkdir(`${root}/output/playwright`,{recursive:true});
 for(const fixture of [{name:'desktop',width:1512,height:982},{name:'tablet',width:834,height:1194,touch:true},{name:'phone',width:390,height:844,touch:true,mobile:true}]){
  const context=await browser.newContext({viewport:{width:fixture.width,height:fixture.height},hasTouch:!!fixture.touch,isMobile:!!fixture.mobile,userAgent:fixture.mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':fixture.touch?'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1':undefined});
  await context.addInitScript(()=>{localStorage.setItem('app_data_version','1');localStorage.setItem('theme','light');localStorage.setItem('accountVisibilityMode','all');});
  const page=await context.newPage(),api=createAppearanceAPI(),errors=[],undoCalls=[],queries=[];
  let deviceId,amount=1400000;
  const rows=[{id:'amount',kind:'operation',operationType:'income',action:'updated',actorName:'Эрнест',createdAt:now.toISOString(),snapshot:operation,details:{accountId:'Касса',categoryId:'Аренда'},canUndo:true,change:{field:'amount',before:{amount:1200000},after:{amount:1400000}}},
   {id:'deleted',kind:'operation',operationType:'transfer',action:'deleted',actorName:'Эрнест',createdAt:now.toISOString(),snapshot:{...operation,type:'transfer',amount:250000,description:'Перевод на банковский счёт'},details:{fromAccountId:'Касса',toAccountId:'Банк'},canUndo:true},
   {id:'local',kind:'setting',target:'preference',key:'theme',action:'updated',createdAt:now.toISOString(),deviceId:'',deviceLabel:'Десктоп',canUndo:true,changes:[{path:[],before:{exists:true,value:'dark'},after:{exists:true,value:'light'}}]}];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;let data=[];
   if(await api.handle(route,'history-user'))return;
   if(path.includes('/change-history')){
    if(req.method()==='GET'){queries.push(Object.fromEntries(url.searchParams));let items=rows.filter(row=>(!url.searchParams.get('kind')||row.kind===url.searchParams.get('kind'))&&(!url.searchParams.get('operationType')||row.operationType===url.searchParams.get('operationType')));data={items,nextCursor:null};}
    else if(path.endsWith('/undo')){const body=req.postDataJSON();undoCalls.push({path,body});assert.equal(body.confirm,true);const row=rows.find(r=>path.includes(`/${r.id}/`));if(row.target==='preference')data={preference:{id:row.id,key:row.key,requestId:'receipt',changes:row.changes}};else{row.undoneAt=now.toISOString();if(row.id==='amount')amount=1200000;data={ok:true,kind:row.kind};}}
    else if(path.endsWith('/complete')){const body=req.postDataJSON();assert.equal(body.applied,true);rows.find(r=>path.includes(`/${r.id}/`)).undoneAt=now.toISOString();data={ok:true};}else data={ok:true};
   }
   else if(path.endsWith('/auth/me'))data={_id:'history-user',role:'admin',workspaceRole:'admin',name:'Эрнест',createdAt:'2026-01-01'};
   else if(path.endsWith('/accounts'))data=[{_id:'cash',name:'Касса',companyId:'owner',initialBalance:100000}];
   else if(path.endsWith('/companies'))data=[{_id:'owner',name:'Компания'}];
   else if(path.endsWith('/categories'))data=[{_id:'rent',name:'Аренда'}];
   else if(path.endsWith('/events')||path.endsWith('/events/all-for-export'))data=Array.from({length:180},(_,i)=>({...operation,_id:i?`income-${i}`:'income',cellIndex:i,amount}));
   else if(path.endsWith('/snapshot'))data={timestamp:now.toISOString(),accountBalances:{cash:100000},companyBalances:{owner:100000},individualBalances:{},contractorBalances:{}};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(`http://127.0.0.1:5195/${fixture.mobile?'mobile':''}`);
  await page.locator(fixture.mobile?'.op-chip.income':'.operation-chip.income').first().waitFor();
  deviceId=await page.evaluate(()=>localStorage.getItem('index12-history-device'));rows[2].deviceId=deviceId;
  if(!fixture.mobile){
   await page.locator('.home-right-panel [data-tooltip="Журнал операций"]').click();
   const wrap=page.locator('.editor-modal .table-wrap');await wrap.locator('tbody tr').nth(100).waitFor({state:'attached'});
   const before=await wrap.evaluate(el=>({top:el.scrollTop,height:el.clientHeight,scroll:el.scrollHeight}));assert.ok(before.scroll>before.height);
   const box=await wrap.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,600);
   await page.waitForFunction(()=>document.querySelector('.editor-modal .table-wrap').scrollTop>100);
   await page.keyboard.press('Escape');if(await page.locator('.editor-modal').count())await page.locator('.editor-modal .close-btn:visible').first().click();
  }
  const open=async()=>{if(fixture.mobile){await page.getByTitle('Профиль',{exact:true}).click();await page.getByRole('button',{name:'История изменений',exact:true}).click();}else await page.getByRole('button',{name:'История изменений',exact:true}).click();};
  await open();const panel=page.getByRole('dialog',{name:'История изменений',exact:true});await panel.locator('[data-history-id="amount"]').waitFor();
  await panel.getByRole('button',{name:'Перевод',exact:true}).hover();await page.getByRole('tooltip').waitFor();assert.ok((await page.getByRole('tooltip').innerText()).includes('Перевод на банковский счёт'));
  await panel.locator('[data-history-id="amount"]').getByRole('button',{name:'Отменить',exact:true}).click();await page.getByRole('alertdialog').waitFor();await page.screenshot({path:`${root}/output/playwright/history-confirm-${fixture.name}.png`});await page.getByRole('alertdialog').getByRole('button',{name:'Отмена',exact:true}).click();assert.equal(undoCalls.length,0);
  await panel.locator('[data-history-id="amount"]').getByRole('button',{name:'Отменить',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Да, отменить изменение',exact:true}).click();await panel.locator('[data-history-id="amount"]').getByRole('button',{name:'Отменено',exact:true}).waitFor();assert.equal(undoCalls.length,1);
  await panel.getByLabel('Раздел',{exact:true}).selectOption('setting');await panel.locator('[data-history-id="local"]').waitFor();assert.equal(await panel.locator('.history-row').count(),1);
  await panel.getByLabel('Порядок',{exact:true}).selectOption('asc');await page.waitForFunction(()=>document.querySelector('.history-list[aria-busy="false"]'));
  assert.equal(queries.at(-1).kind,'setting');assert.equal(queries.at(-1).order,'asc');
  await panel.locator('[data-history-id="local"]').getByRole('button',{name:'Отменить',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Да, отменить изменение',exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await panel.locator('[data-history-id="local"]').getByRole('button',{name:'Отменено',exact:true}).waitFor();
  await page.screenshot({path:`${root}/output/playwright/change-history-${fixture.name}.png`});assert.deepEqual(errors,[]);assert.equal(undoCalls.length,2);
  console.log(`PASS ${fixture.name}: history filters, deleted-operation tooltip, confirmation/cancel, operation undo, local-setting undo${fixture.mobile?'':', central journal scrolling'}`);await context.close();
 }
}finally{await browser?.close();await server.close();}
