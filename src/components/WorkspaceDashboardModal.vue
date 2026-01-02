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

      <!-- Tabs -->
      <div class="workspace-tabs">
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'my' }"
          @click="activeTab = 'my'"
        >
          Мои проекты ({{ ownedWorkspaces.length }})
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'shared' }"
          @click="activeTab = 'shared'"
        >
          Поделились со мной ({{ sharedWorkspaces.length }})
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'settings' }"
          @click="activeTab = 'settings'"
        >
          Настройки
        </button>
      </div>

      <div class="workspace-body">
        <div v-if="isLoading" class="loading-spinner">
          <div class="spinner"></div>
          <p>Загрузка проектов...</p>
        </div>
        
        <!-- Tab 1: My Projects -->
        <div v-else-if="activeTab === 'my'" class="workspaces-grid">
          <div v-for="workspace in ownedWorkspaces" :key="workspace._id" class="workspace-card" :class="{'current-project': workspace._id === currentWorkspaceId}" :ref="workspace._id === currentWorkspaceId ? 'currentProjectCard' : null">
            <div class="card-thumbnail" :style="{ backgroundImage: workspace.thumbnail ? 'url(' + workspace.thumbnail + ')' : 'none' }" @click="switchWorkspace(workspace._id)"></div>
            <div class="card-controls">
              <h3 class="card-title">
                {{ workspace.name }}

              </h3>
              <div class="card-actions">
                <button v-if="!workspace.isShared || workspace.role === 'admin'" class="icon-btn btn-edit" @click.stop="openRenameDialog(workspace)">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button v-if="!workspace.isShared || workspace.role === 'admin'" class="icon-btn btn-share" @click.stop="openShareDialog(workspace)">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                </button>
                <button v-if="(!workspace.isShared || workspace.role === 'admin') && !workspace.isDefault" class="icon-btn btn-delete" @click.stop="confirmDelete(workspace)">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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

        <!-- Tab 2: Shared Projects -->
        <div v-else-if="activeTab === 'shared'" class="workspaces-grid">
          <div v-if="sharedWorkspaces.length === 0" class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            <p>С вами пока не поделились проектами</p>
          </div>

          <div v-for="workspace in sharedWorkspaces" :key="workspace._id" class="workspace-card shared-card" :class="{'current-project': workspace._id === currentWorkspaceId}">
            <div class="card-thumbnail" :style="{ backgroundImage: workspace.thumbnail ? 'url(' + workspace.thumbnail + ')' : 'none' }" @click="switchWorkspace(workspace._id)"></div>
            <div class="card-controls">
              <h3 class="card-title" @click="switchWorkspace(workspace._id)">{{ workspace.name }}</h3>
              <p class="role-label">{{ getRoleLabel(workspace.role) }}</p>
            </div>
          </div>
        </div>

        <!-- Tab 3: Settings -->
        <div v-else-if="activeTab === 'settings'" class="settings-content">
          <div v-if="ownedWorkspaces.length === 0" class="empty-state">
            <p>У вас нет проектов для управления</p>
          </div>

          <div v-for="workspace in ownedWorkspaces" :key="workspace._id" class="settings-section">
            <h3 class="settings-workspace-name">{{ workspace.name }}</h3>
            
            <!-- Shared with users -->
            <div v-if="workspace.sharedWith && workspace.sharedWith.length > 0" class="shared-list">
              <h4>Доступ предоставлен:</h4>
              <div v-for="share in workspace.sharedWith" :key="share.userId" class="share-item">
                <div class="share-info">
                  <span class="share-email">{{ share.email }}</span>
                  <span class="share-role">{{ getRoleLabel(share.role) }}</span>
                  <span class="share-date">{{ formatDate(share.sharedAt) }}</span>
                </div>
                <button class="btn-revoke" @click="revokeAccess(workspace._id, share.userId)">
                  Отозвать доступ
                </button>
              </div>
            </div>

            <!-- Active invites -->
            <div v-if="workspaceInvites[workspace._id] && workspaceInvites[workspace._id].length > 0" class="invites-list">
              <h4>Активные ссылки:</h4>
              <div v-for="invite in workspaceInvites[workspace._id]" :key="invite._id" class="invite-item">
                <div class="invite-info">
                  <span class="invite-token">{{ invite.token.substring(0, 12) }}...</span>
                  <span class="invite-role">{{ getRoleLabel(invite.role) }}</span>
                  <span class="invite-expires">Истекает: {{ formatDate(invite.expiresAt) }}</span>
                </div>
                <button class="btn-revoke" @click="revokeInvite(invite._id, workspace._id)">
                  Отозвать ссылку
                </button>
              </div>
            </div>

            <div v-if="(!workspace.sharedWith || workspace.sharedWith.length === 0) && (!workspaceInvites[workspace._id] || workspaceInvites[workspace._id].length === 0)" class="no-shares">
              <p>Проект не поделен ни с кем</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <div v-if="showCreateDialog" class="create-dialog-overlay" @click.self="showCreateDialog = false">
      <div class="create-dialog">
        <h3>Создать новый проект</h3>
        
        <div v-if="isCreating" class="creating-loader">
          <div class="spinner"></div>
          <p>Создание проекта...</p>
        </div>
        
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

    <!-- Share Dialog -->
    <div v-if="showShareDialog" class="create-dialog-overlay" @click.self="closeShareDialog">
      <div class="create-dialog share-dialog">
        <div class="share-header">
          <div class="header-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
          </div>
          <div>
            <h3>Поделиться проектом</h3>
            <p class="dialog-subtitle">{{ workspaceToShare?.name }}</p>
          </div>
        </div>
        
        <div class="form-group">
          <label>Уровень доступа</label>
          <div class="role-selector">
            <div 
              v-for="role in roleOptions" 
              :key="role.value"
              class="role-option"
              :class="{ selected: shareRole === role.value }"
              @click="shareRole = role.value"
            >
              <div class="role-icon" :class="`role-${role.value}`">
                <component :is="role.icon" />
              </div>
              <div class="role-info">
                <div class="role-name">{{ role.label }}</div>
                <div class="role-desc">{{ role.description }}</div>
              </div>
              <div class="role-check">
                <svg v-if="shareRole === role.value" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </div>
          </div>
        </div>

        <button class="btn-generate" @click="generateShareLink" :disabled="isGeneratingLink">
          <svg v-if="!isGeneratingLink" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          <div v-else class="btn-spinner"></div>
          {{ isGeneratingLink ? 'Создание ссылки...' : 'Создать ссылку приглашения' }}
        </button>

        <!-- Generated link display -->
        <div v-if="generatedLink" class="link-display">
          <label>Ссылка для приглашения</label>
          <div class="link-container">
            <input :value="generatedLink" readonly class="link-input" ref="linkInput" @click="$event.target.select()" />
            <button class="btn-copy" @click="copyLink" :class="{ copied: linkCopied }">
              <svg v-if="!linkCopied" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              {{ linkCopied ? 'Скопировано!' : 'Копировать' }}
            </button>
          </div>
          <p class="link-hint">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            Отправьте эту ссылку пользователю для предоставления доступа
          </p>
        </div>

        <div class="dialog-actions">
          <button class="btn-cancel" @click="closeShareDialog">Закрыть</button>
        </div>
      </div>
    </div>

    <!-- Delete Dialog -->
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

    <!-- Rename Dialog -->
    <div v-if="showRenameDialog" class="create-dialog-overlay" @click.self="showRenameDialog = false">
      <div class="create-dialog">
        <h3>Переименовать проект</h3>
        <input
          v-model="renameName"
          @keyup.enter="confirmRename"
          @keyup.esc="showRenameDialog = false"
          placeholder="Название проекта"
          class="workspace-name-input"
          ref="renameInput"
        />
        <div class="dialog-actions">
          <button class="btn-cancel" @click="showRenameDialog = false">Отмена</button>
          <button class="btn-create" @click="confirmRename">Сохранить</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Fullscreen loader -->
  <div v-if="isCreating" class="fullscreen-loader">
    <div class="loader-content">
      <div class="spinner"></div>
      <p>{{ loadingMessage }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
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
const isCreating = ref(false);
const loadingMessage = ref('');
const activeTab = ref('my');

// Share dialog state
const showShareDialog = ref(false);
const workspaceToShare = ref(null);
const shareRole = ref('analyst');
const generatedLink = ref('');
const isGeneratingLink = ref(false);
const linkCopied = ref(false);
const linkInput = ref(null);

// Settings tab state
const workspaceInvites = ref({});

// Rename dialog state
const showRenameDialog = ref(false);
const workspaceToRename = ref(null);
const renameName = ref('');
const renameInput = ref(null);

// Current project card ref
const currentProjectCard = ref(null);

// Role options for share dialog
const roleOptions = [
  {
    value: 'analyst',
    label: 'Аналитик',
    description: 'Просмотр данных без возможности изменений',
    icon: 'svg'
  },
  {
    value: 'manager',
    label: 'Менеджер',
    description: 'Создание и редактирование операций',
    icon: 'svg'
  },
  {
    value: 'admin',
    label: 'Администратор',
    description: 'Полный доступ и управление проектом',
    icon: 'svg'
  }
];

// Computed: separate owned and shared workspaces
const ownedWorkspaces = computed(() => {
  return workspaces.value.filter(w => !w.isShared);
});

const sharedWorkspaces = computed(() => {
  return workspaces.value.filter(w => w.isShared);
});

function getRoleLabel(role) {
  const labels = {
    'analyst': 'Аналитик',
    'manager': 'Менеджер',
    'admin': 'Администратор',
    'viewer': 'Аналитик', // Mapping old roles to new
    'editor': 'Менеджер'
  };
  return labels[role] || role;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

async function loadWorkspaces() {
  try {
    isLoading.value = true;
    
    const [workspacesRes, userRes] = await Promise.all([
      axios.get(`${API_BASE_URL}/workspaces`, { withCredentials: true }),
      axios.get(`${API_BASE_URL}/auth/me`, { withCredentials: true })
    ]);
    
    workspaces.value = workspacesRes.data;
    currentWorkspaceId.value = userRes.data.currentWorkspaceId;
    
    // Load invites for owned workspaces
    await loadInvites();
  } catch (err) {
    console.error('Failed to load workspaces:', err);
  } finally {
    isLoading.value = false;
  }
}

async function loadInvites() {
  try {
    const owned = ownedWorkspaces.value;
    const invitePromises = owned.map(ws => 
      axios.get(`${API_BASE_URL}/workspaces/${ws._id}/invites`, { withCredentials: true })
        .then(res => ({ workspaceId: ws._id, invites: res.data }))
        .catch(() => ({ workspaceId: ws._id, invites: [] }))
    );

    const results = await Promise.all(invitePromises);
    const invitesMap = {};
    results.forEach(({ workspaceId, invites }) => {
      invitesMap[workspaceId] = invites;
    });
    workspaceInvites.value = invitesMap;
  } catch (err) {
    console.error('Failed to load invites:', err);
  }
}



function openRenameDialog(workspace) {
  workspaceToRename.value = workspace;
  renameName.value = workspace.name;
  showRenameDialog.value = true;
  nextTick(() => {
    if (renameInput.value) {
      renameInput.value.focus();
      renameInput.value.select();
    }
  });
}

async function confirmRename() {
  if (!renameName.value || renameName.value.trim() === '' || !workspaceToRename.value) return;
  
  try {
    await axios.put(
      `${API_BASE_URL}/workspaces/${workspaceToRename.value._id}`,
      { name: renameName.value.trim() },
      { withCredentials: true }
    );
    
    // Update local state
    const ws = workspaces.value.find(w => w._id === workspaceToRename.value._id);
    if (ws) {
      ws.name = renameName.value.trim();
    }
    
    showRenameDialog.value = false;
    workspaceToRename.value = null;
  } catch (err) {
    console.error('Failed to rename workspace:', err);
    alert('Ошибка переименования проекта');
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
    showCreateDialog.value = false;
    emit('close');
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    loadingMessage.value = 'Создаем проект...';
    isCreating.value = true;
    
    
    const res = await axios.post(`${API_BASE_URL}/workspaces`, 
      { name: newWorkspaceName.value.trim() }, 
      { withCredentials: true }
    );
    
    await axios.post(`${API_BASE_URL}/workspaces/${res.data._id}/switch`, {}, { withCredentials: true });
    
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
    emit('close');
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    loadingMessage.value = 'Загружаем проект...';
    isCreating.value = true;
    
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
    
    await axios.post(`${API_BASE_URL}/workspaces/${workspaceId}/switch`, {}, { withCredentials: true });
    
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

// Share functionality
function openShareDialog(workspace) {
  workspaceToShare.value = workspace;
  shareRole.value = 'analyst';
  generatedLink.value = '';
  linkCopied.value = false;
  showShareDialog.value = true;
}

function closeShareDialog() {
  showShareDialog.value = false;
  workspaceToShare.value = null;
  generatedLink.value = '';
  shareRole.value = 'analyst';
  linkCopied.value = false;
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

    generatedLink.value = res.data.inviteUrl;
    
    // Reload invites to show new one in settings
    await loadInvites();

    nextTick(() => {
      if (linkInput.value) {
        linkInput.value.select();
      }
    });
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
    console.error('Failed to copy link:', err);
    alert('Ошибка копирования ссылки');
  }
}

async function revokeAccess(workspaceId, userId) {
  if (!confirm('Отозвать доступ для этого пользователя?')) return;

  try {
    await axios.delete(
      `${API_BASE_URL}/workspaces/${workspaceId}/share/${userId}`,
      { withCredentials: true }
    );

    // Update local state
    const workspace = workspaces.value.find(w => w._id === workspaceId);
    if (workspace && workspace.sharedWith) {
      workspace.sharedWith = workspace.sharedWith.filter(s => s.userId !== userId);
    }

    alert('Доступ отозван');
  } catch (err) {
    console.error('Failed to revoke access:', err);
    alert('Ошибка отзыва доступа');
  }
}

async function revokeInvite(inviteId, workspaceId) {
  if (!confirm('Отозвать эту ссылку? Она станет недействительной.')) return;

  try {
    await axios.delete(
      `${API_BASE_URL}/workspace-invites/${inviteId}`,
      { withCredentials: true }
    );

    // Remove from local state
    if (workspaceInvites.value[workspaceId]) {
      workspaceInvites.value[workspaceId] = workspaceInvites.value[workspaceId].filter(
        inv => inv._id !== inviteId
      );
    }

    alert('Ссылка отозвана');
  } catch (err) {
    console.error('Failed to revoke invite:', err);
    alert('Ошибка отзыва ссылки');
  }
}

onMounted(async () => {
  await loadWorkspaces();
  
  // Scroll to current project
  nextTick(() => {
    if (currentProjectCard.value) {
      currentProjectCard.value.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
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
  width: 85vw;
  min-width: 400px;
  max-width: 1400px;
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

/* Tabs */
.workspace-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.tab-btn {
  flex: 1;
  padding: 14px 20px;
  background: none;
  border: none;
  color: var(--color-text-mute);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 2px solid transparent;
}

.tab-btn:hover {
  color: var(--color-text);
  background: var(--color-background-mute);
}

.tab-btn.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  background: var(--color-background);
}

.workspace-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.workspaces-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

.workspace-card {
  background: var(--color-background-soft);
  border: 2px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s;
  cursor: default;
  display: flex;
  flex-direction: column;
  position: relative;
}

.workspace-card:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.workspace-card.current-project {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(52, 199, 89, 0.1);
}

.workspace-card.shared-card {
  border-color: #34C759;
}

.workspace-card-new {
  border-style: dashed;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* Card thumbnail - upper part */
.card-thumbnail {
  width: 100%;
  height: 180px;
  background-color: var(--color-background-mute);
  background-size: cover;
  background-position: center;
  cursor: pointer;
  transition: opacity 0.2s;
}

.card-thumbnail:hover {
  opacity: 0.9;
}

/* Card controls - lower part */
.card-controls {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--color-background-soft);
  border-top: 1px solid var(--color-border);
}

.card-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-title:hover {
  color: var(--color-primary);
}



.card-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--color-text-mute);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: var(--color-background-mute);
  color: var(--color-primary);
}

.icon-btn:last-child:hover {
  color: #ff4444;
}

/* Current badge */
.current-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: var(--color-primary);
  color: white;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  z-index: 5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.workspace-thumbnail {
  width: 100%;
  height: 200px;
  background: var(--color-background-mute);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
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

.shared-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: #34C759;
  color: white;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  z-index: 5;
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

.shared-info {
  margin: 0 0 12px 0;
  font-size: 0.85rem;
  color: var(--color-text-mute);
}

.workspace-name-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 1.1rem;
  font-weight: 500;
  background: var(--color-background);
  border: 1px solid var(--color-primary);
  border-radius: 6px;
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
  padding: 8px 14px;
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
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-delete:hover {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

/* Settings tab */
.settings-content {
  max-width: 900px;
}

.settings-section {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.settings-workspace-name {
  margin: 0 0 20px 0;
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
}

.shared-list h4,
.invites-list h4 {
  margin: 0 0 12px 0;
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-text);
}

.share-item,
.invite-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 8px;
}

.share-info,
.invite-info {
  display: flex;
  gap: 16px;
  align-items: center;
  flex: 1;
}

.share-email,
.invite-token {
  font-weight: 500;
  color: var(--color-text);
}

.share-role,
.invite-role {
  padding: 4px 10px;
  background: var(--color-background-mute);
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--color-text-mute);
}

.share-date,
.invite-expires {
  font-size: 0.85rem;
  color: var(--color-text-mute);
}

.btn-revoke {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid #ff3b30;
  color: #ff3b30;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-revoke:hover {
  background: rgba(255, 59, 48, 0.1);
}

.no-shares {
  padding: 20px;
  text-align: center;
  color: var(--color-text-mute);
  font-style: italic;
}

/* Empty state */
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
  margin: 0;
  font-size: 1.1rem;
}

/* Dialogs */
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
  min-width: 450px;
  max-width: 600px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.create-dialog h3 {
  margin: 0 0 16px 0;
  font-size: 1.3rem;
  color: var(--color-text);
}

.dialog-subtitle {
  margin: 0 0 20px 0;
  font-size: 1rem;
  color: var(--color-text-mute);
  font-weight: 500;
}

/* Share Dialog Enhancements */
.share-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}

.header-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary) 0%, #FF9D00 100%);
  border-radius: 12px;
  color: white;
  flex-shrink: 0;
}

.share-header h3 {
  margin: 0 0 4px 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text);
}

.share-header .dialog-subtitle {
  margin: 0;
  font-size: 0.95rem;
  color: var(--color-text-mute);
}

/* Role Selector */
.role-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.role-option {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-background-soft);
  border: 2px solid var(--color-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.role-option:hover {
  border-color: var(--color-primary);
  background: var(--color-background);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.role-option.selected {
  border-color: var(--color-primary);
  background: rgba(255, 157, 0, 0.05);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.role-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  flex-shrink: 0;
  background: var(--color-background-mute);
  transition: all 0.2s;
}

.role-option:hover .role-icon,
.role-option.selected .role-icon {
  transform: scale(1.1);
}

.role-analyst {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.role-manager {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

.role-admin {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: white;
}

.role-info {
  flex: 1;
}

.role-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.role-desc {
  font-size: 0.875rem;
  color: var(--color-text-mute);
  line-height: 1.4;
}

.role-check {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  flex-shrink: 0;
}

/* Generate Button */
.btn-generate {
  width: 100%;
  padding: 14px 24px;
  background: linear-gradient(135deg, var(--color-primary) 0%, #FF9D00 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(255, 157, 0, 0.3);
}

.btn-generate:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(255, 157, 0, 0.4);
}

.btn-generate:active:not(:disabled) {
  transform: translateY(0);
}

.btn-generate:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--color-text);
}

.role-select {
  width: 100%;
  padding: 12px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 1rem;
}

.role-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.link-display {
  margin-top: 24px;
  padding: 20px;
  background: linear-gradient(135deg, rgba(255, 157, 0, 0.05) 0%, rgba(255, 157, 0, 0.02) 100%);
  border: 1px solid rgba(255, 157, 0, 0.2);
  border-radius: 12px;
  animation: fadeInUp 0.3s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.link-display label {
  display: block;
  margin-bottom: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
}

.link-container {
  display: flex;
  gap: 10px;
}

.link-input {
  flex: 1;
  padding: 12px 16px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
  transition: all 0.2s;
  cursor: pointer;
}

.link-input:hover {
  border-color: var(--color-primary);
  background: var(--color-background-soft);
}

.link-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(255, 157, 0, 0.1);
}

.btn-copy {
  padding: 12px 20px;
  background: var(--color-background-soft);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-copy:hover {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(255, 157, 0, 0.2);
}

.btn-copy.copied {
  background: #34C759;
  color: white;
  border-color: #34C759;
}

.btn-copy svg {
  transition: transform 0.2s;
}

.btn-copy:hover svg {
  transform: scale(1.1);
}

.link-hint {
  margin: 14px 0 0 0;
  font-size: 0.85rem;
  color: var(--color-text-mute);
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.5;
}

.link-hint svg {
  flex-shrink: 0;
  opacity: 0.6;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}

.btn-cancel,
.btn-create {
  padding: 10px 24px;
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

.btn-create:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn-create:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-delete-confirm {
  padding: 10px 24px;
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

/* Fullscreen loader */
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
