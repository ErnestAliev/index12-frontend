import MarkdownIt from "markdown-it";

const detector = new MarkdownIt().linkify;
detector.set({ fuzzyLink: true, fuzzyEmail: false });

export function textLinkParts(value) {
  const text = String(value ?? "");
  const parts = [];
  let from = 0;
  for (const link of detector.match(text) || []) {
    if (!/^https?:\/\//i.test(link.url)) continue;
    if (link.index > from) parts.push({ text: text.slice(from, link.index) });
    parts.push({ text: link.text, href: link.url });
    from = link.lastIndex;
  }
  if (from < text.length || !parts.length)
    parts.push({ text: text.slice(from) });
  return parts;
}

export function textLinks(value) {
  const seen = new Set();
  return textLinkParts(value).filter((part) => {
    if (!part.href || seen.has(part.href)) return false;
    seen.add(part.href);
    return true;
  });
}
