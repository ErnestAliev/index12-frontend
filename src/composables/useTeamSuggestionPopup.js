import { ref, nextTick, onMounted, onBeforeUnmount } from "vue";
export function useTeamSuggestionPopup(root, open) {
  const popupStyle = ref({});
  function position() {
    if (!open.value || !root.value) return;
    const rect = root.value.getBoundingClientRect();
    const scroller = root.value.closest(".team-scroll");
    const scroll = root.value.closest(".team-scroll")?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = Math.max(scroll?.top || 0, viewport?.offsetTop || 0) + 4;
    const bottom =
      Math.min(
        scroll?.bottom || window.innerHeight,
        (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight),
      ) - (scroller?.querySelector(".team-request-submit") ? 56 : 4);
    const above = rect.top - top - 4,
      below = bottom - rect.bottom - 4;
    const up = below < 160 && above > below;
    popupStyle.value = {
      top: up ? "auto" : "calc(100% + 4px)",
      bottom: up ? "calc(100% + 4px)" : "auto",
      maxHeight: Math.max(40, Math.min(200, up ? above : below)) + "px",
    };
  }
  const updatePosition = () => nextTick(position);
  onMounted(() => {
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
  });
  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener("resize", updatePosition);
    window.removeEventListener("resize", updatePosition);
    document.removeEventListener("scroll", updatePosition, true);
  });
  return { popupStyle, updatePosition };
}
