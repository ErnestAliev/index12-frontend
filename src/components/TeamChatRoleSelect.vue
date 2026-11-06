<script setup>
import UiIcon from "./UiIcon.vue";
defineProps({ value: String, roles: Object, label: String, disabled: Boolean });
defineEmits(["change"]);
</script>
<template>
  <span class="team-role-select">
    <select
      class="team-role-input"
      :value="value"
      :aria-label="label"
      :disabled="disabled"
      @change="$emit('change', $event)"
    >
      <option v-for="(name, role) in roles" :key="role" :value="role">
        {{ role === "director" ? "Руководитель" : name }}
      </option>
    </select>
    <UiIcon name="chevron-down" />
  </span>
</template>
<style scoped>
.team-role-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
  max-width: 160px;
  min-width: 0;
}
.team-role-select select.team-role-input {
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  min-width: 0;
  margin: 0;
  padding: 0 25px 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--codex-pane-text);
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
  text-overflow: ellipsis;
}
.team-role-select select:hover {
  background: var(--codex-pane-surface);
  border-color: var(--codex-pane-border);
}
.team-role-select select:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 1px;
}
.team-role-select select:disabled {
  opacity: 0.5;
  cursor: default;
}
.team-role-select option {
  color: var(--codex-pane-text);
  background: var(--codex-pane-surface);
}
.team-role-select .ui-icon {
  position: absolute;
  right: 7px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  pointer-events: none;
  color: var(--codex-pane-muted);
}
@media (max-width: 480px) {
  .team-role-select select.team-role-input {
    height: 44px;
  }
}
</style>
