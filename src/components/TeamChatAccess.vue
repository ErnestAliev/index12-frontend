<script setup>
import { computed, ref, onBeforeUnmount } from 'vue';
import { teamApi, teamError, useTeamChatStore } from '@/stores/teamChatStore';
import TeamChatDialog from './TeamChatDialog.vue';
import TeamChatRoleSelect from './TeamChatRoleSelect.vue';
import UiIcon from './UiIcon.vue';
const chat = useTeamChatStore();
const formOpen = ref(false), name = ref(''), password = ref(''), role = ref('employee'), link = ref(''), visible = ref(false), creating = ref(false), error = ref(''), notice = ref(''), pending = ref(new Set());
let active = true;
onBeforeUnmount(() => { active = false; password.value = ''; });
const members = computed(() => chat.state.members || []);
const statusLabel = member => ({ invited: 'Ожидает входа', active: 'В системе', pending: 'Ожидает подтверждения', revoked: 'Заблокирован', rejected: 'Заблокирован' })[member.status] || member.status;
function openForm() { name.value = ''; password.value = ''; role.value = 'employee'; link.value = ''; error.value = ''; notice.value = ''; formOpen.value = true; }
function closeForm() { if (creating.value) return; formOpen.value = false; password.value = ''; visible.value = false; }
async function copy() {
  try { await navigator.clipboard.writeText(link.value); notice.value = 'Ссылка скопирована'; }
  catch { notice.value = ''; error.value = 'Не удалось скопировать автоматически. Выделите и скопируйте ссылку.'; }
}
async function createEmployee() {
  if (creating.value || link.value) return;
  creating.value = true; error.value = ''; notice.value = '';
  const request = teamApi.post('/access/employees', { name: name.value, password: password.value, role: role.value });
  let copied;
  // Start the clipboard operation within the tap, including Safari's user gesture.
  if (navigator.clipboard?.write && window.ClipboardItem) {
    try { copied = navigator.clipboard.write([new ClipboardItem({ 'text/plain': request.then(({ data }) => new Blob([data.url], { type: 'text/plain' })) })]).then(() => true, () => false); }
    catch { copied = null; }
  }
  try {
    const { data } = await request;
    if (!active) return;
    link.value = data.url; password.value = '';
    const index = chat.state.members.findIndex(member => member._id === data.member._id);
    if (index < 0) chat.state.members.unshift(data.member); else chat.state.members[index] = data.member;
    const ok = copied ? await copied : false;
    if (!active) return;
    if (ok) notice.value = 'Ссылка скопирована'; else await copy();
  } catch (e) { if (active) error.value = teamError(e); }
  finally { if (active) creating.value = false; }
}
async function change(member, values, event) {
  if (pending.value.has(member._id)) return;
  pending.value.add(member._id); error.value = '';
  try { await chat.action('/access/employees/' + member._id, { role: member.role, expectedVersion: member.version, ...values }, 'patch'); }
  catch (e) { if (active) { error.value = teamError(e); if (event) event.target.value = member.role; } }
  finally { pending.value.delete(member._id); }
}
async function allow(member) {
  if (pending.value.has(member._id)) return;
  pending.value.add(member._id); error.value = '';
  try { await chat.action('/members/' + member._id, { role: member.role, status: 'active', expectedVersion: member.version }, 'patch'); }
  catch (e) { if (active) error.value = teamError(e); }
  finally { pending.value.delete(member._id); }
}
async function remove(member) {
  if (pending.value.has(member._id)) return;
  pending.value.add(member._id); error.value = '';
  try { await chat.action('/members/' + member._id, { expectedVersion: member.version }, 'delete'); }
  catch (e) { if (active) error.value = teamError(e); }
  finally { pending.value.delete(member._id); }
}
</script>
<template>
  <section class="team-access" aria-label="Доступы и роли">
    <button type="button" class="access-add" @click="openForm"><UiIcon name="plus" />Добавить сотрудника</button>
    <p v-if="error && !formOpen" role="alert">{{ error }}</p>
    <p v-if="chat.notice" role="status">{{ chat.notice }}</p>
    <div v-for="member in members" :key="member._id" class="access-row">
      <span class="access-name" :title="member.name + ' · ' + statusLabel(member)"><i :data-status="member.status" :aria-label="statusLabel(member)" /><span>{{ member.name }}</span></span>
      <TeamChatRoleSelect :value="member.role" :roles="chat.me.roles" :label="`Роль ${member.name}`" :disabled="pending.has(member._id)" @change="change(member, { role: $event.target.value }, $event)" />
      <button v-if="member.status === 'pending'" type="button" :disabled="pending.has(member._id)" :aria-label="`Открыть доступ ${member.name}`" title="Открыть доступ" @click="allow(member)"><UiIcon name="check" /></button>
      <button v-else type="button" :disabled="pending.has(member._id)" :aria-label="`${['revoked','rejected'].includes(member.status) ? 'Вернуть доступ' : 'Заблокировать'} ${member.name}`" :title="['revoked','rejected'].includes(member.status) ? 'Вернуть доступ' : 'Заблокировать'" @click="change(member, { blocked: !['revoked','rejected'].includes(member.status) })"><UiIcon :name="['revoked','rejected'].includes(member.status) ? 'undo' : 'ban'" /></button>
      <button type="button" class="access-danger" :disabled="pending.has(member._id)" :aria-label="`Удалить сотрудника ${member.name}`" title="Удалить" @click="remove(member)"><UiIcon name="trash" /></button>
    </div>
    <TeamChatDialog v-if="formOpen" title="Добавить сотрудника" :busy="creating" @close="closeForm">
      <form class="access-form" @submit.prevent="createEmployee">
        <label>Имя сотрудника<input v-model="name" aria-label="Имя сотрудника" autocomplete="off" maxlength="100" required :readonly="creating || !!link" /></label>
        <label v-if="!link">Пароль<div class="access-password"><input v-model="password" aria-label="Пароль сотрудника" :type="visible ? 'text' : 'password'" autocomplete="new-password" minlength="10" maxlength="128" required :readonly="creating" /><button type="button" :aria-label="visible ? 'Скрыть пароль' : 'Показать пароль'" @click="visible = !visible"><UiIcon name="view" /></button></div></label>
        <label>Роль<TeamChatRoleSelect :value="role" :roles="chat.me.roles" label="Роль нового сотрудника" :disabled="creating || !!link" @change="role = $event.target.value" /></label>
        <label v-if="link">Одноразовая ссылка<div class="access-link"><input :value="link" readonly aria-label="Одноразовая ссылка" @focus="$event.target.select()" /><button type="button" aria-label="Скопировать ссылку" @click="copy"><UiIcon name="copy" /></button></div></label>
        <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
        <button v-if="!link" type="submit" :disabled="creating">{{ creating ? 'Создаём…' : 'Создать и скопировать ссылку' }}</button>
        <button v-else type="button" @click="closeForm">Готово</button>
      </form>
    </TeamChatDialog>
  </section>
</template>
<style scoped>
.team-access { min-width: 0; font-size: 13px; }
.team-access .access-add { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; margin-bottom: 8px; padding: 6px 10px; font-size: 13px; }
.access-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(84px,104px) 44px 44px; align-items: center; gap: 2px; min-height: 48px; border-bottom: 1px solid var(--codex-pane-border); }
.access-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.access-name > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.access-name i { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--codex-pane-muted); }
.access-name i[data-status=active] { background: var(--codex-pane-accent); }
.access-name i[data-status=revoked],.access-name i[data-status=rejected] { background: var(--codex-pane-danger); }
.team-access .access-row > button { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; background: transparent; }
.team-access .access-danger { color: var(--codex-pane-danger); }
.access-row :deep(.team-role-select) { width: 100%; max-width: 104px; }
.access-row :deep(select.team-role-input) { font-size: 12px; padding-left: 4px; }
.access-form { display: flex; flex-direction: column; gap: 12px; padding: 12px 16px max(16px,var(--safe-bottom-controls,12px)); min-height: 0; overflow: auto; font-size: 13px; }
.access-form label { display: flex; flex-direction: column; gap: 4px; }
.access-form input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 44px; padding: 8px 10px; border: 1px solid var(--codex-pane-border,var(--color-border)); border-radius: 8px; background: var(--codex-pane-surface,var(--color-background-soft)); color: var(--codex-pane-text,var(--color-text)); font: inherit; font-size: 16px; }
.access-password,.access-link { display: flex; align-items: center; gap: 4px; }
.access-form button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 8px 10px; border: 0; border-radius: 8px; background: var(--codex-pane-surface,var(--color-background-soft)); color: var(--codex-pane-text,var(--color-text)); font: inherit; cursor: pointer; }
.access-form :is(.access-password,.access-link) > button { flex: none; width: 44px; padding: 0; }
.access-form p,.team-access > p { margin: 0; font-size: 12px; }
.access-form [role=alert],.team-access > [role=alert] { color: var(--codex-pane-danger,var(--color-danger)); }
.access-form [role=status] { color: var(--codex-pane-accent,var(--color-primary)); }
</style>
