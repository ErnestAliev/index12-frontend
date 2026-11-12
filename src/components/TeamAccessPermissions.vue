<script setup>
defineProps({
  modelValue: { type: Object, required: true },
  disabled: Boolean,
});
const emit = defineEmits(["update:modelValue"]);
const sections = [
  ["chat", "Рабочий чат"],
  ["system", "Финансы · чтение"],
  ["onec", "1С · только чтение"],
];
</script>
<template>
  <fieldset class="access-permissions" :disabled="disabled">
    <legend>Доступ через ChatGPT/MCP</legend>
    <label v-for="[key, label] in sections" :key="key">
      <input
        type="checkbox"
        :checked="modelValue[key] === true"
        @change="
          emit('update:modelValue', {
            ...modelValue,
            [key]: $event.target.checked,
          })
        "
      />
      <span>{{ label }}</span>
    </label>
    <p class="access-private">Codex владельца · закрыт</p>
    <p class="access-private">Личный календарь · закрыт</p>
  </fieldset>
</template>
<style scoped>
.access-permissions {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.access-permissions legend {
  padding: 0;
  font-size: 12px;
  color: var(--codex-pane-muted);
}
.access-permissions label {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  cursor: pointer;
}
.access-permissions input[type="checkbox"] {
  width: 18px;
  height: 18px;
  min-height: 18px;
  padding: 0;
  flex: none;
  accent-color: var(--codex-pane-accent);
}
.access-private {
  margin: 8px 0;
  font-size: 12px;
  color: var(--codex-pane-muted);
}
.access-permissions:disabled {
  opacity: 0.65;
}
</style>
