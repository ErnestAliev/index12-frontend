<script setup>
import OperationHistory from './OperationHistory.vue';
defineProps({ audit: Object, operationId: String, messageId: String });
</script>
<template><div class="operation-audit"><OperationHistory :operation-id="operationId" :message-id="messageId" :audit="audit" /></div></template>
<style scoped>.operation-audit { margin-top: 4px; min-width: 0; }</style>
