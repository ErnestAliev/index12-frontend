<script setup>
import { useMainStore } from '@/stores/mainStore';

const mainStore = useMainStore();
const emit = defineEmits(['menu']);

const userAvatar = mainStore.user?.avatarUrl;
const userName = mainStore.user?.name || '?';
</script>

<template>
  <div class="mobile-bottom-nav">
    <!-- Инфо -->
    <button class="nav-item info-btn" title="О сервисе">
      <div class="icon-circle green-border">
        <span>i</span>
      </div>
    </button>

    <!-- Экспорт (Центр) -->
    <button class="nav-item export-btn" title="Экспорт">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
    </button>

    <!-- Профиль -->
    <button class="nav-item profile-btn" @click="$emit('menu')" title="Меню">
      <img v-if="userAvatar" :src="userAvatar" class="avatar-img" />
      <div v-else class="avatar-placeholder">{{ userName[0] }}</div>
    </button>
  </div>
</template>

<style scoped>
.mobile-bottom-nav {
  height: 60px;
  background-color: #111; /* Очень темный, почти черный */
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  border-top: 1px solid #333;
  flex-shrink: 0;
}

.nav-item {
  background: none;
  border: none;
  padding: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Иконка Info */
.icon-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--color-primary, #34c759);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary, #34c759);
  font-weight: bold;
  font-size: 14px;
  font-family: serif; /* Для красивой i */
}

/* Аватар */
.avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid #555;
}

.avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: #333;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}
</style>