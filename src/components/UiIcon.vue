<script setup>
defineProps({ name: { type: String, required: true } });
const paths = {
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
