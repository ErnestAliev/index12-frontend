// Theme editor controls are checked against rendered desktop, tablet and phone elements.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import {createAppearanceAPI} from './appearance-api.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({ root, server: { host:'127.0.0.1', port:5193, strictPort:true } });
const date = new Date();
const dateKey = `${date.getFullYear()}-${Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate())-new Date(date.getFullYear(),0,0))/86400000)}`;
const operations = [
  {_id:'income',type:'income',accountId:'cash'},
  {_id:'expense',type:'expense',accountId:'cash'},
  {_id:'transfer',type:'transfer',isTransfer:true,fromAccountId:'cash',toAccountId:'bank'},
  {_id:'withdrawal',type:'expense',accountId:'cash',isWithdrawal:true,destination:'Личная карта'},
].map((op,index)=>({...op,amount:1000+index,companyId:'owner',categoryId:'rent',date:date.toISOString(),dateKey,cellIndex:index}));
const types = {income:['Поступление','.income:not(.work-act)'],expense:['Расход','.expense'],transfer:['Перевод','.transfer'],withdrawal:['Вывод средств','.withdrawal']};
let browser;
try {
  await server.listen();
  browser=await chromium.launch({executablePath:process.env.SCROLL_TEST_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  await mkdir(`${root}/output/playwright`,{recursive:true});
  for(const fixture of [{name:'desktop',width:1512,height:982},{name:'tablet',width:834,height:1194,touch:true},{name:'phone',width:390,height:844,touch:true,mobile:true}]) {
    const context=await browser.newContext({viewport:{width:fixture.width,height:fixture.height},isMobile:!!fixture.mobile,hasTouch:!!fixture.touch,
      userAgent:fixture.mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':fixture.touch?'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1':undefined});
    await context.addInitScript(()=>{localStorage.setItem('app_data_version','1');localStorage.setItem('theme','light');localStorage.setItem('accountVisibilityMode','all');});
    const page=await context.newPage(), errors=[],writes=[],api=createAppearanceAPI();
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',async route=>{
      const req=route.request(),path=new URL(req.url()).pathname;let data=[];
      if(await api.handle(route,'controls-user'))return;
      if(req.method()!=='GET')writes.push(path);
      if(path.endsWith('/user/appearance-themes'))data={themes:[]};
      if(path.endsWith('/auth/me'))data={_id:'controls-user',role:'admin',workspaceRole:'admin',createdAt:'2026-01-01'};
      if(path.endsWith('/accounts'))data=[{_id:'cash',name:'Тестовый счёт',companyId:'owner',initialBalance:100000},{_id:'bank',name:'Банк',companyId:'owner',initialBalance:0}];
      if(path.endsWith('/companies'))data=[{_id:'owner',name:'Владелец'}];
      if(path.endsWith('/categories'))data=[{_id:'rent',name:'Аренда'}];
      if(path.endsWith('/events'))data=operations;
      if(path.endsWith('/snapshot'))data={timestamp:date.toISOString(),accountBalances:{cash:100000,bank:0},companyBalances:{owner:100000},individualBalances:{},contractorBalances:{}};
      await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(`http://127.0.0.1:5193/${fixture.mobile?'mobile':''}`);
    const prefix=fixture.mobile?'.op-chip':'.operation-chip';
    await page.locator(`${prefix}.income`).first().waitFor();
    const open=async()=>{
      if(fixture.mobile){await page.getByTitle('Профиль',{exact:true}).click();await page.getByRole('button',{name:'Настройки',exact:true}).click();}
      else await page.getByRole('button',{name:'Настройки оформления',exact:true}).click();
    };
    await open();
    const panel=page.getByRole('dialog',{name:'Настройки оформления',exact:true});
    const scope=async label=>{if(['Таблица','Операции'].includes(label)){await panel.getByRole('button',{name:'Таблица',exact:true}).click();await panel.getByLabel('Часть таблицы',{exact:true}).selectOption(label==='Операции'?'operations':'table');}else await panel.getByRole('button',{name:label,exact:true}).click();};
    const color=(label,value)=>panel.getByLabel(label,{exact:true}).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
    const slider=(label,value)=>panel.getByRole('slider',{name:label,exact:true}).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
    const geometry=()=>page.locator('.home-right-panel .icon-btn, .header-dashboard .action-square-btn, .mobile-layout .fixed-footer button').evaluateAll(nodes=>nodes.filter(el=>el.getBoundingClientRect().width).map(el=>{
      const r=el.getBoundingClientRect(),s=el.querySelector('svg')?.getBoundingClientRect();return [r.width,r.height,s?.width,s?.height].map(n=>n==null?null:Math.round(n*100)/100);
    }));
    const lightGeometry=await geometry();
    for(const mode of ['light','dark']){
      await panel.getByRole('button',{name:mode==='light'?'Светлая':'Тёмная',exact:true}).click();
      assert.deepEqual(await geometry(),lightGeometry,`${fixture.name}: theme cannot resize controls or icons`);
      await panel.getByRole('button',{name:'Спокойная',exact:true}).click();
      assert.ok(!(await panel.innerText()).includes('Предоплата')&&!(await panel.innerText()).includes('Кредит'));
      const text=mode==='light'?'#17395b':'#dfeeff';
      for(const [type,[label,selector]] of Object.entries(types)){
        await color(`Цвета операций: ${{income:'Доходы',expense:'Расходы',transfer:'Переводы',withdrawal:'Вывод средств'}[type]}`,text);
        const rgb=hex=>'rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';
        await page.waitForFunction(({selector,text})=>getComputedStyle(document.querySelector(selector+' .op-amount,'+selector+' .amt')).color===text,{selector:prefix+selector,text:rgb(text)});
        const style=await page.locator(prefix+selector).first().evaluate(el=>{const s=getComputedStyle(el),amount=el.querySelector('.op-amount,.amt'),meta=el.querySelector('.op-meta,.desc');return {text:getComputedStyle(amount).color,meta:getComputedStyle(meta).color,border:s.borderTopColor,left:s.borderLeftColor};});
        assert.equal(style.text,rgb(text));assert.equal(style.meta,rgb(text));assert.equal(style.border,style.left);
      }
      await scope('Операции');
      await slider('Операции: Непрозрачность фона',25);
      await page.waitForFunction(selector=>getComputedStyle(document.querySelector(selector)).backgroundColor.endsWith(', 0.25)'),`${prefix}.income`);
      const translucent=await page.locator(`${prefix}.income`).first().evaluate(el=>({bg:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el).opacity}));
      assert.ok(translucent.bg.endsWith(', 0.25)'));
      assert.equal(translucent.opacity,'1');
      await scope('Таблица');
      await color('Таблица: Цвет активного дня','#ff0000');
      const details=panel.locator('details').filter({has:page.locator('summary').filter({hasText:'Заливки и размеры'})});
      if(await details.evaluate(el=>!el.open))await details.locator('summary').click();
      await slider('Таблица: Непрозрачность активного дня',20);
      const cells=page.locator(fixture.mobile?'.mobile-day-col.today .mobile-cell':'.day-column.today .hour-cell');
      const cellStyles=await cells.evaluateAll(nodes=>nodes.slice(0,2).map(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,overlay:s.backgroundImage,border:s.borderBottomWidth,opacity:s.opacity};}));
      assert.notEqual(cellStyles[0].bg,cellStyles[1].bg,'today keeps alternating cell backgrounds');
      assert.ok(cellStyles.every(s=>s.overlay.includes('rgba(255, 0, 0, 0.2)')&&s.border==='1px'&&s.opacity==='1'));
      await slider('Таблица: Непрозрачность активного дня',0);
      assert.ok((await cells.first().evaluate(el=>getComputedStyle(el).backgroundImage)).includes('rgba(255, 0, 0, 0)'));
      await slider('Таблица: Непрозрачность активного дня',20);
      await scope('Виджеты');
      const radius=mode==='light'?12:18;
      await panel.getByLabel('Часть виджета',{exact:true}).selectOption('card');
      await slider('Виджеты: Карточка: Скругление виджетов',radius);
      const cards=page.locator(fixture.mobile?'.mobile-totals-wrapper .total-card':'.header-dashboard .dashboard-card-wrapper');
      assert.ok((await cards.evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).borderRadius))).every(value=>value===`${radius}px`));
      if(fixture.mobile){
        await page.evaluate(async()=>{const {useMainStore}=await import('/src/stores/mainStore.js');useMainStore().isHeaderExpanded=true;});
        assert.equal(await page.locator('.mobile-widget-card').first().evaluate(el=>getComputedStyle(el).borderRadius),`${radius}px`);
        await page.evaluate(async()=>{const {useMainStore}=await import('/src/stores/mainStore.js');useMainStore().isHeaderExpanded=false;});
      }
      await page.screenshot({path:`${root}/output/playwright/appearance-controls-${fixture.name}-${mode}.png`});
    }
    await panel.getByRole('button',{name:'Светлая',exact:true}).click();
    await page.reload();await page.locator(`${prefix}.income`).first().waitFor();await open();await scope('Операции');
    assert.equal(await panel.getByLabel('Цвета операций: Доходы HEX',{exact:true}).inputValue(),'#17395b');
    assert.equal(await panel.getByRole('slider',{name:'Операции: Непрозрачность фона',exact:true}).inputValue(),'25');
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    console.log(`PASS ${fixture.name}: four chip types with synchronized colours, opacity, visible today grid, widget radius, equal light/dark icon geometry, persistence; no data writes`);
    await context.close();
  }
} finally {await browser?.close();await server.close();}
