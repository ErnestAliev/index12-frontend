<script setup>
import { computed, onBeforeUnmount, ref, watch, nextTick } from "vue";
import { useRoute } from "vue-router";
import { useMainStore } from "@/stores/mainStore";
import { useTeamChatStore, teamError } from "@/stores/teamChatStore";
import ChatWindowFrame from "./ChatWindowFrame.vue";
import TeamChatHeader from "@/components/TeamChatHeader.vue";
import TeamChatPane from "./TeamChatPane.vue";
import UiIcon from "./UiIcon.vue";
const main = useMainStore(),
  chat = useTeamChatStore(),
  route = useRoute(),
  dismissed = ref([]),
  role = ref("employee"),
  approvalError = ref("");
const approvalPanel = ref(null);

let approvalFocus;
function approvalKeys(event) {
  if (event.key !== "Tab") return;
  const items = [
    ...approvalPanel.value.querySelectorAll("button:not(:disabled),select"),
  ];
  const first = items[0],
    last = items.at(-1);
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      document.activeElement === approvalPanel.value)
  ) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
const pending = computed(() =>
  chat.me?.owner
    ? chat.pending.find((m) => !dismissed.value.includes(m._id))
    : null,
);
watch(
  () => pending.value?._id,
  async (id) => {
    role.value = pending.value?.role || "employee";
    approvalError.value = "";
    if (id) {
      approvalFocus = document.activeElement;
      await nextTick();
      approvalPanel.value?.focus({ preventScroll: true });
    } else if (approvalFocus?.isConnected)
      approvalFocus.focus({ preventScroll: true });
  },
);
watch(
  () => [
    main.user?.id || main.user?._id,
    main.user?.currentWorkspaceId,
    route.path.startsWith("/team/"),
  ],
  ([actor, workspace, publicPage]) => {
    dismissed.value = [];
    if (publicPage) return;
    if (actor && workspace)
      void chat.start(String(workspace)).then(() => {
        if (
          route.query.teamChat === String(workspace) &&
          chat.me?.owner &&
          chat.me.workspaceId === String(workspace)
        )
          chat.show();
      });
    else chat.stop();
  },
  { immediate: true },
);
function show() {
  chat.show();
}
function created() {
  void main.forceRefreshAll?.();
}
function notificationOpened(event) {
  if (
    !route.path.startsWith("/team/") &&
    event.data?.type === "team:refresh" &&
    event.data.workspaceId === chat.me?.workspaceId &&
    chat.me?.owner
  )
    chat.show();
}
navigator.serviceWorker?.addEventListener("message", notificationOpened);
window.addEventListener("index12:open-team-chat", show);
window.addEventListener("index12:team-operation-created", created);
onBeforeUnmount(() => {
  navigator.serviceWorker?.removeEventListener("message", notificationOpened);
  window.removeEventListener("index12:open-team-chat", show);
  window.removeEventListener("index12:team-operation-created", created);
  chat.stop();
});
async function decide(status) {
  if (!pending.value) return;
  try {
    await chat.action(
      `/members/${pending.value._id}`,
      { role: role.value, status, expectedVersion: pending.value.version },
      "patch",
    );
  } catch (e) {
    approvalError.value = teamError(e);
  }
}
</script>
<template>
  <ChatWindowFrame
    v-if="!route.path.startsWith('/team/')"
    :open="chat.open"
    heading-owns-close
    :hide-heading="!!chat.requestedTaskId || chat.creatingTask"
    :mobile="route.name === 'mobile-home'"
    title="Сотрудники"
    window-id="team-chat-window"
    side="left"
    storage-key="index12-team-chat-window-size"
    @close="chat.open = false"
    ><template #heading="{ close }"
      ><TeamChatHeader @close="close" @logout="chat.open = false" /></template
    ><TeamChatPane :mobile="route.name === 'mobile-home'"
  /></ChatWindowFrame>
  <Teleport to="body"
    ><div v-if="pending" class="team-approval-backdrop">
      <section
        class="team-approval"
        ref="approvalPanel"
        tabindex="-1"
        @keydown="approvalKeys"
        @keydown.esc.stop.prevent="dismissed.push(pending._id)"
        role="dialog"
        aria-modal="true"
        aria-label="Запрос на добавление в чат"
      >
        <header>
          <h2>Запрос на добавление в чат</h2>
          <button
            class="approval-close"
            title="Позже"
            aria-label="Рассмотреть запрос позже"
            @click="dismissed.push(pending._id)"
          >
            <UiIcon name="close" />
          </button>
        </header>
        <p>{{ pending.name }}</p>
        <p class="approval-phone">{{ pending.phone }}</p>
        <label
          >Роль и должность<select v-model="role" aria-label="Роль и должность">
            <option
              v-for="(label, key) in chat.me.roles"
              :key="key"
              :value="key"
            >
              {{ label }}
            </option>
          </select></label
        >
        <p v-if="approvalError" role="alert">{{ approvalError }}</p>
        <footer>
          <button :disabled="chat.busy" @click="decide('rejected')">
            Отклонить</button
          ><button
            class="approval-accept"
            :disabled="chat.busy"
            @click="decide('active')"
          >
            Одобрить
          </button>
        </footer>
      </section>
    </div></Teleport
  >
</template>
<style scoped>
.placement-error {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 140000;
  max-width: 90vw;
  padding: 12px 20px;
  background: var(--color-background);
  border: 1px solid var(--color-danger, #bd4942);
  border-radius: 8px;
  color: var(--color-danger, #bd4942);
  font-size: 13px;
}

.team-approval-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #0006;
  box-sizing: border-box;
}
.team-approval {
  box-sizing: border-box;
  width: min(420px, 100%);
  max-height: 100%;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
}
.team-approval header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.team-approval h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
}
.team-approval button,
.team-approval select {
  font: inherit;
  color: inherit;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
}
.team-approval .approval-close {
  display: grid;
  place-items: center;
  padding: 0;
  width: 32px;
  height: 32px;
  flex: none;
  border: 0;
  background: transparent;
}
.approval-phone {
  opacity: 0.65;
}
.team-approval label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  margin: 20px 0;
}
.team-approval select {
  width: 100%;
  min-width: 0;
}
.team-approval footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
.team-approval .approval-accept {
  background: var(--color-primary);
  color: white;
  border-color: transparent;
}
.team-approval button:disabled {
  opacity: 0.45;
}
.team-approval button:focus-visible,
.team-approval select:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>

<style scoped>
.team-approval select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 36px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23859390' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-size: 14px 14px;
  background-position: right 12px center;
  min-height: 40px;
  line-height: 20px;
}
</style>
