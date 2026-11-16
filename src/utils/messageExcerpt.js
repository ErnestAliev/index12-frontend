export const normalizeExcerpt = text => String(text || '').replace(/\s+/g, ' ').trim();
let focusedRange = null;
export function fragmentOccurrence(root, range, text) {
  const before = document.createRange(); before.selectNodeContents(root); before.setEnd(range.startContainer, range.startOffset);
  const prefixLength = normalizeExcerpt(before.toString()).length, source = normalizeExcerpt(root.textContent), needle = normalizeExcerpt(text);
  let count = 0, at = source.indexOf(needle);
  while (at >= 0 && at < prefixLength) { ++count; at = source.indexOf(needle, at + 1); }
  return count;
}
export function clearFocusedExcerpt() {
  if (typeof CSS !== 'undefined') CSS.highlights?.delete('index12-quote');
  focusedRange = null;
}
export function isFocusedExcerptSelection(range) {
  return focusedRange && range.startContainer === focusedRange.startContainer && range.startOffset === focusedRange.startOffset && range.endContainer === focusedRange.endContainer && range.endOffset === focusedRange.endOffset;
}
export function focusMessageExcerpt(root, text, occurrence = 0) {
  if (!root) return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), map = [];
  let source = '', node, whitespace = true;
  while ((node = walker.nextNode())) for (let i = 0; i < node.length; ++i) {
    const space = /\s/.test(node.data[i]);
    if (space && whitespace) continue;
    source += space ? ' ' : node.data[i]; map.push({ node, offset: i }); whitespace = space;
  }
  const needle = normalizeExcerpt(text);
  if (!needle) return false;
  let start = source.indexOf(needle);
  for (let i = 0; start >= 0 && i < occurrence; ++i) start = source.indexOf(needle, start + 1);
  if (start < 0) return false;
  const first = map[start], last = map[start + needle.length - 1];
  const range = document.createRange(); range.setStart(first.node, first.offset); range.setEnd(last.node, last.offset + 1);
  clearFocusedExcerpt(); focusedRange = range;
  if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined') CSS.highlights.set('index12-quote', new Highlight(range));
  else { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
  first.node.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest' });
  for (let parent = first.node.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (!/(auto|scroll)/.test(style.overflowY) || parent.scrollHeight <= parent.clientHeight) continue;
    const rect = range.getClientRects()[0] || range.getBoundingClientRect(), bounds = parent.getBoundingClientRect();
    parent.scrollTop += rect.top - bounds.top - parent.clientHeight * .35;
  }
  return true;
}
