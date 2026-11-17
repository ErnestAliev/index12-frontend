import { normalizeExcerpt } from './messageExcerpt';

// Change text nodes only. Markdown tables, links and emphasis keep their
// structure, and replacement text is never interpreted as HTML.
export function applyTextCorrections(root, corrections = []) {
  for (const { kind, tableIndex, rowIndex, columnIndex = 1, excerpt, replacement, occurrence = 0 } of corrections) {
    if (kind === 'field') { const cell = root.querySelectorAll('table')[tableIndex]?.tBodies[0]?.rows[rowIndex]?.cells[columnIndex]; if (cell) cell.textContent = replacement; continue; }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), map = [];
    let node, source = '', space = true;
    while ((node = walker.nextNode())) for (let i = 0; i < node.length; ++i) {
      const next = /\s/.test(node.data[i]);
      if (next && space) continue;
      source += next ? ' ' : node.data[i]; map.push({ node, offset: i }); space = next;
    }
    const needle = normalizeExcerpt(excerpt);
    let at = source.indexOf(needle);
    for (let n = 0; at >= 0 && n < occurrence; ++n) at = source.indexOf(needle, at + 1);
    if (!needle || at < 0) continue;
    const first = map[at], last = map[at + needle.length - 1];
    if (first.node === last.node) first.node.replaceData(first.offset, last.offset - first.offset + 1, replacement);
    else {
      const nodes = [...new Set(map.slice(at, at + needle.length).map(part => part.node))];
      first.node.data = first.node.data.slice(0, first.offset) + replacement;
      for (const middle of nodes.slice(1, -1)) middle.data = '';
      last.node.data = last.node.data.slice(last.offset + 1);
    }
  }
}
