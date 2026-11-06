import { ref, onMounted, onBeforeUnmount } from "vue";
export function useChatCompact() {
  const media = window.matchMedia("(max-width: 599px)"),
    compact = ref(media.matches);
  const update = () => (compact.value = media.matches);
  onMounted(() => media.addEventListener("change", update));
  onBeforeUnmount(() => media.removeEventListener("change", update));
  return compact;
}
