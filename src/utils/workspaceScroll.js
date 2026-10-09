// All three day planes use this one window inside ONE native scroll container.
// Pixel movement belongs to the browser; only the offscreen render window is
// recycled, in page-sized steps with two pages of overscan on either side.
export function getWorkspaceWindow({ viewportWidth, visibleColumns, totalDays, scrollLeft = 0, enabled = true, lockedStartIndex = 0 }) {
  const columns = Math.max(1, Math.floor(visibleColumns || 1));
  const total = Math.max(columns, Math.floor(totalDays || 0));
  const columnWidth = Math.max(0, viewportWidth || 0) / columns;
  const maxIndex = total - columns;
  const maxScrollLeft = enabled ? maxIndex * columnWidth : 0;
  const left = Math.max(0, Math.min(scrollLeft, maxScrollLeft));
  const firstVisibleIndex = enabled
    ? Math.min(maxIndex, columnWidth ? Math.floor(left / columnWidth + 1e-7) : 0)
    : Math.max(0, Math.min(lockedStartIndex, maxIndex));
  const count = enabled ? Math.min(total, columns * 5) : columns;
  const startIndex = enabled
    ? Math.max(0, Math.min(Math.floor(firstVisibleIndex / columns) * columns - columns * 2, total - count))
    : firstVisibleIndex;
  return {
    columnWidth, scrollLeft: left, firstVisibleIndex, startIndex, count,
    offsetLeft: enabled ? startIndex * columnWidth : 0,
    windowWidth: count * columnWidth,
    totalWidth: (enabled ? total : columns) * columnWidth,
    maxScrollLeft,
  };
}
