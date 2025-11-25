<script setup>
import { ref, computed } from 'vue';

/**
 * * --- КОМПОНЕНТ: MultiSelectModal v1.1 - HTML TITLE ---
 * * ВЕРСИЯ: 1.1 - Поддержка HTML в заголовке
 * * ДАТА: 2025-11-25
 * * ЧТО ИЗМЕНЕНО:
 * 1. (UI) Заголовок h4 теперь использует v-html для поддержки стилизации (жирный, цвет).
 */

const props = defineProps({
  title: { type: String, default: 'Выберите элементы' },
  items: { type: Array, default: () => [] }, // { _id, name }
  initialSelectedIds: { type: Array, default: () => [] },
  hintText: { type: String, default: '' }
});

const emit = defineEmits(['close', 'save']);

const localSelectedIds = ref(new Set(props.initialSelectedIds));
const searchQuery = ref('');

const filteredItems = computed(() => {
  if (!searchQuery.value) return props.items;
  const q = searchQuery.value.toLowerCase();
  return props.items.filter(i => i.name.toLowerCase().includes(q));
});

const toggleItem = (id) => {
  if (localSelectedIds.value.has(id)) {
    localSelectedIds.value.delete(id);
  } else {
    localSelectedIds.value.add(id);
  }
};

const handleSave = () => {
  emit('save', Array.from(localSelectedIds.value));
};
</script>

<template>
  <div class="picker-overlay" @click.self="$emit('close')">
    <div class="picker-content">
      <!-- 🟢 ИЗМЕНЕНО: v-html для поддержки форматирования текста -->
      <h4 v-html="title"></h4>
      
      <div v-if="hintText" class="picker-hint" v-html="hintText"></div>

      <!-- Поиск (если элементов много) -->
      <div class="search-box" v-if="items.length > 5">
         <input type="text" v-model="searchQuery" placeholder="Поиск..." class="search-input" />
      </div>
      
      <div class="items-list-scroll">
        <label v-for="item in filteredItems" :key="item._id" class="list-item">
          <input
            type="checkbox"
            :checked="localSelectedIds.has(item._id)"
            @change="toggleItem(item._id)"
          />
          <span class="item-name">{{ item.name }}</span>
        </label>
        <div v-if="!filteredItems.length" class="item-empty">
          Список пуст.
        </div>
      </div>
      
      <div class="picker-footer">
        <button @click="$emit('close')" class="btn btn-secondary">Отмена</button>
        <button @click="handleSave" class="btn btn-primary">Сохранить ({{ localSelectedIds.size }})</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.7); z-index: 1005;
  display: flex; justify-content: center; align-items: center;
}
.picker-content {
  width: 100%; max-width: 400px; background: #F4F4F4;
  border-radius: 12px; color: #1a1a1a; box-shadow: 0 10px 40px rgba(0,0,0,0.3);
  margin: 1rem; display: flex; flex-direction: column; overflow: hidden; max-height: 80vh;
}
h4 { 
  margin: 0; padding: 1.5rem; 
  font-size: 18px; font-weight: 600; 
  text-align: center; 
  border-bottom: 1px solid #e0e0e0; 
  line-height: 1.4;
}
.picker-hint { padding: 0 1.5rem 1rem; font-size: 0.9em; color: #666; text-align: center; border-bottom: 1px solid #e0e0e0; }

.search-box { padding: 10px 1.5rem 0; }
.search-input { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; background: #fff; color: #333; }

.items-list-scroll { padding: 1rem 1.5rem; overflow-y: auto; flex-grow: 1; display: flex; flex-direction: column; gap: 6px; }
.list-item { display: flex; align-items: center; cursor: pointer; padding: 8px; border-radius: 6px; transition: background 0.2s; }
.list-item:hover { background-color: #e9e9e9; }
.list-item input { width: 18px; height: 18px; margin-right: 12px; accent-color: #222; }
.item-name { font-size: 15px; color: #333; }
.item-empty { text-align: center; color: #888; padding: 1rem; }

.picker-footer { display: flex; gap: 10px; padding: 1rem 1.5rem; border-top: 1px solid #e0e0e0; background: #f9f9f9; }
.btn { flex: 1; height: 44px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; }
.btn-secondary { background: #e0e0e0; color: #333; }
.btn-secondary:hover { background: #d1d1d1; }
.btn-primary { background: #222; color: #fff; }
.btn-primary:hover { background: #444; }
</style>