import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

export function useFileDrop({ enabled, onFiles, onError }) {
  const dragging = ref(false),
    allowed = computed(enabled);
  let depth = 0;
  const reset = () => {
    depth = 0;
    dragging.value = false;
  };
  const hasFiles = (event) =>
    Array.from(event.dataTransfer?.types || []).includes("Files") ||
    !!event.dataTransfer?.files?.length;
  function claim(event) {
    if (!hasFiles(event)) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = allowed.value ? "copy" : "none";
    return true;
  }
  const dropEvents = {
    dragenter(event) {
      if (!claim(event)) return;
      depth++;
      dragging.value = allowed.value;
    },
    dragover(event) {
      if (claim(event)) dragging.value = allowed.value;
    },
    dragleave(event) {
      if (!hasFiles(event)) return;
      event.stopPropagation();
      depth = Math.max(0, depth - 1);
      if (!depth) dragging.value = false;
    },
    drop(event) {
      if (!claim(event)) return;
      reset();
      if (!allowed.value) return;
      try {
        const items = Array.from(event.dataTransfer?.items || []);
        if (
          items.some(
            (item) =>
              item.kind === "file" && item.webkitGetAsEntry?.()?.isDirectory,
          )
        )
          throw Error("Перетащите отдельные файлы, без папок.");
        const files = Array.from(event.dataTransfer?.files || []);
        if (files.length)
          Promise.resolve(onFiles(files)).catch((error) =>
            onError(error.message),
          );
      } catch (error) {
        onError(error.message || "Не удалось прочитать файлы.");
      }
    },
  };
  watch(allowed, (value) => {
    if (!value) reset();
  });
  onMounted(() => {
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset, true);
    window.addEventListener("blur", reset);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("dragend", reset);
    window.removeEventListener("drop", reset, true);
    window.removeEventListener("blur", reset);
  });
  return { dragging, dropEvents };
}
