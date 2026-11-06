<script setup>
import { onMounted, ref, watch } from "vue";
import { teamApi, teamError, useTeamChatStore } from "@/stores/teamChatStore";
import UiIcon from "./UiIcon.vue";
const chat = useTeamChatStore(),
  invites = ref([]),
  recoveries = ref([]),
  error = ref(""),
  loading = ref(true),
  pending = ref(new Set()),
  copied = ref(null),
  verified = ref({});
let generation = 0,
  copyTimer;
import { onBeforeUnmount } from "vue";
onBeforeUnmount(() => {
  generation++;
  clearTimeout(copyTimer);
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
async function createInvite() {
  await run("new", async () => {
    const data = await chat.action("/invite", { role: "employee" });
    invites.value = [
      data.invite,
      ...invites.value.filter((i) => i._id !== data.invite._id),
    ];
  });
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
    <div class="member-own-role">
      <label for="chat-own-role">Моя роль</label
      ><select
        id="chat-own-role"
        :value="chat.me.role"
        aria-label="Моя роль в чате"
        :disabled="pending.has('owner')"
        @change="
          run('owner', () =>
            chat.action(
              '/settings',
              { ownerRole: $event.target.value },
              'patch',
            ),
          )
        "
      >
        <option
          v-for="(label, role) in chat.me.roles"
          :key="role"
          :value="role"
        >
          {{ label }}
        </option></select
      ><span>Администратор</span>
    </div>
    <section class="member-section" aria-label="Приглашения в чат">
      <header>
        <h3>Приглашения</h3>
        <button
          class="member-create"
          :disabled="pending.has('new')"
          @click="createInvite"
        >
          <UiIcon name="plus" />{{
            pending.has("new") ? "Создаём…" : "Пригласить по ссылке"
          }}
        </button>
      </header>
      <p v-if="loading" role="status">Загружаем приглашения…</p>
      <article
        v-for="row in invites"
        :key="row._id"
        class="member-invite"
        :aria-label="`Приглашение ${chat.me.roles[row.role]}`"
      >
        <div class="member-invite-top">
          <label :for="`invite-${row._id}`">Роль по ссылке</label
          ><select
            :id="`invite-${row._id}`"
            :value="row.role"
            :aria-label="`Роль по ссылке ${row._id}`"
            :disabled="pending.has(row._id)"
            @change="rotate(row, $event.target.value, $event)"
          >
            <option
              v-for="(label, role) in chat.me.roles"
              :key="role"
              :value="role"
            >
              {{ label }}
            </option></select
          ><span v-if="pending.has(row._id)" role="status">Обновляем…</span>
        </div>
        <div class="member-link">
          <input
            v-if="row.url"
            :value="row.url"
            readonly
            aria-label="Ссылка приглашения в чат"
            @focus="selectLink"
            @click="selectLink"
            @pointerup.prevent="selectLink"
          /><span v-else class="member-legacy">{{
            row.revokedAt ? "Ссылка закрыта" : "Обновите ссылку для копирования"
          }}</span
          ><button
            v-if="row.url"
            class="member-icon"
            :disabled="pending.has(row._id)"
            :aria-label="
              copied === row._id ? 'Ссылка скопирована' : 'Скопировать ссылку'
            "
            :title="copied === row._id ? 'Скопировано' : 'Скопировать ссылку'"
            @click="copy(row, $event)"
          >
            <UiIcon :name="copied === row._id ? 'check' : 'copy'" /></button
          ><button
            class="member-icon"
            :disabled="pending.has(row._id)"
            aria-label="Обновить ссылку"
            title="Обновить ссылку"
            @click="rotate(row, row.role)"
          >
            <UiIcon name="refresh" /></button
          ><button
            class="member-icon member-danger"
            :disabled="pending.has(row._id)"
            aria-label="Удалить ссылку"
            title="Удалить ссылку"
            @click="deleteInvite(row)"
          >
            <UiIcon name="trash" />
          </button>
        </div>
      </article>
    </section>
    <section
      v-if="recoveries.length"
      class="member-section"
      aria-label="Восстановление доступа"
    >
      <header>
        <h3>Восстановление пароля</h3>
        <span>{{ recoveries.length }}</span>
      </header>
      <article v-for="row in recoveries" :key="row._id" class="member-card">
        <div class="member-person">
          <strong>{{ row.name }}</strong
          ><span>{{ row.phone }}</span>
        </div>
        <template v-if="!row.url"
          ><label class="member-verify"
            ><input v-model="verified[row._id]" type="checkbox" />Запрос
            подтверждён через известный контакт</label
          >
          <div class="member-actions">
            <button
              :disabled="!verified[row._id] || pending.has(row._id)"
              @click="approveRecovery(row)"
            >
              Выдать одноразовую ссылку</button
            ><button
              class="member-icon member-danger"
              :disabled="pending.has(row._id)"
              aria-label="Отклонить восстановление"
              title="Отклонить восстановление"
              @click="rejectRecovery(row)"
            >
              <UiIcon name="close" />
            </button></div
        ></template>
        <template v-else
          ><span class="member-meta"
            >Ссылка действует 15 минут. Передайте её через известный контакт
            сотрудника</span
          >
          <div class="member-link">
            <input
              :value="row.url"
              :disabled="pending.has(row._id)"
              readonly
              aria-label="Ссылка восстановления пароля"
              @focus="selectLink"
              @click="selectLink"
              @pointerup.prevent="selectLink"
            /><button
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
            </button></div
        ></template>
      </article>
    </section>
    <section class="member-section" aria-label="Сотрудники чата">
      <header>
        <h3>Сотрудники</h3>
        <span>{{ chat.state.members.length }}</span>
      </header>
      <article
        v-for="member in chat.state.members"
        :key="member._id"
        class="member-card"
        :aria-label="`Участник ${member.name}`"
      >
        <div class="member-person">
          <strong>{{ member.name }}</strong
          ><span>{{ member.phone }}</span>
        </div>
        <div class="member-access">
          <span
            :class="{ closed: ['revoked', 'rejected'].includes(member.status) }"
            >{{ statusLabel(member.status) }}</span
          ><select
            :value="draftRoles[member._id] || member.role"
            :aria-label="`Роль ${member.name}`"
            :disabled="pending.has(member._id)"
            @change="roleChanged(member, $event)"
          >
            <option
              v-for="(label, role) in chat.me.roles"
              :key="role"
              :value="role"
            >
              {{ label }}
            </option>
          </select>
        </div>
        <div class="member-actions">
          <button
            v-if="member.status === 'pending'"
            :disabled="pending.has(member._id)"
            @click="
              setMember(member, 'active', draftRoles[member._id] || member.role)
            "
          >
            Одобрить</button
          ><button
            v-else-if="member.status === 'active'"
            :disabled="pending.has(member._id)"
            @click="setMember(member, 'revoked')"
          >
            Закрыть доступ</button
          ><button
            v-else
            :disabled="pending.has(member._id)"
            @click="setMember(member, 'active')"
          >
            Вернуть доступ</button
          ><button
            v-if="member.status === 'pending'"
            class="member-icon"
            :disabled="pending.has(member._id)"
            aria-label="Отклонить запрос"
            title="Отклонить запрос"
            @click="setMember(member, 'rejected')"
          >
            <UiIcon name="close" /></button
          ><button
            class="member-icon member-danger"
            :disabled="pending.has(member._id)"
            :aria-label="`Удалить сотрудника ${member.name}`"
            title="Удалить сотрудника"
            @click="deleteMember(member)"
          >
            <UiIcon name="trash" />
          </button>
        </div>
      </article>
    </section>
  </div>
</template>
<style scoped>
.member-admin :is(input, select, button) {
  font: inherit;
  color: var(--codex-pane-text);
  border: 1px solid var(--codex-pane-border);
  border-radius: 8px;
  background-color: var(--codex-pane-surface);
  min-width: 0;
  margin: 0;
}
.member-admin :is(input, select) {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
}
.member-admin select {
  height: 40px;
}
.member-admin button {
  padding: 8px 12px;
  cursor: pointer;
}
.member-admin button:disabled {
  opacity: 0.45;
  cursor: default;
}
.member-admin :is(input, select, button):focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 2px;
}
.member-admin {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}
.member-own-role {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px 12px;
}
.member-own-role > span {
  grid-column: 2;
  font-size: 11px;
  color: var(--codex-pane-muted);
}
.member-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.member-section > header {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}
.member-section h3 {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}
.member-section > header > span {
  color: var(--codex-pane-muted);
  font-size: 12px;
}
.member-invite,
.member-card {
  padding: 14px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 10px;
  background: var(--codex-pane-surface);
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.member-invite-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.member-invite-top label {
  font-size: 12px;
}
.member-invite-top select {
  flex: 1;
}
.member-invite-top > span {
  font-size: 12px;
  color: var(--codex-pane-muted);
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
  font-size: 12px;
  text-overflow: ellipsis;
  user-select: all;
  -webkit-user-select: all;
}
.member-legacy {
  flex: 1;
  font-size: 12px;
  color: var(--codex-pane-muted);
}
.member-admin .member-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 40px;
  padding: 0;
  border-color: transparent;
  background: transparent;
  line-height: 1;
}
.member-person {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.member-person strong {
  font-size: 14px;
  font-weight: 500;
}
.member-person span,
.member-meta {
  color: var(--codex-pane-muted);
  font-size: 12px;
}
.member-access {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.member-access > span {
  font-size: 12px;
  color: var(--codex-pane-muted);
}
.member-access > select {
  flex: none;
  width: auto;
  max-width: 60%;
}
.member-access .closed {
  color: var(--color-danger, #c65048);
}
.member-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.member-admin .member-danger {
  color: var(--color-danger, #c65048);
}
.member-admin .member-verify {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.member-admin .member-verify input {
  width: 16px;
  height: 16px;
  margin: 0;
  padding: 0;
}
.member-create {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.member-admin button {
  min-height: 40px;
}
.member-error {
  color: var(--color-danger, #c65048);
  font-size: 13px;
}
@media (max-width: 480px) {
  .member-invite,
  .member-card {
    padding: 12px;
  }
  .member-section > header {
    gap: 8px;
  }
  .member-create {
    font-size: 12px;
  }
  .member-invite-top label {
    width: 100%;
  }
  .member-access {
    align-items: flex-start;
  }
  .member-access > select {
    max-width: 65%;
  }
  .member-link {
    gap: 0;
  }
}
</style>
