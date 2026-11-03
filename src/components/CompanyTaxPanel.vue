<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { useBusinessStore } from '@/stores/businessStore';
import { businessApi, businessError, legalFields } from '@/services/businessApi';
import RegistryFields from './RegistryFields.vue';
import CreateEntityModal from './CreateEntityModal.vue';
const mainStore = useMainStore();
const business = useBusinessStore();
const selected = ref('');
const form = ref({});
const token = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');
const showCreate = ref(false);
const ncaStatus = ref('');
const connection = computed(() => business.status?.connections?.find(row => row.companyId === selected.value));
watch(() => mainStore.companies.map(company => company._id), ids => { if (!ids.includes(selected.value)) selected.value = ids[0] || ''; }, { immediate: true });
watch(selected, id => { form.value = { ...mainStore.companies.find(company => company._id === id) }; token.value = ''; error.value = ''; message.value = ''; }, { immediate: true });
onMounted(() => business.refresh());
async function action(fn) {
  if (busy.value) return;
  busy.value = true; error.value = ''; message.value = '';
  try { await fn(); } catch (e) { error.value = businessError(e); } finally { busy.value = false; }
}
const save = () => action(async () => {
  if (!form.value.name?.trim()) { error.value = 'Укажите название компании'; return; }
  if (form.value.identificationNumber && !/^\d{12}$/.test(form.value.identificationNumber)) { error.value = 'БИН/ИИН должен содержать 12 цифр'; return; }
  const data = { _id: selected.value, name: form.value.name.trim() };
  for (const field of legalFields) data[field] = form.value[field] || null;
  await mainStore.batchUpdateEntities('companies', [data]); message.value = 'Реквизиты сохранены';
});
const connect = () => action(async () => {
  const stored = mainStore.companies.find(company => company._id === selected.value);
  if (stored?.identificationNumber !== form.value.identificationNumber) { error.value = 'Сначала сохраните БИН/ИИН компании'; return; }
  await businessApi.put(`/companies/${selected.value}/connection`, { personalAccountToken: token.value });
  token.value = ''; await business.refresh();
});
const disconnect = () => action(async () => { await businessApi.delete(`/companies/${selected.value}/connection`); await business.refresh(); });
const syncCompany = () => action(async () => { const { data } = await businessApi.post(`/companies/${selected.value}/sync`); message.value = data.message; await business.refresh(); });
function checkNca() {
  ncaStatus.value = 'Подключение…';
  let socket, timeout;
  const finish = text => { clearTimeout(timeout); ncaStatus.value = text; socket?.close(); };
  try {
    socket = new WebSocket('wss://127.0.0.1:13579/');
    timeout = setTimeout(() => finish('NCALayer не отвечает'), 5000);
    socket.onopen = () => finish('NCALayer доступен');
    socket.onerror = () => finish('NCALayer недоступен');
  } catch { finish('NCALayer недоступен'); }
}
const stateLabel = value => ({ pending: 'Ожидает проверки', syncing: 'Проверка…', connected: 'Доступ подтверждён', error: 'Ошибка проверки' })[value] || 'Не подключено';
</script>

<template>
  <section class="company-tax-panel" aria-label="Компании и КГД">
    <div class="company-toolbar">
      <select v-model="selected" aria-label="Компания" :disabled="busy"><option v-if="!mainStore.companies.length" value="">Нет компаний</option><option v-for="company in mainStore.companies" :key="company._id" :value="company._id">{{ company.name }}</option></select>
      <button type="button" @click="showCreate = true">+ Компания</button>
    </div>
    <div v-if="selected" class="company-columns">
      <form @submit.prevent="save" class="company-card">
        <h3>Реквизиты компании</h3>
        <label>Название<input v-model="form.name" aria-label="Название компании" maxlength="300" /></label>
        <RegistryFields v-model="form" />
        <button :disabled="busy" type="submit">Сохранить реквизиты</button>
      </form>
      <div class="company-card">
        <h3>КГД · задолженность</h3>
        <div class="connection-state">{{ stateLabel(connection?.status) }}</div>
        <div v-if="connection?.bin && connection.bin !== form.identificationNumber" role="alert" class="error">БИН/ИИН изменён. Подключите КГД заново</div>
        <div v-if="connection?.lastSuccessAt">Проверено: {{ new Date(connection.lastSuccessAt).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }) }}</div>
        <div v-if="connection?.error" role="alert" class="error">{{ connection.error }}</div>
        <div v-if="connection?.snapshot && connection.bin === form.identificationNumber" class="tax-total">{{ connection.snapshot.totalArrear }} ₸<span>Задолженность по ответу КГД</span></div>
        <a v-if="connection?.snapshot && connection.bin === form.identificationNumber" :href="connection.snapshot.source" target="_blank" rel="noopener noreferrer">Источник: API КГД</a>
        <div class="company-actions"><button type="button" @click="syncCompany" :disabled="busy || !connection">Проверить</button><button v-if="connection" type="button" @click="disconnect" :disabled="busy">Отключить</button></div>
        <details>
          <summary>Подключение API КГД</summary>
          <form @submit.prevent="connect" class="token-form">
            <div v-if="business.status && !business.status.taxConfigured" class="error" role="status">Серверный доступ к API КГД ещё не настроен</div>
            <label>Токен лицевого счёта<input v-model="token" type="password" autocomplete="off" aria-label="Токен лицевого счёта" maxlength="4096" /></label>
            <button type="submit" :disabled="busy || !token || !business.status?.taxConfigured">Подключить</button>
            <a href="https://portal.kgd.gov.kz/ru/pages/api-services/info-absence-tax-debt" target="_blank" rel="noopener noreferrer">Получить доступ в КГД</a>
          </form>
        </details>
        <details>
          <summary>ЭЦП и налоговый кабинет</summary>
          <div class="connection-state">Авторизация ИСНА: не подключена</div>
          <div>Уведомления и отчётность: не подключены</div>
          <div class="company-actions"><button type="button" @click="checkNca">Проверить NCALayer</button><a href="https://ncl.pki.gov.kz/" target="_blank" rel="noopener noreferrer">NCALayer</a></div>
          <div v-if="ncaStatus" role="status">{{ ncaStatus }}</div>
        </details>
      </div>
    </div>
    <div v-if="error || business.error" role="alert" class="error">{{ error || business.error }}</div>
    <div v-if="message" role="status">{{ message }}</div>
    <CreateEntityModal v-if="showCreate" entity-type="companies" @close="showCreate = false" @created="company => selected = company._id" />
  </section>
</template>

<style scoped>
.company-tax-panel { padding: 20px 24px; flex: 1; min-height: 0; overflow-y: auto; color: var(--color-text); }
.company-toolbar, .company-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.company-toolbar { margin-bottom: 20px; }
.company-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.company-card { display: flex; flex-direction: column; align-items: stretch; gap: 16px; border: 1px solid var(--color-border); border-radius: 10px; padding: 20px; min-width: 0; }
h3 { margin: 0; font-size: 16px; }
label, .token-form { display: grid; gap: 8px; }
input, select, button { font: inherit; padding: 9px 12px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-background-soft); color: var(--color-text); min-width: 0; box-sizing: border-box; }
select { flex: 1; }
button, summary { cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
summary { margin-bottom: 10px; }
.error { color: #dc5d5d; }
a { color: var(--color-primary, #478ddc); font-size: 13px; }
.tax-total { font-size: 26px; font-variant-numeric: tabular-nums; }
.tax-total span { display: block; font-size: 12px; margin-top: 4px; }
.connection-state { font-weight: 600; }
@media (max-width: 700px) { .company-columns { grid-template-columns: 1fr; } .company-tax-panel { padding: 16px; } }
</style>
