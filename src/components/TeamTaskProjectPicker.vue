<script setup>
import { computed, onMounted, ref } from 'vue';
import { useTeamChatStore } from '@/stores/teamChatStore';
import { useInputModality } from '@/composables/useInputModality';
const props = defineProps({ selected: { type: String, default: null }, disabled: Boolean });
const emit = defineEmits(['select']);
const chat = useTeamChatStore(), query = ref('');
const keyboard = useInputModality();
const projects = computed(() => chat.taskOptions.projects.filter(project => project.name.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())));
onMounted(() => chat.loadTaskOptions());
</script>
<template>
  <div class="task-project-picker" :data-keyboard="keyboard">
    <h3 class="task-step-title">Проект?</h3>
    <input v-if="chat.taskOptions.projects.length > 8" v-model="query" type="search" aria-label="Найти проект" placeholder="Найти проект" />
    <div class="project-options" role="group" aria-label="Выбор проекта">
      <button type="button" class="task-choice-chip" :aria-pressed="!selected" :disabled="disabled" @click="emit('select', null)"><span class="task-chip-label">Без проекта</span></button>
      <button v-for="project in projects" :key="project._id" type="button" class="task-choice-chip" :aria-pressed="selected === project._id" :disabled="disabled" @click="emit('select', project._id)"><span class="task-chip-label">{{ project.name }}</span></button>
    </div>
    <span v-if="chat.taskOptionsLoading" role="status">Загрузка проектов…</span>
    <div v-if="chat.taskOptionsError" role="alert">{{ chat.taskOptionsError }} <button type="button" @click="chat.loadTaskOptions()">Повторить</button></div>
  </div>
</template>
<style scoped>
.task-project-picker { display: grid; gap: 10px; min-width: 0; }
.project-options { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px; max-height: min(320px,45dvh); overflow-y: auto; padding: 2px; }
.project-options button { max-width: 100%; min-height: 44px; text-align: left; overflow-wrap: anywhere; }
.project-options [aria-pressed=true] { color: var(--codex-pane-accent,var(--color-primary)); }
.task-project-picker input { min-width: 0; width: 100%; min-height: 40px; padding: 6px 10px; border: 1px solid var(--codex-pane-border); border-radius: 6px; background: var(--codex-pane-surface); color: inherit; font: inherit; }
.task-project-picker:not([data-keyboard=true]) input:focus { outline: none !important; box-shadow: none !important; }
.task-project-picker [role=alert] { color: var(--color-danger); font-size: 12px; }
</style>

<style scoped src="./teamTaskChips.css"></style>
