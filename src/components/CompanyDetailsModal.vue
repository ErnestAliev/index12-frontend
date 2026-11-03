<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { businessApi, businessError } from '@/services/businessApi';
import { selectEdsFile } from '@/utils/edsFilePicker';

const props = defineProps({ companyId: { type: String, required: true }, workspaceId: { type: String, default: '' } });
const emit = defineEmits(['close']);
const main = useMainStore();
const company = ref(null);
const eds = ref(null);
const storagePath = ref('');
const password = ref('');
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const message = ref('');
const checkedAt = ref(null);
const closeButton = ref(null);
const choosingFile = ref(false);
let pickerController;
const previousFocus = document.activeElement;
onMounted(() => closeButton.value?.focus());
function onDialogKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
  if (event.key !== 'Tab') return;
  const focusable = [...event.currentTarget.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')].filter(node => node.getClientRects().length);
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
async function chooseFile() {
  if (choosingFile.value || busy.value) return;
  const current = generation;
  choosingFile.value = true; error.value = ''; message.value = '';
  pickerController = new AbortController();
  try {
    const selected = await selectEdsFile({ currentPath: storagePath.value, signal: pickerController.signal });
    if (selected && current === generation) storagePath.value = selected;
  } catch (e) { if (current === generation) error.value = e.message; }
  finally { if (current === generation) choosingFile.value = false; }
}
let generation = 0, controller;
const requestOptions = () => ({ headers: props.workspaceId ? { 'X-Index12-Workspace-ID': String(props.workspaceId) } : {} });
const endpoint = () => `/companies/${props.companyId}`;
const canUpdate = computed(() => !!eds.value?.enabled && !busy.value && !loading.value);
const needsPassword = computed(() => !eds.value?.passwordStored || !eds.value.enabled || storagePath.value.trim() !== eds.value.storagePath);
const dataFields = [['identificationNumber', 'БИН/ИИН'], ['legalAddress', 'Юридический адрес'], ['director', 'Руководитель'], ['registrationDate', 'Дата регистрации'], ['activity', 'Вид деятельности'], ['registrationStatus', 'Статус регистрации']];
watch(() => [main.user?.id || main.user?._id, main.user?.currentWorkspaceId, props.companyId, props.workspaceId], async ([userId]) => {
  const current = ++generation;
  controller?.abort(); controller = new AbortController();
  pickerController?.abort(); choosingFile.value = false;
  company.value = null; eds.value = null; storagePath.value = ''; password.value = ''; error.value = ''; message.value = ''; loading.value = true;
  busy.value = false;
  checkedAt.value = null;
  if (!userId) return;
  try {
    const { data } = await businessApi.get(endpoint(), { ...requestOptions(), signal: controller.signal });
    if (current !== generation) return;
    company.value = data.company; eds.value = data.eds; storagePath.value = data.eds?.storagePath || '';
  } catch (e) { if (current === generation && e.code !== 'ERR_CANCELED') error.value = businessError(e); }
  finally { if (current === generation) loading.value = false; }
}, { immediate: true });
onBeforeUnmount(() => { ++generation; controller?.abort(); pickerController?.abort(); password.value = ''; if (previousFocus?.isConnected) previousFocus.focus(); });
const authRequired = computed(() => !main.isAuthLoading && !main.user);
async function action(fn) {
  if (busy.value) return;
  const current = generation;
  busy.value = true; error.value = ''; message.value = '';
  try { await fn(current); } catch (e) { if (current === generation) error.value = businessError(e); }
  finally { if (current === generation) busy.value = false; }
}
const connect = () => action(async current => {
  const { data } = await businessApi.put(`${endpoint()}/eds`, { storagePath: storagePath.value, password: password.value || undefined }, requestOptions());
  if (current !== generation) return;
  eds.value = data.eds; storagePath.value = data.eds.storagePath; password.value = ''; message.value = 'Настройки ЭЦП сохранены';
});
const disconnect = () => action(async current => {
  await businessApi.delete(`${endpoint()}/eds`, requestOptions());
  if (current !== generation) return;
  eds.value = null; storagePath.value = ''; password.value = ''; message.value = 'ЭЦП отключена';
});
const updateCompany = () => action(async current => {
  const { data } = await businessApi.post(`${endpoint()}/refresh`, {}, requestOptions());
  if (current !== generation) return;
  company.value = data.company; checkedAt.value = data.checkedAt; message.value = 'Данные компании обновлены';
  const item = main.companies.find(item => String(item._id) === String(data.company._id));
  if (item) Object.assign(item, data.company);
});
</script>

<template>
  <Teleport to="body"><div class="company-overlay" @click.self="emit('close')"><section class="company-page" role="dialog" aria-modal="true" aria-label="Карточка компании" @keydown="onDialogKeydown">
    <header class="company-page-header"><span>Компания</span><button ref="closeButton" type="button" class="company-close" aria-label="Закрыть карточку компании" @click="emit('close')">×</button></header>
    <div v-if="error" class="company-error" role="alert">{{ error }}</div>
    <div v-if="authRequired" class="company-loading" role="status"><a href="/">Войти в INDEX12</a></div>
    <div v-else-if="loading" class="company-loading" role="status">Загрузка…</div>
    <template v-if="company">
      <div class="company-title-row"><h1>{{ company.name }}</h1><button type="button" class="company-update" :disabled="!canUpdate" @click="updateCompany">{{ busy ? 'Обработка…' : 'Обновить компанию' }}</button></div>
      <div class="company-page-grid">
        <section class="company-section" aria-label="Реквизиты компании">
          <h2>Реквизиты</h2>
          <dl><template v-for="[field, label] in dataFields" :key="field"><dt>{{ label }}</dt><dd>{{ company[field] || '—' }}</dd></template></dl>
          <a v-if="checkedAt" href="https://data.egov.kz/datasets/view?index=gbd_ul" target="_blank" rel="noopener noreferrer" class="company-source">eGov · {{ new Date(checkedAt).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }) }}</a>
        </section>
        <section class="company-section" aria-label="Подключение ЭЦП">
          <div class="eds-heading"><h2>ЭЦП</h2><span v-if="eds?.passwordStored" class="eds-state">{{ eds.enabled ? 'Сохранена' : 'Требует обновления' }}</span></div>
          <form @submit.prevent="connect" class="eds-form">
            <label>Файл ЭЦП<div class="eds-file-control"><input :value="storagePath" type="text" readonly aria-label="Путь к файлу ЭЦП" placeholder="Выберите файл" @click="chooseFile" /><button type="button" class="eds-file-button" aria-label="Выбрать файл ЭЦП" title="Выбрать локальный файл ЭЦП через NCALayer" :disabled="busy || choosingFile" @click="chooseFile"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2"/><path d="M3 7h7l2 3h9l-3 10H3z"/></svg></button></div></label>
            <label>Пароль<input v-model="password" type="password" autocomplete="new-password" :placeholder="eds?.passwordStored ? 'Сохранён' : ''" aria-label="Пароль ЭЦП" :disabled="busy" maxlength="1024" /></label>
            <div class="eds-actions"><button type="submit" :disabled="busy || !storagePath.trim() || (!password && needsPassword)">{{ eds?.passwordStored ? 'Сохранить' : 'Подключить ЭЦП' }}</button><button v-if="eds" type="button" :disabled="busy" @click="disconnect">Отключить</button></div>
          </form>
        </section>
      </div>
      <div v-if="message" class="company-message" role="status">{{ message }}</div>
    </template>
  </section></div></Teleport>
</template>

<style scoped>
.company-overlay { position: fixed; inset: 0; z-index: 5000; display: grid; place-items: center; padding: 20px; background: #0008; }
.company-page { box-sizing: border-box; width: min(1120px, 100%); max-height: calc(100dvh - 40px); overflow-y: auto; background: var(--color-background); color: var(--color-text); padding: 24px; border: 1px solid var(--color-border); border-radius: 12px; box-shadow: 0 20px 70px #0006; }
.company-page-header { display: flex; align-items: center; gap: 20px; padding-bottom: 24px; border-bottom: 1px solid var(--color-border); font-size: 13px; }
.company-page-header { justify-content: space-between; }
.company-page-header .company-close { padding: 0 4px; border: 0; background: transparent; font-size: 26px; line-height: 1; }
.company-title-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 30px 0; }
h1 { margin: 0; font-size: 28px; font-weight: 600; overflow-wrap: anywhere; } h2 { margin: 0; font-size: 17px; font-weight: 600; }
.company-page-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; }
.company-section { padding: 24px; border: 1px solid var(--color-border); border-radius: 10px; min-width: 0; }
dl { display: grid; grid-template-columns: 150px 1fr; gap: 20px 16px; margin: 26px 0 0; font-size: 14px; }
dt { color: var(--color-text-soft, var(--color-text)); opacity: .7; } dd { margin: 0; overflow-wrap: anywhere; }
.eds-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.eds-state { font-size: 12px; color: var(--color-primary, #38b86d); }
.eds-form { display: grid; gap: 20px; margin-top: 26px; }
.eds-file-control { display: flex; align-items: stretch; gap: 8px; }
.eds-file-control input { flex: 1; cursor: pointer; }
.eds-file-control .eds-file-button { display: flex; align-items: center; justify-content: center; flex: 0 0 42px; padding: 8px; }
label { display: grid; gap: 8px; font-size: 13px; }
input, button { font: inherit; color: var(--color-text); border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-background-soft); padding: 10px 12px; min-width: 0; box-sizing: border-box; }
input { width: 100%; } button { cursor: pointer; font-size: 13px; white-space: nowrap; } button:disabled { opacity: .4; cursor: default; }
.company-update, .eds-actions button:first-child { border-color: var(--color-primary, #38b86d); }
.eds-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.company-error { color: #dd6666; margin: 20px 0; } .company-message { margin-top: 20px; font-size: 13px; } .company-loading { margin: 30px 0; }
.company-source { display: inline-block; font-size: 12px; margin-top: 24px; color: var(--color-primary, #38b86d); }
@media (max-width: 760px) { .company-overlay { padding: 8px; } .company-page { padding: 20px 16px; } .company-title-row { flex-direction: column; align-items: flex-start; } .company-page-grid { grid-template-columns: 1fr; } h1 { font-size: 23px; } .company-section { padding: 20px; } dl { grid-template-columns: 120px 1fr; } }
</style>
