<script setup>
import { ref } from 'vue';

const props = defineProps({
  title: { type: String, required: true },
  initialValue: { type: String, default: '' },
  showDelete: { type: Boolean, default: false } // 🔴 Разрешить удаление?
});

const emit = defineEmits(['close', 'save', 'delete']);
const inputValue = ref(props.initialValue);

// --- ЛОГИКА УДАЛЕНИЯ ---
const showDeleteConfirm = ref(false);
const isDeleting = ref(false);

const handleDeleteClick = () => {
  showDeleteConfirm.value = true;
};

const confirmDelete = (deleteOperations) => {
  isDeleting.value = true;
  emit('delete', { deleteOperations, done: () => isDeleting.value = false });
  // Примечание: Родитель (TheHeader) должен обработать удаление 
  // и закрыть попап. Если ошибка - вызвать done().
};

const cancelDelete = () => {
  if (isDeleting.value) return;
  showDeleteConfirm.value = false;
};
</script>

<template>
  <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content">
      <h3>{{ title }}</h3>
      
      <input 
        type="text" 
        v-model="inputValue" 
        placeholder="Введите название..." 
        class="popup-input"
        @keyup.enter="$emit('save', inputValue)"
      />
          
      <div class="popup-actions">
        <button @click="$emit('save', inputValue)" class="btn-submit">
          Сохранить
        </button>
        
        <!-- 🔴 КНОПКА УДАЛЕНИЯ (только если showDelete=true) -->
        <button v-if="showDelete" class="btn-delete" @click="handleDeleteClick" title="Удалить">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <polyline points="3 6 5 6 21 6"></polyline>
             <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- 🔴 ВСТРОЕННЫЙ МОДАЛ УДАЛЕНИЯ (Копия логики из ListEditor) -->
    <div v-if="showDeleteConfirm" class="inner-overlay" @click.self="cancelDelete">
      <div class="delete-confirm-box">
        
        <div v-if="isDeleting" class="deleting-state">
           <div class="spinner"></div>
           <h4>Удаление...</h4>
           <p>Пожалуйста, подождите.</p>
        </div>
        
        <div v-else>
          <h4>Удаление</h4>
          <p>Что делать со связанными операциями?</p>
          
          <div class="delete-options">
             <button class="btn-opt btn-keep" @click="confirmDelete(false)">
                <strong>Только сущность</strong>
                <small>Операции отвяжутся</small>
             </button>
             <button class="btn-opt btn-nuke" @click="confirmDelete(true)">
                <strong>Всё вместе</strong>
                <small>Удалить и операции</small>
             </button>
          </div>
          
          <button class="btn-cancel" @click="cancelDelete">Отмена</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.popup-overlay {
  position: fixed; top: 0; left: 0;
  width: 100%; height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex; justify-content: center; align-items: center;
  z-index: 1000;
}
.popup-content {
  background: #F4F4F4; padding: 2rem;
  border-radius: 12px; color: #1a1a1a;
  width: 100%; max-width: 400px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  margin: 1rem; position: relative;
}
h3 { color: #1a1a1a; margin-top: 0; margin-bottom: 1.5rem; }

.popup-input {
  width: 100%; height: 50px; padding: 0 1rem;
  margin-bottom: 1.5rem; border: 1px solid #ccc;
  border-radius: 8px; font-size: 16px;
  box-sizing: border-box;
}
.popup-input:focus { outline: none; border-color: #333; }

.popup-actions {
  display: flex; gap: 10px;
}
.btn-submit {
  flex-grow: 1; height: 50px;
  background-color: #222; color: white;
  border: none; border-radius: 8px;
  font-size: 16px; font-weight: 600; cursor: pointer;
}
.btn-submit:hover { background-color: #444; }

/* Стили кнопки удаления */
.btn-delete {
  width: 50px; height: 50px; flex-shrink: 0;
  border: 1px solid #E0E0E0; background: #fff;
  border-radius: 8px; color: #999;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.2s;
}
.btn-delete:hover {
  border-color: #FF3B30; color: #FF3B30; background: #fff5f5;
}

/* Внутренний модал */
.inner-overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.3); border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  z-index: 10;
}
.delete-confirm-box {
  background: #fff; padding: 20px; border-radius: 12px;
  width: 85%; text-align: center;
  box-shadow: 0 5px 15px rgba(0,0,0,0.15);
}
.delete-confirm-box h4 { margin: 0 0 10px; }
.delete-options { display: flex; flex-direction: column; gap: 8px; margin: 15px 0; }

.btn-opt {
  border: 1px solid #ddd; background: #fff; border-radius: 8px;
  padding: 10px; cursor: pointer; text-align: left;
  display: flex; flex-direction: column;
}
.btn-opt:hover { background: #f9f9f9; border-color: #ccc; }
.btn-nuke:hover { border-color: #FF3B30; background: #FFF0F0; color: #FF3B30; }

.btn-cancel { background: none; border: none; text-decoration: underline; color: #888; cursor: pointer; }
.deleting-state { display: flex; flex-direction: column; align-items: center; }
.spinner {
  width: 24px; height: 24px; border: 3px solid #eee; border-top-color: #333;
  border-radius: 50%; animation: spin 1s infinite linear; margin-bottom: 10px;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
