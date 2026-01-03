<script setup>
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { useMainStore } from '@/stores/mainStore'
import { useRepairStore } from '@/stores/repairStore' // 🟢 Импортируем repairStore

const mainStore = useMainStore()
const repairStore = useRepairStore() // 🟢 Инициализируем

// Функция для инициализации приложения
const initializeApp = async () => {
  try {
    
    // 🟢 1. Проверяем авторизацию. Это критично для Socket.io, 
    // так как нам нужен userId для подключения к личной комнате событий.
    if (!mainStore.user) {
       await mainStore.checkAuth()
    }

    // Если авторизация успешна, проверяем версию данных
    if (mainStore.user) {
        // 🟢 2. Проверка версии данных и авто-лечение
        // Запускается ПОСЛЕ авторизации, но ПЕРЕД загрузкой данных, чтобы избежать "каши"
        await repairStore.checkAndRunAutoRepair()
    }
    
    // 3. Инициализируем хранилище (загрузка справочников и операций)
    if (typeof mainStore.fetchAllEntities === 'function') {
      await mainStore.fetchAllEntities()
    } else {
      console.warn('mainStore.fetchAllEntities не является функцией. Пропуск инициализации.')
    }
  } catch (error) {
    console.error('Ошибка при инициализации приложения:', error)
  }
}

// При монтировании компонента
onMounted(async () => {
  await initializeApp()
  
  // 🟢 УДАЛЕНО: mainStore.startAutoRefresh(30000) 
  // Теперь система работает на WebSocket (Socket.io) и не требует постоянного опроса сервера.
})

// При размонтировании компонента
onUnmounted(() => {
  // Сохраняем кеш перед выходом, если функция существует (для безопасности)
  if (typeof mainStore.saveOperationsCache === 'function') {
    mainStore.saveOperationsCache()
  }
  
  // 🟢 УДАЛЕНО: mainStore.stopAutoRefresh()
})

// Функция для принудительного обновления (может быть вызвана из других компонентов при сбоях сокета)
const forceRefresh = async () => {
  if (typeof mainStore.forceRefreshAll === 'function') {
    await mainStore.forceRefreshAll()
  }
}
</script>

<template>
  <RouterView />

  <!-- 🟢 Шторка обновления базы данных (появляется только при миграции) -->
  <div v-if="repairStore.isRepairing" class="repair-overlay">
    <div class="repair-content">
      <h3>Обновление базы данных...</h3>
      <p>Пожалуйста, не закрывайте страницу</p>
      <div class="progress-bar">
        <div class="fill" :style="{ width: repairStore.progress + '%' }"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Стили для корневого компонента приложения */

/* 🟢 Стили для шторки обновления */
.repair-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: #1a1a1a;;
  z-index: 99999;
  display: flex; justify-content: center; align-items: center;
}
.repair-content { text-align: center; color: #333; }
.repair-content h3 { margin-bottom: 10px; font-size: 20px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.repair-content p { font-size: 14px; color: #666; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.progress-bar {
  width: 300px; height: 10px; background: #1a1a1a;;
  border-radius: 5px; margin: 20px auto; overflow: hidden;
}
.fill { height: 100%; background: #28B8A0; transition: width 0.3s; }
</style>