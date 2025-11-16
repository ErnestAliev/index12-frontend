<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v2.6-SUBTITLE-SPLIT ---
 * * (с доработками для прогноза v1.0)
 * *
 * * ЧТО ДОБАВЛЕНО (Прогноз v1.0):
 * 1. Добавлен helper `mergeBalances` для слияния текущих и будущих балансов.
 * 2. `loggedAccountBalances` теперь возвращает *слияние*
 * `currentAccountBalances` и `futureAccountBalances`.
 * 3. Добавлены новые computed (`mergedCompanyBalances` и т.д.) для
 * других карточек, которые также возвращают слияние.
 * 4. Карточки в `<template>` теперь получают :items с этими слияниями.
 *
 * --- 🔴 ИСПРАВЛЕНИЕ (17.11.2025) ---
 * 1. (FIX #16) `futureUntilStr` теперь проверяет `!isNaN(d.getTime())`
 * для предотвращения `RangeError: Invalid time value`.
 */

// --- !!! ВАША МЕТКА !!! ---
console.log('--- TheHeader.vue v2.6 (Fix #16) ЗАГРУЖЕН ---');


// Карточки
import HeaderTotalCard from './HeaderTotalCard.vue';
import HeaderBalanceCard from './HeaderBalanceCard.vue';
import HeaderCategoryCard from './HeaderCategoryCard.vue';

// Попапы
import EntityPopup from './EntityPopup.vue';
import EntityListEditor from './EntityListEditor.vue';

const mainStore = useMainStore();

/* ======================= Даты (из v2.1) ======================= */
const ruShort = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const todayStr = computed(() => {
  console.log('[TheHeader.vue] computed: todayStr');
  return ruShort.format(new Date());
});

const futureUntilStr = computed(() => {
  console.log('[TheHeader.vue] computed: futureUntilStr (ВЫЧИСЛЕНИЕ)');
  const d = mainStore.projection?.rangeEndDate
    ? new Date(mainStore.projection.rangeEndDate)
    : null;
  
  // 🔴 ИСПРАВЛЕНИЕ (FIX #16): Проверяем, что 'd' - это валидная дата
  // `new Date(undefined)` или `new Date("invalid")` вернет "Invalid Date"
  // `getTime()` у "Invalid Date" вернет NaN.
  if (d && !isNaN(d.getTime())) {
    console.log('[TheHeader.vue] computed: futureUntilStr (РЕЗУЛЬТАТ: ФОРМАТИРОВАННАЯ ДАТА)');
    return ruShort.format(d);
  }
  
  console.warn(`[TheHeader.vue] computed: futureUntilStr (ВНИМАНИЕ: Дата проекции невалидна, использую todayStr)`);
  return todayStr.value;
});


// --- !!! УЛУЧШЕННЫЕ ЛОГИ (по вашему запросу) !!! ---

// "Всего (на тек. момент)"
const loggedCurrentTotal = computed(() => {
  const balance = mainStore.currentTotalBalance;
  console.log(`[TheHeader.vue] computed: 📊 'Всего (на тек. момент)' = ${balance} (на ${todayStr.value})`);
  return balance;
});

// "Всего (с уч. будущих)"
const loggedFutureTotal = computed(() => {
  const balance = mainStore.futureTotalBalance;
  console.log(`[TheHeader.vue] computed: 📈 'Всего (с уч. будущих)' = ${balance} (до ${futureUntilStr.value})`);
  return balance;
});

// 🔴 НОВОЕ: Helper для слияния
const mergeBalances = (currentBalances, futureBalances) => {
  // console.log('[TheHeader.vue] mergeBalances: Слияние балансов...');
  if (!currentBalances || !futureBalances) {
    console.warn('[TheHeader.vue] mergeBalances: Отсутствуют current или future балансы');
    return currentBalances || []; // Возвращаем хотя бы текущие
  }

  const futureMap = new Map(futureBalances.map(item => [item._id, item.balance]));
  
  return currentBalances.map(item => ({
    ...item,
    // item.balance - это текущий баланс
    futureBalance: futureMap.get(item._id) ?? item.balance // По умолчанию = текущий
  }));
};

// "Мои счета"
const loggedAccountBalances = computed(() => {
  const balances = mainStore.currentAccountBalances; // Текущие
  // Считаем ОБЩУЮ сумму по всем счетам для лога
  const total = balances.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  console.log(`[TheHeader.vue] computed: 💳 'Мои счета' ОБНОВЛЕНЫ. Сумма: ${total} (${balances.length} счетов)`);
  
  // 🔴 НОВОЕ: Возвращаем СЛИЯННЫЕ данные
  return mergeBalances(balances, mainStore.futureAccountBalances);
});

// 🔴 НОВОЕ: Computeds для остальных (они не логировались, поэтому создаем новые)
const mergedCompanyBalances = computed(() => {
  console.log(`[TheHeader.vue] computed: 🏢 'Мои компании' ОБНОВЛЕНЫ.`);
  return mergeBalances(mainStore.currentCompanyBalances, mainStore.futureCompanyBalances)
});
const mergedContractorBalances = computed(() => {
  console.log(`[TheHeader.vue] computed: 👥 'Мои контрагенты' ОБНОВЛЕНЫ.`);
  return mergeBalances(mainStore.currentContractorBalances, mainStore.futureContractorBalances)
});
const mergedProjectBalances = computed(() => {
  console.log(`[TheHeader.vue] computed: 🏗️ 'Мои проекты' ОБНОВЛЕНЫ.`);
  return mergeBalances(mainStore.currentProjectBalances, mainStore.futureProjectBalances)
});
// --- КОНЕЦ НОВОГО ---


/* ======================= Попап «Добавить» ======================= */
const isEntityPopupVisible = ref(false);
const popupTitle = ref('');
const saveHandler = ref(null);

const openAddPopup = (title, storeAction) => {
  console.log(`[TheHeader.vue] openAddPopup: Открываю попап '${title}'`);
  popupTitle.value = title;
  saveHandler.value = storeAction;
  isEntityPopupVisible.value = true;
};

const onEntitySave = async (name) => {
  console.log(`[TheHeader.vue] onEntitySave: Сохраняю '${popupTitle.value}' с именем '${name}'`);
  if (saveHandler.value) {
    try {
      await saveHandler.value(name);
    } catch (e) {
      console.error(`[TheHeader.vue] onEntitySave: ❌ Ошибка при сохранении '${name}'`, e);
    }
  }
  isEntityPopupVisible.value = false;
};

/* ======================= Попап «Редактировать список» ======================= */
const isListEditorVisible = ref(false);
const editorTitle = ref('');
const editorItems = ref([]);
const editorSavePath = ref(null);

const openEditPopup = (title, items, path) => {
  console.log(`[TheHeader.vue] openEditPopup: Открываю редактор '${title}'`);
  editorTitle.value = title;
  editorItems.value = JSON.parse(JSON.stringify(items));
  editorSavePath.value = path;
  isListEditorVisible.value = true;
};

const onEntityListSave = async (updatedItems) => {
  console.log(`[TheHeader.vue] onEntityListSave: Сохраняю '${editorTitle.value}' (${updatedItems.length} шт.)`);
  if (editorSavePath.value) {
    try {
      await mainStore.batchUpdateEntities(editorSavePath.value, updatedItems);
    } catch (e) {
      console.error(`[TheHeader.vue] onEntityListSave: ❌ Ошибка при сохранении '${editorSavePath.value}'`, e);
    }
  }
  isListEditorVisible.value = false;
};

/* ======================= Виджеты ======================= */
const getWidgetByKey = (key) => mainStore.allWidgets.find(w => w.key === key);
</script>

<template>
  <div class="header-dashboard">
    <template v-for="(widgetKey, index) in mainStore.dashboardLayout" :key="index">
      
      <HeaderTotalCard
        v-if="widgetKey === 'currentTotal'"
        title="Всего (на тек. момент)"
        :totalBalance="loggedCurrentTotal" 
        :subtitlePrefix="`Всего на ${mainStore.currentAccountBalances.length} счетах`"
        :subtitleDate="`до ${todayStr}`"
        :widgetKey="widgetKey"
        :widgetIndex="index"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'accounts'"
        title="Мои счета"
        :items="loggedAccountBalances" 
        emptyText="...счетов нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новый счет', mainStore.addAccount)"
        @edit="openEditPopup('Редактировать счета', mainStore.currentAccountBalances, 'accounts')"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'companies'"
        title="Мои компании"
        :items="mergedCompanyBalances" emptyText="...компаний нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новая компания', mainStore.addCompany)"
        @edit="openEditPopup('Редактировать компании', mainStore.currentCompanyBalances, 'companies')"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'contractors'"
        title="Мои контрагенты"
        :items="mergedContractorBalances" emptyText="...контрагентов нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новый контрагент', mainStore.addContractor)"
        @edit="openEditPopup('Редактировать контрагентов', mainStore.currentContractorBalances, 'contractors')"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'projects'"
        title="Мои проекты"
        :items="mergedProjectBalances" emptyText="...проектов нет..."
        :widgetKey="widgetKey"
        :widgetIndex="index"
        @add="openAddPopup('Новый проект', mainStore.addProject)"
        @edit="openEditPopup('Редактировать проекты', mainStore.currentProjectBalances, 'projects')"
      />

      <HeaderTotalCard
        v-else-if="widgetKey === 'futureTotal'"
        title="Всего (с уч. будущих)"
        :totalBalance="loggedFutureTotal" 
        :subtitlePrefix="`Всего на ${mainStore.accounts.length} счетах`"
        :subtitleDate="`до ${futureUntilStr}`"
        :widgetKey="widgetKey"
        :widgetIndex="index"
      />

      <HeaderCategoryCard
        v-else-if="widgetKey.startsWith('cat_')"
        :title="getWidgetByKey(widgetKey)?.name || '...'"
        :widgetKey="widgetKey"
        :widgetIndex="index"
      />
    </template>
  </div>

  <EntityPopup
    v-if="isEntityPopupVisible"
    :title="popupTitle"
    @close="isEntityPopupVisible = false"
    @save="onEntitySave"
  />
  <EntityListEditor
    v-if="isListEditorVisible"
    :title="editorTitle"
    :items="editorItems"
    @close="isListEditorVisible = false"
    @save="onEntityListSave"
  />
</template>

<style scoped>
/* --- 🔴 ИСПРАВЛЕНИЕ v4.1: Хедер теперь гибкий --- */
.header-dashboard {
  display: flex;
  justify-content: space-between;
  background-color: var(--color-background-soft);
  padding: 1rem 1.5rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  margin-bottom: 0.4rem;
  gap: 1.5rem;
  
  /* 🔴 НОВОЕ: Растягиваемся на всю высоту родителя */
  height: 100%;
  box-sizing: border-box;
  /* 🔴 НОВОЕ: Нужно для flex-детей (карточек) */
  min-height: 0; 
  
  /* 🔴 НОВОЕ (v4.2): Растягиваемся на 100% ширины */
  width: 100%;
}

/* === 🟢 НАЧАЛО ИЗМЕНЕНИЙ (ШРИФТЫ ДЛЯ ПЛАНШЕТА) === */
@media (max-height: 900px) {
  .header-dashboard {
    /* Уменьшаем зазоры и отступы */
    gap: 1rem;
    padding: 0.8rem 1rem;
  }
}
/* === 🟢 КОНЕЦ ИЗМЕНЕНИЙ === */
</style>
