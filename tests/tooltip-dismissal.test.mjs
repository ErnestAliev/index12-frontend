import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldDismissGraphTooltip } from '../src/composables/useGraphTooltip.js';

test('inside-card interactions and taps on its canvas keep the summary open', () => {
  const copyButton = {};
  const canvas = { contains: node => node === canvas };
  const tooltip = { contains: node => node === tooltip || node === copyButton };
  assert.equal(shouldDismissGraphTooltip(copyButton, canvas, tooltip), false);
  assert.equal(shouldDismissGraphTooltip(tooltip, canvas, tooltip), false);
  assert.equal(shouldDismissGraphTooltip(canvas, canvas, tooltip), false);
});

test('blank space and another chart dismiss the old summary without consuming that click', () => {
  const canvas = { contains: node => node === canvas };
  const tooltip = { contains: node => node === tooltip };
  assert.equal(shouldDismissGraphTooltip({}, canvas, tooltip), true);
  assert.equal(shouldDismissGraphTooltip({ tagName: 'CANVAS' }, canvas, tooltip), true);
  assert.equal(shouldDismissGraphTooltip({}, null, tooltip), true);
  assert.equal(shouldDismissGraphTooltip({}, canvas, null), false);
});
