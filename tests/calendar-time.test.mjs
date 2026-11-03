import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSlot, monthDays, shiftTask, taskState, taskOnDay } from '../src/utils/calendarTime.js';
test('Almaty midnight, month edges and dragged time stay consistent with task status', () => {
  const slot = defaultSlot('2026-11-03', Date.parse('2026-11-03T05:40Z'));
  assert.equal(slot.startsAt, '2026-11-03T06:00:00.000Z'); assert.equal(slot.endsAt, '2026-11-03T07:00:00.000Z');
  assert.equal(taskState(slot, Date.parse('2026-11-03T06:59Z')), 'today'); assert.equal(taskState(slot, Date.parse('2026-11-03T07:00Z')), 'overdue');
  assert.equal(defaultSlot('2026-11-03', Date.parse('2026-11-03T18:50Z')).dueDate, '2026-11-04');
  const moved = shiftTask(slot, '2026-11-07'); assert.equal(moved.startsAt, '2026-11-07T06:00:00.000Z');
  assert.equal(taskState(moved, Date.parse('2026-11-03')), 'planned');
  const days = monthDays('2026-11'); assert.equal(days[0], '2026-10-26'); assert.equal(days.at(-1), '2026-12-06');
  assert.equal(taskOnDay({ startsAt: '2026-11-03T18:00Z', endsAt: '2026-11-03T19:00Z' }, '2026-11-04'), false);
});
