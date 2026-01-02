<template>
  <div class="invite-page">
    <div class="invite-container">
      <!-- Loading State -->
      <div v-if="isLoading" class="invite-card loading-card">
        <div class="spinner-container">
          <div class="spinner"></div>
        </div>
        <p class="loading-text">Проверка приглашения...</p>
      </div>
      
      <!-- Error State -->
      <div v-else-if="error" class="invite-card error-card">
        <div class="error-icon">
          <svg viewBox="0 0 24 24" width="72" height="72" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </div>
        <h2>Ошибка</h2>
        <p class="error-message">{{ error }}</p>
        <button class="btn-primary" @click="goHome">На главную</button>
      </div>

      <!-- Invite Card -->
      <div v-else class="invite-card">
        <!-- Header -->
        <div class="invite-header">
          <div class="header-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
          </div>
          <h1>Приглашение в проект</h1>
        </div>

        <!-- Project Info -->
        <div class="project-info">
          <div class="project-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <line x1="9" y1="9" x2="15" y2="9"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
          </div>
          <div class="project-details">
            <p class="project-label">Проект</p>
            <h2 class="project-name">{{ workspace?.name }}</h2>
          </div>
        </div>

        <!-- Role Badge -->
        <div class="role-section">
          <p class="role-label">Ваша роль</p>
          <div class="role-badge" :class="`role-${role}`">
            <div class="role-icon-small"></div>
            <span>{{ getRoleLabel(role) }}</span>
          </div>
          <p class="role-description">{{ getRoleDescription(role) }}</p>
        </div>

        <!-- Actions -->
        <div class="invite-actions">
          <button 
            class="btn-accept" 
            @click="acceptInvite" 
            :disabled="isAccepting"
          >
            <svg v-if="!isAccepting" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <div v-else class="btn-spinner"></div>
            {{ isAccepting ? 'Принятие...' : 'Принять приглашение' }}
          </button>
          <button class="btn-decline" @click="goHome">Отклонить</button>
        </div>

        <!-- Footer Note -->
        <div class="invite-footer">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <p>После принятия проект появится в вашем списке</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const router = useRouter();
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const isLoading = ref(true);
const isAccepting = ref(false);
const error = ref('');
const workspace = ref(null);
const role = ref('');

onMounted(async () => {
  try {
    const token = route.params.token;
    const res = await axios.get(`${API_BASE_URL}/workspace-invite/${token}`);
    
    workspace.value = res.data.workspace;
    role.value = res.data.role;
  } catch (err) {
    error.value = err.response?.data?.message || 'Ошибка загрузки приглашения';
  } finally {
    isLoading.value = false;
  }
});

async function acceptInvite() {
  try {
    isAccepting.value = true;
    const token = route.params.token;
    
    await axios.post(
      `${API_BASE_URL}/workspace-invite/${token}/accept`,
      {},
      { withCredentials: true }
    );
    
    // Redirect to home with success indication
    router.push('/');
  } catch (err) {
    const errorMsg = err.response?.data?.message || 'Не удалось принять приглашение';
    error.value = errorMsg;
    isAccepting.value = false;
  }
}

function goHome() {
  router.push('/');
}

function getRoleLabel(roleValue) {
  const labels = {
    analyst: 'Аналитик',
    manager: 'Менеджер',
    admin: 'Администратор',
    viewer: 'Аналитик', // Legacy mapping
    editor: 'Менеджер'  // Legacy mapping
  };
  return labels[roleValue] || roleValue;
}

function getRoleDescription(roleValue) {
  const descriptions = {
    analyst: 'Просмотр данных без возможности изменений',
    manager: 'Создание и редактирование операций',
    admin: 'Полный доступ и управление проектом',
    viewer: 'Просмотр данных без возможности изменений',
    editor: 'Создание и редактирование операций'
  };
  return descriptions[roleValue] || '';
}
</script>

<style scoped>
.invite-page {
  min-height: 100vh;
  background: var(--color-background);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
  overflow: hidden;
}

/* Animated background effect */
.invite-page::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 157, 0, 0.05) 0%, transparent 70%);
  animation: pulse 15s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.3; }
  50% { transform: scale(1.1) rotate(180deg); opacity: 0.5; }
}

.invite-container {
  width: 100%;
  max-width: 520px;
  position: relative;
  z-index: 1;
}

.invite-card {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Loading State */
.loading-card {
  text-align: center;
  padding: 60px 40px;
}

.spinner-container {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.spinner {
  width: 56px;
  height: 56px;
  border: 4px solid var(--color-background-mute);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  margin: 0;
  color: var(--color-text-mute);
  font-size: 1.05rem;
}

/* Error State */
.error-card {
  text-align: center;
  padding: 48px 40px;
}

.error-icon {
  margin-bottom: 24px;
  color: #ff3b30;
  animation: errorPulse 2s ease-in-out infinite;
}

@keyframes errorPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.05); }
}

.error-card h2 {
  margin: 0 0 16px 0;
  color: var(--color-text);
  font-size: 1.8rem;
  font-weight: 600;
}

.error-message {
  margin: 0 0 32px 0;
  color: var(--color-text-mute);
  font-size: 1rem;
  line-height: 1.6;
}

/* Header */
.invite-header {
  text-align: center;
  margin-bottom: 32px;
}

.header-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary) 0%, #FF9D00 100%);
  border-radius: 20px;
  color: white;
  box-shadow: 0 8px 24px rgba(255, 157, 0, 0.3);
  animation: iconFloat 3s ease-in-out infinite;
}

@keyframes iconFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.invite-header h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--color-text);
}

/* Project Info */
.project-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  margin-bottom: 24px;
  transition: all 0.2s;
}

.project-info:hover {
  border-color: var(--color-primary);
  background: var(--color-background-mute);
}

.project-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background-soft);
  border-radius: 10px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.project-details {
  flex: 1;
}

.project-label {
  margin: 0 0 4px 0;
  font-size: 0.85rem;
  color: var(--color-text-mute);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
}

.project-name {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--color-text);
}

/* Role Section */
.role-section {
  text-align: center;
  padding: 24px;
  background: var(--color-background);
  border-radius: 12px;
  margin-bottom: 28px;
}

.role-label {
  margin: 0 0 12px 0;
  font-size: 0.9rem;
  color: var(--color-text-mute);
  font-weight: 500;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 12px;
  transition: all 0.2s;
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

.role-icon-small {
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
}

.role-description {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-mute);
  line-height: 1.5;
}

/* Actions */
.invite-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.btn-primary,
.btn-accept,
.btn-decline {
  padding: 15px 32px;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-primary,
.btn-accept {
  background: linear-gradient(135deg, var(--color-primary) 0%, #FF9D00 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(255, 157, 0, 0.3);
}

.btn-primary:hover,
.btn-accept:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(255, 157, 0, 0.4);
}

.btn-accept:active:not(:disabled) {
  transform: translateY(0);
}

.btn-accept:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.btn-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.btn-decline {
  background: transparent;
  color: var(--color-text-mute);
  border: 1px solid var(--color-border);
  box-shadow: none;
}

.btn-decline:hover {
  background: var(--color-background-mute);
  border-color: var(--color-text-mute);
  color: var(--color-text);
}

/* Footer */
.invite-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-mute);
}

.invite-footer svg {
  flex-shrink: 0;
  opacity: 0.6;
}

.invite-footer p {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
}

/* Responsive */
@media (max-width: 600px) {
  .invite-card {
    padding: 32px 24px;
  }
  
  .invite-header h1 {
    font-size: 1.5rem;
  }
  
  .project-name {
    font-size: 1.2rem;
  }
}
</style>
