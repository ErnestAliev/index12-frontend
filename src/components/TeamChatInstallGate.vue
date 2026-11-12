<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import { teamApi, teamError } from "@/stores/teamChatStore";
import { chatWorker, standalone, iosDevice } from "@/utils/teamPush";
import UiIcon from "./UiIcon.vue";
import {
  requestChatInstallation,
  chatInstallInstructions,
} from "@/utils/teamInstallation";
defineProps({ identity: Object });
const emit = defineEmits(["installed"]);
const installed = ref(standalone() || window.index12ChatInstalled === true),
  prompt = ref(window.index12InstallPrompt || null),
  busy = ref(false),
  instructions = ref(false),
  error = ref("");
const installSteps = chatInstallInstructions();
let active = true;
async function confirmInstallation() {
  if (!installed.value || busy.value || !active) return;
  busy.value = true;
  error.value = "";
  try {
    await teamApi.post("/installation", { installed: true });
    if (active) emit("installed");
  } catch (e) {
    if (active) error.value = teamError(e);
  } finally {
    if (active) busy.value = false;
  }
}
function beforeInstall(event) {
  event.preventDefault();
  installed.value = false;
  window.index12ChatInstalled = false;
  instructions.value = false;
  prompt.value = event;
  window.index12InstallPrompt = event;
}
function appInstalled() {
  installed.value = true;
  window.index12ChatInstalled = true;
  prompt.value = null;
  window.index12InstallPrompt = null;
  void confirmInstallation();
}
function wake() {
  if (standalone()) {
    installed.value = true;
    void confirmInstallation();
  }
}
async function install() {
  if (installed.value) return confirmInstallation();
  busy.value = true;
  error.value = "";
  prompt.value = null;
  instructions.value = false;
  try {
    const result = await requestChatInstallation();
    if (!active) return;
    if (result.confirmed) installed.value = true;
    instructions.value = result.outcome === "unavailable";
  } catch {
    if (active) {
      instructions.value = true;
      error.value = "Браузер не открыл установку. Повторите попытку.";
    }
  } finally {
    prompt.value = window.index12InstallPrompt || null;
    busy.value = false;
    if (installed.value) void confirmInstallation();
  }
}
onMounted(() => {
  if ("serviceWorker" in navigator)
    void chatWorker().catch((e) => {
      if (active) error.value = teamError(e);
    });
  window.addEventListener("beforeinstallprompt", beforeInstall);
  window.addEventListener("appinstalled", appInstalled);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  if (installed.value) void confirmInstallation();
});
onBeforeUnmount(() => {
  active = false;
  window.removeEventListener("beforeinstallprompt", beforeInstall);
  window.removeEventListener("appinstalled", appInstalled);
  window.removeEventListener("focus", wake);
  document.removeEventListener("visibilitychange", wake);
});
</script>
<template>
  <section class="team-install-gate" aria-label="Установка Chat">
    <UiIcon name="external" />
    <h1>Установите Chat</h1>
    <p>Чтобы продолжить, установите приложение.</p>
    <button
      v-if="!iosDevice() || installed"
      type="button"
      :disabled="busy"
      @click="install"
    >
      {{ busy ? "Подождите…" : installed ? "Продолжить" : "Установить Chat" }}
    </button>
    <ol v-if="iosDevice() || instructions">
      <li v-for="step in installSteps" :key="step">{{ step }}</li>
    </ol>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.team-install-gate {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: min(380px, 100%);
  padding: max(16px, var(--safe-area-top, 0px))
    max(16px, var(--safe-area-right, 0px)) var(--safe-bottom-controls, 24px)
    max(16px, var(--safe-area-left, 0px));
  text-align: center;
  color: var(--color-text);
}
.team-install-gate > .ui-icon {
  width: 32px;
  height: 32px;
  color: var(--color-primary);
}
.team-install-gate h1 {
  font-size: 20px;
  line-height: 28px;
  margin: 0;
  font-weight: 500;
}
.team-install-gate p {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
}
.team-install-gate button {
  min-height: 44px;
  padding: 10px 16px;
  border: 0;
  border-radius: 8px;
  background: var(--color-primary);
  color: #fff;
  font: inherit;
  font-size: 14px;
}
.team-install-gate ol {
  padding-left: 20px;
  margin: 0;
  font-size: 13px;
  line-height: 22px;
  text-align: left;
}
.team-install-gate li .ui-icon {
  display: inline-block;
  vertical-align: middle;
  width: 14px;
  height: 14px;
}
.team-install-gate [role="alert"] {
  color: var(--color-danger);
}
</style>
