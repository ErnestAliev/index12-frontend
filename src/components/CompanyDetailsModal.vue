<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { businessApi, businessError } from '@/services/businessApi';
import { profileFields, profileDraft, profileText, downloadProfile } from '@/utils/companyProfile';

const props = defineProps({ companyId: { type: String, required: true }, workspaceId: { type: String, default: '' }, kind: { type: String, default: 'companies', validator: v => ['companies', 'contractors'].includes(v) }, syncOnOpen: Boolean });
const emit = defineEmits(['close', 'saved']);
const main = useMainStore();
const company = ref(null), draft = ref(profileDraft()), loading = ref(true), busy = ref(false), error = ref(''), message = ref('');
const closeButton = ref(null), showSync = ref(false), search = ref(''), candidates = ref([]), selectedRef = ref(''), nextSkip = ref(null), searching = ref(false);
const previousFocus = document.activeElement;
let generation = 0, controller, searchGeneration = 0;
const title = computed(() => props.kind === 'contractors' ? 'Карточка контрагента' : 'Карточка компании');
const endpoint = () => `/${props.kind}/${props.companyId}`;
const options = () => ({ headers: props.workspaceId ? { 'X-Index12-Workspace-ID': props.workspaceId } : {} });
const dirty = computed(() => company.value && JSON.stringify(draft.value) !== JSON.stringify(profileDraft(company.value)));
const missingLabels = computed(() => (company.value?.onecSync?.missing || []).filter(key => !draft.value[key]).map(key => profileFields.find(([field]) => field === key)?.[1] || key));
const displayCandidates = computed(() => {
  const normalize = value => value.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]/gu, '').replace(/^(тоо|ип)/, '');
  const name = normalize(company.value?.name || '');
  const score = value => { const n = normalize(value); return n === name ? 3 : name && n && (n.includes(name) || name.includes(n)) ? 2 : 0; };
  return [...candidates.value].sort((a, b) => score(b.name) - score(a.name));
});
onMounted(() => closeButton.value?.focus());
function close() { emit('close'); }
function onDialogKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  if (event.key !== 'Tab') return;
  const nodes = [...event.currentTarget.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]')].filter(node => node.getClientRects().length);
  const first = nodes[0], last = nodes.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
function applyCompany(value) {
  const previous = company.value;
  company.value = value; draft.value = profileDraft(value);
  const item = main[props.kind].find(item => String(item._id) === String(value._id));
  if (item) Object.assign(item, value);
  emit('saved', value, previous);
}
async function action(fn) {
  if (busy.value) return;
  const current = generation; busy.value = true; error.value = ''; message.value = '';
  try { await fn(current); } catch (e) { if (current === generation) error.value = businessError(e); }
  finally { if (current === generation) busy.value = false; }
}
async function saveCurrent(current) {
  if (!dirty.value) return;
  const { data } = await businessApi.patch(endpoint(), { changes: draft.value, expectedVersion: company.value.profileVersion || 0 }, options());
  if (current === generation) applyCompany(data.company);
}
const save = () => action(async current => { await saveCurrent(current); if (current === generation) message.value = 'Реквизиты сохранены'; });
async function loadCandidates(append = false) {
  const current = generation, request = ++searchGeneration;
  searching.value = true; error.value = '';
  try {
    const { data } = await businessApi.get(`${endpoint()}/onec-candidates`, { ...options(), params: { search: search.value, skip: append ? nextSkip.value : 0 }, timeout: 90000 });
    if (current !== generation || request !== searchGeneration) return;
    candidates.value = append ? [...candidates.value, ...data.candidates] : data.candidates; nextSkip.value = data.nextSkip;
    if (!candidates.value.some(row => row.ref === selectedRef.value)) selectedRef.value = '';
  } catch (e) { if (current === generation && request === searchGeneration) error.value = businessError(e); }
  finally { if (current === generation && request === searchGeneration) searching.value = false; }
}
async function beginSync() {
  showSync.value = true; selectedRef.value = ''; search.value = ''; await loadCandidates();
}
const sync = () => action(async current => {
  const ref = showSync.value ? selectedRef.value : company.value?.onecSync?.ref;
  if (!ref) return;
  await saveCurrent(current); if (current !== generation) return;
  const { data } = await businessApi.post(`${endpoint()}/sync-onec`, { expectedVersion: company.value.profileVersion || 0, ref }, { ...options(), timeout: 90000 });
  if (current !== generation) return;
  applyCompany(data.company); showSync.value = false; message.value = 'Реквизиты загружены из 1С';
});
const unlink = () => action(async current => {
  await saveCurrent(current); if (current !== generation) return;
  const { data } = await businessApi.post(`${endpoint()}/unlink-onec`, { expectedVersion: company.value.profileVersion || 0 }, options());
  if (current === generation) { applyCompany(data.company); message.value = 'Связь с 1С удалена'; showSync.value = false; }
});
const copy = async () => { try { await navigator.clipboard.writeText(profileText(draft.value)); message.value = 'Реквизиты скопированы'; } catch { error.value = 'Браузер не разрешил копирование'; } };
watch(() => [main.user?.id || main.user?._id, main.user?.currentWorkspaceId, props.companyId, props.workspaceId, props.kind], async ([userId]) => {
  const current = ++generation; ++searchGeneration; controller?.abort(); controller = new AbortController();
  company.value = null; draft.value = profileDraft(); loading.value = true; busy.value = false; error.value = ''; message.value = ''; showSync.value = false; searching.value = false;
  if (!userId) return;
  try {
    const { data } = await businessApi.get(endpoint(), { ...options(), signal: controller.signal });
    if (current !== generation) return;
    company.value = data.company; draft.value = profileDraft(data.company);
    if (props.syncOnOpen) { if (data.company.onecSync?.ref) await sync(); else await beginSync(); }
  } catch (e) { if (current === generation && e.code !== 'ERR_CANCELED') error.value = businessError(e); }
  finally { if (current === generation) loading.value = false; }
}, { immediate: true });
onBeforeUnmount(() => { ++generation; ++searchGeneration; controller?.abort(); if (previousFocus?.isConnected) previousFocus.focus(); });
</script>

<template>
  <Teleport to="body"><div class="company-overlay" @click.self="close"><section class="company-page" role="dialog" aria-modal="true" :aria-label="title" @keydown="onDialogKeydown">
    <header class="company-page-header"><div><span>{{ kind === 'contractors' ? 'Контрагент' : 'Компания' }}</span><h1>{{ company?.name || title }}</h1></div><button ref="closeButton" type="button" class="company-close" :aria-label="`Закрыть ${kind === 'contractors' ? 'карточку контрагента' : 'карточку компании'}`" @click="close">×</button></header>
    <div class="company-body">
      <div v-if="error" class="company-error" role="alert">{{ error }}</div><div v-if="message" class="company-message" role="status">{{ message }}</div>
      <div v-if="loading && !company" role="status">Загрузка…</div>
      <template v-if="company">
        <div class="company-toolbar"><button type="button" :disabled="busy || searching" @click="company.onecSync?.ref ? sync() : beginSync()">{{ busy ? 'Обработка…' : searching ? 'Загрузка списка…' : 'Синхронизировать с 1С' }}</button><button v-if="company.onecSync?.ref" type="button" :disabled="busy || searching" @click="beginSync">Изменить связь</button><button type="button" @click="copy">Копировать реквизиты</button><button type="button" @click="downloadProfile(draft)">Скачать .txt</button><button type="button" @click="downloadProfile(draft, 'json')">Скачать .json</button></div>
        <div class="company-source"><template v-if="company.onecSync?.ref">1С: {{ company.onecSync.name || company.onecSync.ref }}<template v-if="company.onecSync.identificationNumber"> · {{ company.onecSync.identificationNumber }}</template> · {{ new Date(company.onecSync.checkedAt).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }) }}</template><template v-else>С 1С не связано</template><button v-if="company.onecSync?.ref" type="button" :disabled="busy" @click="unlink">Отвязать</button></div>
        <section v-if="showSync" class="company-section sync-selector" aria-label="Выбор записи 1С">
          <h2>{{ kind === 'contractors' ? 'Контрагенты 1С' : 'Организации 1С' }}</h2>
          <form class="sync-search" @submit.prevent="loadCandidates()"><input v-model="search" type="search" aria-label="Поиск по названию в 1С" placeholder="Название в 1С" /><button type="submit" :disabled="searching">Найти</button></form>
          <select v-model="selectedRef" aria-label="Запись из справочника 1С" :disabled="searching || busy"><option value="">Выберите {{ kind === 'contractors' ? 'контрагента' : 'организацию' }}</option><option v-for="item in displayCandidates" :key="item.ref" :value="item.ref">{{ item.name }}{{ item.identificationNumber ? ` · ${item.identificationNumber}` : '' }}</option></select>
          <div class="sync-actions"><button v-if="nextSkip !== null" type="button" :disabled="searching" @click="loadCandidates(true)">Загрузить ещё</button><button type="button" :disabled="!selectedRef || busy || searching" @click="sync">{{ busy ? 'Синхронизация…' : 'Связать и загрузить' }}</button><button type="button" :disabled="busy" @click="showSync = false">Закрыть список</button></div><div v-if="!searching && !candidates.length" role="status">Совпадений в 1С нет</div>
        </section>
        <div v-if="missingLabels.length" class="company-source">В публикации 1С нет данных: {{ missingLabels.join(', ') }}</div>
        <div class="company-page-grid">
          <section class="company-section" aria-label="Реквизиты компании"><h2>Реквизиты</h2><div class="profile-fields"><label v-for="[key, label, type] in profileFields" :key="key" :class="{ wide: ['legalName', 'legalAddress', 'postalAddress', 'activity'].includes(key) }">{{ label }}<input v-model="draft[key]" :aria-label="label" :type="type || 'text'" :disabled="busy" :maxlength="key === 'identificationNumber' ? 12 : 2000" /></label></div></section>
          <div class="company-aside">
            <section class="company-section" aria-label="Банковские реквизиты"><div class="section-heading"><h2>Банковские реквизиты</h2><button type="button" :disabled="busy || draft.bankAccounts.length >= 30" @click="draft.bankAccounts.push({ iban: '', bankName: '', bic: '', currency: '' })">+ Счёт</button></div><div v-for="(bank, index) in draft.bankAccounts" :key="index" class="bank-row"><label>ИИК / IBAN<input v-model="bank.iban" :aria-label="`ИИК / IBAN ${index + 1}`" :disabled="busy" maxlength="300" /></label><label>Банк<input v-model="bank.bankName" :aria-label="`Банк ${index + 1}`" :disabled="busy" maxlength="300" /></label><label>БИК<input v-model="bank.bic" :aria-label="`БИК ${index + 1}`" :disabled="busy" maxlength="300" /></label><label>Валюта<input v-model="bank.currency" :aria-label="`Валюта ${index + 1}`" :disabled="busy" maxlength="300" /></label><button type="button" :disabled="busy" :aria-label="`Удалить банковские реквизиты ${index + 1}`" @click="draft.bankAccounts.splice(index, 1)">Удалить</button></div></section>
            <section class="company-section" aria-label="Документы и внешние ссылки"><div class="section-heading"><h2>Документы и ссылки</h2><button type="button" :disabled="busy || draft.externalLinks.length >= 30" @click="draft.externalLinks.push({ title: '', url: '', purpose: 'documents' })">+ Ссылка</button></div><div v-for="(link, index) in draft.externalLinks" :key="index" class="link-row"><label>Название<input v-model="link.title" :aria-label="`Название ссылки ${index + 1}`" :disabled="busy" maxlength="300" /></label><label>Ссылка<input v-model="link.url" type="url" :aria-label="`Внешняя ссылка ${index + 1}`" :disabled="busy" maxlength="2000" placeholder="https://drive.google.com/…" /></label><select v-model="link.purpose" :aria-label="`Назначение ссылки ${index + 1}`" :disabled="busy"><option value="documents">Документы компании</option><option value="reports">Папка отчётов</option><option value="other">Другое</option></select><div class="link-actions"><a v-if="/^https:\/\//i.test(link.url)" :href="link.url" target="_blank" rel="noopener noreferrer">Открыть</a><button type="button" :disabled="busy" :aria-label="`Удалить ссылку ${index + 1}`" @click="draft.externalLinks.splice(index, 1)">Удалить</button></div></div></section>
            <section class="company-section"><h2>Примечания</h2><textarea v-model="draft.notes" aria-label="Примечания" :disabled="busy" maxlength="10000" rows="5" /></section>
          </div>
        </div>
      </template>
    </div>
    <footer class="company-footer"><span>{{ dirty ? 'Есть несохранённые изменения' : '' }}</span><button type="button" :disabled="busy || !company || !dirty || !draft.name.trim()" @click="save">{{ busy ? 'Обработка…' : 'Сохранить' }}</button><button type="button" :disabled="busy" @click="close">Закрыть</button></footer>
  </section></div></Teleport>
</template>

<style scoped>
.company-overlay { position: fixed; inset: 0; z-index: 5000; display: grid; place-items: center; padding: 12px; background: #0009; }
.company-page { box-sizing: border-box; display: flex; flex-direction: column; width: min(1680px, 98vw); height: 94dvh; background: var(--color-background); color: var(--color-text); border: 1px solid var(--color-border); border-radius: 12px; box-shadow: 0 20px 70px #0006; overflow: hidden; }
.company-page-header { display: flex; justify-content: space-between; gap: 20px; padding: 20px 28px; border-bottom: 1px solid var(--color-border); align-items: center; }
.company-page-header span, .company-source { font-size: 12px; opacity: .7; }
h1 { margin: 6px 0 0; font-size: 25px; font-weight: 600; overflow-wrap: anywhere; } h2 { margin: 0; font-size: 16px; font-weight: 600; }
.company-close { font-size: 28px; padding: 0 8px; border: 0; background: transparent; }
.company-body { padding: 20px 28px; overflow-y: auto; flex: 1; }
.company-toolbar, .section-heading, .sync-actions, .sync-search, .link-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.company-toolbar { margin-bottom: 16px; }.company-source { margin-bottom: 14px; }.company-source button { margin-left: 12px; padding: 4px 8px; }
.company-page-grid { display: grid; grid-template-columns: 1.15fr 1fr; gap: 20px; align-items: start; }
.company-section { padding: 22px; border: 1px solid var(--color-border); border-radius: 10px; min-width: 0; }
.profile-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 24px; }.wide { grid-column: 1 / -1; }
.company-aside { display: grid; gap: 20px; }.section-heading { justify-content: space-between; }.bank-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--color-border); }.bank-row label:nth-child(-n+2) { grid-column: 1 / -1; }.bank-row button { justify-self: start; }
.link-row { display: grid; gap: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--color-border); }.link-actions { justify-content: space-between; }
label { display: grid; gap: 8px; font-size: 13px; } input, textarea, select, button { font: inherit; color: var(--color-text); border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-background-soft); padding: 10px 12px; min-width: 0; box-sizing: border-box; }
input, textarea, select { width: 100%; font-size: 14px; } textarea { resize: vertical; margin-top: 16px; } button { cursor: pointer; font-size: 13px; } button:disabled { opacity: .4; cursor: default; } a { color: var(--color-primary, #38b86d); }
.company-footer { display: flex; align-items: center; gap: 12px; padding: 16px 28px; border-top: 1px solid var(--color-border); }.company-footer span { margin-right: auto; font-size: 12px; }.company-footer button:nth-last-child(2), .company-toolbar button:first-child { border-color: var(--color-primary, #38b86d); }
.company-error { color: #dd6666; margin-bottom: 16px; }.company-message { margin-bottom: 16px; font-size: 13px; }.sync-selector { margin-bottom: 20px; }.sync-search { margin: 16px 0; flex-wrap: nowrap; }.sync-actions { margin-top: 12px; }
@media(max-width: 850px) { .company-overlay { padding: 4px; }.company-page { width: 100%; height: 98dvh; }.company-page-header, .company-body { padding: 16px; }.company-footer { padding: 12px 16px; }.company-page-grid { grid-template-columns: 1fr; }.company-section { padding: 16px; } }
@media(max-width: 480px) { .profile-fields { grid-template-columns: 1fr; }.wide { grid-column: auto; } h1 { font-size: 21px; } }
</style>
