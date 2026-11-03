import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesCompanySearch, companyLegalForm } from '../src/utils/companySearch.js';

const ybb = { name: 'ТОО "YBB GROUP"', legalName: 'Товарищество с ограниченной ответственностью "YBB GROUP"' };
test('company search matches fragments, words in any order, case and the full legal name', () => {
  for (const text of ['YBB', 'ybb', 'BB', 'group ybb', 'тоо ybb', '  YBB  GROUP  ', 'Товарищество']) assert.equal(matchesCompanySearch(ybb, text), true, text);
  assert.equal(matchesCompanySearch({ name: 'Арендатор', legalName: ybb.legalName }, 'YBB'), true);
  assert.equal(matchesCompanySearch(ybb, 'YBB missing'), false);
});
test('legal-form filters separate IP/TOO and all without matching letters inside unrelated names', () => {
  const ip = { name: 'ИП Алиев' }, full = { name: 'Алиев', legalName: 'Индивидуальный предприниматель Алиев' }, typography = { name: 'Типография' };
  assert.equal(companyLegalForm(ip), 'ip'); assert.equal(companyLegalForm(full), 'ip');
  assert.equal(companyLegalForm(ybb), 'too');
  assert.equal(matchesCompanySearch(ip, '', 'ip'), true); assert.equal(matchesCompanySearch(ybb, '', 'ip'), false);
  assert.equal(matchesCompanySearch(ybb, 'ТОО'), true); assert.equal(matchesCompanySearch(ip, 'ИП'), true);
  assert.equal(matchesCompanySearch(typography, 'ИП'), false); assert.equal(matchesCompanySearch(typography), true);
});
