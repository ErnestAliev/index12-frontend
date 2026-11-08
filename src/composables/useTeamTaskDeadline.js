import { computed, ref, onBeforeUnmount } from 'vue';
import { taskDeadlineState } from '@/utils/teamTasks';
const now = ref(Date.now());
let users = 0, timer;
function tick() { now.value = Date.now(); }
export function useTeamTaskDeadline(getTask) {
  if (++users === 1) {
    tick(); timer = setInterval(tick, 15000);
    document.addEventListener('visibilitychange', tick);
  }
  onBeforeUnmount(() => {
    if (--users === 0) { clearInterval(timer); document.removeEventListener('visibilitychange', tick); }
  });
  const state = task => taskDeadlineState(task, now.value);
  return { deadline: computed(() => state(getTask())), state };
}
