import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAmountInput } from '../src/utils/amountInput.js';

test('reopening financial operations preserves tiyn for subsequent saves', () => {
  for (const amount of [123.46, 133333.34, 0.1, 0.01, 100, -123.46]) {
    const text = formatAmountInput(amount);
    assert.equal(Number(text.replace(/\s/g, '')), Math.abs(amount));
  }
});
test('input accepts decimal separators and preserves an unfinished fraction', () => {
  assert.equal(formatAmountInput('1 234,56'), '1 234.56');
  assert.equal(formatAmountInput('123.'), '123.');
  assert.equal(formatAmountInput('0.01'), '0.01');
  assert.equal(formatAmountInput(''), '');
});
