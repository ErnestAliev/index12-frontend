<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import UiIcon from "./UiIcon.vue";
const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: "" },
});
const stage = ref(null),
  scale = ref(1),
  pan = ref({ x: 0, y: 0 }),
  size = ref({ w: 0, h: 0 }),
  natural = ref({ w: 0, h: 0 }),
  failed = ref(false),
  dragging = ref(false);
const ready = computed(() => natural.value.w > 0 && natural.value.h > 0);
const fit = computed(() => {
  const { w, h } = natural.value;
  if (!w || !h) return { w: 0, h: 0 };
  const factor = Math.min(size.value.w / w, size.value.h / h, 1);
  return { w: w * factor, h: h * factor };
});
const frameHeight = computed(() =>
  ready.value && size.value.w
    ? `min(60dvh, 560px, ${Math.max(120, Math.min(natural.value.h, (size.value.w * natural.value.h) / natural.value.w))}px)`
    : "min(60dvh,560px)",
);
const imageStyle = computed(() => ({
  width: fit.value.w + "px",
  height: fit.value.h + "px",
  marginLeft: -fit.value.w / 2 + "px",
  marginTop: -fit.value.h / 2 + "px",
  transform: `translate(${pan.value.x}px,${pan.value.y}px) scale(${scale.value})`,
}));
const pointers = new Map();
let gesture = null,
  multi = false,
  lastTap = null,
  observer,
  lastTouchAt = -Infinity;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function constrain(x, y, zoom = scale.value) {
  const maxX = Math.max(0, (fit.value.w * zoom - size.value.w) / 2),
    maxY = Math.max(0, (fit.value.h * zoom - size.value.h) / 2);
  return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
}
function local(point) {
  const rect = stage.value.getBoundingClientRect();
  return {
    x: point.x - rect.left - size.value.w / 2,
    y: point.y - rect.top - size.value.h / 2,
  };
}
function zoomTo(value, point) {
  if (!ready.value) return;
  const next = clamp(value, 1, 8),
    ratio = next / scale.value,
    p = point ? local(point) : { x: 0, y: 0 };
  pan.value = constrain(
    p.x - (p.x - pan.value.x) * ratio,
    p.y - (p.y - pan.value.y) * ratio,
    next,
  );
  scale.value = next;
}
function clearGesture() {
  const ids = [...pointers.keys()];
  pointers.clear();
  gesture = null;
  multi = false;
  dragging.value = false;
  for (const id of ids)
    try {
      if (stage.value?.hasPointerCapture(id))
        stage.value.releasePointerCapture(id);
    } catch {
      /* Capture may already be released. */
    }
}
function reset() {
  clearGesture();
  scale.value = 1;
  pan.value = { x: 0, y: 0 };
  lastTap = null;
}
function measure() {
  if (!stage.value) return;
  const box = stage.value.getBoundingClientRect();
  size.value = { w: box.width, h: box.height };
  pan.value = constrain(pan.value.x, pan.value.y);
}
function loaded(event) {
  natural.value = {
    w: event.target.naturalWidth,
    h: event.target.naturalHeight,
  };
  failed.value = false;
  nextTick(measure);
}
function baseline() {
  const points = [...pointers.values()];
  if (points.length >= 2) {
    const [a, b] = points;
    gesture = {
      mode: "pinch",
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      mid: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
      scale: scale.value,
      pan: { ...pan.value },
    };
    multi = true;
    lastTap = null;
  } else if (points.length === 1)
    gesture = { mode: "pan", start: { ...points[0] }, pan: { ...pan.value } };
  else gesture = null;
}
function down(event) {
  if (!ready.value || (event.pointerType === "mouse" && event.button !== 0))
    return;
  if (event.pointerType === "touch") lastTouchAt = performance.now();
  stage.value.focus({ preventScroll: true });
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  try {
    stage.value.setPointerCapture(event.pointerId);
  } catch {
    /* Synthetic events and old browsers may not capture. */
  }
  baseline();
  dragging.value = true;
}
function move(event) {
  if (!pointers.has(event.pointerId) || !gesture) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (gesture.mode === "pinch" && pointers.size >= 2) {
    const [a, b] = [...pointers.values()],
      mid = local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
      next = clamp(
        (gesture.scale * Math.hypot(b.x - a.x, b.y - a.y)) / gesture.distance,
        1,
        8,
      ),
      ratio = next / gesture.scale;
    scale.value = next;
    pan.value = constrain(
      mid.x - (gesture.mid.x - gesture.pan.x) * ratio,
      mid.y - (gesture.mid.y - gesture.pan.y) * ratio,
      next,
    );
  } else if (gesture.mode === "pan") {
    pan.value = constrain(
      gesture.pan.x + event.clientX - gesture.start.x,
      gesture.pan.y + event.clientY - gesture.start.y,
    );
  }
}
function finish(event, cancelled = false) {
  if (!pointers.has(event.pointerId)) return;
  const point = { x: event.clientX, y: event.clientY };
  const tap =
    !cancelled &&
    !multi &&
    gesture?.mode === "pan" &&
    Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) < 8;
  if (tap && event.pointerType === "touch") {
    const now = performance.now();
    if (
      lastTap &&
      now - lastTap.time < 300 &&
      Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 30
    ) {
      zoomTo(scale.value > 1 ? 1 : 2.5, point);
      lastTap = null;
    } else lastTap = { ...point, time: now };
  } else lastTap = null;
  pointers.delete(event.pointerId);
  baseline();
  if (!pointers.size) {
    multi = false;
    dragging.value = false;
  }
}
function wheel(event) {
  const unit =
    event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.value.h : 1;
  zoomTo(scale.value * Math.exp(clamp(-event.deltaY * unit * 0.002, -1, 1)), {
    x: event.clientX,
    y: event.clientY,
  });
}
function doubleClick(event) {
  if (performance.now() - lastTouchAt < 500) return;
  zoomTo(scale.value > 1 ? 1 : 2.5, { x: event.clientX, y: event.clientY });
}
function keys(event) {
  if (
    [
      "+",
      "=",
      "-",
      "_",
      "0",
      "Home",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
    ].includes(event.key)
  )
    event.preventDefault();
  if (event.key === "+" || event.key === "=") zoomTo(scale.value * 1.4);
  else if (event.key === "-" || event.key === "_") zoomTo(scale.value / 1.4);
  else if (event.key === "0" || event.key === "Home") reset();
  else if (event.key.startsWith("Arrow")) {
    const dx =
        event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0,
      dy = event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0;
    pan.value = constrain(pan.value.x + dx, pan.value.y + dy);
  }
}
watch(
  () => props.src,
  () => {
    reset();
    natural.value = { w: 0, h: 0 };
    failed.value = false;
  },
);
onMounted(() => {
  observer = new ResizeObserver(measure);
  observer.observe(stage.value);
  measure();
});
onBeforeUnmount(() => {
  clearGesture();
  observer?.disconnect();
});
</script>
<template>
  <div class="zoom-image-viewer">
    <div
      ref="stage"
      class="zoom-image-stage"
      :style="{ height: frameHeight, flexBasis: frameHeight }"
      :class="{ zoomed: scale > 1, dragging }"
      tabindex="0"
      role="group"
      :aria-label="alt || 'Изображение'"
      @pointerdown.prevent="down"
      @pointermove.prevent="move"
      @pointerup="finish"
      @pointercancel="finish($event, true)"
      @lostpointercapture="finish($event, true)"
      @wheel.prevent="wheel"
      @dblclick.prevent="doubleClick"
      @keydown="keys"
    >
      <img
        :key="src"
        class="zoom-image"
        :src="src"
        :alt="alt"
        :style="imageStyle"
        draggable="false"
        @load="loaded"
        @error="failed = true"
        @dragstart.prevent
      />
      <span v-if="failed" class="image-status" role="alert"
        >Не удалось открыть изображение</span
      >
    </div>
    <div
      class="image-zoom-controls"
      role="group"
      aria-label="Масштаб изображения"
    >
      <button
        type="button"
        aria-label="Уменьшить"
        title="Уменьшить"
        :disabled="!ready || scale <= 1"
        @click="zoomTo(scale / 1.4)"
      >
        <UiIcon name="minus" />
      </button>
      <button
        type="button"
        aria-label="Вписать изображение"
        title="Вписать изображение"
        :disabled="!ready"
        @click="reset"
      >
        <UiIcon name="refresh" />
      </button>
      <button
        type="button"
        aria-label="Увеличить"
        title="Увеличить"
        :disabled="!ready || scale >= 8"
        @click="zoomTo(scale * 1.4)"
      >
        <UiIcon name="plus" />
      </button>
    </div>
  </div>
</template>
<style scoped>
.zoom-image-viewer {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  color: var(--codex-pane-text);
}
.zoom-image-stage {
  position: relative;
  flex: 1 1 min(60dvh, 560px);
  height: min(60dvh, 560px);
  min-height: 80px;
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: contain;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  background: var(--codex-pane-surface-soft);
  cursor: zoom-in;
  outline: none;
}
.zoom-image-stage.zoomed {
  cursor: grab;
}
.zoom-image-stage.zoomed.dragging {
  cursor: grabbing;
}
.zoom-image-stage:focus-visible {
  box-shadow: inset 0 0 0 2px var(--codex-pane-focus);
}
.zoom-image {
  display: block;
  position: absolute;
  left: 50%;
  top: 50%;
  max-width: none;
  max-height: none;
  object-fit: contain;
  transform-origin: 50% 50%;
  will-change: transform;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}
.image-zoom-controls {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 12px 12px;
  border-top: 1px solid var(--codex-pane-border);
  background: var(--codex-pane-bg);
}
.image-zoom-controls > button {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.image-zoom-controls > button:disabled {
  opacity: 0.35;
  cursor: default;
}
.image-zoom-controls > button:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: -2px;
}
.image-zoom-controls .ui-icon {
  width: 20px;
  height: 20px;
}
.image-status {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  text-align: center;
  font-size: 13px;
  background: var(--codex-pane-bg);
}
</style>
