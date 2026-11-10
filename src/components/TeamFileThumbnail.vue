<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import { teamApi, useTeamChatStore } from "@/stores/teamChatStore";
import { getTeamMedia } from "@/utils/teamMediaCache";
import { fileMime, fileIcon } from "@/utils/fileLibrary";
import { mediaThumbnail, thumbnailJob } from "@/utils/mediaThumbnail";
import UiIcon from "./UiIcon.vue";
const props = defineProps({ file: { type: Object, required: true } });
const chat = useTeamChatStore(),
  root = ref(null),
  url = ref(""),
  failed = ref(false);
let observer,
  disposed = false,
  visible = false,
  loading = false;
const controller = new AbortController();
async function load() {
  if (
    disposed ||
    loading ||
    url.value ||
    failed.value ||
    chat.me?.status !== "active"
  )
    return;
  const mime = fileMime(props.file),
    kind = mime.startsWith("video/")
      ? "video"
      : mime.startsWith("image/")
        ? "image"
        : null;
  if (!kind) return;
  loading = true;
  const scope = JSON.stringify([chat.me.workspaceId, chat.me.actorId]);
  try {
    const blob = await getTeamMedia(
      scope,
      { fileId: "thumbnail:v1:" + props.file.fileId },
      () =>
        thumbnailJob(async () => {
          const original = await getTeamMedia(
            scope,
            props.file,
            async () =>
              new Blob(
                [
                  (
                    await teamApi.get("/files/" + props.file.fileId, {
                      responseType: "blob",
                      signal: controller.signal,
                    })
                  ).data,
                ],
                { type: fileMime(props.file) },
              ),
          );
          return mediaThumbnail(original, kind, { signal: controller.signal });
        }, controller.signal),
    );
    if (
      !disposed &&
      visible &&
      scope === JSON.stringify([chat.me?.workspaceId, chat.me?.actorId])
    )
      url.value = URL.createObjectURL(blob);
  } catch (error) {
    if (
      !disposed &&
      !["AbortError", "CanceledError"].includes(error.name) &&
      error.code !== "ERR_CANCELED"
    )
      failed.value = true;
  } finally {
    loading = false;
    if (!disposed && visible && !failed.value && !url.value)
      queueMicrotask(load);
  }
}
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) void load();
      else if (url.value) {
        URL.revokeObjectURL(url.value);
        url.value = "";
      }
    },
    { rootMargin: "150px" },
  );
  observer.observe(root.value);
});
onBeforeUnmount(() => {
  disposed = true;
  controller.abort();
  observer?.disconnect();
  if (url.value) URL.revokeObjectURL(url.value);
});
</script>
<template>
  <div
    ref="root"
    class="file-thumbnail"
    :data-type="file.type"
    :title="failed ? 'Предпросмотр недоступен в этом браузере' : undefined"
  >
    <img
      v-if="url && !failed"
      :src="url"
      :alt="file.name"
      loading="lazy"
      @error="failed = true"
    /><template v-else
      ><UiIcon :name="fileIcon(file.type)" /><span>{{
        file.name.split(".").at(-1)?.toUpperCase().slice(0, 8)
      }}</span></template
    >
    <span
      v-if="file.type === 'video' && url && !failed"
      class="file-video-badge"
      ><UiIcon name="play"
    /></span>
  </div>
</template>
<style scoped>
.file-thumbnail {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--color-background-soft);
  color: var(--color-text-secondary, var(--color-text));
  overflow: hidden;
}
.file-thumbnail img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.file-thumbnail .ui-icon {
  width: clamp(24px, 35%, 54px);
  height: clamp(24px, 35%, 54px);
  opacity: 0.65;
}
.file-thumbnail span {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.03em;
}
.file-video-badge {
  position: absolute;
  right: 7px;
  bottom: 7px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #0008;
  color: #fff;
}
.file-video-badge .ui-icon {
  width: 13px;
  height: 13px;
  opacity: 1;
}
</style>
