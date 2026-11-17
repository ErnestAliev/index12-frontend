<script setup>
import { computed, nextTick, reactive, onMounted, onBeforeUnmount, watch } from 'vue';
import CodexGlyph from './CodexGlyph.vue';
import { useInputModality } from '@/composables/useInputModality';
const keyboard = useInputModality();
const props=defineProps({html:{type:String,default:''},saveField:{type:Function,required:true},disabled:Boolean});
const drafts=reactive({}),pending=reactive({}),errors=reactive({}),copyFailed=reactive({}),copied=reactive({}),inputs=new Map();
const key=(table,row,column=1)=>`${table}:${row}:${column}`;
const parts=computed(()=>{
  const root=document.createElement('div');root.innerHTML=props.html;
  const all=[...root.querySelectorAll('table')];
  return [...root.childNodes].map(node=>{
    const table=node.nodeType===1&&node.classList.contains('codex-table-scroll')?node.querySelector('table'):null;
    if(table&&table.tHead?.rows[0]?.cells.length>=2&&table.tBodies[0]){
      const index=all.indexOf(table),headers=[...table.tHead.rows[0].cells].map(cell=>cell.textContent);
      return {kind:'fields',tableIndex:index,rows:[...table.tBodies[0].rows].flatMap((row,i)=>headers.length===2?[{key:key(index,i),index:i,columnIndex:1,label:row.cells[0].textContent,value:row.cells[1].textContent}]:[...row.cells].map((cell,column)=>({key:key(index,i,column),index:i,columnIndex:column,label:`Строка ${i+1} — ${headers[column]}`,value:cell.textContent})))};
    }
    return {kind:'html',html:node.nodeType===3?node.textContent.replace(/&/g,'&amp;').replace(/</g,'&lt;'):node.outerHTML||''};
  });
});
const value=row=>Object.hasOwn(drafts,row.key)?drafts[row.key]:row.value;
function resize(el){if(!el)return;el.style.height='auto';el.style.height=Math.max(24,el.scrollHeight)+'px';}
function track(el,k){if(el){inputs.set(k,el);resize(el);}else inputs.delete(k);}
function change(row,event){drafts[row.key]=event.target.value;errors[row.key]='';resize(event.target);}
async function save(table,row){
  if(props.disabled||pending[row.key]||!Object.hasOwn(drafts,row.key)||drafts[row.key]===row.value)return;
  const submitted=drafts[row.key];pending[row.key]=true;errors[row.key]='';
  try{await props.saveField({tableIndex:table,rowIndex:row.index,columnIndex:row.columnIndex,value:submitted});if(drafts[row.key]===submitted)delete drafts[row.key];}
  catch(e){copyFailed[row.key]=false;errors[row.key]=e.message||'Не удалось сохранить поле';}
  finally{pending[row.key]=false;await nextTick();inputs.forEach(resize);}
}
function keys(event,row){if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();event.target.blur();}else if(event.key==='Escape'){event.preventDefault();delete drafts[row.key];errors[row.key]='';event.target.value=row.value;event.target.blur();}}
async function copy(row){errors[row.key]='';copyFailed[row.key]=false;try{await navigator.clipboard.writeText(value(row));copied[row.key]=true;setTimeout(()=>{copied[row.key]=false;},1500);}catch{copyFailed[row.key]=true;errors[row.key]='Не удалось скопировать значение';}}
const resizeAll=()=>inputs.forEach(resize);
watch(()=>props.html,()=>nextTick(resizeAll));
onMounted(()=>window.addEventListener('resize',resizeAll));onBeforeUnmount(()=>window.removeEventListener('resize',resizeAll));
</script>
<template>
  <template v-for="(part,i) in parts" :key="i">
    <div v-if="part.kind==='html'" v-html="part.html" />
    <div v-else class="document-fields" :class="{'keyboard-navigation':keyboard}" data-fragment-editor>
      <table aria-label="Реквизиты документа">
        <colgroup><col class="document-field-label-col"><col><col class="document-field-actions-col"></colgroup>
        <thead><tr><th scope="col">Поле</th><th scope="col">Значение</th><th scope="col"><span class="document-field-sr">Действия</span></th></tr></thead>
        <tbody><tr v-for="row in part.rows" :key="row.key">
          <th scope="row">{{ row.label }}</th>
          <td class="document-field-value">
            <textarea :ref="el=>track(el,row.key)" :value="value(row)" :aria-label="row.label" :placeholder="disabled?'':'Заполнить'" :readonly="disabled||pending[row.key]" rows="1" autocomplete="off" spellcheck="false" @input="change(row,$event)" @blur="save(part.tableIndex,row)" @keydown="keys($event,row)" />
            <div v-if="errors[row.key]" class="document-field-error" role="alert">{{ errors[row.key] }}<button type="button" class="document-field-retry" :disabled="disabled||pending[row.key]" @click="copyFailed[row.key]?copy(row):save(part.tableIndex,row)">Повторить</button></div>
          </td>
          <td class="document-field-actions"><button type="button" class="document-field-copy" :aria-label="`Копировать ${row.label}`" :title="copied[row.key]?'Скопировано':'Копировать'" :disabled="!value(row)" @click="copy(row)"><CodexGlyph :name="copied[row.key]?'check':'copy'" /></button></td>
        </tr></tbody>
      </table>
    </div>
  </template>
</template>
<style scoped>
.document-fields{max-width:100%;margin:4px 0 14px;border:1px solid var(--codex-pane-border);border-radius:8px;overflow:hidden}
.document-fields table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px;line-height:1.5}
.document-field-label-col{width:34%}.document-field-actions-col{width:40px}
.document-fields th,.document-fields td{padding:8px 10px;border-bottom:1px solid var(--codex-pane-border);text-align:left;vertical-align:top;white-space:normal;overflow-wrap:anywhere}
.document-fields thead th{background:var(--codex-pane-surface-soft);font-weight:600}
.document-fields tbody th{font-weight:400;background:transparent}
.document-fields tr:last-child>*{border-bottom:0}
.document-fields .document-field-value{padding:5px 4px}
.document-field-value textarea{display:block;box-sizing:border-box;width:100%;min-width:0;min-height:24px;margin:0;padding:3px 6px;resize:none;overflow:hidden;border:0;border-radius:4px;background:transparent;color:var(--codex-pane-text);font:inherit;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:none;outline:0}
.document-field-value textarea::placeholder{color:var(--codex-pane-muted);opacity:1}
.document-field-value textarea:not(:read-only):hover,.document-field-value textarea:focus{background:var(--codex-pane-hover)}
.document-fields .document-field-value textarea:focus,.document-fields .document-field-value textarea:focus-visible{outline:0;box-shadow:none}
.document-fields.keyboard-navigation .document-field-value textarea:focus-visible{outline:1px solid var(--codex-pane-focus);outline-offset:-1px}
.document-fields .document-field-actions{padding:2px}
.document-field-copy{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:34px;min-width:0;max-width:100%;min-height:34px;margin:0;padding:7px;border:0;border-radius:5px;background:transparent;color:var(--codex-pane-muted);cursor:pointer}
.document-field-copy :deep(svg){width:14px;height:14px}.document-field-copy:hover:not(:disabled){color:var(--codex-pane-text);background:var(--codex-pane-hover)}.document-field-copy:disabled{opacity:.35;cursor:default}
.document-fields .document-field-copy:focus,.document-fields .document-field-copy:focus-visible,.document-fields .document-field-retry:focus,.document-fields .document-field-retry:focus-visible{outline:0;box-shadow:none}
.document-fields.keyboard-navigation .document-field-copy:focus-visible,.document-fields.keyboard-navigation .document-field-retry:focus-visible{outline:2px solid var(--codex-pane-focus);outline-offset:-2px}
.document-field-error{min-width:0;overflow-wrap:anywhere;white-space:normal;padding:3px 6px;color:var(--codex-pane-danger);font-size:11px}.document-field-retry{display:block;box-sizing:border-box;min-width:0;max-width:100%;width:auto;min-height:28px;height:auto;white-space:normal;margin:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-decoration:underline;cursor:pointer}
.document-field-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media(pointer:coarse){.document-field-actions-col{width:48px}.document-field-copy{width:44px;min-height:44px}.document-field-value textarea{font-size:16px;min-height:44px;padding-top:12px;padding-bottom:12px}.document-fields tbody th{padding-top:14px}.document-field-retry{min-height:44px}}
</style>
