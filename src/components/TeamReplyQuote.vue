<script setup>
import UiIcon from "./UiIcon.vue";
defineProps({ quote: Object, composing: Boolean });
defineEmits(["cancel", "open"]);
</script>
<template>
  <div class="team-reply-quote" :class="{ composing }">
    <button
      type="button"
      class="team-reply-content"
      :disabled="composing || quote.deleted"
      :aria-label="`Показать исходное сообщение ${quote.authorName}`"
      @click="$emit('open', quote)"
    >
      <strong>{{ quote.authorName }}</strong
      ><span>{{
        quote.deleted
          ? "Сообщение удалено"
          : quote.text ||
            (quote.fileName ? `Файл: ${quote.fileName}` : "Сообщение")
      }}</span
      ><small v-if="quote.edited && !quote.deleted">изменено</small>
    </button>
    <button
      v-if="composing"
      type="button"
      class="team-reply-cancel"
      aria-label="Отменить ответ"
      title="Отменить ответ"
      @click="$emit('cancel')"
    >
      <UiIcon name="close" />
    </button>
  </div>
</template>
<style scoped>
.team-reply-quote {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border-left: 3px solid var(--codex-pane-accent);
  border-radius: 6px;
  background: var(--codex-pane-surface-soft);
  margin: 6px 0 8px;
}
.team-reply-quote.composing {
  margin: 0 12px 4px;
}
.team-reply-quote .team-reply-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--codex-pane-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.team-reply-content:disabled {
  opacity: 1 !important;
  cursor: default !important;
}
.team-reply-content strong {
  font-size: 12px;
  line-height: 16px;
  color: var(--codex-pane-accent);
  font-weight: 500;
}
.team-reply-content span {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 17px;
  color: var(--codex-pane-muted);
}
.team-reply-content small {
  color: var(--codex-pane-muted);
  font-size: 10px;
}
.team-reply-quote .team-reply-cancel {
  display: grid;
  place-items: center;
  flex: none;
  min-width: 36px;
  width: 36px;
  height: 40px;
  margin-right: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--codex-pane-muted);
  cursor: pointer;
}
</style>
