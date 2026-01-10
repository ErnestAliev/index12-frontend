<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-sheet">
      <div class="modal-header">
        <h3>Рабочая область</h3>
        <button class="close-btn" @click="$emit('close')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'my' }"
          @click="activeTab = 'my'"
        >
          Мои ({{ ownedProjects.length }})
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'shared' }"
          @click="activeTab = 'shared'"
        >
          Общие ({{ sharedProjects.length }})
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'settings' }"
          @click="activeTab = 'settings'"
        >
          Настройки
        </button>
      </div>
      
      <div class="modal-body">
        <!-- Loading -->
        <div v-if="isLoading" class="loading">
          <div class="spinner"></div>
          <p>Загрузка...</p>
        </div>

        <!-- Tab 1: My Projects -->
        <template v-else-if="activeTab === 'my'">
          <div class="projects-grid">
            <button 
              v-for="p in ownedProjects" 
              :key="p._id"
              :class="['project-card', { active: p._id === currentId }]"
              @click="switchProject(p._id)"
            >
              <div class="project-name">{{ p.name }}</div>
              <svg v-if="p._id === currentId" class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>

            <!-- Create new -->
            <button class="project-card new-project" @click="createNewProject">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <div class="new-project-text">Создать рабочую область</div>
            </button>
          </div>
        </template>

        <!-- Tab 2: Shared Projects -->
        <template v-else-if="activeTab === 'shared'">
          <div v-if="sharedProjects.length === 0" class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            <p>С вами пока не поделились дашбоардом</p>
          </div>

          <div v-else class="projects-grid">
            <button 
              v-for="p in sharedProjects" 
              :key="p._id"
              :class="['project-card', { active: p._id === currentId }]"
              @click="switchProject(p._id)"
            >
              <div>
                <div class="project-name">{{ p.name }}</div>
                <div class="project-role">{{ getRoleLabel(p.role) }}</div>
              </div>
              <svg v-if="p._id === currentId" class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
          </div>
        </template>

        <!-- Tab 3: Settings -->
        <template v-else-if="activeTab === 'settings'">
          <div v-if="ownedProjects.length === 0" class="empty-state">
            <p>У вас нет проектов для управления</p>
          </div>

          <div v-else class="settings-wrapper">
            <div class="settings-list">
              <div v-for="p in ownedProjects" :key="p._id" class="settings-section">
                <h4>{{ p.name }}</h4>
                
                <!-- Participants -->
                <div v-if="p.sharedWith && p.sharedWith.length > 0" class="participants">
                  <h5>Участники:</h5>
                  <div v-for="share in p.sharedWith" :key="share.userId" class="participant-item">
                    <div class="participant-info">
                      <span class="participant-email">{{ share.email }}</span>
                      <select 
                        class="role-select" 
                        :value="share.role" 
                        @change="updateUserRole(p._id, share.userId, $event.target.value)"
                      >
                        <option value="analyst">Аналитик</option>
                        <option value="manager">Менеджер</option>
                        <option value="admin">Администратор</option>
                      </select>
                    </div>
                    <button class="btn-revoke" @click="revokeAccess(p._id, share.userId)">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Fixed invite button at bottom -->
            <div v-if="ownedProjects.length > 0" class="invite-section-fixed">
              <button class="btn-invite" @click="openShareDialog(ownedProjects[0])">
                Пригласить участника
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>

  <!-- Switching overlay -->
  <div v-if="isSwitching" class="switching-overlay">
    <div class="switching-content">
      <div class="spinner"></div>
      <p>Переключение проекта...</p>
    </div>
  </div>

  <!-- Share Dialog (Link Generation) -->
  <div v-if="showShareDialog" class="share-dialog-overlay" @click="closeShareDialog">
    <div class="share-dialog" @click.stop>
      <div class="share-header">
        <h3>Пригласить в дашбоард</h3>
        <button class="btn-close" @click="closeShareDialog">✕</button>
      </div>

      <div class="share-body">
        <p class="project-name">{{ workspaceToShare?.name }}</p>

        <!-- Role Selection -->
        <div class="role-selection">
          <label class="role-label">Выберите роль:</label>
          <div class="role-options">
            <label class="role-option">
              <input type="radio" v-model="shareRole" value="analyst" />
              <span>Аналитик</span>
            </label>
            <label class="role-option">
              <input type="radio" v-model="shareRole" value="manager" />
              <span>Менеджер</span>
            </label>
            <label class="role-option">
              <input type="radio" v-model="shareRole" value="admin" />
              <span>Администратор</span>
            </label>
          </div>
        </div>

        <!-- Generate Link Button -->
        <button 
          v-if="!generatedLink" 
          class="btn-generate" 
          :disabled="isGeneratingLink"
          @click="generateShareLink"
        >
          {{ isGeneratingLink ? 'Создаем...' : 'Создать ссылку' }}
        </button>

        <!-- Generated Link Display -->
        <div v-if="generatedLink" class="link-container">
          <input 
            type="text" 
            :value="generatedLink" 
            readonly 
            class="link-input"
            @click="$event.target.select()"
          />
          <button 
            class="btn-copy" 
            :class="{ 'copied': linkCopied }"
            @click="copyLink"
          >
            {{ linkCopied ? '✓ Скопировано' : 'Копировать' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Custom Confirm Dialog -->
  <ConfirmDialog
    :show="showConfirmDialog"
    :title="confirmData.title"
    :message="confirmData.message"
    :confirmText="confirmData.confirmText || 'Подтвердить'"
    :cancelText="confirmData.cancelText || 'Отмена'"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import ConfirmDialog from '../ConfirmDialog.vue';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const emit = defineEmits(['close']);

const projects = ref([]);
const currentId = ref(null);
const isLoading = ref(false);
const isSwitching = ref(false);
const activeTab = ref('my');

// Share dialog state (link generation)
const showShareDialog = ref(false);
const workspaceToShare = ref(null);
const shareRole = ref('analyst');
const generatedLink = ref('');
const isGeneratingLink = ref(false);
const linkCopied = ref(false);

// Confirm dialog state
const showConfirmDialog = ref(false);
const confirmData = ref({ title: '', message: '', onConfirm: null, confirmText: '', cancelText: '' });

const ownedProjects = computed(() => projects.value.filter(p => !p.isShared));
const sharedProjects = computed(() => projects.value.filter(p => p.isShared));

function getRoleLabel(role) {
  const labels = {
    'analyst': 'Аналитик',
    'manager': 'Менеджер',
    'admin': 'Администратор'
  };
  return labels[role] || role;
}

async function loadProjects() {
  try {
    isLoading.value = true;
    const [projectsRes, userRes] = await Promise.all([
      axios.get(`${API_BASE_URL}/workspaces`, { withCredentials: true }),
      axios.get(`${API_BASE_URL}/auth/me`, { withCredentials: true })
    ]);
    projects.value = projectsRes.data;
    currentId.value = userRes.data.currentWorkspaceId;
  } catch (err) {
    console.error('[MobileProjectSwitcher] Failed to load projects:', err);
    alert(`Ошибка загрузки проектов: ${err.message}`);
  } finally {
    isLoading.value = false;
  }
}

async function switchProject(id) {
  if (id === currentId.value) {
    emit('close');
    return;
  }

  try {
    emit('close');
    await new Promise(resolve => setTimeout(resolve, 200));
    isSwitching.value = true;
    await axios.post(`${API_BASE_URL}/workspaces/${id}/switch`, {}, { withCredentials: true });
    sessionStorage.clear();
    window.location.reload(true);
  } catch (err) {
    console.error('Failed to switch project:', err);
    alert('Ошибка переключения проекта');
    isSwitching.value = false;
  }
}

async function createNewProject() {
  const name = prompt('Название нового проекта:');
  if (!name || !name.trim()) return;

  try {
    await axios.post(`${API_BASE_URL}/workspaces`, { name: name.trim() }, { withCredentials: true });
    await loadProjects();
  } catch (err) {
    console.error('Failed to create project:', err);
    alert('Ошибка создания проекта');
  }
}

// Share dialog management (link generation)
function openShareDialog(project) {
  workspaceToShare.value = project;
  shareRole.value = 'analyst';
  generatedLink.value = '';
  linkCopied.value = false;
  showShareDialog.value = true;
}

function closeShareDialog() {
  showShareDialog.value = false;
  workspaceToShare.value = null;
  generatedLink.value = '';
  linkCopied.value = false;
  shareRole.value = 'analyst';
}

async function generateShareLink() {
  if (!workspaceToShare.value) return;
  
  try {
    isGeneratingLink.value = true;
    const res = await axios.post(
      `${API_BASE_URL}/workspaces/${workspaceToShare.value._id}/generate-invite`,
      { role: shareRole.value },
      { withCredentials: true }
    );
    
    generatedLink.value = res.data.inviteUrl || '';
  } catch (err) {
    console.error('Failed to generate link:', err);
    alert('Ошибка создания ссылки');
  } finally {
    isGeneratingLink.value = false;
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(generatedLink.value);
    linkCopied.value = true;
    setTimeout(() => {
      linkCopied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    showAlert('Ошибка', 'Не удалось скопировать ссылку');
  }
}

// 🟢 Custom confirm dialog helpers
function showConfirm(title, message, onConfirm, confirmText = 'Подтвердить', cancelText = 'Отмена') {
  confirmData.value = { title, message, onConfirm, confirmText, cancelText };
  showConfirmDialog.value = true;
}

function showAlert(title, message) {
  confirmData.value = { 
    title, 
    message, 
    onConfirm: () => {}, 
    confirmText: 'ОК',
    cancelText: '' 
  };
  showConfirmDialog.value = true;
}

function handleConfirm() {
  if (confirmData.value.onConfirm) {
    confirmData.value.onConfirm();
  }
  showConfirmDialog.value = false;
}

function handleCancel() {
  showConfirmDialog.value = false;
  // Reload projects to reset UI if needed
  loadProjects();
}

async function updateUserRole(workspaceId, userId, newRole) {
  // Get current share info
  const project = projects.value.find(p => p._id === workspaceId);
  const share = project?.sharedWith?.find(s => s.userId === userId);
  
  if (!share) {
    await loadProjects();
    return;
  }

  const oldRoleLabel = getRoleLabel(share.role);
  const newRoleLabel = getRoleLabel(newRole);

  // 🟢 Use custom confirm dialog
  showConfirm(
    'Изменить роль',
    `Изменить роль пользователя ${share.email}\nс "${oldRoleLabel}" на "${newRoleLabel}"?`,
    async () => {
      try {
        // 🟢 FIX: Correct endpoint is /members/{userId}/role not /share/{userId}
        await axios.patch(
          `${API_BASE_URL}/workspaces/${workspaceId}/members/${userId}/role`, 
          { role: newRole }, 
          { withCredentials: true }
        );
        await loadProjects();
      } catch (err) {
        console.error('Failed to update role:', err);
        showAlert('Ошибка', 'Не удалось изменить роль');
        // Reload to reset select value
        await loadProjects();
      }
    },
    'Изменить',
    'Отмена'
  );
}

async function revokeAccess(workspaceId, userId) {
  showConfirm(
    'Отозвать доступ',
    'Вы уверены, что хотите отозвать доступ для этого пользователя?',
    async () => {
      try {
        await axios.delete(`${API_BASE_URL}/workspaces/${workspaceId}/share/${userId}`, { withCredentials: true });
        await loadProjects();
        showAlert('Готово', 'Доступ успешно отозван');
      } catch (err) {
        console.error('Failed to revoke:', err);
        showAlert('Ошибка', 'Не удалось отозвать доступ');
      }
    },
    'Отозвать',
    'Отмена'
  );
}

onMounted(loadProjects);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 3000;
  display: flex;
  align-items: flex-end;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-sheet {
  width: 100%;
  height: 100dvh;
  background: var(--color-background-soft, #282828);
  border-radius: 0;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid var(--color-border, #444);
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #fff);
}

.close-btn {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: #888;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:active {
  background: rgba(255,255,255,0.1);
  color: #fff;
}

/* Tabs */
.tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border, #444);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 14px 12px;
  background: none;
  border: none;
  color: #888;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-btn.active {
  color: var(--color-primary, #34c759);
  border-bottom-color: var(--color-primary, #34c759);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.loading, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 16px;
  color: #888;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: var(--color-primary, #34c759);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Projects Grid */
.projects-grid {
  display: grid;
  gap: 12px;
}

.project-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--color-background, #1a1a1a);
  border: 1px solid transparent;
  border-radius: 12px;
  color: var(--color-text, #fff);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.project-card:active {
  transform: scale(0.98);
}

.project-card.active {
  border-color: var(--color-primary, #34c759);
  background: rgba(52, 199, 89, 0.1);
}

.project-name {
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 2px;
}

.project-role {
  font-size: 12px;
  color: #888;
}

.check-icon {
  flex-shrink: 0;
  color: var(--color-primary, #34c759);
}

/* New Project Card */
.new-project {
  flex-direction: column;
  gap: 8px;
  border: 2px dashed var(--color-border, #444);
  color: #888;
}

.new-project:active {
  border-color: var(--color-primary, #34c759);
  color: var(--color-primary, #34c759);
}

.new-project-text {
  font-size: 14px;
  font-weight: 500;
}

/* Settings */
.settings-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 80px; /* Space for fixed button */
  overflow-y: auto;
  flex: 1;
}

.settings-section {
  background: var(--color-background, #1a1a1a);
  padding: 16px;
  border-radius: 12px;
}

.settings-section h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #fff);
}

.settings-section h5 {
  margin: 0 0 12px 0;
  font-size: 13px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.participants {
  margin-bottom: 16px;
}

.participant-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--color-background-soft, #282828);
  border-radius: 8px;
  margin-bottom: 8px;
}

.participant-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.participant-email {
  font-size: 14px;
  color: var(--color-text, #fff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.participant-role {
  font-size: 12px;
  color: #888;
}

.role-select {
  width: 100%; /* Full width for better mobile UX */
  padding: 6px 10px;
  background: var(--color-background, #1a1a1a);
  border: 1px solid var(--color-border, #444);
  border-radius: 6px;
  color: var(--color-text, #fff);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: all 0.2s;
}

.role-select:focus {
  border-color: var(--color-primary, #34c759);
}

.role-select option {
  background: var(--color-background, #1a1a1a);
  color: var(--color-text, #fff);
}

.btn-invite {
  width: 100%;
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--color-primary, #34c759);
  color: white;
}

.btn-invite:active {
  opacity: 0.8;
}

/* 🟢 Fixed invite button at bottom */
.invite-section-fixed {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px 20px;
  background: var(--color-background-soft, #282828);
  border-top: 1px solid var(--color-border, #444);
  z-index: 10;
}

.btn-revoke {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.btn-revoke:active {
  background: rgba(255, 59, 48, 0.2);
}

.btn-invite:active {
  opacity: 0.8;
}

/* Switching Overlay */
.switching-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.switching-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.switching-content p {
  color: #fff;
  font-size: 16px;
  margin: 0;
}

/* Share Dialog Styles */
.share-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.share-dialog {
  background: var(--color-background, #1a1a1a);
  border-radius: 16px;
  max-width: 400px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.share-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--color-border, #444);
}

.share-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--color-text, #fff);
}

.btn-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-close:active {
  background: rgba(255, 255, 255, 0.1);
}

.share-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.project-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #fff);
  margin: 0;
  text-align: center;
}

.role-selection {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.role-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, #fff);
}

.role-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.role-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: var(--color-background-soft, #282828);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.role-option:active {
  background: rgba(255, 255, 255, 0.1);
}

.role-option input[type="radio"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.role-option span {
  font-size: 14px;
  color: var(--color-text, #fff);
}

.btn-generate {
  width: 100%;
  padding: 14px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary, #34c759);
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-generate:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-generate:active:not(:disabled) {
  transform: scale(0.98);
}

.link-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.link-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-border, #444);
  border-radius: 8px;
  background: var(--color-background-soft, #282828);
  color: var(--color-text, #fff);
  font-size: 13px;
  font-family: monospace;
  outline: none;
}

.btn-copy {
  width: 100%;
  padding: 14px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary, #34c759);
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-copy.copied {
  background: #888;
}

.btn-copy:active {
  transform: scale(0.98);
}
</style>
