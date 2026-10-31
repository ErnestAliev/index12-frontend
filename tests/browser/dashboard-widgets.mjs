// Real UI, isolated API fixtures: financial writes are forbidden throughout this check.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({ root, cacheDir:'node_modules/.vite-dashboard', server:{host:'127.0.0.1',port:5194,strictPort:true} });
const today = new Date(); today.setHours(12,0,0,0);
const dateAt = offset => { const date = new Date(today); date.setDate(date.getDate()+offset); return date; };
const keyFor = date => `${date.getFullYear()}-${Math.floor((new Date(date.getFullYear(),date.getMonth(),date.getDate())-new Date(date.getFullYear(),0,0))/86400000)}`;
const operations = [
 { _id:'sale',type:'income',amount:50.25,accountId:'bank',categoryId:'rent',subcategoryId:'sub',cellIndex:0 },
 { _id:'expense',type:'expense',amount:10.15,accountId:'bank',categoryId:'rent',cellIndex:1 },
 { _id:'loan',type:'income',amount:100.35,accountId:'bank',categoryId:'credit',cellIndex:2 },
 { _id:'withdrawal',type:'expense',amount:20,accountId:'bank',isWithdrawal:true,cellIndex:3 },
 { _id:'internal',type:'transfer',isTransfer:true,amount:30,fromAccountId:'bank',toAccountId:'cash',cellIndex:4 },
 { _id:'partial',type:'transfer',isTransfer:true,amount:70,fromAccountId:'bank',toAccountId:'hidden',cellIndex:5 },
 { _id:'future-expense',type:'expense',amount:500000,accountId:'bank',categoryId:'rent',offset:1,cellIndex:0 },
 { _id:'future-income',type:'income',amount:600000,accountId:'bank',categoryId:'rent',offset:2,cellIndex:0 },
].map(op => {const date=dateAt(op.offset||0);return {...op,date:date.toISOString(),dateKey:keyFor(date),companyId:'company',projectId:'project'};});
const legacy=['accounts','companies','contractors','projects','incomeList','expenseList','transfers','individuals','categories','subcategories'];
let browser;
try {
 await server.listen();
 browser=await chromium.launch({executablePath:process.env.SCROLL_TEST_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 await mkdir(`${root}/output/playwright`,{recursive:true});
 for (const fixture of [{name:'desktop',width:1440,height:900},{name:'tablet',width:834,height:1194,touch:true},{name:'phone',width:390,height:844,mobile:true,touch:true},{name:'small-phone',width:320,height:640,mobile:true,touch:true}]) {
  const context=await browser.newContext({viewport:{width:fixture.width,height:fixture.height},hasTouch:!!fixture.touch,isMobile:!!fixture.mobile,timezoneId:'Asia/Almaty',userAgent:fixture.mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1':fixture.touch?'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Safari/604.1':undefined});
  await context.addInitScript(legacy=>{localStorage.setItem('app_data_version','1');localStorage.setItem('theme','light');localStorage.setItem('dashboardLayout',JSON.stringify(legacy));localStorage.setItem('accountVisibilityMode','open');},legacy);
  const page=await context.newPage();const errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;let data=[];
   if(req.method()!=='GET')writes.push(path);
   if(path.endsWith('/auth/me'))data={_id:'dashboard-test',workspaceRole:'admin',role:'admin',createdAt:'2026-01-01'};
   if(path.endsWith('/accounts'))data=[{_id:'bank',name:'BCC UU',initialBalance:100000,companyId:'company'},{_id:'cash',name:'Касса',initialBalance:20000,companyId:'company'},{_id:'hidden',name:'Скрытый счёт',initialBalance:5000,companyId:'company',isExcluded:true}];
   if(path.endsWith('/companies'))data=[{_id:'company',name:'ТОО UU'}];
   if(path.endsWith('/projects'))data=[{_id:'project',name:'Акмекен'}];
   if(path.endsWith('/categories'))data=[{_id:'rent',name:'Аренда'},{_id:'credit',name:'Кредиты'},{_id:'transfer-cat',name:'Перевод'}];
   if(path.endsWith('/subcategories'))data=[{_id:'sub',name:'Офис',parentCategoryId:'rent'}];
   if(path.endsWith('/events'))data=operations;
   if(path.endsWith('/snapshot'))data={timestamp:today.toISOString(),accountBalances:{bank:100000,cash:20000,hidden:5000},companyBalances:{company:125000},individualBalances:{},contractorBalances:{}};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const url=`http://127.0.0.1:5194/${fixture.mobile?'mobile':''}`;
  await page.goto(url);await page.locator('.overview-money').waitFor();
  await page.waitForFunction(()=>!document.querySelector('.section-loading-overlay'));
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('dashboardLayout'))),['upcomingPayments','accounts','projects']);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('dashboardLayout:before-v2'))),legacy);
  const moneyBounds=await page.locator('.money-current').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const r=range.getBoundingClientRect();return {left:r.left,right:r.right};});
  assert.ok(moneyBounds.left>=0&&moneyBounds.right<=fixture.width,JSON.stringify({fixture,moneyBounds}));
  if(!fixture.mobile){
   const headerBounds=await page.locator('.header-dashboard').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,width:r.width};});
   assert.ok(headerBounds.width>=fixture.width-4&&headerBounds.left>=0,JSON.stringify({fixture,headerBounds}));
  }
  if(fixture.mobile)await page.locator('.header-expand-btn').click();
  await page.evaluate(async()=>{const {useMainStore}=await import('/src/stores/mainStore.js');useMainStore().setPeriodFilter({mode:'all',customStart:null,customEnd:null});});
  const payment=page.locator('.overview-upcomingPayments .overview-payment').first();await payment.waitFor();
  await page.screenshot({path:`${root}/output/playwright/widgets-${fixture.name}.png`});
  await payment.click();
  const form=page.locator('.popup-content.theme-expense');await form.waitFor();
  assert.equal((await form.locator('.real-input').first().inputValue()).replace(/\s/g,''),'500000');
  await page.locator('.popup-overlay').click({position:{x:3,y:3}});await form.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Настроить виджеты',exact:true}).first().click();
  const picker=page.getByRole('dialog',{name:'Виджеты'});await picker.waitFor();
  await picker.getByLabel('Движение денег',{exact:true}).check();
  await picker.getByLabel('Статьи',{exact:true}).check();
  await picker.getByRole('button',{name:'Закрыть настройки виджетов'}).click();
  if(!fixture.mobile)await page.evaluate(async()=>{const {useMainStore}=await import('/src/stores/mainStore.js');useMainStore().isHeaderExpanded=true;});
  const cashflow=page.locator('.overview-cashflow');await cashflow.waitFor();
  assert.ok((await cashflow.innerText()).replace(/\u00a0/g,' ').includes('150,6'),await cashflow.innerText());
  assert.ok((await cashflow.innerText()).replace(/\u00a0/g,' ').includes('100,15'),await cashflow.innerText());
  await cashflow.getByRole('button',{name:'Будущие',exact:true}).click();
  assert.ok((await cashflow.innerText()).replace(/\u00a0/g,' ').includes('600 000'),await cashflow.innerText());
  await cashflow.getByRole('button',{name:'Открыть: Движение денег'}).click();
  const detail=page.getByRole('dialog',{name:'Движение денег'});await detail.waitFor();
  assert.equal(await detail.getByRole('button',{name:'Будущие',exact:true}).getAttribute('aria-pressed'),'true');
  await detail.getByRole('button',{name:'Закрыть виджет'}).click();
  await page.locator('.overview-articles summary').filter({hasText:'Аренда'}).click();
  await page.getByText('Офис',{exact:true}).last().waitFor();
  await page.screenshot({path:`${root}/output/playwright/widgets-expanded-${fixture.name}.png`});
  const endBounds = await page.locator('.money-current').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,viewport:innerWidth};});
  assert.ok(endBounds.left>=0&&endBounds.right<=endBounds.viewport,JSON.stringify(endBounds));
  assert.deepEqual(writes.filter(path=>!path.endsWith('/user/layout')),[],'only widget preferences may be written');
  assert.deepEqual(errors,[]);
  console.log(`PASS ${fixture.name}: migration, exact totals, upcoming payment opens correct form, merged cashflow, shared forecast state, article hierarchy; no financial writes`);
  await context.close();
 }
} finally {await browser?.close();await server.close();}
