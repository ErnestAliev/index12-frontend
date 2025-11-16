<script setup>
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { useMainStore } from '@/stores/mainStore'

const mainStore = useMainStore()

// Функция для инициализации приложения
const initializeApp = async () => {
  try {
    console.log('Инициализация приложения...')
    
    // Инициализируем хранилище
    mainStore.fetchAllEntities()
    
    console.log('Приложение успешно инициализировано')
  } catch (error) {
    console.error('Ошибка при инициализации приложения:', error)
  }
}

// При монтировании компонента
onMounted(async () => {
  await initializeApp()
  
  // 🔴 УДАЛЕНО: HomeView.vue (v5.3) теперь управляет 
  // 🔴 запуском автообновления ПОСЛЕ входа пользователя.
  // mainStore.startAutoRefresh(30000)
})

// При размонтировании компонента
onUnmounted(() => {
  // Сохраняем кеш перед выходом
  // (Примечание: эта логика 'saveOperationsCache' не определена в mainStore v4.8)
  // mainStore.saveOperationsCache() 
  
  // Останавливаем автообновление
  mainStore.stopAutoRefresh()
})

// Функция для принудительного обновления (может быть вызвана из других компонентов)
const forceRefresh = async () => {
  await mainStore.forceRefreshAll()
}
</script>

<template>
  <RouterView />
</template>

<style scoped>
/* Стили для корневого компонента приложения */
</style>
