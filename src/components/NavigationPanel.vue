<!--
 * * --- МЕТКА ВЕРСИИ: v11.0-NAV-UPDATE ---
 * * ВЕРСИЯ: 11.0 - Добавлена кнопка "О сервисе"
 * * ДАТА: 2025-11-18
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. (NEW) Добавлена кнопка `about-btn` (знак вопроса) над кнопкой пользователя.
 * 2. (NEW) Импортирован компонент `AboutModal`.
 * 3. (NEW) Добавлено состояние `showAboutModal` для управления видимостью окна.
 * 4. (STYLE) Добавлены стили для кнопки `about-btn`, чтобы она выглядела гармонично.
 -->
<template>
  <nav class="nav-panel">
    <!-- Логотип -->
    <div class="nav-logo">
      <img src="@/assets/logo.svg" alt="Logo" />
    </div>

    <!-- Основные ссылки навигации -->
    <div class="nav-links">
      <router-link to="/" class="nav-item" active-class="active" title="Главная">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
      </router-link>
      
      <router-link to="/about" class="nav-item" active-class="active" title="О нас">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
      </router-link>
    </div>

    <!-- Нижняя часть: О сервисе и Профиль -->
    <div class="nav-footer">
      
      <!-- 🟢 v11.0: Кнопка "О сервисе" (?) -->
      <button class="nav-item about-btn" @click="showAboutModal = true" title="О сервисе">
        <span class="question-mark">?</span>
      </button>

      <!-- Меню пользователя -->
      <div class="user-menu-wrapper" ref="userMenuRef">
        <button class="user-avatar-btn" @click="toggleUserMenu">
          <div class="avatar-placeholder">
            {{ userInitials }}
          </div>
        </button>

        <!-- Выпадающее меню -->
        <div v-if="isUserMenuOpen" class="user-dropdown">
          <div class="dropdown-header">
            <p class="user-name">{{ userName }}</p>
            <p class="user-email">{{ userEmail }}</p>
          </div>
          <div class="dropdown-items">
            <button @click="openSettings" class="dropdown-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              Настройки
            </button>
            <button @click="handleLogout" class="dropdown-item text-danger">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Выйти
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 🟢 v11.0: Модальное окно "О сервисе" -->
    <AboutModal v-if="showAboutModal" @close="showAboutModal = false" />
    
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useRouter } from 'vue-router';
import AboutModal from '@/components/AboutModal.vue'; // Импорт компонента

const mainStore = useMainStore();
const router = useRouter();

const isUserMenuOpen = ref(false);
const userMenuRef = ref(null);
const showAboutModal = ref(false); // Состояние модального окна

const user = computed(() => mainStore.user);
const userName = computed(() => user.value?.name || 'Пользователь');
const userEmail = computed(() => user.value?.email || 'email@example.com');

const userInitials = computed(() => {
  const name = userName.value;
  if (!name) return 'U';
  return name.charAt(0).toUpperCase();
});

function toggleUserMenu() {
  isUserMenuOpen.value = !isUserMenuOpen.value;
}

function closeUserMenu(event) {
  if (userMenuRef.value && !userMenuRef.value.contains(event.target)) {
    isUserMenuOpen.value = false;
  }
}

function openSettings() {
  isUserMenuOpen.value = false;
  router.push('/settings'); // Предполагаем наличие роута /settings
  // Если роута нет, можно показать уведомление или модалку настроек
  console.log("Open settings clicked");
}

async function handleLogout() {
  isUserMenuOpen.value = false;
  await mainStore.logout();
  router.push('/login'); // Перенаправление на логин (если есть такая страница)
  window.location.reload(); // Полная перезагрузка для очистки состояния
}

onMounted(() => {
  document.addEventListener('click', closeUserMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', closeUserMenu);
});
</script>

<style scoped>
.nav-panel {
  width: 60px; /* Компактная панель */
  height: 100vh;
  background-color: var(--color-background);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 100;
  box-shadow: 2px 0 5px rgba(0,0,0,0.05);
}

.nav-logo {
  margin-bottom: 40px;
}
.nav-logo img {
  width: 32px;
  height: 32px;
}

.nav-links {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  align-items: center;
}

.nav-item {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--color-text-soft);
  transition: all 0.2s ease;
  background: transparent;
  border: none;
  cursor: pointer;
}

.nav-item:hover {
  background-color: var(--color-background-soft);
  color: var(--color-accent);
}

.nav-item.active {
  background-color: var(--color-accent-soft);
  color: var(--color-accent);
}

/* --- Footer Navigation --- */
.nav-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  width: 100%;
}

/* 🟢 v11.0: Стили кнопки "О сервисе" */
.about-btn {
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.question-mark {
  font-weight: 700;
  font-size: 18px;
}
.about-btn:hover {
  border-color: var(--color-accent);
  background-color: var(--color-background-soft);
  color: var(--color-accent);
}

/* --- User Menu --- */
.user-menu-wrapper {
  position: relative;
}

.user-avatar-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  background: transparent;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  background-color: var(--color-accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 16px;
}

/* --- Dropdown --- */
.user-dropdown {
  position: absolute;
  bottom: 10px;
  left: 50px; /* Выпадает справа от панели */
  width: 200px;
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.1);
  padding: 8px 0;
  z-index: 200;
  overflow: hidden;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

.dropdown-header {
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 4px;
}

.user-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 12px;
  color: var(--color-text-soft);
  margin: 2px 0 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-items {
  display: flex;
  flex-direction: column;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text);
  font-size: 14px;
  transition: background-color 0.2s;
}

.dropdown-item:hover {
  background-color: var(--color-background-soft);
}

.text-danger {
  color: var(--color-danger);
}
.text-danger:hover {
  background-color: var(--color-danger-bg);
}
</style>
