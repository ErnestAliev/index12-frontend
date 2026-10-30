import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5190, strictPort: true } });
const answer = `Проверил операции за **октябрь 2026**. Остаток — **2 489 876,22 ₸**.\n\n| Расчёт | Сумма, ₸ |\n|:--|--:|\n| Начальный остаток | 162 771,00 |\n| Поступления | +5 195 213,68 |\n| Расходы | −2 868 108,46 |\n| **Остаток в системе** | **2 489 876,22** |\n\nВнутренний расчёт сходится. Требуют сверки:\n\n- **Налоги** — 73 852,46 ₸.\n- **Зарплата** — 224 400 ₸.\n\n[Открыть источник](https://example.com/report). Комментарий: \`проверено\`.\n\n> Наличие записи не подтверждает оплату.\n\n| Длинная таблица | Январь | Февраль | Март | Апрель | Май | Июнь |\n|--|--:|--:|--:|--:|--:|--:|\n| Поступления по договорам | 123 456,78 | 123 456,78 | 123 456,78 | 123 456,78 | 123 456,78 | 123 456,78 |\n\n\`\`\`text\n${'long_value_'.repeat(30)}\n\`\`\``;
const fixtures = [
 { name:'wide-dark', viewport:{width:1440,height:1000}, size:{width:650,height:900} },
 { name:'desktop-dark', viewport:{width:1440,height:1000}, size:{width:440,height:650} },
 { name:'desktop-light', viewport:{width:1440,height:1000}, size:{width:440,height:650}, light:true },
 { name:'narrow-dark', viewport:{width:1024,height:768}, size:{width:320,height:650} },
 { name:'short-dark', viewport:{width:1024,height:768}, size:{width:440,height:320} },
 { name:'mobile-dark', viewport:{width:390,height:844}, mobile:true },
 { name:'mobile-light', viewport:{width:320,height:640}, mobile:true, light:true },
 { name:'mobile-landscape', viewport:{width:844,height:390}, mobile:true },
 { name:'mobile-keyboard', viewport:{width:390,height:844}, mobile:true, keyboard:true },
];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5l8AAAAASUVORK5CYII=','base64');
const files=[{name:'bcc_business_31.10.2026_подробная_выписка_за_месяц_банк.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('xlsx')},{name:'Зарплатная ведомость и расчёт сотрудников.xlsm',mimeType:'application/octet-stream',buffer:Buffer.from('xlsm')},{name:'Счёт на оплату с очень длинным названием.pdf',mimeType:'application/pdf',buffer:Buffer.from('pdf')},{name:'Документ.docx',mimeType:'application/octet-stream',buffer:Buffer.from('docx')},{name:'Фото.png',mimeType:'image/png',buffer:png}];
let browser, page;
try {
 await server.listen();
 browser=await chromium.launch({executablePath:process.env.SCROLL_TEST_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 await mkdir(`${root}/output/playwright`,{recursive:true});
 for(const fixture of fixtures){
  const context=await browser.newContext({viewport:fixture.viewport,isMobile:!!fixture.mobile,hasTouch:!!fixture.mobile,permissions:['clipboard-read','clipboard-write']});
  await context.addInitScript(({size,light})=>{localStorage.setItem('app_data_version','1');localStorage.setItem('theme',light?'light':'dark');if(size)localStorage.setItem('index12-codex-window-size',JSON.stringify(size));window.SpeechRecognition=class{start(){this.onresult?.({results:[[{transcript:'Проверка микрофона'}]]});}stop(){this.onend?.();}};},fixture);
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let mode='normal',uploads=0;
  const history=[{id:'user',role:'user',content:'Проверь остаток по счёту и покажи расчёт.'},{id:'answer',role:'assistant',content:answer}];
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;let data=[];
   if(path.endsWith('/auth/me'))data={_id:'actor',currentWorkspaceId:'workspace',role:'admin',workspaceRole:'admin',createdAt:'2026-01-01'};
   if(path.endsWith('/snapshot'))data={timestamp:new Date().toISOString(),accountBalances:{},companyBalances:{},individualBalances:{},contractorBalances:{}};
   if(path.endsWith('/codex/status'))data={connected:true,configured:true};
   if(path.endsWith('/codex/chats'))data={chats:[{id:'chat',title:'2 490 342,03 — сверка банковской выписки и остатка в INDEX12',threadId:'thread'}]};
   if(path.endsWith('/codex/chats/chat'))data={chat:{id:'chat',threadId:'thread'},cachedHistory:{messages:history}};
   if(path.endsWith('/codex/chats/chat/files')){
    uploads++;if(mode==='error')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Не удалось загрузить файл. Повторите отправку.'})});
    if(mode==='upload')await new Promise(r=>setTimeout(r,600));
    data={file:{fileId:crypto.randomUUID(),name:decodeURIComponent(req.headers()['x-file-name']),size:req.postDataBuffer().length,mimeType:req.headers()['x-file-type']}};
   }
   if(path.endsWith('/codex/chats/chat/jobs')){
    const body=req.postDataJSON();if(body.kind==='history')data={job:{status:'completed',result:{messages:history}}};
    else{history.push({id:'sent-'+uploads,role:'user',content:body.message,attachments:body.attachments},{id:'reply-'+uploads,role:'assistant',content:'**Готово.** Файлы получены.'});data={job:{status:'completed',result:{text:'Готово',threadId:'thread'}}};}
   }
   if(path.includes('/codex/files/'))return route.fulfill({contentType:'application/octet-stream',body:Buffer.from('file')});
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(`http://127.0.0.1:5190/${fixture.mobile?'mobile':''}`);
  await page.evaluate(light => document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark'), !!fixture.light);
  await page.getByRole('button',{name:'Открыть чат Codex'}).click();
  const dialog=page.getByRole('dialog',{name:'Чат Codex'});await dialog.locator('.codex-markdown table').first().waitFor();
  await page.waitForFunction(()=>!document.querySelector('.codex-typing'));
  await dialog.locator('input[type=file]').setInputFiles(files);
  await dialog.locator('.desktop-attachments .codex-file-card').last().waitFor();
  const textarea=dialog.getByRole('textbox');await textarea.fill('Проверь эти файлы.\nСравни суммы и получателей.\nПокажи результат таблицей.');
  await page.waitForFunction(() => !document.querySelector('.codex-send-btn').disabled);
  if (fixture.keyboard) {
   await page.evaluate(() => { Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 360 }); window.visualViewport.dispatchEvent(new Event('resize')); });
   await page.waitForFunction(() => document.querySelector('.codex-chat-window').clientHeight < 360);
  }
  await dialog.locator('.codex-messages').evaluate(el=>{el.scrollTop=0;});
  const geometry=await dialog.evaluate(el=>{
   const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
   const wrapper=el.querySelector('.codex-input-wrapper');const input=el.querySelector('textarea');
   return {panel:rect(el),composer:rect(wrapper),textarea:rect(input),attach:rect(el.querySelector('.codex-attach-btn')),mic:rect(el.querySelector('.codex-mic-btn')),send:rect(el.querySelector('.codex-send-btn')),overflow:el.scrollWidth>el.clientWidth+1,
    cards:[...el.querySelectorAll('.desktop-attachments .codex-file-card')].map(card=>({card:rect(card),name:rect(card.querySelector('.desktop-file-name')),remove:rect(card.querySelector('.codex-file-remove')),padding:getComputedStyle(card.querySelector('.codex-file-remove')).padding})),
    tables:[...el.querySelectorAll('.codex-table-scroll')].map(table=>({rect:rect(table),client:table.clientWidth,scroll:table.scrollWidth})),
    textColor:getComputedStyle(el.querySelector('.codex-markdown')).color,background:getComputedStyle(el.querySelector('.codex-bubble')).backgroundColor};
  });
  assert.equal(geometry.textColor, fixture.light ? 'rgb(36, 36, 36)' : 'rgb(231, 231, 231)', 'theme text color');
  assert.equal(geometry.overflow,false,fixture.name+' panel horizontal overflow');
  assert.ok(geometry.composer.bottom<=geometry.panel.bottom+1,fixture.name+' composer remains inside window');
  if(fixture.mobile && geometry.panel.height > 420) {
   assert.ok(geometry.textarea.bottom<=geometry.attach.y+1,fixture.name+' full-width input stays above controls');
   assert.ok(geometry.textarea.width>geometry.composer.width-24,fixture.name+' mobile input uses available width');
  } else {
   assert.ok(geometry.attach.right<=geometry.textarea.x+1,fixture.name+' paperclip does not overlap input');
   assert.ok(geometry.textarea.right<=geometry.mic.x+1,fixture.name+' input does not overlap microphone');
  }
  if(fixture.keyboard) assert.ok(geometry.panel.bottom<=360, 'composer remains above mobile keyboard');
  assert.ok(geometry.send.right<=geometry.composer.right-3,fixture.name+' send fits');
  for(const c of geometry.cards){assert.ok(c.name.right<=c.remove.x-3,fixture.name+' filename does not overlap remove');assert.equal(c.padding,'0px');assert.ok(c.remove.width<=36&&c.remove.height<=36);}
  assert.ok(geometry.tables.every(t=>t.rect.width<=geometry.panel.width-20),fixture.name+' tables scroll inside message');
  if (geometry.panel.width < 700) assert.ok(geometry.tables.some(t=>t.scroll>t.client),fixture.name+' wide table retains its own scrolling');
  const tray = await dialog.locator('.desktop-attachments').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth, height: el.clientHeight, contentHeight: el.scrollHeight }));
  assert.ok(tray.scroll > tray.client, 'all files remain available through horizontal scrolling');
  assert.ok(tray.contentHeight <= tray.height + 1, 'file cards have no vertical clipping');
  await page.mouse.move(20, 20);
  await page.screenshot({path:`${root}/output/playwright/codex-style-${fixture.name}.png`,animations:'disabled'});
  // Error and upload states retain all files and keep the composer usable.
  if(['desktop-dark','mobile-dark','short-dark','mobile-keyboard'].includes(fixture.name)){
   mode='error';await dialog.getByRole('button',{name:'Отправить',exact:true}).click();await dialog.getByRole('alert').waitFor();
   assert.equal(await dialog.locator('.desktop-attachments .codex-file-card').count(),5);
   const before=await textarea.inputValue();assert.ok(before.includes('Проверь'));
   const errorBounds=await dialog.getByRole('alert').boundingBox(),panelBounds=await dialog.boundingBox(),sendBounds=await dialog.getByRole('button',{name:'Отправить',exact:true}).boundingBox();
   assert.ok(errorBounds.y+errorBounds.height<=sendBounds.y+1,fixture.name+' error does not overlap composer');
   assert.ok(sendBounds.y+sendBounds.height<=panelBounds.y+panelBounds.height,fixture.name+' error keeps send visible '+JSON.stringify({sendBounds,panelBounds}));
   await page.screenshot({path:`${root}/output/playwright/codex-style-${fixture.name}-error.png`});
   mode='upload';await dialog.getByRole('button',{name:'Отправить',exact:true}).click();await dialog.getByText('Загрузка…',{exact:true}).first().waitFor();
   assert.equal(await dialog.locator('.codex-file-remove:disabled').count(),5);
   await page.screenshot({path:`${root}/output/playwright/codex-style-${fixture.name}-upload.png`});
   await page.waitForFunction(()=>!document.querySelector('.codex-typing'));
   assert.equal(await dialog.locator('.desktop-attachments .codex-file-card').count(),0);
  }
  assert.deepEqual(errors,[]);console.log('PASS '+fixture.name+': '+JSON.stringify({width:geometry.panel.width,height:geometry.panel.height,textColor:geometry.textColor}));await context.close();
 }
} catch(error){if(page){await page.screenshot({path:`${root}/output/playwright/codex-style-failure.png`});console.error((await page.locator('.desktop-error').allTextContents()).join(' '));}throw error;}
finally{await browser?.close();await server.close();}
