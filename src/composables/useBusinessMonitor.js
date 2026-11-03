import { watch, onBeforeUnmount, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useBusinessStore } from '@/stores/businessStore';
export function useBusinessMonitor(onWorkspaceChange = () => {}, onOpenCalendar = () => {}) {
  const main = useMainStore();
  const business = useBusinessStore();
  watch(() => main.isAdmin && main.user ? `${main.user.id || main.user._id}:${main.user.currentWorkspaceId || ''}` : '', key => {
    onWorkspaceChange();
    if (key) {
      business.start(key);
      const url = new URL(window.location.href);
      if (url.searchParams.has('calendarTask')) {
        const data = { taskId: url.searchParams.get('calendarTask'), workspaceId: url.searchParams.get('calendarWorkspace') };
        url.searchParams.delete('calendarTask'); url.searchParams.delete('calendarWorkspace'); window.history.replaceState({}, '', url);
        setTimeout(() => business.openNotification(data), 0);
      }
    } else business.stop();
  }, { immediate: true });
  onMounted(() => window.addEventListener('index12:open-calendar', onOpenCalendar));
  onBeforeUnmount(() => { business.stop(); window.removeEventListener('index12:open-calendar', onOpenCalendar); });
  return business;
}
