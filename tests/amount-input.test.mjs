import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAmountInput, formatAmountInputEvent } from '../src/utils/amountInput.js';
import { amountInput } from './helpers/amount-input.mjs';

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

test('backspacing and retyping a middle digit changes 1 500 000 to 1 900 000', () => {
  const input = amountInput('1 500 000');
  formatAmountInputEvent(input.edit(2, 3, '', 'deleteContentBackward'));
  assert.equal(input.selectionStart, 1);
  formatAmountInputEvent(input.edit(input.selectionStart, input.selectionEnd, '9'));
  assert.equal(input.value, '1 900 000');
  assert.equal(input.selectionStart, 3);
});

test('every digit of an amount can be replaced without moving to the end', () => {
  const original = '1 234 567.89';
  for (let index = 0; index < original.length; index++) {
    if (!/\d/.test(original[index])) continue;
    for (const inputType of ['deleteContentBackward', 'deleteContentForward']) {
      const input = amountInput(original);
      formatAmountInputEvent(input.edit(index, index + 1, '', inputType));
      formatAmountInputEvent(input.edit(input.selectionStart, input.selectionEnd, '9'));
      assert.equal(input.value, original.slice(0, index) + '9' + original.slice(index + 1), `${inputType} at ${index}`);
    }
  }
});

test('replacing the only whole digit preserves the fraction without adding an extra zero', () => {
  const input = amountInput('1.25');
  formatAmountInputEvent(input.edit(0, 1, '', 'deleteContentBackward'));
  assert.equal(input.value, '0.25');
  formatAmountInputEvent(input.edit(input.selectionStart, input.selectionEnd, '9'));
  assert.equal(input.value, '9.25');
  assert.equal(input.selectionStart, 1);
});

test('typing and pasting over selected digits keeps the caret after the replacement', () => {
  const input = amountInput('1 500 000.25');
  formatAmountInputEvent(input.edit(2, 5, '900', 'insertFromPaste'));
  assert.equal(input.value, '1 900 000.25');
  assert.equal(input.selectionStart, 5);
  formatAmountInputEvent(input.edit(0, input.value.length, '2 345,67', 'insertFromPaste'));
  assert.equal(input.value, '2 345.67');
  assert.equal(input.selectionStart, input.value.length);
});

test('regrouping at the beginning, middle and end keeps the numeric insertion position', () => {
  for (const [source, index, digit, expected, caret] of [
    ['999', 0, '1', '1 999', 1],
    ['999', 1, '1', '9 199', 3],
    ['999', 3, '1', '9 991', 5],
    ['1 000', 2, '2', '12 000', 2],
    ['123.45', 5, '9', '123.49', 6],
  ]) {
    const input = amountInput(source);
    formatAmountInputEvent(input.edit(index, index, digit));
    assert.equal(input.value, expected);
    assert.equal(input.selectionStart, caret);
  }
});

test('grouping spaces do not trap Backspace or Delete at the separator', () => {
  const backspace = amountInput('1 234');
  formatAmountInputEvent(backspace.edit(1, 2, '', 'deleteContentBackward'));
  assert.equal(backspace.value, '1 234');
  assert.equal(backspace.selectionStart, 1);
  formatAmountInputEvent(backspace.edit(0, 1, '', 'deleteContentBackward'));
  assert.equal(backspace.value, '234');
  const forward = amountInput('1 234');
  formatAmountInputEvent(forward.edit(1, 2, '', 'deleteContentForward'));
  assert.equal(forward.selectionStart, 2);
  formatAmountInputEvent(forward.edit(2, 3, '', 'deleteContentForward'));
  assert.equal(forward.value, '134');
});

test('formatting preserves selection direction and both range endpoints', () => {
  const input = amountInput('1234567.89', 1, 4, 'backward');
  formatAmountInputEvent({ target: input });
  assert.equal(input.value, '1 234 567.89');
  assert.equal(input.selectionStart, 1);
  assert.equal(input.selectionEnd, 5);
  assert.equal(input.selectionDirection, 'backward');
});

test('empty values, decimal separators, leading zeroes and two-decimal precision remain unchanged', () => {
  for (const [source, expected] of [['', ''], [',', '0.'], ['0.01', '0.01'], ['0001', '0 001'], ['12,345', '12.34'], ['abc', ''], ['12.3.4', '12.34']]) {
    const input = amountInput(source);
    assert.equal(formatAmountInputEvent({ target: input }), expected);
    assert.equal(input.value, expected);
  }
});

test('active text composition is left intact until composition ends', () => {
  const input = amountInput('12345', 2);
  input.composing = true;
  assert.equal(formatAmountInputEvent({ target: input }), '12345');
  assert.equal(input.selectionStart, 2);
  input.composing = false;
  formatAmountInputEvent({ target: input });
  assert.equal(input.value, '12 345');
  assert.equal(input.selectionStart, 2);
});
