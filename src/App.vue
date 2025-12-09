<script setup>
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { useMainStore } from '@/stores/mainStore'

const mainStore = useMainStore()

// Функция для инициализации приложения
const initializeApp = async () => {
  try {
    console.log('Инициализация приложения (Realtime Mode)...')
    
    // 🟢 1. Проверяем авторизацию. Это критично для Socket.io, 
    // так как нам нужен userId для подключения к личной комнате событий.
    if (!mainStore.user) {
       await mainStore.checkAuth()
    }
    
    // 2. Инициализируем хранилище (загрузка справочников и операций)
    if (typeof mainStore.fetchAllEntities === 'function') {
      await mainStore.fetchAllEntities()
    } else {
      console.warn('mainStore.fetchAllEntities не является функцией. Пропуск инициализации.')
    }
    
    console.log('Приложение успешно инициализировано')
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
</template>

<style scoped>
/* Стили для корневого компонента приложения */
</style>


