const prefix = "index12-update-draft:";
export function draftKey(identity, taskId) {
  return identity?.actorId && identity.workspaceId
    ? prefix +
        identity.workspaceId +
        ":" +
        identity.actorId +
        ":" +
        (taskId || "main")
    : null;
}
export function takeUpdateDraft(identity, taskId) {
  const key = draftKey(identity, taskId);
  if (!key) return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key));
    sessionStorage.removeItem(key);
    if (
      saved &&
      Date.now() - saved.savedAt < 3600000 &&
      typeof saved.text === "string"
    )
      return saved;
  } catch {
    /* Optional storage. */
  }
  return null;
}
export function collectUpdateDrafts() {
  const drafts = [],
    blocks = [];
  window.dispatchEvent(
    new CustomEvent("index12:prepare-update", {
      detail: {
        save: (key, value) => {
          if (key) drafts.push([key, value]);
        },
        block: (message) => blocks.push(message),
      },
    }),
  );
  if (blocks.length) throw Error(blocks[0]);
  for (const [key, value] of drafts) {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ ...value, savedAt: Date.now() }),
      );
    } catch {
      throw Error(
        "Не удалось сохранить черновик. Отправьте сообщение перед обновлением.",
      );
    }
  }
}
