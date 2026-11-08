export function searchTextParts(text, query) {
  const value = String(text || ""),
    needle = String(query || "");
  if (!needle) return [{ text: value, match: false }];
  const regex = new RegExp(
    needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "giu",
  );
  const parts = [];
  let from = 0;
  for (const hit of value.matchAll(regex)) {
    if (hit.index > from)
      parts.push({ text: value.slice(from, hit.index), match: false });
    parts.push({ text: hit[0], match: true });
    from = hit.index + hit[0].length;
  }
  if (from < value.length || !parts.length)
    parts.push({ text: value.slice(from), match: false });
  return parts;
}
