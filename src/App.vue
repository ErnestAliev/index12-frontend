<script setup>
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { useMainStore } from '@/stores/mainStore'

const mainStore = useMainStore()

// Функция для инициализации приложения
const initializeApp = async () => {
  try {
    console.log('Инициализация приложения...')
    
    // Инициализируем хранилище безопасно
    // 🟢 FIX: Добавлена проверка на существование функции и await
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
  
  // Запускаем автообновление, если функция существует
  if (typeof mainStore.startAutoRefresh === 'function') {
    mainStore.startAutoRefresh(30000)
  }
})

// При размонтировании компонента
onUnmounted(() => {
  // Сохраняем кеш перед выходом, если функция существует
  if (typeof mainStore.saveOperationsCache === 'function') {
    mainStore.saveOperationsCache()
  }
  
  // Останавливаем автообновление, если функция существует
  if (typeof mainStore.stopAutoRefresh === 'function') {
    mainStore.stopAutoRefresh()
  }
})

// Функция для принудительного обновления (может быть вызвана из других компонентов)
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