<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-sheet">
      <div class="modal-header">
        <h3>Меню</h3>
        <button class="close-btn" @click="$emit('close')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- User info -->
        <div class="user-info">
          <div class="avatar">
            <img v-if="mainStore.user?.avatarUrl" :src="mainStore.user.avatarUrl" alt="Avatar" />
            <div v-else class="avatar-placeholder">
              {{ (mainStore.user?.name || '?')[0].toUpperCase() }}
            </div>
          </div>
          <div class="user-details">
            <div class="name">{{ mainStore.user?.name || 'Пользователь' }}</div>
            <div class="email">{{ mainStore.user?.email }}</div>
          </div>
        </div>

        <!-- Actions -->
        <div class="menu-actions">
          <button class="menu-item" @click="openSettings">
            <div class="menu-item-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6m5.657-11.657l-4.243 4.243m-2.828 2.828l-4.243 4.243m12.728 0l-4.243-4.243m-2.828-2.828l-4.243-4.243"></path>
              </svg>
            </div>
            <span>

Настройки</span>
            <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>

          <button class="menu-item" @click="openAbout">
            <div class="menu-item-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            </div>
            <span>О сервисе</span>
          </button>

          <button class="menu-item logout" @click="logout">
            <div class="menu-item-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </div>
            <span>Выйти</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useMainStore } from '@/stores/mainStore';

const mainStore = useMainStore();
const emit = defineEmits(['close', 'open-about']);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

function openSettings() {
  emit('close');
  // TODO: Navigate to settings or open settings modal
  console.log('Settings not implemented yet');
}

function openAbout() {
  emit('open-about');
}

async function logout() {
  if (!confirm('Вы уверены, что хотите выйти?')) return;
  
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, { 
      method: 'POST', 
      credentials: 'include' 
    });
    sessionStorage.clear();
    localStorage.clear();
    window.location.href = '/';
  } catch (err) {
    console.error('Logout failed:', err);
    // Force navigation anyway
    window.location.href = '/';
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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
  height: 100vh;
  background: var(--color-background-soft, #282828);
  border-radius: 20px 20px 0 0;
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

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

/* User Info */
.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-background, #1a1a1a);
  border-radius: 16px;
  margin-bottom: 20px;
}

.avatar {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(255,255,255,0.1);
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #fff);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.email {
  font-size: 13px;
  color: #888;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary, #34c759);
  background: rgba(52, 199, 89, 0.1);
  padding: 4px 10px;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Menu Actions */
.menu-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 14px 16px;
  background: var(--color-background, #1a1a1a);
  border: 1px solid transparent;
  border-radius: 12px;
  color: var(--color-text, #fff);
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
  gap: 12px;
}

.menu-item:active {
  transform: scale(0.98);
  background: rgba(255,255,255,0.05);
}

.menu-item-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.05);
  border-radius: 10px;
  flex-shrink: 0;
}

.menu-item span {
  flex: 1;
  text-align: left;
  font-weight: 500;
}

.chevron {
  opacity: 0.4;
  flex-shrink: 0;
}

.menu-item.logout {
  color: #ff3b30;
  margin-top: 12px;
}

.menu-item.logout .menu-item-icon {
  background: rgba(255, 59, 48, 0.1);
}
</style>
