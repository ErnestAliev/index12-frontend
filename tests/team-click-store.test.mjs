import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../shared/team-click-store.js',import.meta.url),'utf8');
test('private-mode or denied IndexedDB cannot prevent the notification or app from opening',async()=>{
 for(const indexedDB of [undefined,{open(){throw new Error('Storage denied');}}]){
  const context={indexedDB,setTimeout,clearTimeout};runInNewContext(source,context);
  assert.equal(await context.index12TeamClickStore.write({id:'clicked'}),null);
  assert.equal(await context.index12TeamClickStore.read(),null);
  assert.equal(await context.index12TeamClickStore.remove('clicked'),null);
 }
});
