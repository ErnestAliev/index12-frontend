import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAccountOwnerKey, isValidOwnerKey, needsAccountOwnerRepair } from '../src/utils/accountOwnership.js';

const companies = [{ _id: 'company' }];
const individuals = [{ _id: 'person' }];

test('only one existing owner constitutes a valid account link', () => {
  assert.equal(getAccountOwnerKey({ companyId: 'company' }, companies, individuals), 'company-company');
  assert.equal(getAccountOwnerKey({ individualId: { _id: 'person' } }, companies, individuals), 'individual-person');
  for (const account of [undefined, {}, { companyId: 'deleted' }, { companyId: {} }, { individualId: 'deleted' }, { companyId: 'company', individualId: 'person' }]) {
    assert.equal(getAccountOwnerKey(account, companies, individuals), null);
  }
  assert.equal(isValidOwnerKey('--CREATE_NEW--', companies, individuals), false);
  assert.equal(isValidOwnerKey('company-deleted', companies, individuals), false);
});

test('repair is required for missing accounts, dangling links and missing or mismatched operation owners', () => {
  const accounts = [{ _id: 'linked', companyId: { _id: 'company' } }, { _id: 'orphan' }, { _id: 'dangling', individualId: 'deleted' }];
  const repair = (account, owner) => needsAccountOwnerRepair(account, owner, accounts, companies, individuals);
  assert.equal(repair('linked', 'company-company'), false);
  assert.equal(repair('linked', null), true);
  assert.equal(repair('linked', 'individual-person'), true);
  assert.equal(repair('missing', 'company-company'), true);
  assert.equal(repair('orphan', 'company-company'), true);
  assert.equal(repair('dangling', 'individual-deleted'), true);
  assert.equal(repair(null, null), false);
  accounts[1].individualId = 'person';
  assert.equal(repair('orphan', 'individual-person'), false);
});
