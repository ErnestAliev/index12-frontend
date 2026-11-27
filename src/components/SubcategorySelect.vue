<script setup>
import UiIcon from '@/components/UiIcon.vue';
import { computed, nextTick, ref, watch } from 'vue';
import BaseSelect from './BaseSelect.vue';
import { useOperationStore } from '@/composables/useOperationStore';
import { entityId } from '@/utils/subcategories.js';

const props = defineProps({
  modelValue: { type: [String, Object], default: null },
  categoryIds: { type: Array, default: () => [] },
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
const parentId = ref(null);
const parentIds = computed(() => props.categoryIds.map(entityId).filter(Boolean));
const parents = computed(() => parentIds.value.map(id => ({ value: id, label: store.categories.find(item => entityId(item) === id)?.name || 'Категория' })));
const options = computed(() => [
  { value: null, label: 'Без подкатегории' },
  ...store.subcategories.filter(item => parentIds.value.includes(entityId(item.parentCategoryId))).map(item => ({ value: item._id, label: parents.value.length > 1 ? `${parents.value.find(parent => parent.value === entityId(item.parentCategoryId))?.label} → ${item.name}` : item.name })),
  ...(!store.chatFinance ? [{ value: '--CREATE_NEW--', label: '+ Создать подкатегорию', isSpecial: true }] : [])
]);
watch(() => parentIds.value.join('|'), () => {
  const ids = parentIds.value;
  if (!ids.includes(parentId.value)) parentId.value = ids[0] || null;
  const selected = store.subcategories.find(item => entityId(item) === entityId(props.modelValue));
  if (selected && !ids.includes(entityId(selected.parentCategoryId))) emit('update:modelValue', null);
  creating.value = false;
}, { immediate: true });
const select = async value => {
  if (value === '--CREATE_NEW--') {
    creating.value = true;
    error.value = '';
    await nextTick(); input.value?.focus();
  } else emit('update:modelValue', value || null);
};
const save = async () => {
  if (saving.value || !name.value.trim() || !parentId.value) return;
  saving.value = true; error.value = '';
  try {
    const item = await store.addSubcategory(name.value.trim(), parentId.value);
    emit('update:modelValue', item._id);
    creating.value = false; name.value = '';
  } catch (e) { error.value = e.response?.data?.message || e.message || 'Не удалось сохранить подкатегорию'; }
  finally { saving.value = false; }
};
</script>

<template>
  <div class="subcategory-field input-spacing" data-testid="subcategory-field">
    <BaseSelect :hide-selected-label="hideSelectedLabel" v-if="!creating" :model-value="entityId(modelValue)" :options="options" label="Подкатегория" :placeholder="parentIds.length ? 'Подкатегория' : 'Подкатегория — сначала выберите категорию'" :disabled="disabled || !parentIds.length" @update:model-value="select" />
    <template v-else>
      <BaseSelect :hide-selected-label="hideSelectedLabel" v-if="parents.length > 1" v-model="parentId" :options="parents" label="Категория подкатегории" placeholder="Категория" :disabled="saving" />
      <div class="subcategory-create">
        <input ref="input" v-model="name" aria-label="Название подкатегории" placeholder="Название подкатегории" maxlength="120" :disabled="saving" @keydown.enter.prevent="save" @keydown.esc.prevent="creating = false" />
        <button type="button" class="btn-inline-save" aria-label="Сохранить подкатегорию" :disabled="saving || !name.trim() || !parentId" @click="save">✓</button>
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
