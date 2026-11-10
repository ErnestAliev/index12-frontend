import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchOptions} from '../src/utils/selectSearch.js';
test('search covers every row, arbitrary words and substrings, punctuation and normalized case',()=>{
 const items=[{label:'Контрагенты',isHeader:true},...Array.from({length:350},(_,i)=>({value:i,label:`ИП Компания ${i} Бурабай`})),{label:'Физлица',isHeader:true},{value:'person',label:'Ернест Тест'},{isActionRow:true}];
 assert.equal(searchOptions(items,'').length,items.length);
 assert.deepEqual(searchOptions(items,'350'),[{isActionRow:true}]);
 assert.equal(searchOptions(items,'бурабай 349')[1].value,349);
 assert.equal(searchOptions(items,'ИП   КОМП 349')[1].value,349);
 assert.equal(searchOptions(items,'ернест')[0].label,'Физлица');
 assert.equal(searchOptions(items,'ернест')[1].value,'person');
 assert.equal(searchOptions([{label:'TOO Example',value:1}],'ТО')[0].value,1);
});
