// Group by the viewer's calendar day, matching the message timestamps.
export function chatDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function chatDateLabel(value, reference = new Date()) {
  const key = chatDateKey(value);
  if (!key) return "";
  const today = new Date(reference);
  if (key === chatDateKey(today)) return "Сегодня";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === chatDateKey(yesterday)) return "Вчера";
  const date = new Date(value);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}
