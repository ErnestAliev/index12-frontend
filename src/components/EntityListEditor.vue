<script setup>
import { ref, watch } from 'vue';
import draggable from 'vuedraggable';
import { useMainStore } from '@/stores/mainStore';
// Импортируем попап подтверждения
import ConfirmationPopup from './ConfirmationPopup.vue';

/**
 * * --- МЕТКА ВЕРСИИ: v2.0-ENTITY-DELETE ---
 * * ВЕРСИЯ: 2.0 - Добавлена функция удаления сущностей
 * ДАТА: 2025-11-16
 *
 * ЧТО ДОБАВЛЕНО:
 * 1. Кнопка "Удалить" (корзина) для каждого элемента списка.
 * 2. Попап подтверждения с выбором: "Удалить только сущность" или "Сущность + Операции".
 * 3. Интеграция с `mainStore.deleteEntity`.
 */

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true },
  // path нужен, чтобы знать, какую сущность удаляем ('accounts', 'companies' etc.)
  // В TheHeader мы передавали path в openEditPopup, но не в EntityListEditor.
  // Нужно пробросить его сюда.
});

// Но мы не можем менять сигнатуру пропсов "на лету" без изменения родителя.
// Однако TheHeader вызывает этот компонент так:
// :items="editorItems"
// Мы можем добавить пропс `entityPath` (или просто использовать путь из родителя, если передадим).
// Давайте добавим emits для удаления, чтобы родитель (TheHeader) сам решал, что делать.
// Это чище.

const emit = defineEmits(['close', 'save', 'delete-item']); 

// Локальная копия для редактирования порядка
const localItems = ref([]);

// Инициализация при открытии
watch(() => props.items, (newVal) => {
  localItems.value = JSON.parse(JSON.stringify(newVal));
}, { immediate: true, deep: true });

const handleSave = () => {
  // Обновляем order
  localItems.value.forEach((item, index) => {
    item.order = index;
  });
  emit('save', localItems.value);
};

// --- ЛОГИКА УДАЛЕНИЯ ---
const isDeletePopupVisible = ref(false);
const itemToDelete = ref(null);

const confirmDelete = (item) => {
  itemToDelete.value = item;
  isDeletePopupVisible.value = true;
};

const handleDelete = (deleteMode) => {
  // deleteMode: 'entity_only' | 'entity_and_ops'
  if (itemToDelete.value) {
      emit('delete-item', { 
          item: itemToDelete.value, 
          deleteOperations: deleteMode === 'entity_and_ops' 
      });
  }
  isDeletePopupVisible.value = false;
  itemToDelete.value = null;
};

</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <h3>{{ title }}</h3>
      
      <div class="list-container">
        <draggable 
          v-model="localItems" 
          item-key="_id" 
          handle=".drag-handle"
          class="drag-area"
        >
          <template #item="{ element }">
            <div class="list-item">
              <span class="drag-handle">☰</span>
              <input type="text" v-model="element.name" class="item-input" />
              
              <!-- 🔴 КНОПКА УДАЛЕНИЯ -->
              <button class="delete-btn" @click="confirmDelete(element)" title="Удалить">
                🗑️
              </button>
            </div>
          </template>
        </draggable>
      </div>

      <div class="popup-actions">
        <button @click="$emit('close')" class="btn-cancel">Отмена</button>
        <button @click="handleSave" class="btn-save">Сохранить</button>
      </div>
    </div>

    <!-- 🔴 ПОПАП ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ -->
    <div v-if="isDeletePopupVisible" class="popup-overlay nested-overlay">
        <div class="popup-content confirm-content">
            <h3>Удаление "{{ itemToDelete?.name }}"</h3>
            <p>Внимание! Это действие необратимо.</p>
            
            <div class="delete-options">
                <button class="btn-option" @click="handleDelete('entity_only')">
                    <strong>Только сущность</strong>
                    <small>Операции останутся, но поле будет пустым.</small>
                </button>
                
                <button class="btn-option danger" @click="handleDelete('entity_and_ops')">
                    <strong>Сущность и связи</strong>
                    <small>Все операции с этим счетом/компанией будут удалены!</small>
                </button>
            </div>
            
            <button @click="isDeletePopupVisible = false" class="btn-cancel-delete">Отмена</button>
        </div>
    </div>

  </div>
</template>

<style scoped>
/* (Старые стили) */
.popup-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex; justify-content: center; align-items: center; z-index: 2000;
}
.nested-overlay { z-index: 2100; background-color: rgba(0,0,0,0.7); }

.popup-content {
  background: white; padding: 20px; border-radius: 8px;
  width: 400px; max-height: 80vh; display: flex; flex-direction: column;
}
h3 { margin-top: 0; color: #333; }

.list-container { flex-grow: 1; overflow-y: auto; margin-bottom: 20px; border: 1px solid #eee; border-radius: 4px; padding: 5px; }
.list-item { display: flex; align-items: center; padding: 8px; background: #f9f9f9; margin-bottom: 5px; border-radius: 4px; }
.drag-handle { cursor: grab; margin-right: 10px; color: #aaa; font-size: 1.2em; }
.item-input { flex-grow: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px; }

/* 🔴 СТИЛИ УДАЛЕНИЯ */
.delete-btn {
    background: none; border: none; cursor: pointer; font-size: 1.2em; margin-left: 8px; opacity: 0.6;
    transition: opacity 0.2s;
}
.delete-btn:hover { opacity: 1; transform: scale(1.1); }

.confirm-content { max-width: 350px; text-align: center; }
.delete-options { display: flex; flex-direction: column; gap: 10px; margin: 20px 0; }

.btn-option {
    padding: 12px; border: 1px solid #ddd; border-radius: 8px; background: #f4f4f4;
    cursor: pointer; text-align: left; transition: background 0.2s;
}
.btn-option:hover { background: #e0e0e0; }
.btn-option.danger { border-color: #ffcccc; background: #fff0f0; color: #d32f2f; }
.btn-option.danger:hover { background: #ffe0e0; }

.btn-option strong { display: block; font-size: 1.1em; margin-bottom: 4px; }
.btn-option small { color: #666; font-size: 0.85em; }

.btn-cancel-delete { background: transparent; border: none; color: #666; cursor: pointer; text-decoration: underline; }

.popup-actions { display: flex; justify-content: flex-end; gap: 10px; }
.btn-cancel { padding: 8px 16px; background: #ccc; border: none; border-radius: 4px; cursor: pointer; }
.btn-save { padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
</style>
