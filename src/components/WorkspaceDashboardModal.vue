<template>
  <div class="workspace-modal-overlay" @click.self="$emit('close')">
    <div class="workspace-modal">
      <div class="workspace-header">
        <h2>Проекты</h2>
        <button class="close-btn" @click="$emit('close')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="workspace-body">
        <div v-if="isLoading" class="loading-spinner">
          <div class="spinner"></div>
          <p>Загрузка проектов...</p>
        </div>
        <div v-else class="workspaces-grid">
          <div
            v-for="workspace in workspaces"
            :key="workspace._id"
            class="workspace-card"
            :class="{ 'active': workspace._id === currentWorkspaceId }"
          >
            <div class="workspace-thumbnail" @click="switchWorkspace(workspace._id)">
              <img v-if="workspace.thumbnail" :src="workspace.thumbnail" alt="Preview" />
              <div v-else class="thumbnail-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                  <line x1="9" y1="9" x2="15" y2="9"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
              </div>
            </div>
            
            <div class="workspace-info">
              <input
                v-if="editingId === workspace._id"
                v-model="editingName"
                @blur="saveRename(workspace._id)"
                @keyup.enter="saveRename(workspace._id)"
                @keyup.esc="cancelRename"
                class="workspace-name-input"
                ref="nameInput"
              />
              <h3 v-else @dblclick="startRename(workspace)">{{ workspace.name }}</h3>
              
              <div class="workspace-actions">
                <button
                  v-if="workspace._id === currentWorkspaceId"
                  class="btn-current"
                  disabled
                >
                  Текущий
                </button>
                <button
                  v-else
                  class="btn-switch"
                  @click="switchWorkspace(workspace._id)"
                >
                  Открыть
                </button>
                
                <button
                  v-if="!workspace.isDefault"
                  class="btn-delete"
                  @click="deleteWorkspace(workspace._id)"
                  title="Удалить"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Create new workspace card -->
          <div class="workspace-card workspace-card-new" @click="createWorkspace">
            <div class="workspace-thumbnail">
              <div class="thumbnail-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </div>
            </div>
            <div class="workspace-info">
              <h3>Создать проект</h3>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom input dialog for new workspace -->
    <div v-if="showCreateDialog" class="create-dialog-overlay" @click.self="showCreateDialog = false">
      <div class="create-dialog">
        <h3>Создать новый проект</h3>
        
        <!-- Show loading state -->
        <div v-if="isCreating" class="creating-loader">
          <div class="spinner"></div>
          <p>Создание проекта...</p>
        </div>
        
        <!-- Show input when not creating -->
        <template v-else>
          <input
            v-model="newWorkspaceName"
            @keyup.enter="confirmCreate"
            @keyup.esc="showCreateDialog = false"
            placeholder="Название проекта"
            class="workspace-name-input"
            ref="createInput"
          />
          <div class="dialog-actions">
            <button class="btn-cancel" @click="showCreateDialog = false">Отмена</button>
            <button class="btn-create" @click="confirmCreate">Создать</button>
          </div>
        </template>
      </div>
    </div>

    <!-- Custom delete confirmation dialog -->
    <div v-if="showDeleteDialog" class="create-dialog-overlay" @click.self="showDeleteDialog = false">
      <div class="create-dialog">
        <h3>Удалить проект?</h3>
        <p style="color: var(--color-text-mute); margin: 12px 0;">Все данные проекта будут безвозвратно удалены!</p>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="showDeleteDialog = false">Отмена</button>
          <button class="btn-delete-confirm" @click="confirmDelete">Удалить</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 🟢 NEW: Fullscreen loader for creating/switching -->
  <div v-if="isCreating" class="fullscreen-loader">
    <div class="loader-content">
      <div class="spinner"></div>
      <p>{{ loadingMessage }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';
import axios from 'axios';
import html2canvas from 'html2canvas';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const emit = defineEmits(['close']);

const workspaces = ref([]);
const currentWorkspaceId = ref(null);
const editingId = ref(null);
const editingName = ref('');
const nameInput = ref(null);
const showCreateDialog = ref(false);
const newWorkspaceName = ref('');
const createInput = ref(null);
const showDeleteDialog = ref(false);
const workspaceToDelete = ref(null);
const isLoading = ref(false);
const isCreating = ref(false); // 🟢 Loading state for creation/switching
const loadingMessage = ref(''); // 🟢 Dynamic loading message

async function loadWorkspaces() {
  try {
    isLoading.value = true;
    
    // 🟢 NEW: Capture screenshot of CURRENT workspace before loading list
    // This ensures we always have an up-to-date thumbnail
    const userRes = await axios.get(`${API_BASE_URL}/auth/me`, { withCredentials: true });
    const currentWsId = userRes.data.currentWorkspaceId;
    
    if (currentWsId) {
      // Small delay to ensure UI is stable
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const thumbnail = await captureScreenshot();
      if (thumbnail) {
        await axios.post(
          `${API_BASE_URL}/workspaces/${currentWsId}/thumbnail`,
          { thumbnail },
          { withCredentials: true }
        ).catch(err => console.error('Failed to save current workspace thumbnail:', err));
      }
    }
    
    // Load workspaces list
    const workspacesRes = await axios.get(`${API_BASE_URL}/workspaces`, { withCredentials: true });
    
    workspaces.value = workspacesRes.data;
    currentWorkspaceId.value = currentWsId;
  } catch (err) {
    console.error('Failed to load workspaces:', err);
  } finally {
    isLoading.value = false;
  }
}

async function captureScreenshot() {
  try {
    // Wait for modal to close completely
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const homeLayout = document.querySelector('.home-layout');
    if (!homeLayout) return null;

    const canvas = await html2canvas(homeLayout, {
      scale: 0.3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#1a1a1a'
    });

    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (err) {
    console.error('Failed to capture screenshot:', err);
    return null;
  }
}

function createWorkspace() {
  showCreateDialog.value = true;
  newWorkspaceName.value = '';
  nextTick(() => {
    if (createInput.value) {
      createInput.value.focus();
    }
  });
}

async function confirmCreate() {
  if (!newWorkspaceName.value || newWorkspaceName.value.trim() === '') return;

  try {
    // Close dialog and modal first
    showCreateDialog.value = false;
    emit('close');
    
    // Small delay to ensure modal closes
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Show fullscreen loader
    loadingMessage.value = 'Создаем проект...';
    isCreating.value = true;
    
    // Capture screenshot of current workspace
    const thumbnail = await captureScreenshot();
    
    const res = await axios.post(`${API_BASE_URL}/workspaces`, 
      { name: newWorkspaceName.value.trim() }, 
      { withCredentials: true }
    );
    
    // Save thumbnail if captured
    if (thumbnail && res.data._id) {
      await axios.post(
        `${API_BASE_URL}/workspaces/${res.data._id}/thumbnail`,
        { thumbnail },
        { withCredentials: true }
      );
    }
    
    // Switch to new workspace
    await axios.post(`${API_BASE_URL}/workspaces/${res.data._id}/switch`, {}, { withCredentials: true });
    
    // Clear cache and reload
    sessionStorage.clear();
    window.location.reload(true);
    
  } catch (err) {
    console.error('Failed to create workspace:', err);
    alert('Ошибка создания проекта');
    isCreating.value = false;
  }
}

async function switchWorkspace(workspaceId) {
  try {
    // Close modal first
    emit('close');
    
    // Small delay to ensure modal closes
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Show fullscreen loader
    loadingMessage.value = 'Загружаем проект...';
    isCreating.value = true;
    
    // Capture screenshot of CURRENT workspace BEFORE switching
    if (currentWorkspaceId.value && currentWorkspaceId.value !== workspaceId) {
      const thumbnail = await captureScreenshot();
      if (thumbnail) {
        await axios.post(
          `${API_BASE_URL}/workspaces/${currentWorkspaceId.value}/thumbnail`,
          { thumbnail },
          { withCredentials: true }
        ).catch(err => console.error('Failed to save thumbnail:', err));
      }
    }
    
    // Switch to new workspace
    await axios.post(`${API_BASE_URL}/workspaces/${workspaceId}/switch`, {}, { withCredentials: true });
    
    // Clear cache and reload
    sessionStorage.clear();
    window.location.reload(true);
    
  } catch (err) {
    console.error('Failed to switch workspace:', err);
    alert('Ошибка переключения проекта');
    isCreating.value = false;
  }
}

function deleteWorkspace(workspaceId) {
  workspaceToDelete.value = workspaceId;
  showDeleteDialog.value = true;
}

async function confirmDelete() {
  if (!workspaceToDelete.value) return;
  
  try {
    showDeleteDialog.value = false;
    await axios.delete(`${API_BASE_URL}/workspaces/${workspaceToDelete.value}`, { withCredentials: true });
    workspaces.value = workspaces.value.filter(w => w._id !== workspaceToDelete.value);
    workspaceToDelete.value = null;
  } catch (err) {
    console.error('Failed to delete workspace:', err);
    alert('Ошибка удаления проекта');
  }
}

function startRename(workspace) {
  editingId.value = workspace._id;
  editingName.value = workspace.name;
  nextTick(() => {
    if (nameInput.value) {
      nameInput.value.focus();
      nameInput.value.select();
    }
  });
}

async function saveRename(workspaceId) {
  if (!editingName.value.trim()) {
    cancelRename();
    return;
  }

  try {
    const res = await axios.put(
      `${API_BASE_URL}/workspaces/${workspaceId}`,
      { name: editingName.value },
      { withCredentials: true }
    );
    
    const workspace = workspaces.value.find(w => w._id === workspaceId);
    if (workspace) {
      workspace.name = res.data.name;
    }
    
    editingId.value = null;
    editingName.value = '';
  } catch (err) {
    console.error('Failed to rename workspace:', err);
    alert('Ошибка переименования');
  }
}

function cancelRename() {
  editingId.value = null;
  editingName.value = '';
}

onMounted(() => {
  loadWorkspaces();
});
</script>

<style scoped>
.workspace-modal-overlay {
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

.workspace-modal {
  width: 80vw;
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
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.workspace-header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text);
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

.workspace-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.workspaces-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.workspace-card {
  background: var(--color-background-soft);
  border: 2px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s;
  cursor: pointer;
}

.workspace-card:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.workspace-card.active {
  border-color: var(--color-primary);
  background: var(--color-background-mute);
}

.workspace-card-new {
  border-style: dashed;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.workspace-thumbnail {
  width: 100%;
  height: 180px;
  background: var(--color-background-mute);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.workspace-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-placeholder {
  color: var(--color-text-mute);
  opacity: 0.3;
}

.workspace-info {
  padding: 16px;
}

.workspace-info h3 {
  margin: 0 0 12px 0;
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--color-text);
  cursor: text;
}

.workspace-name-input {
  width: 100%;
  padding: 4px 8px;
  font-size: 1.1rem;
  font-weight: 500;
  background: var(--color-background);
  border: 1px solid var(--color-primary);
  border-radius: 4px;
  color: var(--color-text);
  margin-bottom: 12px;
}

.workspace-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-switch,
.btn-current,
.btn-delete {
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-switch {
  background: var(--color-primary);
  color: white;
  flex: 1;
}

.btn-switch:hover {
  background: var(--color-primary-hover);
}

.btn-current {
  background: var(--color-background-mute);
  color: var(--color-text-mute);
  flex: 1;
  cursor: default;
}

.btn-delete {
  background: transparent;
  color: var(--color-text-mute);
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-delete:hover {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

/* Custom create dialog */
.create-dialog-overlay {
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

.create-dialog {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 24px;
  min-width: 400px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.create-dialog h3 {
  margin: 0 0 16px 0;
  font-size: 1.2rem;
  color: var(--color-text);
}

.create-dialog .workspace-name-input {
  width: 100%;
  padding: 12px;
  font-size: 1rem;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  margin-bottom: 16px;
}

.create-dialog .workspace-name-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn-cancel,
.btn-create {
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

.btn-create {
  background: var(--color-primary);
  color: white;
}

.btn-create:hover {
  background: var(--color-primary-hover);
}

.btn-delete-confirm {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  background: #ff3b30;
  color: white;
}

.btn-delete-confirm:hover {
  background: #d32f2f;
}

/* Loading spinner */
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

/* Creating loader */
.creating-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  color: var(--color-text);
}

.creating-loader .spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-background-mute);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

.creating-loader p {
  margin: 0;
  font-size: 1rem;
  color: var(--color-text);
}

/* Fullscreen loader for creating/switching workspaces */
.fullscreen-loader {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.loader-content .spinner {
  width: 60px;
  height: 60px;
  border: 5px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 24px;
}

.loader-content p {
  margin: 0;
  font-size: 1.2rem;
  color: white;
  font-weight: 500;
}
</style>
