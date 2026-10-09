import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getWorkspaceWindow } from '../src/utils/workspaceScroll.js';

test('fractional scrolling preserves pixel position instead of snapping to a day', () => {
  const window = getWorkspaceWindow({ viewportWidth: 1100, visibleColumns: 11, totalDays: 90, scrollLeft: 253.5 });
  assert.equal(window.columnWidth, 100);
  assert.equal(window.firstVisibleIndex, 2);
  assert.equal(window.scrollLeft, 253.5);
  assert.equal(window.totalWidth, 9000);
});

test('the same geometry aligns the table, bars and totals throughout a long fling', () => {
  for (const viewportWidth of [768, 834, 1024, 1366]) {
    for (const visibleColumns of [7, 11, 21]) {
      const columnWidth = viewportWidth / visibleColumns;
      for (let position = 0; position <= 365 - visibleColumns; position += 0.37) {
        const window = getWorkspaceWindow({ viewportWidth, visibleColumns, totalDays: 365, scrollLeft: position * columnWidth });
        const first = window.firstVisibleIndex;
        assert.ok(window.startIndex <= first);
        assert.ok(window.startIndex + window.count >= Math.ceil(position) + visibleColumns);
        assert.ok(window.count <= visibleColumns * 5, 'DOM size is bounded for long forecasts');
        const localIndex = first - window.startIndex;
        const dayCenter = window.offsetLeft + (localIndex + 0.5) * columnWidth - window.scrollLeft;
        assert.ok(Math.abs(dayCenter - ((first + 0.5) * columnWidth - window.scrollLeft)) < 1e-7);
      }
    }
  }
});

test('render windows stay stable across small scroll events and recycle with space on both sides', () => {
  const base = { viewportWidth: 1100, visibleColumns: 11, totalDays: 365 };
  const a = getWorkspaceWindow({ ...base, scrollLeft: 4050 });
  const b = getWorkspaceWindow({ ...base, scrollLeft: 4199 });
  assert.equal(a.startIndex, b.startIndex);
  assert.equal(a.count, 55);
  const c = getWorkspaceWindow({ ...base, scrollLeft: 4400 });
  assert.ok(c.startIndex < c.firstVisibleIndex);
  assert.ok(c.startIndex + c.count > c.firstVisibleIndex + 11);
});

test('both ends clamp exactly, including fractional column widths', () => {
  const base = { viewportWidth: 834, visibleColumns: 11, totalDays: 31 };
  const start = getWorkspaceWindow({ ...base, scrollLeft: -120 });
  assert.equal(start.scrollLeft, 0);
  const end = getWorkspaceWindow({ ...base, scrollLeft: 1e9 });
  assert.equal(end.firstVisibleIndex, 20);
  assert.equal(end.startIndex + end.count, 31);
  assert.ok(Math.abs(end.scrollLeft - (31 - 11) * end.columnWidth) < 1e-7);
});

test('full-month mode has no horizontal overflow and keeps the selected month start', () => {
  const window = getWorkspaceWindow({ viewportWidth: 1100, visibleColumns: 31, totalDays: 90, scrollLeft: 1000, enabled: false, lockedStartIndex: 30 });
  assert.equal(window.totalWidth, 1100);
  assert.equal(window.scrollLeft, 0);
  assert.equal(window.startIndex, 30);
  assert.equal(window.offsetLeft, 0);
  assert.equal(window.count, 31);
});

test('short and not-yet-measured workspaces still have valid finite dimensions', () => {
  const short = getWorkspaceWindow({ viewportWidth: 1100, visibleColumns: 11, totalDays: 3, scrollLeft: 100 });
  assert.equal(short.totalWidth, 1100);
  assert.equal(short.count, 11);
  assert.equal(short.scrollLeft, 0);
  const loading = getWorkspaceWindow({ viewportWidth: 0, visibleColumns: 11, totalDays: 0 });
  assert.equal(loading.columnWidth, 0);
  assert.equal(loading.firstVisibleIndex, 0);
});
