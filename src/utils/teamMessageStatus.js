export function decisionStatus(history = []) {
  const reset = history.findLastIndex((h) => h.action === "recall");
  const entry = history
    .slice(reset + 1)
    .reverse()
    .find((h) => ["approve", "reject"].includes(h.action));
  if (!entry) return "";
  const role = entry.role === "director" ? "Директором" : "Управляющим";
  return `${entry.action === "reject" ? "Отклонено" : "Согласовано"} ${role}${entry.name ? ` (${entry.name})` : ""}`;
}
