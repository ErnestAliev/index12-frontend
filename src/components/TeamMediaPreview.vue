<script setup>
import TeamChatDialog from "./TeamChatDialog.vue";
import TeamZoomableImage from "./TeamZoomableImage.vue";
defineProps({ media: { type: Object, required: true } });
const emit = defineEmits(["close", "retry"]);
</script>
<template>
  <TeamChatDialog
    class="media-preview-dialog"
    :title="media.name"
    @close="emit('close')"
  >
    <div
      v-if="!media.url"
      class="media-state"
      :role="media.error ? 'alert' : 'status'"
    >
      <span>{{ media.error || "Загрузка…" }}</span>
      <button v-if="media.error" type="button" @click="emit('retry')">
        Повторить
      </button>
    </div>
    <TeamZoomableImage
      v-if="media.url && media.mimeType.startsWith('image/')"
      :src="media.url"
      :alt="media.name"
    />
    <iframe
      v-else-if="media.url"
      :src="media.url"
      :title="media.name"
      class="media-pdf-preview"
    />
  </TeamChatDialog>
</template>
<style scoped>
.media-preview-dialog {
  height: min(80dvh, 760px);
}
.media-state {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 12px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 16px;
}

.media-pdf-preview {
  display: block;
  width: 100%;
  height: 65dvh;
  min-height: 0;
  border: 0;
  flex: 1;
}
.media-preview-dialog :deep(header > strong) {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.media-preview-dialog :deep(header > button) {
  flex: none;
}
</style>
