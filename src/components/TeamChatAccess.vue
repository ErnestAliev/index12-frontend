<script setup>
import { computed, ref, onBeforeUnmount, nextTick } from "vue";
import { teamApi, teamError, useTeamChatStore } from "@/stores/teamChatStore";
import TeamChatDialog from "./TeamChatDialog.vue";
import TeamChatRoleSelect from "./TeamChatRoleSelect.vue";
import TeamAccessPermissions from "./TeamAccessPermissions.vue";
import UiIcon from "./UiIcon.vue";
const props = defineProps({ formOnly: Boolean });
const emit = defineEmits(["created"]);
const chat = useTeamChatStore();
const accessDefaults = {
  employee: { chat: true, system: false, onec: false },
  manager: { chat: true, system: false, onec: false },
  director: { chat: true, system: false, onec: false },
};
const rolesOpen = ref(false),
  selectedRole = ref("manager"),
  roleRights = ref({}),
  savingRoles = ref(false),
  customRights = ref(false);
const rightsFor = (role) => ({
  ...accessDefaults[role],
  ...chat.me?.roleAccess?.[role],
});
const accessPreview = ref({});
const accessMemberId = ref(null);
const accessMember = computed(() =>
  members.value.find((member) => member._id === accessMemberId.value),
);
const rowRoles = computed(() => ({
  ...chat.me?.roles,
  director: "Руководитель",
}));
function openAccess(member) {
  accessMemberId.value = member._id;
  error.value = "";
}
async function accessAction(action) {
  const member = accessMember.value;
  accessMemberId.value = null;
  await nextTick();
  if (member) await action(member);
}
const quickAccess = [
  { key: "system", label: "Финансы", icon: "wallet" },
  { key: "onec", label: "1С" },
  { key: "chat", label: "Чат", icon: "chat" },
];
function memberRights(member) {
  if (member.owner) return { chat: true, system: true, onec: true };
  return {
    ...rightsFor(member.role),
    ...member.access,
    ...accessPreview.value[member._id],
  };
}
async function toggleAccess(member, key) {
  if (member.owner || pending.value.has(member._id)) return;
  const access = { ...member.access, [key]: !memberRights(member)[key] };
  accessPreview.value[member._id] = access;
  try {
    await change(member, { access });
  } finally {
    delete accessPreview.value[member._id];
  }
}
function openRoles() {
  roleRights.value = Object.fromEntries(
    Object.keys(accessDefaults).map((role) => [role, rightsFor(role)]),
  );
  rolesOpen.value = true;
  error.value = "";
}
async function saveRoles() {
  if (savingRoles.value) return;
  savingRoles.value = true;
  error.value = "";
  try {
    await chat.action("/settings", { roleAccess: roleRights.value }, "patch");
    rolesOpen.value = false;
  } catch (e) {
    error.value = teamError(e);
  } finally {
    savingRoles.value = false;
  }
}
const position = ref(""),
  createdMember = ref(null),
  editingMember = ref(null),
  profile = ref({ name: "", position: "", role: "employee" });
const formOpen = ref(false),
  name = ref(""),
  password = ref(""),
  role = ref("employee"),
  link = ref(""),
  visible = ref(false),
  creating = ref(false),
  error = ref(""),
  notice = ref(""),
  pending = ref(new Set());
const credentialMember = ref(null),
  currentPassword = ref(""),
  newPassword = ref(""),
  currentVisible = ref(false),
  newVisible = ref(false);
const passwordLoading = ref(false),
  passwordSaving = ref(false),
  passwordError = ref(""),
  passwordNotice = ref(""),
  passwordUnavailable = ref(""),
  passwordVersion = ref(null);
let active = true,
  passwordTicket = 0;
onBeforeUnmount(() => {
  active = false;
  ++passwordTicket;
  password.value = "";
  currentPassword.value = "";
  newPassword.value = "";
});
const members = computed(() => {
  const rows = chat.state.members || [];
  if (rows.some((member) => member.owner) || !chat.me?.owner) return rows;
  return [
    {
      _id: chat.me.actorId,
      name: chat.me.displayName,
      position: chat.me.position || "",
      role: chat.me.role,
      status: "active",
      owner: true,
    },
    ...rows,
  ];
});
function openProfile(member) {
  editingMember.value = member;
  customRights.value = !!member.access;
  profile.value = {
    name: member.name,
    position: member.position || "",
    role: member.role,
    access: { ...rightsFor(member.role), ...member.access },
  };
  error.value = "";
}
function profileRole(value) {
  profile.value.role = value;
  if (!customRights.value) profile.value.access = rightsFor(value);
}
async function saveProfile() {
  const member = editingMember.value;
  if (
    member &&
    (await change(member, {
      ...profile.value,
      access: customRights.value ? profile.value.access : null,
    }))
  )
    editingMember.value = null;
}
async function openCredentials(member) {
  if (member.owner || passwordSaving.value) return;
  const ticket = ++passwordTicket;
  credentialMember.value = member;
  currentPassword.value = "";
  newPassword.value = "";
  currentVisible.value = false;
  newVisible.value = false;
  passwordVersion.value = null;
  passwordError.value = "";
  passwordNotice.value = "";
  passwordUnavailable.value = "";
  passwordLoading.value = true;
  try {
    const { data } = await teamApi.get(
      "/access/employees/" + member._id + "/password",
    );
    if (!active || ticket !== passwordTicket) return;
    passwordVersion.value = data.version;
    currentPassword.value = data.available ? data.password : "";
    passwordUnavailable.value = data.available ? "" : data.message;
  } catch (e) {
    if (active && ticket === passwordTicket) passwordError.value = teamError(e);
  } finally {
    if (active && ticket === passwordTicket) passwordLoading.value = false;
  }
}
function closeCredentials() {
  if (passwordSaving.value) return;
  ++passwordTicket;
  credentialMember.value = null;
  currentPassword.value = "";
  newPassword.value = "";
  currentVisible.value = false;
  newVisible.value = false;
  passwordVersion.value = null;
}
async function savePassword() {
  if (
    passwordSaving.value ||
    passwordLoading.value ||
    passwordVersion.value === null ||
    !credentialMember.value
  )
    return;
  const ticket = passwordTicket,
    value = newPassword.value,
    member = credentialMember.value;
  passwordSaving.value = true;
  passwordError.value = "";
  passwordNotice.value = "";
  try {
    const data = await chat.action(
      "/access/employees/" + member._id + "/password",
      { password: value, expectedVersion: passwordVersion.value },
      "patch",
    );
    if (!active || ticket !== passwordTicket || !data?.member) return;
    credentialMember.value = data.member;
    passwordVersion.value = data.member.version;
    currentPassword.value = value;
    newPassword.value = "";
    currentVisible.value = false;
    newVisible.value = false;
    passwordUnavailable.value = "";
    passwordNotice.value = "Пароль изменён";
  } catch (e) {
    if (active && ticket === passwordTicket) passwordError.value = teamError(e);
  } finally {
    if (active && ticket === passwordTicket) passwordSaving.value = false;
  }
}
defineExpose({ openForm });
const statusLabel = (member) =>
  ({
    invited: "Ожидает входа",
    active: "В системе",
    pending: "Ожидает подтверждения",
    revoked: "Заблокирован",
    rejected: "Заблокирован",
  })[member.status] || member.status;
function openForm(initialName = "") {
  name.value = typeof initialName === "string" ? initialName : "";
  position.value = "";
  password.value = "";
  role.value = "employee";
  link.value = "";
  error.value = "";
  notice.value = "";
  createdMember.value = null;
  formOpen.value = true;
}
function closeForm() {
  if (creating.value) return;
  formOpen.value = false;
  password.value = "";
  visible.value = false;
  const member = createdMember.value;
  createdMember.value = null;
  if (member) emit("created", member);
}
async function copy() {
  try {
    await navigator.clipboard.writeText(link.value);
    notice.value = "Ссылка скопирована";
  } catch {
    notice.value = "";
    error.value =
      "Не удалось скопировать автоматически. Выделите и скопируйте ссылку.";
  }
}
async function createEmployee() {
  if (creating.value || link.value) return;
  creating.value = true;
  error.value = "";
  notice.value = "";
  const request = teamApi.post("/access/employees", {
    name: name.value,
    position: position.value,
    password: password.value,
    role: role.value,
  });
  let copied;
  // Start the clipboard operation within the tap, including Safari's user gesture.
  if (navigator.clipboard?.write && window.ClipboardItem) {
    try {
      copied = navigator.clipboard
        .write([
          new ClipboardItem({
            "text/plain": request.then(
              ({ data }) => new Blob([data.url], { type: "text/plain" }),
            ),
          }),
        ])
        .then(
          () => true,
          () => false,
        );
    } catch {
      copied = null;
    }
  }
  try {
    const { data } = await request;
    if (!active) return;
    link.value = data.url;
    password.value = "";
    createdMember.value = data.member;
    const index = chat.state.members.findIndex(
      (member) => member._id === data.member._id,
    );
    if (index < 0) chat.state.members.unshift(data.member);
    else chat.state.members[index] = data.member;
    chat.state.people ||= [];
    if (!chat.state.people.some((person) => person._id === data.member._id))
      chat.state.people.push(data.member);
    const ok = copied ? await copied : false;
    if (!active) return;
    if (ok) notice.value = "Ссылка скопирована";
    else await copy();
  } catch (e) {
    if (active) error.value = teamError(e);
  } finally {
    if (active) creating.value = false;
  }
}
async function change(member, values, event) {
  if (pending.value.has(member._id)) return;
  pending.value.add(member._id);
  error.value = "";
  try {
    if (member.owner)
      await chat.action(
        "/settings",
        {
          ownerRole: values.role || member.role,
          ...(values.name !== undefined ? { ownerName: values.name } : {}),
          ...(values.position !== undefined
            ? { ownerPosition: values.position }
            : {}),
        },
        "patch",
      );
    else
      await chat.action(
        "/access/employees/" + member._id,
        { role: member.role, expectedVersion: member.version, ...values },
        "patch",
      );
    return true;
  } catch (e) {
    if (active) {
      error.value = teamError(e);
      if (event) event.target.value = member.role;
    }
    return false;
  } finally {
    pending.value.delete(member._id);
  }
}
async function allow(member) {
  if (pending.value.has(member._id)) return;
  pending.value.add(member._id);
  error.value = "";
  try {
    await chat.action(
      "/members/" + member._id,
      { role: member.role, status: "active", expectedVersion: member.version },
      "patch",
    );
  } catch (e) {
    if (active) error.value = teamError(e);
  } finally {
    pending.value.delete(member._id);
  }
}
async function remove(member) {
  if (pending.value.has(member._id)) return;
  pending.value.add(member._id);
  error.value = "";
  try {
    await chat.action(
      "/members/" + member._id,
      { expectedVersion: member.version },
      "delete",
    );
  } catch (e) {
    if (active) error.value = teamError(e);
  } finally {
    pending.value.delete(member._id);
  }
}
</script>
<template>
  <section
    class="team-access"
    :class="{ 'access-form-only': props.formOnly }"
    aria-label="Доступы и роли"
  >
    <template v-if="!props.formOnly">
      <div class="access-toolbar">
        <button
          type="button"
          class="access-add"
          aria-label="Добавить сотрудника"
          title="Добавить сотрудника"
          @click="openForm"
        >
          <UiIcon name="plus" />
        </button>
        <button type="button" class="access-roles" @click="openRoles">
          Права ролей
        </button>
      </div>
      <p
        v-if="
          error && !formOpen && !editingMember && !rolesOpen && !accessMember
        "
        role="alert"
      >
        {{ error }}
      </p>
      <p v-if="chat.notice" role="status">{{ chat.notice }}</p>
      <div v-for="member in members" :key="member._id" class="access-row">
        <button
          type="button"
          class="access-name"
          :title="
            [member.name, member.position, statusLabel(member)]
              .filter(Boolean)
              .join(' · ')
          "
          :aria-label="`Редактировать ${member.name}`"
          @click="openProfile(member)"
        >
          <i
            :data-status="member.status"
            :aria-label="statusLabel(member)"
          /><span
            >{{ member.name
            }}{{ member.position ? " · " + member.position : "" }}</span
          >
        </button>
        <TeamChatRoleSelect
          :value="member.role"
          :roles="rowRoles"
          :label="`Роль ${member.name}`"
          :disabled="pending.has(member._id)"
          @change="change(member, { role: $event.target.value }, $event)"
        />
        <button
          type="button"
          class="access-row-menu"
          :aria-label="`Доступы и действия: ${member.name}`"
          title="Доступы и действия"
          :disabled="pending.has(member._id)"
          @click="openAccess(member)"
        >
          <UiIcon name="more" />
        </button>
        <div
          class="access-rights"
          role="group"
          :aria-label="`Права ${member.name}`"
          :aria-busy="pending.has(member._id)"
        >
          <button
            v-for="item in quickAccess"
            :key="item.key"
            type="button"
            class="access-right"
            :aria-label="`${item.label}: ${member.name}`"
            :aria-pressed="memberRights(member)[item.key] === true"
            :title="
              member.owner
                ? 'Полный доступ владельца'
                : `${memberRights(member)[item.key] ? 'Отключить' : 'Разрешить'}: ${item.label}`
            "
            :disabled="member.owner || pending.has(member._id)"
            @click="toggleAccess(member, item.key)"
          >
            <UiIcon v-if="item.icon" :name="item.icon" />
            <span v-else class="access-onec">1С</span>
          </button>
        </div>
        <button
          v-if="!member.owner"
          type="button"
          class="access-row-action"
          :disabled="pending.has(member._id)"
          :aria-label="`Пароль ${member.name}`"
          title="Посмотреть или изменить пароль"
          @click="openCredentials(member)"
        >
          <UiIcon name="key" />
        </button>
        <span v-else class="access-row-action" aria-hidden="true" />
        <button
          v-if="member.owner"
          type="button"
          class="access-row-action"
          :disabled="pending.has(member._id)"
          aria-label="Редактировать свой профиль"
          title="Редактировать"
          @click="openProfile(member)"
        >
          <UiIcon name="edit" />
        </button>
        <button
          v-else-if="member.status === 'pending'"
          type="button"
          class="access-row-action"
          :disabled="pending.has(member._id)"
          :aria-label="`Открыть доступ ${member.name}`"
          title="Открыть доступ"
          @click="allow(member)"
        >
          <UiIcon name="check" />
        </button>
        <button
          v-else
          type="button"
          class="access-row-action"
          :disabled="pending.has(member._id)"
          :aria-label="`${['revoked', 'rejected'].includes(member.status) ? 'Вернуть доступ' : 'Заблокировать'} ${member.name}`"
          :title="
            ['revoked', 'rejected'].includes(member.status)
              ? 'Вернуть доступ'
              : 'Заблокировать'
          "
          @click="
            change(member, {
              blocked: !['revoked', 'rejected'].includes(member.status),
            })
          "
        >
          <UiIcon
            :name="
              ['revoked', 'rejected'].includes(member.status) ? 'undo' : 'ban'
            "
          />
        </button>
        <button
          v-if="!member.owner"
          type="button"
          class="access-danger access-row-action"
          :disabled="pending.has(member._id)"
          :aria-label="`Удалить сотрудника ${member.name}`"
          title="Удалить"
          @click="remove(member)"
        >
          <UiIcon name="trash" />
        </button>
      </div>
    </template>
    <TeamChatDialog
      v-if="accessMember"
      :title="`Доступы: ${accessMember.name}`"
      :busy="pending.has(accessMember._id)"
      @close="accessMemberId = null"
    >
      <div class="access-menu-body">
        <p v-if="accessMember.owner">Полный доступ владельца</p>
        <div
          v-else
          class="access-menu-rights"
          role="group"
          :aria-label="`Права ${accessMember.name}`"
          :aria-busy="pending.has(accessMember._id)"
        >
          <button
            v-for="item in quickAccess"
            :key="item.key"
            type="button"
            class="access-menu-item"
            :aria-label="`${item.label}: ${accessMember.name}`"
            :aria-pressed="memberRights(accessMember)[item.key] === true"
            :disabled="pending.has(accessMember._id)"
            @click="toggleAccess(accessMember, item.key)"
          >
            <UiIcon v-if="item.icon" :name="item.icon" /><span
              v-else
              class="access-onec"
              >1С</span
            >
            <span>{{ item.key === "onec" ? "1С · чтение" : item.label }}</span>
            <UiIcon
              v-if="memberRights(accessMember)[item.key]"
              class="access-menu-check"
              name="check"
            />
          </button>
        </div>
        <hr />
        <button
          type="button"
          class="access-menu-item"
          :disabled="pending.has(accessMember._id)"
          @click="accessAction(openProfile)"
        >
          <UiIcon name="edit" />Профиль
        </button>
        <template v-if="!accessMember.owner">
          <button
            type="button"
            class="access-menu-item"
            :disabled="pending.has(accessMember._id)"
            @click="accessAction(openCredentials)"
          >
            <UiIcon name="key" />Пароль
          </button>
          <button
            v-if="accessMember.status === 'pending'"
            type="button"
            class="access-menu-item"
            :disabled="pending.has(accessMember._id)"
            @click="accessAction(allow)"
          >
            <UiIcon name="check" />Открыть доступ
          </button>
          <button
            v-else
            type="button"
            class="access-menu-item"
            :disabled="pending.has(accessMember._id)"
            @click="
              accessAction((member) =>
                change(member, {
                  blocked: !['revoked', 'rejected'].includes(member.status),
                }),
              )
            "
          >
            <UiIcon
              :name="
                ['revoked', 'rejected'].includes(accessMember.status)
                  ? 'undo'
                  : 'ban'
              "
            />{{
              ["revoked", "rejected"].includes(accessMember.status)
                ? "Вернуть доступ"
                : "Заблокировать"
            }}
          </button>
          <button
            type="button"
            class="access-menu-item access-danger"
            :disabled="pending.has(accessMember._id)"
            @click="accessAction(remove)"
          >
            <UiIcon name="trash" />Удалить сотрудника
          </button>
        </template>
        <p v-if="error" role="alert">{{ error }}</p>
      </div>
    </TeamChatDialog>
    <TeamChatDialog
      v-if="rolesOpen"
      title="Права ролей"
      :busy="savingRoles"
      @close="rolesOpen = false"
    >
      <form class="access-form" @submit.prevent="saveRoles">
        <label
          >Роль<TeamChatRoleSelect
            :value="selectedRole"
            :roles="chat.me.roles"
            label="Настройка прав роли"
            :disabled="savingRoles"
            @change="selectedRole = $event.target.value"
        /></label>
        <TeamAccessPermissions
          v-model="roleRights[selectedRole]"
          :disabled="savingRoles"
        />
        <p v-if="error" role="alert">{{ error }}</p>
        <button type="submit" :disabled="savingRoles">Сохранить</button>
      </form>
    </TeamChatDialog>
    <TeamChatDialog
      v-if="credentialMember"
      :title="'Пароль: ' + credentialMember.name"
      :busy="passwordSaving"
      @close="closeCredentials"
    >
      <form class="access-form" @submit.prevent="savePassword">
        <p v-if="passwordLoading" role="status">Загружаем…</p>
        <label v-else-if="currentPassword"
          >Установленный пароль
          <div class="access-password">
            <input
              :value="currentPassword"
              :type="currentVisible ? 'text' : 'password'"
              readonly
              autocomplete="off"
              aria-label="Установленный пароль"
            /><button
              type="button"
              :aria-label="currentVisible ? 'Скрыть пароль' : 'Показать пароль'"
              :aria-pressed="currentVisible"
              @click="currentVisible = !currentVisible"
            >
              <UiIcon name="view" />
            </button></div
        ></label>
        <p v-else-if="passwordUnavailable">{{ passwordUnavailable }}</p>
        <label
          >Новый пароль
          <div class="access-password">
            <input
              v-model="newPassword"
              :type="newVisible ? 'text' : 'password'"
              autocomplete="new-password"
              minlength="10"
              maxlength="128"
              required
              :readonly="passwordSaving"
              aria-label="Новый пароль сотрудника"
            /><button
              type="button"
              :aria-label="
                newVisible ? 'Скрыть новый пароль' : 'Показать новый пароль'
              "
              :aria-pressed="newVisible"
              @click="newVisible = !newVisible"
            >
              <UiIcon name="view" />
            </button></div
        ></label>
        <p v-if="passwordError" role="alert">{{ passwordError }}</p>
        <p v-if="passwordNotice" role="status">{{ passwordNotice }}</p>
        <button
          type="submit"
          :disabled="
            passwordLoading ||
            passwordSaving ||
            passwordVersion === null ||
            !newPassword
          "
        >
          {{ passwordSaving ? "Сохраняем…" : "Изменить пароль" }}
        </button>
      </form>
    </TeamChatDialog>
    <TeamChatDialog
      v-if="editingMember"
      :title="editingMember.owner ? 'Мой профиль в чате' : 'Профиль сотрудника'"
      :busy="pending.has(editingMember._id)"
      @close="editingMember = null"
    >
      <form class="access-form" @submit.prevent="saveProfile">
        <label
          >Имя<input
            v-model="profile.name"
            aria-label="Имя в чате"
            :title="
              editingMember.loginKey
                ? 'Это имя используется для входа сотрудника'
                : undefined
            "
            maxlength="100"
            required
        /></label>
        <label
          >Должность<input
            v-model="profile.position"
            aria-label="Должность"
            maxlength="160"
        /></label>
        <label
          >Роль<TeamChatRoleSelect
            :value="profile.role"
            :roles="chat.me.roles"
            label="Роль в чате"
            :disabled="pending.has(editingMember._id)"
            @change="profileRole($event.target.value)"
        /></label>
        <template v-if="!editingMember.owner">
          <label class="access-custom"
            ><input
              type="checkbox"
              v-model="customRights"
              @change="
                !customRights && (profile.access = rightsFor(profile.role))
              "
            />Собственные права</label
          >
          <TeamAccessPermissions
            v-model="profile.access"
            :disabled="!customRights || pending.has(editingMember._id)"
          />
        </template>
        <p v-else>Владелец имеет полный доступ.</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <button type="submit" :disabled="pending.has(editingMember._id)">
          Сохранить
        </button>
      </form>
    </TeamChatDialog>
    <TeamChatDialog
      v-if="formOpen"
      title="Добавить сотрудника"
      :busy="creating"
      @close="closeForm"
    >
      <form class="access-form" @submit.prevent="createEmployee">
        <label
          >Имя сотрудника<input
            v-model="name"
            aria-label="Имя сотрудника"
            autocomplete="off"
            maxlength="100"
            required
            :readonly="creating || !!link"
        /></label>
        <label
          >Должность<input
            v-model="position"
            aria-label="Должность нового сотрудника"
            maxlength="160"
            :readonly="creating || !!link"
        /></label>
        <label v-if="!link"
          >Пароль
          <div class="access-password">
            <input
              v-model="password"
              aria-label="Пароль сотрудника"
              :type="visible ? 'text' : 'password'"
              autocomplete="new-password"
              minlength="10"
              maxlength="128"
              required
              :readonly="creating"
            /><button
              type="button"
              :aria-label="visible ? 'Скрыть пароль' : 'Показать пароль'"
              @click="visible = !visible"
            >
              <UiIcon name="view" />
            </button></div
        ></label>
        <label
          >Роль<TeamChatRoleSelect
            :value="role"
            :roles="chat.me.roles"
            label="Роль нового сотрудника"
            :disabled="creating || !!link"
            @change="role = $event.target.value"
        /></label>
        <label v-if="link"
          >Одноразовая ссылка
          <div class="access-link">
            <input
              :value="link"
              readonly
              aria-label="Одноразовая ссылка"
              @focus="$event.target.select()"
            /><button
              type="button"
              aria-label="Скопировать ссылку"
              @click="copy"
            >
              <UiIcon name="copy" />
            </button></div
        ></label>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="notice" role="status">{{ notice }}</p>
        <button v-if="!link" type="submit" :disabled="creating">
          {{ creating ? "Создаём…" : "Создать и скопировать ссылку" }}
        </button>
        <button v-else type="button" @click="closeForm">Готово</button>
      </form>
    </TeamChatDialog>
  </section>
</template>
<style scoped>
.access-form-only {
  display: contents;
}
.team-access .access-row > .access-name {
  display: flex;
  justify-content: flex-start;
  gap: 6px;
  width: 100%;
  min-width: 0;
  padding: 0;
  font: inherit;
  text-align: left;
}
.team-access {
  box-sizing: border-box;
  min-width: 0;
  padding-inline: var(--safe-area-left, 0px) var(--safe-area-right, 0px);
  font-size: 13px;
  container-type: inline-size;
}
.access-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}
.team-access .access-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--codex-pane-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
}
.team-access .access-toolbar .access-add {
  width: 44px;
  flex: none;
  padding: 0;
}
.access-add :deep(.ui-icon) {
  width: 20px;
  height: 20px;
}
@media (hover: hover) {
  .team-access .access-toolbar button:hover {
    background: var(--codex-pane-hover);
    color: var(--codex-pane-text);
  }
}
.access-toolbar button:focus {
  outline: none;
}
.access-toolbar button:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 2px;
}
.access-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px 44px;
  align-items: center;
  gap: 2px;
  min-height: 48px;
  border-bottom: 1px solid var(--codex-pane-border);
}
.access-rights {
  display: none;
  gap: 2px;
}
.team-access .access-row > .access-row-action {
  display: none;
}
.team-access .access-row > .access-row-menu {
  grid-column: 3;
}
.access-row > :deep(.team-role-select) {
  width: 132px;
  max-width: 132px;
}
.team-access .access-right {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--codex-pane-muted);
  cursor: pointer;
}
.access-right::before {
  content: "";
  position: absolute;
  inset: 6px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 6px;
}
.team-access .access-right[aria-pressed="true"] {
  color: var(--codex-pane-accent);
}
.access-right[aria-pressed="true"]::before {
  background: var(--codex-pane-surface);
  border-color: currentColor;
}
.access-right :deep(.ui-icon),
.access-onec {
  position: relative;
  width: 16px;
  height: 16px;
}
.access-onec {
  font: 600 12px/16px sans-serif;
}
.access-right:focus {
  outline: none;
}
.access-right:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
  outline-offset: 1px;
}
.access-right:disabled {
  cursor: default;
}
.access-rights[aria-busy="true"] {
  opacity: 0.65;
}
@container (min-width: 620px) {
  .access-row {
    grid-template-columns: minmax(0, 1fr) 132px 136px 44px 44px 44px;
  }
  .team-access .access-row > .access-row-action {
    display: grid;
  }
  .team-access .access-row > .access-row-menu {
    display: none;
  }
  .access-rights {
    display: flex;
  }
}
.access-menu-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 16px max(16px, var(--safe-bottom-controls, 12px));
  overflow-y: auto;
  font-size: 13px;
}
.access-menu-body p {
  margin: 8px 0;
}
.access-menu-body hr {
  width: 100%;
  margin: 6px 0;
  border: 0;
  border-top: 1px solid var(--codex-pane-border);
}
.access-menu-rights {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.team-access .access-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--codex-pane-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.access-menu-item[aria-pressed="true"] {
  color: var(--codex-pane-accent);
}
.access-menu-check {
  margin-left: auto;
}
.access-menu-item:disabled {
  opacity: 0.65;
  cursor: default;
}
.access-menu-body [role="alert"] {
  color: var(--codex-pane-danger);
}
.access-menu-item:focus {
  outline: none;
}
.access-menu-item:focus-visible {
  outline: 2px solid var(--codex-pane-focus);
}
.access-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.access-name > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.access-name i {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--codex-pane-muted);
}
.access-name i[data-status="active"] {
  background: var(--codex-pane-accent);
}
.access-name i[data-status="revoked"],
.access-name i[data-status="rejected"] {
  background: var(--codex-pane-danger);
}
.team-access .access-row > button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
}
.team-access .access-danger {
  color: var(--codex-pane-danger);
}
.access-row :deep(.team-role-select) {
  width: 100%;
  max-width: 132px;
}
.access-row :deep(select.team-role-input) {
  font-size: 12px;
  padding-left: 4px;
}
.access-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px max(16px, var(--safe-bottom-controls, 12px));
  min-height: 0;
  overflow: auto;
  font-size: 13px;
}
.access-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.access-form .access-custom {
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-height: 44px;
}
.access-form .access-custom input {
  width: 18px;
  height: 18px;
  min-height: 18px;
  padding: 0;
  flex: none;
  accent-color: var(--codex-pane-accent);
}
.access-form input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--codex-pane-border, var(--color-border));
  border-radius: 8px;
  background: var(--codex-pane-surface, var(--color-background-soft));
  color: var(--codex-pane-text, var(--color-text));
  font: inherit;
  font-size: 16px;
}
.access-password,
.access-link {
  display: flex;
  align-items: center;
  gap: 4px;
}
.access-form button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: var(--codex-pane-surface, var(--color-background-soft));
  color: var(--codex-pane-text, var(--color-text));
  font: inherit;
  cursor: pointer;
}
.access-form :is(.access-password, .access-link) > button {
  flex: none;
  width: 44px;
  padding: 0;
}
.access-form p,
.team-access > p {
  margin: 0;
  font-size: 12px;
}
.access-form [role="alert"],
.team-access > [role="alert"] {
  color: var(--codex-pane-danger, var(--color-danger));
}
.access-form [role="status"] {
  color: var(--codex-pane-accent, var(--color-primary));
}
</style>
