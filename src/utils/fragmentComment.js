const prefix = "Комментарий к фрагменту:\n\n";
export function formatFragmentComment(excerpt, comment, sourceId, occurrence = 0) {
  return (
    (sourceId ? `[Комментарий к фрагменту](#quote:${encodeURIComponent(sourceId)}:${occurrence})\n\n` : prefix) +
    excerpt
      .split("\n")
      .map((line) => "> " + line)
      .join("\n") +
    "\n\n" +
    comment
  );
}
export function parseFragmentComment(text) {
  const linked = /^\[Комментарий к фрагменту\]\(#quote:([^\s)]{1,1200}):(\d{1,5})\)\n\n/.exec(text);
  if (!linked && !text.startsWith(prefix)) return null;
  const lines = text.slice(linked ? linked[0].length : prefix.length).split("\n"),
    quote = [];
  while (lines[0]?.startsWith("> ")) quote.push(lines.shift().slice(2));
  if (!quote.length || lines.shift() !== "") return null;
  let sourceId;
  try { sourceId = linked ? decodeURIComponent(linked[1]) : undefined; } catch { return null; }
  return { excerpt: quote.join("\n"), comment: lines.join("\n"), ...(linked ? { sourceId, occurrence: Number(linked[2]) } : {}) };
}
