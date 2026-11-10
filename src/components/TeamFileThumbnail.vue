<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import { teamApi, useTeamChatStore } from "@/stores/teamChatStore";
import { getTeamMedia } from "@/utils/teamMediaCache";
import { fileMime, fileIcon } from "@/utils/fileLibrary";
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
  if (!/^image\/(png|jpeg|webp|gif)$/.test(fileMime(props.file))) return;
  loading = true;
  const scope = JSON.stringify([chat.me.workspaceId, chat.me.actorId]);
  try {
    const blob = await getTeamMedia(
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
    if (
      !disposed &&
      visible &&
      scope === JSON.stringify([chat.me?.workspaceId, chat.me?.actorId])
    )
      url.value = URL.createObjectURL(blob);
  } catch {
    if (!disposed) failed.value = true;
  } finally {
    loading = false;
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
  <div ref="root" class="file-thumbnail" :data-type="file.type">
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
  </div>
</template>
<style scoped>
.file-thumbnail {
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
</style>
