<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { teamApi, teamError } from "@/stores/teamChatStore";
import TeamChatDialog from "./TeamChatDialog.vue";
const props = defineProps({
  member: { type: Object, required: true },
  save: { type: Function, required: true },
});
const emit = defineEmits(["close"]);
const accounts = ref([]),
  query = ref(""),
  loading = ref(true),
  busy = ref(false),
  error = ref("");
const visible = computed(() =>
  accounts.value.filter((row) =>
    row.name
      .toLocaleLowerCase("ru")
      .includes(query.value.toLocaleLowerCase("ru")),
  ),
);
let active = true;
onBeforeUnmount(() => {
  active = false;
});
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const { data } = await teamApi.get("/finance/account-options");
    if (active) accounts.value = data.accounts;
  } catch (e) {
    if (active) error.value = teamError(e);
  } finally {
    if (active) loading.value = false;
  }
}
async function toggle(id, checked) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  const ids = new Set(props.member.accountIds || []);
  if (checked) ids.add(id);
  else ids.delete(id);
  try {
    if (!(await props.save([...ids])))
      error.value = "Не удалось изменить доступ. Повторите";
  } catch (e) {
    error.value = teamError(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <TeamChatDialog
    :title="`Счета: ${member.name}`"
    :busy="busy"
    @close="emit('close')"
  >
    <div class="account-access">
      <input
        v-model="query"
        type="search"
        placeholder="Найти счёт"
        aria-label="Найти счёт"
      />
      <p v-if="loading" role="status">Загрузка…</p>
      <p v-else-if="!visible.length && !error">Список пуст</p>
      <div class="account-access-list" :aria-busy="busy">
        <label v-for="account in visible" :key="account._id"
          ><span>{{ account.name }}</span
          ><input
            type="checkbox"
            :aria-label="account.name"
            :checked="member.accountIds?.includes(account._id) || false"
            :disabled="busy"
            @change="toggle(account._id, $event.target.checked)"
        /></label>
      </div>
      <p v-if="error" role="alert" class="account-access-error">{{ error }}</p>
      <button v-if="error && !accounts.length" @click="load">Повторить</button>
    </div>
  </TeamChatDialog>
</template>
<style scoped>
.account-access {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.account-access > input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--codex-pane-border);
  border-radius: 8px;
  background: var(--codex-pane-surface);
  color: var(--codex-pane-text);
  font: inherit;
  font-size: 13px;
}
.account-access-list {
  display: flex;
  flex-direction: column;
  max-height: 50dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
}
label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 3px 4px;
  border-bottom: 1px solid var(--codex-pane-border);
  font-size: 13px;
  cursor: pointer;
}
label span {
  min-width: 0;
  overflow-wrap: anywhere;
}
label input {
  flex: none;
  width: 18px;
  height: 18px;
  accent-color: var(--codex-pane-accent);
}
p {
  margin: 0;
  font-size: 13px;
}
.account-access-error {
  color: var(--codex-pane-danger);
}
</style>
