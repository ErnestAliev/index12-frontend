<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { teamApi, teamError, useTeamChatStore } from "@/stores/teamChatStore";
import UiIcon from "./UiIcon.vue";
import TeamChatRoleSelect from "./TeamChatRoleSelect.vue";
import { formatPhone } from "@/utils/teamPhone";
const chat = useTeamChatStore(),
  invites = ref([]),
  recoveries = ref([]),
  error = ref(""),
  loading = ref(true),
  pending = ref(new Set()),
  copied = ref(null),
  verified = ref({}),
  expanded = ref(null),
  inviteOpen = ref(false),
  invitePanel = ref(null),
  inviteButton = ref(null),
  selectedInviteId = ref(null);
const currentInvite = computed(
  () =>
    invites.value.find((r) => r._id === selectedInviteId.value) ||
    invites.value.find((r) => r.url) ||
    invites.value[0],
);
function closeInvite(event) {
  if (
    event &&
    (invitePanel.value?.contains(event.target) ||
      inviteButton.value?.contains(event.target))
  )
    return;
  inviteOpen.value = false;
}
onMounted(() => document.addEventListener("pointerdown", closeInvite));
let generation = 0,
  copyTimer;
import { onBeforeUnmount } from "vue";
onBeforeUnmount(() => {
  generation++;
  clearTimeout(copyTimer);
  document.removeEventListener("pointerdown", closeInvite);
});
async function load() {
  const g = ++generation;
  try {
    const [links, requests] = await Promise.all([
      teamApi.get("/invites"),
      teamApi.get("/recoveries"),
    ]);
    if (g !== generation) return;
    // Keep freshly issued recovery secrets only in memory, never in storage or background responses.
    recoveries.value = requests.data.recoveries.map((r) => ({
      ...r,
      url: recoveries.value.find(
        (old) => old._id === r._id && old.version === r.version,
      )?.url,
    }));
    invites.value = links.data.invites;
  } catch (e) {
    if (g === generation) error.value = teamError(e);
  } finally {
    if (g === generation) loading.value = false;
  }
}
onMounted(load);
watch(
  () => chat.state.checkedAt,
  () => {
    if (!pending.value.size) void load();
  },
);
async function run(id, fn) {
  if (pending.value.has(id)) return;
  generation++;
  loading.value = false;
  pending.value.add(id);
  error.value = "";
  try {
    return await fn();
  } catch (e) {
    error.value = teamError(e);
    if (e.response?.status === 409) void load();
  } finally {
    pending.value.delete(id);
  }
}
async function newInvite() {
  await run("new", async () => {
    const data = await chat.action("/invite", { role: "employee" });
    invites.value = [
      data.invite,
      ...invites.value.filter((i) => i._id !== data.invite._id),
    ];
    selectedInviteId.value = data.invite._id;
  });
}
async function createInvite() {
  if (inviteOpen.value) {
    inviteOpen.value = false;
    return;
  }
  inviteOpen.value = true;
  if (loading.value) await load();
  if (!selectedInviteId.value) {
    const employeeLink = invites.value.find(
      (row) => row.url && row.role === "employee",
    );
    if (employeeLink) selectedInviteId.value = employeeLink._id;
    else await newInvite();
  } else if (!currentInvite.value?.url) await newInvite();
  await nextTick();
  invitePanel.value?.querySelector("input")?.focus();
}
async function rotate(row, role, event) {
  const result = await run(row._id, async () => {
    const data = await chat.action(
      `/invites/${row._id}`,
      { role, expectedVersion: row.version },
      "patch",
    );
    invites.value = invites.value.map((i) =>
      i._id === row._id ? data.invite : i,
    );
    copied.value = null;
    return true;
  });
  if (!result && event) event.target.value = row.role;
}
async function deleteInvite(row) {
  if (
    !window.confirm(
      "Удалить ссылку? Новые сотрудники не смогут войти по ней. Уже принятые участники сохранят доступ.",
    )
  )
    return;
  await run(row._id, async () => {
    await chat.action(
      `/invites/${row._id}`,
      { expectedVersion: row.version },
      "delete",
    );
    invites.value = invites.value.filter((i) => i._id !== row._id);
    inviteOpen.value = false;
    selectedInviteId.value = null;
  });
}
async function setMember(member, status, role = member.role, event) {
  const ok = await run(member._id, async () => {
    await chat.action(
      `/members/${member._id}`,
      { status, role, expectedVersion: member.version },
      "patch",
    );
    return true;
  });
  if (!ok && event) event.target.value = member.role;
}
const draftRoles = ref({});
function roleChanged(member, event) {
  if (member.status === "pending")
    draftRoles.value[member._id] = event.target.value;
  else void setMember(member, member.status, event.target.value, event);
}
async function deleteMember(row) {
  if (
    !window.confirm(
      `Удалить сотрудника ${row.name}? Номер телефона, пароль и все его сессии будут удалены. Для возврата потребуется новая регистрация.`,
    )
  )
    return;
  await run(row._id, () =>
    chat.action(
      `/members/${row._id}`,
      { expectedVersion: row.version },
      "delete",
    ),
  );
}
async function approveRecovery(row) {
  await run(row._id, async () => {
    const data = await chat.action(`/recoveries/${row._id}/approve`, {
      verified: verified.value[row._id] === true,
      expectedVersion: row.version,
    });
    recoveries.value = recoveries.value.map((r) =>
      r._id === row._id ? { ...data.recovery, url: data.url } : r,
    );
    verified.value[row._id] = false;
  });
}
async function rejectRecovery(row) {
  await run(row._id, async () => {
    await chat.action(
      `/recoveries/${row._id}`,
      { expectedVersion: row.version },
      "delete",
    );
    recoveries.value = recoveries.value.filter((r) => r._id !== row._id);
  });
}
function selectLink(event) {
  event.target.select();
}
async function copy(row, event) {
  error.value = "";
  const field = event.currentTarget
    .closest(".member-link")
    .querySelector("input");
  try {
    if (!navigator.clipboard?.writeText) throw Error("clipboard");
    await navigator.clipboard.writeText(row.url);
  } catch {
    field.focus();
    field.select();
    if (!document.execCommand("copy")) {
      error.value = "Ссылка выделена. Скопируйте её через меню браузера";
      return;
    }
  }
  copied.value = row._id;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copied.value = null), 2000);
  if (invites.value.some((i) => i._id === row._id)) {
    inviteOpen.value = false;
    await nextTick();
    inviteButton.value?.focus();
  }
}
const statusLabel = (s) =>
  ({
    active: "В чате",
    pending: "Ожидает одобрения",
    revoked: "Доступ отозван",
    rejected: "Заявка отклонена",
  })[s];
</script>
<template>
  <div class="member-admin">
    <div v-if="error" class="member-error" role="alert">{{ error }}</div>
    <div class="member-toolbar">
      <button
        ref="inviteButton"
        class="member-create"
        aria-label="Пригласить по ссылке"
        :aria-expanded="inviteOpen"
        aria-controls="chat-invite-panel"
        :disabled="pending.has('new')"
        @click="createInvite"
      >
        <UiIcon
          :name="
            copied && invites.some((i) => i._id === copied) ? 'check' : 'plus'
          "
        />
        {{
          copied && invites.some((i) => i._id === copied)
            ? "Ссылка скопирована"
            : "Пригласить по ссылке"
        }}
      </button>
    </div>
    <section
      v-if="inviteOpen"
      id="chat-invite-panel"
      ref="invitePanel"
      class="member-invite-panel"
      aria-label="Приглашения в чат"
      @keydown.esc.stop="
        inviteOpen = false;
        inviteButton?.focus();
      "
    >
      <p v-if="loading || pending.has('new')" role="status">Загружаем…</p>
      <article
        v-if="currentInvite"
        class="member-invite"
        :data-invite-id="currentInvite._id"
      >
        <div class="member-invite-top">
          <TeamChatRoleSelect
            :value="currentInvite.role"
            :roles="chat.me.roles"
            :label="`Роль по ссылке ${currentInvite._id}`"
            :disabled="pending.has(currentInvite._id)"
            @change="rotate(currentInvite, $event.target.value, $event)"
          />
          <button
            class="member-icon"
            aria-label="Закрыть приглашение"
            title="Закрыть"
            @click="
              inviteOpen = false;
              inviteButton?.focus();
            "
          >
            <UiIcon name="close" />
          </button>
        </div>
        <div class="member-link">
          <input
            v-if="currentInvite.url"
            :value="currentInvite.url"
            readonly
            aria-label="Ссылка приглашения в чат"
            @focus="selectLink"
            @click="selectLink"
            @pointerup.prevent="selectLink"
          />
          <span v-else class="member-meta">Ссылка закрыта</span>
          <button
            v-if="currentInvite.url"
            class="member-icon"
            :disabled="pending.has(currentInvite._id)"
            aria-label="Скопировать ссылку"
            title="Скопировать ссылку"
            @click="copy(currentInvite, $event)"
          >
            <UiIcon name="copy" />
          </button>
        </div>
        <details class="member-link-settings">
          <summary>Действия со ссылкой<UiIcon name="chevron-down" /></summary>
          <div class="member-actions">
            <button
              :disabled="pending.has(currentInvite._id)"
              @click="rotate(currentInvite, currentInvite.role)"
            >
              <UiIcon name="refresh" />Обновить ссылку
            </button>
            <button
              class="member-danger"
              :disabled="pending.has(currentInvite._id)"
              aria-label="Удалить ссылку"
              @click="deleteInvite(currentInvite)"
            >
              <UiIcon name="trash" />Удалить
            </button>
          </div>
        </details>
      </article>
      <details class="member-link-settings">
        <summary>Другие ссылки<UiIcon name="chevron-down" /></summary>
        <div class="member-previous-links">
          <button
            v-for="row in invites.filter((i) => i._id !== currentInvite?._id)"
            :key="row._id"
            @click="selectedInviteId = row._id"
          >
            {{ chat.me.roles[row.role]
            }}<span>{{
              new Date(row.createdAt).toLocaleDateString("ru-RU")
            }}</span>
          </button>
          <button :disabled="pending.has('new')" @click="newInvite">
            <UiIcon name="plus" />Создать другую ссылку
          </button>
        </div>
      </details>
    </section>
    <section
      v-if="recoveries.length"
      class="member-section"
      aria-label="Восстановление доступа"
    >
      <details
        v-for="row in recoveries"
        :key="row._id"
        class="member-recovery"
        open
      >
        <summary>
          <strong>{{ row.name }}</strong
          ><span>Восстановление</span><UiIcon name="chevron-down" />
        </summary>
        <div class="member-expanded">
          <span class="member-meta">+7 {{ formatPhone(row.phone) }}</span>
          <template v-if="!row.url">
            <label class="member-verify"
              ><input v-model="verified[row._id]" type="checkbox" />Запрос
              подтверждён через известный контакт</label
            >
            <div class="member-actions">
              <button
                :disabled="!verified[row._id] || pending.has(row._id)"
                @click="approveRecovery(row)"
              >
                Выдать одноразовую ссылку
              </button>
              <button
                class="member-icon member-danger"
                :disabled="pending.has(row._id)"
                aria-label="Отклонить восстановление"
                title="Отклонить восстановление"
                @click="rejectRecovery(row)"
              >
                <UiIcon name="close" />
              </button>
            </div>
          </template>
          <template v-else>
            <span class="member-meta"
              >Ссылка действует 15 минут. Передайте её через известный контакт
              сотрудника</span
            >
            <div class="member-link">
              <input
                :value="row.url"
                readonly
                aria-label="Ссылка восстановления пароля"
                @focus="selectLink"
                @click="selectLink"
                @pointerup.prevent="selectLink"
              />
              <button
                class="member-icon"
                :aria-label="
                  copied === row._id
                    ? 'Ссылка скопирована'
                    : 'Скопировать ссылку восстановления'
                "
                title="Скопировать"
                @click="copy(row, $event)"
              >
                <UiIcon :name="copied === row._id ? 'check' : 'copy'" />
              </button>
            </div>
          </template>
        </div>
      </details>
    </section>
    <section class="member-section member-list" aria-label="Сотрудники чата">
      <p v-if="!chat.state.members.length && !loading" class="member-meta">
        Нет участников
      </p>
      <article
        v-for="member in chat.state.members"
        :key="member._id"
        class="member-card"
        :aria-label="`Участник ${member.name}`"
      >
        <div class="member-row">
          <button
            class="member-person"
            :aria-expanded="expanded === member._id"
            :aria-controls="`member-settings-${member._id}`"
            @click="expanded = expanded === member._id ? null : member._id"
          >
            <span
              class="member-status"
              :class="member.status"
              :title="statusLabel(member.status)"
              :aria-label="statusLabel(member.status)"
            ></span>
            <strong>{{ member.name }}</strong>
          </button>
          <TeamChatRoleSelect
            :value="draftRoles[member._id] || member.role"
            :roles="chat.me.roles"
            :label="`Роль ${member.name}`"
            :disabled="pending.has(member._id)"
            @change="roleChanged(member, $event)"
          />
          <button
            class="member-icon member-toggle"
            :aria-label="`Настройки ${member.name}`"
            :aria-expanded="expanded === member._id"
            :aria-controls="`member-settings-${member._id}`"
            @click="expanded = expanded === member._id ? null : member._id"
          >
            <UiIcon name="chevron-down" />
          </button>
        </div>
        <div
          v-if="expanded === member._id"
          :id="`member-settings-${member._id}`"
          class="member-expanded"
        >
          <div class="member-person-details">
            <span>+7 {{ formatPhone(member.phone) }}</span
            ><span>{{ statusLabel(member.status) }}</span>
          </div>
          <div class="member-actions">
            <button
              v-if="member.status === 'pending'"
              :disabled="pending.has(member._id)"
              @click="
                setMember(
                  member,
                  'active',
                  draftRoles[member._id] || member.role,
                )
              "
            >
              <UiIcon name="check" />Одобрить
            </button>
            <button
              v-else-if="member.status === 'active'"
              :disabled="pending.has(member._id)"
              @click="setMember(member, 'revoked')"
            >
              Закрыть доступ
            </button>
            <button
              v-else
              :disabled="pending.has(member._id)"
              @click="setMember(member, 'active')"
            >
              Вернуть доступ
            </button>
            <button
              v-if="member.status === 'pending'"
              :disabled="pending.has(member._id)"
              @click="setMember(member, 'rejected')"
            >
              Отклонить
            </button>
            <button
              class="member-danger"
              :disabled="pending.has(member._id)"
              :aria-label="`Удалить сотрудника ${member.name}`"
              @click="deleteMember(member)"
            >
              <UiIcon name="trash" />Удалить
            </button>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>
<style scoped>
.member-admin {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  width: 100%;
  max-width: 640px;
}
.member-admin :is(input, button) {
  box-sizing: border-box;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--codex-pane-border);
  border-radius: 6px;
  background: var(--codex-pane-surface);
  color: var(--codex-pane-text);
  font: inherit;
}
.member-admin button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 10px;
  font-size: 12px;
  cursor: pointer;
}
.member-admin button:disabled {
  opacity: 0.45;
  cursor: default;
}
.member-admin :is(input, button, summary):focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 2px;
}
.member-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.member-admin .member-create {
  background: transparent;
  border-color: transparent;
}
.member-admin .member-create:hover {
  background: var(--codex-pane-surface);
  border-color: var(--codex-pane-border);
}
.member-invite-panel {
  padding: 10px 12px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 8px;
  background: var(--codex-pane-surface);
}
.member-invite-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.member-link {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.member-link input {
  flex: 1;
  width: 0;
  height: 40px;
  padding: 0 10px;
  font-size: 12px;
  user-select: all;
  -webkit-user-select: all;
  text-overflow: ellipsis;
}
.member-link .member-meta {
  flex: 1;
}
.member-admin .member-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 40px;
  padding: 0;
  border-color: transparent;
  background: transparent;
}
.member-link-settings summary,
.member-recovery summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  list-style: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--codex-pane-muted);
}
summary::-webkit-details-marker {
  display: none;
}
summary > .ui-icon {
  margin-left: auto;
  width: 14px;
  height: 14px;
}
details[open] > summary > .ui-icon {
  transform: rotate(180deg);
}
.member-link-settings .member-actions {
  justify-content: flex-start;
}
.member-previous-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.member-previous-links button {
  justify-content: space-between;
  background: transparent;
}
.member-previous-links button > span {
  color: var(--codex-pane-muted);
}
.member-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.member-card {
  min-width: 0;
  border-bottom: 1px solid var(--codex-pane-border);
}
.member-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 52px;
}
.member-admin .member-person {
  flex: 1;
  justify-content: flex-start;
  overflow: hidden;
  padding: 0 4px;
  border: 0;
  background: transparent;
  text-align: left;
}
.member-person strong {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
}
.member-status {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--codex-pane-muted);
}
.member-status.active {
  background: #379877;
}
.member-status.pending {
  background: #bb8e33;
}
.member-status.revoked,
.member-status.rejected {
  background: #c65048;
}
.member-toggle .ui-icon {
  width: 14px;
  height: 14px;
}
.member-toggle[aria-expanded="true"] .ui-icon {
  transform: rotate(180deg);
}
.member-expanded {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 4px 10px;
}
.member-person-details {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--codex-pane-muted);
  font-size: 12px;
}
.member-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}
.member-admin .member-actions button {
  border-color: transparent;
  background: transparent;
  white-space: nowrap;
  padding: 0 8px;
}
.member-admin .member-actions button:hover {
  border-color: var(--codex-pane-border);
  background: var(--codex-pane-surface);
}
.member-admin .member-danger,
.member-error {
  color: var(--color-danger, #c65048);
}
.member-meta {
  margin: 0;
  color: var(--codex-pane-muted);
  font-size: 12px;
}
.member-error {
  font-size: 12px;
}
.member-recovery {
  border-bottom: 1px solid var(--codex-pane-border);
}
.member-recovery summary strong {
  flex: 1;
  font-weight: 500;
  color: var(--codex-pane-text);
}
.member-admin .member-verify {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.member-admin .member-verify input {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
}
@media (max-width: 480px) {
  .member-admin button,
  .member-admin .member-icon {
    min-height: 44px;
  }
  .member-row {
    min-height: 56px;
  }
  .member-expanded {
    padding-right: 0;
    padding-left: 0;
  }
  .member-actions {
    gap: 2px;
  }
  .member-admin .member-actions button {
    padding: 0 6px;
  }
  .member-row :deep(.team-role-select) {
    max-width: 134px;
  }
  .member-toolbar {
    justify-content: flex-start;
  }
}
</style>
