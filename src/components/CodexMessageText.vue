<script setup>
import { computed } from 'vue';
import { renderCodexMarkdown } from '@/utils/codexMarkdown.js';
const props = defineProps({ text: { type: String, default: '' }, plain: Boolean });
const html = computed(() => props.plain ? '' : renderCodexMarkdown(props.text));
</script>

<template>
  <div v-if="plain" class="codex-text codex-plain">{{ text }}</div>
  <div v-else class="codex-text codex-markdown" v-html="html" />
</template>

<style scoped>
.codex-text { min-width: 0; color: var(--codex-pane-text); font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.codex-plain { white-space: pre-wrap; }
.codex-markdown :deep(p) { margin: 0 0 12px; }
.codex-markdown :deep(> :last-child) { margin-bottom: 0; }
.codex-markdown :deep(strong) { font-weight: 650; color: var(--codex-pane-text); }
.codex-markdown :deep(h1), .codex-markdown :deep(h2), .codex-markdown :deep(h3), .codex-markdown :deep(h4) { color: inherit; margin: 18px 0 8px; font-size: 1.05em; font-weight: 650; line-height: 1.4; }
.codex-markdown :deep(> :first-child) { margin-top: 0; }
.codex-markdown :deep(ul), .codex-markdown :deep(ol) { padding-left: 22px; margin: 0 0 12px; }
.codex-markdown :deep(li) { padding-left: 2px; margin: 4px 0; }
.codex-markdown :deep(li > p) { margin-bottom: 4px; }
.codex-markdown :deep(a) { padding: 0; color: var(--codex-pane-link); text-decoration: underline; text-underline-offset: 3px; border-radius: 2px; }
.codex-markdown :deep(a:hover) { background: transparent; text-decoration-thickness: 2px; }
.codex-markdown :deep(blockquote) { margin: 0 0 12px; padding: 2px 0 2px 12px; border-left: 3px solid var(--codex-pane-border); color: var(--codex-pane-muted); }
.codex-markdown :deep(code) { padding: 2px 5px; border-radius: 4px; background: var(--codex-pane-surface-soft); font: .88em/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: break-spaces; }
.codex-markdown :deep(pre) { max-width: 100%; max-height: 360px; overflow: auto; margin: 0 0 12px; padding: 12px; border: 1px solid var(--codex-pane-border); border-radius: 8px; background: var(--codex-pane-surface-soft); }
.codex-markdown :deep(pre code) { padding: 0; background: transparent; white-space: pre; overflow-wrap: normal; }
.codex-markdown :deep(.codex-table-scroll) { max-width: 100%; overflow-x: auto; margin: 4px 0 14px; border: 1px solid var(--codex-pane-border); border-radius: 8px; scrollbar-width: thin; }
.codex-markdown :deep(table) { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 1.5; font-variant-numeric: tabular-nums; }
.codex-markdown :deep(th), .codex-markdown :deep(td) { padding: 9px 12px; border-bottom: 1px solid var(--codex-pane-border); text-align: left; white-space: nowrap; }
.codex-markdown :deep(th) { background: var(--codex-pane-surface-soft); font-weight: 600; }
.codex-markdown :deep(tr:last-child td) { border-bottom: 0; }
.codex-markdown :deep(hr) { margin: 16px 0; border: 0; border-top: 1px solid var(--codex-pane-border); }
.codex-markdown :deep(a:focus-visible), .codex-markdown :deep(.codex-table-scroll:focus-visible) { outline: 2px solid var(--codex-pane-focus); outline-offset: 2px; }
</style>
