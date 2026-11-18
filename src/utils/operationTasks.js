const uuid = "[a-f\\d]{8}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{12}";
const valid = (value) =>
  typeof value === "string" && new RegExp(`^${uuid}$`, "i").test(value);
export function operationTaskIds(operation = {}) {
  const ids = new Set();
  for (const value of [operation.sourceTaskId, operation.taskId]) {
    const id = String(value || "").replace(/^chat:/, "");
    if (valid(id)) ids.add(id);
  }
  const text = [operation.description, operation.comment]
    .filter(Boolean)
    .join("\n");
  for (const match of text.matchAll(
    new RegExp(`(?:задач[аеиуы]|task)\\s*[:#№-]?\\s*(${uuid})`, "gi"),
  ))
    ids.add(match[1]);
  for (const match of text.matchAll(/https?:\/\/[^\s<>]+/gi)) {
    try {
      const url = new URL(match[0]);
      if (
        [
          "index12.com",
          "www.index12.com",
          "app.index12.com",
          ...(typeof location !== "undefined" ? [location.hostname] : []),
        ].includes(url.hostname) &&
        valid(url.searchParams.get("task"))
      )
        ids.add(url.searchParams.get("task"));
    } catch {
      /* Text, not a link. */
    }
  }
  return [...ids];
}
export function operationTaskUrl(id, workspaceId, path = "/") {
  if (!valid(id) || !/^[a-f\d]{24}$/i.test(workspaceId || "")) return "";
  const url = new URL(
    path.startsWith("/team/") ? path.split("?")[0] : "/",
    "https://www.index12.com",
  );
  if (!path.startsWith("/team/")) url.searchParams.set("teamChat", workspaceId);
  url.searchParams.set("task", id);
  return url.pathname + url.search;
}
