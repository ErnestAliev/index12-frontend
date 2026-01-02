<template>
  <div class="invite-page">
    <div class="invite-container">
      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <p>Проверка приглашения...</p>
      </div>
      
      <div v-else-if="error" class="error-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <h2>Ошибка</h2>
        <p>{{ error }}</p>
        <button class="btn-back" @click="goHome">На главную</button>
      </div>

      <div v-else class="invite-card">
        <div class="invite-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <line x1="9" y1="9" x2="15" y2="9"></line>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
        </div>

        <h2>Приглашение в проект</h2>
        <p class="workspace-name">{{ workspace?.name }}</p>
        <p class="role-info">Роль: <span class="role-badge">{{ getRoleLabel(role) }}</span></p>
        
        <div class="invite-actions">
          <button class="btn-accept" @click="acceptInvite" :disabled="isAccepting">
            {{ isAccepting ? 'Принятие...' : 'Принять приглашение' }}
          </button>
          <button class="btn-decline" @click="goHome">Отклонить</button>
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
    
    alert('Приглашение принято! Проект добавлен в ваш список.');
    router.push('/');
  } catch (err) {
    const errorMsg = err.response?.data?.message || 'Не удалось принять приглашение';
    alert('Ошибка: ' + errorMsg);
    isAccepting.value = false;
  }
}

function goHome() {
  router.push('/');
}

function getRoleLabel(role) {
  const labels = {
    viewer: 'Просмотр',
    editor: 'Редактирование',
    admin: 'Администратор'
  };
  return labels[role] || role;
}
</script>

<style scoped>
.invite-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.invite-container {
  width: 100%;
  max-width: 500px;
}

.loading-state,
.error-state,
.invite-card {
  background: white;
  border-radius: 16px;
  padding: 48px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #f3f3f3;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state p {
  margin: 0;
  color: #666;
  font-size: 1rem;
}

.error-state svg {
  color: #ff3b30;
  margin-bottom: 20px;
}

.error-state h2 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 1.8rem;
}

.error-state p {
  margin: 0 0 24px 0;
  color: #666;
  font-size: 1rem;
}

.btn-back {
  padding: 12px 32px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-back:hover {
  background: #5568d3;
  transform: translateY(-2px);
}

.invite-icon {
  margin-bottom: 24px;
}

.invite-icon svg {
  color: #667eea;
}

.invite-card h2 {
  margin: 0 0 16px 0;
  color: #333;
  font-size: 2rem;
  font-weight: 600;
}

.workspace-name {
  margin: 0 0 12px 0;
  color: #667eea;
  font-size: 1.5rem;
  font-weight: 600;
}

.role-info {
  margin: 0 0 32px 0;
  color: #666;
  font-size: 1rem;
}

.role-badge {
  display: inline-block;
  padding: 4px 12px;
  background: #f0f0f0;
  border-radius: 6px;
  font-weight: 500;
  color: #333;
}

.invite-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn-accept,
.btn-decline {
  padding: 14px 32px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-accept {
  background: #667eea;
  color: white;
}

.btn-accept:hover:not(:disabled) {
  background: #5568d3;
  transform: translateY(-2px);
}

.btn-accept:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-decline {
  background: transparent;
  color: #666;
  border: 1px solid #ddd;
}

.btn-decline:hover {
  background: #f5f5f5;
}
</style>
