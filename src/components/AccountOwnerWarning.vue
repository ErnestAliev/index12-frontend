<script setup>
defineProps({
  active: { type: Boolean, default: false },
  label: { type: String, default: '' },
});
</script>

<template>
  <div :class="{ 'account-owner-warning': active }" :data-owner-repair="active ? label || 'account' : undefined">
    <p v-if="active" class="warning-message" role="alert">
      {{ label ? `${label}: ` : '' }}Нарушена связь счёта с владельцем. Выберите или создайте счёт и укажите владельца.
    </p>
    <slot />
  </div>
</template>

<style scoped>
.account-owner-warning {
  min-width: 0;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid #e9ba60;
  border-radius: 8px;
  background: #fff8e8;
}
.warning-message {
  margin: 0 0 12px;
  color: #805511;
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.account-owner-warning > :deep(:last-child) { margin-bottom: 0; }
</style>
