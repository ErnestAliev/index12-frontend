<script setup>
defineProps({ name: { type: String, required: true } });
const paths = {
  close: 'M6 6l12 12M6 18 18 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 19.5 10M4.5 14A8 8 0 0 0 17.9 17.9',
  plus: 'M12 5v14M5 12h14',
  external: 'M14 4h6v6M20 4 10 14M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  copy: 'M9 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2ZM16 4V2H3v13h1',
  check: 'M5 12l4 4L19 6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h5',
  chevron: 'm7 10 5 5 5-5',
  attach: 'm21 11-9 9a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7L9 17.5a2 2 0 0 1-2.8-2.8l8.5-8.5',
  microphone: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-4 7a7 7 0 0 0 14 0M12 19v3M8 22h8',
  send: 'M12 19V5m-6 6 6-6 6 6',
  loader: 'M20 12a8 8 0 1 1-8-8',
  alert: 'M12 8v5m0 4h.01M10.3 3.7 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z',
};
</script>

<template>
  <svg class="codex-glyph" :class="{ spinning: name === 'loader' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path :d="paths[name] || paths.file" /></svg>
</template>

<style scoped>
.codex-glyph { display: block; width: 18px; height: 18px; flex: none; }
.spinning { animation: codex-icon-spin .8s linear infinite; }
@keyframes codex-icon-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinning { animation-duration: 2s; } }
</style>
