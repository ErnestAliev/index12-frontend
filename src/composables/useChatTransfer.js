import { computed, onBeforeUnmount, ref } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useTeamChatStore } from '@/stores/teamChatStore';
import { beginChatDrag, chatTransferScope, takeChatDrag, taskReference } from '@/utils/chatTransfer';

export function useChatTransfer(source) {
  const main = useMainStore(), chat = useTeamChatStore(), pending = ref(false);
  let disposed = false;
  const scope = computed(() => {
    const identity = chatTransferScope(main.user);
    if (source === 'team' && (!chat.me?.owner || chat.me?.status !== 'active' ||
        String(chat.me.workspaceId) !== String(main.user?.currentWorkspaceId) ||
        chat.me.actorId !== `owner:${main.user?._id || main.user?.id}`)) return '';
    return identity;
  });
  function start(event, kind, details) {
    beginChatDrag(event, { source, kind, scope: scope.value, getScope: () => disposed ? '' : scope.value, ...details });
  }
  async function accept(token) {
    const identity = scope.value;
    const item = takeChatDrag(token, { source, scope: identity });
    if (!item) return null;
    pending.value = true;
    try {
      const result = item.kind === 'file' ? { file: await item.read() } : { task: item.task };
      if (disposed || identity !== scope.value || item.getScope() !== identity)
        throw Error('Сеанс чата изменился');
      return result;
    } finally { pending.value = false; }
  }
  onBeforeUnmount(() => { disposed = true; });
  return {
    pending, scope, accept,
    file: (event, read) => start(event, 'file', { read }),
    task: (event, task) => {
      // Nested controls (including attached files) keep their own drag behavior.
      if (event.target?.closest('button, a, input, textarea, select, [contenteditable="true"]')) {
        event.preventDefault(); return;
      }
      if (!scope.value) { event.preventDefault(); return; }
      start(event, 'task', { task: taskReference(task, chat.me.workspaceId) });
    },
  };
}
