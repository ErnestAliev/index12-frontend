<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { teamApi, teamError } from '@/stores/teamChatStore';
import { chatWorker, standalone, iosDevice } from '@/utils/teamPush';
import UiIcon from './UiIcon.vue';
defineProps({ identity: Object });
const emit = defineEmits(['installed']);
const installed = ref(standalone() || window.index12ChatInstalled === true), prompt = ref(window.index12InstallPrompt || null), busy = ref(false), instructions = ref(false), error = ref('');
let active = true;
async function confirmInstallation() {
  if (!installed.value || busy.value || !active) return;
  busy.value = true; error.value = '';
  try {
    await teamApi.post('/installation', { installed: true });
    if (active) emit('installed');
  } catch (e) { if (active) error.value = teamError(e); }
  finally { if (active) busy.value = false; }
}
function beforeInstall(event) { event.preventDefault(); prompt.value = event; window.index12InstallPrompt = event; }
function appInstalled() { installed.value = true; window.index12ChatInstalled = true; prompt.value = null; window.index12InstallPrompt = null; void confirmInstallation(); }
function wake() { if (standalone()) { installed.value = true; void confirmInstallation(); } }
async function install() {
  if (installed.value) return confirmInstallation();
  if (!prompt.value) { instructions.value = true; return; }
  busy.value = true; error.value = '';
  try { const offer = prompt.value; await offer.prompt(); await offer.userChoice; prompt.value = null; window.index12InstallPrompt = null; }
  catch { instructions.value = true; }
  finally { busy.value = false; if (installed.value) void confirmInstallation(); }
}
onMounted(() => {
  if ('serviceWorker' in navigator) void chatWorker().catch(e => { if (active) error.value = teamError(e); });
  window.addEventListener('beforeinstallprompt', beforeInstall);
  window.addEventListener('appinstalled', appInstalled);
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', wake);
  if (installed.value) void confirmInstallation();
});
onBeforeUnmount(() => {
  active = false;
  window.removeEventListener('beforeinstallprompt', beforeInstall);
  window.removeEventListener('appinstalled', appInstalled);
  window.removeEventListener('focus', wake);
  document.removeEventListener('visibilitychange', wake);
});
</script>
<template>
  <section class="team-install-gate" aria-label="Установка Chat">
    <UiIcon name="external" /><h1>Добавьте Chat на главный экран</h1>
    <p>Чтобы продолжить, установите приложение.</p>
    <button type="button" :disabled="busy" @click="install">{{ busy ? 'Подождите…' : installed ? 'Продолжить' : prompt ? 'Установить Chat' : 'Как установить Chat' }}</button>
    <ol v-if="iosDevice()"><li>Нажмите «Поделиться» <UiIcon name="share" /> в меню Safari.</li><li>Выберите «На экран Домой», затем «Добавить».</li><li>Откройте Chat с главного экрана и войдите с именем и паролем.</li></ol>
    <p v-else-if="instructions">В меню браузера выберите «Установить приложение» или «Добавить на главный экран», затем откройте Chat с новой иконки. Если пункта нет, откройте ссылку в Chrome или Safari.</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.team-install-gate { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 16px; width: min(380px,100%); padding: max(16px,var(--safe-area-top,0px)) max(16px,var(--safe-area-right,0px)) var(--safe-bottom-controls,24px) max(16px,var(--safe-area-left,0px)); text-align: center; color: var(--color-text); }
.team-install-gate > .ui-icon { width: 32px; height: 32px; color: var(--color-primary); }
.team-install-gate h1 { font-size: 20px; line-height: 28px; margin: 0; font-weight: 500; }
.team-install-gate p { margin: 0; font-size: 14px; line-height: 22px; }
.team-install-gate button { min-height: 44px; padding: 10px 16px; border: 0; border-radius: 8px; background: var(--color-primary); color: #fff; font: inherit; font-size: 14px; }
.team-install-gate ol { padding-left: 20px; margin: 0; font-size: 13px; line-height: 22px; text-align: left; }
.team-install-gate li .ui-icon { display: inline-block; vertical-align: middle; width: 14px; height: 14px; }
.team-install-gate [role=alert] { color: var(--color-danger); }
</style>
