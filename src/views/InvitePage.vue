<template>
  <div class="invite-page">
    <div class="invite-container">
      <div class="invite-card">
        <div v-if="loading" class="loading-state">
          <div class="spinner"></div>
          <p>Проверка приглашения...</p>
        </div>

        <div v-else-if="error" class="error-state">
          <div class="error-icon">✕</div>
          <h2>Ошибка</h2>
          <p>{{ error }}</p>
          <a href="/" class="btn-home">На главную</a>
        </div>

        <div v-else-if="invitation" class="invite-valid">
          <div class="invite-header">
            <h1>Приглашение в INDEX12</h1>
            <p class="invite-subtitle">Вы приглашены присоединиться к команде</p>
          </div>

          <div class="invite-details">
            <div class="detail-row">
              <span class="label">Email:</span>
              <span class="value">{{ invitation.email }}</span>
            </div>
            <div class="detail-row">
              <span class="label">Уровень доступа:</span>
              <span class="value">{{ roleLabel }}</span>
            </div>
            <div class="detail-row">
              <span class="label">Пригласил:</span>
              <span class="value">{{ invitation.invitedBy?.name || 'Администратор' }}</span>
            </div>
          </div>

          <div class="permissions-info">
            <h3>Ваши права:</h3>
            <ul v-if="invitation.role === 'full_access'" class="permissions-list">
              <li class="allowed">Просмотр всех данных</li>
              <li class="allowed">Добавление операций</li>
              <li class="allowed">Редактирование операций</li>
              <li class="denied">Удаление операций</li>
            </ul>
            <ul v-else class="permissions-list">
              <li class="allowed">Просмотр таймлайна</li>
              <li class="allowed">Добавление операций</li>
              <li class="denied">Доступ к виджетам</li>
              <li class="denied">Доступ к графикам</li>
            </ul>
          </div>

          <a :href="googleAuthUrl" class="btn-google">
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
              <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.184L12.05 13.56c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.438 15.983 5.482 18 9.003 18z" fill="#34A853"/>
              <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.482 0 2.438 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
            </svg>
            Войти через Google
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const baseUrl = API_BASE_URL.replace(/\/api$/, '');

const loading = ref(true);
const error = ref('');
const invitation = ref(null);

const googleAuthUrl = computed(() => {
  const token = route.params.token;
  return `${baseUrl}/auth/google?inviteToken=${token}`;
});

const roleLabel = computed(() => {
  if (!invitation.value) return '';
  return invitation.value.role === 'full_access' ? 'Полный доступ' : 'Только таймлайн';
});

onMounted(async () => {
  const token = route.params.token;
  
  if (!token) {
    error.value = 'Отсутствует токен приглашения';
    loading.value = false;
    return;
  }

  try {
    const res = await axios.get(`${API_BASE_URL}/invitations/verify/${token}`);
    invitation.value = res.data;
  } catch (e) {
    error.value = e.response?.data?.message || 'Приглашение недействительно или истекло';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.invite-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background);
  padding: 20px;
}

.invite-container {
  width: 100%;
  max-width: 500px;
}

.invite-card {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 40px 30px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.loading-state {
  text-align: center;
  padding: 20px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state p {
  color: var(--color-text-soft);
  margin: 0;
}

.error-state {
  text-align: center;
}

.error-icon {
  width: 60px;
  height: 60px;
  background: rgba(239, 68, 68, 0.1);
  border: 2px solid rgba(239, 68, 68, 0.3);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: #ef4444;
  margin: 0 auto 20px;
}

.error-state h2 {
  margin: 0 0 10px 0;
  color: var(--color-text);
  font-size: 24px;
}

.error-state p {
  color: var(--color-text-soft);
  margin: 0 0 30px 0;
  line-height: 1.5;
}

.btn-home {
  display: inline-block;
  padding: 10px 24px;
  background: var(--color-background-mute);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  text-decoration: none;
  font-weight: 600;
  transition: background 0.2s;
}

.btn-home:hover {
  background: var(--color-background);
}

.invite-valid {
  text-align: center;
}

.invite-header {
  margin-bottom: 30px;
}

.invite-header h1 {
  margin: 0 0 10px 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
}

.invite-subtitle {
  margin: 0;
  color: var(--color-text-soft);
  font-size: 14px;
}

.invite-details {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 25px;
  text-align: left;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border);
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row .label {
  color: var(--color-text-soft);
  font-size: 14px;
}

.detail-row .value {
  color: var(--color-text);
  font-weight: 600;
  font-size: 14px;
}

.permissions-info {
  text-align: left;
  margin-bottom: 30px;
}

.permissions-info h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: var(--color-text);
  font-weight: 600;
}

.permissions-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.permissions-list li {
  padding: 6px 0 6px 24px;
  font-size: 14px;
  position: relative;
}

.permissions-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  color: white;
}

.permissions-list li.allowed {
  color: var(--color-text);
}

.permissions-list li.allowed::before {
  content: '✓';
  background: #10b981;
}

.permissions-list li.denied {
  color: var(--color-text-soft);
}

.permissions-list li.denied::before {
  content: '×';
  background: #6b7280;
}

.btn-google {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: white;
  color: #333;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.btn-google:hover {
  background: #f9f9f9;
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  transform: translateY(-1px);
}
</style>
