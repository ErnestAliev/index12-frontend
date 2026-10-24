<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import BaseSelect from './BaseSelect.vue';
import { useMainStore } from '@/stores/mainStore';
import { entityId } from '@/utils/subcategories.js';

const props = defineProps({
  modelValue: { type: [String, Object], default: null },
  categoryIds: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);
const store = useMainStore();
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
  { value: '--CREATE_NEW--', label: '+ Добавить подкатегорию' }
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
    <BaseSelect v-if="!creating" :model-value="entityId(modelValue)" :options="options" label="Подкатегория" :placeholder="parentIds.length ? 'Подкатегория' : 'Подкатегория — сначала выберите категорию'" :disabled="disabled || !parentIds.length" @update:model-value="select" />
    <template v-else>
      <BaseSelect v-if="parents.length > 1" v-model="parentId" :options="parents" label="Категория подкатегории" placeholder="Категория" :disabled="saving" />
      <div class="subcategory-create">
        <input ref="input" v-model="name" aria-label="Название подкатегории" placeholder="Название подкатегории" maxlength="120" :disabled="saving" @keydown.enter.prevent="save" @keydown.esc.prevent="creating = false" />
        <button type="button" aria-label="Сохранить подкатегорию" :disabled="saving || !name.trim()" @click="save">✓</button>
        <button type="button" aria-label="Отменить добавление подкатегории" :disabled="saving" @click="creating = false">✕</button>
      </div>
    </template>
    <p v-if="error" class="subcategory-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.subcategory-field { min-width: 0; margin-bottom: 8px; }
.subcategory-create { display: flex; gap: 6px; margin-top: 6px; }
.subcategory-create input { min-width: 0; flex: 1; height: 44px; padding: 0 12px; border: 1px solid #ddd; border-radius: 8px; background: #fff; color: #222; box-sizing: border-box; font: inherit; }
.subcategory-create button { width: 40px; flex-shrink: 0; border: 1px solid #ddd; border-radius: 8px; background: #fff; color: #222; cursor: pointer; }
.subcategory-error { color: #d32f2f; font-size: 12px; margin: 4px 0; }
</style>
