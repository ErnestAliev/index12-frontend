<script setup>
import { computed, ref } from 'vue';
import { useMainStore } from '@/stores/mainStore';
const store = useMainStore();
const parent = ref('');
const newName = ref('');
const drafts = ref({});
const error = ref('');
const saving = ref(false);
const rows = computed(() => store.subcategories.filter(item => !parent.value || String(item.parentCategoryId?._id || item.parentCategoryId) === parent.value));
const categoryName = item => store.categories.find(category => String(category._id) === String(item.parentCategoryId?._id || item.parentCategoryId))?.name || 'Без категории';
const canManage = computed(() => store.workspaceRole === 'admin');
const run = async action => { saving.value = true; error.value = ''; try { await action(); } catch (e) { error.value = e.response?.data?.message || e.message; } finally { saving.value = false; } };
const create = () => run(async () => { await store.addSubcategory(newName.value.trim(), parent.value); newName.value = ''; });
</script>
<template>
  <div class="subcategory-manager" data-testid="subcategory-manager">
    <h3>Подкатегории</h3>
    <select v-model="parent" aria-label="Категория подкатегорий"><option value="">Все категории</option><option v-for="category in store.categories" :key="category._id" :value="category._id">{{ category.name }}</option></select>
    <form v-if="store.canEdit" class="create-row" @submit.prevent="create">
      <input v-model="newName" placeholder="Новая подкатегория" aria-label="Новая подкатегория" maxlength="120" />
      <button :disabled="saving || !parent || !newName.trim()">Добавить</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!rows.length">Подкатегорий пока нет</p>
    <div v-for="item in rows" :key="item._id" class="manager-row">
      <span class="parent-name">{{ categoryName(item) }}</span>
      <input :value="drafts[item._id] ?? item.name" :disabled="!canManage || saving" :aria-label="`Подкатегория ${item.name}`" maxlength="120" @input="drafts[item._id] = $event.target.value" />
      <button v-if="canManage" :disabled="saving || !drafts[item._id]?.trim() || drafts[item._id] === item.name" @click="run(() => store.renameSubcategory(item._id, drafts[item._id].trim()))">Сохранить</button>
      <button v-if="canManage" :disabled="saving" :aria-label="`Удалить подкатегорию ${item.name}`" @click="run(() => store.deleteSubcategory(item._id))">Удалить</button>
    </div>
  </div>
</template>
<style scoped>
.subcategory-manager { padding: 16px; color: var(--color-text); min-width: 0; overflow-y: auto; }
h3 { margin: 0 0 16px; }
select, input, button { font: inherit; font-size: 13px; min-height: 38px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-background-soft); color: var(--color-text); padding: 6px 10px; box-sizing: border-box; }
select { width: 100%; margin-bottom: 8px; }
.create-row, .manager-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
input { min-width: 0; flex: 1; }
.parent-name { flex: 1; min-width: 0; font-size: 12px; overflow-wrap: anywhere; }
button { cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
p[role=alert] { color: var(--color-danger); }
@media (max-width: 600px) { .manager-row { flex-wrap: wrap; } .parent-name { flex-basis: 100%; } }
</style>
