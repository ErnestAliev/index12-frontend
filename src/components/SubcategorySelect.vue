<script setup>
import UiIcon from '@/components/UiIcon.vue';
import { computed, nextTick, ref } from 'vue';
import BaseSelect from './BaseSelect.vue';
import { useOperationStore } from '@/composables/useOperationStore';
import { entityId } from '@/utils/subcategories.js';

const props = defineProps({
  modelValue: { type: [String, Object], default: null },
  disabled: { type: Boolean, default: false },
  hideSelectedLabel: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);
const store = useOperationStore();
const creating = ref(false);
const name = ref('');
const error = ref('');
const saving = ref(false);
const input = ref(null);
const options = computed(() => {
  const unique = new Map();
  for (const item of store.subcategories) {
    const key = item.name.trim().toLocaleLowerCase('ru-RU');
    if (!unique.has(key) || entityId(item) === entityId(props.modelValue)) unique.set(key, item);
  }
  return [
    { value: null, label: 'Без подкатегории' },
    ...[...unique.values()].map(item => ({ value: entityId(item), label: item.name })),
    ...(!store.chatFinance ? [{ value: '--CREATE_NEW--', label: '+ Создать подкатегорию', isSpecial: true }] : [])
  ];
});
const select = async value => {
  if (value === '--CREATE_NEW--') {
    creating.value = true;
    error.value = '';
    await nextTick(); input.value?.focus();
  } else emit('update:modelValue', value || null);
};
const save = async () => {
  if (saving.value || !name.value.trim()) return;
  saving.value = true; error.value = '';
  try {
    const item = await store.addSubcategory(name.value.trim());
    emit('update:modelValue', item._id);
    creating.value = false; name.value = '';
  } catch (e) { error.value = e.response?.data?.message || e.message || 'Не удалось сохранить подкатегорию'; }
  finally { saving.value = false; }
};
</script>

<template>
  <div class="subcategory-field input-spacing" data-testid="subcategory-field">
    <BaseSelect :hide-selected-label="hideSelectedLabel" v-if="!creating" :model-value="entityId(modelValue)" :options="options" label="Подкатегория" placeholder="Подкатегория" :disabled="disabled" @update:model-value="select" />
    <template v-else>
      <div class="subcategory-create">
        <input ref="input" v-model="name" aria-label="Название подкатегории" placeholder="Название подкатегории" maxlength="120" :disabled="saving" @keydown.enter.prevent="save" @keydown.esc.prevent="creating = false" />
        <button type="button" class="btn-inline-save" aria-label="Сохранить подкатегорию" :disabled="saving || !name.trim()" @click="save">✓</button>
        <button type="button" aria-label="Отменить добавление подкатегории" :disabled="saving" @click="creating = false" class="btn-inline-cancel ui-icon-button"><UiIcon name="close" /></button>
      </div>
    </template>
    <p v-if="error" class="subcategory-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.subcategory-field { min-width: 0; margin-bottom: 8px; }
.subcategory-create { display: flex; align-items: center; gap: 8px; }
.subcategory-create input { min-width: 0; flex: 1; height: 44px; margin: 0; padding: 0 12px; border: 1px solid var(--color-border, #e0e0e0); border-radius: 8px; background: var(--color-background-soft, #fff); color: var(--color-text, #1a1a1a); box-sizing: border-box; font: inherit; }
.subcategory-create button { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; flex-shrink: 0; border: 1px solid var(--color-border, #1a1a1a); border-radius: 8px; background: transparent; color: var(--color-text, #1a1a1a); font-size: 20px; cursor: pointer; }
.subcategory-create .btn-inline-cancel { border-color: var(--color-danger, #ff3b30); color: var(--color-danger, #ff3b30); }
.subcategory-create button:disabled { opacity: .6; cursor: not-allowed; }
.subcategory-error { color: #d32f2f; font-size: 12px; margin: 4px 0; }
</style>
