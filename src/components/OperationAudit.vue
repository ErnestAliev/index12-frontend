<script setup>
defineProps({ audit: Object });
const format = value => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date) : 'Время не сохранено';
};
</script>
<template>
  <div v-if="audit" class="operation-audit" aria-label="История операции">
    <p>Создано: <time :datetime="audit.createdAt">{{ format(audit.createdAt) }}</time> · {{ audit.createdByName || 'Автор не указан' }}</p>
    <p v-if="audit.editedAt">Изменено: <time :datetime="audit.editedAt">{{ format(audit.editedAt) }}</time> · {{ audit.editedByName || 'Автор не указан' }}</p>
    <p v-else>{{ audit.editUnknown ? 'Сведения о последней правке не сохранены' : 'Ещё не редактировалось' }}</p>
  </div>
</template>
<style scoped>
.operation-audit { margin: 8px 0; color: var(--codex-pane-muted, var(--color-text-soft)); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.operation-audit p { margin: 2px 0; font: inherit; }
</style>
