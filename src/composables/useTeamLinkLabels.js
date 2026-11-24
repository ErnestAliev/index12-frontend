import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { teamApi, useTeamChatStore } from '@/stores/teamChatStore';
import { renderCodexMarkdown } from '@/utils/codexMarkdown';
import { parseTeamDestination } from '@/utils/teamDestination';

const key = (href, name) => JSON.stringify([href, name]);
const hasLabel = link => /(?:Файл|Задача)\s*:\s*$/iu.test(link.previousSibling?.textContent || '') || /^(?:Файл|Задача)\s*:/iu.test(link.textContent);
const fileName = value => String(value || '').replace(/[\r\n]/g, ' ');

// Old links point to their source, without recording whether they represent a file or task.
export function useTeamLinkLabels({ messages, extraMessage, active }) {
  const chat = useTeamChatStore(), remote = ref(new Map());
  const scope = computed(() => chat.me?.status === 'active' ? JSON.stringify([chat.me.workspaceId, chat.me.actorId, chat.sessionEpoch]) : '');
  let identity = '', controller = new AbortController(), requested = new Set();
  const sources = computed(() => {
    const rows = new Map((chat.state.tasks || []).map(task => [`task:${task._id}`, task]));
    for (const message of [...(chat.state.messages || []), ...messages(), extraMessage()].filter(Boolean)) rows.set(`message:${message._id}`, message);
    return rows;
  });
  const links = computed(() => {
    const rows = [];
    if (!scope.value) return rows;
    for (const message of [...messages(), extraMessage()].filter(Boolean)) {
      if (!message.text) continue;
      const container = document.createElement('div');
      container.innerHTML = renderCodexMarkdown(message.text);
      for (const link of container.querySelectorAll('a[href]')) {
        if (hasLabel(link)) continue;
        const destination = parseTeamDestination(link.href);
        if (!destination || destination.workspaceId !== chat.me?.workspaceId || destination.releaseVersion) continue;
        const source = destination.messageId ? `message:${destination.messageId}` : destination.taskId ? `task:${destination.taskId}` : null;
        if (source) rows.push({ source, href: link.href, name: link.textContent });
      }
    }
    return rows;
  });
  watch([scope, links, sources, active], async () => {
    if (identity !== scope.value) {
      controller.abort(); controller = new AbortController(); requested = new Set(); remote.value = new Map(); identity = scope.value;
    }
    if (!identity || !active()) return;
    const current = identity, signal = controller.signal, jobs = [];
    for (const link of links.value) {
      if (sources.value.has(link.source) || requested.has(link.source)) continue;
      requested.add(link.source);
      const [kind, id] = link.source.split(':');
      jobs.push(teamApi.get(`/${kind === 'task' ? 'tasks' : 'messages'}/${id}`, { signal }).then(({ data }) => {
        if (signal.aborted || current !== identity) return;
        const row = kind === 'task' ? data.task : data.message;
        if (row) remote.value = new Map(remote.value).set(link.source, row);
      }));
    }
    // Metadata reads do not mark the source message or its attachments as read.
    await Promise.allSettled(jobs);
  }, { immediate: true });
  const labels = computed(() => {
    const result = new Map();
    if (!scope.value || identity !== scope.value) return result;
    for (const link of links.value) {
      const source = sources.value.get(link.source) || remote.value.get(link.source);
      if (!source) continue;
      const label = (source.attachments || []).some(file => fileName(file.name) === link.name) ? 'Файл' : link.source.startsWith('task:') ? 'Задача' : null;
      if (label) result.set(key(link.href, link.name), label);
    }
    return result;
  });
  onBeforeUnmount(() => controller.abort());
  return labels;
}
