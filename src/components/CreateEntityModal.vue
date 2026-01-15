<script setup>
import { ref, computed, nextTick } from 'vue';
import { useMainStore } from '@/stores/mainStore';

const props = defineProps({
  entityType: { type: String, required: true } // 'accounts', 'companies', etc.
});

const emit = defineEmits(['close', 'created']);

const mainStore = useMainStore();
const newItemName = ref('');
const newItemInputRef = ref(null);
const isSaving = ref(false);

// Entity name for display
const entityDisplayName = computed(() => {
  const names = {
    accounts: 'счет',
    companies: 'компанию',
    individuals: 'физлицо',
    contractors: 'контрагента',
    projects: 'проект',
    categories: 'категорию'
  };
  return names[props.entityType] || 'объект';
});

const entityTitleName = computed(() => {
  const names = {
    accounts: 'Новый счет',
    companies: 'Новая компания',
    individuals: 'Новое физлицо',
    contractors: 'Новый контрагент',
    projects: 'Новый проект',
    categories: 'Новая категория'
  };
  return names[props.entityType] || 'Создание';
});

// Auto-focus input on mount
nextTick(() => {
  if (newItemInputRef.value) {
    newItemInputRef.value.focus();
  }
});

const handleCreate = async () => {
  const name = newItemName.value.trim();
  if (!name) return;
  
  isSaving.value = true;
  try {
    let newItem = null;
    
    switch (props.entityType) {
      case 'accounts':
        newItem = await mainStore.addAccount(name);
        break;
      case 'companies':
        newItem = await mainStore.addCompany(name);
        break;
      case 'individuals':
        newItem = await mainStore.addIndividual(name);
        break;
      case 'contractors':
        newItem = await mainStore.addContractor(name);
        break;
      case 'projects':
        newItem = await mainStore.addProject(name);
        break;
      case 'categories':
        newItem = await mainStore.addCategory(name);
        break;
    }
    
    if (newItem) {
      emit('created', newItem);
      emit('close');
    }
  } catch (error) {
    console.error('Error creating entity:', error);
    alert('Ошибка при создании: ' + error.message);
  } finally {
    isSaving.value = false;
  }
};

const handleClose = () => {
  if (!isSaving.value) {
    emit('close');
  }
};
</script>

<template>
  <div class="modal-overlay" @click.self="handleClose">
    <div class="create-modal">
      <div class="modal-header">
        <h3>{{ entityTitleName }}</h3>
        <button class="close-btn" @click="handleClose" :disabled="isSaving">&times;</button>
      </div>
      
      <div class="modal-body">
        <input
          ref="newItemInputRef"
          v-model="newItemName"
          type="text"
          class="name-input"
          :placeholder="`Введите название (${entityDisplayName})`"
          @keyup.enter="handleCreate"
          @keyup.esc="handleClose"
          :disabled="isSaving"
        />
      </div>
      
      <div class="modal-footer">
        <button class="btn-cancel" @click="handleClose" :disabled="isSaving">
          Отмена
        </button>
        <button 
          class="btn-create" 
          @click="handleCreate" 
          :disabled="!newItemName.trim() || isSaving"
        >
          {{ isSaving ? 'Создание...' : 'Создать' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4000;
  backdrop-filter: blur(2px);
}

.create-modal {
  background: var(--color-background);
  border-radius: 12px;
  width: 90%;
  max-width: 450px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--color-heading);
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: var(--color-text-soft);
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.close-btn:hover:not(:disabled) {
  color: var(--color-text);
}

.close-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-body {
  padding: 24px;
}

.name-input {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  font-size: 15px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  color: var(--color-text);
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.name-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.name-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.btn-cancel,
.btn-create {
  height: 40px;
  padding: 0 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-cancel {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.btn-cancel:hover:not(:disabled) {
  background: var(--color-background-mute);
}

.btn-create {
  background: var(--color-primary);
  color: white;
  min-width: 120px;
}

.btn-create:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-create:disabled,
.btn-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
