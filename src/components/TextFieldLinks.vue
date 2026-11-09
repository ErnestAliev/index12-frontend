<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from "vue";
import { textLinks } from "@/utils/textLinks";
const field = shallowRef(null),
  value = ref(""),
  position = ref({}),
  panel = ref(null);
const links = computed(() => textLinks(value.value));
let frame,
  openingLink = false;
function textField(target) {
  if (!(target instanceof HTMLElement)) return null;
  return target.matches(
    'textarea, input:not([type]), input[type="text"], input[type="url"]',
  ) && !target.hidden
    ? target
    : null;
}
function layout() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const el = field.value;
    if (!el?.isConnected || !el.getClientRects().length) {
      field.value = null;
      return;
    }
    const rect = el.getBoundingClientRect(),
      viewport = window.visualViewport;
    const style = getComputedStyle(document.documentElement);
    const inset = (side) =>
      parseFloat(style.getPropertyValue(`--safe-area-${side}`)) || 0;
    const left = (viewport?.offsetLeft || 0) + inset("left"),
      top = (viewport?.offsetTop || 0) + inset("top");
    const width =
        (viewport?.width || innerWidth) - inset("left") - inset("right"),
      bottom =
        (viewport?.offsetTop || 0) +
        (viewport?.height || innerHeight) -
        inset("bottom");
    if (rect.bottom < top || rect.top > bottom) {
      field.value = null;
      return;
    }
    const panelWidth = Math.min(Math.max(rect.width, 180), width - 24);
    const height = Math.min(panel.value?.scrollHeight || 100, 160);
    position.value = {
      left:
        Math.max(
          left + 12,
          Math.min(rect.left, left + width - panelWidth - 12),
        ) + "px",
      width: panelWidth + "px",
      top:
        Math.max(
          top + 8,
          rect.bottom + height + 8 <= bottom
            ? rect.bottom + 4
            : rect.top - height - 4,
        ) + "px",
      maxHeight: Math.min(160, bottom - top - 16) + "px",
    };
  });
}
async function refresh(event) {
  const el = textField(event.target);
  if (!el) return;
  field.value = el;
  value.value = el.value;
  await nextTick();
  layout();
}
function focusOut() {
  queueMicrotask(() => {
    if (openingLink) return;
    if (panel.value?.contains(document.activeElement)) return;
    if (document.activeElement !== field.value) field.value = null;
  });
}
function dismiss(event) {
  if (event.type === "keydown") {
    if (event.key === "Escape") field.value = null;
  } else if (
    event.target !== field.value &&
    !panel.value?.contains(event.target)
  )
    field.value = null;
}
onMounted(() => {
  document.addEventListener("focusin", refresh);
  document.addEventListener("input", refresh);
  document.addEventListener("change", refresh);
  document.addEventListener("focusout", focusOut);
  document.addEventListener("pointerdown", dismiss);
  document.addEventListener("keydown", dismiss);
  document.addEventListener("scroll", layout, true);
  window.addEventListener("resize", layout);
  window.visualViewport?.addEventListener("resize", layout);
  window.visualViewport?.addEventListener("scroll", layout);
  refresh({ target: document.activeElement });
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  document.removeEventListener("focusin", refresh);
  document.removeEventListener("input", refresh);
  document.removeEventListener("change", refresh);
  document.removeEventListener("focusout", focusOut);
  document.removeEventListener("pointerdown", dismiss);
  document.removeEventListener("keydown", dismiss);
  document.removeEventListener("scroll", layout, true);
  window.removeEventListener("resize", layout);
  window.visualViewport?.removeEventListener("resize", layout);
  window.visualViewport?.removeEventListener("scroll", layout);
});
</script>
<template>
  <Teleport v-if="field?.isConnected && links.length" :to="field.parentElement">
    <nav
      ref="panel"
      class="text-field-links"
      :style="position"
      aria-label="Ссылки в тексте"
      @pointerdown.stop="openingLink = true"
      @pointercancel="openingLink = false"
      @click.stop="openingLink = false"
    >
      <a
        v-for="link in links"
        :key="link.href"
        :href="link.href"
        target="_blank"
        rel="noopener noreferrer"
        @mousedown.prevent
        >{{ link.text }}</a
      >
    </nav>
  </Teleport>
</template>
<style scoped>
.text-field-links {
  position: fixed;
  z-index: 10010;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: auto;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
  box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
  font: 13px/1.4 var(--font-family-base, sans-serif);
}
.text-field-links a {
  display: flex;
  align-items: center;
  min-height: 36px;
  padding: 4px;
  color: var(--codex-pane-link, var(--color-primary));
  overflow-wrap: anywhere;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.text-field-links a:hover {
  background: var(--color-background-mute);
}
.text-field-links a:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}
@media (pointer: coarse) {
  .text-field-links a {
    min-height: 44px;
  }
}
</style>
