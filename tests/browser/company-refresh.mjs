import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright-core';
const engine=process.argv.includes('--webkit')?'webkit':'chromium',origin='http://127.0.0.1:5226';
const server=await createServer({root:process.cwd(),envDir:'/private/tmp',server:{host:'127.0.0.1',port:5226,strictPort:true},plugins:[{name:'company-refresh-fixture',configureServer(s){s.middlewares.use('/__refresh',(_q,r)=>{r.setHeader('Content-Type','text/html');r.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><div id="app"></div><script type="module" src="/tests/browser/fixtures/company-refresh.js"></script>')})}}]});
let browser;
try{
 await server.listen();browser=engine==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const width of [390,1280])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<500}),page=await context.newPage(),errors=[];let updates=0,candidates=0;
  let company={_id:'b'.repeat(24),name:'Поставщик',identificationNumber:'040914551559',bankAccounts:[],profileVersion:0,onecSync:{ref:'11111111-1111-4111-8111-111111111111',checkedAt:'2026-11-18T04:00:00Z'}};
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname.includes('/api/')){
    if(url.pathname.endsWith('/onec-candidates'))candidates++;
    if(url.pathname.endsWith('/sync-onec')){
     const input=request.postDataJSON();assert.equal(input.ref,company.onecSync.ref);assert.equal(input.expectedVersion,company.profileVersion);updates++;
     company={...company,profileVersion:company.profileVersion+1,bankAccounts:[{iban:'KZ43722S000046963946',bankName:'Банк 1',bic:'CASPKZKA',currency:'KZT'},{iban:'KZ56601A871040552021',bankName:'Банк 2',bic:'HSBKKZKX',currency:'KZT'}],onecSync:{...company.onecSync,bankAccounts:{checked:true,found:2,loaded:2},missing:['phone'],warnings:[]}};
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({company,sync:company.onecSync})});
   }
   return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(origin+'/__refresh');await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty('--safe-area-bottom','34px')},theme);
  const use=async locator=>{await locator.scrollIntoViewIfNeeded();if(width<500)await locator.tap();else await locator.click()};
  await use(page.getByRole('button',{name:'Обновить данные: Поставщик',exact:true}));
  const dialog=page.getByRole('dialog',{name:'Карточка контрагента',exact:true});
  await dialog.getByText('Реквизиты обновлены · Счетов из 1С: 2',{exact:true}).waitFor();
  assert.equal(await dialog.getByRole('textbox',{name:'ИИК / IBAN 1',exact:true}).inputValue(),'KZ43722S000046963946');
  assert.equal(await dialog.getByRole('textbox',{name:'ИИК / IBAN 2',exact:true}).inputValue(),'KZ56601A871040552021');
  assert.equal(await dialog.getByRole('textbox',{name:'БИК 2',exact:true}).inputValue(),'HSBKKZKX');
  await use(dialog.getByRole('button',{name:'Обновить данные',exact:true}));await page.waitForFunction(()=>document.querySelectorAll('.bank-row').length===2);
  assert.equal(updates,2);assert.equal(candidates,0,'refresh reuses the saved binding');
  await use(dialog.locator('summary'));assert.ok((await dialog.locator('details').innerText()).includes('Телефон'));
  const geometry=await dialog.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,width:innerWidth,scroll:document.documentElement.scrollWidth}});assert.ok(geometry.x>=0&&geometry.right<=geometry.width+1&&geometry.scroll<=geometry.width+1,JSON.stringify(geometry));
  assert.deepEqual(errors,[]);console.log(`PASS ${engine} ${width} ${theme}: selected-party refresh, two complete bank accounts, saved reference and missing-data details`);await context.close();
 }
}finally{await browser?.close();await server.close()}
