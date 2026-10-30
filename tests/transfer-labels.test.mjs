import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transferLabels } from '../src/utils/transferLabels.js';

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

test('reason-free withdrawals identify the external destination without a fabricated owner or purpose', () => {
  const labels = transferLabels({ type:'transfer', isWithdrawal:true, transferPurpose:'withdrawal', transferReason:null, fromAccountId:'cash', toAccountId:null }, { accounts:[{_id:'cash',name:'Касса',companyId:'company'}],companies:[{_id:'company',name:'Компания'}] });
  assert.equal(labels.routeLabel, 'Касса (Компания) → Вне системы');
});

test('withdrawal route shows who received the money without crediting a tracked account', () => {
  const labels = transferLabels({type:'transfer',transferPurpose:'withdrawal',withdrawalRecipient:'Собственник',fromAccountId:'cash'}, {accounts:[{_id:'cash',name:'Касса',companyId:'company'}],companies:[{_id:'company',name:'Компания'}]});
  assert.equal(labels.routeLabel,'Касса (Компания) → Собственник · вне системы');
});
