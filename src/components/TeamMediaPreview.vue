<script setup>
import TeamChatDialog from "./TeamChatDialog.vue";
import TeamZoomableImage from "./TeamZoomableImage.vue";
defineProps({ media: { type: Object, required: true } });
const emit = defineEmits(["close"]);
</script>
<template>
  <TeamChatDialog
    class="media-preview-dialog"
    :title="media.name"
    @close="emit('close')"
  >
    <TeamZoomableImage
      v-if="media.mimeType.startsWith('image/')"
      :src="media.url"
      :alt="media.name"
    />
    <iframe
      v-else
      :src="media.url"
      :title="media.name"
      class="media-pdf-preview"
    />
  </TeamChatDialog>
</template>
<style scoped>
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
