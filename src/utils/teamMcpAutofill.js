// Self-contained bookmarklet: public connection parameters only; no requests or credentials.
export async function fillTeamMcpForm() {
  const name = 'INDEX12 Team', server = 'https://api.index12.com/team-mcp';
  if (location.origin !== 'https://chatgpt.com' || !/^\/plugins(?:\/|$)/.test(location.pathname)) {
    alert('Откройте https://chatgpt.com/plugins в браузере, войдите в ChatGPT и запустите закладку ещё раз.');
    return;
  }
  const visible = element => element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  const text = element => (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim().replace(/\s+/g, ' ');
  const wait = find => new Promise((resolve, reject) => {
    const current = find();
    if (current) { resolve(current); return; }
    const observer = new MutationObserver(() => {
      const value = find();
      if (value) { observer.disconnect(); clearTimeout(timeout); resolve(value); }
    });
    const timeout = setTimeout(() => { observer.disconnect(); reject(Error('Форма ChatGPT изменилась или недоступна. Используйте ручное подключение.')); }, 6000);
    observer.observe(document.body, {childList:true, subtree:true, attributes:true});
  });
  const form = () => [...document.querySelectorAll('[role="dialog"],dialog[open]')].find(element =>
    visible(element) && /(?:add|добавить).*mcp/i.test(element.querySelector('h1,h2,[role="heading"]')?.textContent || ''));
  const mcpItem = () => [...document.querySelectorAll('[role="menuitem"]')].find(element => visible(element) &&
    /^(?:add (?:a )?custom mcp server|добавить (?:пользовательский|свой) (?:сервер mcp|mcp-сервер))$/i.test(text(element)));
  const label = element => [
    element.getAttribute('aria-label'),
    ...[...(element.labels || [])].map(item => item.textContent),
    ...(element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent),
  ].filter(Boolean).join(' ').trim();
  const inputs = dialog => [...dialog.querySelectorAll('input')].filter(element => visible(element) && !element.disabled && !element.readOnly && ['text','url'].includes(element.type));
  const fields = dialog => ({
    name: inputs(dialog).find(element => /^(?:name|название)$/i.test(label(element)) || /^(?:custom tool|пользовательский инструмент)$/i.test(element.placeholder)),
    url: inputs(dialog).find(element => element.type === 'url' || /(?:server url|url-адрес сервера|адрес сервера)/i.test(label(element)) || /https:\/\/example\.com\/mcp/i.test(element.placeholder)),
  });
  const setInput = (element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', {bubbles:true}));
    element.dispatchEvent(new Event('change', {bubbles:true}));
  };
  try {
    if (!form()) {
      if (!mcpItem()) {
        const add = [...document.querySelectorAll('button[aria-haspopup="menu"]')].find(element => visible(element) && /^(?:add|добавить)$/i.test(text(element)));
        if (!add) throw Error('Нажмите «+» на странице плагинов. Если кнопки нет, добавление MCP недоступно в этом аккаунте ChatGPT.');
        add.click();
      }
      (await wait(mcpItem)).click();
    }
    const dialog = await wait(form), controls = fields(dialog);
    if (!controls.name || !controls.url || controls.name === controls.url) throw Error('Не удалось найти поля названия и адреса. Используйте ручное подключение.');
    if ((controls.name.value && controls.name.value !== name) || (controls.url.value && controls.url.value !== server))
      throw Error('В форме уже указано другое подключение. Откройте пустую форму добавления MCP и запустите закладку ещё раз.');
    setInput(controls.name, name); setInput(controls.url, server);
    const select = [...dialog.querySelectorAll('select')].find(element => visible(element) && [...element.options].some(option => option.textContent.trim() === 'OAuth'));
    if (select) {
      select.value = [...select.options].find(option => option.textContent.trim() === 'OAuth').value;
      select.dispatchEvent(new Event('change', {bubbles:true}));
    } else {
      const auth = [...dialog.querySelectorAll('[role="combobox"]')].find(visible);
      if (!auth) throw Error('Проверьте вручную, что в поле «Аутентификация» выбрано OAuth.');
      if (text(auth) !== 'OAuth') {
        auth.click();
        const option = await wait(() => [...document.querySelectorAll('[role="option"],[role="menuitem"]')].find(element => visible(element) && text(element) === 'OAuth'));
        option.click();
      }
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    const saved = fields(form() || dialog);
    if (saved.name?.value !== name || saved.url?.value !== server) throw Error('ChatGPT не сохранил введённые значения. Используйте ручное подключение.');
    saved.url.scrollIntoView({block:'center'});
    alert('Поля INDEX12 Team заполнены. Проверьте их, подтвердите запрос ChatGPT и создайте плагин. В окне INDEX12 войдите под своей учётной записью сотрудника и подтвердите доступ.');
  } catch (error) { alert(error.message || 'Автозаполнение недоступно. Используйте ручное подключение.'); }
}
export const teamMcpAutofillSource = `// INDEX12 Team: fill only public Name, Server URL and OAuth fields.\n// Does not submit forms, accept permissions, access credentials or make network requests.\n(${fillTeamMcpForm.toString()})();\n`;
export const teamMcpBookmarklet = 'javascript:' + encodeURIComponent(`void (${fillTeamMcpForm.toString()})();`);
