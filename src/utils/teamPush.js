import { teamApi } from "@/stores/teamChatStore";
export const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  navigator.standalone === true;
export const iosDevice = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const pushSupported = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
export async function chatWorker() {
  const registration = await navigator.serviceWorker.register("/team-sw.js", {
    scope: "/team/",
    updateViaCache: "none",
  });
  if (!registration.active) {
    await new Promise((resolve, reject) => {
      const worker = registration.installing || registration.waiting;
      if (!worker) return reject(Error("Не удалось запустить уведомления"));
      const timer = setTimeout(
        () => reject(Error("Уведомления запускаются. Повторите проверку")),
        15000,
      );
      const check = () => {
        if (worker.state === "activated") {
          clearTimeout(timer);
          resolve();
        } else if (worker.state === "redundant") {
          clearTimeout(timer);
          reject(Error("Обновите страницу чата"));
        }
      };
      worker.addEventListener("statechange", check);
      check();
    });
  }
  return registration;
}
const decode = (value) =>
  Uint8Array.from(
    atob(
      value.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
export const chatPushPreferenceKey = (identity) =>
  identity?.workspaceId && identity?.actorId
    ? `index12-chat-push-disabled:${identity.workspaceId}:${identity.actorId}`
    : null;
export async function bindChatPush(token, ask = false, identity) {
  const preference = chatPushPreferenceKey(identity);
  try {
    if (!ask && preference && localStorage.getItem(preference))
      return { state: "disabled" };
  } catch {
    /* Storage can be unavailable. */
  }
  if (iosDevice() && !standalone()) return { state: "install" };
  if (!pushSupported()) return { state: "unsupported" };
  // Permission must be requested directly from the user's tap, before any await.
  const permission = ask
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== "granted")
    return { state: permission === "denied" ? "blocked" : "permission" };
  const { data } = await teamApi.get("/push/key");
  if (!data.configured) return { state: "unconfigured" };
  const registration = await chatWorker(),
    key = decode(data.publicKey);
  let subscription = await registration.pushManager.getSubscription();
  const existing = subscription?.options?.applicationServerKey;
  if (
    existing &&
    Array.from(new Uint8Array(existing)).join() !== Array.from(key).join()
  ) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription)
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
  try {
    if (!ask && preference && localStorage.getItem(preference))
      return { state: "disabled" };
  } catch {
    /* Storage can be unavailable. */
  }
  await teamApi.post("/push/subscriptions", {
    subscription: subscription.toJSON(),
    token,
  });
  try {
    if (preference) localStorage.removeItem(preference);
  } catch {
    /* Subscription is already active. */
  }
  return { state: "enabled", endpoint: subscription.endpoint };
}
export async function chatPushEndpoint() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/team/");
  if (!registration?.active?.scriptURL.endsWith("/team-sw.js")) return null;
  return (await registration.pushManager.getSubscription())?.endpoint || null;
}

export async function unsubscribeChatPush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/team/");
  if (!registration?.active?.scriptURL.endsWith("/team-sw.js")) return;
  await (await registration.pushManager.getSubscription())?.unsubscribe();
}
