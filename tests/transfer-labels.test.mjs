import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transferLabels } from '../src/utils/transferLabels.js';
import { buildTooltipSnapshotForRange } from '../src/utils/tooltipSnapshotBuilder.js';

const directories = {
  accounts: [{ _id:'cash', name:'Касса Пушкина', companyId:'uu', initialBalance:200000 }, { _id:'kaspi', name:'Kaspi Gold Шерхан', individualId:'person', initialBalance:0 }, { _id:'bcc', name:'BCC Шерхан', individualId:'person', initialBalance:0 }],
  companies:[{ _id:'uu', name:'TOO UU' }], individuals:[{ _id:'person', name:'Шерхан' }], projects:[]
};
const transfer = { type:'transfer', isTransfer:true, fromAccountId:'cash', toAccountId:'kaspi', fromCompanyId:'uu', toIndividualId:'person', amount:100000 };
const expected = 'Касса Пушкина (TOO UU) → Kaspi Gold Шерхан (Шерхан)';

test('transfer routes identify the actual accounts and owners for ID, populated and flattened data', () => {
  assert.equal(transferLabels(transfer, directories).routeLabel, expected);
  assert.equal(transferLabels({ fromAccountId:{ name:'Касса Пушкина' }, fromCompanyId:{ name:'TOO UU' }, toAccountId:{ name:'Kaspi Gold Шерхан' }, toIndividualId:{ name:'Шерхан' } }).routeLabel, expected);
  assert.equal(transferLabels({ fromAccountName:'Касса Пушкина', fromCompanyName:'TOO UU', toAccountName:'Kaspi Gold Шерхан', toIndividualName:'Шерхан' }).routeLabel, expected);
  assert.equal(transferLabels({ ...transfer, fromCompanyId:null, toIndividualId:null }, directories).routeLabel, expected);
});
test('accounts of the same owner remain distinct and missing information is never substituted with the owner', () => {
  assert.equal(transferLabels({ fromAccountId:'bcc', toAccountId:'kaspi' }, directories).routeLabel, 'BCC Шерхан (Шерхан) → Kaspi Gold Шерхан (Шерхан)');
  assert.equal(transferLabels({ fromIndividualId:'person' }, directories).fromLabel, 'Счет не указан (Шерхан)');
  assert.equal(transferLabels({ toAccountId:'deleted', toIndividualId:'deleted' }, directories).toLabel, 'Счет не указан (владелец не указан)');
  assert.match(transferLabels({ ...transfer, transferPurpose:'personal', transferReason:'personal_use' }, directories).toLabel, /Kaspi Gold Шерхан \(Шерхан\) · вне системы/);
  assert.equal(transferLabels({ transferPurpose:'personal', transferReason:'personal_use' }).toLabel, 'Вне системы');
});
test('AI tooltip snapshots carry the same route and preserve the transfer amounts and balances', async () => {
  const store = { ...directories, user:{ createdAt:'2026-10-28' }, calculationCache:{ '2026-301':[{ ...transfer, _id:'transfer', date:'2026-10-28T07:00:00Z', dateKey:'2026-301' }] } };
  const snapshot = await buildTooltipSnapshotForRange({ mainStore:store, asOf:'2026-10-28', periodFilter:{ mode:'custom', customStart:'2026-10-28', customEnd:'2026-10-28' } });
  const day = snapshot.days[0];
  assert.equal(day.lists.transfer[0].routeLabel, expected);
  assert.equal(day.lists.transfer[0].amount, 100000);
  assert.equal(day.totalBalance, 200000);
  assert.deepEqual(day.accountBalances.map(a=>a.balance), [100000,100000,0]);
  assert.deepEqual(day.totals, { income:0, expense:0 });
});
