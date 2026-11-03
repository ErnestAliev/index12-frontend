<script setup>
import { computed, ref } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { businessError } from '@/services/businessApi';
const props = defineProps({ modelValue: { type: Object, default: null }, fallbackName: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);
const main = useMainStore();
const open = ref(false), query = ref(''), kind = ref('contractors'), busy = ref(false), error = ref('');
const groups = [{ kind: 'companies', label: 'Мои компании' }, { kind: 'contractors', label: 'Контрагенты' }, { kind: 'individuals', label: 'Физические лица' }];
const selected = computed(() => props.modelValue && (main[props.modelValue.kind] || []).find(row => row._id === props.modelValue.id));
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
const options = computed(() => groups.map(group => ({ ...group, rows: (main[group.kind] || []).filter(row => normalize(`${row.name} ${row.legalName || ''}`).includes(normalize(query.value))) })));
function choose(value) { emit('update:modelValue', value); open.value = false; query.value = ''; error.value = ''; }
async function create() {
  if (!query.value.trim() || busy.value) return;
  const existing = (main[kind.value] || []).find(row => normalize(row.name) === normalize(query.value.trim()));
  if (existing) return choose({ kind: kind.value, id: existing._id });
  busy.value = true; error.value = '';
  try { const fn = { companies: main.addCompany, contractors: main.addContractor, individuals: main.addIndividual }[kind.value]; const row = await fn({ name: query.value.trim() }); choose({ kind: kind.value, id: row._id }); }
  catch (e) { error.value = businessError(e); } finally { busy.value = false; }
}
</script>
<template>
  <div class="party-picker" @keydown.esc.stop="open = false">
    <div class="party-chip-line"><button type="button" class="party-trigger" aria-label="Контрагент задачи" :aria-expanded="open" @click="open = !open"><span>{{ selected?.name || (modelValue && fallbackName) || 'Выбрать контрагента' }}</span><span aria-hidden="true">⌄</span></button><button v-if="modelValue" type="button" class="party-clear" aria-label="Убрать контрагента" @click="choose(null)">×</button></div>
    <div v-if="open" class="party-menu">
      <input v-model="query" type="search" aria-label="Поиск контрагента задачи" placeholder="Название или часть названия" @keydown.enter.prevent="create" />
      <div class="party-options" role="listbox" aria-label="Контрагенты задачи">
        <section v-for="group in options" :key="group.kind"><h4>{{ group.label }}</h4><button v-for="row in group.rows" :key="row._id" type="button" role="option" :aria-selected="modelValue?.id === row._id && modelValue?.kind === group.kind" @click="choose({ kind: group.kind, id: row._id })">{{ row.name }}</button></section>
      </div>
      <div v-if="query.trim()" class="party-create"><select v-model="kind" aria-label="Тип нового контрагента"><option value="contractors">Контрагент</option><option value="companies">Моя компания</option><option value="individuals">Физическое лицо</option></select><button type="button" :disabled="busy" @click="create">+ Создать</button></div>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>
<style scoped>
.party-picker{position:relative;min-width:0}.party-chip-line{display:flex;gap:4px}.party-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:1;text-align:left;min-width:0}.party-trigger span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.party-picker button,.party-picker input,.party-picker select{font:inherit;color:inherit;background:var(--color-background-soft);border:1px solid var(--color-border);border-radius:6px;padding:8px;min-width:0}.party-picker button{cursor:pointer}.party-clear{width:32px}.party-menu{margin-top:8px;padding:8px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-background)}.party-menu input{width:100%}.party-options{max-height:180px;overflow:auto}.party-options h4{margin:12px 4px 4px;font-size:11px;font-weight:500;opacity:.55}.party-options button{display:block;width:100%;border:0;background:transparent;text-align:left;overflow-wrap:anywhere}.party-options button:hover{background:var(--color-background-soft)}.party-create{display:flex;gap:8px;border-top:1px solid var(--color-border);padding-top:8px;margin-top:8px}.party-create select{flex:1}.party-menu p{font-size:12px;color:#e48b86;margin:8px 0}
</style>
