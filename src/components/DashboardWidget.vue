<script setup>
import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { OVERVIEW_WIDGET_KEYS } from '@/utils/dashboardWidgets.js';
import HeaderBalanceCard from './HeaderBalanceCard.vue';
import OverviewWidget from './OverviewWidget.vue';
const props = defineProps({ widgetKey: { type: String, required: true }, widgetIndex: { type: Number, default: -1 }, items: { type: Array, default: () => [] }, expanded: Boolean });
const emit = defineEmits(['open', 'manage', 'add', 'edit', 'edit-operation']);
const store = useMainStore();
const title = computed(() => store.allWidgets.find(widget => widget.key === props.widgetKey)?.name || '');
</script>
<template>
  <OverviewWidget v-if="OVERVIEW_WIDGET_KEYS.includes(widgetKey)" :widget-key="widgetKey" :expanded="expanded" @open="emit('open')" @manage="emit('manage')" @edit-operation="emit('edit-operation', $event)" />
  <HeaderBalanceCard v-else :title="title" :items="items" :widget-key="widgetKey" :widget-index="widgetIndex" :is-delta-mode="!['accounts', 'companies'].includes(widgetKey)" empty-text="Нет данных" @add="emit('add')" @edit="emit('edit')" />
</template>
