<script setup>
import { computed } from 'vue';
import CodexGlyph from './CodexGlyph.vue';
const props = defineProps({ file: { type: Object, required: true }, removable: Boolean, disabled: Boolean, loading: Boolean });
const emit = defineEmits(['remove', 'download']);
const extension = computed(() => props.file.name?.split('.').at(-1)?.toUpperCase().slice(0, 5) || 'ФАЙЛ');
const kind = computed(() => /^(XLSX?|XLSM|CSV)$/.test(extension.value) ? 'sheet' : extension.value === 'PDF' ? 'pdf' : 'document');
const size = computed(() => props.file.size >= 1024 * 1024 ? `${(props.file.size / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.ceil((props.file.size || 0) / 1024))} КБ`);
</script>

<template>
  <div class="codex-file-card" :class="[{ draft: removable }, kind]" :aria-busy="loading || undefined">
    <component :is="removable ? 'div' : 'button'" :type="removable ? undefined : 'button'" class="codex-file-body" :class="{ 'desktop-file-link': !removable }"
      :disabled="removable ? undefined : disabled || loading" :title="file.name" :aria-label="removable ? undefined : `Скачать ${file.name}`" @click="!removable && emit('download')">
      <img v-if="file.previewUrl" class="codex-file-thumbnail" :src="file.previewUrl" alt="" />
      <span v-else class="codex-file-symbol"><CodexGlyph name="file" /><span>{{ extension }}</span></span>
      <span class="codex-file-details">
        <span class="desktop-file-name" :title="file.name">{{ file.name }}</span>
        <span class="codex-file-meta">{{ loading ? (removable ? 'Загрузка…' : 'Скачивание…') : size }}</span>
      </span>
      <CodexGlyph v-if="!removable" :name="loading ? 'loader' : 'download'" class="codex-file-download" />
    </component>
    <button v-if="removable" type="button" class="codex-file-remove" :disabled="disabled" :aria-label="`Убрать ${file.name}`" :title="`Убрать ${file.name}`" @click="emit('remove')"><CodexGlyph :name="loading ? 'loader' : 'close'" /></button>
  </div>
</template>

<style scoped>
.codex-file-card { box-sizing: border-box; display: flex; align-items: center; gap: 6px; width: 272px; max-width: 100%; min-width: 0; padding: 8px; border: 1px solid var(--codex-pane-border); border-radius: 10px; background: var(--codex-pane-surface); color: var(--codex-pane-text); }
.codex-file-body { box-sizing: border-box; display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 10px; flex: 1; min-width: 0; width: 100%; margin: 0; padding: 0; border: 0; border-radius: 5px; background: transparent; color: inherit; text-align: left; font: inherit; }
button.codex-file-body { cursor: pointer; }
button.codex-file-body:disabled { cursor: wait; }
button.codex-file-body:hover { background: transparent; }
.codex-file-card:has(button.codex-file-body:hover) { border-color: var(--codex-pane-muted); background: var(--codex-pane-hover); }
.codex-file-details { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.desktop-file-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 500; line-height: 16px; }
.codex-file-meta { color: var(--codex-pane-muted); font-size: 11px; line-height: 14px; white-space: nowrap; }
.codex-file-symbol, .codex-file-thumbnail { box-sizing: border-box; width: 36px; height: 40px; border-radius: 6px; flex: none; }
.codex-file-symbol { position: relative; display: grid; place-items: start center; padding-top: 2px; color: var(--codex-pane-muted); background: var(--codex-pane-surface-soft); }
.codex-file-symbol :deep(svg) { width: 24px; height: 24px; }
.codex-file-symbol > span { position: absolute; bottom: 3px; font-size: 8px; font-weight: 700; line-height: 10px; letter-spacing: .3px; }
.sheet .codex-file-symbol { color: var(--codex-pane-accent); background: var(--codex-pane-accent-soft); }
.pdf .codex-file-symbol { color: var(--codex-pane-danger); background: var(--codex-pane-danger-soft); }
.codex-file-thumbnail { display: block; object-fit: cover; }
.codex-file-remove { box-sizing: border-box; display: grid; place-items: center; align-self: center; width: 28px; height: 28px; min-width: 28px; padding: 0; margin: 0; border: 0; border-radius: 6px; background: transparent; color: var(--codex-pane-muted); cursor: pointer; }
.codex-file-remove :deep(svg) { width: 15px; height: 15px; }
.codex-file-remove:hover:not(:disabled) { background: var(--codex-pane-hover); color: var(--codex-pane-text); }
.codex-file-remove:disabled { cursor: wait; opacity: .5; }
.codex-file-download { width: 16px; height: 16px; color: var(--codex-pane-muted); }
button:focus-visible { outline: 2px solid var(--codex-pane-focus); outline-offset: 3px; }
@container codex-window (max-height: 420px) { .codex-file-card { padding: 6px; } .codex-file-symbol, .codex-file-thumbnail { height: 32px; } .codex-file-symbol > span { bottom: 0; } .codex-file-symbol :deep(svg) { width: 20px; height: 20px; } }
@media (pointer: coarse) { .codex-file-remove { width: 36px; height: 36px; min-width: 36px; } }
</style>
