// Local synthetic documents and API only; no PDF recognition, 1C or screenshots.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright-core';
const engine=process.argv.includes('--webkit')?'webkit':'chromium',origin='http://127.0.0.1:5246';
const server=await createServer({root:process.cwd(),envDir:'/private/tmp',server:{host:'127.0.0.1',port:5246,strictPort:true}});let browser;
try{
 await server.listen();browser=await(engine==='webkit'?webkit.launch():chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
 for(const width of [320,390,1280])for(const theme of ['dark','light']){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:900},hasTouch:mobile});
  await context.addInitScript(({mobile,theme})=>{window.fixtureMobile=mobile;localStorage.setItem('theme',theme);window.copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.failCopy){window.failCopy=false;throw Error('clipboard denied');}window.copies.push(text);}}});},{mobile,theme});
  const page=await context.newPage(),errors=[],edits=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));let failNext=false;
  const message={id:'extracted',role:'assistant',documentFileId:'source-pdf',contentVersion:0,corrections:[],content:'Счёт №34\n\n| Поле | Данные |\n|---|---|\n| ИИН | 040914551559 |\n| Договор | |\n| НДС | Без НДС |\n| Банк | АО Народный банк |\n| IBAN | KZ56601A871040552021 |\n\nТекст после таблицы.\n\n| Услуга | Количество | НДС |\n|---|---|---|\n| Дератизация | 1 | |'};
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;if(!path.startsWith('/api/'))return url.origin===origin?route.continue():route.abort();let data={};
   if(path==='/api/codex/status')data={connected:true,configured:true,provider:'cloud'};
   if(path==='/api/codex/chats')data={chats:[{id:'chat',title:'Документ'}]};
   if(path==='/api/codex/chats/chat')data={chat:{id:'chat'},cachedHistory:{messages:[message]}};
   if(path.endsWith('/jobs'))data={job:{status:'completed',result:{messages:[message]}}};
   if(path.endsWith('/fields')){
    if(failNext){failNext=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Сеть недоступна'})});}
    const body=req.postDataJSON();assert.equal(body.contentVersion,message.contentVersion);edits.push(body);message.corrections.push({kind:'field',tableIndex:body.tableIndex,rowIndex:body.rowIndex,columnIndex:body.columnIndex,replacement:body.value});message.contentVersion++;data={message};
   }
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(origin+'/tests/browser/fixtures/fragments-codex.html');await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
  const table=page.getByRole('table',{name:'Реквизиты документа'}).first();await table.waitFor();assert.equal(await table.locator('thead th').count(),3);assert.equal(await table.getByRole('textbox',{name:'ИИН',exact:true}).inputValue(),'040914551559');
  const contract=table.getByRole('textbox',{name:'Договор',exact:true});if(mobile)await contract.tap();else await contract.click();assert.equal(await contract.evaluate(el=>getComputedStyle(el).outlineWidth),'0px');await contract.fill('Без договора');await contract.press('Enter');await page.waitForFunction(()=>document.querySelector('.document-field-copy')&&!document.querySelector('.codex-composer textarea')?.readOnly);await page.waitForFunction(()=>document.querySelector('.document-fields textarea[aria-label="Договор"]')?.value==='Без договора'&&!document.querySelector('.document-fields textarea[aria-label="Договор"]').readOnly);
  assert.equal(edits[0].value,'Без договора');
  const copy=table.getByRole('button',{name:'Копировать Договор',exact:true});if(mobile)await copy.tap();else await copy.click();assert.equal(await page.evaluate(()=>window.copies.at(-1)),'Без договора');
  await page.evaluate(()=>{window.failCopy=true;});const copiedEdits=edits.length;await copy.click();await page.getByRole('alert').filter({hasText:'Не удалось скопировать'}).waitFor();await page.getByRole('button',{name:'Повторить',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.document-field-error'));assert.equal(await page.evaluate(()=>window.copies.at(-1)),'Без договора');assert.equal(edits.length,copiedEdits);
  const vat=table.getByRole('textbox',{name:'НДС',exact:true});await vat.fill('');await vat.press('Enter');await page.waitForFunction(()=>!document.querySelector('.document-fields textarea[aria-label="НДС"]').readOnly);assert.equal(edits.at(-1).value,'');
  await vat.fill('cancelled');await vat.press('Escape');assert.equal(await vat.inputValue(),'');
  failNext=true;const bank=table.getByRole('textbox',{name:'Банк',exact:true});await bank.fill('Новый банк');await bank.press('Enter');await page.getByRole('alert').filter({hasText:'Сеть недоступна'}).waitFor();assert.equal(await bank.inputValue(),'Новый банк');await page.getByRole('button',{name:'Повторить',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.document-field-error'));assert.equal(edits.at(-1).value,'Новый банк');
  const itemVat=page.getByRole('textbox',{name:'Строка 1 — НДС',exact:true});await itemVat.fill('Без НДС');await itemVat.press('Enter');await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="Строка 1 — НДС"]').readOnly);assert.equal(edits.at(-1).columnIndex,2);
  const geometry=await table.evaluate(el=>{const r=el.getBoundingClientRect();return {right:r.right,width:innerWidth,overflow:el.scrollWidth>el.clientWidth+1,rows:[...el.querySelectorAll('textarea')].map(t=>({scroll:t.scrollWidth,client:t.clientWidth,height:t.clientHeight,scrollHeight:t.scrollHeight}))};});assert.ok(geometry.right<=geometry.width+1,JSON.stringify(geometry));assert.equal(geometry.overflow,false);assert.ok(geometry.rows.every(r=>r.scroll<=r.client+1&&r.scrollHeight<=r.height+1),JSON.stringify(geometry));
  await page.reload();await page.getByRole('table',{name:'Реквизиты документа'}).first().waitFor();assert.equal(await page.getByRole('textbox',{name:'Договор',exact:true}).inputValue(),'Без договора');assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS '+engine+': editable empty fields, exact row copy, leading zeros, autosave/reload, escape, failed-save recovery, 320/390/1280 and both themes');
}finally{await browser?.close();await server.close();}
