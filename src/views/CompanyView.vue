<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useMainStore } from '@/stores/mainStore';
import { businessApi, businessError } from '@/services/businessApi';

const route = useRoute();
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
let generation = 0, controller;
const requestOptions = () => ({ headers: route.query.workspace ? { 'X-Index12-Workspace-ID': String(route.query.workspace) } : {} });
const endpoint = () => `/companies/${route.params.id}`;
const canUpdate = computed(() => !!eds.value?.enabled && !busy.value && !loading.value);
const needsPassword = computed(() => !eds.value?.passwordStored || !eds.value.enabled || storagePath.value.trim() !== eds.value.storagePath);
const dataFields = [['identificationNumber', 'БИН/ИИН'], ['legalAddress', 'Юридический адрес'], ['director', 'Руководитель'], ['registrationDate', 'Дата регистрации'], ['activity', 'Вид деятельности'], ['registrationStatus', 'Статус регистрации']];
watch(() => [main.user?.id || main.user?._id, main.user?.currentWorkspaceId, route.params.id, route.query.workspace], async ([userId]) => {
  const current = ++generation;
  controller?.abort(); controller = new AbortController();
  company.value = null; eds.value = null; storagePath.value = ''; password.value = ''; error.value = ''; message.value = ''; loading.value = true;
  busy.value = false;
  checkedAt.value = null;
  if (!userId) return;
  try {
    const { data } = await businessApi.get(endpoint(), { ...requestOptions(), signal: controller.signal });
    if (current !== generation) return;
    company.value = data.company; eds.value = data.eds; storagePath.value = data.eds?.storagePath || '';
    document.title = `${data.company.name} · INDEX12`;
  } catch (e) { if (current === generation && e.code !== 'ERR_CANCELED') error.value = businessError(e); }
  finally { if (current === generation) loading.value = false; }
}, { immediate: true });
onBeforeUnmount(() => { ++generation; controller?.abort(); password.value = ''; });
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
  <main class="company-page">
    <header class="company-page-header"><a href="/" class="company-home">INDEX12</a><span>Компания</span></header>
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
            <label>Путь к файлу ЭЦП<input v-model="storagePath" type="text" autocomplete="off" spellcheck="false" placeholder="/Users/…/company.p12" aria-label="Путь к файлу ЭЦП" :disabled="busy" maxlength="4096" /></label>
            <label>Пароль<input v-model="password" type="password" autocomplete="new-password" :placeholder="eds?.passwordStored ? 'Сохранён' : ''" aria-label="Пароль ЭЦП" :disabled="busy" maxlength="1024" /></label>
            <div class="eds-actions"><button type="submit" :disabled="busy || !storagePath.trim() || (!password && needsPassword)">{{ eds?.passwordStored ? 'Сохранить' : 'Подключить ЭЦП' }}</button><button v-if="eds" type="button" :disabled="busy" @click="disconnect">Отключить</button></div>
          </form>
        </section>
      </div>
      <div v-if="message" class="company-message" role="status">{{ message }}</div>
    </template>
  </main>
</template>

<style scoped>
.company-page { box-sizing: border-box; min-height: 100dvh; background: var(--color-background); color: var(--color-text); padding: 28px max(24px, calc((100vw - 1120px) / 2)); }
.company-page-header { display: flex; align-items: center; gap: 20px; padding-bottom: 24px; border-bottom: 1px solid var(--color-border); font-size: 13px; }
.company-home { font-weight: 800; letter-spacing: .04em; color: var(--color-heading); text-decoration: none; }
.company-title-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 30px 0; }
h1 { margin: 0; font-size: 28px; font-weight: 600; overflow-wrap: anywhere; } h2 { margin: 0; font-size: 17px; font-weight: 600; }
.company-page-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; }
.company-section { padding: 24px; border: 1px solid var(--color-border); border-radius: 10px; min-width: 0; }
dl { display: grid; grid-template-columns: 150px 1fr; gap: 20px 16px; margin: 26px 0 0; font-size: 14px; }
dt { color: var(--color-text-soft, var(--color-text)); opacity: .7; } dd { margin: 0; overflow-wrap: anywhere; }
.eds-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.eds-state { font-size: 12px; color: var(--color-primary, #38b86d); }
.eds-form { display: grid; gap: 20px; margin-top: 26px; }
label { display: grid; gap: 8px; font-size: 13px; }
input, button { font: inherit; color: var(--color-text); border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-background-soft); padding: 10px 12px; min-width: 0; box-sizing: border-box; }
input { width: 100%; } button { cursor: pointer; font-size: 13px; white-space: nowrap; } button:disabled { opacity: .4; cursor: default; }
.company-update, .eds-actions button:first-child { border-color: var(--color-primary, #38b86d); }
.eds-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.company-error { color: #dd6666; margin: 20px 0; } .company-message { margin-top: 20px; font-size: 13px; } .company-loading { margin: 30px 0; }
.company-source { display: inline-block; font-size: 12px; margin-top: 24px; color: var(--color-primary, #38b86d); }
@media (max-width: 760px) { .company-page { padding: 20px 16px; } .company-title-row { flex-direction: column; align-items: flex-start; } .company-page-grid { grid-template-columns: 1fr; } h1 { font-size: 23px; } .company-section { padding: 20px; } dl { grid-template-columns: 120px 1fr; } }
</style>
