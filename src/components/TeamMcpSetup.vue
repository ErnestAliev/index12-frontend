<script setup>
import {ref} from 'vue';
import UiIcon from './UiIcon.vue';
import {teamMcpBookmarklet,teamMcpAutofillSource} from '@/utils/teamMcpAutofill';
import {useInputModality} from '@/composables/useInputModality';
const props=defineProps({serverUrl:{type:String,required:true}});
const chatGptUrl='https://chatgpt.com/plugins';
const address=ref(null),notice=ref(''),error=ref(''),method=ref('manual');
const keyboard=useInputModality();
function openChatGpt(){
  // Open synchronously in the tap; clipboard promises can lose Safari's popup gesture.
  window.open(chatGptUrl,'_blank','noopener,noreferrer');
  void copy(props.serverUrl);
}
function downloadScript(){
  const url=URL.createObjectURL(new Blob([teamMcpAutofillSource],{type:'text/javascript;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='index12-chatgpt-setup.js';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function copy(text,link=false){
  error.value='';notice.value='';
  try{
    if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
    // Call during the tap, before the link's default navigation. Do not await before opening.
    return navigator.clipboard.writeText(text).then(()=>{notice.value=link?'Ссылка на ChatGPT скопирована':'Адрес сервера скопирован';},()=>copyFailed(link));
  }catch{copyFailed(link);}
}
function copyFailed(link){
  error.value=link?'Скопируйте ссылку chatgpt.com/plugins и откройте её в браузере.':'Не удалось скопировать. Выделите адрес сервера и скопируйте его вручную.';
  if(!link){address.value?.focus({preventScroll:true});address.value?.select();}
}
</script>
<template>
  <div class="mcp-setup" :class="{'keyboard-navigation':keyboard}">
    <div class="setup-methods" role="group" aria-label="Способ подключения"><button type="button" :aria-pressed="method==='manual'" @click="method='manual'">Вручную</button><button type="button" :aria-pressed="method==='auto'" @click="method='auto'">Автозаполнение</button></div>
    <template v-if="method==='manual'">
    <p class="setup-intro">Первое подключение выполните в браузере Safari или Chrome. Войдите в свой аккаунт ChatGPT.</p>
    <a class="setup-open" :href="chatGptUrl" target="_blank" rel="noopener noreferrer" @click.prevent="openChatGpt"><UiIcon name="external"/><span>Скопировать и открыть ChatGPT</span></a>
    <ol class="setup-steps">
      <li>Откройте <strong>«Плагины» → «+» → «Добавить пользовательский сервер MCP»</strong> (Add custom MCP server).</li>
      <li>Заполните поля:
        <dl class="setup-fields">
          <div><dt>Название</dt><dd>INDEX12 Team</dd></div>
          <div class="setup-server"><dt>URL-адрес сервера (Server URL)</dt><dd><div class="setup-address"><input ref="address" :value="serverUrl" readonly aria-label="Адрес сервера MCP" @focus="$event.target.select()"/><button type="button" class="setup-copy" aria-label="Скопировать адрес MCP" title="Скопировать адрес MCP" @click="copy(serverUrl)"><UiIcon name="copy"/></button></div></dd></div>
          <div><dt>Аутентификация</dt><dd>OAuth</dd></div>
        </dl>
        <p class="setup-secondary">Если есть поля Client ID и Client Secret, оставьте их пустыми.</p>
      </li>
      <li>Ознакомьтесь с запросом доступа и нажмите <strong>«Создать в виде плагина»</strong> (Create as a plugin). В окне INDEX12 войдите под своим именем и паролем сотрудника и подтвердите доступ.</li>
      <li>Установите созданный плагин кнопкой <strong>«+»</strong>. В новом рабочем чате ChatGPT (Work) наберите <strong>@</strong> и выберите <strong>INDEX12 Team</strong>.</li>
    </ol>
    </template>
    <template v-else>
      <p>Помощник для браузера на компьютере. Он откроет форму и заполнит название, адрес сервера и OAuth. Создание плагина и доступ подтверждаете вы.</p>
      <ol class="setup-steps"><li>Покажите панель закладок браузера (Ctrl+Shift+B в Windows, ⌘⇧B на Mac) и перетащите на неё кнопку ниже.</li></ol>
      <a class="setup-bookmark" :href="teamMcpBookmarklet" draggable="true" title="Перетащите на панель закладок браузера" @click.prevent="notice='Перетащите эту кнопку на панель закладок. Запустите созданную закладку на странице плагинов ChatGPT.'"><UiIcon name="external"/>Автозаполнение INDEX12</a>
      <ol class="setup-steps" start="2"><li>Откройте <a :href="chatGptUrl" target="_blank" rel="noopener noreferrer">плагины ChatGPT</a> в браузере и войдите в свой аккаунт.</li><li>Нажмите созданную закладку <strong>«Автозаполнение INDEX12»</strong>, затем проверьте поля и подтвердите создание и доступ.</li></ol>
      <p class="setup-secondary">На телефоне выберите ручную настройку. Этот помощник рассчитан на панель закладок браузера на компьютере.</p>
      <details class="setup-code"><summary>Посмотреть или скачать скрипт</summary><pre tabindex="0">{{ teamMcpAutofillSource }}</pre><button type="button" class="setup-browser-copy" @click="downloadScript">Скачать скрипт</button></details>
    </template>
    <details class="setup-help"><summary>Открылось приложение или нет «Добавить MCP»?</summary><p>Если ссылка открыла приложение ChatGPT, скопируйте её и вставьте в адресную строку Safari или Chrome.</p><button type="button" class="setup-browser-copy" @click="copy(chatGptUrl,true)"><UiIcon name="copy"/>Скопировать ссылку на ChatGPT</button><p>Если в браузере нет добавления MCP, проверьте разрешения аккаунта или рабочей области ChatGPT. INDEX12 не может включить эту возможность.</p></details>
    <p v-if="notice" role="status" class="setup-notice">{{ notice }}</p>
    <p v-if="error" role="alert" class="setup-error">{{ error }}</p>
  </div>
</template>
<style scoped>
.mcp-setup{display:flex;flex-direction:column;gap:12px;min-width:0;font-size:13px;line-height:1.5}
.mcp-setup p{margin:0}.setup-intro{color:var(--codex-pane-text)}
.setup-methods{display:flex;gap:8px}.setup-methods button{flex:1;min-width:0;min-height:44px;border:1px solid var(--codex-pane-border);border-radius:6px;background:transparent;color:var(--codex-pane-muted);font:inherit;font-size:13px;cursor:pointer}.setup-methods button[aria-pressed=true]{background:var(--codex-pane-surface);color:var(--codex-pane-text)}
.setup-bookmark{display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;border:1px solid var(--codex-pane-border);border-radius:6px;padding:0 8px;color:inherit;text-decoration:none;font-size:13px}.setup-bookmark .ui-icon{width:16px;height:16px;flex:none}
.setup-steps a{color:inherit;text-underline-offset:3px}.setup-code{min-width:0}.setup-code summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-size:12px;color:var(--codex-pane-muted)}.setup-code pre{box-sizing:border-box;max-height:220px;max-width:100%;overflow:auto;padding:8px;background:var(--codex-pane-surface);border-radius:6px;font-size:11px;user-select:text;-webkit-user-select:text}
.setup-open,.setup-copy,.setup-browser-copy{position:relative;display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--codex-pane-text);font:inherit;font-weight:400;text-decoration:none;cursor:pointer;box-sizing:border-box}
.setup-open{width:100%;color:var(--codex-pane-send-text);text-align:center;isolation:isolate}
.setup-open::before,.setup-copy::before,.setup-browser-copy::before{content:'';position:absolute;inset:6px 0;z-index:-1;border-radius:6px;background:var(--codex-pane-surface)}
.setup-open::before{background:var(--codex-pane-accent)}
.setup-open .ui-icon,.setup-copy .ui-icon,.setup-browser-copy .ui-icon{width:16px;height:16px;flex:none}
.setup-steps{display:flex;flex-direction:column;gap:14px;margin:0;padding:0 0 0 20px}.setup-steps li{min-width:0;padding-left:2px;overflow-wrap:anywhere}.setup-steps strong{font-weight:500}
.setup-fields{display:flex;flex-direction:column;gap:6px;margin:8px 0}.setup-fields>div{display:grid;grid-template-columns:100px minmax(0,1fr);align-items:center;gap:8px}.setup-fields dt{color:var(--codex-pane-muted)}.setup-fields dd{margin:0;min-width:0}
.setup-fields .setup-server{display:block}.setup-server dt{margin-bottom:2px}
.setup-address{display:flex;align-items:center;gap:6px;min-width:0}
.setup-address input{box-sizing:border-box;min-width:0;width:100%;height:32px;border:1px solid var(--codex-pane-border);border-radius:6px;padding:0 8px;background:var(--codex-pane-surface);color:var(--codex-pane-text);font:inherit;font-size:12px;caret-color:var(--codex-pane-accent);user-select:text;-webkit-user-select:text}
.setup-copy{width:44px;flex:none;isolation:isolate}.setup-browser-copy{max-width:100%;justify-content:flex-start;isolation:isolate}
.setup-secondary{color:var(--codex-pane-muted);font-size:12px}
.setup-help summary{cursor:pointer;min-height:44px;display:flex;align-items:center;line-height:1.5;color:var(--codex-pane-muted)}.setup-help[open] summary{color:var(--codex-pane-text);margin-bottom:4px}.setup-help p{font-size:12px;color:var(--codex-pane-muted)}
.setup-notice{font-size:12px;color:var(--codex-pane-accent)}.setup-error{font-size:12px;color:var(--codex-pane-danger)}
input:focus{outline:none}
.keyboard-navigation button:focus-visible,.keyboard-navigation a:focus-visible,.keyboard-navigation summary:focus-visible,.keyboard-navigation input:focus-visible{outline:2px solid var(--codex-pane-focus);outline-offset:2px}
@media(max-width:360px){.setup-open{font-size:12px;padding:0 6px;gap:6px}}
</style>
