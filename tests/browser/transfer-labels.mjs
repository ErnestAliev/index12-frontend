// The actual desktop/mobile charts, using an isolated API fixture.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const server = await createServer({ root:fileURLToPath(new URL('../../',import.meta.url)),server:{ host:'127.0.0.1',port:5189,strictPort:true } });
const date = new Date(); date.setHours(12,0,0,0);
const dateKey = `${date.getFullYear()}-${Math.round((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())-Date.UTC(date.getFullYear(),0,1))/86400000)+1}`;
const accountData = [{ _id:'cash',name:'Касса Пушкина',companyId:'uu',initialBalance:157218 },{ _id:'kaspi',name:'Kaspi Gold Шерхан',individualId:'person',initialBalance:0 }];
const routeText = 'Касса Пушкина (TOO UU) → Kaspi Gold Шерхан (Шерхан)';
const transfer = { _id:'transfer',type:'transfer',isTransfer:true,amount:100000,fromAccountId:'cash',toAccountId:'kaspi',fromCompanyId:'uu',toIndividualId:'person',date:date.toISOString(),dateKey,cellIndex:0 };
const out = 'output/playwright';
let browser;
try {
 await server.listen();
 browser = await chromium.launch({ executablePath:process.env.SCROLL_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
 for (const mobile of [false,true]) {
  const context = await browser.newContext({ viewport:mobile ? {width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile,permissions:['clipboard-read','clipboard-write'],...(mobile ? {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{}) });
  await context.addInitScript(()=>localStorage.setItem('app_data_version','1'));
  const page = await context.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if (!['127.0.0.1','localhost'].includes(url.hostname)) return route.abort();
   if (!url.pathname.includes('/api/')) return route.continue();
   let data=[];
   if (url.pathname.endsWith('/auth/me')) data={_id:'label-user',workspaceRole:'admin',role:'admin',createdAt:'2026-01-01'};
   if (url.pathname.endsWith('/accounts')) data=accountData;
   if (url.pathname.endsWith('/companies')) data=[{_id:'uu',name:'TOO UU'}];
   if (url.pathname.endsWith('/individuals')) data=[{_id:'person',name:'Шерхан'}];
   if (url.pathname.endsWith('/events')) data=[transfer];
   if (url.pathname.endsWith('/snapshot')) data={ timestamp:date.toISOString(),accountBalances:{cash:57218,kaspi:100000},companyBalances:{uu:57218},individualBalances:{person:100000},contractorBalances:{} };
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(server.resolvedUrls.local[0]+(mobile?'mobile':''));
  await page.waitForSelector(mobile ? '.mobile-cell .op-chip.transfer' : '.operation-chip.transfer');
  await page.waitForFunction(()=>!document.querySelector('.section-loading-overlay'));
  await page.waitForTimeout(700);
  const chip=page.locator(mobile ? '.mobile-cell .op-chip.transfer' : '.operation-chip.transfer').first();
  assert.ok((await chip.innerText()).includes(routeText),'chip identifies the full route');
  const point = await page.evaluate(async()=>{
   const { Chart }=await import('/node_modules/.vite/deps/chart__js_auto.js');
   const canvas=[...document.querySelectorAll('canvas')].find(c=>Chart.getChart(c)?.data.datasets.some(d=>d.label?.includes('Баланс')));
   const chart=Chart.getChart(canvas); const rect=canvas.getBoundingClientRect();
   const today=new Date(); const start=new Date(today.getFullYear(),0,0);const key=`${today.getFullYear()}-${Math.floor((new Date(today.getFullYear(),today.getMonth(),today.getDate())-start)/86400000)}`;
   const labels=chart.data.labels;const dayLabel=today.toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short',year:'numeric'});let index=labels.findIndex(l=>String(l)===dayLabel);
   if(index<0) index=labels.findIndex(l=>new Date(l).getDate()===today.getDate());
   if(index<0) index=labels.findIndex(l=>Number(l)===today.getDate());
   if(index<0) throw Error('Cannot locate today bar: '+JSON.stringify(labels));
   const bar=chart.getDatasetMeta(0).data[index];return {x:rect.x+bar.x,y:rect.y+(bar.y+bar.base)/2};
  });
  if(mobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.move(point.x,point.y);
  const tooltip=page.locator('div[id^="chartjs-custom-tooltip-"]').filter({hasText:routeText}).first();
  await tooltip.waitFor({state:'visible'});
  assert.ok((await tooltip.innerText()).includes(routeText));
  await page.waitForFunction(id=>Number(getComputedStyle(document.getElementById(id)).opacity)>=0.99,await tooltip.getAttribute('id'));
  const routeGeometry=await tooltip.locator('.tt-transfer-route').evaluate(el=>({whiteSpace:getComputedStyle(el).whiteSpace,fits:el.scrollWidth<=el.clientWidth+1}));
  assert.equal(routeGeometry.whiteSpace,'normal');assert.ok(routeGeometry.fits,'the complete route wraps inside the tooltip');
  await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/transfer-labels-${mobile?'mobile':'desktop'}.png`});
  if(!mobile) {
   await tooltip.locator('#chartjs-tooltip-copy-btn').click();
   assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).includes(routeText),'copied tooltip has the complete route');
   const downloadPromise=page.waitForEvent('download');await tooltip.locator('#chartjs-tooltip-export-btn').click();
   const download=await downloadPromise;assert.ok((await readFile(await download.path(),'utf8')).includes(routeText),'export matches tooltip');
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${mobile?'mobile tap':'desktop hover, copy, export'}: ${routeText}`);
  await context.close();
 }
}finally{if(browser)await browser.close();await server.close();}
