import { computed, onBeforeUnmount, ref, watch } from "vue";
import { teamApi, teamError, useTeamChatStore } from "@/stores/teamChatStore";
import { cacheTeamMedia, getTeamMedia } from "@/utils/teamMediaCache";
import { deviceFile } from "@/utils/deviceFiles";
const previewable = (file) =>
  /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(file?.mimeType || "");
export function useTeamMedia({ getScope, fetchFile } = {}) {
  const chat = useTeamChatStore();
  const scope = computed(() => {
    if (getScope) return getScope();
    return chat.me?.status === "active" && chat.me?.workspaceId && chat.me?.actorId
      ? JSON.stringify([chat.me.workspaceId, chat.me.actorId])
      : "";
  });
  const preview = ref(null);
  let ticket = 0,
    disposed = false,
    currentFile,
    queue = [],
    warming = false;
  const controllers = new Set();
  function closePreview() {
    ++ticket;
    if (preview.value?.url) URL.revokeObjectURL(preview.value.url);
    preview.value = null;
  }
  async function bytes(file) {
    const identity = scope.value,
      workspaceId = chat.me?.workspaceId;
    if (!identity) throw Error("Войдите в приложение");
    return getTeamMedia(identity, file, async () => {
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const data = fetchFile
          ? await fetchFile(file, controller.signal)
          : (await teamApi.get(`/files/${file.fileId}`, {
              responseType: "blob",
              signal: controller.signal,
              headers: { "x-index12-workspace-id": workspaceId },
            })).data;
        if (disposed || identity !== scope.value)
          throw Error("Сеанс чата изменился");
        return new Blob([data], {
          type: file.mimeType || "application/octet-stream",
        });
      } finally {
        controllers.delete(controller);
      }
    });
  }
  async function download(file) {
    closePreview();
    currentFile = file;
    const t = ticket,
      identity = scope.value;
    preview.value = {
      name: file.name,
      mimeType: file.mimeType || "application/octet-stream",
      size: file.size,
      url: "",
      error: "",
    };
    try {
      const blob = await bytes(file);
      if (disposed || t !== ticket || identity !== scope.value) return;
      const prepared = deviceFile(blob, file), url = URL.createObjectURL(prepared);
      preview.value = {
          name: file.name,
          mimeType: file.mimeType || "application/octet-stream",
          size: blob.size,
          file: prepared,
          url,
          error: "",
      };
    } catch (e) {
      if (disposed || t !== ticket || identity !== scope.value) return;
      preview.value = { ...preview.value, error: teamError(e) };
    }
  }
  function cacheUpload(file, blob) {
    cacheTeamMedia(scope.value, file, blob);
  }
  async function warm() {
    if (warming) return;
    warming = true;
    try {
      while (queue.length && !disposed && scope.value) {
        const file = queue.shift();
        try {
          await bytes(file);
        } catch {
          /* Opening retries a failed preload. */
        }
      }
    } finally {
      warming = false;
    }
  }
  function prefetch(files) {
    for (const file of files)
      if (previewable(file) && !queue.some((f) => f.fileId === file.fileId))
        queue.push(file);
    void warm();
  }
  function cancel() {
    closePreview();
    queue = [];
    for (const controller of controllers) controller.abort();
  }
  watch(scope, cancel);
  onBeforeUnmount(() => {
    disposed = true;
    cancel();
  });
  return {
    preview,
    closePreview,
    download,
    retryPreview: () => currentFile && download(currentFile),
    cacheUpload,
    prefetch,
  };
}
