<script setup>
import ChatWindowFrame from "./ChatWindowFrame.vue";
import DesktopAssistant from "./DesktopAssistant.vue";
defineProps({
  open: Boolean,
  mobile: Boolean,
  apiBaseUrl: { type: String, required: true },
});
const emit = defineEmits(["close"]);
</script>
<template>
  <ChatWindowFrame :open="open" :mobile="mobile" @close="emit('close')"
    ><template #default="slot"
      ><DesktopAssistant
        :api-base-url="apiBaseUrl"
        :mobile="slot.mobile" /></template
  ></ChatWindowFrame>
</template>
