const prefix = "Комментарий к фрагменту:\n\n";
export function formatFragmentComment(excerpt, comment) {
  return (
    prefix +
    excerpt
      .split("\n")
      .map((line) => "> " + line)
      .join("\n") +
    "\n\n" +
    comment
  );
}
export function parseFragmentComment(text) {
  if (!text.startsWith(prefix)) return null;
  const lines = text.slice(prefix.length).split("\n"),
    quote = [];
  while (lines[0]?.startsWith("> ")) quote.push(lines.shift().slice(2));
  if (!quote.length || lines.shift() !== "") return null;
  return { excerpt: quote.join("\n"), comment: lines.join("\n") };
}
