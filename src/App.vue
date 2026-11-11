<script setup>
import { onMounted, onUnmounted, watch, ref, nextTick } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useTeamChatStore } from '@/stores/teamChatStore'
import { openTeamDestination, pendingTeamDestination, completeTeamDestination } from '@/utils/teamDestination'
import TeamChatHost from '@/components/TeamChatHost.vue'
import TextFieldLinks from '@/components/TextFieldLinks.vue'
import { useMainStore } from '@/stores/mainStore'
import { useRepairStore } from '@/stores/repairStore' // 🟢 Импортируем repairStore
import {setHistoryIdentity,connectPreferenceHistory} from '@/utils/preferenceHistory.js'
import { useAppearanceStore } from '@/stores/appearanceStore'

const mainStore = useMainStore()
const chat = useTeamChatStore(), route = useRoute()
const entryDestination = pendingTeamDestination()
const priorityWorkspace = ref(entryDestination && !entryDestination.staff && ['/', '/mobile'].includes(window.location.pathname) ? entryDestination.workspaceId : null)
const workspaceVisible = ref(!priorityWorkspace.value)
let released = false
async function releaseWorkspace() {
  if (!priorityWorkspace.value || released) return
  released = true
  await nextTick()
  requestAnimationFrame(() => {
    // Let the chat paint first; home views and their data requests start behind it.
    workspaceVisible.value = true
    void initializeApp().finally(() => {
      if (!chat.open || !mainStore.user || String(mainStore.user.currentWorkspaceId) === priorityWorkspace.value)
        priorityWorkspace.value = null
    })
  })
}
function priorityReady(result) {
  if (result?.dismissed) { void releaseWorkspace(); priorityWorkspace.value = null; return }
  const target = pendingTeamDestination()
  if (!chat.me?.owner || chat.error || !target) { void releaseWorkspace(); return }
  if (!target.messageId) {
    if (!target.taskId || chat.state.tasks.some(task => task._id === target.taskId))
      completeTeamDestination({ workspaceId: chat.me.workspaceId, taskId: target.taskId })
    void releaseWorkspace()
  }
}
window.addEventListener('index12:team-destination-visible', releaseWorkspace)
window.addEventListener('index12:team-priority-settled', releaseWorkspace)
onUnmounted(() => {
  window.removeEventListener('index12:team-destination-visible', releaseWorkspace)
  window.removeEventListener('index12:team-priority-settled', releaseWorkspace)
})
const followTeamDestination = () => openTeamDestination(chat, route.path)
watch(() => [chat.me?.workspaceId, chat.me?.status, route.fullPath], followTeamDestination, { immediate: true })
window.addEventListener('index12:team-destination', followTeamDestination)
onUnmounted(() => window.removeEventListener('index12:team-destination', followTeamDestination))
const repairStore = useRepairStore() // 🟢 Инициализируем
const appearance = useAppearanceStore()
watch(() => mainStore.user?.id || mainStore.user?._id || null, id => { setHistoryIdentity(id); appearance.loadUser(id) }, { immediate: true })
const disconnectAppearance = appearance.connect()
onUnmounted(disconnectAppearance)
onUnmounted(connectPreferenceHistory())

// Функция для инициализации приложения
const initializeApp = async () => {
  if (window.location.pathname.startsWith('/team/')) return;
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
  if (!priorityWorkspace.value) await initializeApp()
  
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
  <RouterView v-if="workspaceVisible" />
  <TeamChatHost :priority-workspace="priorityWorkspace" @priority-ready="priorityReady" />
  <TextFieldLinks />

  <!-- 🟢 Шторка обновления базы данных (появляется только при миграции) -->
  <div v-if="repairStore.isRepairing && !chat.open" class="repair-overlay">
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
