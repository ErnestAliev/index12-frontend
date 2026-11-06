<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { teamApi, teamError } from "@/stores/teamChatStore";
import { bindChatPush, iosDevice, standalone } from "@/utils/teamPush";
import UiIcon from "./UiIcon.vue";
const props = defineProps({
  token: String,
  identity: Object,
  workspaceId: String,
});
const opened = ref(false),
  installed = ref(standalone()),
  deferred = ref(window.index12InstallPrompt || null);
const installing = ref(false),
  instructions = ref(false),
  checking = ref(false),
  state = ref("permission"),
  error = ref(""),
  test = ref("");
const dialog = ref(null),
  endpoint = ref(null),
  receipts = new Set();
let focusBefore,
  testTimer,
  generation = 0;
const mobile = () =>
  window.matchMedia("(max-width: 760px)").matches || iosDevice();
const seenKey = computed(() => "index12-chat-setup:" + props.workspaceId);
const pushLabel = computed(
  () =>
    ({
      enabled: "Уведомления включены",
      disabled: "Уведомления выключены",
      blocked: "Уведомления запрещены в настройках браузера",
      install: "Уведомления доступны после добавления на главный экран",
      unsupported: "Этот браузер не поддерживает push-уведомления",
      unconfigured: "Уведомления чата пока не настроены на сервере",
      permission: "Сообщения и согласования на этом устройстве",
    })[state.value],
);
function remember() {
  try {
    localStorage.setItem(seenKey.value, "1");
  } catch {
    /* Private mode. */
  }
}
function open() {
  focusBefore = document.activeElement;
  opened.value = true;
  nextTick(() => dialog.value?.focus());
}
function close() {
  remember();
  opened.value = false;
  focusBefore?.focus?.({ preventScroll: true });
}
defineExpose({ open });
function beforeInstall(event) {
  event.preventDefault();
  deferred.value = event;
  window.index12InstallPrompt = event;
}
function appInstalled() {
  installed.value = true;
  deferred.value = null;
  window.index12InstallPrompt = null;
  remember();
}
async function install() {
  if (!deferred.value) {
    instructions.value = true;
    return;
  }
  installing.value = true;
  try {
    const prompt = deferred.value;
    await prompt.prompt();
    await prompt.userChoice;
    deferred.value = null;
    window.index12InstallPrompt = null;
    // Only appinstalled / standalone confirms installation, not a click on the offer.
  } catch {
    instructions.value = true;
  } finally {
    installing.value = false;
  }
}
async function check(ask = false) {
  if (!props.identity || checking.value) return;
  const ticket = generation;
  checking.value = true;
  error.value = "";
  try {
    const result = await bindChatPush(props.token, ask, props.identity);
    if (ticket !== generation) return;
    state.value = result.state;
    endpoint.value = result.endpoint || null;
    if (ask && result.state === "enabled") await testPush();
    if (ask && result.state === "install") instructions.value = true;
  } catch (e) {
    if (ticket === generation) {
      state.value = "permission";
      error.value = teamError(e);
    }
  } finally {
    if (ticket === generation) checking.value = false;
  }
}
async function testPush() {
  if (!endpoint.value) return;
  const ticket = generation;
  test.value = "Проверяем доставку…";
  error.value = "";
  clearTimeout(testTimer);
  try {
    const { data } = await teamApi.post("/push/test", {
      endpoint: endpoint.value,
    });
    if (ticket !== generation) return;
    if (receipts.has(data.testId))
      test.value = "Проверочное уведомление получено";
    else {
      waitingTest = data.testId;
      testTimer = setTimeout(() => {
        if (ticket === generation)
          test.value =
            "Отправлено. Если уведомление не появилось, проверьте настройки уведомлений и режим фокусирования телефона";
      }, 15000);
    }
  } catch (e) {
    if (ticket === generation) {
      test.value = "";
      error.value = teamError(e);
    }
  }
}
let waitingTest;
function workerMessage(event) {
  if (event.data?.type !== "team:push-received") return;
  receipts.add(event.data.testId);
  if (waitingTest === event.data.testId) {
    clearTimeout(testTimer);
    test.value = "Проверочное уведомление получено";
  }
}
function wake() {
  if (!document.hidden && props.identity) void check();
}
function trap(event) {
  if (event.key !== "Tab") return;
  const nodes = [
    ...dialog.value.querySelectorAll("button:not(:disabled),a[href]"),
  ].filter((e) => e.getClientRects().length);
  const first = nodes[0],
    last = nodes.at(-1);
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      document.activeElement === dialog.value)
  ) {
    event.preventDefault();
    last?.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last || document.activeElement === dialog.value)
  ) {
    event.preventDefault();
    first?.focus();
  }
}
watch(
  () => props.workspaceId,
  (id) => {
    if (!id || installed.value || !mobile()) return;
    let seen = false;
    try {
      seen = !!localStorage.getItem(seenKey.value);
    } catch {
      /* Private mode. */
    }
    if (!seen) open();
  },
  { immediate: true },
);
watch(
  () => props.identity?.actorId,
  (id) => {
    generation++;
    checking.value = false;
    endpoint.value = null;
    test.value = "";
    error.value = "";
    clearTimeout(testTimer);
    if (id) {
      void check();
      let seen = false;
      try {
        seen = !!localStorage.getItem(
          "index12-chat-push-offer:" + props.workspaceId + ":" + id,
        );
      } catch {
        /* Private mode. */
      }
      if (!seen) {
        open();
        try {
          localStorage.setItem(
            "index12-chat-push-offer:" + props.workspaceId + ":" + id,
            "1",
          );
        } catch {
          /* Private mode. */
        }
      }
    }
  },
  { immediate: true },
);
onMounted(() => {
  window.addEventListener("beforeinstallprompt", beforeInstall);
  window.addEventListener("appinstalled", appInstalled);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  navigator.serviceWorker?.addEventListener("message", workerMessage);
});
onBeforeUnmount(() => {
  generation++;
  clearTimeout(testTimer);
  window.removeEventListener("beforeinstallprompt", beforeInstall);
  window.removeEventListener("appinstalled", appInstalled);
  window.removeEventListener("focus", wake);
  document.removeEventListener("visibilitychange", wake);
  navigator.serviceWorker?.removeEventListener("message", workerMessage);
});
</script>
<template>
  <Teleport to="body">
    <div v-if="opened" class="chat-setup-backdrop" @click.self="close">
      <section
        ref="dialog"
        class="chat-setup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-setup-title"
        tabindex="-1"
        @keydown.esc.stop="close"
        @keydown="trap"
      >
        <header>
          <img src="/chat-192.png" alt="" width="44" height="44" />
          <h2 id="chat-setup-title">Chat</h2>
          <button
            class="setup-icon"
            aria-label="Закрыть настройку чата"
            @click="close"
          >
            <UiIcon name="close" />
          </button>
        </header>
        <template v-if="!installed">
          <h3>Добавьте Chat на главный экран</h3>
          <p>Иконка откроет этот чат по вашей ссылке приглашения.</p>
          <button
            v-if="deferred || (!iosDevice() && !instructions)"
            class="setup-primary"
            :disabled="installing"
            @click="install"
          >
            {{ deferred ? "Установить Chat" : "Как добавить на главный экран" }}
          </button>
          <ol v-if="iosDevice()">
            <li>
              Нажмите «Поделиться» в меню браузера <UiIcon name="share" />.
            </li>
            <li>
              Выберите «На экран Домой», затем «Добавить». Оставьте название
              Chat.
            </li>
            <li>Откройте Chat с новой иконки.</li>
          </ol>
          <p v-else-if="instructions">
            Откройте меню браузера и выберите «Установить приложение» или
            «Добавить на главный экран». Если такого пункта нет, откройте эту
            ссылку в Safari или Chrome.
          </p>
        </template>
        <div v-else class="setup-installed">
          <UiIcon name="check" /> Chat добавлен на главный экран
        </div>
        <template v-if="identity">
          <div class="setup-push">
            <h3>Уведомления</h3>
            <p role="status">
              {{ checking ? "Проверяем подключение…" : pushLabel }}
            </p>
            <button
              v-if="state === 'enabled'"
              :disabled="checking || test === 'Проверяем доставку…'"
              @click="testPush"
            >
              Проверить уведомление
            </button>
            <button
              v-else-if="
                !['blocked', 'unsupported', 'unconfigured'].includes(state)
              "
              :disabled="checking"
              @click="check(true)"
            >
              {{
                state === "install" ? "Как включить" : "Включить уведомления"
              }}
            </button>
            <p v-if="test" role="status">{{ test }}</p>
            <p v-if="error" class="setup-error" role="alert">{{ error }}</p>
          </div>
        </template>
        <button class="setup-later" @click="close">
          {{ installed ? "Продолжить" : "Позже" }}
        </button>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.chat-setup-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483500;
  display: grid;
  place-items: center;
  padding: 16px;
  background: #0007;
  box-sizing: border-box;
}
.chat-setup {
  width: min(400px, 100%);
  max-height: calc(100dvh - 32px);
  overflow: auto;
  box-sizing: border-box;
  border-radius: 18px;
  padding: 24px;
  background: var(--color-background-soft);
  color: var(--color-text);
  box-shadow: 0 20px 70px #0004;
  outline: none;
  font-size: 14px;
  line-height: 1.5;
}
.chat-setup header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
.chat-setup img {
  border-radius: 11px;
}
.chat-setup h2 {
  margin: 0;
  flex: 1;
  font-size: 22px;
}
.chat-setup h3 {
  font-size: 16px;
  margin: 0 0 8px;
  font-weight: 500;
}
.chat-setup p {
  margin: 8px 0 16px;
  color: var(--color-text-mute, var(--color-text));
}
.chat-setup button {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  width: 100%;
  padding: 10px 14px;
  font: inherit;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  text-decoration: none;
}
.chat-setup .setup-icon {
  width: 36px;
  height: 36px;
  min-height: 36px;
  flex: none;
  border: 0;
  padding: 0;
}
.chat-setup .setup-primary {
  background: var(--color-primary);
  color: white;
  border-color: transparent;
}
.chat-setup button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.chat-setup button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.setup-push {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}
.chat-setup .setup-later {
  margin-top: 12px;
  border-color: transparent;
}
.chat-setup ol {
  padding-left: 20px;
}
.chat-setup li {
  margin-top: 10px;
}
.chat-setup li svg {
  display: inline-block;
  vertical-align: middle;
}
.setup-installed {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chat-setup .setup-error {
  color: var(--color-danger, #c65048);
}
</style>
