<script setup>
defineProps({ name: { type: String, required: true } });
const paths = {
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  plus: 'M12 5v14M5 12h14',
  attach: 'm21 11-9 9a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7L9 17.5a2 2 0 0 1-2.8-2.8l8.5-8.5',
  external: 'M14 4h6v6M20 4 10 14M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  close: 'M6 6l12 12M6 18 18 6',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-left': 'm15 6-6 6 6 6',
  'chevron-right': 'm9 6 6 6-6 6',
};
</script>
<template>
  <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path :d="paths[name]" /></svg>
</template>
<style scoped>
.ui-icon { display: block; width: 16px; height: 16px; flex: none; }
</style>
