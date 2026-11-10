import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright-core';
const engine=process.argv.includes('--webkit')?'webkit':'chromium', server=await createServer({root:process.cwd(),envDir:'/private/tmp',server:{host:'127.0.0.1',port:5223,strictPort:true}});
let browser;
try{
 await server.listen();browser=engine==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const mobile of [false,true])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile,isMobile:mobile});context.setDefaultTimeout(10000);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:5223/tests/browser/fixtures/counterparty-search.html');await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  const activate=target=>mobile?target.tap():target.click();
  for(const kind of ['income','expense']){
   await page.evaluate(kind=>window.partyFixture.kind.value=kind,kind);
   await activate(page.locator('.select-trigger').filter({has:page.getByText(kind==='income'?'Куда (Счет)':'Счет списания',{exact:true})}));
   await activate(page.getByRole('option',{name:/Счёт Основной Бурабай/}));
   await activate(page.locator('.select-trigger').filter({hasText:/^(Проект|Без проекта|Все проекты|Тестовый проект)$/}));
   await activate(page.getByRole('option',{name:'Тестовый проект',exact:true}));
   await activate(page.locator('.selected-text').filter({hasText:'Тестовый проект'}));
   assert.equal(await page.locator('.selected-text').filter({hasText:'Тестовый проект'}).count(),1);
   const input=page.getByRole('combobox' ,{name:kind==='income'?'От кого':'Кому (Контрагент)',exact:true});
   await activate(input);assert.ok(await input.evaluate(node=>document.activeElement===node));
   assert.equal(await input.evaluate(node=>getComputedStyle(node).outlineWidth),'0px');
   const field=page.locator('.base-select').filter({has:input});
   assert.equal(await field.getByRole('option').count(),353);
   await input.fill('бурабай 349');assert.equal(await field.getByRole('option').count(),1);
   await activate(field.getByRole('option',{name:'ИП Компания 349 Бурабай',exact:true}));assert.equal(await input.inputValue(),'ИП Компания 349 Бурабай');assert.equal(await page.locator('.base-select .small-label:visible').count(),0,'selected operation fields have no miniature titles');
   await activate(input);await input.fill('своя');await field.getByRole('option',{name:'ТОО Своя компания',exact:true}).first().waitFor();
   await input.fill('ИП комп 348');await input.press('ArrowDown');await input.press('Enter');assert.equal(await input.inputValue(),'ИП Компания 348 Бурабай');
   await activate(input);await input.fill('нет совпадений');await field.getByRole('status').waitFor();await input.press('Escape');assert.equal(await input.inputValue(),'ИП Компания 348 Бурабай');
  }
  await page.evaluate(()=>window.partyFixture.kind.value='transfer');
  const from=page.getByRole('combobox',{name:'Со счета',exact:true});await activate(from);await from.fill('Основной Бур');await activate(page.getByRole('option',{name:/Счёт Основной Бурабай/}));assert.equal(await from.inputValue(),'Счёт Основной Бурабай');assert.equal(await page.locator('.base-select .small-label:visible').count(),0);
  await activate(page.getByRole('button',{name:'Вывод из системы',exact:true}));
  const recipient=page.getByRole('combobox',{name:'Получатель средств',exact:true});await activate(recipient);await recipient.fill('Бурабай 349');await activate(page.getByRole('option',{name:'ИП Компания 349 Бурабай',exact:true}));assert.equal(await recipient.inputValue(),'ИП Компания 349 Бурабай');
  await activate(recipient);await recipient.fill('Новый получатель');await recipient.press('Tab');assert.equal(await recipient.inputValue(),'Новый получатель');
  assert.deepEqual(errors,[]);console.log(`PASS ${engine} ${mobile?'touch':'mouse'} ${theme}: immediate search focus, all 350+ rows, middle-word search, exact selection, keyboard/Escape and transfer account search`);await context.close();
 }
}finally{await browser?.close();await server.close();}
