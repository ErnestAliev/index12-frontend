import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { collectUpdateDrafts } from "@/utils/updateDrafts";
import { discardTeamDestination } from "@/utils/teamDestination";
export const currentBuildVersion =
  typeof __INDEX12_BUILD_VERSION__ === "string"
    ? __INDEX12_BUILD_VERSION__
    : "0".repeat(40);
export function releaseManifest(data) {
  return data &&
    /^[a-f\d]{40}$/i.test(data.version || "") &&
    Number.isFinite(Date.parse(data.builtAt))
    ? { version: data.version.toLowerCase(), builtAt: data.builtAt }
    : null;
}
export const useAppUpdateStore = defineStore("appUpdates", () => {
  const latest = ref(null),
    checking = ref(false),
    error = ref(""),
    updating = ref(false);
  const available = computed(
    () => !!latest.value && latest.value.version !== currentBuildVersion,
  );
  let interval,
    lastCheck = 0,
    pending;
  async function check(force = false) {
    if (pending) return pending;
    if (!force && Date.now() - lastCheck < 30000) return;
    lastCheck = Date.now();
    checking.value = true;
    pending = (async () => {
      try {
        const response = await fetch("/app-release.json", {
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw Error("Не удалось проверить обновления");
        const manifest = releaseManifest(await response.json());
        if (!manifest) throw Error("Не удалось проверить обновления");
        latest.value = manifest;
        error.value = "";
      } catch {
        error.value = "Не удалось проверить обновления. Повторите позже.";
      } finally {
        checking.value = false;
        pending = null;
      }
    })();
    return pending;
  }
  const wake = () => {
    if (document.visibilityState !== "hidden") void check();
  };
  function start() {
    if (interval) return;
    void check();
    interval = setInterval(wake, 60000);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
  }
  function stop() {
    clearInterval(interval);
    interval = null;
    window.removeEventListener("focus", wake);
    window.removeEventListener("online", wake);
    document.removeEventListener("visibilitychange", wake);
  }
  function update(chat) {
    if (updating.value) return;
    error.value = "";
    try {
      if (chat.outbox?.length)
        throw Error("Дождитесь отправки сообщений перед обновлением.");
      collectUpdateDrafts();
      const url = new URL(window.location.href);
      if (
        chat.me?.status === "active" &&
        (chat.open || url.pathname.startsWith("/team/"))
      ) {
        if (!url.pathname.startsWith("/team/")) {
          url.pathname =
            window.location.pathname === "/mobile" ? "/mobile" : "/";
          url.search = "";
          url.searchParams.set("teamChat", chat.me.workspaceId);
        }
        for (const key of ["task", "message", "release"])
          url.searchParams.delete(key);
        if (chat.requestedTaskId)
          url.searchParams.set("task", chat.requestedTaskId);
      } else
        for (const key of ["teamChat", "task", "message", "release"])
          url.searchParams.delete(key);
      discardTeamDestination();
      updating.value = true;
      if (url.href === window.location.href) window.location.reload();
      else window.location.replace(url.href);
    } catch (exception) {
      error.value = exception.message || "Не удалось обновить сервис";
    }
  }
  return {
    latest,
    checking,
    error,
    available,
    updating,
    check,
    start,
    stop,
    update,
    currentVersion: currentBuildVersion,
  };
});
