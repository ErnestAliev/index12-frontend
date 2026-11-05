<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useRoute } from "vue-router";
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
import ChatWindowFrame from "@/components/ChatWindowFrame.vue";
import TeamChatPane from "@/components/TeamChatPane.vue";
import UiIcon from "@/components/UiIcon.vue";
const route = useRoute(),
  chat = useTeamChatStore(),
  name = ref(""),
  phone = ref(""),
  password = ref(""),
  visible = ref(false),
  register = ref(false),
  error = ref(""),
  workspaceName = ref(""),
  busy = ref(false),
  valid = ref(false);
onMounted(async () => {
  chat.stop();
  try {
    const { data } = await teamApi.get(`/invite/${route.params.token}`);
    workspaceName.value = data.name;
    valid.value = true;
    await chat.start();
  } catch (e) {
    error.value = teamError(e);
  }
});
onBeforeUnmount(() => chat.stop());
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    await teamApi.post("/auth", {
      token: route.params.token,
      phone: phone.value,
      password: password.value,
      name: name.value,
      register: register.value,
    });
    password.value = "";
    await chat.start();
  } catch (e) {
    error.value = teamError(e);
  } finally {
    busy.value = false;
  }
}
async function logout() {
  await teamApi.post("/logout");
  chat.stop();
}
</script>
<template>
  <main class="team-login">
    <form v-if="!chat.me" @submit.prevent="submit">
      <h1>Чат сотрудников</h1>
      <p>{{ workspaceName }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="valid"
        ><label v-if="register"
          >Имя<input
            v-model="name"
            autocomplete="name"
            required
            maxlength="100" /></label
        ><label
          >Номер телефона<input
            v-model="phone"
            type="tel"
            autocomplete="tel"
            placeholder="+7"
            required /></label
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
      <button @click="logout">Выйти</button>
    </section>
    <ChatWindowFrame
      v-else
      :open="true"
      :mobile="true"
      title="Сотрудники"
      window-id="team-chat-public"
      storage-key="index12-team-chat-window-size"
      @close="logout"
      ><template #icon><UiIcon name="chat" /></template><TeamChatPane mobile/></ChatWindowFrame>
  </main>
</template>
<style scoped>
.team-login {
  min-height: 100dvh;
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
