<script setup>
import { computed, ref } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { usePermissions } from '@/composables/usePermissions';
import { getAccountOwnerKey, isValidOwnerKey } from '@/utils/accountOwnership.js';
import BaseSelect from './BaseSelect.vue';
import InfoModal from './InfoModal.vue';

const props = defineProps({ items: { type: Array, required: true } });
const emit = defineEmits(['close', 'saved']);
const store = useMainStore();
const permissions = usePermissions();
const rows = ref(props.items.map(item => {
  const account = store.accounts.find(a => a._id === item.accountId);
  return { ...item,
    ownerKey: getAccountOwnerKey(account, store.companies, store.individuals) ||
      (isValidOwnerKey(item.ownerKey, store.companies, store.individuals) ? item.ownerKey : null),
    creating: null, name: '',
  };
}));
const busy = ref(false);
const error = ref('');
const accountOptions = computed(() => [
  ...store.accounts.filter(a => permissions.canAccessAccount(a._id)).map(a => ({ value: a._id, label: a.name })),
  ...(permissions.isAdmin.value ? [{ isActionRow: true }] : []),
]);
const ownerOptions = computed(() => [
  { label: 'Компании', isHeader: true },
  ...store.companies.map(c => ({ value: `company-${c._id}`, label: c.name })),
  { label: 'Физлица', isHeader: true },
  ...store.individuals.filter(i => !['розничные клиенты', 'розница'].includes(i.name.trim().toLowerCase()))
    .map(i => ({ value: `individual-${i._id}`, label: i.name })),
  { isActionRow: true },
]);
function selectAccount(row, id) {
  row.ownerKey = getAccountOwnerKey(store.accounts.find(a => a._id === id), store.companies, store.individuals);
}
function startCreate(row, type) {
  row.creating = type;
  row.name = '';
  error.value = '';
}
async function createItem(row) {
  if (busy.value || !row.name.trim()) return;
  busy.value = true;
  error.value = '';
  try {
    const type = row.creating;
    if (type === 'account' || type === 'cash') {
      const item = await store.addAccount({ name: row.name.trim(), isCashRegister: type === 'cash' });
      row.accountId = item._id;
    } else {
      const item = await (type === 'company' ? store.addCompany : store.addIndividual)(row.name.trim());
      row.ownerKey = `${type}-${item._id}`;
    }
    row.creating = null;
    row.name = '';
  } catch (e) {
    error.value = e.response?.data?.message || e.message;
  } finally { busy.value = false; }
}
async function save() {
  if (busy.value) return;
  error.value = '';
  if (rows.value.some(row => row.creating)) { error.value = 'Завершите создание или отмените его.'; return; }
  busy.value = true;
  try {
    const links = rows.value.map(({ key, accountId, ownerKey }) => ({ key, accountId, ownerKey }));
    await store.saveAccountOwners(links);
    emit('saved', links);
  } catch (e) {
    error.value = e.response?.data?.message || e.message;
  } finally { busy.value = false; }
}
</script>

<template>
  <InfoModal title="Внимание" message="Нарушена связь счёта с владельцем. Укажите счёт и владельца." :busy="busy" @close="emit('close')">
    <div class="repair-fields">
      <section v-for="row in rows" :key="row.key" class="repair-route">
        <h4 v-if="rows.length > 1 || row.key !== 'account'">{{ row.label }}</h4>
        <BaseSelect v-model="row.accountId" :options="accountOptions" label="Счёт" placeholder="Выберите счёт" :disabled="busy" @change="selectAccount(row, $event)">
          <template #action-item>
            <div class="create-actions">
              <button type="button" @click="startCreate(row, 'account')">Создать счёт</button>
              <button type="button" @click="startCreate(row, 'cash')">Создать кассу</button>
            </div>
          </template>
        </BaseSelect>
        <BaseSelect v-model="row.ownerKey" :options="ownerOptions" label="Владелец счёта" placeholder="Выберите владельца" :disabled="busy">
          <template #action-item>
            <div class="create-actions">
              <button type="button" @click="startCreate(row, 'company')">Создать компанию</button>
              <button type="button" @click="startCreate(row, 'individual')">Создать физлицо</button>
            </div>
          </template>
        </BaseSelect>
        <form v-if="row.creating" class="inline-create" @submit.prevent="createItem(row)">
          <input v-model="row.name" :aria-label="row.creating === 'company' ? 'Название компании' : row.creating === 'individual' ? 'Имя физлица' : 'Название счёта'" :placeholder="row.creating === 'company' ? 'Название компании' : row.creating === 'individual' ? 'Имя физлица' : 'Название счёта'" :disabled="busy" autofocus />
          <button type="submit" :disabled="busy" aria-label="Создать">✓</button>
          <button type="button" :disabled="busy" aria-label="Отмена создания" @click="row.creating = null">✕</button>
        </form>
      </section>
      <p v-if="error" class="repair-error" role="alert">{{ error }}</p>
    </div>
    <template #actions>
      <div class="repair-actions">
        <button type="button" class="save-link" :disabled="busy" @click="save">{{ busy ? 'Сохранение…' : 'Сохранить привязку' }}</button>
        <button type="button" class="cancel-link" :disabled="busy" @click="emit('close')">Отмена</button>
      </div>
    </template>
  </InfoModal>
</template>

<style scoped>
.repair-fields { text-align: left; --focus-color: #34c759; }
.repair-route { display: grid; gap: 10px; margin-bottom: 16px; min-width: 0; }
h4 { margin: 0; color: #fff; font-size: 14px; }
.create-actions, .inline-create { display: flex; gap: 6px; }
.create-actions button { flex: 1; padding: 10px 4px; background: #fff; border: 0; color: #222; cursor: pointer; font-size: 12px; }
.inline-create input { min-width: 0; flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 8px; }
.inline-create button { width: 34px; border: 0; border-radius: 8px; cursor: pointer; }
.repair-error { color: #ff9b93; font-size: 13px; margin: 0 0 16px; }
.repair-actions { display: grid; width: 100%; gap: 8px; }
.repair-actions button { min-height: 44px; padding: 10px; border: 0; border-radius: 10px; font: inherit; font-weight: 600; cursor: pointer; }
.save-link { background: #34c759; color: #fff; }
.cancel-link { background: transparent; color: #ccc; }
button:disabled { opacity: .6; cursor: wait; }
</style>
