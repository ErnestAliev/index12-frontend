const api = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api"
).replace(/\/$/, "");
const copy = (value) =>
  value === undefined ? null : JSON.parse(JSON.stringify(value));
let actor = null,
  queue = [],
  timer,
  working = false,
  suppressed = false,
  flushPromise;
const sources = new Map();
const storedKeys = {
  homeWindow: "index12-homeWindow",
  mobileWindow: "index12-mobileWindow",
  journalWindow: "index12-journalWindow",
  codexWindow: "index12-codex-window-size",
  universalEditModalTabOrder: "universalEditModalTabOrder",
};
for (const [key, storageKey] of Object.entries(storedKeys))
  sources.set(key, {
    read: () => JSON.parse(localStorage.getItem(storageKey) || "null"),
    apply: (value) => localStorage.setItem(storageKey, JSON.stringify(value)),
  });
let deviceId;
try {
  deviceId = localStorage.getItem("index12-history-device");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("index12-history-device", deviceId);
  }
} catch {
  deviceId = crypto.randomUUID();
}
export const historyDeviceId = deviceId;
const queueKey = (id) => `index12-history-queue:${id}`;
export function registerPreference(key, read, apply) {
  const previous = sources.get(key),
    source = { read, apply };
  sources.set(key, source);
  return () => {
    if (sources.get(key) === source) {
      if (previous) sources.set(key, previous);
      else sources.delete(key);
    }
  };
}
export function preferenceValue(key) {
  if (!sources.has(key))
    throw new Error(
      "Откройте окно, к которому относится настройка, и повторите отмену.",
    );
  return copy(sources.get(key).read());
}
function notify(error) {
  window.dispatchEvent(
    new CustomEvent("index12:history-state", {
      detail: { pending: queue.length, error: error || "" },
    }),
  );
}
function persist() {
  try {
    if (actor) localStorage.setItem(queueKey(actor), JSON.stringify(queue));
  } catch {
    notify("Не удалось сохранить очередь истории в браузере.");
  }
}
export function setHistoryIdentity(id) {
  clearTimeout(timer);
  actor = id ? String(id) : null;
  try {
    queue = actor
      ? JSON.parse(localStorage.getItem(queueKey(actor)) || "[]")
      : [];
  } catch {
    queue = [];
  }
  notify();
  void flushPreferenceHistory();
}
export function recordPreference(key, before, after, label = key) {
  if (!actor || suppressed || JSON.stringify(before) === JSON.stringify(after))
    return;
  const pending = [...queue]
    .reverse()
    .find(
      (item) =>
        item.key === key && !item.sending && Date.now() - item.touchedAt < 1200,
    );
  if (pending) {
    pending.after = copy(after);
    pending.touchedAt = Date.now();
  } else
    queue.push({
      id: crypto.randomUUID(),
      key,
      before: copy(before),
      after: copy(after),
      label,
      deviceId,
      deviceLabel: /iPhone|Android.*Mobile/i.test(navigator.userAgent)
        ? "Мобилка"
        : /iPad/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1
          ? "Планшет"
          : "Десктоп",
      touchedAt: Date.now(),
    });
  persist();
  notify();
  clearTimeout(timer);
  timer = setTimeout(() => void flushPreferenceHistory(), 650);
}
export async function historyRequest(path = "", method = "GET", body) {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${api}/change-history${path}`, {
      method,
      signal: controller.signal,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.message || "Не удалось загрузить журнал изменений.",
      );
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
export function flushPreferenceHistory() {
  if (working) return flushPromise;
  if (!actor) return Promise.resolve();
  working = true;
  const ticket = actor;
  flushPromise = (async () => {
    try {
      for (const item of [...queue]) {
        if (actor !== ticket) break;
        if (JSON.stringify(item.before) === JSON.stringify(item.after)) {
          queue = queue.filter((q) => q.id !== item.id);
          continue;
        }
        item.sending = true;
        await historyRequest("/preferences", "POST", item);
        if (actor !== ticket) break;
        queue = queue.filter((q) => q.id !== item.id);
        persist();
      }
      notify();
    } catch (error) {
      for (const item of queue) delete item.sending;
      persist();
      notify(error.message || "Изменения настроек ждут связи с сервером.");
    } finally {
      working = false;
    }
  })();
  return flushPromise;
}
function at(value, path) {
  for (const key of path) {
    if (value == null || !Object.hasOwn(value, key)) return { exists: false };
    value = value[key];
  }
  return { exists: true, value: copy(value) };
}
function restored(current, changes) {
  let next = copy(current);
  for (const c of changes) {
    if (JSON.stringify(at(current, c.path)) !== JSON.stringify(c.after))
      throw new Error("Этот параметр уже изменён. Отмена не выполнена.");
    if (!c.path.length) {
      next = c.before.exists ? copy(c.before.value) : null;
      continue;
    }
    let target = next;
    for (const key of c.path.slice(0, -1)) {
      if (!target[key]) target[key] = {};
      target = target[key];
    }
    if (c.before.exists) target[c.path.at(-1)] = copy(c.before.value);
    else delete target[c.path.at(-1)];
  }
  return next;
}
const receiptKey = () => `index12-history-receipt:${actor}`;
export async function recoverPreferenceUndo() {
  if (!actor) return;
  const ticket = actor;
  let receipt;
  try {
    receipt = JSON.parse(localStorage.getItem(receiptKey()) || "null");
  } catch {
    return;
  }
  if (!receipt) return;
  // An acknowledgement can be retried after a lost connection without applying twice.
  const applied =
    receipt.applied === true ||
    (receipt.expected !== undefined &&
      receipt.changes.every(
        (c) =>
          JSON.stringify(at(preferenceValue(receipt.key), c.path)) ===
          JSON.stringify(at(receipt.expected, c.path)),
      ));
  await historyRequest(`/${receipt.id}/complete`, "POST", {
    requestId: receipt.requestId,
    applied,
    deviceId,
  });
  if (actor === ticket) localStorage.removeItem(receiptKey());
}
export async function applyPreferenceUndo(preference) {
  const source = sources.get(preference.key);
  if (!source)
    throw new Error("Откройте соответствующее окно и повторите отмену.");
  const receipt = { ...preference, applied: false };
  localStorage.setItem(receiptKey(), JSON.stringify(receipt));
  try {
    const value = restored(preferenceValue(preference.key), preference.changes);
    receipt.expected = copy(value);
    localStorage.setItem(receiptKey(), JSON.stringify(receipt));
    suppressed = true;
    try {
      await source.apply(value);
      receipt.applied = true;
      localStorage.setItem(receiptKey(), JSON.stringify(receipt));
    } finally {
      suppressed = false;
    }
  } finally {
    await recoverPreferenceUndo();
  }
}
export function connectPreferenceHistory() {
  const flush = () => {
    void flushPreferenceHistory();
    void recoverPreferenceUndo().catch((error) => notify(error.message));
  };
  window.addEventListener("online", flush);
  const interval = setInterval(flush, 15000);
  return () => {
    clearInterval(interval);
    clearTimeout(timer);
    window.removeEventListener("online", flush);
  };
}
