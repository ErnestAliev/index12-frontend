<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { businessApi, businessError, legalFields } from '@/services/businessApi';
const props = defineProps({ modelValue: { type: Object, required: true }, autoLookup: { type: Boolean, default: true } });
const emit = defineEmits(['update:modelValue']);
const result = ref(null);
const loading = ref(false);
const error = ref('');
let timer, request, generation = 0;
const update = (field, value) => emit('update:modelValue', { ...props.modelValue, [field]: value });
const apply = (emptyOnly = false) => {
  if (!result.value?.profile) return;
  const value = { ...props.modelValue };
  for (const field of ['name', ...legalFields]) if (!emptyOnly || !value[field]) value[field] = result.value.profile[field] || '';
  emit('update:modelValue', value);
};
async function lookup() {
  const bin = props.modelValue.identificationNumber?.trim();
  if (!/^\d{12}$/.test(bin || '')) return;
  request?.abort(); request = new AbortController();
  const current = ++generation; loading.value = true; error.value = '';
  try {
    const { data } = await businessApi.get(`/registry/${bin}`, { signal: request.signal });
    if (current !== generation) return;
    result.value = data;
    if (!data.profile) error.value = 'Юрлицо с таким БИН не найдено в реестре eGov';
    else apply(true);
  } catch (e) { if (current === generation && e.code !== 'ERR_CANCELED') error.value = businessError(e); }
  finally { if (current === generation) loading.value = false; }
}
watch(() => props.modelValue.identificationNumber, (bin, oldBin) => {
  const previousProfile = result.value?.profile;
  clearTimeout(timer); request?.abort(); ++generation; loading.value = false; result.value = null; error.value = '';
  // A different identifier invalidates all previous imported identity data.
  if (oldBin && oldBin !== bin) {
    const value = { ...props.modelValue };
    for (const field of legalFields.filter(field => field !== 'identificationNumber')) value[field] = '';
    if (previousProfile && value.name === previousProfile.name) value.name = '';
    emit('update:modelValue', value);
  }
  if (props.autoLookup && /^\d{12}$/.test(bin?.trim() || '')) timer = setTimeout(lookup, 650);
});
onBeforeUnmount(() => { clearTimeout(timer); request?.abort(); ++generation; });
const fields = [['legalAddress', 'Юридический адрес'], ['director', 'Руководитель'], ['registrationDate', 'Дата регистрации'], ['activity', 'Вид деятельности'], ['registrationStatus', 'Статус регистрации']];
</script>

<template>
  <div class="registry-fields">
    <label>БИН/ИИН
      <div class="registry-search">
        <input :value="modelValue.identificationNumber || ''" @input="update('identificationNumber', $event.target.value)" inputmode="numeric" maxlength="12" autocomplete="off" aria-label="БИН/ИИН" />
        <button type="button" @click="lookup" :disabled="loading || !/^\d{12}$/.test(modelValue.identificationNumber || '')" title="Официальный реестр юридических лиц eGov. Поиск ИП по ИИН требует отдельного государственного API">{{ loading ? 'Поиск…' : 'Найти в eGov' }}</button>
      </div>
    </label>
    <div v-if="error" role="alert" class="registry-error">{{ error }}</div>
    <div v-if="result?.profile" class="registry-found">
      <strong>{{ result.profile.name }}</strong>
      <a :href="result.source" target="_blank" rel="noopener noreferrer" :title="result.checkedAt">eGov · {{ new Date(result.checkedAt).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }) }}</a>
      <button type="button" @click="apply(false)">Применить реквизиты</button>
    </div>
    <details>
      <summary>Реквизиты</summary>
      <label v-for="[field, label] in fields" :key="field">{{ label }}<input :value="modelValue[field] || ''" @input="update(field, $event.target.value)" :aria-label="label" maxlength="2000" /></label>
    </details>
    <details class="registry-checks">
      <summary>Проверки ограничений · не выполнены</summary>
      <div>Налоговая задолженность: не проверена</div>
      <div>Исполнительные производства и аресты: не проверены</div>
      <div>Судебные дела: не проверены</div>
      <div>Ограничения деятельности: не проверены</div>
      <a href="https://portal.kgd.gov.kz/ru" target="_blank" rel="noopener noreferrer">КГД</a>
      <a href="https://egov.kz/" target="_blank" rel="noopener noreferrer">eGov</a>
    </details>
  </div>
</template>

<style scoped>
.registry-fields { display: grid; gap: 12px; font-size: 13px; }
label { display: grid; gap: 6px; color: var(--color-text); }
input { min-width: 0; width: 100%; box-sizing: border-box; padding: 9px 10px; background: var(--color-background); border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text); font: inherit; }
.registry-search { display: flex; gap: 8px; }
button { flex-shrink: 0; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-background-soft); color: var(--color-text); font: inherit; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.registry-error { color: #dc5d5d; }
.registry-found { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; }
a { color: var(--color-primary, #478ddc); margin-right: 12px; }
summary { cursor: pointer; margin-bottom: 8px; }
details label { margin: 8px 0; }
.registry-checks { color: var(--color-text-soft, var(--color-text)); line-height: 1.7; }
</style>
