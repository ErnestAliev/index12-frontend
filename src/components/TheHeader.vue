<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';

/**
 * * --- МЕТКА ВЕРСИИ: v2.7-CLEANUP-FOR-ERROR-FIX ---
 * * ВЕРСИЯ: 2.7 - Убраны логирующие computed и оптимизированы балансы.
 * * (Логирование теперь встроено в основной код, чтобы избежать лишних вызовов).
 * *
 * * ЧТО ИЗМЕНЕНО:
 * 1. (CLEANUP) Удалены "logged" computed (loggedCurrentTotal, loggedFutureTotal и т.д.).
 * Теперь используем прямые computed или встроенные логи.
 * 2. (CLEANUP) Убрана лишняя логика подсчета total в loggedAccountBalances.
 * 3. (FIX) Убедиться, что все карты используют реактивные геттеры mainStore.
 */

// --- !!! ВАША МЕТКА !!! ---
console.log('--- TheHeader.vue v2.7-CLEANUP-FOR-ERROR-FIX ЗАГРУЖЕН ---');


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

const todayStr = computed(() => ruShort.format(new Date()));
const futureUntilStr = computed(() => {
  const d = mainStore.projection?.rangeEndDate
    ? new Date(mainStore.projection.rangeEndDate)
    : null;
  // 🟢 LOGGING: (Имитируем ваш старый лог)
  if (d) {
    const balance = mainStore.futureTotalBalance;
    console.log(`[ЖУРНАЛ] TheHeader.vue: 📈 'Всего (с уч. будущих)' = ${balance} (до ${ruShort.format(d)})`);
  }
  
  return d ? ruShort.format(d) : todayStr.value;
});

// 🔴 НОВОЕ: Helper для слияния (Без изменений, он корректен)
const mergeBalances = (currentBalances, futureBalances) => {
  if (!currentBalances || !futureBalances) return currentBalances || [];

  const futureMap = new Map(futureBalances.map(item => [item._id, item.balance]));
  
  return currentBalances.map(item => ({
    ...item,
    futureBalance: futureMap.get(item._id) ?? item.balance
  }));
};

// 🟢 ИСПОЛЬЗУЕМ ПРЯМЫЕ COMPUTED ГЕТТЕРЫ ИЗ СТОРА, а не логирующие:

const mergedAccountBalances = computed(() => {
  // 🟢 LOGGING: (Имитируем ваш старый лог)
  const balances = mainStore.currentAccountBalances;
  const total = balances.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  console.log(`[ЖУРНАЛ] TheHeader.vue: 💳 'Мои счета' ОБНОВЛЕНЫ. Сумма: ${total} (${balances.length} счетов)`);
  
  return mergeBalances(balances, mainStore.futureAccountBalances);
});

const mergedCompanyBalances = computed(() => 
  mergeBalances(mainStore.currentCompanyBalances, mainStore.futureCompanyBalances)
);
const mergedContractorBalances = computed(() => 
  mergeBalances(mainStore.currentContractorBalances, mainStore.futureContractorBalances)
);
const mergedProjectBalances = computed(() => 
  mergeBalances(mainStore.currentProjectBalances, mainStore.futureProjectBalances)
);
// --- КОНЕЦ НОВОГО ---


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
  if (saveHandler.value) await saveHandler.value(name);
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
    await mainStore.batchUpdateEntities(editorSavePath.value, updatedItems);
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
        :totalBalance="mainStore.currentTotalBalance" // 🟢 Используем прямой геттер
        :subtitlePrefix="`Всего на ${mainStore.currentAccountBalances.length} счетах`"
        :subtitleDate="`до ${todayStr}`"
        :widgetKey="widgetKey"
        :widgetIndex="index"
      />

      <HeaderBalanceCard
        v-else-if="widgetKey === 'accounts'"
        title="Мои счета"
        :items="mergedAccountBalances" // 🟢 Используем объединенный computed
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
        :totalBalance="mainStore.futureTotalBalance" // 🟢 Используем прямой геттер
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
