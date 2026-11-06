export function reviewerLabel(stage, people = []) {
  const label = stage === "director" ? "Руководитель" : "Управляющий";
  const names = [
    ...new Set(
      people
        .filter((p) =>
          stage === "manager"
            ? p.owner || p.role === "manager"
            : p.role === "director",
        )
        .map((p) => p.name)
        .filter(Boolean),
    ),
  ];
  return `${label}${names.length ? ` (${names.join(", ")})` : ""}`;
}
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
