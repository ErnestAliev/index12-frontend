import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_PROJECTS, projectFields, projectSelection, projectLabel, projectGroupId, equalProjectShares } from '../src/utils/projectScope.js';

test('All projects serializes as scope, never project IDs or allocations', () => {
  const fields = projectFields(['one', ALL_PROJECTS, 'two'], 'fallback');
  assert.deepEqual(fields, { projectScope: 'all', projectId: null, projectIds: [] });
  assert.deepEqual(projectSelection(fields), [ALL_PROJECTS]);
  assert.equal(projectLabel(fields), 'Все проекты');
  assert.equal(projectGroupId(fields), ALL_PROJECTS);
});
test('ordinary and legacy project selection remains distinct from shared payments', () => {
  assert.deepEqual(projectFields(['one', 'two', 'one']), { projectScope: 'selected', projectId: 'one', projectIds: ['one', 'two'] });
  assert.equal(projectFields([], 'legacy-default').projectId, 'legacy-default');
  assert.equal(projectLabel({ projectId: { _id: 'one', name: 'Старое' } }, [{ _id: 'one', name: 'Север' }]), 'Север');
  assert.equal(projectLabel({}), 'Без проекта');
});

test('equal allocation preserves cents for income and expense when creating a payment', () => {
  for (const amount of [1000000.01, -1000000.01, 0.02]) {
    const shares = equalProjectShares(['one', 'two', 'three'], amount);
    assert.equal(Math.round(shares.reduce((sum, share) => sum + share.amount, 0) * 100), Math.round(amount * 100));
  }
});
