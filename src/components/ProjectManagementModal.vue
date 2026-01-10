<template>
  <div class="project-modal-overlay" @click.self="$emit('close')">
    <div class="project-modal">
      <div class="project-header">
        <h2>Управление проектами</h2>
        <div class="header-actions">
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="Поиск проектов..."
            class="search-input"
          />
          <button class="close-btn" @click="$emit('close')">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="project-toolbar">
        <button class="btn-create" @click="openCreateDialog">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Создать проект
        </button>
        <select v-model="sortMode" class="sort-select">
          <option value="order">По порядку</option>
          <option value="name">По названию</option>
          <option value="date">По дате создания</option>
        </select>
      </div>

      <div class="project-body">
        <div v-if="isLoading" class="loading-spinner">
          <div class="spinner"></div>
          <p>Загрузка дашбоардов..</p>
        </div>
        
        <div v-else-if="filteredProjects.length === 0" class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <line x1="9" y1="9" x2="15" y2="9"></line>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
          <p>{{ searchQuery ? 'Проекты не найдены' : 'Нет проектов' }}</p>
          <button v-if="!searchQuery" class="btn-create-empty" @click="openCreateDialog">
            Создать первый проект
          </button>
        </div>

        <div v-else class="projects-grid">
          <div
            v-for="project in filteredProjects"
            :key="project._id"
            class="project-card"
            :style="{ borderLeftColor: project.color || 'var(--color-primary)' }"
          >
            <div class="project-info">
              <div class="project-name-row">
                <input
                  v-if="editingId === project._id"
                  v-model="editingName"
                  @blur="saveRename(project._id)"
                  @keyup.enter="saveRename(project._id)"
                  @keyup.esc="cancelRename"
                  class="project-name-input"
                  ref="nameInput"
                />
                <h3 v-else @dblclick="startRename(project)">{{ project.name }}</h3>
                <div 
                  class="project-color-badge" 
                  :style="{ backgroundColor: project.color || 'var(--color-primary)' }"
                  @click="openColorPicker(project)"
                  :title="'Цвет: ' + (project.color || 'По умолчанию')"
                ></div>
              </div>
              
              <p v-if="project.description" class="project-description">
                {{ project.description }}
              </p>
              
              <div class="project-meta">
                <span class="meta-item">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  {{ formatDate(project.createdAt) }}
                </span>
                <span class="meta-item" v-if="project.order !== undefined">
                  Порядок: {{ project.order }}
                </span>
              </div>
            </div>

            <div class="project-actions">
              <button class="btn-edit" @click="openEditDialog(project)" title="Редактировать">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn-delete" @click="deleteProject(project)" title="Удалить">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <div v-if="showFormDialog" class="form-dialog-overlay" @click.self="closeFormDialog">
      <div class="form-dialog">
        <h3>{{ isEditMode ? 'Редактировать проект' : 'Создать проект' }}</h3>
        
        <div v-if="isSaving" class="saving-loader">
          <div class="spinner"></div>
          <p>{{ isEditMode ? 'Сохранение...' : 'Создание проекта...' }}</p>
        </div>
        
        <template v-else>
          <div class="form-group">
            <label>Название проекта *</label>
            <input
              v-model="formData.name"
              @keyup.enter="handleSave"
              placeholder="Введите название"
              class="form-input"
              ref="formNameInput"
            />
            <span v-if="formError" class="error-message">{{ formError }}</span>
          </div>

          <div class="form-group">
            <label>Описание</label>
            <textarea
              v-model="formData.description"
              placeholder="Опциональное описание проекта"
              class="form-textarea"
              rows="3"
            ></textarea>
          </div>

          <div class="form-group">
            <label>Цвет</label>
            <div class="color-picker">
              <input
                type="color"
                v-model="formData.color"
                class="color-input"
              />
              <span class="color-value">{{ formData.color || '#FF9D00' }}</span>
              <button 
                v-if="formData.color" 
                @click="formData.color = null" 
                class="btn-clear-color"
                type="button"
              >
                Сбросить
              </button>
            </div>
          </div>

          <div class="form-group">
            <label>Порядок сортировки</label>
            <input
              type="number"
              v-model.number="formData.order"
              placeholder="Автоматически"
              class="form-input"
              min="0"
            />
          </div>

          <div class="dialog-actions">
            <button class="btn-cancel" @click="closeFormDialog">Отмена</button>
            <button 
              class="btn-save" 
              @click="handleSave" 
              :disabled="!isFormValid"
            >
              {{ isEditMode ? 'Сохранить' : 'Создать' }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <div v-if="showDeleteDialog" class="form-dialog-overlay" @click.self="showDeleteDialog = false">
      <div class="form-dialog">
        <h3>Удалить проект?</h3>
        <p style="color: var(--color-text-mute); margin: 12px 0;">
          Проект "{{ projectToDelete?.name }}" будет удален. Все операции, связанные с этим проектом, останутся.
        </p>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="showDeleteDialog = false">Отмена</button>
          <button class="btn-delete-confirm" @click="confirmDelete">Удалить</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';

const emit = defineEmits(['close']);
const mainStore = useMainStore();

// State
const searchQuery = ref('');
const sortMode = ref('order');
const isLoading = ref(false);
const editingId = ref(null);
const editingName = ref('');
const nameInput = ref(null);

// Form dialog state
const showFormDialog = ref(false);
const isEditMode = ref(false);
const isSaving = ref(false);
const formData = ref({
  name: '',
  description: '',
  color: null,
  order: null
});
const formError = ref('');
const formNameInput = ref(null);
const editingProject = ref(null);

// Delete dialog state
const showDeleteDialog = ref(false);
const projectToDelete = ref(null);

// Computed
const filteredProjects = computed(() => {
  let projects = [...mainStore.projects];
  
  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    projects = projects.filter(p => 
      p.name.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query))
    );
  }
  
  // Sort
  if (sortMode.value === 'name') {
    projects.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortMode.value === 'date') {
    projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    // Sort by order (default)
    projects.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  
  return projects;
});

const isFormValid = computed(() => {
  return formData.value.name && formData.value.name.trim().length > 0;
});

// Methods
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
};

const openCreateDialog = () => {
  isEditMode.value = false;
  editingProject.value = null;
  formData.value = {
    name: '',
    description: '',
    color: null,
    order: null
  };
  formError.value = '';
  showFormDialog.value = true;
  nextTick(() => formNameInput.value?.focus());
};

const openEditDialog = (project) => {
  isEditMode.value = true;
  editingProject.value = project;
  formData.value = {
    name: project.name,
    description: project.description || '',
    color: project.color || null,
    order: project.order !== undefined ? project.order : null
  };
  formError.value = '';
  showFormDialog.value = true;
  nextTick(() => formNameInput.value?.focus());
};

const closeFormDialog = () => {
  showFormDialog.value = false;
  formError.value = '';
  isSaving.value = false;
};

const handleSave = async () => {
  if (!isFormValid.value || isSaving.value) return;
  
  formError.value = '';
  isSaving.value = true;
  
  try {
    const data = {
      name: formData.value.name.trim(),
      description: formData.value.description?.trim() || '',
      color: formData.value.color || null,
      order: formData.value.order !== null ? formData.value.order : undefined
    };
    
    if (isEditMode.value && editingProject.value) {
      await mainStore.updateProject(editingProject.value._id, data);
    } else {
      await mainStore.createProject(data);
    }
    
    closeFormDialog();
  } catch (error) {
    console.error('Save project error:', error);
    if (error.response?.status === 409) {
      formError.value = 'Проект с таким названием уже существует';
    } else {
      formError.value = 'Ошибка сохранения проекта';
    }
  } finally {
    isSaving.value = false;
  }
};

const deleteProject = (project) => {
  projectToDelete.value = project;
  showDeleteDialog.value = true;
};

const confirmDelete = async () => {
  if (!projectToDelete.value) return;
  
  try {
    await mainStore.deleteProject(projectToDelete.value._id);
    showDeleteDialog.value = false;
    projectToDelete.value = null;
  } catch (error) {
    console.error('Delete project error:', error);
    if (error.response?.status === 409) {
      alert('Невозможно удалить проект с существующими операциями');
    } else {
      alert('Ошибка удаления проекта');
    }
  }
};

const startRename = (project) => {
  editingId.value = project._id;
  editingName.value = project.name;
  nextTick(() => {
    if (nameInput.value) {
      nameInput.value.focus();
      nameInput.value.select();
    }
  });
};

const saveRename = async (projectId) => {
  if (!editingName.value.trim()) {
    cancelRename();
    return;
  }
  
  try {
    await mainStore.updateProject(projectId, { name: editingName.value.trim() });
    editingId.value = null;
    editingName.value = '';
  } catch (error) {
    console.error('Rename project error:', error);
    alert('Ошибка переименования');
    cancelRename();
  }
};

const cancelRename = () => {
  editingId.value = null;
  editingName.value = '';
};

const openColorPicker = (project) => {
  openEditDialog(project);
};

onMounted(() => {
  // Projects are already loaded in mainStore
  isLoading.value = false;
});
</script>

<style scoped>
.project-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  z-index: 2600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.project-modal {
  width: 90vw;
  min-width: 400px;
  max-width: 1280px;
  height: 90vh;
  max-height: calc(100vh - 40px);
  background: var(--color-background);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.project-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.project-header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  flex: 1;
  padding: 10px 16px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 0.95rem;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.close-btn {
  background: none;
  border: none;
  color: var(--color-text);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background: var(--color-background-mute);
}

.project-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  gap: 12px;
}

.btn-create {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-create:hover {
  background: var(--color-primary-hover);
}

.sort-select {
  padding: 10px 16px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 0.95rem;
  cursor: pointer;
}

.sort-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.project-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--color-text-mute);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-background-mute);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-spinner p {
  margin: 0;
  font-size: 0.95rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: var(--color-text-mute);
}

.empty-state svg {
  opacity: 0.3;
  margin-bottom: 16px;
}

.empty-state p {
  margin: 0 0 20px 0;
  font-size: 1.1rem;
}

.btn-create-empty {
  padding: 12px 24px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-create-empty:hover {
  background: var(--color-primary-hover);
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.project-card {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.2s;
}

.project-card:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.project-info {
  flex: 1;
}

.project-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.project-card h3 {
  flex: 1;
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text);
  cursor: text;
}

.project-name-input {
  flex: 1;
  padding: 4px 8px;
  font-size: 1.1rem;
  font-weight: 600;
  background: var(--color-background);
  border: 1px solid var(--color-primary);
  border-radius: 4px;
  color: var(--color-text);
}

.project-color-badge {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  cursor: pointer;
  transition: transform 0.2s;
}

.project-color-badge:hover {
  transform: scale(1.2);
}

.project-description {
  margin: 0 0 8px 0;
  font-size: 0.9rem;
  color: var(--color-text-mute);
  line-height: 1.4;
}

.project-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 0.85rem;
  color: var(--color-text-mute);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.project-actions {
  display: flex;
  gap: 8px;
}

.btn-edit,
.btn-delete {
  padding: 8px;
  background: transparent;
  border: none;
  color: var(--color-text-mute);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-edit:hover {
  background: rgba(255, 157, 0, 0.1);
  color: var(--color-primary);
}

.btn-delete:hover {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

/* Form Dialog */
.form-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.form-dialog {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.form-dialog h3 {
  margin: 0 0 20px 0;
  font-size: 1.3rem;
  color: var(--color-text);
}

.saving-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  color: var(--color-text);
}

.saving-loader .spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-background-mute);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

.saving-loader p {
  margin: 0;
  font-size: 1rem;
  color: var(--color-text);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-text);
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 12px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 1rem;
  box-sizing: border-box;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-textarea {
  resize: vertical;
  font-family: inherit;
}

.error-message {
  display: block;
  margin-top: 6px;
  font-size: 0.85rem;
  color: #ff3b30;
}

.color-picker {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-input {
  width: 60px;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
}

.color-value {
  font-family: monospace;
  font-size: 0.9rem;
  color: var(--color-text-mute);
}

.btn-clear-color {
  padding: 8px 12px;
  background: var(--color-background-mute);
  border: none;
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-clear-color:hover {
  background: var(--color-background-soft);
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.btn-cancel,
.btn-save,
.btn-delete-confirm {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--color-background-mute);
  color: var(--color-text);
}

.btn-cancel:hover {
  background: var(--color-background-soft);
}

.btn-save {
  background: var(--color-primary);
  color: white;
}

.btn-save:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-delete-confirm {
  background: #ff3b30;
  color: white;
}

.btn-delete-confirm:hover {
  background: #d32f2f;
}
</style>
