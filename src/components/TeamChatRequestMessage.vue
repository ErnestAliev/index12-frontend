<script setup>
import { ref, computed, watch } from "vue";
import { teamApi, useTeamChatStore, teamError } from "@/stores/teamChatStore";
import TeamRequestCard from "./TeamRequestCard.vue";
defineOptions({ inheritAttrs: false });
const props = defineProps({ requestId: String });
const chat = useTeamChatStore(),
  fallback = ref(null),
  error = ref("");
const request = computed(
  () =>
    chat.state.requests.find((r) => r._id === props.requestId) ||
    fallback.value,
);
async function load() {
  if (chat.state.requests.some((r) => r._id === props.requestId)) return;
  try {
    fallback.value = (
      await teamApi.get(`/requests/${props.requestId}`)
    ).data.request;
    error.value = "";
  } catch (e) {
    error.value = e.response?.status === 404 ? "Заявка удалена" : teamError(e);
    fallback.value = null;
  }
}
watch(() => chat.state.checkedAt, load, { immediate: true });
</script>
<template>
  <TeamRequestCard v-if="request" :request="request" v-bind="$attrs" /><span
    v-else
    >{{ error || "Загружаем заявку…" }}</span
  >
</template>
