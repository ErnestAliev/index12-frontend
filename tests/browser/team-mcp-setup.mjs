import {createServer} from 'vite';
import {chromium,webkit} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {teamMcpAutofillSource,teamMcpBookmarklet} from '../../src/utils/teamMcpAutofill.js';
const engine=process.argv.includes('--webkit')?'webkit':'chromium';
const server=await createServer({root:process.cwd(),envDir:'/private/tmp',cacheDir:'/private/tmp/index12-mcp-setup-vite',server:{host:'127.0.0.1',port:5218,strictPort:true}});
let browser;
try{
 await server.listen();browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const theme of ['light','dark'])for(const width of [320,390,834,1280]){
  const touch=width<1000,context=await browser.newContext({viewport:{width,height:900},isMobile:touch,hasTouch:touch});context.setDefaultTimeout(10000);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Isolated ChatGPT link fixture</title>'}));
  await page.goto('http://127.0.0.1:5218/tests/browser/fixtures/team-mcp-setup.html');
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;for(const[side,value]of Object.entries({top:24,bottom:34,left:16,right:16}))document.documentElement.style.setProperty('--safe-area-'+side,value+'px');},theme);
  const activate=locator=>touch?locator.tap():locator.click();
  const setup=page.locator('.mcp-setup');await setup.waitFor();
  assert.equal(await setup.getByRole('textbox',{name:'Адрес сервера MCP',exact:true}).inputValue(),'https://api.index12.com/team-mcp');
  assert.match(await setup.innerText(),/Safari или Chrome/);assert.match(await setup.innerText(),/Создать в виде плагина/);assert.match(await setup.innerText(),/OAuth/);
  const opener=setup.getByRole('link',{name:'Скопировать и открыть ChatGPT',exact:true});
  assert.equal(await opener.getAttribute('href'),'https://chatgpt.com/plugins');assert.equal(await opener.getAttribute('target'),'_blank');
  if(engine==='webkit'){
   // This WebKit harness suppresses even plain anchor popups. Check the synchronous API call;
   // Chromium below verifies the actual new page. No real ChatGPT login is performed.
   await page.evaluate(()=>{window.setupOpened=[];window.open=(...args)=>{window.setupOpened.push(args);return null;};});
   await activate(opener);assert.deepEqual(await page.evaluate(()=>window.setupOpened),[['https://chatgpt.com/plugins','_blank','noopener,noreferrer']]);
  }else{
   const[popup]=await Promise.all([context.waitForEvent('page'),activate(opener)]);
   await popup.waitForLoadState();assert.equal(popup.url(),'https://chatgpt.com/plugins');await popup.close();await page.bringToFront();
  }
  assert.equal(await page.evaluate(()=>window.setupCopies.at(-1)),'https://api.index12.com/team-mcp');
  await page.evaluate(()=>window.setupCopyFails=true);await activate(setup.getByRole('button',{name:'Скопировать адрес MCP',exact:true}));
  assert.match(await setup.getByRole('alert').innerText(),/вручную/);assert.equal(await setup.getByRole('textbox').evaluate(el=>el.selectionEnd-el.selectionStart),'https://api.index12.com/team-mcp'.length);
  await page.evaluate(()=>window.setupCopyFails=false);await activate(setup.getByRole('button',{name:'Автозаполнение',exact:true}));
  const bookmark=setup.getByRole('link',{name:'Автозаполнение INDEX12',exact:true});assert.equal(await bookmark.getAttribute('href'),teamMcpBookmarklet);assert.equal(await bookmark.getAttribute('draggable'),'true');
  assert.match(await setup.innerText(),/На телефоне выберите ручную/);
  await activate(setup.locator('.setup-code summary'));const[download]=await Promise.all([page.waitForEvent('download'),activate(setup.getByRole('button',{name:'Скачать скрипт',exact:true}))]);
  assert.equal(download.suggestedFilename(),'index12-chatgpt-setup.js');assert.equal(await readFile(await download.path(),'utf8'),teamMcpAutofillSource);
  const bounds=await setup.evaluate(el=>({scroll:document.documentElement.scrollWidth,width:innerWidth,buttons:[...el.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().height)}));
  assert.ok(bounds.scroll<=width&&bounds.buttons.every(height=>height>=44),JSON.stringify(bounds));
  await page.evaluate(()=>window.setupFixture.publish());await page.locator('.mcp-install').waitFor();assert.equal(await page.locator('.mcp-install').getAttribute('href'),'https://chatgpt.com/plugins/plugin_fixture');
  assert.equal(await page.locator('.mcp-setup:visible').count(),0,'published plugin uses the direct install link');
  await activate(page.locator('.mcp-manual > summary'));await page.locator('.mcp-setup:visible').waitFor();
  assert.deepEqual(await page.evaluate(()=>window.setupWrites),[],'setup instructions must not create grants or post messages');assert.deepEqual(errors,[]);
  console.log(`PASS ${engine} ${theme} ${width}: manual copy/open, clipboard denial, bookmarklet/download, published link, safe-area bounds`);await context.close();
 }
}finally{await browser?.close();await server.close();}
