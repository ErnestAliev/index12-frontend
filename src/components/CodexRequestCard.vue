<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import CodexGlyph from './CodexGlyph.vue';
const props = defineProps({ request: { type: Object, required: true }, submitting: Boolean, error: String });
const emit = defineEmits(['answer']);
const form = ref(null), values = ref(Object.create(null)), localError = ref('');
const prompt = computed(() => props.request.prompt);
for (const field of props.request.prompt.fields || []) if (field.default !== undefined) values.value[field.key] = field.type === 'json' ? JSON.stringify(field.default) : field.default;
function submit(action) {
  localError.value = '';
  const answers = Object.create(null);
  try {
    if (action === 'accept') for (const field of prompt.value.fields || []) {
      const value = values.value[field.key];
      if (value === '' || value == null) { if (field.required) throw new Error(`Заполните поле «${field.label}».`); continue; }
      answers[field.key] = field.type === 'json' ? JSON.parse(value) : ['number', 'integer'].includes(field.type) ? Number(value) : value;
    }
    emit('answer', { action, values: answers });
  } catch (error) { localError.value = error instanceof SyntaxError ? 'Проверьте формат JSON в поле ответа.' : error.message; }
}
onMounted(() => nextTick(() => form.value?.querySelector('input, select, textarea, button')?.focus({ preventScroll: true })));
</script>

<template>
  <form ref="form" class="codex-request-card" :aria-label="prompt.kind === 'questions' ? 'Вопрос Codex' : 'Запрос разрешения Codex'" :aria-busy="submitting" @submit.prevent="submit('accept')">
    <div class="request-heading"><CodexGlyph name="alert" /><strong>{{ prompt.kind === 'questions' ? 'Вопрос Codex' : prompt.kind === 'approval' ? 'Требуется разрешение' : 'Требуется ваш ответ' }}</strong><span v-if="prompt.source">{{ prompt.source }}</span></div>
    <p class="request-message">{{ prompt.message }}</p>
    <pre v-if="prompt.details" class="request-details">{{ prompt.details }}</pre>
    <fieldset v-for="(field, index) in prompt.fields || []" :key="field.key" :disabled="submitting" class="request-field">
      <legend>{{ field.label }}</legend>
      <template v-if="field.type === 'choice'">
        <label v-for="(option, optionIndex) in field.options" :key="optionIndex" class="request-option">
          <input v-model="values[field.key]" type="radio" :name="`${request.id}-${index}`" :value="option.value" :required="field.required && !field.other" />
          <span><span>{{ option.label }}</span><small v-if="option.description">{{ option.description }}</small></span>
        </label>
        <input v-if="field.other" v-model="values[field.key]" class="request-input" :aria-label="`${field.label}: свой ответ`" placeholder="Свой ответ" maxlength="8000" />
      </template>
      <select v-else-if="field.type === 'select' || field.type === 'boolean'" v-model="values[field.key]" class="request-input" :aria-label="field.label" :required="field.required">
        <option :value="undefined" disabled>Выберите ответ</option>
        <template v-if="field.type === 'boolean'"><option :value="true">Да</option><option :value="false">Нет</option></template>
        <template v-else><option v-for="(option, optionIndex) in field.options || []" :key="optionIndex" :value="option.value">{{ option.label }}</option></template>
      </select>
      <textarea v-else-if="field.type === 'json'" v-model="values[field.key]" class="request-input request-json" :aria-label="field.label" :required="field.required" rows="3" spellcheck="false" />
      <input v-else v-model="values[field.key]" class="request-input" :type="['number', 'integer'].includes(field.type) ? 'number' : field.format === 'date' ? 'date' : 'text'" :step="field.type === 'integer' ? '1' : 'any'" :min="field.min" :max="field.max" :maxlength="field.maxLength || 8000" :aria-label="field.label" :required="field.required" />
    </fieldset>
    <a v-if="prompt.url" class="request-url" :href="prompt.url" target="_blank" rel="noopener noreferrer"><CodexGlyph name="external" />Открыть страницу подтверждения</a>
    <div v-if="error || localError" class="request-error" role="alert">{{ error || localError }}</div>
    <div class="request-actions">
      <button type="button" :disabled="submitting" @click="submit('cancel')">Отмена</button>
      <button v-if="prompt.kind !== 'questions'" type="button" :disabled="submitting" @click="submit('decline')">Отклонить</button>
      <button type="submit" class="request-primary" :disabled="submitting"><CodexGlyph v-if="submitting" name="loader" />{{ prompt.kind === 'approval' ? 'Разрешить' : prompt.kind === 'url' ? 'Подтверждение завершено' : 'Ответить' }}</button>
    </div>
  </form>
</template>

<style scoped>
.codex-request-card { box-sizing: border-box; flex: none; width: 100%; min-width: 0; padding: 14px; border: 1px solid var(--codex-pane-focus); border-radius: 12px; color: var(--codex-pane-text); background: var(--codex-pane-surface); font-size: 13px; line-height: 1.5; }
.request-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.request-heading > span { margin-left: auto; color: var(--codex-pane-muted); font-size: 11px; overflow-wrap: anywhere; }
.request-heading :deep(svg) { color: var(--codex-pane-focus); }
.request-message { margin: 0 0 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.request-details { max-height: 180px; overflow: auto; margin: 0 0 12px; padding: 10px; border: 1px solid var(--codex-pane-border); border-radius: 8px; background: var(--codex-pane-bg); font: 12px/1.5 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.request-field { display: block; min-width: 0; margin: 0 0 14px; padding: 0; border: 0; }
.request-field legend { margin: 0 0 7px; padding: 0; font-weight: 500; overflow-wrap: anywhere; }
.request-input { box-sizing: border-box; display: block; width: 100%; min-width: 0; height: 38px; margin: 0; padding: 8px 10px; border: 1px solid var(--codex-pane-border); border-radius: 8px; background: var(--codex-pane-bg); color: inherit; font: inherit; }
.request-json { height: auto; resize: vertical; max-height: 200px; font-family: ui-monospace, monospace; }
.request-option { display: flex; align-items: flex-start; gap: 8px; padding: 9px; margin: 5px 0; border: 1px solid var(--codex-pane-border); border-radius: 8px; cursor: pointer; }
.request-option:has(input:checked) { border-color: var(--codex-pane-focus); background: var(--codex-pane-focus-soft); }
.request-option input { flex: none; width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--codex-pane-accent); }
.request-option small { display: block; margin-top: 3px; color: var(--codex-pane-muted); }
.request-url { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 12px; padding: 0; color: var(--codex-pane-link); }
.request-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; margin-top: 12px; }
.request-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; margin: 0; padding: 6px 10px; border: 1px solid var(--codex-pane-border); border-radius: 8px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.request-actions button:hover:not(:disabled) { background: var(--codex-pane-hover); }
.request-actions .request-primary { border-color: transparent; background: var(--codex-pane-accent); color: var(--codex-pane-send-text); }
.request-actions .request-primary:hover:not(:disabled) { background: var(--codex-pane-accent); filter: brightness(1.08); }
.request-actions button:disabled { opacity: .55; cursor: wait; }
.request-input:focus-visible, .request-option input:focus-visible, .request-actions button:focus-visible, .request-url:focus-visible { outline: 2px solid var(--codex-pane-focus); outline-offset: 2px; }
.request-error { margin-top: 8px; color: var(--codex-pane-danger); overflow-wrap: anywhere; }
@container codex-window (max-width: 380px) { .request-actions button { flex: 1; } .request-actions .request-primary { flex-basis: 100%; order: -1; } }
@media (pointer: coarse) { .request-input { font-size: 16px; min-height: 42px; } .request-actions button { min-height: 40px; } }
</style>
