<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useMainStore } from '@/stores/mainStore';
const emit = defineEmits(['close']);
const store = useMainStore();
const closeButton = ref(null);
const previousFocus = typeof document === 'undefined' ? null : document.activeElement;
const choices = computed(() => store.allWidgets.filter(widget => !widget.fixed));
function toggle(key) {
  store.dashboardLayout = store.dashboardLayout.includes(key) ? store.dashboardLayout.filter(item => item !== key) : [...store.dashboardLayout, key];
}
function move(key, direction) {
  const next = [...store.dashboardLayout]; const index = next.indexOf(key); const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return;
  [next[index], next[target]] = [next[target], next[index]]; store.dashboardLayout = next;
}
function keyboard(event) {
  if (event.key === 'Escape') emit('close');
  if (event.key !== 'Tab') return;
  const controls = [...closeButton.value.closest('[role="dialog"]').querySelectorAll('button:not(:disabled), input')];
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
onMounted(() => { closeButton.value?.focus(); document.addEventListener('keydown', keyboard); });
onUnmounted(() => { document.removeEventListener('keydown', keyboard); previousFocus?.focus?.(); });
</script>
<template>
  <Teleport to="body">
    <div class="widget-picker-overlay" @click.self="emit('close')">
      <section class="widget-picker" role="dialog" aria-modal="true" aria-labelledby="widget-picker-heading">
        <header><h2 id="widget-picker-heading">Виджеты</h2><button ref="closeButton" type="button" aria-label="Закрыть настройки виджетов" @click="emit('close')">×</button></header>
        <div class="widget-picker-body">
          <div v-for="widget in choices" :key="widget.key" class="picker-row">
            <label><input type="checkbox" :checked="store.dashboardLayout.includes(widget.key)" @change="toggle(widget.key)">{{ widget.name }}</label>
            <div v-if="store.dashboardLayout.includes(widget.key)" class="picker-order">
              <span>{{ store.dashboardLayout.indexOf(widget.key) + 1 }}</span>
              <button type="button" :disabled="store.dashboardLayout.indexOf(widget.key) === 0" :aria-label="`${widget.name}: выше`" @click="move(widget.key, -1)">↑</button>
              <button type="button" :disabled="store.dashboardLayout.indexOf(widget.key) === store.dashboardLayout.length - 1" :aria-label="`${widget.name}: ниже`" @click="move(widget.key, 1)">↓</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.widget-picker-overlay { position: fixed; inset: 0; z-index: 6500; display: grid; place-items: center; padding: 16px; background: #0007; }
.widget-picker { width: min(100%, 460px); max-height: calc(100dvh - 32px); display: flex; flex-direction: column; color: var(--color-text); background: var(--widget-background); border: 1px solid var(--color-border); border-radius: 12px; box-shadow: var(--tooltip-shadow); }
header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--color-border); }
h2 { font-size: 17px; font-weight: 600; }
button { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; color: var(--color-text); background: var(--btn-widget-bg); border: 1px solid var(--color-border); border-radius: 5px; font-size: 18px; }
button:disabled { opacity: .35; cursor: default; }
.widget-picker-body { padding: 6px 16px; overflow-y: auto; }
.picker-row { min-height: 48px; display: flex; justify-content: space-between; align-items: center; gap: 8px; border-bottom: 1px solid var(--cell-border); }
.picker-row:last-child { border-bottom: 0; }
label { min-width: 0; display: flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; padding: 10px 0; }
input { accent-color: var(--color-primary); width: 18px; height: 18px; flex-shrink: 0; }
.picker-order { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.picker-order span { font-size: 12px; color: var(--text-mute); width: 16px; text-align: center; }
@media(pointer:coarse) { button { width: 40px; height: 40px; } }
</style>
