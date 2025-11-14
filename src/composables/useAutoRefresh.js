import { onMounted, onUnmounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';

export function useAutoRefresh() {
  const mainStore = useMainStore();
  
  onMounted(() => {
    // Запускаем автообновление каждые 30 секунд
    console.log('[ЖУРНАЛ] useAutoRefresh: 🚀 Инициализация автообновления');
    mainStore.startAutoRefresh(30000);
  });
  
  onUnmounted(() => {
    // Останавливаем автообновление при размонтировании компонента
    console.log('[ЖУРНАЛ] useAutoRefresh: 🛑 Остановка автообновления');
    mainStore.stopAutoRefresh();
  });
  
  return {
    forceRefresh: mainStore.forceRefreshAll
  };
}