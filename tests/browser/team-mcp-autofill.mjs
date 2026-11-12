// Exercise the actual generated javascript: bookmarklet on isolated copies of observed form labels.
import {chromium,webkit} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {teamMcpBookmarklet} from '../../src/utils/teamMcpAutofill.js';
const engine=process.argv.includes('--webkit')?'webkit':'chromium';
function fixture({language='ru',existing=false,unknown=false,auth='OAuth',bookmarklet=teamMcpBookmarklet}={}){
 const ru=language==='ru';
 return `<!doctype html><html><head><meta charset="utf-8"></head><body><button aria-haspopup="menu" aria-label="${ru?'Добавить':'Add'}" id="add">+</button><a id="run" href="${bookmarklet}">Run setup helper</a><div id="surface"></div><script>
 window.fixture={submits:0,consents:0,requests:0,name:'',url:'',auth:${JSON.stringify(auth)}};
 window.fetch=()=>{fixture.requests++;throw Error('No helper network requests allowed');};
 window.XMLHttpRequest=function(){fixture.requests++;throw Error('No helper network requests allowed');};
 function openForm(){
  surface.innerHTML='<section role="dialog"><h2>${ru?'Добавить пользовательский сервер MCP':'Add custom MCP server'}</h2><form><label for="n">${unknown?'Unknown field':ru?'Название':'Name'}</label><input id="n" type="text" placeholder="${unknown?'Unknown':ru?'Пользовательский инструмент':'Custom tool'}" value="${existing?'Existing service':''}"><label for="u">${ru?'URL-адрес сервера':'Server URL'}</label><input id="u" type="url" placeholder="https://example.com/mcp"><label id="auth-label">${ru?'Аутентификация':'Authentication'}</label><button type="button" role="combobox" aria-labelledby="auth-label" id="auth">'+fixture.auth+'</button><label><input id="consent" type="checkbox">I understand and want to continue</label><button type="submit" id="create" disabled>Create as a plugin</button></form></section>';
  surface.querySelector('form').onsubmit=e=>{e.preventDefault();fixture.submits++;};
  surface.querySelector('#consent').onchange=()=>{fixture.consents++;surface.querySelector('#create').disabled=false;};
  for(const [id,key]of [['n','name'],['u','url']])surface.querySelector('#'+id).addEventListener('input',e=>fixture[key]=e.target.value);
  surface.querySelector('#auth').onclick=()=>{const menu=document.createElement('div');menu.setAttribute('role','listbox');menu.innerHTML='<button type="button" role="option">OAuth</button>';menu.firstChild.onclick=()=>{fixture.auth='OAuth';surface.querySelector('#auth').textContent='OAuth';menu.remove();};document.body.append(menu);};
 }
 document.querySelector('#add').onclick=()=>{const menu=document.createElement('div');menu.setAttribute('role','menu');menu.innerHTML='<button role="menuitem">${ru?'Добавить пользовательский сервер MCP':'Add custom MCP server'}</button>';menu.firstChild.onclick=()=>{menu.remove();setTimeout(openForm,20);};document.body.append(menu);};
 window.openForm=openForm;
 </script></body></html>`;
}
const browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const {code}=await transform(await readFile(new URL('../../src/utils/teamMcpAutofill.js',import.meta.url),'utf8'),{minify:true,format:'esm',target:'es2022'});
const minified=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
try{
 for(const [build,bookmarklet]of [['source',teamMcpBookmarklet],['minified',minified.teamMcpBookmarklet]])for(const language of ['ru','en'])for(const open of [false,true]){
  const context=await browser.newContext(),page=await context.newPage();context.setDefaultTimeout(10000);
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:fixture({language,bookmarklet,auth:open?'No authentication':'OAuth'})}));
  await page.goto('https://chatgpt.com/plugins');if(open)await page.evaluate(()=>openForm());
  const dialogPromise=page.waitForEvent('dialog'),run=page.locator('#run').click();const alert=await dialogPromise;assert.match(alert.message(),/Поля INDEX12 Team заполнены/);await alert.accept();await run;
  assert.deepEqual(await page.evaluate(()=>fixture),{submits:0,consents:0,requests:0,name:'INDEX12 Team',url:'https://api.index12.com/team-mcp',auth:'OAuth'});
  assert.equal(await page.locator('#consent').isChecked(),false);assert.equal(await page.locator('#create').isDisabled(),true);
  console.log(`PASS ${engine} ${build} ${language} ${open?'open form':'menu navigation'}: bookmarklet fills only name/URL/OAuth; no submission, consent or requests`);await context.close();
 }
 for(const scenario of ['foreign','existing','unknown']){
  const context=await browser.newContext(),page=await context.newPage();context.setDefaultTimeout(10000);
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:fixture({existing:scenario==='existing',unknown:scenario==='unknown'})}));
  await page.goto(scenario==='foreign'?'https://example.test/plugins':'https://chatgpt.com/plugins');if(scenario!=='foreign')await page.evaluate(()=>openForm());
  const dialogPromise=page.waitForEvent('dialog'),run=page.locator('#run').click();const alert=await dialogPromise;assert.match(alert.message(),scenario==='foreign'?/Откройте https:\/\/chatgpt.com\/plugins/:scenario==='existing'?/другое подключение/:/Не удалось найти поля/);await alert.accept();await run;
  const state=await page.evaluate(()=>fixture);assert.equal(state.name,'');assert.equal(state.url,'');assert.equal(state.submits,0);assert.equal(state.consents,0);assert.equal(state.requests,0);
  if(scenario==='existing')assert.equal(await page.locator('#n').inputValue(),'Existing service');
  console.log(`PASS ${engine}: ${scenario} refuses autofill without altering connection or access`);await context.close();
 }
}finally{await browser.close();}
