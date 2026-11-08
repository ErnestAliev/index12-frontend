import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSlot, oneHourEnd, monthDays, shiftTask, taskState, taskOnDay, matchesEmployee } from '../src/utils/calendarTime.js';
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

test('changing a start time supplies an editable one-hour ending, including midnight', () => {
  assert.deepEqual(oneHourEnd('2026-11-09', '11:00'), { date: '2026-11-09', time: '12:00' });
  assert.deepEqual(oneHourEnd('2026-11-09', '23:30'), { date: '2026-11-10', time: '00:30' });
});

test('calendar employee filters distinguish assignment from authorship and match owner identity', () => {
  const assigned = { assigneeIds: ['employee'], creatorId: 'owner:actor' };
  assert.equal(matchesEmployee(assigned, 'all', 'actor'), true);
  assert.equal(matchesEmployee(assigned, 'mine', 'actor'), false);
  assert.equal(matchesEmployee(assigned, 'employee', 'actor'), true);
  assert.equal(matchesEmployee({ assigneeIds: ['owner:actor'] }, 'mine', 'actor'), true);
  assert.equal(matchesEmployee({ createdBy: 'actor' }, 'mine', 'actor'), true);
  assert.equal(matchesEmployee({ createdBy: 'someone-else' }, 'mine', 'actor'), false);
  assert.equal(matchesEmployee(assigned, 'mine', null), false);
});
test('chat deadlines preserve day placement and become overdue at the exact time', () => {
  const task = { dueDate: '2026-11-08', dueTime: '18:05', startsAt: null, endsAt: null };
  assert.equal(taskOnDay(task, '2026-11-08'), true);
  assert.equal(taskOnDay(task, '2026-11-09'), false);
  assert.equal(taskState(task, Date.parse('2026-11-08T13:04:00Z')), 'today');
  assert.equal(taskState(task, Date.parse('2026-11-08T13:05:00Z')), 'overdue');
  assert.equal(taskState({ ...task, status: 'done' }, Date.parse('2026-11-09')), 'done');
});
