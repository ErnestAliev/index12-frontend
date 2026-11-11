// Local, synthetic transports only. No screenshots, real downloads or production writes.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const origin = 'http://127.0.0.1:5221';
const server = await createServer({root: process.cwd(), envDir: '/private/tmp', server: {host: '127.0.0.1', port: 5221, strictPort: true}, plugins: [{name: 'chat-transfer-fixture', configureServer(s) {s.middlewares.use('/__chat-transfer', (_req,res) => { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="app"></div><script type="module" src="/tests/browser/fixtures/chat-transfer.js"></script>'); }); }}]});
let browser;
try {
  await server.listen();
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for (const theme of ['dark', 'light']) for (const touch of [false, true]) {
    const context = await browser.newContext({viewport:{width:1280,height:900}, hasTouch:touch});
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors=[], sent=[], uploads=[], reads=[];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const req=route.request(), url=new URL(req.url()), path=url.pathname;
      if (!path.startsWith('/api/')) return url.origin===origin ? route.continue() : route.abort();
      let data={};
      if (path==='/api/codex/status') data={connected:true,configured:true};
      if (path==='/api/codex/chats') data={chats:[{id:'chat',title:'Тест',threadId:'thread'}]};
      const history={messages:[{id:'answer',role:'assistant',content:'Документ',attachments:[{fileId:'55555555-5555-4555-8555-555555555555',name:'Отчет.txt',mimeType:'text/plain',size:13}]}]};
      if (path==='/api/codex/chats/chat') data={chat:{id:'chat',threadId:'thread'},cachedHistory:history};
      if (path.endsWith('/jobs')) {
        const body=req.postDataJSON();
        if(body.kind==='send') sent.push(body);
        data={job:{status:'completed',result:body.kind==='history'?history:{text:'Готово',threadId:'thread'}}};
      }
      if (req.method()==='GET' && /\/files\/[a-f\d-]{36}$/.test(path)) {
        reads.push(path);
        return route.fulfill({status:200,contentType:'text/plain',body:path.includes('/codex/')?'CODEX ORIGINAL':'TEAM ORIGINAL'});
      }
      if(req.method()==='POST' && (path==='/api/team-chat/files' || path==='/api/codex/chats/chat/files')) {
        uploads.push({path,bytes:req.postDataBuffer()?.toString(),name:decodeURIComponent(req.headers()['x-file-name']), fileId:crypto.randomUUID()});
        data={file:{fileId:uploads.at(-1).fileId,name:uploads.at(-1).name,mimeType:'text/plain',size:13}};
      }
      if(path==='/api/team-chat/messages' && req.method()==='GET') data={messages:[],hasMore:false};
      if(path==='/api/team-chat/task-options') data={projects:[],parties:[]};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(origin+'/__chat-transfer');
    await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
    await page.waitForFunction(()=>document.querySelector('.desktop-chat-picker select')?.value==='chat' && !document.querySelector('.desktop-chat-picker select').disabled);
    const codex=page.locator('.desktop-assistant'), work=page.locator('.team-chat-conversation');
    const drag=async (source,target) => {
      if(!touch) return source.dragTo(target);
      // Safari/iPad transfer events, followed by real touch activation below.
      const dt=await page.evaluateHandle(()=>new DataTransfer());
      await source.dispatchEvent('dragstart',{dataTransfer:dt});
      await target.dispatchEvent('dragenter',{dataTransfer:dt});
      await target.dispatchEvent('drop',{dataTransfer:dt});
      await source.dispatchEvent('dragend',{dataTransfer:dt});
      await dt.dispose();
    };
    await codex.locator('textarea').fill('Проверь документ');
    await drag(work.locator('.team-file'),codex.locator('textarea'));
    await codex.locator('.desktop-attachments .codex-file-card').waitFor();
    assert.equal(await codex.locator('textarea').inputValue(),'Проверь документ');
    assert.equal(sent.length,0);
    assert.equal(reads.filter(p=>p.includes('/team-chat/')).length,1);
    assert.equal(await work.locator('.team-file').count(),1);
    const remove=codex.getByRole('button',{name:'Убрать Договор.txt',exact:true});
    if(touch) await remove.tap(); else await remove.click();
    assert.equal(await codex.locator('.desktop-attachments .codex-file-card').count(),0);
    await work.locator('textarea').fill('Пересылаю');
    await drag(codex.locator('.codex-messages .codex-file-card'),work.locator('textarea'));
    await work.getByRole('button',{name:/Убрать файл/}).waitFor();
    assert.equal(await work.locator('textarea').inputValue(),'Пересылаю');
    assert.equal(uploads.length,1);
    assert.equal(uploads[0].path,'/api/team-chat/files');
    if(uploads[0].bytes) assert.equal(uploads[0].bytes,'CODEX ORIGINAL');
    // Original task reference, no stale task text substituted into the model message.
    await drag(work.locator('.task-cover'),codex.locator('textarea'));
    const reference=codex.locator('.desktop-task-reference');
    await reference.waitFor();
    const url=new URL(await reference.locator('a').getAttribute('href'));
    assert.equal(url.searchParams.get('task'),'22222222-2222-4222-8222-222222222222');
    assert.equal(url.searchParams.get('teamChat'),'aaaaaaaaaaaaaaaaaaaaaaaa');
    // Removing and re-adding a task works with a fresh drag; duplicate drops stay one chip.
    if(touch) await reference.getByRole('button').tap(); else await reference.getByRole('button').click();
    await drag(work.locator('.task-cover'),codex.locator('textarea'));
    await drag(work.locator('.task-cover'),codex.locator('textarea'));
    assert.equal(await reference.count(),1);
    assert.equal(sent.length,0);
    await drag(work.locator('.team-file'),codex.locator('textarea'));
    await codex.locator('.desktop-attachments .codex-file-card').waitFor();
    await codex.getByRole('button',{name:'Отправить',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.desktop-chat-picker select')?.disabled);
    assert.equal(sent.length,1);
    assert.ok(sent[0].message.startsWith('Проверь документ'));
    assert.ok(!sent[0].message.includes('Оформи счета по прикреплённым задачам'));
    assert.ok(sent[0].message.includes(url.href));
    assert.equal(new URL(sent[0].message.trim().split('\n').at(-1)).searchParams.get('task'),'22222222-2222-4222-8222-222222222222');
    assert.ok(!sent[0].message.includes('Прочитать договор'));
    assert.equal(uploads.length,2);
    assert.equal(uploads[1].path,'/api/codex/chats/chat/files');
    if(uploads[1].bytes) assert.equal(uploads[1].bytes,'TEAM ORIGINAL');
    assert.equal(sent[0].attachments.length,1);
    assert.equal(sent[0].attachments[0].fileId, uploads[1].fileId);
    assert.equal(sent[0].attachments[0].name,'Договор.txt');
    assert.equal(reads.filter(p=>p.includes('/codex/')).length,1);
    // An empty draft plus a task requests ordinary task reading and explicit command routing only when Send is pressed.
    await codex.locator('textarea').fill('');
    await drag(work.locator('.task-cover'),codex.locator('textarea'));
    await reference.waitFor();
    assert.equal(sent.length,1);
    const send = codex.getByRole('button',{name:'Отправить',exact:true});
    if(touch) await send.tap(); else await send.click();
    await page.waitForFunction(()=>!document.querySelector('.desktop-chat-picker select')?.disabled);
    assert.equal(sent.length,2);
    assert.ok(sent[1].message.startsWith('Разберись с прикреплёнными задачами:'));
    assert.ok(sent[1].message.includes('Остальные задачи рассматривай как обычные'));
    assert.equal(sent[1].message.trim().split('\n').at(-1),url.href);
    assert.ok(!sent[1].message.includes('Прочитать договор'));
    assert.deepEqual(errors,[]);
    console.log(`PASS ${engine} ${theme} ${touch?'touch':'mouse'}: exact file bytes in both directions, preserved drafts, no auto-send, original task link and removable references`);
    await context.close();
  }
} finally {await browser?.close(); await server.close();}
