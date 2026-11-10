<script setup>
import { onMounted, onBeforeUnmount, ref, watch, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
import ChatWindowFrame from "@/components/ChatWindowFrame.vue";
import TeamChatHeader from "@/components/TeamChatHeader.vue";
import TeamChatPane from "@/components/TeamChatPane.vue";
import TeamFileLibrary from '@/components/TeamFileLibrary.vue';
import TeamChatSetup from "@/components/TeamChatSetup.vue";
import TeamChatInstallGate from "@/components/TeamChatInstallGate.vue";
import UiIcon from "@/components/UiIcon.vue";
import { nationalPhone, phoneInput, phoneBeforeInput } from "@/utils/teamPhone";
import {
  chatPushEndpoint,
  unsubscribeChatPush,
  chatWorker,
} from "@/utils/teamPush";
const route = useRoute(),
  router = useRouter(),
  chat = useTeamChatStore();
const name = ref(""),
  phone = ref(""),
  password = ref(""),
  confirmPassword = ref(""),
  visible = ref(false),
  register = ref(true),
  booting = ref(true),
  invitation = ref(null),
  setup = ref(null),
  chatClosed = ref(false),
  error = ref(""),
  success = ref(""),
  busy = ref(false),
  valid = ref(false),
  mode = ref("auth"),
  resetToken = ref(
    typeof route.query.reset === "string" ? route.query.reset : "",
  ),
  resetName = ref("");
const accessToken = ref(typeof route.query.access === 'string' ? route.query.access : '');
const namedLogin = computed(() => invitation.value?.namedLogin === true || !!accessToken.value);
const startSession = () => chat.start(invitation.value.workspaceId, { chatOnly: namedLogin.value });
const originalTitle = document.title,
  viewportHeight = ref(window.visualViewport?.height || window.innerHeight);
function resizeEntry() {
  viewportHeight.value = window.visualViewport?.height || window.innerHeight;
  requestAnimationFrame(() => {
    if (document.activeElement?.closest(".team-login form"))
      document.activeElement.scrollIntoView({ block: "nearest" });
  });
}
function clearCredentials() {
  name.value = "";
  phone.value = "";
  password.value = "";
  confirmPassword.value = "";
  visible.value = false;
}
watch(
  () => chat.me?.actorId,
  (id, previous) => {
    if (id !== previous) chatClosed.value = false;
    if (previous && !id) {
      clearCredentials();
      register.value = invitation.value?.joinable !== false;
    }
  },
);
onMounted(async () => {
  document.title = "Chat";
  window.visualViewport?.addEventListener("resize", resizeEntry);
  chat.stop();
  try {
    const responses = await Promise.all([
      teamApi.get(`/invite/${route.params.token}`),
      ...(resetToken.value
        ? [
            teamApi
              .get(`/recovery/${encodeURIComponent(resetToken.value)}`)
              .catch((error) => ({ error })),
          ]
        : []),
    ]);
    invitation.value = responses[0].data;
    valid.value = true;
    register.value = !namedLogin.value && invitation.value.joinable !== false;
    if ("serviceWorker" in navigator) void chatWorker().catch(() => {});
    if (accessToken.value) {
      mode.value = 'join';
      try {
        const { data } = await teamApi.get('/access/invitations/' + encodeURIComponent(accessToken.value));
        if (data.workspaceId !== invitation.value.workspaceId) throw Error('Приглашение относится к другому чату');
        name.value = data.name;
      } catch (e) { mode.value = 'invalid'; valid.value = false; error.value = teamError(e); }
    } else if (resetToken.value) {
      if (responses[1].error) {
        mode.value = "recovery";
        error.value = teamError(responses[1].error);
        resetToken.value = "";
        await router.replace({ path: route.path, query: {} });
      } else {
        mode.value = "reset";
        resetName.value = responses[1].data.name;
      }
    } else await startSession();
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
function switchMode(value) {
  mode.value = value;
  error.value = "";
  success.value = "";
  password.value = "";
  confirmPassword.value = "";
}
async function regularLogin() {
  accessToken.value = '';
  mode.value = 'auth'; valid.value = true; error.value = '';
  await router.replace({ path: route.path, query: {} });
}
async function submitNamed() {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try {
    if (mode.value === 'join') {
      await teamApi.post('/access/invitations/' + encodeURIComponent(accessToken.value) + '/claim', { name: name.value, password: password.value });
      accessToken.value = '';
      await router.replace({ path: route.path, query: {} });
    } else await teamApi.post('/access/login', { token: route.params.token, name: name.value, password: password.value });
    password.value = ''; mode.value = 'auth';
    await startSession();
  } catch (e) {
    error.value = teamError(e);
    if (e.response?.status === 410) { mode.value = 'invalid'; valid.value = false; }
  } finally { busy.value = false; }
}
async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  success.value = "";
  try {
    if (mode.value === "recovery") {
      await teamApi.post("/recovery", {
        token: route.params.token,
        phone: "+7" + nationalPhone(phone.value),
      });
      success.value =
        "Если номер зарегистрирован и доступ открыт, владелец получит запрос. Свяжитесь с ним через известный контакт, чтобы подтвердить личность и получить ссылку";
      return;
    }
    if (mode.value === "reset") {
      if (password.value !== confirmPassword.value)
        throw Error("Пароли не совпадают");
      await teamApi.post(`/recovery/${encodeURIComponent(resetToken.value)}`, {
        password: password.value,
      });
      chat.stop();
      clearCredentials();
      resetToken.value = "";
      mode.value = "auth";
      register.value = false;
      await router.replace({ path: route.path, query: {} });
      success.value =
        "Пароль обновлён. Войдите с номером телефона и новым паролем";
      return;
    }
    await teamApi.post("/auth", {
      token: route.params.token,
      phone: "+7" + nationalPhone(phone.value),
      password: password.value,
      name: name.value,
      register: register.value,
    });
    password.value = "";
    await startSession();
  } catch (e) {
    if (e.response?.data?.code === "PHONE_REGISTERED") {
      register.value = false;
      password.value = "";
    }
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
    /* Device may not support push. */
  }
  await teamApi.post("/logout", { endpoint });
  chat.stop();
  clearCredentials();
  register.value = invitation.value?.joinable !== false;
  try {
    await unsubscribeChatPush();
  } catch {
    /* Server binding was already removed. */
  }
}
const closedText = (status) =>
  ({
    pending: "Ожидается одобрение владельца",
    revoked: "Доступ к чату отозван владельцем. Попросите вернуть доступ",
    rejected: "Заявка на доступ отклонена владельцем",
  })[status] || "Доступ к чату закрыт";
</script>
<template>
  <main class="team-login" :style="{ height: `${viewportHeight}px` }">
    <section v-if="booting" class="team-wait team-connecting" role="status">
      <span class="team-loader" aria-hidden="true"></span
      ><span>{{
        chat.historyLoading
          ? "Загружаем историю сообщений…"
          : "Подключаемся к чату…"
      }}</span>
    </section>
    <form v-else-if="namedLogin && (!chat.me || mode !== 'auth')" @submit.prevent="submitNamed">
      <h1>{{ mode === 'join' ? 'Вход сотрудника' : 'Вход в Chat' }}</h1>
      <div class="team-invite-context"><strong>{{ invitation?.name }}</strong></div>
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="valid">
        <label>Имя<input v-model="name" aria-label="Имя сотрудника" autocomplete="username" maxlength="100" required /></label>
        <label>Пароль<div class="team-password"><input v-model="password" aria-label="Пароль" :type="visible ? 'text' : 'password'" autocomplete="current-password" maxlength="128" required /><button type="button" :aria-label="visible ? 'Скрыть пароль' : 'Показать пароль'" @click="visible = !visible"><UiIcon name="view" /></button></div></label>
        <button type="submit" class="team-login-primary" :disabled="busy">{{ busy ? 'Входим…' : 'Войти' }}</button>
      </template>
      <button v-else-if="invitation" type="button" @click="regularLogin">Войти по имени и паролю</button>
    </form>
    <form v-else-if="!chat.me || mode !== 'auth'" @submit.prevent="submit">
      <h1>
        {{
          mode === "recovery"
            ? "Восстановить доступ"
            : mode === "reset"
              ? "Новый пароль"
              : "Chat"
        }}
      </h1>
      <div class="team-invite-context">
        <strong>{{ invitation?.name }}</strong>
        <p v-if="mode === 'reset'">{{ resetName }}</p>
        <p v-else-if="invitation && mode === 'auth'">
          Приглашает {{ invitation.inviterName }}<br /><template
            v-if="invitation.joinable !== false"
            >Роль: {{ invitation.roleName }} · после одобрения</template
          ><template v-else
            >Приглашение закрыто. Участники могут войти с паролем</template
          >
        </p>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="success" role="status">{{ success }}</p>
      <template v-if="valid">
        <label v-if="mode === 'auth' && register"
          >Имя<input
            v-model="name"
            autocomplete="name"
            required
            maxlength="100"
        /></label>
        <label v-if="mode !== 'reset'"
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
              placeholder="Номер телефона"
              pattern="[0-9]{3} [0-9]{3} [0-9]{2} [0-9]{2}"
              required
            /></div
        ></label>
        <label v-if="mode !== 'recovery'"
          >{{ mode === "reset" ? "Новый пароль" : "Пароль" }}
          <div class="team-password">
            <input
              v-model="password"
              :type="visible ? 'text' : 'password'"
              :autocomplete="
                register || mode === 'reset'
                  ? 'new-password'
                  : 'current-password'
              "
              :minlength="register || mode === 'reset' ? 10 : 1"
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
            </button></div
        ></label>
        <label v-if="mode === 'reset'"
          >Повторите пароль<input
            v-model="confirmPassword"
            :type="visible ? 'text' : 'password'"
            autocomplete="new-password"
            minlength="10"
            maxlength="128"
            required
        /></label>
        <button
          class="team-login-primary"
          :disabled="busy || (mode === 'recovery' && !!success)"
        >
          {{
            busy
              ? "Подождите…"
              : mode === "recovery"
                ? "Запросить восстановление"
                : mode === "reset"
                  ? "Сохранить пароль"
                  : register
                    ? "Запросить доступ"
                    : "Войти"
          }}
        </button>
        <template v-if="mode === 'auth'"
          ><button
            v-if="invitation?.joinable !== false"
            type="button"
            @click="
              register = !register;
              error = '';
              success = '';
            "
          >
            {{
              register ? "Уже зарегистрирован" : "Зарегистрироваться"
            }}</button
          ><button
            type="button"
            class="team-login-link"
            @click="switchMode('recovery')"
          >
            Забыли пароль?
          </button></template
        ><button
          v-else-if="mode === 'recovery'"
          type="button"
          @click="
            switchMode('auth');
            register = false;
          "
        >
          Вернуться ко входу
        </button>
      </template>
    </form>
    <TeamChatInstallGate v-else-if="chat.me.status === 'installation_required'" :identity="chat.me" @installed="startSession" />
    <section v-else-if="chat.me.status !== 'active'" class="team-wait">
      <h1>
        {{
          chat.me.status === "pending"
            ? "Запрос отправлен"
            : chat.me.status === "revoked"
              ? "Доступ отозван"
              : "Заявка отклонена"
        }}
      </h1>
      <p role="status">{{ closedText(chat.me.status) }}</p>
      <p>{{ chat.me.name }} · {{ chat.me.roles?.[chat.me.role] }}</p>
      <button v-if="chat.me.status === 'pending'" @click="setup?.open()">
        Установка и уведомления</button
      ><button @click="logout">Выйти</button>
    </section>
    <section v-else-if="chatClosed" class="team-wait">
      <button class="team-reopen" type="button" @click="chatClosed = false">
        <UiIcon name="chat" />Открыть чат
      </button>
    </section>
    <ChatWindowFrame
      v-else
      :open="true"
      heading-owns-close
      :hide-heading="!!chat.requestedTaskId || chat.creatingTask"
      :mobile="true"
      title="Сотрудники"
      window-id="team-chat-public"
      storage-key="index12-team-chat-window-size"
      @close="chatClosed = true"
      ><template #heading="{ close }"
        ><TeamChatHeader
          :invite-token="String(route.params.token)"
          @close="close"
          @logout="logout" /></template
      ><TeamChatPane mobile
    /></ChatWindowFrame>
    <TeamFileLibrary v-if="chat.fileLibraryOpen && chat.me?.status === 'active'" @source-open="chatClosed=false"/>
    <TeamChatSetup
      v-if="valid && !booting && mode === 'auth' && chat.me?.status !== 'installation_required'"
      ref="setup"
      :token="String(route.params.token)"
      :workspace-id="invitation?.workspaceId"
      :identity="
        chat.me && ['active', 'pending'].includes(chat.me.status)
          ? chat.me
          : null
      "
    />
  </main>
</template>
<style scoped>
.team-reopen {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
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
.team-connecting {
  align-items: center;
  justify-content: center;
  text-align: center;
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
  flex-shrink: 0;
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

<style scoped>
.team-login .team-login-link {
  border: 0;
  background: transparent;
  padding: 4px;
  font-size: 13px;
  min-height: 36px;
}
</style>
