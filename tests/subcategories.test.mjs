import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateSubcategories, getCategoryDetailLabel } from '../src/utils/subcategories.js';
const categories = [{ _id: 'utilities', name: 'Коммуналка' }, { _id: 'repair', name: 'Ремонт' }];
const subcategories = [{ _id: 'water', name: 'Вода', parentCategoryId: 'utilities' }, { _id: 'cables', name: 'Кабели', parentCategoryId: 'repair' }];

test('old payments stay in a separate undetailed bucket; tagging one changes only its detail', () => {
  const ops = [{ _id: 'old', type: 'expense', categoryId: 'utilities', amount: 100 }, { _id: 'new', type: 'expense', categoryId: 'utilities', subcategoryId: 'water', amount: -300 }];
  let rows = aggregateSubcategories(ops, categories, subcategories);
  assert.equal(rows.reduce((sum, row) => sum + row.expense, 0), 400);
  assert.equal(rows.find(row => !row.subcategoryId).expense, 100);
  ops[0].subcategoryId = 'water';
  rows = aggregateSubcategories(ops, categories, subcategories);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].expense, 400);
  assert.equal(rows[0].balance, -400);
});

test('split parents, deleted and phantom rows are excluded, transfers stay separate from cashflow', () => {
  const base = { categoryId: 'utilities', subcategoryId: 'water', amount: 100 };
  const expense = { ...base, _id: 'expense', type: 'expense' };
  const rows = aggregateSubcategories([
    expense, expense,
    { ...base, _id: 'income', type: 'income', amount: 200 },
    { ...base, _id: 'transfer', type: 'transfer', isTransfer: true, amount: 500 },
    { ...base, _id: 'parent', type: 'expense', excludeFromTotals: true },
    { ...base, _id: 'phantom', type: 'expense', isPhantom: true },
    { ...base, _id: 'deleted', type: 'expense', isDeleted: true }
  ], categories, subcategories);
  assert.deepEqual({ income: rows[0].income, expense: rows[0].expense, transfers: rows[0].transfers, balance: rows[0].balance }, { income: 200, expense: 100, transfers: 500, balance: 100 });
});

test('subcategory names resolve from IDs and updated directories instead of stale populated names', () => {
  const op = { categoryId: { _id: 'utilities', name: 'Старое' }, subcategoryId: { _id: 'water', name: 'Старое' } };
  assert.equal(getCategoryDetailLabel(op, categories, subcategories), 'Коммуналка → Вода');
  assert.equal(getCategoryDetailLabel({ categoryId: 'repair' }, categories, subcategories), 'Ремонт');
});
