import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { teamApi, useTeamChatStore } from '@/stores/teamChatStore';
import { taskDate } from '@/utils/teamTasks';

const groups = [
  { id: 'accounts', label: 'Счета', icon: 'wallet', finance: true },
  { id: 'owners', label: 'Владельцы счетов', icon: 'people', finance: true },
  { id: 'parties', label: 'Контрагенты', icon: 'people', finance: true },
  { id: 'projects', label: 'Проекты', icon: 'folder' },
  { id: 'categories', label: 'Категории', icon: 'grid', finance: true },
  { id: 'subcategories', label: 'Подкатегории', icon: 'grid', finance: true },
  { id: 'people', label: 'Люди', icon: 'people' },
  { id: 'files', label: 'Файлы', icon: 'attach' },
  { id: 'tasks', label: 'Задачи', icon: 'check' },
];
const normalize = text => String(text || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const id = value => String(value?._id || value || '');

export function useTeamSlash({ field, text, setText, mention, enabled, taskId }) {
  const chat = useTeamChatStore();
  const range = ref(null), query = ref(''), category = ref(null), index = ref(0), menu = ref(null);
  const finance = ref(null), fileRows = ref([]), financeLoading = ref(false), filesLoading = ref(false);
  const financeError = ref(''), filesError = ref(''), height = ref(240);
  const taskRows = ref([]), tasksLoading = ref(false), tasksError = ref('');
  const canFinance = computed(() => !!chat.me?.owner || !!chat.me?.accountIds?.length);
  const availableGroups = computed(() => groups.filter(group => !group.finance || canFinance.value));
  const scope = computed(() => chat.me?.status === 'active' ? JSON.stringify([chat.me.workspaceId, chat.me.actorId, chat.sessionEpoch, chat.me.owner, chat.me.accountIds]) : '');
  let controller, financeController, taskController, timer, loadedAt = 0, projectsLoadedAt = 0, tasksLoadedAt = 0, financePromise, projectsPromise, generation = 0, dismissed = '', disposed = false;
  const open = computed(() => !!range.value && !!scope.value && enabled());
  const group = computed(() => groups.find(item => item.id === category.value));
  const loading = computed(() => open.value && (category.value === 'tasks' ? tasksLoading.value : category.value === 'files' ? filesLoading.value : category.value && group.value?.finance ? financeLoading.value : financeLoading.value || filesLoading.value || tasksLoading.value));
  const error = computed(() => category.value === 'tasks' ? tasksError.value : category.value === 'files' ? filesError.value : group.value?.finance ? financeError.value : '');

  function close() { dismissed = range.value ? `${range.value.start}:${query.value}:${category.value}` : ''; range.value = null; clearTimeout(timer); controller?.abort(); taskController?.abort(); filesLoading.value = tasksLoading.value = false; }
  function measure() {
    const input = field(), frame = input?.closest('.codex-chat-window');
    if (input) height.value = Math.max(44, Math.min(280, input.getBoundingClientRect().top - (frame?.getBoundingClientRect().top || window.visualViewport?.offsetTop || 0) - 56));
  }
  async function loadFinance() {
    if (!canFinance.value || financePromise || (finance.value && Date.now() - loadedAt < 30000)) return;
    const current = generation, identity = scope.value;
    const request = financeController = new AbortController(); financeLoading.value = true; financeError.value = '';
    financePromise = teamApi.get('/finance/options', { signal: request.signal }).then(({ data }) => {
      if (!disposed && current === generation && identity === scope.value) { finance.value = data; loadedAt = Date.now(); }
    }).catch(e => {
      if (!disposed && current === generation && !request.signal.aborted) financeError.value = e.response?.data?.message || 'Не удалось загрузить справочники';
    }).finally(() => { if (current === generation) { financeLoading.value = false; financePromise = null; } });
    return financePromise;
  }
  function loadProjects() {
    if (finance.value || projectsPromise || Date.now() - projectsLoadedAt < 30000) return;
    const current = generation;
    projectsPromise = chat.loadTaskOptions()?.finally(() => {
      if (current === generation) { projectsLoadedAt = Date.now(); projectsPromise = null; }
    });
  }
  function loadFiles() {
    clearTimeout(timer); controller?.abort(); fileRows.value = []; filesError.value = ''; filesLoading.value = false;
    if (!open.value || (category.value && category.value !== 'files') || (!category.value && !query.value.trim())) return;
    filesLoading.value = true;
    const identity = scope.value, search = query.value, current = generation;
    timer = setTimeout(async () => {
      const request = controller = new AbortController();
      try {
        const { data } = await teamApi.get('/files/library', { params: { q: search.trim(), limit: 30, offset: 0 }, signal: request.signal });
        if (!disposed && !request.signal.aborted && current === generation && identity === scope.value) fileRows.value = data.files || [];
      } catch (e) {
        if (!disposed && !request.signal.aborted && current === generation) filesError.value = e.response?.data?.message || 'Не удалось найти файлы';
      } finally { if (!disposed && !request.signal.aborted && current === generation) filesLoading.value = false; }
    }, 180);
  }
  async function loadTasks() {
    if (!open.value || (category.value && category.value !== 'tasks') || (!category.value && !query.value.trim()) || tasksLoading.value || Date.now() - tasksLoadedAt < 30000) return;
    const request = taskController = new AbortController(), identity = scope.value, current = generation;
    tasksLoading.value = true; tasksError.value = '';
    try {
      const { data } = await teamApi.get('/tasks', { signal: request.signal });
      if (!disposed && !request.signal.aborted && current === generation && identity === scope.value) {
        taskRows.value = (data.tasks || []).filter(task => !task.deletedAt);
        tasksLoadedAt = Date.now();
      }
    } catch (e) {
      if (!disposed && !request.signal.aborted && current === generation) tasksError.value = e.response?.data?.message || 'Не удалось загрузить задачи';
    } finally { if (!disposed && !request.signal.aborted && current === generation) tasksLoading.value = false; }
  }
  const entities = computed(() => {
    const data = finance.value || {}, result = [];
    const owners = new Map([...(data.companies || []), ...(data.individuals || [])].map(row => [id(row), row.name]));
    const ownerIds = new Set((data.accounts || []).flatMap(row => [id(row.companyId), id(row.individualId)]).filter(Boolean));
    const add = (kind, row, detail = '', extra = '') => result.push({ key: `${kind}:${row.fileId || row._id}`, kind, name: row.name, detail, search: `${row.name} ${extra}`, value: row, icon: groups.find(group => group.id === kind).icon });
    if (canFinance.value) {
      for (const row of data.accounts || []) { const name = owners.get(id(row.companyId)) || owners.get(id(row.individualId)) || ''; add('accounts', row, name, name); }
      for (const row of [...(data.companies || []), ...(data.individuals || [])]) if (ownerIds.has(id(row))) add('owners', row, 'Владелец счёта');
      for (const row of data.contractors || []) add('parties', row, 'Контрагент');
      for (const row of data.individuals || []) add('parties', row, 'Физлицо');
      for (const row of data.categories || []) add('categories', row, ({ income: 'Доход', expense: 'Расход' })[row.type] || 'Категория');
      for (const row of data.subcategories || []) { const parent = (data.categories || []).find(item => id(item) === id(row.parentCategoryId))?.name || ''; add('subcategories', row, parent, parent); }
    }
    for (const row of data.projects || chat.taskOptions.projects || []) add('projects', row, 'Проект');
    for (const row of chat.state.people || []) if (row.status !== 'invited' && row._id !== chat.me?.actorId) add('people', row, chat.me?.roles?.[row.role] || row.position || 'Участник');
    for (const row of fileRows.value) add('files', row, row.uploadedBy?.name || 'Файл');
    for (const row of taskRows.value) {
      const title = String(row.description || '').trim().split('\n')[0] || 'Задача';
      const status = ({ open: 'Новая', progress: 'В процессе', delayed: 'Не успеваю', done: 'Готово' })[row.status] || 'Задача';
      add('tasks', { ...row, name: title.length > 140 ? title.slice(0, 140) + '…' : title }, `${status} · ${taskDate(row)}`, row.description);
    }
    return result;
  });
  const choices = computed(() => {
    const q = normalize(query.value), terms = q.split(' ').filter(Boolean);
    const sections = availableGroups.value.filter(item => !q || normalize(item.label).includes(q)).map(item => ({ ...item, key: `group:${item.id}`, name: item.label, section: true }));
    if (!category.value && !q) return sections;
    const rows = entities.value.filter(row => (!category.value || row.kind === category.value) && terms.every(term => normalize(row.search).includes(term)));
    rows.sort((a, b) => Number(!normalize(a.name).startsWith(q)) - Number(!normalize(b.name).startsWith(q)) || groups.findIndex(group => group.id === a.kind) - groups.findIndex(group => group.id === b.kind) || a.name.localeCompare(b.name, 'ru'));
    return [...rows, ...(!category.value ? sections : [])].slice(0, 40);
  });
  function update(event) {
    const input = event.target;
    if (!input?.matches?.('textarea.codex-input') || event.isComposing) return;
    if (!enabled() || !scope.value) { close(); return; }
    const end = input.selectionStart, match = input.value.slice(0, end).match(/(?:^|\s)\/([^/\n]{0,120})$/u);
    if (!match) { range.value = null; dismissed = ''; return; }
    let search = match[1], selected = null;
    for (const item of availableGroups.value) if (normalize(search).startsWith(normalize(item.label)) && search[item.label.length] === ' ') { selected = item.id; search = search.slice(item.label.length + 1); break; }
    const next = { start: end - match[1].length - 1, end: input.selectionEnd };
    if (`${next.start}:${search}:${selected}` === dismissed) return;
    if (query.value !== search || category.value !== selected) index.value = 0;
    range.value = next; query.value = search; category.value = selected;
    measure();
    void loadFinance();
    loadProjects();
  }
  async function choose(item) {
    if (!item || !open.value) return;
    const input = field(), location = range.value, identity = scope.value;
    // Keep focus in the trusted tap, preserving the iPhone keyboard.
    input?.focus({ preventScroll: true });
    let inserted;
    if (item.section) inserted = `/${item.label} `;
    else if (item.kind === 'people') { inserted = `@${item.name} `; mention(item.value); }
    else if (item.kind === 'files' || item.kind === 'tasks') {
      const label = item.kind === 'tasks' ? 'Задача' : 'Файл';
      const source = item.kind === 'tasks' ? { kind: 'task', taskId: item.value._id } : item.value.sources?.[0];
      if (source) {
        const url = new URL('/', window.location.origin); url.searchParams.set('teamChat', chat.me.workspaceId);
        if (source.taskId) url.searchParams.set('task', source.taskId);
        if (source.kind === 'message' && source.messageId) url.searchParams.set('message', source.messageId);
        inserted = `${label}: [${item.name.replace(/[\\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ')}](${url.href}) `;
      } else inserted = `${label}: ${item.name} `;
    } else {
      const label = ({ accounts: 'Счёт', owners: 'Владелец счёта', parties: 'Контрагент', projects: 'Проект', categories: 'Категория', subcategories: 'Подкатегория' })[item.kind];
      inserted = `${label ? label + ': ' : ''}${item.name} `;
    }
    setText(text().slice(0, location.start) + inserted + text().slice(location.end));
    range.value = null; dismissed = '';
    await nextTick();
    if (!input?.isConnected || identity !== scope.value || input !== field()) return;
    input.focus({ preventScroll: true }); input.setSelectionRange(location.start + inserted.length, location.start + inserted.length);
    if (item.section) update({ target: input });
  }
  function keydown(event) {
    if (!open.value || event.isComposing) return false;
    if (event.key === 'Enter' && event.shiftKey) { close(); return false; }
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return false;
    if (event.key === 'Tab' && (!choices.value.length || event.shiftKey)) { close(); return false; }
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      index.value = choices.value.length ? (index.value + (event.key === 'ArrowDown' ? 1 : -1) + choices.value.length) % choices.value.length : 0;
      void nextTick(() => menu.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
    } else void choose(choices.value[index.value]);
    return true;
  }
  watch([query, category, open], loadFiles);
  watch([query, category, open], loadTasks);
  watch(choices, () => { index.value = Math.min(index.value, Math.max(0, choices.value.length - 1)); });
  watch(scope, () => {
    ++generation; close(); financeController?.abort(); finance.value = null; financePromise = null; financeLoading.value = false;
    financeError.value = ''; fileRows.value = []; loadedAt = projectsLoadedAt = 0; projectsPromise = null; dismissed = '';
    taskRows.value = []; tasksError.value = ''; tasksLoadedAt = 0;
  }, { flush: 'sync' });
  watch(() => taskId(), close);
  function outside(event) { if (event.target !== field() && !menu.value?.contains(event.target)) close(); }
  onMounted(() => { document.addEventListener('pointerdown', outside, true); window.visualViewport?.addEventListener('resize', measure); window.addEventListener('resize', measure); });
  onBeforeUnmount(() => { disposed = true; ++generation; close(); financeController?.abort(); document.removeEventListener('pointerdown', outside, true); window.visualViewport?.removeEventListener('resize', measure); window.removeEventListener('resize', measure); });
  return reactive({ open, choices, index, menu, height, group, loading, error, update, choose, keydown, close });
}
