import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatNumber,formatShortNumber} from '../src/utils/formatters.js';
test('compact amounts keep a useful decimal and switch units at the rounding boundary',()=>{
 for(const [amount,expected] of [[0,'0'],[999,'999'],[1000,'1 K'],[100000,'100 K'],[270400,'270.4 K'],[999949,'999.9 K'],[999950,'1 M'],[2000000,'2 M'],[13545757,'13.5 M']])assert.equal(formatShortNumber(amount),expected);
 assert.equal(formatNumber(270400),'270 400','full amount is available to forms and tooltips');
});
