<script setup>
import OverviewWidget from '../OverviewWidget.vue';
const emit = defineEmits(['manage']);
</script>
<template>
  <div class="mobile-totals-wrapper"><OverviewWidget widget-key="money" mobile @manage="emit('manage')" /></div>
</template>
<style scoped>
.mobile-totals-wrapper { flex-shrink: 0; width: 100%; }
</style>
