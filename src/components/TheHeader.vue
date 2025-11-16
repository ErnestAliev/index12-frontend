<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'; 
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v6.5-HEADER-1400 ---
 * * ВЕРСИЯ: 6.5 - Адаптация для iPad Pro (1400px)
 * ДАТА: 2025-11-16
 *
 * ЧТО ИЗМЕНЕНО:
 * 1. Порог `isTablet` увеличен до 1400px. Это включает iPad Pro 12.9"
 * и небольшие ноутбуки.
 * 2. При ширине < 1400px дата будет отображаться в формате "16.11.25".
 */

console.log('--- TheHeader.vue v6.5-HEADER-1400 ЗАГРУЖЕН ---');

// Карточки
import HeaderTotalCard from './HeaderTotalCard.vue';
import HeaderBalanceCard from './HeaderBalanceCard.vue';
import HeaderCategoryCard from './HeaderCategoryCard.vue';

// Попапы
import EntityPopup from './EntityPopup.vue';
import EntityListEditor from './EntityListEditor.vue';

const mainStore = useMainStore();

/* ======================= Адаптивность Дат ======================= */
const windowWidth = ref(window.innerWidth);
const updateWidth = () => { windowWidth.value = window.innerWidth; };

onMounted(() => window.addEventListener('resize', updateWidth));
onUnmounted(() => window.removeEventListener('resize', updateWidth));

// 🔴 ИЗМЕНЕНО: Порог увеличен до 1400px (по запросу)
const isTablet = computed(() => windowWidth.value < 1400);

// Форматтеры
const ruShort = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}); // 16 нояб. 2025

const ruSuperShort = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
}); // 16.11.25

const todayStr = computed(() => {
  const d = new Date();
  // Если планшет (<1400), используем супер-короткий формат
  return isTablet.value ? ruSuperShort.format(d) : ruShort.format(d);
});

const futureUntilStr = computed(() => {
  const d = mainStore.projection?.rangeEndDate
    ? new Date(mainStore.projection.rangeEndDate)
    : null;
  
  if (d && !isNaN(d.getTime())) {
    return isTablet.value ? ruSuperShort.format(d) : ruShort.format(d);
  }
  
  return todayStr.value;
});
/* ================================================================ */


// "Всего (на тек. момент)"
const loggedCurrentTotal = computed(() => {
  return mainStore.currentTotalBalance;
});

// "Всего (с уч. будущих)"
const loggedFutureTotal = computed(() => {
  return mainStore.futureTotalBalance;
});

// Helper для слияния
const mergeBalances = (currentBalances, futureBalances) => {
  if (!currentBalances || !futureBalances) {
    return currentBalances || []; 
  }
  const futureMap = new Map(futureBalances.map(item => [item._id, item.balance]));
  return currentBalances.map(item => ({
    ...item,
    futureBalance: futureMap.get(item._id) ?? item.balance
  }));
};

// "Мои счета"
const loggedAccountBalances = computed(() => {
  return mergeBalances(mainStore.currentAccountBalances, mainStore.futureAccountBalances);
});

const mergedCompanyBalances = computed(() => {
  return mergeBalances(mainStore.currentCompanyBalances, mainStore.futureCompanyBalances)
});
const mergedContractorBalances = computed(() => {
  return mergeBalances(mainStore.currentContractorBalances, mainStore.futureContractorBalances)
});
const mergedProjectBalances = computed(() => {
  return mergeBalances(mainStore.currentProjectBalances, mainStore.futureProjectBalances)
});


/* ======================= Попап «Добавить» ======================= */
const isEntityPopupVisible = ref(false);
const popupTitle = ref('');
const saveHandler = ref(null);

const openAddPopup = (title, storeAction) => {
  popupTitle.value = title;
  saveHandler.value = storeAction;
  isEntityPopupVisible.value = true;
};

const onEntitySave = async (name) => {
  if (saveHandler.value) {
    try {
      await saveHandler.value(name);
    } catch (e) {
      console.error(e);
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
  editorTitle.value = title;
  editorItems.value = JSON.parse(JSON.stringify(items));
  editorSavePath.value = path;
  isListEditorVisible.value = true;
};

const onEntityListSave = async (updatedItems) => {
  if (editorSavePath.value) {
    try {
      await mainStore.batchUpdateEntities(editorSavePath.value, updatedItems);
    } catch (e) {
      console.error(e);
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
.header-dashboard {
  display: flex;
  justify-content: space-between;
  background-color: var(--color-background-soft);
  padding: 1rem 1.5rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  margin-bottom: 0.4rem;
  gap: 1.5rem;
  
  height: 100%;
  box-sizing: border-box;
  min-height: 0; 
  width: 100%;
}

/* === 🟢 АДАПТАЦИЯ ДЛЯ ПЛАНШЕТА (и небольших экранов) === */
@media (max-height: 900px) {
  .header-dashboard {
    gap: 1rem;
    padding: 0.8rem 1rem;
  }
}
</style>
