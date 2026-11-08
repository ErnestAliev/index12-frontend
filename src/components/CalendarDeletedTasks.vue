<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import TeamChatDialog from './TeamChatDialog.vue';
import { useBusinessStore } from '@/stores/businessStore';
import { businessError } from '@/services/businessApi';
const emit = defineEmits(['close', 'restored']);
const business = useBusinessStore(), rows = ref([]), query = ref(''), loading = ref(true), busy = ref(''), error = ref(''), truncated = ref(false);
let active = true;
const shown = computed(() => rows.value.filter(task => task.title.toLocaleLowerCase('ru').includes(query.value.trim().toLocaleLowerCase('ru'))));
async function load() {
  loading.value = true; error.value = '';
  try { const data = await business.deletedTasks(); if (active) { rows.value = data.tasks; truncated.value = data.truncated; } }
  catch (e) { if (active) error.value = e.response ? businessError(e) : e.message; }
  finally { if (active) loading.value = false; }
}
async function restore(task) {
  if (busy.value) return;
  busy.value = task._id; error.value = '';
  try {
    const data = await business.restoreTask(task);
    if (!active) return;
    rows.value = rows.value.filter(row => row._id !== task._id); emit('restored', data.task);
    if (data.missingAttachments) error.value = 'Задача восстановлена. Некоторые вложения уже недоступны.';
  } catch (e) { if (active) error.value = e.response ? businessError(e) : e.message; }
  finally { if (active) busy.value = ''; }
}
function outside(event) {
  const box = event.currentTarget.getBoundingClientRect();
  if (!busy.value && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) emit('close');
}
onMounted(load); onBeforeUnmount(() => { active = false; });
</script>
<template>
  <TeamChatDialog class="deleted-tasks-dialog" title="Удалённые задачи" :busy="!!busy" @close="emit('close')" @click="outside">
    <div class="deleted-task-body">
      <input v-model="query" type="search" placeholder="Найти задачу" aria-label="Поиск удалённых задач" />
      <p v-if="error" role="alert">{{ error }}<button v-if="!busy" type="button" @click="load">Обновить</button></p>
      <p v-if="loading" role="status">Загрузка…</p>
      <p v-else-if="!shown.length">{{ query ? 'Ничего не найдено' : 'Нет удалённых задач' }}</p>
      <div v-for="task in shown" :key="task._id" class="deleted-task-row">
        <span :title="task.title">{{ task.title }}</span><button type="button" :disabled="!!busy" :aria-label="`Восстановить ${task.title}`" @click="restore(task)">{{ busy === task._id ? '…' : 'Восстановить' }}</button>
      </div>
      <p v-if="truncated" role="status">Показаны последние 2000 удалённых задач</p>
    </div>
  </TeamChatDialog>
</template>
<style scoped>
.deleted-task-body { min-height: 0; overflow: auto; padding: 8px 12px max(12px,var(--safe-bottom-controls)); font-size: 13px; }
.deleted-task-body>input { width: 100%; box-sizing: border-box; min-height: 44px; padding: 8px 10px; margin: 0 0 8px; border: 1px solid var(--codex-pane-border); border-radius: 8px; background: var(--codex-pane-surface); color: inherit; font: inherit; font-size: 16px; }
.deleted-task-body>input:focus { outline: none !important; box-shadow: none !important; }
.deleted-tasks-dialog.keyboard-navigation .deleted-task-body>input:focus-visible { outline: 2px solid var(--codex-pane-focus) !important; outline-offset: -2px; }
.deleted-task-row { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 12px; min-height: 52px; border-bottom: 1px solid var(--codex-pane-border); }
.deleted-task-row>span { overflow-wrap: anywhere; line-height: 1.4; padding-block: 8px; }
.deleted-task-body button { min-height: 44px; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--codex-pane-accent); font: inherit; font-size: 12px; cursor: pointer; }
.deleted-task-body button:disabled { opacity: .5; cursor: default; }
.deleted-task-body p { font-size: 12px; color: var(--codex-pane-muted); }
.deleted-task-body p[role=alert] { color: var(--codex-pane-danger); }
</style>
