<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <button class="close-btn" @click="close">&times;</button>
      
      <div class="modal-header">
        <div class="tabs">
          <button 
            class="tab" 
            :class="{ active: activeTab === 'invite' }"
            @click="activeTab = 'invite'"
          >
            Пригласить
          </button>
          <button 
            class="tab" 
            :class="{ active: activeTab === 'manage' }"
            @click="activeTab = 'manage'"
          >
            Редактировать
          </button>
        </div>
      </div>

      <div class="modal-body">
        <!-- Tab 1: Invite -->
        <div v-if="activeTab === 'invite'" class="tab-content">
          <div class="section">
            <h4>Email сотрудника</h4>
            <input 
              v-model="email" 
              type="email" 
              placeholder="employee@gmail.com"
              class="email-input"
              @keyup.enter="sendInvite"
            />
            <p class="hint">Укажите Google аккаунт сотрудника</p>
          </div>

          <div class="section">
            <h4>Уровень доступа</h4>
            
            <div class="access-options-grid">
              <div class="access-option" :class="{ active: role === 'full_access' }" @click="role = 'full_access'">
                <div class="option-header">
                  <input type="radio" :checked="role === 'full_access'" />
                  <span class="option-title">Полный доступ</span>
                </div>
                <p class="option-desc">Сотрудник видит все данные: виджеты, графики, таймлайн</p>
                <ul class="permissions-list">
                  <li class="allowed">Просмотр всех данных</li>
                  <li class="allowed">Добавление операций</li>
                  <li class="allowed">Редактирование операций</li>
                  <li class="denied">Удаление операций</li>
                  <li class="denied">Приглашение сотрудников</li>
                </ul>
              </div>

              <div class="access-option" :class="{ active: role === 'timeline_only' }" @click="role = 'timeline_only'">
                <div class="option-header">
                  <input type="radio" :checked="role === 'timeline_only'" />
                  <span class="option-title">Только таймлайн</span>
                </div>
                <p class="option-desc">Сотрудник видит только таймлайн и может добавлять операции</p>
                <ul class="permissions-list">
                  <li class="allowed">Просмотр таймлайна</li>
                  <li class="allowed">Добавление операций</li>
                  <li class="denied">Виджеты скрыты</li>
                  <li class="denied">Графики скрыты</li>
                  <li class="denied">Редактирование/удаление</li>
                </ul>
              </div>
            </div>
          </div>

          <div v-if="error" class="message error-message">{{ error }}</div>
          <div v-if="success" class="message success-message">
            <p>Приглашение отправлено на {{ email }}</p>
            <div class="invite-link-box">
              <label>Ссылка для приглашения:</label>
              <div class="link-row">
                <input :value="inviteUrl" readonly class="link-input" @click="selectAll" />
                <button @click="copyLink" class="btn-copy">Копировать</button>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" @click="close">Отмена</button>
            <button 
              class="btn-primary" 
              @click="sendInvite"
              :disabled="!email || loading"
            >
              {{ loading ? 'Отправка...' : 'Отправить приглашение' }}
            </button>
          </div>
        </div>

        <!-- Tab 2: Manage Team -->
        <div v-if="activeTab === 'manage'" class="tab-content">
          <div v-if="loadingTeam" class="loading-state">
            <div class="spinner"></div>
            <p>Загрузка команды...</p>
          </div>

          <div v-else-if="teamMembers.length === 0" class="empty-state">
            <p>Нет приглашенных сотрудников</p>
          </div>

          <div v-else class="team-list">
            <div v-for="member in teamMembers" :key="member._id" class="team-member">
              <div class="member-info">
                <div class="member-name">{{ member.name }}</div>
                <div class="member-email">{{ member.email }}</div>
              </div>
              <div class="member-role">
                <select 
                  :value="member.role" 
                  @change="updateRole(member._id, $event.target.value)"
                  class="role-select"
                >
                  <option value="full_access">Полный доступ</option>
                  <option value="timeline_only">Только таймлайн</option>
                </select>
              </div>
              <div class="member-actions">
                <button @click="removeMember(member._id)" class="btn-remove" title="Удалить">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const props = defineProps({
  visible: Boolean
});

const emit = defineEmits(['close']);

const activeTab = ref('invite');
const email = ref('');
const role = ref('timeline_only');
const loading = ref(false);
const error = ref('');
const success = ref(false);
const inviteUrl = ref('');

const loadingTeam = ref(false);
const teamMembers = ref([]);

const close = () => {
  email.value = '';
  role.value = 'timeline_only';
  error.value = '';
  success.value = false;
  inviteUrl.value = '';
  activeTab.value = 'invite';
  emit('close');
};

const sendInvite = async () => {
  if (!email.value) return;
  
  loading.value = true;
  error.value = '';
  success.value = false;
  
  try {
    const res = await axios.post(`${API_BASE_URL}/invitations/create`, {
      email: email.value,
      role: role.value
    }, { withCredentials: true });
    
    success.value = true;
    inviteUrl.value = res.data.inviteUrl;
    
    // Refresh team list
    loadTeamMembers();
  } catch (e) {
    error.value = e.response?.data?.message || 'Ошибка отправки приглашения';
  } finally {
    loading.value = false;
  }
};

const loadTeamMembers = async () => {
  loadingTeam.value = true;
  try {
    const res = await axios.get(`${API_BASE_URL}/team/members`, { withCredentials: true });
    teamMembers.value = res.data;
  } catch (e) {
    console.error('Failed to load team:', e);
  } finally {
    loadingTeam.value = false;
  }
};

const updateRole = async (userId, newRole) => {
  try {
    await axios.put(`${API_BASE_URL}/team/members/${userId}`, { role: newRole }, { withCredentials: true });
    loadTeamMembers();
  } catch (e) {
    alert('Ошибка изменения роли: ' + (e.response?.data?.message || e.message));
  }
};

const removeMember = async (userId) => {
  if (!confirm('Удалить сотрудника? Он потеряет доступ к системе.')) return;
  
  try {
    await axios.delete(`${API_BASE_URL}/team/members/${userId}`, { withCredentials: true });
    loadTeamMembers();
  } catch (e) {
    alert('Ошибка удаления: ' + (e.response?.data?.message || e.message));
  }
};

const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(inviteUrl.value);
    alert('Ссылка скопирована!');
  } catch (e) {
    console.error('Failed to copy:', e);
  }
};

const selectAll = (e) => {
  e.target.select();
};

// Load team when switching to manage tab
watch(activeTab, (newTab) => {
  if (newTab === 'manage') {
    loadTeamMembers();
  }
});

// Load team when modal opens
watch(() => props.visible, (isVisible) => {
  if (isVisible && activeTab.value === 'manage') {
    loadTeamMembers();
  }
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(2px);
}

.modal-content {
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
  position: relative;
  animation: fadeIn 0.2s ease-out;
  overflow: hidden;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.close-btn {
  position: absolute;
  top: 15px;
  right: 20px;
  background: none;
  border: none;
  font-size: 28px;
  color: var(--color-text-soft);
  cursor: pointer;
  line-height: 1;
  z-index: 10;
}
.close-btn:hover {
  color: var(--color-text);
}

.modal-header {
  padding: 20px 30px 0;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.tabs {
  display: flex;
  gap: 4px;
}

.tab {
  flex: 1;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-soft);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tab:hover {
  color: var(--color-text);
  background: var(--color-background-soft);
}

.tab.active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 30px;
  min-height: 0;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.section {
  background: var(--color-background-soft);
  padding: 20px;
  border-radius: 10px;
  border: 1px solid var(--color-border-hover);
}

h4 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: var(--color-text);
  font-weight: 600;
}

.email-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  background: var(--color-background);
  color: var(--color-text);
  box-sizing: border-box;
}

.email-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.section {
  background: var(--color-background-soft);
  padding: 20px;
  border-radius: 10px;
  border: 1px solid var(--color-border-hover);
}

.section:has(.access-option) {
  padding: 20px;
}

.access-options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.access-option {
  padding: 16px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--color-background);
  height: 100%;
}

.access-option:hover {
  border-color: var(--color-accent);
}

.access-option.active {
  border-color: var(--color-accent);
  background: var(--color-background-soft);
}

.option-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.option-header input[type="radio"] {
  cursor: pointer;
}

.option-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.option-desc {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--color-text-soft);
  line-height: 1.4;
}

.permissions-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.permissions-list li {
  font-size: 13px;
  padding-left: 20px;
  position: relative;
}

.permissions-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  border-radius: 3px;
}

.permissions-list li.allowed {
  color: var(--color-text);
}

.permissions-list li.allowed::before {
  background: #10b981;
  content: '✓';
  color: white;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.permissions-list li.denied {
  color: var(--color-text-soft);
}

.permissions-list li.denied::before {
  background: #6b7280;
  content: '×';
  color: white;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.message {
  padding: 14px 16px;
  border-radius: 8px;
  font-size: 14px;
}

.error-message {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.success-message {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.success-message p {
  margin: 0 0 12px 0;
  font-weight: 600;
}

.invite-link-box label {
  display: block;
  font-size: 12px;
  margin-bottom: 6px;
  color: var(--color-text-soft);
}

.link-row {
  display: flex;
  gap: 8px;
}

.link-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  background: var(--color-background);
  color: var(--color-text);
}

.btn-copy {
  padding: 8px 16px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-copy:hover {
  opacity: 0.9;
}

.modal-footer {
  padding: 15px 30px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-secondary {
  padding: 10px 20px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: var(--color-background-mute);
}

.btn-primary {
  padding: 10px 24px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: opacity 0.2s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Team Management Styles */
.loading-state {
  text-align: center;
  padding: 40px 20px;
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

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-soft);
}

.team-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.team-member {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  font-weight: 600;
  color: var(--color-text);
  font-size: 14px;
  margin-bottom: 4px;
}

.member-email {
  font-size: 12px;
  color: var(--color-text-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-role {
  flex-shrink: 0;
}

.role-select {
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
}

.role-select:focus {
  outline: none;
  border-color: var(--color-accent);
}

.member-actions {
  flex-shrink: 0;
}

.btn-remove {
  padding: 6px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-soft);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-remove:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #ef4444;
}
</style>
