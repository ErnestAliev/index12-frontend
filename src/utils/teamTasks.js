export function localDay(offset = 0) {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type).value;
  const date = new Date(
    `${get("year")}-${get("month")}-${get("day")}T12:00:00Z`,
  );
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function taskDate(task) {
  if (!task?.dueDate) return "Без срока";
  const day =
    task.dueDate === localDay()
      ? "Сегодня"
      : task.dueDate === localDay(1)
        ? "Завтра"
        : new Date(task.dueDate + "T12:00:00Z").toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "short",
          });
  return day + (task.dueTime ? " · " + task.dueTime : "");
}
export const taskStatuses = [
  { id: "all", label: "Все" },
  { id: "progress", label: "В процессе" },
  { id: "delayed", label: "Не успеваю" },
  { id: "done", label: "Готово" },
];
export function filterTasks(tasks, filters, actorId) {
  return tasks
    .filter(
      (t) =>
        (filters.status === "all" || t.status === filters.status) &&
        (!filters.mine || t.creatorId === actorId) &&
        (!filters.person || t.assigneeIds.includes(filters.person)) &&
        (!filters.from || (t.dueDate && t.dueDate >= filters.from)) &&
        (!filters.to || (t.dueDate && t.dueDate <= filters.to)) &&
        (filters.period !== "today" || t.dueDate === localDay()) &&
        (filters.period !== "none" || !t.dueDate),
    )
    .sort(
      (a, b) =>
        (a.status === "done") - (b.status === "done") ||
        (a.timing !== "urgent") - (b.timing !== "urgent") ||
        (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
        (a.dueTime || "99").localeCompare(b.dueTime || "99"),
    );
}
