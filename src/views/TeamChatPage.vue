<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useRoute } from "vue-router";
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
import ChatWindowFrame from "@/components/ChatWindowFrame.vue";
import TeamChatHeader from "@/components/TeamChatHeader.vue";
import TeamChatPane from "@/components/TeamChatPane.vue";
import TeamChatSetup from "@/components/TeamChatSetup.vue";
import { nationalPhone, phoneInput, phoneBeforeInput } from "@/utils/teamPhone";
import {
  chatPushEndpoint,
  unsubscribeChatPush,
  chatWorker,
} from "@/utils/teamPush";
const route = useRoute(),
  chat = useTeamChatStore(),
  name = ref(""),
  phone = ref(""),
  password = ref(""),
  visible = ref(false),
  register = ref(true),
  booting = ref(true),
  invitation = ref(null),
  setup = ref(null),
  error = ref(""),
  workspaceName = ref(""),
  busy = ref(false),
  valid = ref(false);
const originalTitle = document.title;
const viewportHeight = ref(window.visualViewport?.height || window.innerHeight);
function resizeEntry() {
  viewportHeight.value = window.visualViewport?.height || window.innerHeight;
  requestAnimationFrame(() => {
    if (document.activeElement?.closest(".team-login form"))
      document.activeElement.scrollIntoView({ block: "nearest" });
  });
}
onMounted(async () => {
  document.title = "Chat";
  window.visualViewport?.addEventListener("resize", resizeEntry);
  chat.stop();
  try {
    const { data } = await teamApi.get(`/invite/${route.params.token}`);
    workspaceName.value = data.name;
    invitation.value = data;
    valid.value = true;
    if ("serviceWorker" in navigator) void chatWorker().catch(() => {});
    await chat.start(data.workspaceId);
  } catch (e) {
    error.value = teamError(e);
  } finally {
    booting.value = false;
  }
});
onBeforeUnmount(() => {
  document.title = originalTitle;
  window.visualViewport?.removeEventListener("resize", resizeEntry);
  chat.stop();
});
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    await teamApi.post("/auth", {
      token: route.params.token,
      phone: "+7" + nationalPhone(phone.value),
      password: password.value,
      name: name.value,
      register: register.value,
    });
    password.value = "";
    await chat.start(invitation.value.workspaceId);
  } catch (e) {
    error.value = teamError(e);
  } finally {
    busy.value = false;
  }
}
async function logout() {
  let endpoint;
  try {
    endpoint = await chatPushEndpoint();
  } catch {
    /* Logout still works without service workers. */
  }
  await teamApi.post("/logout", { endpoint });
  chat.stop();
  try {
    await unsubscribeChatPush();
  } catch {
    /* Server binding was already removed. */
  }
}
</script>
<template>
  <main class="team-login" :style="{ height: `${viewportHeight}px` }">
    <section v-if="booting" class="team-wait" role="status">
      <span class="team-loader" aria-hidden="true"></span
      >{{
        chat.historyLoading
          ? "Загружаем историю сообщений…"
          : "Подключаемся к чату…"
      }}
    </section>
    <form v-else-if="!chat.me" @submit.prevent="submit">
      <h1>Chat</h1>
      <div class="team-invite-context">
        <strong>{{ workspaceName }}</strong>
        <p v-if="invitation">
          Приглашает {{ invitation.inviterName }}<br />Роль:
          {{ invitation.roleName }} · после одобрения
        </p>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="valid"
        ><label v-if="register"
          >Имя<input
            v-model="name"
            autocomplete="name"
            required
            maxlength="100" /></label
        ><label
          >Номер телефона
          <div class="team-phone">
            <span aria-hidden="true">+7</span
            ><input
              :value="phone"
              @input="phone = phoneInput($event)"
              @beforeinput="phoneBeforeInput"
              type="tel"
              inputmode="tel"
              autocomplete="tel-national"
              aria-label="Номер телефона"
              placeholder="705 488 66 98"
              pattern="[0-9]{3} [0-9]{3} [0-9]{2} [0-9]{2}"
              required
            /></div></label
        ><label
          >Пароль
          <div class="team-password">
            <input
              v-model="password"
              :type="visible ? 'text' : 'password'"
              :autocomplete="register ? 'new-password' : 'current-password'"
              :minlength="register ? 10 : 1"
              maxlength="128"
              required
            /><button
              type="button"
              :aria-label="visible ? 'Скрыть пароль' : 'Показать пароль'"
              @click="visible = !visible"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                aria-hidden="true"
              >
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button></div></label
        ><button class="team-login-primary" :disabled="busy">
          {{ register ? "Запросить доступ" : "Войти" }}</button
        ><button
          type="button"
          @click="
            register = !register;
            error = '';
          "
        >
          {{ register ? "Уже зарегистрирован" : "Зарегистрироваться" }}
        </button></template
      >
    </form>
    <section v-else-if="chat.me.status !== 'active'" class="team-wait">
      <h1>
        {{
          chat.me.status === "pending" ? "Запрос отправлен" : "Доступ закрыт"
        }}
      </h1>
      <p>{{ chat.error || "Ожидается одобрение владельца" }}</p>
      <p v-if="chat.me">
        {{ chat.me.name }} · {{ chat.me.roles?.[chat.me.role] }}
      </p>
      <button @click="setup?.open()">Установка и уведомления</button>
      <button @click="logout">Выйти</button>
    </section>
    <ChatWindowFrame
      v-else
      :open="true"
      :closable="false"
      :mobile="true"
      title="Сотрудники"
      window-id="team-chat-public"
      storage-key="index12-team-chat-window-size"
      ><template #heading
        ><TeamChatHeader
          setup-available
          @setup="setup?.open()"
          @logout="logout" /></template
      ><TeamChatPane mobile
    /></ChatWindowFrame>
    <TeamChatSetup
      v-if="valid && !booting"
      ref="setup"
      :token="String(route.params.token)"
      :workspace-id="invitation?.workspaceId"
      :identity="chat.me"
    />
  </main>
</template>
<style scoped>
.team-login {
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  box-sizing: border-box;
  background: var(--color-background);
  color: var(--color-text);
}
.team-login form,
.team-wait {
  width: min(360px, 100%);
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.team-login h1 {
  font-size: 24px;
  font-weight: 500;
  margin: 0;
}
.team-login p {
  margin: 0;
  line-height: 1.6;
}
.team-login label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.team-login input,
.team-login button {
  box-sizing: border-box;
  width: 100%;
  padding: 12px;
  font: inherit;
  font-size: 16px;
  color: inherit;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  min-width: 0;
}
.team-login button {
  cursor: pointer;
}
.team-login .team-login-primary {
  background: var(--color-primary);
  color: #fff;
  border-color: transparent;
}
.team-invite-context {
  font-size: 13px;
}
.team-invite-context p {
  margin-top: 6px;
  opacity: 0.75;
}
.team-phone {
  display: flex;
  align-items: center;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding-left: 12px;
  gap: 8px;
  font-size: 16px;
}
.team-phone input {
  border: 0;
  background: transparent;
}
.team-loader {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: team-spin 0.8s linear infinite;
}
@keyframes team-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .team-loader {
    animation: none;
  }
}
.team-password {
  display: flex;
  align-items: center;
  position: relative;
}
.team-password input {
  padding-right: 48px;
}
.team-password button {
  position: absolute;
  right: 4px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: transparent;
  border: 0;
}
.team-password svg {
  width: 20px;
  height: 20px;
}
.team-login [role="alert"] {
  color: var(--color-danger, #c65048);
}
.team-login input:focus-visible,
.team-login button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>

<style scoped>
.team-phone:focus-within {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.team-phone input:focus-visible {
  outline: none;
}
.team-login {
  height: 100dvh;
  overflow-y: auto;
}
</style>
